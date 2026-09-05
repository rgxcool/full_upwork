import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../src/middleware/auth.js", () => ({
    isAuthenticated: (req, _res, next) => {
        req.user = { userId: "user-1", role: "admin" };
        next();
    },
    hasRole: () => (_req, _res, next) => next(),
}));

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const h = vi.hoisted(() => ({
    studentModel: { findById: vi.fn() },
    courseModel: { findById: vi.fn() },
    packageModel: { findById: vi.fn() },
    teacherModel: { findById: vi.fn() },
    enrollmentModel: { findById: vi.fn() },
    documentModel: { findById: vi.fn(), findOne: vi.fn() },
    calculateSlutprovDate: vi.fn(),
    getDefaultExamMode: vi.fn(),
    findBestCourseMatch: vi.fn(),
}));

vi.mock("../../src/models/Student.js", () => ({ default: h.studentModel }));
vi.mock("../../src/models/Course.js", () => ({ default: h.courseModel }));
vi.mock("../../src/models/CoursePackage.js", () => ({ default: h.packageModel }));
vi.mock("../../src/models/Teacher.js", () => ({ default: h.teacherModel }));
vi.mock("../../src/models/StudentEnrollment.js", () => ({ default: h.enrollmentModel }));
vi.mock("../../src/models/Document.js", () => ({ default: h.documentModel }));
vi.mock("../../src/utils/slutprovDateCalculator.js", () => ({
    calculateSlutprovDate: h.calculateSlutprovDate,
}));
vi.mock("../../src/utils/courseMatchingService.js", () => ({
    __esModule: true,
    default: {
        getDefaultExamMode: h.getDefaultExamMode,
        findBestCourseMatch: h.findBestCourseMatch,
    },
}));

import router from "../../src/router/placementRoutes.js";

const app = express();
app.use(express.json());
app.use(router);

describe("placementRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("POST /placement/preview", () => {
        const payload = {
            studentId: "507f1f77bcf86cd799439011",
            type: "course",
            courseId: "507f1f77bcf86cd799439012",
            startDate: "2026-09-20",
            durationWeeks: 5,
            municipality: "uddevalla",
        };

        beforeEach(() => {
            h.studentModel.findById.mockResolvedValue({
                _id: "507f1f77bcf86cd799439011",
                name: "Anna",
                teacherId: null,
                municipality: { type: "uddevalla" },
            });
            h.courseModel.findById.mockResolvedValue({
                _id: "507f1f77bcf86cd799439012",
                courseName: "Matematik 1",
                courseCode: "MATMAT01",
                courseExtent: "5",
            });
            h.getDefaultExamMode.mockReturnValue("Centralt");
            h.calculateSlutprovDate.mockResolvedValue(null);
        });

        it("requires a studentId", async () => {
            const res = await request(app).post("/placement/preview").send({ type: "course" });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain("studentId");
        });

        it("requires a valid type", async () => {
            const res = await request(app)
                .post("/placement/preview")
                .send({ studentId: "s", type: "nope" });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain("type must be");
        });

        it("requires a startDate", async () => {
            const res = await request(app)
                .post("/placement/preview")
                .send({ studentId: "s", type: "course" });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain("startDate");
        });

        it("returns 404 for unknown students", async () => {
            h.studentModel.findById.mockResolvedValue(null);
            const res = await request(app).post("/placement/preview").send(payload);
            expect(res.status).toBe(404);
            expect(res.body.error).toContain("Student not found");
        });

        it("returns 404 when the course cannot be found by id", async () => {
            h.courseModel.findById.mockResolvedValue(null);
            const res = await request(app).post("/placement/preview").send(payload);
            expect(res.status).toBe(404);
            expect(res.body.error).toContain("Course not found");
        });

        it("finds a course via courseCode when courseId is missing", async () => {
            h.courseModel.findById.mockResolvedValue(null);
            h.findBestCourseMatch.mockResolvedValue({
                course: { _id: "c1", courseName: "Fysik 1", courseCode: "FYFFY01" },
            });
            const res = await request(app)
                .post("/placement/preview")
                .send({ ...payload, courseId: undefined, courseCode: "FYFFY01" });
            expect(res.status).toBe(200, JSON.stringify(res.body));
            expect(h.findBestCourseMatch).toHaveBeenCalledWith("FYFFY01");
            expect(res.body.courses[0].courseName).toBe("Fysik 1");
        });

        it("returns 404 when courseCode has no match", async () => {
            h.courseModel.findById.mockResolvedValue(null);
            h.findBestCourseMatch.mockResolvedValue(null);
            const res = await request(app)
                .post("/placement/preview")
                .send({ ...payload, courseCode: "X", courseId: undefined });
            expect(res.status).toBe(404);
        });

        it("previews an individual course placement", async () => {
            const res = await request(app).post("/placement/preview").send(payload);
            expect(res.status).toBe(200);
            expect(res.body.courses).toHaveLength(1);
            expect(res.body.courses[0].weeks).toBe(5);
            expect(res.body.municipality).toBe("uddevalla");
            expect(res.body.examMode).toBe("Centralt");
            expect(res.body.totalWeeks).toBe(5);
        });

        it("uses the teacher-based slutprov date when available", async () => {
            h.studentModel.findById.mockResolvedValue({
                _id: "s1",
                name: "Anna",
                teacherId: "t1",
                municipality: { type: "" },
            });
            h.teacherModel.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue({
                    userId: { username: "karin.larsson" },
                }),
            });
            h.calculateSlutprovDate.mockResolvedValue(new Date("2026-11-04"));
            h.getDefaultExamMode.mockReturnValue("Lokalt");

            const res = await request(app).post("/placement/preview").send(payload);
            expect(res.status).toBe(200);
            expect(h.calculateSlutprovDate).toHaveBeenCalled();
            expect(res.body.courses[0].slutprovDate).toBeDefined();
        });

        it("applies default exam mode when no examMode or municipality", async () => {
            h.getDefaultExamMode.mockReturnValue("Fjärr");
            const res = await request(app)
                .post("/placement/preview")
                .send({ ...payload, examMode: undefined, municipality: undefined });
            expect(res.status).toBe(200);
            expect(res.body.examMode).toBe("Fjärr");
        });

        it("falls back to the effective slutprov default for teachers without a rule", async () => {
            h.studentModel.findById.mockResolvedValue({
                _id: "s1",
                name: "Anna",
                teacherId: null,
                municipality: null,
            });
            h.getDefaultExamMode.mockReturnValue(null);
            const res = await request(app)
                .post("/placement/preview")
                .send({ ...payload, municipality: undefined });
            expect(res.status).toBe(200);
            expect(res.body.examMode).toBeNull();
            expect(res.body.courses[0].slutprovDate).toBeTruthy();
        });

        it("previews a package including grouped 2.5-week courses", async () => {
            const course2dot5a = { _id: "a", courseName: "Svenska A", courseCode: "A", courseExtent: "2.5" };
            const course2dot5b = { _id: "b", courseName: "Svenska B", courseCode: "B", courseExtent: "2.5" };
            h.packageModel.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue({
                    _id: "p1",
                    coursePackageCourses: [course2dot5a, course2dot5b],
                }),
            });

            const res = await request(app)
                .post("/placement/preview")
                .send({ ...payload, type: "package", packageId: "p1", excludeCourseIds: [] });

            expect(res.status).toBe(200);
            expect(res.body.courses).toHaveLength(2);
            expect(res.body.courses[0].grouped).toBe(true);
            expect(res.body.courses[0].weeks).toBe(5);
            expect(res.body.courses[1].groupedWith).toBe("a");
        });

        it("previews a package and honors excluded courses", async () => {
            const courseA = { _id: "a", courseName: "Matematik", courseCode: "M", courseExtent: "5" };
            const courseB = { _id: "b", courseName: "Fysik", courseCode: "F", courseExtent: "5" };
            h.packageModel.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue({
                    _id: "p1",
                    coursePackageCourses: [courseA, courseB],
                }),
            });

            const res = await request(app)
                .post("/placement/preview")
                .send({ ...payload, type: "package", packageId: "p1", excludeCourseIds: ["b"] });

            expect(res.status).toBe(200);
            expect(res.body.courses).toHaveLength(1);
            expect(res.body.courses[0].courseCode).toBe("M");
        });

        it("returns 404 when the package is missing", async () => {
            h.packageModel.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue(null),
            });
            const res = await request(app)
                .post("/placement/preview")
                .send({ ...payload, type: "package", packageId: "none" });
            expect(res.status).toBe(404);
            expect(res.body.error).toContain("Course package not found");
        });
    });

    describe("PUT /enrollment-exam-config/:enrollmentId", () => {
        let enrollment;

        beforeEach(() => {
            enrollment = {
                _id: "e1",
                studentId: "s1",
                examMode: "Centralt",
                save: vi.fn().mockResolvedValue({}),
            };
            h.enrollmentModel.findById.mockResolvedValue(enrollment);
            h.studentModel.findById.mockResolvedValue({
                _id: "s1",
                municipality: { type: "Lokalt" },
                save: vi.fn().mockResolvedValue({}),
            });
        });

        it("returns 404 for unknown enrollments", async () => {
            h.enrollmentModel.findById.mockResolvedValue(null);
            const res = await request(app)
                .put("/enrollment-exam-config/e1")
                .send({ examMode: "Lokalt" });
            expect(res.status).toBe(404);
        });

        it("updates exam fields on the enrollment and student municipality", async () => {
            const res = await request(app).put("/enrollment-exam-config/e1").send({
                examMode: "Lokalt",
                examMunicipality: "uddevalla",
                examLocation: "Studio",
                examTime: "09:00",
            });
            expect(res.status).toBe(200);
            expect(enrollment.examMode).toBe("Lokalt");
            expect(enrollment.examMunicipality).toBe("uddevalla");
            expect(enrollment.examLocation).toBe("Studio");
            expect(enrollment.examTime).toBe("09:00");
            expect(enrollment.save).toHaveBeenCalled();
        });

        it("keeps prior values when only some fields are sent", async () => {
            enrollment.examTime = "13:00";
            await request(app).put("/enrollment-exam-config/e1").send({ examLocation: "Studio" });
            expect(enrollment.examTime).toBe("13:00");
        });
    });

    describe("GET /enrollments/:enrollmentId/certificate", () => {
        beforeEach(() => {
            h.enrollmentModel.findById.mockResolvedValue({ _id: "e1" });
            h.documentModel.findById.mockResolvedValue(null);
            h.documentModel.findOne.mockResolvedValue(null);
        });

        it("returns 404 for unknown enrollments", async () => {
            h.enrollmentModel.findById.mockResolvedValue(null);
            const res = await request(app).get("/enrollments/e1/certificate");
            expect(res.status).toBe(404);
        });

        it("returns null certificate when no document exists", async () => {
            const res = await request(app).get("/enrollments/e1/certificate");
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ certificate: null });
            expect(h.documentModel.findOne).toHaveBeenCalledWith({
                enrollmentId: "e1",
                type: "COURSE_ARCHIVE",
            });
        });

        it("returns the linked certificate document", async () => {
            h.enrollmentModel.findById.mockResolvedValue({
                _id: "e1",
                certificateDocId: "d1",
            });
            h.documentModel.findById.mockResolvedValue({
                _id: "d1",
                filename: "cert.pdf",
                originalName: "cert.pdf",
                createdAt: new Date("2026-01-01"),
            });
            const res = await request(app).get("/enrollments/e1/certificate");
            expect(res.status).toBe(200);
            expect(res.body.certificate._id).toBe("d1");
            expect(h.documentModel.findOne).not.toHaveBeenCalled();
        });
    });
});