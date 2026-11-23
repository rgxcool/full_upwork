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
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        name: "Test User",
        email: "test@example.com",
        ...overrides,
    };

    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

describe("Stats Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    const clear = () =>
        Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);

    beforeEach(clear);

    afterEach(async () => {
        vi.restoreAllMocks();
        await clear();
    });

    // #103: the stats come from StudentEnrollment (registration month, grade).
    let seq = 0;
    const createStudent = (municipality) => {
        seq++;
        return Student.create({
            name: "Test Elev",
            email: `stats.${seq}@example.se`,
            personalNumber: "19000101-0000",
            ...(municipality ? { municipality: { type: municipality } } : {}),
        });
    };
    const enroll = async (student, courseId, enrollmentDate, grade) => {
        seq++;
        const instance = await CourseInstance.create({
            mainCourseId: courseId,
            courseName: "Course One",
            courseCode: `STAT-${seq}`,
            startDate: new Date("2024-06-03"),
            endDate: new Date("2024-08-16"),
        });
        return StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: courseId,
            startDate: instance.startDate,
            endDate: instance.endDate,
            enrollmentDate,
            grade,
        });
    };

    it("returns aggregated course stats with grades and municipalities", async () => {
        const course = await Course.create({
            courseName: "Course One",
            courseCode: "C001",
            courseExtent: "5 weeks",
        });
        const sollentuna = await createStudent("Sollentuna");
        const sigtuna = await createStudent("Sigtuna");
        const noMunicipality = await createStudent(null);

        await enroll(sollentuna, course._id, new Date("2024-05-15T10:00:00Z"), "g");
        await enroll(sollentuna, course._id, new Date("2024-05-20T10:00:00Z"), "g");
        // A course that no longer exists is skipped.
        await enroll(sollentuna, new mongoose.Types.ObjectId(), new Date("2024-05-21T10:00:00Z"), "a");
        await enroll(sigtuna, course._id, new Date("2024-05-10T10:00:00Z"), null);
        await enroll(noMunicipality, course._id, new Date("2024-05-11T10:00:00Z"), "f");

        const token = signToken();
        const response = await request(app)
            .get("/api/stats/courses-per-month")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(Object.keys(response.body)).toEqual(["2024-05"]);
        expect(Object.keys(response.body["2024-05"])).toEqual(["Course One"]);

        const stats = response.body["2024-05"]["Course One"];
        expect(stats.G).toBe(2);
        expect(stats.UNKNOWN).toBe(1);
        expect(stats.F).toBe(1);
        expect(stats.A).toBeUndefined();
        expect(stats._municipality.sort()).toEqual(
            ["Sollentuna", "Sigtuna", "UNKNOWN"].sort()
        );
    });

    it("returns an empty object when no stats are available", async () => {
        await createStudent("Sollentuna");

        const token = signToken();
        const response = await request(app)
            .get("/api/stats/courses-per-month")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(response.body).toEqual({});
    });

    it("returns 500 when stats generation fails", async () => {
        vi.spyOn(StudentEnrollment, "find").mockImplementationOnce(() => {
            throw new Error("Database failure");
        });

        const token = signToken();
        const response = await request(app)
            .get("/api/stats/courses-per-month")
            .set("Authorization", `Bearer ${token}`)
            .expect(500);

        expect(response.body).toEqual({ error: "Failed to generate stats" });
    });
});
