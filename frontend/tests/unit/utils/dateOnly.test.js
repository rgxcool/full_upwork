import { describe, it, expect } from "vitest";
import { isDateOnly, toDateOnly } from "../../../src/utils/dateOnly.js";

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

    it.each(["", null, undefined, "not-a-date", "2024-02-30", "2024-13-01"])(
        "returns an empty string for invalid value %p",
        (value) => {
            expect(toDateOnly(value)).toBe("");
        }
    );

    it("identifies date-only strings", () => {
        expect(isDateOnly("2026-03-15")).toBe(true);
        expect(isDateOnly("2026-3-15")).toBe(false);
        expect(isDateOnly("2026-03-15T10:00:00Z")).toBe(false);
    });
});
