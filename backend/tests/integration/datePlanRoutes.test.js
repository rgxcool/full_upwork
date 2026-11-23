import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import TeacherScheduleParameters from "../../src/models/TeacherScheduleParameters.js";
import { giveTeacherProfile } from "../helpers/teacherFixture.js";
import { buildDefaultModules } from "../../src/models/courseModuleSchema.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const makeToken = (user, role) =>
    jwt.sign(
        {
            userId: user._id.toString(),
            role,
            roles: [role],
            name: user.name,
            email: user.email,
        },
        process.env.JWT_SECRET || "test-secret"
    );

describe("datePlanRoutes", () => {
    let adminCookie;
    let teacherCookie;
    let teacherId;
    let mainCourseId;
    let instanceId;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            CourseInstance.deleteMany({}),
            TeacherScheduleParameters.deleteMany({}),
            User.deleteMany({}),
        ]);

        const admin = await User.create({
            name: "Admin",
            email: "admin-dateplan@example.com",
            password: "testPassword123!",
            roles: ["admin"],
        });
        const teacherUser = await User.create({
            name: "Teacher",
            email: "teacher-dateplan@example.com",
            password: "testPassword123!",
            roles: ["teacher"],
        });
        // #102: the teacher id is the User id; Teacher model was removed.
        await giveTeacherProfile(teacherUser, { subject: "Matematik" });
        teacherId = teacherUser._id;
        mainCourseId = new mongoose.Types.ObjectId();

        adminCookie = `token=${makeToken(admin, "admin")}`;
        teacherCookie = `token=${makeToken(teacherUser, "teacher")}`;

        const instance = await CourseInstance.create({
            mainCourseId,
            startDate: new Date("2026-11-16T00:00:00.000Z"),
            endDate: new Date("2026-12-18T00:00:00.000Z"),
            courseName: "Matematik 1",
            courseCode: "MAT1",
            responsibleTeacher: teacherId,
            modules: buildDefaultModules(),
        });
        instanceId = instance._id.toString();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const addAvsnittToFirstModules = async () => {
        const instance = await CourseInstance.findById(instanceId);
        instance.modules[0].avsnitt = [
            { avsnittId: "m1-a1", title: "Avsnitt 1", order: 1, contentItems: [] },
            { avsnittId: "m1-a2", title: "Avsnitt 2", order: 2, contentItems: [] },
        ];
        instance.modules[1].avsnitt = [
            { avsnittId: "m2-a1", title: "Avsnitt 1", order: 1, contentItems: [] },
        ];
        await instance.save();
    };

    describe("permissions", () => {
        it("rejects unauthenticated previews and teacher applies", async () => {
            const anonymous = await request(app)
                .post("/api/date-plan/preview")
                .send({ instanceId, lengthWeeks: 5 });
            expect(anonymous.status).toBe(401);

            const forbidden = await request(app)
                .put("/api/date-plan/apply")
                .set("Cookie", teacherCookie)
                .send({ instanceId, lengthWeeks: 5 });
            expect(forbidden.status).toBe(403);
        });
    });

    describe("POST /date-plan/preview", () => {
        it("previews a 10-week plan without writing it", async () => {
            const response = await request(app)
                .post("/api/date-plan/preview")
                .set("Cookie", adminCookie)
                .send({ instanceId, lengthWeeks: 10 });

            expect(response.status).toBe(200);
            expect(response.body.datePlan.lengthWeeks).toBe(10);
            expect(response.body.datePlan.sectionDates).toEqual([
                "2026-11-16",
                "2026-11-30",
                "2026-12-14",
                "2026-12-28",
                "2027-01-11",
            ]);
            expect(response.body.datePlan.moduleDates).toHaveLength(5);
            expect(response.body.datePlan.source).toBe("default");

            const stored = await CourseInstance.findById(instanceId);
            expect(stored.datePlan).toBeNull();
            expect(stored.sectionDates).toHaveLength(0);
        });

        it("uses the teacher's saved offsets when available", async () => {
            await TeacherScheduleParameters.create({
                teacherId,
                courseId: String(mainCourseId),
                lengthWeeks: 10,
                sectionOffsets: [0, 1, 2, 3, 4],
            });

            const response = await request(app)
                .post("/api/date-plan/preview")
                .set("Cookie", adminCookie)
                .send({ instanceId, lengthWeeks: 10 });

            expect(response.status).toBe(200);
            expect(response.body.datePlan.source).toBe("saved");
            expect(response.body.datePlan.sectionDates).toEqual([
                "2026-11-16",
                "2026-11-23",
                "2026-11-30",
                "2026-12-07",
                "2026-12-14",
            ]);
        });

        it("infers the length and keeps the existing end date when none is given", async () => {
            const response = await request(app)
                .post("/api/date-plan/preview")
                .set("Cookie", teacherCookie)
                .send({ instanceId });

            expect(response.status).toBe(200);
            expect(response.body.datePlan.lengthWeeks).toBe(5);
            expect(response.body.datePlan.endDate).toBe("2026-12-18");
            expect(response.body.datePlan.sectionDates).toEqual([
                "2026-11-16",
                "2026-11-23",
                "2026-11-30",
                "2026-12-07",
                "2026-12-14",
            ]);
        });

        it("includes generated Avsnitt dates in the preview payload", async () => {
            await addAvsnittToFirstModules();

            const response = await request(app)
                .post("/api/date-plan/preview")
                .set("Cookie", adminCookie)
                .send({ instanceId, lengthWeeks: 10 });

            expect(response.status).toBe(200);
            expect(response.body.datePlan.avsnittDates).toHaveLength(5);
            expect(response.body.datePlan.avsnittDates.slice(0, 2)).toEqual([
                ["2026-11-16", "2026-11-23"],
                ["2026-11-30"],
            ]);
            expect(response.body.datePlan.avsnittDates.slice(2)).toEqual([[], [], []]);
        });

        it("rejects invalid input and unknown instances", async () => {
            const badLength = await request(app)
                .post("/api/date-plan/preview")
                .set("Cookie", adminCookie)
                .send({ instanceId, lengthWeeks: 7 });
            expect(badLength.status).toBe(400);

            const missingId = await request(app)
                .post("/api/date-plan/preview")
                .set("Cookie", adminCookie)
                .send({ lengthWeeks: 5 });
            expect(missingId.status).toBe(400);

            const unknown = await request(app)
                .post("/api/date-plan/preview")
                .set("Cookie", adminCookie)
                .send({
                    instanceId: new mongoose.Types.ObjectId().toString(),
                    lengthWeeks: 5,
                });
            expect(unknown.status).toBe(404);
        });
    });

    describe("PUT /date-plan/apply", () => {
        it("persists a 20-week plan on the instance", async () => {
            const response = await request(app)
                .put("/api/date-plan/apply")
                .set("Cookie", adminCookie)
                .send({ instanceId, lengthWeeks: 20 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);

            const stored = await CourseInstance.findById(instanceId);
            expect(stored.datePlan.lengthWeeks).toBe(20);
            expect(stored.datePlan.sectionDates.map((d) => d.toISOString().slice(0, 10))).toEqual([
                "2026-11-16",
                "2026-12-14",
                "2027-01-11",
                "2027-02-08",
                "2027-03-08",
            ]);
            expect(stored.sectionDates).toHaveLength(5);
            expect(stored.modules[0].startDate.toISOString().slice(0, 10)).toBe(
                "2026-11-16"
            );
            expect(stored.endDate.toISOString().slice(0, 10)).toBe("2027-04-05");
        });

        it("persists generated plannedDate on each Avsnitt", async () => {
            await addAvsnittToFirstModules();

            const response = await request(app)
                .put("/api/date-plan/apply")
                .set("Cookie", adminCookie)
                .send({ instanceId, lengthWeeks: 10 });

            expect(response.status).toBe(200);
            expect(response.body.datePlan.avsnittDates.slice(0, 2)).toEqual([
                ["2026-11-16", "2026-11-23"],
                ["2026-11-30"],
            ]);

            const stored = await CourseInstance.findById(instanceId);
            expect(stored.modules[0].avsnitt.map((av) =>
                av.plannedDate.toISOString().slice(0, 10)
            )).toEqual(["2026-11-16", "2026-11-23"]);
            expect(stored.modules[1].avsnitt[0].plannedDate.toISOString().slice(0, 10)).toBe(
                "2026-11-30"
            );
            expect(stored.datePlan.avsnittDates.map((dates) =>
                dates.map((d) => d.toISOString().slice(0, 10))
            ).slice(0, 2)).toEqual([
                ["2026-11-16", "2026-11-23"],
                ["2026-11-30"],
            ]);
        });

        it("rejects invalid offsets", async () => {
            const response = await request(app)
                .put("/api/date-plan/apply")
                .set("Cookie", adminCookie)
                .send({ instanceId, lengthWeeks: 5, sectionOffsets: [0, 1] });

            expect(response.status).toBe(400);
            const stored = await CourseInstance.findById(instanceId);
            expect(stored.datePlan).toBeNull();
        });
    });
});
