import { describe, it, expect, vi, afterEach } from "vitest";
import mongoose from "mongoose";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import CourseInstance from "../../src/models/CourseInstance.js";

describe("CourseMatchingService.getCourseStatistics", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("computes totals over the date range and groups by course", async () => {
        const start = new Date("2026-01-01");
        const end = new Date("2026-06-30");

        vi.spyOn(CourseInstance, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    {
                        courseCode: "MAT1",
                        courseName: "Matematik 1",
                        isActive: true,
                        enrollmentCount: 12,
                        completionCount: 9,
                        dropoutCount: 1,
                    },
                    {
                        courseCode: "MAT1",
                        courseName: "Matematik 1",
                        isActive: true,
                        enrollmentCount: 8,
                        completionCount: 6,
                        dropoutCount: 2,
                    },
                    {
                        courseCode: "ENG2",
                        courseName: "Engelska 2",
                        isActive: false,
                        enrollmentCount: 5,
                        completionCount: 0,
                        dropoutCount: 0,
                    },
                ]),
            }),
        });

        const stats = await CourseMatchingService.getCourseStatistics(start, end);

        expect(CourseInstance.find).toHaveBeenCalledWith(
            expect.objectContaining({
                startDate: { $lt: end },
                endDate: { $gt: start },
            })
        );
        expect(stats.totalInstances).toBe(3);
        expect(stats.activeInstances).toBe(2);
        expect(stats.totalEnrollments).toBe(25);
        expect(stats.completions).toBe(15);
        expect(stats.dropouts).toBe(3);
        expect(stats.averageEnrollments).toBe(8.3);
        expect(stats.byCourse.MAT1).toEqual({ total: 2, active: 2, enrollments: 20 });
        expect(stats.byCourse.ENG2).toEqual({ total: 1, active: 0, enrollments: 5 });
    });

    it("applies the courseId (mainCourseId) filter when provided", async () => {
        const courseId = new mongoose.Types.ObjectId();
        vi.spyOn(CourseInstance, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    {
                        courseCode: "KEM1",
                        isActive: true,
                        enrollmentCount: 4,
                        completionCount: 2,
                        dropoutCount: 0,
                    },
                ]),
            }),
        });

        await CourseMatchingService.getCourseStatistics(
            new Date("2026-01-01"),
            new Date("2026-03-31"),
            courseId
        );

        expect(CourseInstance.find).toHaveBeenCalledWith(
            expect.objectContaining({ mainCourseId: courseId })
        );
    });

    it("returns zeroed statistics when there are no instances", async () => {
        vi.spyOn(CourseInstance, "find").mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([]),
            }),
        });

        const stats = await CourseMatchingService.getCourseStatistics(
            new Date("2026-01-01"),
            new Date("2026-03-31")
        );

        expect(stats).toEqual(
            expect.objectContaining({
                totalInstances: 0,
                activeInstances: 0,
                totalEnrollments: 0,
                completions: 0,
                dropouts: 0,
                averageEnrollments: 0,
                byCourse: {},
            })
        );
    });
});
