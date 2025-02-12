import ExcelJS from "exceljs";
import Student from "../models/Student.js"; // ✅ Ensure .js extension
import parseExcelDate from "../../utils/parseExcel.js";

// ✅ Upload and Process Excel Data
async function uploadXlsx(req, res) {
    console.log("🟢 Received XLSX file upload request");

    if (!req.file) {
        console.error("❌ No file received!");
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // ✅ Extract teacher name from the file name
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const teacherName = fileName.split(" ").pop().split(".")[0];

        // ✅ Process the Excel file
        const studentsToSave = await processExcelFile(fileBuffer, teacherName);

        console.log(`✅ Processed ${studentsToSave.length} students...`);

        if (studentsToSave.length === 0) {
            return res.status(400).json({ error: "No valid data to save." });
        }

        // ✅ Save to MongoDB
        await Student.insertMany(studentsToSave);
        console.log("✅ Data successfully inserted into MongoDB");

        res.status(200).json({
            message: "Upload successful",
            students: studentsToSave,
        });
    } catch (error) {
        console.error("❌ Error processing file:", error);
        res.status(500).json({
            error: "Failed to process file",
            details: error.message,
        });
    }
}

// ✅ Function to Process Excel File
async function processExcelFile(fileBuffer, teacherName) {
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

// ✅ Use named exports for modularity
export { uploadXlsx, processExcelFile };
