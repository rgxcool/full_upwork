/**
 * Kurskort access control (#28, #29).
 *
 * Mounts the real courseMatchingRoutes against mongodb-memory-server; only the
 * JWT middleware (an external boundary) is replaced so tests can choose the
 * caller. All data is created through the Mongoose models.
 *
 * Fails on the old code:
 *  - any student could read content/feed of a card they are not enrolled in
 *  - any teacher could read any card's feed
 *  - the responsible teacher got 403 when posting (Teacher id vs User id)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import express from "express";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import courseMatchingRoutes from "../../src/router/courseMatchingRoutes.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const SECRET = "test-secret";

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: (req, res, next) => {
        const header = req.headers.authorization || "";
        if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
        const decoded = jwt.verify(header.slice(7), "test-secret");
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.roles[0],
            roles: decoded.roles,
            permissions: {},
        };
        next();
    },
}));

const auth = (user) => ({
    Authorization: `Bearer ${jwt.sign(
        { userId: String(user._id), email: user.email, roles: user.roles },
        SECRET
    )}`,
});

describe("Kurskort access control (content + activity feed)", () => {
    let app;
    let users;
    let instance;
    let otherInstance;

    const makeUser = (name, email, roles) =>
        User.create({ name, email, password: "x".repeat(12), roles });

    const makeStudent = async (name, email) => {
        const user = await makeUser(name, email, ["student"]);
        const student = await Student.create({
            name,
            email,
            personalNumber: `19000101-000${Math.floor(Math.random() * 9)}`,
            municipality: { type: "Sollentuna" },
        });
        return { user, student };
    };

    const enroll = (student, inst, status = "active") =>
        StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: inst._id,
            courseName: inst.courseName,
            mainCourseId: inst.mainCourseId,
            municipalityName: "Sollentuna",
            startDate: inst.startDate,
            endDate: inst.endDate,
            status,
        });

    beforeAll(async () => {
        await connectTestDatabase();
        app = express();
        app.use(express.json());
        app.use("/api", courseMatchingRoutes);
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        await Promise.all([
            User.deleteMany({}),
            Teacher.deleteMany({}),
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);

        const admin = await makeUser("Test Admin", "admin@test.invalid", ["admin"]);
        const respUser = await makeUser("Test Ansvarig", "ansvarig@test.invalid", ["teacher"]);
        const assistUser = await makeUser("Test Assistent", "assistent@test.invalid", ["teacher"]);
        const otherTeacherUser = await makeUser("Test Annan", "annan@test.invalid", ["teacher"]);
        const coordinator = await makeUser("Test Koordinator", "koord@test.invalid", ["coordinator"]);
        const resp = await Teacher.create({ userId: respUser._id, subject: "Svenska" });
        const assist = await Teacher.create({ userId: assistUser._id, subject: "Svenska" });
        await Teacher.create({ userId: otherTeacherUser._id, subject: "Matte" });

        const course = await Course.create({ courseName: "Svenska 1", courseCode: "SVESVE01" });
        const base = {
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: course.courseCode,
            startDate: new Date("2026-01-05"),
            endDate: new Date("2026-02-09"),
            modules: [{ moduleNumber: 1, title: "Modul 1" }],
        };
        instance = await CourseInstance.create({
            ...base,
            responsibleTeacher: resp._id,
            assistantTeacher: assist._id,
            content: { 1: { title: "Modul 1", instructions: "Läs kapitel 1" } },
            activityFeed: [{ id: new mongoose.Types.ObjectId(), text: "Välkommen!", at: new Date() }],
        });
        otherInstance = await CourseInstance.create({
            ...base,
            startDate: new Date("2026-03-02"),
            endDate: new Date("2026-04-06"),
            responsibleTeacher: assist._id,
        });

        const enrolled = await makeStudent("Test Elev", "elev@test.invalid");
        const outsider = await makeStudent("Test Utomstående", "utom@test.invalid");
        const dropped = await makeStudent("Test Avbrott", "avbrott@test.invalid");
        const completed = await makeStudent("Test Klar", "klar@test.invalid");
        await enroll(enrolled.student, instance, "active");
        await enroll(outsider.student, otherInstance, "active");
        await enroll(dropped.student, instance, "dropped");
        await enroll(completed.student, instance, "completed");

        users = {
            admin,
            resp: respUser,
            assist: assistUser,
            otherTeacher: otherTeacherUser,
            coordinator,
            enrolled: enrolled.user,
            outsider: outsider.user,
            dropped: dropped.user,
            completed: completed.user,
        };
    });

    const contentUrl = () => `/api/course-instances/${instance._id}/content`;
    const feedUrl = () => `/api/course-instances/${instance._id}/activity-feed`;

    describe("GET content", () => {
        it.each([
            ["admin", 200, true],
            ["resp", 200, true],
            ["assist", 200, false],
            ["enrolled", 200, false],
            ["completed", 200, false],
        ])("%s → %i (canEdit=%s)", async (who, status, canEdit) => {
            const res = await request(app).get(contentUrl()).set(auth(users[who]));
            expect(res.status).toBe(status);
            expect(res.body.canEdit).toBe(canEdit);
            expect(res.body.content["1"].instructions).toBe("Läs kapitel 1");
        });

        it.each(["outsider", "dropped", "otherTeacher", "coordinator"])(
            "%s → 403 and no content",
            async (who) => {
                const res = await request(app).get(contentUrl()).set(auth(users[who]));
                expect(res.status).toBe(403);
                expect(res.body.content).toBeUndefined();
            }
        );

        it("rejects a malformed id with 400 instead of a 500", async () => {
            const res = await request(app)
                .get("/api/course-instances/not-an-id/content")
                .set(auth(users.admin));
            expect(res.status).toBe(400);
        });
    });

    describe("PUT content", () => {
        it.each(["assist", "otherTeacher"])("%s cannot edit → 403", async (who) => {
            const res = await request(app)
                .put(contentUrl())
                .set(auth(users[who]))
                .send({ content: { 1: { title: "Ändrad" } } });
            expect(res.status).toBe(403);
        });
    });

    describe("GET activity feed", () => {
        it.each(["admin", "resp", "assist", "enrolled", "completed"])("%s → 200", async (who) => {
            const res = await request(app).get(feedUrl()).set(auth(users[who]));
            expect(res.status).toBe(200);
            expect(res.body.activityFeed[0].text).toBe("Välkommen!");
        });

        it.each(["outsider", "dropped", "otherTeacher", "coordinator"])("%s → 403", async (who) => {
            const res = await request(app).get(feedUrl()).set(auth(users[who]));
            expect(res.status).toBe(403);
            expect(res.body.activityFeed).toBeUndefined();
        });
    });

    describe("PUT activity feed (anslagstavla post)", () => {
        it.each(["resp", "assist", "admin"])("%s can post → 200", async (who) => {
            const res = await request(app)
                .put(feedUrl())
                .set(auth(users[who]))
                .send({ text: `Hej från ${who}` });
            expect(res.status).toBe(200);
            const saved = await CourseInstance.findById(instance._id).lean();
            expect(saved.activityFeed.map((i) => i.text)).toContain(`Hej från ${who}`);
        });

        it.each(["otherTeacher", "enrolled"])("%s cannot post → 403", async (who) => {
            const res = await request(app)
                .put(feedUrl())
                .set(auth(users[who]))
                .send({ text: "Ska inte synas" });
            expect(res.status).toBe(403);
            const saved = await CourseInstance.findById(instance._id).lean();
            expect(saved.activityFeed).toHaveLength(1);
        });
    });

    // #30: saving from CourseCardBuilder (modules[] + syncModules) must not
    // wipe the Datumplanering dates applied at creation.
    describe("PUT content keeps per-module dates (#30)", () => {
        const start1 = new Date("2026-01-05T00:00:00.000Z");
        const end1 = new Date("2026-01-12T00:00:00.000Z");
        const start2 = new Date("2026-01-12T00:00:00.000Z");
        const end2 = new Date("2026-01-19T00:00:00.000Z");

        beforeEach(async () => {
            await CourseInstance.updateOne(
                { _id: instance._id },
                {
                    $set: {
                        modules: [
                            { moduleNumber: 1, title: "Modul 1", startDate: start1, endDate: end1 },
                            { moduleNumber: 2, title: "Modul 2", startDate: start2, endDate: end2 },
                        ],
                    },
                }
            );
        });

        // Same shape the builder sends: no dates on the modules.
        const builderPayload = (modules) => ({
            content: { 1: { title: "Modul 1" } },
            modules,
            syncModules: true,
        });

        it("keeps saved dates when the builder saves without dates", async () => {
            const res = await request(app)
                .put(contentUrl())
                .set(auth(users.resp))
                .send(
                    builderPayload([
                        { moduleNumber: 1, title: "Modul 1 (ny titel)", sections: [] },
                        { moduleNumber: 2, title: "Modul 2", sections: [] },
                    ])
                );
            expect(res.status).toBe(200);

            const saved = await CourseInstance.findById(instance._id).lean();
            const byNum = Object.fromEntries(saved.modules.map((m) => [m.moduleNumber, m]));
            expect(byNum[1].title).toBe("Modul 1 (ny titel)");
            expect(byNum[1].startDate.toISOString()).toBe(start1.toISOString());
            expect(byNum[1].endDate.toISOString()).toBe(end1.toISOString());
            expect(byNum[2].startDate.toISOString()).toBe(start2.toISOString());
            expect(byNum[2].endDate.toISOString()).toBe(end2.toISOString());
        });

        it("matches dates by moduleNumber when modules are reordered, and leaves new modules unscheduled", async () => {
            const res = await request(app)
                .put(contentUrl())
                .set(auth(users.admin))
                .send(
                    builderPayload([
                        { moduleNumber: 2, title: "Modul 2" },
                        { moduleNumber: 1, title: "Modul 1" },
                        { moduleNumber: 3, title: "Ny modul" },
                    ])
                );
            expect(res.status).toBe(200);

            const saved = await CourseInstance.findById(instance._id).lean();
            const byNum = Object.fromEntries(saved.modules.map((m) => [m.moduleNumber, m]));
            expect(byNum[1].startDate.toISOString()).toBe(start1.toISOString());
            expect(byNum[2].startDate.toISOString()).toBe(start2.toISOString());
            expect(byNum[3].startDate).toBeUndefined();
            expect(byNum[3].endDate).toBeUndefined();
        });

        it("uses an explicit valid date from the payload", async () => {
            const moved = "2026-02-02T00:00:00.000Z";
            await request(app)
                .put(contentUrl())
                .set(auth(users.resp))
                .send(builderPayload([{ moduleNumber: 1, title: "Modul 1", startDate: moved }]))
                .expect(200);

            const saved = await CourseInstance.findById(instance._id).lean();
            expect(saved.modules[0].startDate.toISOString()).toBe(moved);
            expect(saved.modules[0].endDate.toISOString()).toBe(end1.toISOString());
        });
    });
    describe("DELETE /course-instances/:id (single kurskort)", () => {
        const del = (id, who) =>
            request(app).delete(`/api/course-instances/${id}`).set(auth(users[who]));

        it("refuses with 409 while students are linked, and keeps everything", async () => {
            const res = await del(instance._id, "admin");
            expect(res.status).toBe(409);
            expect(res.body.enrollmentCount).toBe(3);
            expect(res.body.error).toContain("3 kopplade elever");
            expect(await CourseInstance.exists({ _id: instance._id })).toBeTruthy();
            expect(await StudentEnrollment.countDocuments({ courseInstanceId: instance._id })).toBe(3);
        });

        it("deletes an empty card and its discussions", async () => {
            const empty = await CourseInstance.create({
                mainCourseId: instance.mainCourseId,
                courseName: "Tomt kurskort",
                courseCode: "SVESVE01",
                startDate: new Date("2026-05-04"),
                endDate: new Date("2026-06-08"),
            });
            await mongoose.model("CourseCardDiscussion").create({
                courseInstanceId: empty._id,
                moduleNumber: 1,
                title: "Testtråd",
                promptText: "Diskutera modul 1",
                createdBy: users.admin._id,
            });
            expect(
                await mongoose.model("CourseCardDiscussion").countDocuments({ courseInstanceId: empty._id })
            ).toBe(1);

            const res = await del(empty._id, "admin");
            expect(res.status).toBe(200);
            expect(res.body.deletedId).toBe(String(empty._id));
            expect(await CourseInstance.exists({ _id: empty._id })).toBeNull();
            expect(
                await mongoose.model("CourseCardDiscussion").countDocuments({ courseInstanceId: empty._id })
            ).toBe(0);
        });

        it.each(["resp", "enrolled"])("%s cannot delete → 403", async (who) => {
            const res = await del(instance._id, who);
            expect(res.status).toBe(403);
            expect(await CourseInstance.exists({ _id: instance._id })).toBeTruthy();
        });

        it("returns 404 for an unknown id and 400 for a malformed one", async () => {
            expect((await del(new mongoose.Types.ObjectId(), "admin")).status).toBe(404);
            expect((await del("not-an-id", "admin")).status).toBe(400);
        });
    });
});
