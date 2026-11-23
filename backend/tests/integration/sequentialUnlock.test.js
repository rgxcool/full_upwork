// Stegvis upplåsning (#112): learning routes enforce the step order on the
// server, using real Mongoose documents (mongodb-memory-server).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import express from "express";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import AssignmentSubmission from "../../src/models/AssignmentSubmission.js";
import User from "../../src/models/User.js";
import learningRoutes from "../../src/router/learningRoutes.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { giveTeacherProfile } from "../helpers/teacherFixture.js";
import { LOCKED_SECTION_TEXT } from "../../src/utils/courseProgression.js";

// Same standalone mount as learningRoutes.test.js: only the external JWT
// middleware is replaced, never module-internal code.
const mockAuthenticateUser = vi.hoisted(() => (req, _res, next) => {
    const secret = process.env.JWT_SECRET || "test-secret";
    const header = req.headers.authorization || "";
    try {
        const decoded = jwt.verify(header.slice(7), secret) || {};
        const roles = decoded.roles || [decoded.role || "student"];
        req.user = { userId: decoded.userId, role: roles[0], roles, email: decoded.email, permissions: [] };
    } catch {
        req.user = { userId: "anon", role: "student", roles: ["student"] };
    }
    req.userId = req.user.userId;
    next();
});

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));

const STUDENT_EMAIL = "test.elev@example.com";

const auth = (role, extra = {}) => ({
    Authorization: `Bearer ${jwt.sign(
        {
            userId: extra.userId || new mongoose.Types.ObjectId().toString(),
            email: extra.email,
            role,
            roles: [role],
        },
        process.env.JWT_SECRET || "test-secret"
    )}`,
});

const studentAuth = () => auth("student", { email: STUDENT_EMAIL });

describe("Stegvis upplåsning (#112)", () => {
    let app;
    let instance;
    let enrollment;
    let teacherUser;
    let otherTeacherUser;

    beforeAll(async () => {
        await connectTestDatabase();
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
        app = express();
        app.use(express.json());
        app.use("/api", learningRoutes);
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            AssignmentSubmission.deleteMany({}),
            User.deleteMany({}),
        ]);

        const student = await Student.create({
            name: "Test Elev",
            personalNumber: "19000101-0000",
            email: STUDENT_EMAIL,
            municipality: { type: "Sollentuna" },
        });

        teacherUser = await User.create({
            name: "Test Lärare",
            email: "test.larare@example.com",
            password: await bcrypt.hash("password123", 10),
            role: "teacher",
        });
        const teacher = await giveTeacherProfile(teacherUser._id, { subject: "Handel" });

        otherTeacherUser = await User.create({
            name: "Annan Lärare",
            email: "annan.larare@example.com",
            password: await bcrypt.hash("password123", 10),
            role: "teacher",
        });
        await giveTeacherProfile(otherTeacherUser._id, { subject: "Svenska" });

        const course = await Course.create({ courseName: "Handel nivå 2", courseCode: "HANHAN02" });

        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-30"),
            courseName: course.courseName,
            courseCode: course.courseCode,
            responsibleTeacher: teacher._id,
            sequentialUnlock: true,
            modules: [
                {
                    moduleNumber: 1,
                    title: "Introduktion",
                    sections: [
                        { title: "Kom igång", instructions: "Intro-innehåll" },
                        { title: "Frågor och svar", instructions: "Hemligt FAQ-innehåll" },
                    ],
                    assignment: { title: "Presentation", description: "Presentera dig" },
                },
                {
                    moduleNumber: 2,
                    title: "Modul 2",
                    sections: [{ title: "Lektion", instructions: "Hemligt modul 2-innehåll" }],
                },
            ],
        });

        enrollment = await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            courseName: course.courseName,
            mainCourseId: course._id,
            municipalityName: "Sollentuna",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-30"),
            status: "active",
        });
    });

    const getModules = () =>
        request(app).get(`/api/learning/instances/${instance._id}/modules`).set(studentAuth());

    const complete = (moduleNumber, sectionIndex) =>
        request(app)
            .post(`/api/learning/instances/${instance._id}/modules/${moduleNumber}/sections/${sectionIndex}/complete`)
            .set(studentAuth());

    const submit = (moduleNumber) =>
        request(app)
            .post(`/api/learning/instances/${instance._id}/modules/${moduleNumber}/submissions`)
            .set(studentAuth())
            .send({ submittedText: "Min inlämning" });

    it("does not send locked content to the student", async () => {
        const res = await getModules();
        expect(res.status).toBe(200);
        expect(res.body.instance.sequentialUnlock).toBe(true);
        const body = JSON.stringify(res.body.modules);
        expect(body).toContain("Intro-innehåll");
        expect(body).not.toContain("Hemligt FAQ-innehåll");
        expect(body).not.toContain("Hemligt modul 2-innehåll");
        expect(body).not.toContain("Presentera dig");

        const [intro, second] = res.body.modules;
        expect(intro.sections[1]).toMatchObject({ locked: true, instructions: LOCKED_SECTION_TEXT });
        expect(intro.assignmentLocked).toBe(true);
        expect(second.locked).toBe(true);
    });

    it("refuses to mark a locked section as done", async () => {
        const res = await complete(1, 1);
        expect(res.status).toBe(403);
        const fresh = await StudentEnrollment.findById(enrollment._id).lean();
        expect(fresh.completedSections).toEqual([]);
    });

    it("refuses a submission before the module's sections are done", async () => {
        const res = await submit(1);
        expect(res.status).toBe(403);
        expect(await AssignmentSubmission.countDocuments({})).toBe(0);
    });

    it("unlocks step by step through sections, assignment and next module", async () => {
        expect((await complete(1, 0)).status).toBe(200);
        // Marking twice is idempotent.
        const again = await complete(1, 0);
        expect(again.status).toBe(200);
        expect(again.body.completedSections).toHaveLength(1);

        expect((await complete(1, 1)).status).toBe(200);
        expect((await complete(2, 0)).status).toBe(403); // assignment not submitted yet

        expect((await submit(1)).status).toBe(201);
        expect((await complete(2, 0)).status).toBe(200);

        const res = await getModules();
        const [intro, second] = res.body.modules;
        expect(intro.completed).toBe(true);
        expect(second.locked).toBe(false);
        expect(second.sections[0]).toMatchObject({ locked: false, completed: true, instructions: "Hemligt modul 2-innehåll" });
    });

    it("leaves the course fully open when the setting is off", async () => {
        await CourseInstance.updateOne({ _id: instance._id }, { $set: { sequentialUnlock: false } });
        const res = await getModules();
        expect(JSON.stringify(res.body.modules)).toContain("Hemligt modul 2-innehåll");
        expect((await submit(1)).status).toBe(201);
        // Marking progress still works (and is recorded) without the lock.
        expect((await complete(2, 0)).status).toBe(200);
    });

    it("rejects sections that do not exist", async () => {
        expect((await complete(1, 7)).status).toBe(404);
        expect((await complete(9, 0)).status).toBe(404);
        expect(
            (await request(app)
                .post(`/api/learning/instances/${instance._id}/modules/1/sections/-1/complete`)
                .set(studentAuth())).status
        ).toBe(400);
    });

    it("lets the responsible teacher toggle the setting", async () => {
        const res = await request(app)
            .put(`/api/learning/instances/${instance._id}/progression`)
            .set(auth("teacher", { userId: teacherUser._id.toString() }))
            .send({ sequentialUnlock: false });
        expect(res.status).toBe(200);
        const fresh = await CourseInstance.findById(instance._id).lean();
        expect(fresh.sequentialUnlock).toBe(false);
    });

    it("blocks other teachers and students from toggling the setting", async () => {
        const other = await request(app)
            .put(`/api/learning/instances/${instance._id}/progression`)
            .set(auth("teacher", { userId: otherTeacherUser._id.toString() }))
            .send({ sequentialUnlock: false });
        expect(other.status).toBe(403);

        const asStudent = await request(app)
            .put(`/api/learning/instances/${instance._id}/progression`)
            .set(studentAuth())
            .send({ sequentialUnlock: false });
        expect(asStudent.status).toBe(403);

        const fresh = await CourseInstance.findById(instance._id).lean();
        expect(fresh.sequentialUnlock).toBe(true);
    });

    it("validates the toggle body", async () => {
        const res = await request(app)
            .put(`/api/learning/instances/${instance._id}/progression`)
            .set(auth("admin"))
            .send({ sequentialUnlock: "yes" });
        expect(res.status).toBe(400);
    });
});
