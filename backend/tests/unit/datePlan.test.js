import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import TeacherScheduleParameters from "../../src/models/TeacherScheduleParameters.js";
import {
    DEFAULT_SECTION_OFFSETS,
    formatDateOnly,
    generateDatePlan,
    nearestPlanLength,
    resolveSectionOffsets,
    toUtcCalendarDate,
} from "../../src/utils/datePlan.js";

const dates = (plan) => plan.sectionDates.map(formatDateOnly);
const modules = (plan) =>
    plan.moduleDates.map((m) => [
        formatDateOnly(m.startDate),
        formatDateOnly(m.endDate),
    ]);

describe("datePlan", () => {
    describe("resolveSectionOffsets", () => {
        it("uses evenly spaced defaults for each supported length", () => {
            expect(resolveSectionOffsets(5)).toEqual({
                offsets: [0, 1, 2, 3, 4],
                source: "default",
            });
            expect(resolveSectionOffsets(10)).toEqual({
                offsets: [0, 2, 4, 6, 8],
                source: "default",
            });
            expect(resolveSectionOffsets(20)).toEqual({
                offsets: [0, 4, 8, 12, 16],
                source: "default",
            });
            expect(DEFAULT_SECTION_OFFSETS[10]).toEqual([0, 2, 4, 6, 8]);
        });

        it("uses saved offsets when they are valid", () => {
            const saved = [1, 3, 5, 7, 9];
            const result = resolveSectionOffsets(10, saved);
            expect(result).toEqual({ offsets: saved, source: "saved" });
            expect(result.offsets).not.toBe(saved);
        });

        it("falls back to defaults for incomplete or invalid saved offsets", () => {
            expect(resolveSectionOffsets(5, [0, 1]).source).toBe("default");
            expect(resolveSectionOffsets(5, [0, 1, 2, 3, -1]).source).toBe("default");
            expect(resolveSectionOffsets(5, "0,1,2,3,4").source).toBe("default");
        });

        it("rejects unsupported course lengths", () => {
            expect(() => resolveSectionOffsets(7)).toThrow(
                "lengthWeeks must be 5, 10 or 20"
            );
        });
    });

    describe("generateDatePlan", () => {
        it("generates a 5-week plan with one section per week", () => {
            const plan = generateDatePlan({
                startDate: "2026-11-16",
                lengthWeeks: 5,
            });

            expect(plan.lengthWeeks).toBe(5);
            expect(plan.source).toBe("default");
            expect(dates(plan)).toEqual([
                "2026-11-16",
                "2026-11-23",
                "2026-11-30",
                "2026-12-07",
                "2026-12-14",
            ]);
            expect(modules(plan)).toEqual([
                ["2026-11-16", "2026-11-23"],
                ["2026-11-23", "2026-11-30"],
                ["2026-11-30", "2026-12-07"],
                ["2026-12-07", "2026-12-14"],
                ["2026-12-14", "2026-12-21"],
            ]);
        });

        it("generates a 10-week plan with sections every other week", () => {
            const plan = generateDatePlan({
                startDate: "2026-11-16",
                lengthWeeks: 10,
            });

            expect(dates(plan)).toEqual([
                "2026-11-16",
                "2026-11-30",
                "2026-12-14",
                "2026-12-28",
                "2027-01-11",
            ]);
            expect(modules(plan)).toEqual([
                ["2026-11-16", "2026-11-30"],
                ["2026-11-30", "2026-12-14"],
                ["2026-12-14", "2026-12-28"],
                ["2026-12-28", "2027-01-11"],
                ["2027-01-11", "2027-01-25"],
            ]);
        });

        it("generates a 20-week plan with sections every four weeks", () => {
            const plan = generateDatePlan({
                startDate: "2026-11-16",
                lengthWeeks: 20,
            });

            expect(dates(plan)).toEqual([
                "2026-11-16",
                "2026-12-14",
                "2027-01-11",
                "2027-02-08",
                "2027-03-08",
            ]);
            expect(formatDateOnly(plan.endDate)).toBe("2027-04-05");
        });

        it("uses teacher offsets and the given end date for the final module", () => {
            const plan = generateDatePlan({
                startDate: "17/11/2026",
                endDate: "2026-12-18",
                lengthWeeks: 10,
                sectionOffsets: [0, 1, 2, 3, 4],
            });

            expect(plan.source).toBe("saved");
            expect(dates(plan)).toEqual([
                "2026-11-17",
                "2026-11-24",
                "2026-12-01",
                "2026-12-08",
                "2026-12-15",
            ]);
            expect(modules(plan).at(-1)).toEqual([
                "2026-12-15",
                "2026-12-18",
            ]);
        });

        it("dates only as many modules as requested", () => {
            const plan = generateDatePlan({
                startDate: "2026-11-16",
                lengthWeeks: 5,
                moduleCount: 3,
            });

            expect(plan.sectionDates).toHaveLength(5);
            expect(plan.moduleDates).toHaveLength(3);
        });

        it("divides each module slot evenly by its Avsnitt count", () => {
            const plan = generateDatePlan({
                startDate: "2026-11-16",
                lengthWeeks: 10,
                avsnittCounts: [2, 1, 0, 2],
            });

            expect(plan.avsnittDates.map((dates) => dates.map(formatDateOnly))).toEqual([
                ["2026-11-16", "2026-11-23"],
                ["2026-11-30"],
                [],
                ["2026-12-28", "2027-01-04"],
                [],
            ]);
        });

        it("returns empty Avsnitt dates when no counts are supplied", () => {
            const plan = generateDatePlan({ startDate: "2026-11-16", lengthWeeks: 5 });

            expect(plan.avsnittDates).toEqual([[], [], [], [], []]);
        });

        it("returns null for an invalid start or an end before the start", () => {
            expect(
                generateDatePlan({ startDate: "not-a-date", lengthWeeks: 5 })
            ).toBeNull();
            expect(
                generateDatePlan({
                    startDate: "2026-11-16",
                    endDate: "2026-11-15",
                    lengthWeeks: 5,
                })
            ).toBeNull();
        });
    });

    describe("nearestPlanLength", () => {
        it("maps a course span to the closest supported length", () => {
            expect(nearestPlanLength("2026-11-16", "2026-12-18")).toBe(5);
            expect(nearestPlanLength("2026-11-16", "2027-01-25")).toBe(10);
            expect(nearestPlanLength("2026-11-16", "2027-04-05")).toBe(20);
        });

        it("returns null for invalid ranges", () => {
            expect(nearestPlanLength("2026-11-16", "2026-11-15")).toBeNull();
            expect(nearestPlanLength("bad", "2026-12-18")).toBeNull();
        });
    });

    it("normalizes a Date to UTC midnight without shifting its calendar day", () => {
        const local = new Date(2026, 10, 17, 23, 30);
        expect(formatDateOnly(toUtcCalendarDate(local))).toBe("2026-11-17");
    });

    it("shares the offset defaults with the schedule parameter model", () => {
        const params = new TeacherScheduleParameters({
            teacherId: new mongoose.Types.ObjectId(),
            courseId: "course-1",
            lengthWeeks: 20,
        });
        expect(params.getSectionOffsets()).toEqual([0, 4, 8, 12, 16]);

        params.sectionOffsets = [0, 1, 2, 3, 4];
        expect(params.getSectionOffsets()).toEqual([0, 1, 2, 3, 4]);
    });
});
