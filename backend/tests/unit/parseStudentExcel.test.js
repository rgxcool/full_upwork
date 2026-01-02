import ExcelJS from "exceljs";
import {
    cleanCourseName,
    normalizeCodeForMatching,
    parseStudentExcel,
} from "../../src/utils/parseStudentExcel.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const headerOrder = [
    "NAMN",
    "PERSONNUMMER",
    "KURS/PAKET",
    "START",
    "SLUT",
    "PREL. DATUM SLUTPROV",
    "KOMMUN/PRIVAT",
    "TELEFON",
    "MAIL",
    "PROV",
    "ÖVRIGT",
    "PROGRAM",
    "Lärare",
];

const testWorkbookPath = path.resolve(
    fileURLToPath(new URL("../../docs/test_mindful.xlsx", import.meta.url))
);

const fillRow = (worksheet, rowNumber, values = {}, styleOverrides = {}) => {
    const row = worksheet.getRow(rowNumber);
    headerOrder.forEach((header, index) => {
        const columnIndex = index + 1;
        const value = values[header];
        if (value !== undefined) {
            row.getCell(columnIndex).value = value;
        }
        const style = styleOverrides[header];
        if (style) {
            row.getCell(columnIndex).value = value;
            if (style.fill) {
                row.getCell(columnIndex).fill = style.fill;
            }
        }
    });
};

const buildWorkbookBuffer = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheets");
    const headerRow = worksheet.getRow(1);
    headerOrder.forEach((header, index) => {
        headerRow.getCell(index + 1).value = header;
    });

    fillRow(
        worksheet,
        2,
        {
            NAMN: "Red Student",
            PERSONNUMMER: " 20000101 ",
            "KURS/PAKET": "Alpha (Rev)",
            START: new Date("2025-11-01T00:00:00.000Z"),
            SLUT: new Date("2025-12-01T00:00:00.000Z"),
            "PREL. DATUM SLUTPROV": new Date("2025-12-15T00:00:00.000Z"),
            "KOMMUN/PRIVAT": "Metro",
            TELEFON: "010 111 222",
            MAIL: " red@example.com ",
            PROV: "Speech",
            ÖVRIGT: "Notes",
            PROGRAM: "Program (Example)",
            Lärare: "Local Teacher",
        },
        {
            NAMN: {
                fill: {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FFFF0000" },
                },
            },
        }
    );

    fillRow(worksheet, 3, {
        NAMN: "Array Student",
        PERSONNUMMER: " 20000202 ",
        "KURS/PAKET": ["Array One", "Second Array"],
        START: 45000,
        SLUT: 45030,
        "KOMMUN/PRIVAT": "ArrayTown",
        MAIL: "arr@example.com",
    });

    fillRow(worksheet, 4, {
        NAMN: "Object Student",
        PERSONNUMMER: " 20000303 ",
        "KURS/PAKET": { text: "Object Course" },
        START: "invalid date",
        SLUT: null,
        "PREL. DATUM SLUTPROV": null,
        "KOMMUN/PRIVAT": "ObjCity",
        MAIL: { text: " obj@example.com " },
    });

    fillRow(worksheet, 5, {
        NAMN: "Fallback Student",
        PERSONNUMMER: " 20000404 ",
        "KOMMUN/PRIVAT": "FallbackCity",
        MAIL: "fallback@example.com",
    });

    for (let row = 6; row <= 27; row++) {
        worksheet.getRow(row).values = [];
    }

    return workbook.xlsx.writeBuffer();
};

describe("parseStudentExcel utilities", () => {
    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("cleans helpers and handles special Excel rows", async () => {
        expect(cleanCourseName("Course (Rev) mot extra")).toBe("Course extra");
        expect(cleanCourseName(null)).toBe("");
        expect(normalizeCodeForMatching(" package-12v ")).toBe("PACKAGE");
        expect(normalizeCodeForMatching("")).toBe("");

        const buffer = await buildWorkbookBuffer();
        const students = await parseStudentExcel(buffer, "Fallback Teacher");

        expect(students).toHaveLength(4);

        const [red, array, object, fallback] = students;

        expect(red).toMatchObject({
            name: "Red Student",
            personalNumber: "20000101",
            municipality: { type: "Metro" },
            phone: "010 111 222",
            email: "red@example.com",
            exam: "Speech",
            additionalInfo: "Notes",
            teacher: "Local Teacher",
            dropout: true,
            aplStatus: "GRAY",
        });
        expect(red.education[0]).toMatchObject({
            type: "Program",
            name: "Program",
        });

        const numericStart = new Date((45000 - 25569) * 86400 * 1000).toISOString();
        expect(array.startDate).toBe(numericStart);
        expect(array.education).toHaveLength(1);
        expect(array.education[0].name).toBe("[\"ARRAY ONE\"\"SECOND ARRAY\"]");

        expect(object.email).toBe("{\"text\":\" obj@example.com \"}");
        expect(object.startDate).toBeNull();

        expect(fallback.education).toEqual([
            { type: "Course", name: "SE STUDIEPLAN" },
        ]);
        expect(fallback.teacher).toBe("Fallback Teacher");
    });

    it("parses the real Excel sample and trims its fields", async () => {
        const buffer = await readFile(testWorkbookPath);
        const students = await parseStudentExcel(buffer, "Fallback Teacher");

        expect(students).toHaveLength(34);
        const [first] = students;
        expect(first).toMatchObject({
            name: "Al Bakour, Siba",
            personalNumber: "20020101-5385",
            municipality: { type: "Botkyrka" },
            phone: "073-907 20 21",
            email: "siba.albakour@gmail.com",
            teacher: "Allan",
            dropout: false,
        });
        expect(first.education[0].name).toBe("SVEA1000X");
    });

    it("stops parsing after twenty consecutive empty rows", async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Sheets");

        const headerRow = worksheet.getRow(1);
        headerOrder.forEach((header, index) => {
            headerRow.getCell(index + 1).value = header;
        });

        fillRow(worksheet, 2, {
            NAMN: "Empty Start",
            PERSONNUMMER: " 11111111 ",
            "KURS/PAKET": "STOP1000",
            START: new Date("2025-01-01T00:00:00.000Z"),
            SLUT: new Date("2025-02-01T00:00:00.000Z"),
            "KOMMUN/PRIVAT": "StartTown",
        });
        fillRow(worksheet, 3, {
            NAMN: "Empty Mid",
            PERSONNUMMER: " 22222222 ",
            "KURS/PAKET": "STOP2000",
            START: new Date("2025-03-01T00:00:00.000Z"),
            SLUT: new Date("2025-04-01T00:00:00.000Z"),
            "KOMMUN/PRIVAT": "MidTown",
        });

        for (let row = 4; row <= 23; row++) {
            worksheet.getRow(row).values = [];
        }

        fillRow(worksheet, 24, {
            NAMN: "Should Skip",
            PERSONNUMMER: " 33333333 ",
            "KURS/PAKET": "SKIP1000",
            START: new Date("2025-05-01T00:00:00.000Z"),
            SLUT: new Date("2025-06-01T00:00:00.000Z"),
            "KOMMUN/PRIVAT": "SkipTown",
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const students = await parseStudentExcel(buffer, "Empty Teacher");

        expect(students).toHaveLength(2);
        expect(students.map((s) => s.name)).toEqual(["Empty Start", "Empty Mid"]);
    });
});
