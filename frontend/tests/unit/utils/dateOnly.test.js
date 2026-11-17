import { describe, it, expect } from "vitest";
import {
    addDays,
    addWeeks,
    getNextMonday,
    isDateOnly,
    isPartialDate,
    toDateOnly,
} from "../../../src/utils/dateOnly.js";

describe("toDateOnly", () => {
    it("keeps the local calendar date selected in the date picker", () => {
        const selected = new Date(2026, 2, 15);
        expect(toDateOnly(selected)).toBe("2026-03-15");
    });

    it("keeps the local date even when the time is late in the day", () => {
        expect(toDateOnly(new Date(2026, 2, 15, 23, 59, 59))).toBe(
            "2026-03-15"
        );
    });

    it("accepts a timestamp in milliseconds", () => {
        const selected = new Date(2026, 2, 15);
        expect(toDateOnly(selected.getTime())).toBe("2026-03-15");
    });

    it("preserves date-only strings", () => {
        expect(toDateOnly("2026-03-15")).toBe("2026-03-15");
        expect(toDateOnly("2024-02-29")).toBe("2024-02-29");
    });

    it("parses ISO strings using the local calendar day", () => {
        const iso = new Date(2026, 2, 15, 12, 0, 0).toISOString();
        expect(toDateOnly(iso)).toBe("2026-03-15");
    });

    it("accepts Swedish day-first dates and normalizes them to ISO", () => {
        for (const value of ["17/11/2026", "17.11.2026", "17-11-2026"]) {
            expect(toDateOnly(value)).toBe("2026-11-17");
        }
    });

    it.each([
        "",
        null,
        undefined,
        "not-a-date",
        "2024-02-30",
        "2024-13-01",
        "29/02/2026",
        "31/11/2026",
        "2026-11",
        "17/11",
        "17/11.2026",
    ])("returns an empty string for invalid value %p", (value) => {
        expect(toDateOnly(value)).toBe("");
    });

    it("identifies date-only strings", () => {
        expect(isDateOnly("2026-03-15")).toBe(true);
        expect(isDateOnly("17/11/2026")).toBe(true);
        expect(isDateOnly("17.11.2026")).toBe(true);
        expect(isDateOnly("2026-3-15")).toBe(false);
        expect(isDateOnly("17/11.2026")).toBe(false);
        expect(isDateOnly("2026-03-15T10:00:00Z")).toBe(false);
    });

    it("identifies partial dates without treating full dates as partial", () => {
        expect(isPartialDate("2026-11")).toBe(true);
        expect(isPartialDate("17/11")).toBe(true);
        expect(isPartialDate("17.11")).toBe(true);
        expect(isPartialDate("2026/11")).toBe(true);
        expect(isPartialDate("2026-11-17")).toBe(false);
        expect(isPartialDate("17/11/2026")).toBe(false);
        expect(isPartialDate("not-a-date")).toBe(false);
    });
});

describe("date-only arithmetic", () => {
    it("adds days without shifting the calendar date", () => {
        expect(addDays("2026-11-16", 35)).toBe("2026-12-21");
        expect(addDays("2026-03-23", 14)).toBe("2026-04-06");
    });

    it("adds weeks across a daylight-saving transition", () => {
        // Swedish DST starts 2026-03-29; a local-midnight Date + toISOString
        // calculation would drift here.
        expect(addWeeks("2026-03-23", 1)).toBe("2026-03-30");
    });

    it.each(["", null, undefined, "not-a-date", "2024-02-30"])(
        "returns an empty string for invalid value %p",
        (value) => {
            expect(addDays(value, 7)).toBe("");
            expect(addWeeks(value, 1)).toBe("");
        }
    );

    it("returns the next Monday on or after the given day", () => {
        // Friday 2026-11-13 -> Monday 2026-11-16
        expect(getNextMonday(new Date(2026, 10, 13))).toBe("2026-11-16");
        // Sunday 2026-11-15 -> Monday 2026-11-16
        expect(getNextMonday(new Date(2026, 10, 15))).toBe("2026-11-16");
        // Monday stays the same day
        expect(getNextMonday(new Date(2026, 10, 16))).toBe("2026-11-16");
    });

    it("accepts a date-only value for the Monday helper", () => {
        expect(getNextMonday("2026-11-15")).toBe("2026-11-16");
        expect(getNextMonday("2026-11-16")).toBe("2026-11-16");
    });
});
