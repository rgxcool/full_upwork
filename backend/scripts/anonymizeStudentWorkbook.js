// Makes a dummy copy of a student import workbook (the "Elever" sheet used by
// importStudents.js): every student gets a fake ID, name, personnummer, phone,
// email and ÖVRIGT note, while START/SLUT, KURS/PAKET, KOMMUN and Lärare are kept,
// so the copy behaves like the real file without containing anyone's data.
// It never prints cell values.
//
// Usage (from backend/):
//   node scripts/anonymizeStudentWorkbook.js <real.xlsx> <dummy.xlsx>
//   node scripts/anonymizeStudentWorkbook.js ../data/test_mindful_CLEAN.xlsx ../data/test_mindful.xlsx
//   (data/test_mindful.xlsx and backend/docs/test_mindful.xlsx are dummy copies made this way)
import path from "path";
import ExcelJS from "exceljs";

// Column numbers in the "Elever" sheet (row 1 is the header).
const COL = { id: 1, name: 2, personnummer: 3, phone: 8, email: 9, other: 10 };
const EXPECTED_HEADERS = { 1: "StuderandeID", 2: "NAMN", 3: "PERSONNUMMER", 8: "TELEFON", 9: "MAIL", 10: "ÖVRIGT" };

const FIRST_NAMES = [
    "Anna", "Erik", "Sara", "Ali", "Maria", "Johan", "Fatima", "Karl", "Elin", "Omar",
    "Lina", "Ahmed", "Emma", "Mohammed", "Sofia", "Hassan", "Ida", "Yusuf", "Klara", "Amir",
];
const LAST_NAMES = ["Testsson", "Provberg", "Exempeldal", "Övningsson", "Fiktivström", "Dummysson", "Låtsasberg"];
const NOTES = ["Behov av stöd", "Extra skrivtid", "Sitta enskilt vid prov", "Testanteckning"];

/** Fake data for the n-th student (1-based). Deterministic, so re-runs give the same file. */
export function dummyStudent(n) {
    const nn = String(n).padStart(2, "0");
    const month = String(((n - 1) % 12) + 1).padStart(2, "0");
    const day = String(((n - 1) % 28) + 1).padStart(2, "0");
    const first = FIRST_NAMES[(n - 1) % FIRST_NAMES.length];
    const last = LAST_NAMES[(n - 1) % LAST_NAMES.length];
    return {
        id: 900000 + n,
        name: `${last}, ${first}`,
        // Born 1900: obviously fake, still the 12-digit format the importer expects.
        personnummer: `1900${month}${day}-${String(n).padStart(4, "0")}`,
        phone: `070-000 00 ${nn}`,
        email: `elev${nn}@example.se`,
        note: NOTES[(n - 1) % NOTES.length],
    };
}

export async function anonymizeWorkbook(inputPath, outputPath) {
    if (path.resolve(inputPath) === path.resolve(outputPath)) {
        throw new Error("Output must be a different file than the input.");
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(inputPath);
    const ws = wb.getWorksheet("Elever") ?? wb.worksheets[0];

    for (const [col, expected] of Object.entries(EXPECTED_HEADERS)) {
        const actual = ws.getRow(1).getCell(Number(col)).text.trim();
        if (actual !== expected) {
            throw new Error(`Unexpected header in column ${col}: expected "${expected}". Refusing to guess.`);
        }
    }

    let students = 0;
    let notes = 0;
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        if (!row.getCell(COL.name).text.trim() && !row.getCell(COL.personnummer).text.trim()) return;
        students += 1;
        const fake = dummyStudent(students);
        row.getCell(COL.id).value = fake.id;
        row.getCell(COL.name).value = fake.name;
        row.getCell(COL.personnummer).value = fake.personnummer;
        row.getCell(COL.phone).value = fake.phone;
        row.getCell(COL.email).value = fake.email;
        if (row.getCell(COL.other).text.trim()) {
            row.getCell(COL.other).value = fake.note;
            notes += 1;
        }
    });

    // Workbook metadata can carry the author's name.
    wb.creator = "anonymizeStudentWorkbook";
    wb.lastModifiedBy = "anonymizeStudentWorkbook";

    await wb.xlsx.writeFile(outputPath);
    return { students, notes };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isDirectRun) {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) {
        console.error("Usage: node scripts/anonymizeStudentWorkbook.js <real.xlsx> <dummy.xlsx>");
        process.exitCode = 1;
    } else {
        anonymizeWorkbook(input, output)
            .then(({ students, notes }) => console.log(`✅ Wrote ${output}: ${students} students replaced (${notes} ÖVRIGT notes).`))
            .catch((error) => {
                console.error(`❌ ${error.message}`);
                process.exitCode = 1;
            });
    }
}
