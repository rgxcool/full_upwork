import ExcelJS from "exceljs";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("../../data/Kurser och kurspaket GY25 - C.xlsx");
console.log("Worksheets:", wb.worksheets.map(w => `${w.name} (rows=${w.rowCount})`));
for (const ws of wb.worksheets) {
    console.log(`\n--- ${ws.name} first 80 rows (non-blank):`);
    let shown = 0;
    for (let r = 1; r <= ws.rowCount && shown < 80; r++) {
        const row = ws.getRow(r);
        const a = row.getCell(1).text.trim();
        const b = row.getCell(2).text.trim();
        const isBold = !!row.getCell(2).font?.bold;
        const c = row.getCell(3).text.trim();
        if (!a && !b) { continue; }
        shown++;
        console.log(`${r} ${isBold ? "B" : " "} | "${a.slice(0,25)}" | "${b.slice(0,50)}" | "${c}"`);
    }
}