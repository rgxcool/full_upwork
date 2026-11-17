import { describe, it, expect } from "vitest";
import {
    APP_TIME_ZONE,
    getDateOnlyRange,
    getTimeZoneOffsetMs,
    parseDateOnly,
    parseSearchDate,
} from "../../src/utils/dateSearch.js";

describe("dateSearch helpers", () => {
    describe("parseDateOnly", () => {
        it("accepts real calendar dates", () => {
            expect(parseDateOnly("2024-01-05")).toMatchObject({
                year: 2024,
                month: 1,
                day: 5,
                dateOnly: "2024-01-05",
            });
            expect(parseDateOnly("2024-02-29")).toMatchObject({
                dateOnly: "2024-02-29",
            });
            expect(parseDateOnly(" 2024-12-31 ")).toMatchObject({
                dateOnly: "2024-12-31",
            });
        });

        it("accepts Swedish day-first dates and normalizes them to ISO", () => {
            for (const value of ["17/11/2026", "17.11.2026", "17-11-2026"]) {
                expect(parseDateOnly(value)).toMatchObject({
                    year: 2026,
                    month: 11,
                    day: 17,
                    dateOnly: "2026-11-17",
                });
            }
        });

        it.each([
            "2024-02-30",
            "2023-02-29",
            "2024-13-01",
            "2024-00-10",
            "2024-01-00",
            "2024-1-5",
            "29/02/2026",
            "31/11/2026",
            "17/11.2026",
            "2026/11/17",
            "2026-11",
            "17/11",
            "2026-11-17 - 2026-11-30",
            "not-a-date",
            "",
            null,
            undefined,
            20240105,
        ])("rejects invalid value %p", (value) => {
            expect(parseDateOnly(value)).toBeNull();
        });
    });

    describe("parseSearchDate", () => {
        it("accepts date-only values in every supported format", () => {
            expect(parseSearchDate("2024-01-05")?.dateOnly).toBe("2024-01-05");
            expect(parseSearchDate("05/01/2024")?.dateOnly).toBe("2024-01-05");
            expect(parseSearchDate("05.01.2024")?.dateOnly).toBe("2024-01-05");
            expect(parseSearchDate("05-01-2024")?.dateOnly).toBe("2024-01-05");
        });

        it("accepts a valid ISO timestamp for backwards compatibility", () => {
            expect(parseSearchDate("2024-01-05T12:30:00.000Z")?.dateOnly).toBe(
                "2024-01-05"
            );
        });

        it("rejects invalid timestamps, partial dates, ranges and impossible dates", () => {
            expect(parseSearchDate("2024-01-05Tnot-a-timeZ")).toBeNull();
            expect(parseSearchDate("2024-02-30T12:00:00.000Z")).toBeNull();
            expect(parseSearchDate("2024-01")).toBeNull();
            expect(parseSearchDate("05/01")).toBeNull();
            expect(parseSearchDate("2024-01-05 - 2024-01-10")).toBeNull();
        });
    });

    describe("getDateOnlyRange", () => {
        it("builds a winter day in the application timezone", () => {
            const range = getDateOnlyRange("2026-01-15");

            expect(APP_TIME_ZONE).toBe("Europe/Stockholm");
            expect(range?.startOfDay.toISOString()).toBe(
                "2026-01-14T23:00:00.000Z"
            );
            expect(range?.endOfDay.toISOString()).toBe(
                "2026-01-15T22:59:59.999Z"
            );
        });

        it("builds a summer day in the application timezone", () => {
            const range = getDateOnlyRange("2026-07-15");

            expect(range?.startOfDay.toISOString()).toBe(
                "2026-07-14T22:00:00.000Z"
            );
            expect(range?.endOfDay.toISOString()).toBe(
                "2026-07-15T21:59:59.999Z"
            );
        });

        it("handles the spring DST transition (23-hour day)", () => {
            const range = getDateOnlyRange("2026-03-29");

            expect(range?.startOfDay.toISOString()).toBe(
                "2026-03-28T23:00:00.000Z"
            );
            expect(range?.endOfDay.toISOString()).toBe(
                "2026-03-29T21:59:59.999Z"
            );
            expect(
                range.endOfDay.getTime() - range.startOfDay.getTime() + 1
            ).toBe(23 * 60 * 60 * 1000);
        });

        it("handles the autumn DST transition (25-hour day)", () => {
            const range = getDateOnlyRange("2026-10-25");

            expect(range?.startOfDay.toISOString()).toBe(
                "2026-10-24T22:00:00.000Z"
            );
            expect(range?.endOfDay.toISOString()).toBe(
                "2026-10-25T22:59:59.999Z"
            );
            expect(
                range.endOfDay.getTime() - range.startOfDay.getTime() + 1
            ).toBe(25 * 60 * 60 * 1000);
        });

        it("accepts an explicit timezone", () => {
            const range = getDateOnlyRange("2026-01-15", "UTC");

            expect(range?.startOfDay.toISOString()).toBe(
                "2026-01-15T00:00:00.000Z"
            );
            expect(range?.endOfDay.toISOString()).toBe(
                "2026-01-15T23:59:59.999Z"
            );
        });

        it("returns null for invalid dates", () => {
            expect(getDateOnlyRange("2024-02-30")).toBeNull();
        });
    });

    describe("getTimeZoneOffsetMs", () => {
        it("returns the offset at the given instant", () => {
            expect(
                getTimeZoneOffsetMs(
                    new Date("2026-01-15T12:00:00.000Z"),
                    "Europe/Stockholm"
                )
            ).toBe(60 * 60 * 1000);
            expect(
                getTimeZoneOffsetMs(
                    new Date("2026-07-15T12:00:00.000Z"),
                    "Europe/Stockholm"
                )
            ).toBe(120 * 60 * 1000);
        });
    });
});
