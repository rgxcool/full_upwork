import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

const { parseContactPdf } = await import("../../src/utils/parseContactPdf.js");

const SAMPLE_PDF_TEXT = `Personnummer
19920315-5566
Namn
Sofia Andersson
Adress
Storgatan 12
123 45 Stockholm
E-postadress
sofia.andersson@mail.se
Telefonnummer
070-123 45 67
Föredragna kontaktsätt
E-post
Telefon
Sökta kurser
1. Matematik 3, 100 poäng
2. 2025-01-13 till 2025-03-14, 9 veckor, Sollentuna, Distans, MAT300
2. Engelska 7, 100 poäng
1. 2025-01-13 till 2025-02-14, 5 veckor, Akalla, Närstudier, ENG700
Totalt antal sökta poäng
200 poäng`;

describe("parseContactPdf", () => {
    it("extracts contact fields from the header block", () => {
        const result = parseContactPdf(SAMPLE_PDF_TEXT);

        expect(result.personnummer).toBe("19920315-5566");
        expect(result.namn).toBe("Sofia Andersson");
        expect(result.adress).toBe("Storgatan 12, 123 45 Stockholm");
        expect(result.email).toBe("sofia.andersson@mail.se");
        expect(result.telefon).toBe("070-123 45 67");
    });

    it("collects preferred contact methods, skipping underline artifacts", () => {
        const result = parseContactPdf(SAMPLE_PDF_TEXT);

        expect(result.föredragna_kontaktsätt).toEqual(["E-post", "Telefon"]);
    });

    it("parses courses with dates, weeks, school, study form and code", () => {
        const result = parseContactPdf(SAMPLE_PDF_TEXT);

        expect(result.kurser).toHaveLength(2);

        const first = result.kurser[0];
        expect(first.namn).toBe("Matematik 3");
        expect(first.poäng).toBe("100");
        expect(first.start).toBe("2025-01-13");
        expect(first.slut).toBe("2025-03-14");
        expect(first.veckor).toBe("9 veckor");
        expect(first.skola).toBe("Sollentuna");
        expect(first.studieform).toBe("Distans");
        expect(first.kod).toBe("MAT300");
    });

    it("sums the total points from parsed courses", () => {
        const result = parseContactPdf(SAMPLE_PDF_TEXT);
        expect(result.totalt_poäng).toBe(200);
    });

    it("skips course detail lines that do not match the details pattern", () => {
        const text =
            "Sökta kurser\n1. Matematik 1, 100 poäng\ninte en detaljrad\n";
        const result = parseContactPdf(text);
        expect(result.kurser).toHaveLength(0);
    });

    it("returns empty result for an empty text", () => {
        const result = parseContactPdf("   ");

        expect(result.namn).toBe("");
        expect(result.kurser).toEqual([]);
        expect(result.totalt_poäng).toBe(0);
    });
});