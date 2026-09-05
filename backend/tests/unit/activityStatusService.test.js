import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: { findById: vi.fn() },
}));

vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: { find: vi.fn(), findOne: vi.fn() },
}));

vi.mock("../../src/models/TeacherScheduleParameters.js", () => ({
    __esModule: true,
    default: { findOne: vi.fn() },
}));

vi.mock("../../src/models/User.js", () => ({
    __esModule: true,
    default: { findById: vi.fn() },
}));

vi.mock("../../src/models/AssignmentSubmission.js", () => ({
    __esModule: true,
    default: { findOne: vi.fn() },
}));

import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import TeacherScheduleParameters from "../../src/models/TeacherScheduleParameters.js";
import User from "../../src/models/User.js";
import AssignmentSubmission from "../../src/models/AssignmentSubmission.js";
import {
    calculateActivityStatus,
    calculateBatchActivityStatus,
} from "../../src/services/activityStatusService.js";

const validId = "507f1f77bcf86cd799439011";

const makeChain = (result) => {
    const chain = {
        populate: vi.fn(() => chain),
        select: vi.fn(() => chain),
        sort: vi.fn(() => chain),
        lean: vi.fn(() => chain),
        then: undefined,
    };
    chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return chain;
};

const makeModules = (count = 5) =>
    Array.from({ length: count }, (_, i) => ({
        moduleNumber: i + 1,
        title: `Modul ${i + 1}`,
        isPartialExam: i === 2,
        isCaseStudy: i === 4,
    }));

describe("activityStatusService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("calculateActivityStatus", () => {
        it("returns an error for invalid ids", async () => {
            const result = await calculateActivityStatus({
                studentId: "nope",
                courseInstanceId: validId,
            });
            expect(result).toEqual({ error: "Invalid IDs" });
        });

        it("returns an error when the course instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const result = await calculateActivityStatus({
                studentId: validId,
                courseInstanceId: validId,
            });
            expect(result).toEqual({ error: "Course instance not found" });
        });

        it("returns an error when the student is not enrolled", async () => {
            CourseInstance.findById.mockResolvedValue({
                _id: validId,
                courseName: "Matematik 1",
                modules: [],
                startDate: new Date(),
                endDate: new Date(),
            });
            StudentEnrollment.findOne.mockReturnValue(makeChain(null));
            const result = await calculateActivityStatus({
                studentId: validId,
                courseInstanceId: validId,
            });
            expect(result).toEqual({
                error: "Student not enrolled in this course instance",
            });
        });

        it("marks modules behind when their section date has passed", async () => {
            const start = new Date(Date.now() - 60 * 86400000);
            CourseInstance.findById.mockResolvedValue({
                _id: validId,
                courseName: "Matematik 1",
                modules: makeModules(5),
                startDate: start,
                endDate: new Date(Date.now() + 60 * 86400000),
            });
            StudentEnrollment.findOne.mockReturnValue(
                makeChain({
                    _id: "e1",
                    studentId: { _id: validId, name: "Anna", personalNumber: "1" },
                    completedComponents: new Map([[1, "✓"], [2, "✓"]]),
                })
            );
            TeacherScheduleParameters.findOne.mockResolvedValue(null);
            User.findById.mockReturnValue(
                makeChain({ _id: validId, lastLoginAt: null }).select()
            );
            AssignmentSubmission.findOne.mockReturnValue(makeChain(null));

            const result = await calculateActivityStatus({
                studentId: validId,
                courseInstanceId: validId,
            });

            expect(result.success).toBe(true);
            expect(result.completedModules).toBe(2);
            expect(result.overallStatus).toBe("behind");
            expect(result.moduleStatuses[0].behind).toBe(false);
            expect(result.moduleStatuses[2].behind).toBe(true);
            expect(result.studentActivity.lastActivity).toBeNull();
        });

        it("reports completed status when every module is completed", async () => {
            const start = new Date(Date.now() - 60 * 86400000);
            CourseInstance.findById.mockResolvedValue({
                _id: validId,
                courseName: "Fysik 1",
                modules: makeModules(3),
                startDate: start,
                endDate: new Date(Date.now() + 60 * 86400000),
                responsibleTeacher: "teacher-1",
                mainCourseId: "course-1",
                version: "10.0",
            });
            StudentEnrollment.findOne.mockReturnValue(
                makeChain({
                    _id: "e1",
                    studentId: { _id: validId, name: "Anna", personalNumber: "1" },
                    completedComponents: new Map([
                        [1, "✓"],
                        [2, "✓"],
                        [3, "✓"],
                    ]),
                })
            );
            TeacherScheduleParameters.findOne.mockResolvedValue({
                sectionOffsets: [0, 1, 2, 3, 4],
            });
            User.findById.mockReturnValue(
                makeChain({
                    _id: validId,
                    lastLoginAt: new Date(Date.now() - 2 * 86400000),
                }).select()
            );

            const result = await calculateActivityStatus({
                studentId: validId,
                courseInstanceId: validId,
            });

            expect(result.overallStatus).toBe("completed");
            expect(result.completionRate).toBe("100.0");
            expect(result.studentActivity.lastActivity.type).toBe("login");
            expect(result.studentActivity.lastActivity.daysAgo).toBe(2);
            expect(result.sectionDates).toHaveLength(5);
            expect(result.courseTimeline.daysUntilEnd).toBeGreaterThan(0);
        });

        it("uses a recent assignment submission as last activity", async () => {
            CourseInstance.findById.mockResolvedValue({
                _id: validId,
                courseName: "Biologi 1",
                modules: [],
                startDate: new Date(Date.now() - 10 * 86400000),
                endDate: new Date(Date.now() + 10 * 86400000),
            });
            StudentEnrollment.findOne.mockReturnValue(
                makeChain({
                    _id: "e1",
                    studentId: { _id: validId, name: "Anna", personalNumber: "1" },
                    completedComponents: new Map(),
                })
            );
            TeacherScheduleParameters.findOne.mockResolvedValue(null);
            User.findById.mockReturnValue(
                makeChain({ _id: validId, lastLoginAt: null }).select()
            );
            AssignmentSubmission.findOne.mockReturnValue(
                makeChain({
                    submittedAt: new Date(Date.now() - 86400000),
                })
            );

            const result = await calculateActivityStatus({
                studentId: validId,
                courseInstanceId: validId,
            });

            expect(result.studentActivity.lastActivity.type).toBe("submission");
            expect(result.studentActivity.lastActivity.daysAgo).toBe(1);
            expect(result.overallStatus).toBe("completed");
        });

        it("prefers login when the user has logged in", async () => {
            CourseInstance.findById.mockResolvedValue({
                _id: validId,
                courseName: "Kemi 1",
                modules: makeModules(2),
                startDate: new Date(Date.now() - 10 * 86400000),
                endDate: new Date(Date.now() + 10 * 86400000),
            });
            StudentEnrollment.findOne.mockReturnValue(
                makeChain({
                    _id: "e1",
                    studentId: { _id: validId, name: "Anna", personalNumber: "1" },
                    completedComponents: new Map([[1, "✓"]]),
                })
            );
            TeacherScheduleParameters.findOne.mockResolvedValue(null);
            User.findById.mockReturnValue(
                makeChain({
                    _id: validId,
                    lastLoginAt: new Date(Date.now() - 5 * 86400000),
                }).select()
            );
            AssignmentSubmission.findOne.mockReturnValue(
                makeChain({
                    submittedAt: new Date(Date.now() - 1 * 86400000),
                })
            );

            const result = await calculateActivityStatus({
                studentId: validId,
                courseInstanceId: validId,
            });

            expect(result.studentActivity.lastActivity.type).toBe("login");
            expect(result.studentActivity.lastActivity.daysAgo).toBe(5);
        });
    });

    describe("calculateBatchActivityStatus", () => {
        it("returns an error for an invalid instance id", async () => {
            const result = await calculateBatchActivityStatus({
                courseInstanceId: "bad",
            });
            expect(result).toEqual({ error: "Invalid course instance ID" });
        });

        it("returns an error when the instance is missing", async () => {
            CourseInstance.findById.mockResolvedValue(null);
            const result = await calculateBatchActivityStatus({
                courseInstanceId: validId,
            });
            expect(result).toEqual({ error: "Course instance not found" });
        });

        it("calculates status for each enrolled student", async () => {
            CourseInstance.findById.mockResolvedValue({
                _id: validId,
                courseName: "Historia 1",
                modules: makeModules(2),
                startDate: new Date(Date.now() - 10 * 86400000),
                endDate: new Date(Date.now() + 10 * 86400000),
            });
            StudentEnrollment.find.mockReturnValue(
                makeChain([
                    { _id: "e1", studentId: { _id: validId, name: "Anna" } },
                    {
                        _id: "e2",
                        studentId: { _id: "507f1f77bcf86cd799439012", name: "Bertil" },
                    },
                ])
            );
            StudentEnrollment.findOne.mockReturnValue(
                makeChain({
                    _id: "e1",
                    studentId: { _id: validId, name: "Anna", personalNumber: "1" },
                    completedComponents: new Map([[1, "✓"], [2, "✓"]]),
                })
            );
            TeacherScheduleParameters.findOne.mockResolvedValue(null);
            User.findById.mockReturnValue(
                makeChain({ _id: validId, lastLoginAt: null }).select()
            );
            AssignmentSubmission.findOne.mockReturnValue(makeChain(null));

            const result = await calculateBatchActivityStatus({
                courseInstanceId: validId,
            });

            expect(result.success).toBe(true);
            expect(result.totalStudents).toBe(2);
            expect(result.activityResults).toHaveLength(2);
            expect(StudentEnrollment.find).toHaveBeenCalledWith(
                expect.objectContaining({ courseInstanceId: validId })
            );
        });

        it("filters by student ids when provided", async () => {
            CourseInstance.findById.mockResolvedValue({
                _id: validId,
                courseName: "Samhällskunskap 1",
                modules: [],
                startDate: new Date(),
                endDate: new Date(),
            });
            StudentEnrollment.find.mockReturnValue(makeChain([]));

            await calculateBatchActivityStatus({
                courseInstanceId: validId,
                studentIds: [validId],
            });

            expect(StudentEnrollment.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    studentId: { $in: [validId] },
                })
            );
        });
    });
});