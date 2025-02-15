import ExcelJS from "exceljs";
import Program from "../src/models/Program.js";
import Course from "../src/models/Course.js";

export async function parseCourses(filePath) {
    console.log("📖 Processing 'Kurser' worksheet...");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0]; // First sheet: "Kurser"
    if (!worksheet || worksheet.name.toUpperCase() !== "kurser") {
        console.error("❌ Error: 'Kurser' worksheet not found.");
        return;
    }

    let currentProgram = null;

    for (const row of worksheet._rows) {
        if (!row || row.number === 1) continue; // ✅ Skip header row

        const programName =
            row.getCell(1).value?.toString().trim().toUpperCase() || null; // Column A
        const courseName =
            row.getCell(2).value?.toString().trim().toUpperCase() || null; // Column B
        const courseCode =
            row.getCell(3).value?.toString().trim().toUpperCase() || "N/A"; // Column C (Ensure codes are uppercase)
        const coursePoints = row.getCell(4).value?.toString().trim() || "N/A"; // Column D
        const courseExtent = row.getCell(5).value?.toString().trim() || "N/A"; // Column E

        if (programName) {
            console.log(`🆕 Found new program: ${programName}`);
            currentProgram = await Program.findOneAndUpdate(
                { programName },
                { programName },
                { new: true, upsert: true }
            );
        }

        if (!currentProgram) {
            console.error(
                `🚨 Error: No valid program found for course '${courseName}'. Skipping.`
            );
            continue;
        }

        if (!courseName) continue;

        const existingCourse = await Course.findOneAndUpdate(
            { courseName, courseCode },
            { courseName, courseCode, coursePoints, courseExtent },
            { new: true, upsert: true }
        );

        await Program.findByIdAndUpdate(currentProgram._id, {
            $addToSet: { programCourses: existingCourse._id },
        });

        console.log(
            `✅ Added course to program '${currentProgram.programName}': ${courseName} (Points: ${coursePoints})`
        );
    }

    console.log("🎉 Courses processed successfully.");
}
