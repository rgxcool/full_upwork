import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import ExcelJS from "exceljs";
import { anonymizeWorkbook, dummyStudent } from "../../scripts/anonymizeStudentWorkbook.js";

const HEADERS = ["StuderandeID", "NAMN", "PERSONNUMMER", "START", "SLUT", "KURS/PAKET", "KOMMUN/PRIVAT", "TELEFON", "MAIL", "ÖVRIGT", "Lärare"];
// Stand-ins for the "real" input. Obviously fake, but distinct so leaks are detectable.
const INPUT_ROWS = [
    [111, "Original, Person Ett", "19850505-1111", new Date(2026, 0, 5), new Date(2026, 1, 9), "SVEA1000X", "Sollentuna", "073-111 11 11", "ett@input.invalid", "Känslig anteckning", "Lärare A"],
    [222, "Original, Person Två", "19860606-2222", new Date(2026, 2, 2), new Date(2026, 3, 6), "MATMAT01a", "KCNO", "073-222 22 22", "tva@input.invalid", "", "Lärare B"],
];

let dir;
let input;
let output;

beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "anon-"));
    input = path.join(dir, "real.xlsx");
    output = path.join(dir, "dummy.xlsx");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Original Author";
    const ws = wb.addWorksheet("Elever");
    ws.addRow(HEADERS);
    INPUT_ROWS.forEach((r) => ws.addRow(r));
    await wb.xlsx.writeFile(input);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const readRows = async (file) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const rows = [];
    wb.worksheets[0].eachRow((row, i) => {
        if (i > 1) rows.push(HEADERS.map((_, c) => row.getCell(c + 1).text));
    });
    return { wb, rows };
};

describe("scripts/anonymizeStudentWorkbook", () => {
    it("replaces every personal field and keeps dates, course, kommun and teacher", async () => {
        const result = await anonymizeWorkbook(input, output);
        expect(result).toEqual({ students: 2, notes: 1 });

        const { wb, rows } = await readRows(output);
        const { rows: original } = await readRows(input);
        const allText = rows.flat().join("\n");
        for (const secret of ["Original", "19850505", "19860606", "073-", "input.invalid", "Känslig"]) {
            expect(allText).not.toContain(secret);
        }
        expect(wb.creator).not.toBe("Original Author");

        rows.forEach((row, i) => {
            const fake = dummyStudent(i + 1);
            expect(row[1]).toBe(fake.name);
            expect(row[2]).toBe(fake.personnummer);
            expect(row[2]).toMatch(/^1900\d{4}-\d{4}$/);
            expect(row[8]).toBe(fake.email);
            // START, SLUT, KURS/PAKET, KOMMUN, Lärare unchanged
            for (const c of [3, 4, 5, 6, 10]) expect(row[c]).toBe(original[i][c]);
        });
        expect(rows[1][9]).toBe(""); // empty ÖVRIGT stays empty
    });

    it("refuses to overwrite the input or guess unknown columns", async () => {
        await expect(anonymizeWorkbook(input, input)).rejects.toThrow(/different file/);

        const wb = new ExcelJS.Workbook();
        wb.addWorksheet("Elever").addRow(["Namn", "Något annat"]);
        const odd = path.join(dir, "odd.xlsx");
        await wb.xlsx.writeFile(odd);
        await expect(anonymizeWorkbook(odd, output)).rejects.toThrow(/Unexpected header/);
        expect(fs.existsSync(output)).toBe(false);
    });
});
