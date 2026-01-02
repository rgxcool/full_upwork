import {
    cleanCourseName,
    normalizeCodeForMatching,
    parseStudentExcel,
} from "../../src/utils/parseStudentExcel.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sampleWorkbookPath = path.resolve(
    __dirname,
    "../../docs/test_mindful.xlsx"
);

describe("parseStudentExcel utilities", () => {
    let students;

    beforeAll(async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        const buffer = await fs.readFile(sampleWorkbookPath);
        students = await parseStudentExcel(buffer, "Global Fallback");
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("cleans course names and removes week suffixes", () => {
        expect(cleanCourseName("Course (Rev) mot extra")).toBe("Course extra");
        expect(cleanCourseName(null)).toBe("");
        expect(normalizeCodeForMatching(" package-12v ")).toBe("PACKAGE");
        expect(normalizeCodeForMatching("")).toBe("");
    });

    it("parses the provided Excel sample", () => {
        expect(students).toHaveLength(34);
        const [siba, nataliia] = students;

        expect(siba).toMatchObject({
            name: "Al Bakour, Siba",
            personalNumber: "20020101-5385",
            municipality: { type: "Botkyrka" },
            phone: "073-907 20 21",
            email: "siba.albakour@gmail.com",
            teacher: "Allan",
            dropout: false,
            aplStatus: "GRAY",
        });

        expect(siba.education).toEqual([
            {
                type: "Course",
                name: "SVEA1000X",
                startDate: "2025-12-22T00:00:00.000Z",
                endDate: "2026-01-23T00:00:00.000Z",
                slutprovDate: null,
            },
        ]);

        expect(nataliia).toMatchObject({
            name: "Wozniak, Nataliia",
            personalNumber: "19790618-6064",
            teacher: "Allan",
        });
        expect(nataliia.education[0].name).toBe("SVEN1000X");
    });
});
