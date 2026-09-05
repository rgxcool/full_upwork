import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const queryChain = (result) => {
    const chain = {
        populate: vi.fn(() => chain),
        select: vi.fn(() => chain),
        sort: vi.fn(() => chain),
        lean: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        skip: vi.fn(() => chain),
        then: undefined,
    };
    chain.then = (resolve, reject) => {
        const value = typeof result === "function" ? result() : result;
        return Promise.resolve(value).then(resolve, reject);
    };
    return chain;
};

let currentUser = { role: "admin", userId: "admin-1", roles: ["admin"] };

vi.mock("../../src/middleware/auth.js", () => ({
    isAuthenticated: (req, _res, next) => {
        req.user = currentUser;
        next();
    },
    hasRole: () => (_req, _res, next) => next(),
}));

vi.mock("../../src/middleware/authorization.js", () => ({
    can: () => (_req, _res, next) => next(),
}));

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const h = vi.hoisted(() => ({
    teacherModel: {
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
    },
    userModel: {
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
    },
    studentModel: { find: vi.fn(), findOne: vi.fn(), findById: vi.fn() },
    enrollmentModel: {
        find: vi.fn(),
        countDocuments: vi.fn(),
        distinct: vi.fn(),
    },
    courseInstanceModel: { find: vi.fn(), findById: vi.fn() },
}));

vi.mock("../../src/models/Teacher.js", () => ({ default: h.teacherModel }));
vi.mock("../../src/models/User.js", () => ({ default: h.userModel }));
vi.mock("../../src/models/Student.js", () => ({ default: h.studentModel }));
vi.mock("../../src/models/StudentEnrollment.js", () => ({ default: h.enrollmentModel }));
vi.mock("../../src/models/CourseInstance.js", () => ({ default: h.courseInstanceModel }));

import router from "../../src/router/teacherRoutes.js";

const app = express();
app.use(express.json());
app.use(router);

const makeTeacher = (overrides = {}) => ({
    _id: "teacher-1",
    userId: { _id: "user-1", username: "t1", email: "t1@ex.com", roles: ["teacher"], onVacation: false, vacationStart: null, vacationEnd: null, vacationNote: "" },
    subject: "Matematik",
    colorCode: "#e6194b",
    phoneNumbers: ["070-1"],
    ...overrides,
});

describe("teacherRoutes", () => {
    beforeEach(() => {
        currentUser = { role: "admin", userId: "admin-1", roles: ["admin"] };
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("GET /me/teacher", () => {
        it("returns 403 for non-teacher roles", async () => {
            currentUser = { role: "student", userId: "u1", roles: ["student"] };
            const res = await request(app).get("/me/teacher");
            expect(res.status).toBe(403);
        });

        it("returns 404 when no teacher profile exists", async () => {
            currentUser = { role: "teacher", userId: "user-1", roles: ["teacher"] };
            h.teacherModel.findOne.mockReturnValue(queryChain(null));
            const res = await request(app).get("/me/teacher");
            expect(res.status).toBe(404);
        });

        it("returns the current teacher profile", async () => {
            currentUser = { role: "teacher", userId: "user-1", roles: ["teacher"] };
            const teacher = makeTeacher();
            h.teacherModel.findOne.mockReturnValue(queryChain(teacher));
            const res = await request(app).get("/me/teacher");
            expect(res.status).toBe(200);
            expect(res.body.subject).toBe("Matematik");
            expect(h.teacherModel.findOne).toHaveBeenCalledWith({ userId: "user-1" });
        });
    });

    describe("GET /teachers/:id/profile", () => {
        it("returns 404 when the teacher is not found", async () => {
            h.teacherModel.findById.mockReturnValue(queryChain(null));
            const res = await request(app).get("/teachers/teacher-1/profile");
            expect(res.status).toBe(404);
        });

        it("returns profile with active and completed courses and a student count", async () => {
            const now = Date.now();
            const teacher = makeTeacher();
            h.teacherModel.findById.mockReturnValue(queryChain(teacher));
            const active = {
                _id: "ci-active",
                courseName: "Matte 1",
                courseCode: "MA1",
                coursePoints: 100,
                startDate: new Date(now - 10 * 864e5),
                endDate: new Date(now + 10 * 864e5),
                slutprovDate: new Date(now + 12 * 864e5),
                responsibleTeacher: "teacher-1",
                assistantTeacher: null,
                mainCourseId: { coursePoints: 100 },
            };
            const completed = {
                _id: "ci-old",
                courseName: "Fysik",
                courseCode: "FY1",
                startDate: new Date(now - 90 * 864e5),
                endDate: new Date(now - 30 * 864e5),
                responsibleTeacher: "teacher-1",
                mainCourseId: { coursePoints: 50 },
            };
            h.courseInstanceModel.find.mockReturnValue(queryChain([active, completed]));
            h.enrollmentModel.countDocuments.mockResolvedValue(3);
            h.enrollmentModel.distinct.mockReturnValue(queryChain(["s1", "s2", "s3"]));
            const res = await request(app).get("/teachers/teacher-1/profile");
            expect(res.status).toBe(200);
            expect(res.body.activeCourses).toHaveLength(1);
            expect(res.body.completedCourses).toHaveLength(1);
            expect(res.body.activeCourses[0].isResponsible).toBe(true);
            expect(res.body.activeCourses[0].studentCount).toBe(3);
            expect(res.body.totalStudents).toBe(3);
        });

        it("returns zero totalStudents when there are no active courses", async () => {
            const now = Date.now();
            const teacher = makeTeacher();
            h.teacherModel.findById.mockReturnValue(queryChain(teacher));
            const completed = {
                _id: "ci-old",
                courseName: "Fysik",
                courseCode: "FY1",
                startDate: new Date(now - 90 * 864e5),
                endDate: new Date(now - 30 * 864e5),
                responsibleTeacher: "teacher-1",
            };
            h.courseInstanceModel.find.mockReturnValue(queryChain([completed]));
            h.enrollmentModel.countDocuments.mockResolvedValue(0);
            const res = await request(app).get("/teachers/teacher-1/profile");
            expect(res.status).toBe(200);
            expect(res.body.activeCourses).toHaveLength(0);
            expect(res.body.totalStudents).toBe(0);
            expect(h.enrollmentModel.distinct).not.toHaveBeenCalled();
        });

        it("returns 500 when the query fails", async () => {
            h.teacherModel.findById.mockReturnValue(
                queryChain(() => Promise.reject(new Error("boom")))
            );
            const res = await request(app).get("/teachers/teacher-1/profile");
            expect(res.status).toBe(500);
        });
    });

    describe("GET /teachers/:id/courses/:courseInstanceId/students", () => {
        it("lists students for an admin", async () => {
            const enrollments = [
                {
                    _id: "e1",
                    studentId: { _id: "s1", name: "Anna", email: "a@x.com", personalNumber: "1", phone: "070", dropout: false },
                    status: "enrolled",
                    grade: null,
                    enrollmentDate: new Date(),
                    startDate: new Date(),
                    endDate: new Date(),
                },
                { _id: "e2", studentId: null, status: "enrolled" },
            ];
            h.enrollmentModel.find.mockReturnValue(queryChain(enrollments));
            const res = await request(app).get("/teachers/teacher-1/courses/ci-1/students");
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe("Anna");
        });

        it("allows an assigned teacher to list students", async () => {
            currentUser = { role: "teacher", userId: "user-1", roles: ["teacher"] };
            h.courseInstanceModel.findById.mockReturnValue(
                queryChain({ _id: "ci-1", responsibleTeacher: "teacher-1", assistantTeacher: null })
            );
            h.enrollmentModel.find.mockReturnValue(queryChain([]));
            const res = await request(app).get("/teachers/teacher-1/courses/ci-1/students");
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("returns 404 when the course instance is missing for a non-admin", async () => {
            currentUser = { role: "teacher", userId: "user-1", roles: ["teacher"] };
            h.courseInstanceModel.findById.mockReturnValue(queryChain(null));
            const res = await request(app).get("/teachers/teacher-1/courses/ci-1/students");
            expect(res.status).toBe(404);
        });

        it("returns 403 when a teacher is not assigned to the instance", async () => {
            currentUser = { role: "teacher", userId: "user-1", roles: ["teacher"] };
            h.courseInstanceModel.findById.mockReturnValue(
                queryChain({ _id: "ci-1", responsibleTeacher: "other", assistantTeacher: null })
            );
            const res = await request(app).get("/teachers/teacher-1/courses/ci-1/students");
            expect(res.status).toBe(403);
        });

        it("returns 500 when the query fails", async () => {
            h.enrollmentModel.find.mockReturnValue(queryChain(() => Promise.reject(new Error("boom"))));
            const res = await request(app).get("/teachers/teacher-1/courses/ci-1/students");
            expect(res.status).toBe(500);
        });
    });

    describe("PUT /teachers/:id/vacation", () => {
        it("returns 404 when the teacher is missing", async () => {
            h.teacherModel.findById.mockReturnValue(queryChain(null));
            const res = await request(app)
                .put("/teachers/teacher-1/vacation")
                .send({ onVacation: true });
            expect(res.status).toBe(404);
        });

        it("returns 403 when a non-admin updates someone else's vacation", async () => {
            currentUser = { role: "teacher", userId: "user-other", roles: ["teacher"] };
            h.teacherModel.findById.mockReturnValue(queryChain(makeTeacher()));
            const res = await request(app).put("/teachers/teacher-1/vacation").send({ onVacation: true });
            expect(res.status).toBe(403);
        });

        it("updates vacation fields as an admin", async () => {
            const teacher = makeTeacher();
            h.teacherModel.findById.mockReturnValue(queryChain(teacher));
            h.userModel.findByIdAndUpdate.mockResolvedValue({});
            h.userModel.findById.mockReturnValue(
                queryChain({ _id: "user-1", onVacation: true, vacationStart: new Date(), vacationEnd: new Date(), vacationNote: "Borta" })
            );
            const res = await request(app)
                .put("/teachers/teacher-1/vacation")
                .send({ onVacation: true, vacationStart: "2026-10-01", vacationEnd: "2026-10-10", vacationNote: "Semester" });
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Vacation updated.");
            expect(h.userModel.findByIdAndUpdate).toHaveBeenCalledWith(
                "user-1",
                expect.objectContaining({ $set: expect.objectContaining({ onVacation: true }) })
            );
        });

        it("clears vacation when onVacation is false", async () => {
            const teacher = makeTeacher();
            h.teacherModel.findById.mockReturnValue(queryChain(teacher));
            h.userModel.findByIdAndUpdate.mockResolvedValue({});
            h.userModel.findById.mockReturnValue(
                queryChain({ _id: "user-1", onVacation: false, vacationStart: null, vacationEnd: null, vacationNote: "" })
            );
            const res = await request(app).put("/teachers/teacher-1/vacation").send({ onVacation: false });
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Vacation cleared.");
        });

        it("returns 500 when the query fails", async () => {
            h.teacherModel.findById.mockReturnValue(queryChain(() => Promise.reject(new Error("boom"))));
            const res = await request(app).put("/teachers/teacher-1/vacation").send({ onVacation: true });
            expect(res.status).toBe(500);
        });
    });

    describe("PUT /teachers/:id/profile", () => {
        it("returns 404 when the teacher is missing", async () => {
            h.teacherModel.findById.mockReturnValue(queryChain(null));
            const res = await request(app).put("/teachers/teacher-1/profile").send({ subject: "Fysik" });
            expect(res.status).toBe(404);
        });

        it("updates subject and filters phone numbers", async () => {
            h.teacherModel.findById.mockReturnValue(queryChain(makeTeacher()));
            const updated = makeTeacher({ subject: "Fysik", phoneNumbers: ["070-2"] });
            h.teacherModel.findByIdAndUpdate.mockReturnValue(queryChain(updated));
            const res = await request(app)
                .put("/teachers/teacher-1/profile")
                .send({ subject: "Fysik", phoneNumbers: ["070-2", "  ", "070-3"] });
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Profile updated.");
            expect(res.body.teacher.subject).toBe("Fysik");
            const [id, updateData, opts] = h.teacherModel.findByIdAndUpdate.mock.calls[0];
            expect(id).toBe("teacher-1");
            expect(updateData.phoneNumbers).toEqual(["070-2", "070-3"]);
            expect(opts).toEqual({ new: true });
        });

        it("tolerates a request with no updateable fields", async () => {
            h.teacherModel.findById.mockReturnValue(queryChain(makeTeacher()));
            h.teacherModel.findByIdAndUpdate.mockReturnValue(queryChain(makeTeacher()));
            const res = await request(app).put("/teachers/teacher-1/profile").send({});
            expect(res.status).toBe(200);
            expect(res.body.message).toBe("Profile updated.");
        });

        it("returns 500 when the query fails", async () => {
            h.teacherModel.findById.mockReturnValue(queryChain(() => Promise.reject(new Error("boom"))));
            const res = await request(app).put("/teachers/teacher-1/profile").send({ subject: "Fysik" });
            expect(res.status).toBe(500);
        });
    });
});