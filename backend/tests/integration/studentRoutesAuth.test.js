import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import express from "express";
import Program from "../../src/models/Program.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import Student from "../../src/models/Student.js";
import studentRoutes from "../../src/router/studentRoutes.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let app;
let staffApp;

const mockAuthenticateUser = vi.hoisted(() => (req, _res, next) => {
    const roleHeader = req.headers["x-test-role"];
    const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;

    if (!role) {
        return _res.status(401).json({ error: "Ingen giltig token angiven." });
    }

    req.user = {
        role,
        roles: [role],
        userId: "test-user",
    };
    req.userId = req.user.userId;

    const muniHeader = req.headers["x-test-municipalities"];
    if (muniHeader) {
        const munis = Array.isArray(muniHeader) ? muniHeader : [muniHeader];
        req.user.municipalities = munis;
    }

    next();
});

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));

vi.mock("../../src/controllers/notificationController.js", () => ({
    sendDropoutNotification: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("Student Routes Auth Enforcement", () => {
    beforeAll(async () => {
        await connectTestDatabase();

        app = express();
        app.use(express.json());
        app.use("/api", studentRoutes);

        staffApp = express();
        staffApp.use(express.json());
        staffApp.use("/api", studentRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Program.deleteMany({}),
            CoursePackage.deleteMany({}),
            Course.deleteMany({}),
            Student.deleteMany({}),
        ]);
    });

    describe("GET /api/all-programs", () => {
        it("returns 401 without auth token", async () => {
            await request(app).get("/api/all-programs").expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .get("/api/all-programs")
                .set("x-test-role", "student")
                .expect(403);
        });

        it("returns 200 for admin role", async () => {
            await Program.create({ programName: "Test Program" });

            const res = await request(app)
                .get("/api/all-programs")
                .set("x-test-role", "admin")
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].programName).toBe("Test Program");
        });

        it("returns 200 for teacher role", async () => {
            await Program.create({ programName: "Teacher Program" });

            const res = await request(app)
                .get("/api/all-programs")
                .set("x-test-role", "teacher")
                .expect(200);

            expect(res.body).toHaveLength(1);
        });
    });

    describe("GET /api/all-course-packages", () => {
        it("returns 401 without auth token", async () => {
            await request(app).get("/api/all-course-packages").expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .get("/api/all-course-packages")
                .set("x-test-role", "student")
                .expect(403);
        });

        it("returns 200 for admin role", async () => {
            await CoursePackage.create({
                coursePackageName: "Test Package",
                coursePackageCode: "TP01",
                coursePackagePoints: "10",
                coursePackageExtent: "1",
            });

            const res = await request(app)
                .get("/api/all-course-packages")
                .set("x-test-role", "admin")
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].coursePackageName).toBe("Test Package");
        });
    });

    describe("GET /api/all-courses", () => {
        it("returns 401 without auth token", async () => {
            await request(app).get("/api/all-courses").expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .get("/api/all-courses")
                .set("x-test-role", "student")
                .expect(403);
        });

        it("returns 200 for admin role", async () => {
            await Course.create({ courseName: "Test Course", courseCode: "TC01" });

            const res = await request(app)
                .get("/api/all-courses")
                .set("x-test-role", "admin")
                .expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].courseName).toBe("Test Course");
        });
    });

    describe("POST /api/student", () => {
        it("returns 401 without auth token", async () => {
            await request(app)
                .post("/api/student")
                .send({ name: "Test", email: "test@test.com", personalNumber: "12345678901" })
                .expect(401);
        });

        it("returns 403 for student role", async () => {
            await request(app)
                .post("/api/student")
                .set("x-test-role", "student")
                .send({ name: "Test", email: "test@test.com", personalNumber: "12345678901" })
                .expect(403);
        });
    });

    describe("PUT /api/student/:id", () => {
        it("returns 401 without auth token", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app)
                .put(`/api/student/${id}`)
                .send({ name: "Updated" })
                .expect(401);
        });

        it("returns 403 for student role", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app)
                .put(`/api/student/${id}`)
                .set("x-test-role", "student")
                .send({ name: "Updated" })
                .expect(403);
        });
    });

    describe("DELETE /api/student/:id", () => {
        it("returns 401 without auth token", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app).delete(`/api/student/${id}`).expect(401);
        });

        it("returns 403 for student role", async () => {
            const id = new mongoose.Types.ObjectId();
            await request(app)
                .delete(`/api/student/${id}`)
                .set("x-test-role", "student")
                .expect(403);
        });
    });

    describe("Tenant (kommun) isolation on GET /api/students", () => {
        it("returns only students within the caller's municipality scope", async () => {
            await Student.create({
                name: "Sollentuna Student",
                email: "sollentuna@example.com",
                personalNumber: "11111111111",
                municipality: { type: "Sollentuna" },
            });
            await Student.create({
                name: "Stockholm Student",
                email: "stockholm@example.com",
                personalNumber: "22222222222",
                municipality: { type: "Stockholm" },
            });

            const res = await request(staffApp)
                .get("/api/students")
                .set("x-test-role", "admin")
                .set("x-test-municipalities", "Sollentuna")
                .expect(200);

            const names = res.body.map((s) => s.name);
            expect(names).toContain("Sollentuna Student");
            expect(names).not.toContain("Stockholm Student");
        });

        it("returns all students for a global (unscoped) admin", async () => {
            await Student.create({
                name: "Global A",
                email: "globala@example.com",
                personalNumber: "33333333333",
                municipality: { type: "Täby" },
            });
            await Student.create({
                name: "Global B",
                email: "globalb@example.com",
                personalNumber: "44444444444",
                municipality: { type: "Solna" },
            });

            const res = await request(staffApp)
                .get("/api/students")
                .set("x-test-role", "admin")
                .expect(200);

            const names = res.body.map((s) => s.name);
            expect(names).toContain("Global A");
            expect(names).toContain("Global B");
        });
    });

    describe("Tenant write-guard on POST /api/student", () => {
        it("forbids a scoped admin from creating a student outside their scope", async () => {
            await request(staffApp)
                .post("/api/student")
                .set("x-test-role", "admin")
                .set("x-test-municipalities", "Sollentuna")
                .send({
                    name: "Out of scope",
                    email: "out@example.com",
                    personalNumber: "55555555555",
                    municipality: "Stockholm",
                })
                .expect(403);
        });

        it("allows a scoped admin to create a student within their scope", async () => {
            const res = await request(staffApp)
                .post("/api/student")
                .set("x-test-role", "admin")
                .set("x-test-municipalities", "Sollentuna")
                .send({
                    name: "In scope",
                    email: "inscope@example.com",
                    personalNumber: "66666666666",
                    municipality: "Sollentuna",
                })
                .expect(201);

            expect(res.body).toBeTruthy();
        });
    });
});
