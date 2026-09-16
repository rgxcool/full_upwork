import { describe, it, expect } from "vitest";
import {
    computeAplPeriod,
    computeAplEffectiveStatus,
    computeAplBehindSchedule,
    computeAplFullStatus,
} from "../../src/utils/aplAutoStatus.js";

describe("aplAutoStatus", () => {
    describe("computeAplPeriod", () => {
        it("returns null dates when no CoursePackage entries exist", () => {
            const result = computeAplPeriod([]);
            expect(result.aplStartDate).toBeNull();
            expect(result.aplEndDate).toBeNull();
        });

        it("computes start and end from CoursePackage entries", () => {
            const result = computeAplPeriod([
                { type: "CoursePackage", startDate: "2025-01-13", endDate: "2025-06-13" },
            ]);
            expect(result.aplStartDate).toEqual(new Date("2025-01-13"));
            expect(result.aplEndDate).toEqual(new Date("2025-06-13"));
        });
    });

    describe("computeAplFullStatus", () => {
        it("combines effective status and behind-schedule flag", () => {
            const result = computeAplFullStatus(
                "GREEN",
                "2025-06-13",
                [{ type: "CoursePackage", startDate: "2025-01-13" }],
                new Date("2025-06-01")
            );
            expect(result.aplStatus).toBe("RED");
            expect(result.aplAutoRed).toBe(true);
            expect(result.aplBehindSchedule).toBe(true);
        });
    });

    describe("computeAplBehindSchedule", () => {
        it("flags behind schedule when enough days have elapsed", () => {
            const result = computeAplBehindSchedule(
                [{ type: "CoursePackage", startDate: "2025-01-01" }],
                new Date("2025-06-01")
            );
            expect(result.aplBehindSchedule).toBe(true);
            expect(result.aplPeriodStart).toEqual(new Date("2025-01-01"));
        });
    });
});
