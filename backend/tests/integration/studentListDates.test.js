// GET /students: the Elever list's Startdatum / Slutdatum / Slutprov columns
// must come from the student's enrollments. Before the fix they read the
// stored Student fields, which only the Excel import fills, so students placed
// in the app (or by the Persian demo seed) showed empty dates.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import express from "express";
import Course from "../../src/models/Course.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import studentRoutes from "../../src/router/studentRoutes.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const mockAuthenticateUser = vi.hoisted(() => (req, _res, next) => {
    req.user = { role: "admin", roles: ["admin"], userId: "test-user" };
    req.userId = req.user.userId;
    next();
});

// Only the login is stubbed (an admin caller); everything else is real.
vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));

let app;
let course;

const day = (iso) => new Date(`${iso}T12:00:00.000Z`);

async function createStudent(name, extra = {}) {
    return Student.create({
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.se`,
        personalNumber: "19000101-0000",
        ...extra,
    });
}

async function enroll(student, startIso, endIso, slutprovIso, status = "active") {
    return StudentEnrollment.create({
        studentId: student._id,
        courseInstanceId: new mongoose.Types.ObjectId(),
        mainCourseId: course._id,
        startDate: day(startIso),
        endDate: day(endIso),
        slutprovDate: slutprovIso ? day(slutprovIso) : undefined,
        status,
    });
}

async function fetchStudent(name) {
    const res = await request(app).get("/api/students").expect(200);
    return res.body.find((s) => s.name === name);
}

describe("GET /api/students — dates from enrollments", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        app = express();
        app.use(express.json());
        app.use("/api", studentRoutes);
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([Course.deleteMany({}), Student.deleteMany({}), StudentEnrollment.deleteMany({})]);
        course = await Course.create({ courseName: "Testkurs", courseCode: "TEST01" });
    });

    it("fills Startdatum/Slutdatum/Slutprov for a student placed without stored dates", async () => {
        const s = await createStudent("Test Elev");
        await enroll(s, "2026-11-02", "2027-01-11", "2027-01-06");

        const row = await fetchStudent("Test Elev");
        expect(row.startDate).toBe(day("2026-11-02").toISOString());
        expect(row.endDate).toBe(day("2027-01-11").toISOString());
        expect(row.finalExamDate).toBe(day("2027-01-06").toISOString());
    });

    it("spans all current enrollments: earliest start, latest end and slutprov", async () => {
        const s = await createStudent("Test Elev Två");
        await enroll(s, "2026-11-02", "2027-01-11", "2027-01-06");
        await enroll(s, "2026-10-05", "2027-02-15", "2027-02-10");
        await enroll(s, "2026-01-05", "2027-06-01", "2027-05-26", "dropped");

        const row = await fetchStudent("Test Elev Två");
        expect(row.startDate).toBe(day("2026-10-05").toISOString());
        expect(row.endDate).toBe(day("2027-02-15").toISOString());
        expect(row.finalExamDate).toBe(day("2027-02-10").toISOString());
    });

    it("keeps imported student dates when the student has no enrollments", async () => {
        await createStudent("Test Import", {
            startDate: day("2026-08-17"),
            endDate: day("2026-12-18"),
            finalExamDate: day("2026-12-16"),
        });

        const row = await fetchStudent("Test Import");
        expect(row.startDate).toBe(day("2026-08-17").toISOString());
        expect(row.endDate).toBe(day("2026-12-18").toISOString());
        expect(row.finalExamDate).toBe(day("2026-12-16").toISOString());
    });

    it("shows the dropped period for a student whose enrollments are all dropped", async () => {
        const s = await createStudent("Test Avbrott", { dropout: true });
        await enroll(s, "2026-09-07", "2026-11-16", "2026-11-11", "dropped");

        const row = await fetchStudent("Test Avbrott");
        expect(row.startDate).toBe(day("2026-09-07").toISOString());
        expect(row.endDate).toBe(day("2026-11-16").toISOString());
    });
});
