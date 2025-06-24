import ExcelJS from "exceljs";
import Program from "../src/models/Program.js";
import Course from "../src/models/Course.js";

export async function parseCourses(filePath) {
    console.log("📖 Processing 'Kurser' worksheet...");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0]; // First sheet: "Kurser"
    if (!worksheet || worksheet.name.toUpperCase() !== "KURSER") {
        console.error("❌ Error: 'Kurser' worksheet not found.");
        return;
    }

    let currentProgram = null;
    let courseOrder = 1;

    for (const row of worksheet._rows) {
        if (!row || row.number === 1) continue; // ✅ Skip header row

        const programName =
            row.getCell(1).value?.toString().trim().toUpperCase() || null; // Column A
        const courseName =
            row.getCell(2).value?.toString().trim().toUpperCase() || null; // Column B
        const courseCode =
            row.getCell(3).value?.toString().trim().toUpperCase() || ""; // Column C
        const coursePoints = row.getCell(4).value?.toString().trim() || ""; // Column D
        const courseExtent = row.getCell(5).value?.toString().trim() || ""; // Column E

        if (programName) {
            console.log(`🆕 Found new program: ${programName}`);
            currentProgram = await Program.findOneAndUpdate(
                { programName },
                { programName },
                { new: true, upsert: true }
            );
            courseOrder = 1; // Reset order when new program starts
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

        // Add courseId and order as subdocument
        await Program.findByIdAndUpdate(currentProgram._id, {
            $addToSet: {
                programCourses: {
                    courseId: existingCourse._id,
                    order: courseOrder
                }
            }
        });

        console.log(
            `✅ Added course to program '${currentProgram.programName}': ${courseName} (Points: ${coursePoints})`
        );

        courseOrder++;
    }

    console.log("🎉 Courses processed successfully.");
}
