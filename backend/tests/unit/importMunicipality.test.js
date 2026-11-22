import { describe, expect, it } from "vitest";
import { getClosestMunicipality } from "../../src/controllers/studentController.js";
import { ALL_MUNICIPALITIES } from "../../src/config/municipalities.js";

// The Alvis XLSX import resolves the KOMMUN column with getClosestMunicipality.
// It must accept every municipality the Student model accepts (incl. Stockholm).
describe("Alvis import municipality matching", () => {
    it("accepts Stockholm (previously rejected as 'Could not match municipality')", () => {
        expect(getClosestMunicipality("Stockholm")).toBe("Stockholm");
        expect(getClosestMunicipality("stockholm")).toBe("Stockholm");
    });

    it("accepts every canonical municipality exactly", () => {
        for (const name of ALL_MUNICIPALITIES) {
            expect(getClosestMunicipality(name)).toBe(name);
        }
    });

    it("still rejects clearly unknown municipalities", () => {
        // Note: matching is fuzzy (edit distance <= 4), so near names such as
        // "Kiruna" resolve to "Sigtuna"; only distant names are rejected.
        expect(getClosestMunicipality("Haparanda")).toBeNull();
    });
});
