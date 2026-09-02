import ExcelJS from "exceljs";

const files = [
    "../../data/Kurser och kurspaket GY25.xlsx",
    "../../data/Kurser och kurspaket GY25 - C.xlsx",
    "../../data/Kurser och kurspaket.xlsx",
    "./EducationData.xlsx",
    "./test.xlsx",
];

for (const f of files) {
    console.log("\n=== FILE:", f);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    const found = [];
    for (const ws of wb.worksheets) {
        for (let r = 1; r <= ws.rowCount; r++) {
            const row = ws.getRow(r);
            const a = row.getCell(1).text.trim().toUpperCase();
            const b = row.getCell(2).text.trim().toUpperCase();
            const isBold = !!row.getCell(2).font?.bold;
            const code = row.getCell(3).text.trim().toUpperCase();
            if (!b) continue;
            const isPackage = isBold || /-\s*\d+\s*V$/i.test(b);
            if (isPackage && a && code) {
                found.push(`${a} | ${b} | ${code}`);
            }
        }
    }
    const unique = new Set(found);
    console.log(`  Package rows (bold OR "-NNv" pattern): ${unique.size}`);
    for (const k of unique) console.log("   ", k);
}