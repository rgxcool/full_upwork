import { describe, it, expect } from "vitest";
import { summariseEnrollmentDates, applyEnrollmentDateSummary } from "../../src/utils/studentDateSummary.js";

const d = (iso) => new Date(`${iso}T12:00:00.000Z`);

describe("summariseEnrollmentDates", () => {
    it("returns nulls for no enrollments or bad input", () => {
        const empty = { startDate: null, endDate: null, finalExamDate: null };
        expect(summariseEnrollmentDates([])).toEqual(empty);
        expect(summariseEnrollmentDates(undefined)).toEqual(empty);
        expect(summariseEnrollmentDates([null])).toEqual(empty);
    });

    it("ignores missing and invalid dates per field", () => {
        const r = summariseEnrollmentDates([
            { status: "active", startDate: d("2026-11-02"), endDate: "not a date" },
        ]);
        expect(r.startDate).toEqual(d("2026-11-02"));
        expect(r.endDate).toBeNull();
        expect(r.finalExamDate).toBeNull();
    });

    it("prefers non-dropped enrollments over dropped ones", () => {
        const r = summariseEnrollmentDates([
            { status: "dropped", startDate: d("2026-01-05"), endDate: d("2027-06-01"), slutprovDate: d("2027-05-26") },
            { status: "completed", startDate: d("2026-03-02"), endDate: d("2026-05-11"), slutprovDate: d("2026-05-06") },
        ]);
        expect(r).toEqual({ startDate: d("2026-03-02"), endDate: d("2026-05-11"), finalExamDate: d("2026-05-06") });
    });
});

describe("applyEnrollmentDateSummary", () => {
    it("overwrites only the fields an enrollment provides", () => {
        const student = { startDate: d("2026-08-17"), endDate: d("2026-12-18"), finalExamDate: d("2026-12-16") };
        applyEnrollmentDateSummary(student, [{ status: "active", startDate: d("2026-11-02"), endDate: d("2027-01-11") }]);
        expect(student).toEqual({ startDate: d("2026-11-02"), endDate: d("2027-01-11"), finalExamDate: d("2026-12-16") });
    });
});
