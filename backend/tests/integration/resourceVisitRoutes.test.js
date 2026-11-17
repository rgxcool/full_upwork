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
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import ResourceVisit from "../../src/models/ResourceVisit.js";
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

describe("resourceVisitRoutes", () => {
    let studentCookie;
    let adminCookie;
    let teacherCookie;
    let studentId;
    let otherStudentId;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            ResourceVisit.deleteMany({}),
            Student.deleteMany({}),
            User.deleteMany({}),
        ]);

        const studentUser = await User.create({
            name: "Elev",
            email: "elev-visits@example.com",
            password: "testPassword123!",
            roles: ["student"],
        });
        const adminUser = await User.create({
            name: "Admin",
            email: "admin-visits@example.com",
            password: "testPassword123!",
            roles: ["admin"],
        });
        const teacherUser = await User.create({
            name: "Teacher",
            email: "teacher-visits@example.com",
            password: "testPassword123!",
            roles: ["teacher"],
        });

        const student = await Student.create({
            name: "Elev Ett",
            personalNumber: "19920101-1234",
            email: "elev-visits@example.com",
            municipality: { type: "Stockholm" },
        });
        const other = await Student.create({
            name: "Elev Två",
            personalNumber: "19920202-1234",
            email: "annan-visits@example.com",
            municipality: { type: "Göteborg" },
        });
        studentId = student._id.toString();
        otherStudentId = other._id.toString();

        studentCookie = `token=${makeToken(studentUser, "student")}`;
        adminCookie = `token=${makeToken(adminUser, "admin")}`;
        teacherCookie = `token=${makeToken(teacherUser, "teacher")}`;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("POST /api/resource-visits", () => {
        it("requires authentication", async () => {
            const response = await request(app)
                .post("/api/resource-visits")
                .send({ resourceType: "course_card" });
            expect(response.status).toBe(401);
        });

        it("rejects an invalid resourceType", async () => {
            const response = await request(app)
                .post("/api/resource-visits")
                .set("Cookie", studentCookie)
                .send({ resourceType: "bogus" });
            expect(response.status).toBe(400);
        });

        it("lets a student record a visit for themselves and dedupes per day", async () => {
            const payload = {
                resourceType: "course_card",
                resourceId: "course-cards",
                resourceName: "Mina kurser",
            };
            const first = await request(app)
                .post("/api/resource-visits")
                .set("Cookie", studentCookie)
                .send(payload);
            expect(first.status).toBe(201);
            expect(first.body.visit.studentId).toBe(studentId);

            const second = await request(app)
                .post("/api/resource-visits")
                .set("Cookie", studentCookie)
                .send(payload);
            expect(second.status).toBe(201);
            expect(String(second.body.visit._id)).toBe(String(first.body.visit._id));

            expect(await ResourceVisit.countDocuments({})).toBe(1);
        });

        it("forbids a student from recording a visit for another student", async () => {
            const response = await request(app)
                .post("/api/resource-visits")
                .set("Cookie", studentCookie)
                .send({ studentId: otherStudentId, resourceType: "lesson" });
            expect(response.status).toBe(403);
        });

        it("lets staff record a visit for a specific student", async () => {
            const response = await request(app)
                .post("/api/resource-visits")
                .set("Cookie", teacherCookie)
                .send({
                    studentId: otherStudentId,
                    resourceType: "document",
                    resourceId: "doc-1",
                });
            expect(response.status).toBe(201);
            expect(response.body.visit.studentId).toBe(otherStudentId);
        });
    });

    describe("GET /api/resource-visits/report", () => {
        beforeEach(async () => {
            await ResourceVisit.create([
                {
                    idempotencyKey: `2026-11-17:${studentId}:course_card:course-cards`,
                    studentId,
                    studentName: "Elev Ett",
                    resourceType: "course_card",
                    resourceId: "course-cards",
                    resourceName: "Mina kurser",
                    visitedAt: new Date("2026-11-17T10:00:00.000Z"),
                    municipality: "Stockholm",
                },
                {
                    idempotencyKey: `2026-11-17:${studentId}:lesson:inst-1`,
                    studentId,
                    studentName: "Elev Ett",
                    resourceType: "lesson",
                    resourceId: "inst-1",
                    resourceName: "Matematik",
                    visitedAt: new Date("2026-11-17T12:00:00.000Z"),
                    municipality: "Stockholm",
                },
                {
                    idempotencyKey: `2026-11-17:${otherStudentId}:lesson:inst-2`,
                    studentId: otherStudentId,
                    studentName: "Elev Två",
                    resourceType: "lesson",
                    resourceId: "inst-2",
                    resourceName: "Fysik",
                    visitedAt: new Date("2026-11-17T13:00:00.000Z"),
                    municipality: "Göteborg",
                },
            ]);
        });

        it("forbids students", async () => {
            const response = await request(app)
                .get("/api/resource-visits/report")
                .set("Cookie", studentCookie);
            expect(response.status).toBe(403);
        });

        it("returns all visits for a global admin with summary data", async () => {
            const response = await request(app)
                .get("/api/resource-visits/report")
                .set("Cookie", adminCookie);
            expect(response.status).toBe(200);
            expect(response.body.total).toBe(3);
            expect(response.body.summary.uniqueStudents).toBe(2);
            expect(response.body.summary.byResource["Mina kurser"]).toBe(1);
            expect(response.body.visits).toHaveLength(3);
        });

        it("filters by resourceType and respects pagination", async () => {
            const response = await request(app)
                .get("/api/resource-visits/report")
                .query({ resourceType: "lesson", page: 2, limit: 1 })
                .set("Cookie", adminCookie);
            expect(response.status).toBe(200);
            expect(response.body.total).toBe(2);
            expect(response.body.page).toBe(2);
            expect(response.body.limit).toBe(1);
            expect(response.body.visits).toHaveLength(1);
            expect(response.body.visits[0].resourceType).toBe("lesson");
        });

        it("scopes the report to the caller's municipalities", async () => {
            const admin = await User.findOne({ email: "admin-visits@example.com" });
            admin.municipalities = ["Stockholm"];
            await admin.save();

            const response = await request(app)
                .get("/api/resource-visits/report")
                .set("Cookie", adminCookie);
            expect(response.status).toBe(200);
            expect(response.body.total).toBe(2);
            expect(
                response.body.visits.every((v) => v.municipality === "Stockholm")
            ).toBe(true);
        });
    });

    describe("GET /api/resource-visits/mine", () => {
        it("returns only the caller's own visits", async () => {
            await ResourceVisit.create({
                idempotencyKey: `2026-11-17:${studentId}:lesson:inst-1`,
                studentId,
                studentName: "Elev Ett",
                resourceType: "lesson",
                resourceId: "inst-1",
                visitedAt: new Date("2026-11-17T10:00:00.000Z"),
            });
            await ResourceVisit.create({
                idempotencyKey: `2026-11-17:${otherStudentId}:lesson:inst-2`,
                studentId: otherStudentId,
                studentName: "Elev Två",
                resourceType: "lesson",
                resourceId: "inst-2",
                visitedAt: new Date("2026-11-17T11:00:00.000Z"),
            });

            const response = await request(app)
                .get("/api/resource-visits/mine")
                .set("Cookie", studentCookie);
            expect(response.status).toBe(200);
            expect(response.body.total).toBe(1);
            expect(String(response.body.visits[0].studentId)).toBe(studentId);
        });
    });
});
