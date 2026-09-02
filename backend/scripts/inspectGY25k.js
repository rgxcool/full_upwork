import ExcelJS from "exceljs";

for (const f of ["../../data/Kurser och kurspaket GY25.xlsx"]) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    const ws = wb.worksheets[0]; // Kurser
    console.log("SHEET:", ws.name, "rows:", ws.rowCount);
    for (let r = 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const a = row.getCell(1).text.trim();
        const b = row.getCell(2).text.trim();
        const c = row.getCell(3).text.trim();
        const d = row.getCell(4).text.trim();
        const e = row.getCell(5).text.trim();
        if (!a && !b) continue;
        console.log(`${String(r).padStart(3)} | "${a.slice(0,30)}" | "${b.slice(0,50)}" | "${c}" | "${d}" | "${e}"`);
    }
}