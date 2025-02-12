import Student from "../models/Student.js"; // Ensure .js extension
import { parseStudentExcel } from "../utils/parseStudentExcel.js";

// Upload and Process Excel Data
async function uploadXlsx(req, res) {
    console.log("🟢 Received XLSX file upload request");

    if (!req.file) {
        console.error("❌ No file received!");
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // Extract teacher name from the file name
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const teacherName = fileName.split(" ").pop().split(".")[0];

        console.log(`🔹 Extracted teacher name: ${teacherName}`);

        // Process the Excel file
        const studentsToSave = await parseStudentExcel(fileBuffer, teacherName);

        console.log(`✅ Processed ${studentsToSave.length} students...`);

        if (studentsToSave.length === 0) {
            console.warn("⚠️ No valid student data found");
            return res.status(400).json({ error: "No valid data to save." });
        }

        // Save to MongoDB
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

// Use named exports for modularity
export { uploadXlsx };
