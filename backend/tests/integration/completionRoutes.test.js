import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
} from "vitest";
import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import completionRoutes from "../../src/router/completionRoutes.js";
import CompletionEvent from "../../src/models/CompletionEvent.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import Teacher from "../../src/models/Teacher.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api", completionRoutes);
    return app;
};

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        name: "Test Admin",
        email: "admin@example.com",
        ...overrides,
    };
    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

describe("Completion Routes", () => {
    let admin;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await CompletionEvent.deleteMany({});
        await User.deleteMany({});
        admin = await User.create({
            username: "admin-overview",
            email: "admin-overview@example.com",
            password: "test-secret-hash",
            role: "admin",
            roles: ["admin"],
            municipalities: ["Malmö"],
        });
    });

    afterEach(async () => {
        await CompletionEvent.deleteMany({});
        await User.deleteMany({});
    });

    const auth = () => {
        const userId = admin._id.toString();
        return `Bearer ${jwt.sign(
            { userId, role: "admin", name: "Test Admin", email: "admin@example.com" },
            process.env.JWT_SECRET || "test-secret"
        )}`;
    };

    describe("GET /api/completions/overview", () => {
        it("requires an admin and returns empty when no completions exist", async () => {
            const res = await request(buildApp())
                .get("/api/completions/overview")
                .set("Authorization", auth());
            expect(res.status).toBe(200);
            expect(res.body.events).toEqual([]);
            expect(res.body.total).toBe(0);
            expect(res.body.totalPages).toBe(1);
        });

        it("returns completion events newest first", async () => {
            const older = await CompletionEvent.create({
                idempotencyKey: `course:${admin._id}:x`,
                studentId: new mongoose.Types.ObjectId(),
                studentName: "Ebba Lindgren",
                completionType: "course",
                courseName: "Matematik 2",
                courseInstanceId: new mongoose.Types.ObjectId(),
                courseId: new mongoose.Types.ObjectId(),
                completionDate: new Date(Date.now() - 2 * 86400000),
            });
            const newer = await CompletionEvent.create({
                idempotencyKey: `package:${admin._id}:y`,
                studentId: new mongoose.Types.ObjectId(),
                studentName: "Ebba Lindgren",
                completionType: "course_package",
                packageName: "Teknikpaketet",
                coursePackageId: new mongoose.Types.ObjectId(),
                completionDate: new Date(Date.now() - 1 * 86400000),
            });

            const res = await request(buildApp())
                .get("/api/completions/overview")
                .set("Authorization", auth());

            expect(res.status).toBe(200);
            expect(res.body.total).toBe(2);
            expect(res.body.events[0]._id).toBe(newer._id.toString());
            expect(res.body.events[1]._id).toBe(older._id.toString());
            expect(res.body.events[0].packageName).toBe("Teknikpaketet");
            expect(res.body.events[1].courseName).toBe("Matematik 2");
            expect(res.body.events[1].studentName).toBe("Ebba Lindgren");
        });

        it("filters by completionType", async () => {
            await CompletionEvent.create({
                idempotencyKey: `course:${admin._id}:x`,
                studentId: new mongoose.Types.ObjectId(),
                completionType: "course",
                courseName: "Matematik 2",
                completionDate: new Date(),
            });
            await CompletionEvent.create({
                idempotencyKey: `package:${admin._id}:y`,
                studentId: new mongoose.Types.ObjectId(),
                completionType: "course_package",
                packageName: "Teknikpaketet",
                completionDate: new Date(),
            });

            const res = await request(buildApp())
                .get("/api/completions/overview?completionType=course")
                .set("Authorization", auth());

            expect(res.status).toBe(200);
            expect(res.body.total).toBe(1);
            expect(res.body.events[0].courseName).toBe("Matematik 2");
        });

        it("denies non-admins", async () => {
            const teacher = await User.create({
                username: "teacher-overview",
                email: "teacher-overview@example.com",
                password: "test-secret-hash",
                role: "teacher",
                roles: ["teacher"],
                municipalities: ["Malmö"],
            });
            const token = jwt.sign(
                { userId: teacher._id.toString(), role: "teacher", name: "T", email: "teacher-overview@example.com" },
                process.env.JWT_SECRET || "test-secret"
            );
            const res = await request(buildApp())
                .get("/api/completions/overview")
                .set("Authorization", `Bearer ${token}`);
            expect([401, 403]).toContain(res.status);
        });
    });

    describe("GET /api/completions/stats", () => {
        it("returns zero counters when empty", async () => {
            const res = await request(buildApp())
                .get("/api/completions/stats")
                .set("Authorization", auth());
            expect(res.status).toBe(200);
            expect(res.body.completedCourses30d).toBe(0);
            expect(res.body.totalCompletions30d).toBe(0);
            expect(res.body.lifetimeTotal).toBe(0);
        });

        it("counts recent completions", async () => {
            await CompletionEvent.create({
                idempotencyKey: `course:${admin._id}:x`,
                studentId: new mongoose.Types.ObjectId(),
                completionType: "course",
                courseName: "Matematik 2",
                completionDate: new Date(),
            });
            await CompletionEvent.create({
                idempotencyKey: `package:${admin._id}:y`,
                studentId: new mongoose.Types.ObjectId(),
                completionType: "course_package",
                packageName: "Teknikpaketet",
                completionDate: new Date(),
            });

            const res = await request(buildApp())
                .get("/api/completions/stats")
                .set("Authorization", auth());
            expect(res.status).toBe(200);
            expect(res.body.completedCourses30d).toBe(1);
            expect(res.body.completedPackages30d).toBe(1);
            expect(res.body.totalCompletions30d).toBe(2);
            expect(res.body.lifetimeTotal).toBe(2);
        });
    });
});