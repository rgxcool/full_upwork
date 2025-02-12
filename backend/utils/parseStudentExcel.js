import ExcelJS from "exceljs";

async function parseStudentExcel(fileBuffer, teacherName) {
    console.log("🔹 Loading Excel file...");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    const worksheet = workbook.worksheets[0];

    console.log("🔹 Extracting data...");
    const headers = worksheet.getRow(1).values.slice(1);
    const requiredFields = [
        "NAMN",
        "PERSONNUMMER",
        "KURS/PAKET",
        "START",
        "SLUT",
        "KOMMUN/PRIVAT",
    ];

    const studentsToSave = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row

        let rowObject = {};
        row.eachCell((cell, colNumber) => {
            const columnName = headers[colNumber - 1];
            rowObject[columnName] = cell.value;
        });

        rowObject["teacher"] = teacherName;

        // ✅ Validate required fields
        for (const field of requiredFields) {
            if (!rowObject[field]) {
                console.warn(`⚠️ Missing field: ${field} in row ${rowNumber}`);
                return; // Skip this row
            }
        }

        studentsToSave.push({
            namn: rowObject["NAMN"],
            personnummer: rowObject["PERSONNUMMER"],
            kurspaket: rowObject["KURS/PAKET"],
            startDatum: parseExcelDate(rowObject["START"]),
            slutDatum: parseExcelDate(rowObject["SLUT"]),
            kommun: rowObject["KOMMUN/PRIVAT"],
            telefon: rowObject["TELEFON"] || "",
            mail:
                typeof rowObject["MAIL"] === "object" && rowObject["MAIL"].text
                    ? rowObject["MAIL"].text
                    : rowObject["MAIL"],
            prov: rowObject["PROV"] || "",
            ovrigt: rowObject["ÖVRIGT"] || "",
            slutprovDatum: parseExcelDate(rowObject["PREL. DATUM SLUTPROV"]),
            dropout: false,
            teacher: rowObject["teacher"],
        });
    });

    return studentsToSave;
}

// ✅ Convert Excel Date to JavaScript Date
function parseExcelDate(value) {
    if (!value) return null;
    if (typeof value === "number") {
        return new Date((value - 25569) * 86400 * 1000).toISOString();
    }
    return value;
}

export { parseStudentExcel };
