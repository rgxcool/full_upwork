import { describe, it, expect, vi } from "vitest";

const headerOrder = [
    "NAMN",
    "PERSONNUMMER",
    "KURS/PAKET",
    "START",
    "SLUT",
    "KOMMUN/PRIVAT",
    "PROGRAM",
    "Lärare",
];

const createRow = (data) => {
    const cells = headerOrder.map((header) => ({
        value: data[header],
        style: data[`${header}Style`] || {},
    }));

    return {
        values: [undefined, ...cells.map((cell) => cell.value)],
        eachCell(fn) {
            cells.forEach((cell, index) => {
                if (cell.value !== undefined) {
                    fn(cell, index + 1);
                }
            });
        },
    };
};

const createWorksheet = (rows) => ({
    rowCount: rows.length + 1,
    getRow(rowNumber) {
        if (rowNumber === 1) {
            return {
                values: [undefined, ...headerOrder],
                eachCell() {},
            };
        }
        return rows[rowNumber - 2];
    },
});

const createMockExcel = (rows) => ({
    __esModule: true,
    default: {
        Workbook: class {
            constructor() {
                this.xlsx = {
                    load: async () => {},
                };
                this.worksheets = [createWorksheet(rows)];
            }
        },
    },
});

describe("parseStudentExcel handles array/object inputs", () => {
    it("splits array entries and respects object values", async () => {
        vi.resetModules();

        const rows = [
            createRow({
                NAMN: "Mock Array",
                PERSONNUMMER: "20000101",
                "KURS/PAKET": ["Array One", "Second Array"],
                START: new Date("2025-01-01T00:00:00.000Z"),
                SLUT: new Date("2025-02-01T00:00:00.000Z"),
                "KOMMUN/PRIVAT": "ArrayTown",
            }),
            createRow({
                NAMN: "Mock Object",
                PERSONNUMMER: "20000202",
                "KURS/PAKET": { text: "Object Course" },
                START: new Date("2025-03-01T00:00:00.000Z"),
                SLUT: new Date("2025-04-01T00:00:00.000Z"),
                "KOMMUN/PRIVAT": "ObjectTown",
            }),
        ];

        vi.doMock("exceljs", () => createMockExcel(rows));

        try {
            const { parseStudentExcel } = await import("../../src/utils/parseStudentExcel.js");
            const students = await parseStudentExcel(Buffer.from(""), "Mock Teacher");

            expect(students).toHaveLength(2);
            expect(students[0].education).toHaveLength(2);
            expect(students[0].education[0].name).toBe("ARRAY ONE");
            expect(students[0].education[1].name).toBe("SECOND ARRAY");
            expect(students[1].education).toHaveLength(1);
            expect(students[1].education[0].name).toBe("OBJECT COURSE");
        } finally {
            vi.resetModules();
        }
    });
});
