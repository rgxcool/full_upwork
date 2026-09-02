import ExcelJS from "exceljs";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("../../data/Kurser och kurspaket GY25.xlsx");

const ws = wb.worksheets[1]; // Kurspaket
console.log("SHEET:", ws.name, "rows:", ws.rowCount);
// Print every row: colA, colB (with bold flag), colC, colD, colE
for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = row.getCell(1).text.trim();
    const b = row.getCell(2).text.trim();
    const isBold = !!row.getCell(2).font?.bold;
    const c = row.getCell(3).text.trim();
    const d = row.getCell(4).text.trim();
    const e = row.getCell(5).text.trim();
    if (!a && !b) continue;
    console.log(`${String(r).padStart(3)} ${isBold ? "B" : " "} | "${a.slice(0,25)}" | "${b.slice(0,45)}" | "${c}" | "${d}" | "${e}"`);
}