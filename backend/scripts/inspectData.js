import ExcelJS from "exceljs";

const files = [
    "../../data/Kurser och kurspaket GY25.xlsx",
    "../../data/Kurser och kurspaket GY25 - C.xlsx",
    "../../data/Kurser och kurspaket.xlsx",
];

for (const f of files) {
    console.log("\n==============================================");
    console.log("FILE:", f);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    for (const ws of wb.worksheets) {
        console.log(`\n-- Sheet: ${ws.name} (rows=${ws.rowCount})`);
        let programs = 0;
        let packages = 0;
        let courses = 0;
        let rowCount = 0;
        for (let r = 1; r <= ws.rowCount; r++) {
            const row = ws.getRow(r);
            const a = row.getCell(1).text.trim();
            const b = row.getCell(2);
            const bText = b.text.trim();
            const isBold = !!b.font?.bold;
            rowCount++;
            if (a) programs++;
            if (isBold && bText) packages++;
            else if (bText) courses++;
        }
        console.log(`   program-marked rows: ${programs}, package(bold) rows: ${packages}, course rows: ${courses}`);
    }
}