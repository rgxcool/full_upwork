import ExcelJS from "exceljs";
import Program from "../src/models/Program.js";
import Course from "../src/models/Course.js";
import Student from "../src/models/Student.js";

function normalizePNR(value) {
    return (
        value
            ?.toString()
            .replace(/[^0-9]/g, "")
            .trim() || null
    );
}

export async function parseCourses(filePath) {
    console.log("📖 Processing 'Kurser' worksheet...");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.worksheets[0]; // "Kurser"
    if (!worksheet || worksheet.name.toUpperCase() !== "KURSER") {
        console.error("❌ Error: 'Kurser' worksheet not found.");
        return;
    }

    let currentProgram = null;
    let courseOrder = 1;

    for (const row of worksheet._rows) {
        if (!row || row.number === 1) continue; // Skip header

        const programName =
            row.getCell(1).value?.toString().trim().toUpperCase() || null;
        const courseName =
            row.getCell(2).value?.toString().trim().toUpperCase() || null;
        const courseCode =
            row.getCell(3).value?.toString().trim().toUpperCase() || "";
        const coursePoints = row.getCell(4).value?.toString().trim() || "";
        const courseExtent = row.getCell(5).value?.toString().trim() || "";
        const pnrRaw = row.getCell(6).value; // Column F: PNR
        const pnr = normalizePNR(pnrRaw);

        if (programName) {
            console.log(`🆕 Found new program: ${programName}`);
            currentProgram = await Program.findOneAndUpdate(
                { programName },
                { programName },
                { new: true, upsert: true }
            );
            courseOrder = 1;
        }

        if (!currentProgram || !courseName) continue;

        const course = await Course.findOneAndUpdate(
            { courseName, courseCode },
            { courseName, courseCode, coursePoints, courseExtent },
            { new: true, upsert: true }
        );

        await Program.findByIdAndUpdate(currentProgram._id, {
            $addToSet: {
                programCourses: { courseId: course._id, order: courseOrder },
            },
        });

        if (pnr) {
            const student = await Student.findOne({
                personalNumber: { $regex: new RegExp(pnr + "$") },
            });
            if (student) {
                const alreadyInEducation = student.education.some(
                    (e) => e.course?.toString() === course._id.toString()
                );

                if (!alreadyInEducation) {
                    await Student.findByIdAndUpdate(student._id, {
                        $push: {
                            education: {
                                course: course._id,
                                addedFromExcel: true,
                                addedAt: new Date(),
                            },
                        },
                    });

                    console.log(
                        `➕ Added course to student ${student.personalNumber}: ${courseName}`
                    );
                } else {
                    console.log(
                        `⚠️ Course already exists for student ${student.personalNumber}: ${courseName}`
                    );
                }
            } else {
                console.warn(`❗ No student found with PNR ending in: ${pnr}`);
            }
        }

        console.log(
            `✅ Added course to program '${currentProgram.programName}': ${courseName}`
        );
        courseOrder++;
    }

    console.log("🎉 Courses and student links processed successfully.");
}
