// #103: the before/after check reports what staff would see change per student.
import { describe, it, expect } from "vitest";
import { compareStudent } from "../../scripts/compareStudyPlans.js";

const NOW = new Date("2026-11-23T12:00:00Z");
const C1 = "64b0000000000000000000a1";
const C2 = "64b0000000000000000000a2";
const PKG = "64b0000000000000000000b1";
const course = (refId, start, end, extra = {}) => ({
    type: "Course",
    refId,
    startDate: new Date(start),
    endDate: new Date(end),
    ...extra,
});

describe("compareStudyPlans.compareStudent", () => {
    it("reports nothing when both views agree", () => {
        const legacy = [course(C1, "2026-01-12", "2026-03-20", { grade: "C" })];
        const plan = [course({ _id: C1 }, "2026-01-12", "2026-03-20", { grade: "C" })];
        expect(compareStudent(legacy, plan, NOW)).toEqual([]);
    });

    it("reports courses only in one view and ignores removed legacy entries", () => {
        const legacy = [
            course(C1, "2026-01-12", "2026-03-20"),
            course(C2, "2026-01-12", "2026-03-20", { removedAt: new Date("2026-02-01") }),
        ];
        const plan = [course(C2, "2026-04-06", "2026-06-12")];
        expect(compareStudent(legacy, plan, NOW)).toEqual([
            `only in legacy: course ${C1}@2026-01-12`,
            `only in enrollments: course ${C2}@2026-04-06`,
            `waiting for a grade: [${C1}@2026-01-12] → [${C2}@2026-04-06]`,
        ]);
    });

    it("reports a changed APL period", () => {
        const legacy = [{ type: "CoursePackage", refId: PKG, startDate: new Date("2026-08-17"), endDate: new Date("2026-12-18") }];
        const plan = [{ type: "CoursePackage", refId: PKG, startDate: new Date("2026-08-17"), endDate: new Date("2026-09-21") }];
        expect(compareStudent(legacy, plan, NOW)).toEqual(["APL period 2026-08-17–2026-12-18 → 2026-08-17–2026-09-21"]);
    });
});
