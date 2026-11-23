/**
 * #121: a teacher may edit a student only when the student is connected to
 * them (assigned teacher, enrollment teacher, or responsible/assistant teacher
 * of one of the student's course instances). Other staff are not restricted.
 *
 * Mounts the real studentRoutes and courseMatchingRoutes against
 * mongodb-memory-server; only the JWT middleware (an external boundary) is
 * replaced so tests can choose the caller. Data is created through the models.
 *
 * Fails on the old code: an unconnected teacher could change any student.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import express from "express";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Deviation from "../../src/models/Deviation.js";
import studentRoutes from "../../src/router/studentRoutes.js";
import courseMatchingRoutes from "../../src/router/courseMatchingRoutes.js";
import studentDetailsRoutes from "../../src/router/studentDetailsRoutes.js";
import aplRoutes from "../../src/router/aplRoutes.js";
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

const DENIED = "Du kan bara ändra elever som är kopplade till dig.";

describe("Teachers edit only their own students (#121)", () => {
    let app;
    let student;
    let u; // users by key
    let course;
    let instance;

    const makeUser = (key, roles) =>
        User.create({ name: `Test ${key}`, email: `${key}@test.invalid`, password: "x".repeat(12), roles });

    beforeAll(async () => {
        await connectTestDatabase();
        app = express();
        app.use(express.json());
        app.use("/api", studentRoutes);
        app.use("/api", courseMatchingRoutes);
        app.use("/api", studentDetailsRoutes);
        app.use("/api", aplRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            User.deleteMany({}),
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);

        u = {
            admin: await makeUser("admin", ["admin"]),
            mentor: await makeUser("mentor", ["teacher"]),
            responsible: await makeUser("ansvarig", ["teacher"]),
            assistant: await makeUser("assistent", ["teacher"]),
            enrollmentTeacher: await makeUser("kurslarare", ["teacher"]),
            outsider: await makeUser("annan", ["teacher"]),
            teacherAndSyv: await makeUser("larsyv", ["teacher", "syv"]),
        };

        course = await Course.create({ courseName: "Svenska 1", courseCode: "SVESVE01" });
        instance = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: course.courseCode,
            startDate: new Date("2026-01-05"),
            endDate: new Date("2026-02-09"),
            responsibleTeacher: u.responsible._id,
            assistantTeacher: u.assistant._id,
        });

        student = await Student.create({
            name: "Test Elev",
            email: "test.elev@test.invalid",
            personalNumber: "19000101-0000",
            municipality: { type: "Sollentuna" },
            teacherId: u.mentor._id,
        });
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            courseName: course.courseName,
            startDate: instance.startDate,
            endDate: instance.endDate,
            teacherId: u.enrollmentTeacher._id,
            status: "active",
        });
    });

    const editPhone = (user, phone) =>
        request(app).put(`/api/student/${student._id}`).set(auth(user)).send({ phone });

    it("an unconnected teacher cannot edit the student, and nothing changes", async () => {
        const res = await editPhone(u.outsider, "0700000001");
        expect(res.status).toBe(403);
        expect(res.body.error).toBe(DENIED);
        expect((await Student.findById(student._id).lean()).phone).toBeUndefined();
    });

    it.each([
        ["the assigned teacher (Student.teacherId)", "mentor"],
        ["the responsible teacher of a course instance", "responsible"],
        ["the assistant teacher of a course instance", "assistant"],
        ["the teacher on the enrollment", "enrollmentTeacher"],
        ["an admin", "admin"],
        ["a teacher who is also SYV", "teacherAndSyv"],
    ])("%s can edit the student", async (_label, key) => {
        const res = await editPhone(u[key], "0700000002");
        expect(res.status).toBe(200);
        expect((await Student.findById(student._id).lean()).phone).toBe("0700000002");
    });

    it("a teacher whose only link is another student's course cannot edit", async () => {
        const other = await Student.create({
            name: "Test Annan Elev",
            email: "annan.elev@test.invalid",
            personalNumber: "19000101-0001",
        });
        const res = await request(app)
            .put(`/api/student/${other._id}`)
            .set(auth(u.responsible))
            .send({ phone: "0700000003" });
        expect(res.status).toBe(403);
    });

    it("every student write route refuses an unconnected teacher", async () => {
        const id = String(student._id);
        const someId = String(new mongoose.Types.ObjectId());
        const calls = [
            ["PUT /student/:id", () => request(app).put(`/api/student/${id}`).send({ phone: "0700000004" })],
            ["PATCH /students/:id", () => request(app).patch(`/api/students/${id}`).send({ phone: "0700000004" })],
            ["POST addcourse", () => request(app).post(`/api/student/${id}/addcourse`).send({ courseId: String(course._id) })],
            ["POST setprogram", () => request(app).post(`/api/student/${id}/setprogram`).send({ programId: someId })],
            ["POST addcoursepackage", () => request(app).post(`/api/student/${id}/addcoursepackage`).send({ coursePackageId: someId })],
            ["DELETE course", () => request(app).delete(`/api/student/${id}/courses/${course._id}`)],
            ["DELETE enrollment", () => request(app).delete(`/api/students/${id}/enrollments/${someId}`)],
            ["PUT studyplan-tempo", () => request(app).put(`/api/students/${id}/studyplan-tempo`).send({ tempoWeeks: 10 })],
            ["POST /students/:id/comment", () => request(app).post(`/api/students/${id}/comment`).send({ comment: "Testkommentar" })],
            ["POST comment", () => request(app).post(`/api/student-details/${id}/comments`).send({ text: "Testkommentar" })],
            ["PUT comment", () => request(app).put(`/api/student-details/${id}/comments/${someId}`).send({ text: "Ändrad" })],
            ["DELETE comment", () => request(app).delete(`/api/student-details/${id}/comments/${someId}`)],
            ["POST deviation", () => request(app).post(`/api/student-details/${id}/deviations`).send({ type: "frånvaro", description: "Test" })],
            ["PATCH APL status", () => request(app).patch(`/api/apl/records/${id}/status`).send({ status: "GREEN" })],
            ["PUT APL record", () => request(app).put(`/api/apl/records/${id}`).send({ notes: "Test" })],
        ];
        for (const [label, call] of calls) {
            const res = await call().set(auth(u.outsider));
            expect({ label, status: res.status, error: res.body.error }).toEqual({ label, status: 403, error: DENIED });
        }
        expect(await StudentEnrollment.countDocuments({ studentId: student._id })).toBe(1);
        const after = await Student.findById(student._id).lean();
        expect(after.commentHistory ?? []).toHaveLength(0);
        expect(await Deviation.countDocuments({ studentId: student._id })).toBe(0);
    });
});
