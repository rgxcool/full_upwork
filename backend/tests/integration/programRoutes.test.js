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
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../../index.js";
import Program from "../../src/models/Program.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";

let mongoServer;
let programId;

describe("Program Routes", () => {
    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        if (mongoServer) {
            await mongoServer.stop();
        }
    }, 60000);

    beforeEach(async () => {
        await Program.deleteMany({});
        await Course.deleteMany({});
        await CoursePackage.deleteMany({});

        const courseOne = await Course.create({
            courseName: "Course One",
            courseCode: "C001",
            coursePoints: "5",
            courseExtent: "5 weeks",
        });

        const courseTwo = await Course.create({
            courseName: "Course Two",
            courseCode: "C002",
            coursePoints: "10",
            courseExtent: "10 weeks",
        });

        const coursePackage = await CoursePackage.create({
            coursePackageName: "Package One",
            coursePackageCode: "P001",
            coursePackagePoints: "15",
            coursePackageExtent: "15 weeks",
            coursePackageCourses: [courseOne._id],
        });

        const program = await Program.create({
            programName: "Program One",
            programCourses: [
                { courseId: courseTwo._id, order: 2 },
                { courseId: courseOne._id, order: 1 },
                { courseId: new mongoose.Types.ObjectId() },
            ],
            programCoursePackages: [coursePackage._id],
        });

        programId = program._id;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Program.deleteMany({});
        await Course.deleteMany({});
        await CoursePackage.deleteMany({});
    });

    describe("GET /api/programs", () => {
        it("returns formatted programs with sorted courses", async () => {
            const response = await request(app)
                .get("/api/programs")
                .expect(200);

            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toHaveProperty(
                "programName",
                "Program One"
            );

            const courseOrders = response.body[0].programCourses.map(
                (course) => course.order
            );
            expect(courseOrders).toEqual([null, 1, 2]);

            const missingCourse = response.body[0].programCourses[0];
            expect(missingCourse).toMatchObject({
                courseName: "N/A",
                courseCode: "N/A",
                coursePoints: "N/A",
                courseExtent: "N/A",
            });

            const packageEntry = response.body[0].programCoursePackages[0];
            expect(packageEntry).toHaveProperty(
                "coursePackageName",
                "Package One"
            );
            expect(packageEntry.coursePackageCourses).toHaveLength(1);
            expect(packageEntry.coursePackageCourses[0]).toHaveProperty(
                "courseName",
                "Course One"
            );
        });

        it("handles database errors", async () => {
            vi.spyOn(Program, "find").mockImplementationOnce(() => {
                throw new Error("Database failure");
            });

            const response = await request(app)
                .get("/api/programs")
                .expect(500);

            expect(response.body).toEqual({ error: "Server error" });
        });
    });

    describe("GET /api/program/:programId/courses", () => {
        it("returns program courses with formatted values", async () => {
            const response = await request(app)
                .get(`/api/program/${programId}/courses`)
                .expect(200);

            expect(response.body).toHaveLength(3);
            const coursesByOrder = new Map(
                response.body.map((course) => [
                    course.order ?? "missing",
                    course,
                ])
            );

            expect(coursesByOrder.get("missing")).toMatchObject({
                courseName: "N/A",
                courseCode: "N/A",
                coursePoints: "N/A",
                courseExtent: "N/A",
            });
            expect(coursesByOrder.get(1)).toMatchObject({
                courseName: "Course One",
                courseCode: "C001",
                coursePoints: "5",
                courseExtent: "5 weeks",
                order: 1,
            });
            expect(coursesByOrder.get(2)).toMatchObject({
                courseName: "Course Two",
                courseCode: "C002",
                coursePoints: "10",
                courseExtent: "10 weeks",
                order: 2,
            });
        });

        it("returns 404 when the program does not exist", async () => {
            const response = await request(app)
                .get(`/api/program/${new mongoose.Types.ObjectId()}/courses`)
                .expect(404);

            expect(response.body).toEqual({ error: "Program not found" });
        });

        it("returns 500 for invalid ids", async () => {
            const response = await request(app)
                .get("/api/program/not-a-valid-id/courses")
                .expect(500);

            expect(response.body).toEqual({ error: "Server error" });
        });
    });
});
