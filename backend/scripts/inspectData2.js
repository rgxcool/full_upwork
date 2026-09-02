import ExcelJS from "exceljs";

const files = [
    "./test.xlsx",
    "./EducationData.xlsx",
    "../../data/Kurser och kurspaket GY25.xlsx",
];

for (const f of files) {
    console.log("\n==============================================");
    console.log("FILE:", f);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    console.log("Worksheets:", wb.worksheets.map(w => `${w.name} (rows=${w.rowCount})`));
    const ws = wb.worksheets[1];
    if (!ws) continue;
    console.log("--", ws.name, "sample of every 3rd row:");
    for (let r = 1; r <= ws.rowCount; r += 3) {
        const row = ws.getRow(r);
        const a = row.getCell(1).text.trim();
        const b = row.getCell(2);
        const bText = b.text.trim();
        const isBold = !!b.font?.bold;
        const c = row.getCell(3).text.trim();
        console.log(`   ${r} ${isBold ? "[B]" : "   "} prog="${a}" B="${bText.slice(0,45)}" code="${c}"`);
    }
}