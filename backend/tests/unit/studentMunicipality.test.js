import { describe, expect, it } from "vitest";
import Student from "../../src/models/Student.js";

describe("Student.municipality shape", () => {
    const build = (municipality) =>
        new Student({
            name: "Testperson Testsson",
            email: "municipality-shape@example.se",
            personalNumber: "19900101-0000",
            ...(municipality === undefined ? {} : { municipality }),
        });

    it("registers municipality as a real sub-document path", () => {
        // `type` is a reserved key in mongoose, so an inline
        // `{ type: { type: String } }` silently became the nested path
        // `municipality.type` and the wrapper was never created (AV-9).
        const path = Student.schema.path("municipality");
        expect(path).toBeDefined();
        expect(path?.schema?.path("type")).toBeDefined();
    });

    it("normalises a plain string into { type }", () => {
        const { type } = build("Stockholm").municipality;
        expect(type).toBe("Stockholm");
    });

    it("keeps an explicit object untouched", () => {
        const { type } = build({ type: "Upplands Bro" }).municipality;
        expect(type).toBe("Upplands Bro");
    });

    it("is undefined when not provided", () => {
        expect(build(undefined).municipality).toBeUndefined();
    });

    it("rejects a municipality outside the canonical list", () => {
        // validateSync() returns the error rather than throwing it.
        const error = build("Banan").validateSync();
        expect(error?.errors?.["municipality.type"]?.message).toMatch(
            /not a valid enum value/
        );
    });

    it("accepts every canonical municipality", async () => {
        const { ALL_MUNICIPALITIES } = await import(
            "../../src/config/municipalities.js"
        );
        for (const municipality of ALL_MUNICIPALITIES) {
            const student = build(municipality);
            expect(student.validateSync()?.errors?.["municipality.type"]).toBeUndefined();
            expect(student.municipality.type).toBe(municipality);
        }
    });
});
