/**
 * GET /api/students-to-grade with real documents: placement writes a StudentEnrollment
 * AND a Student.education entry for the same course; the grading list must show that
 * student once, keep pure legacy rows, and never resurface a dropped enrollment.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { giveTeacherProfile } from "../helpers/teacherFixture.js";

const DAY = 86400000;
const now = Date.now();
const start = new Date(now - 70 * DAY);
const end = new Date(now - 14 * DAY);

const authFor = (user) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(user._id), role: user.roles[0], roles: user.roles }, process.env.JWT_SECRET)}`,
});

let teacherUser;
let teacher;
let course;
let instance;

/** A student placed the way courseMatchingService does it: enrollment + education twin. */
async function placedStudent(name, { status = "active", withEnrollment = true } = {}) {
    const student = await Student.create({
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.se`,
        personalNumber: "19000101-0000",
        teacherId: teacher._id,
        education: [
            { type: "Course", refId: course._id, name: course.courseName, startDate: start, endDate: end, grade: null, removedAt: null },
        ],
    });
    if (withEnrollment) {
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            teacherId: teacher._id,
            startDate: start,
            endDate: end,
            status,
        });
    }
    return student;
}

const rowsFor = (body, student) => body.filter((r) => String(r.student?._id) === String(student._id));

describe("GET /api/students-to-grade — enrollment vs legacy education rows", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        for (const name of Object.keys(mongoose.connection.collections)) {
            await mongoose.connection.collections[name].deleteMany({});
        }
        teacherUser = await User.create({ name: "Test Lärare", email: "larare@example.se", password: "x".repeat(20), roles: ["teacher"] });
        teacher = await giveTeacherProfile(teacherUser._id, { subject: "Matematik" });
        course = await Course.create({ courseName: "Matematik 1A", courseCode: "MATE1A00X", isActive: true });
        instance = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: course.courseCode,
            startDate: start,
            endDate: end,
            responsibleTeacher: teacher._id,
        });
    });

    it("lists a placed student once (the enrollment row), not twice", async () => {
        const student = await placedStudent("Test Elev");

        const res = await request(app).get("/api/students-to-grade").set(authFor(teacherUser));

        expect(res.status).toBe(200);
        const rows = rowsFor(res.body, student);
        expect(rows).toHaveLength(1);
        expect(rows[0].source).toBe("enrollment");
    });

    it("does not list a legacy-only education entry (#103: enrollments are the only source)", async () => {
        // scripts/backfillEnrollmentsFromEducation.js turns such entries into
        // enrollments before this code is deployed.
        const student = await placedStudent("Test Legacy", { withEnrollment: false });

        const res = await request(app).get("/api/students-to-grade").set(authFor(teacherUser));

        expect(rowsFor(res.body, student)).toHaveLength(0);
    });

    it("does not bring back a dropped enrollment through its education entry", async () => {
        const student = await placedStudent("Test Avbrott", { status: "dropped" });

        const res = await request(app).get("/api/students-to-grade").set(authFor(teacherUser));

        expect(rowsFor(res.body, student)).toHaveLength(0);
    });
});
