import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Program from "../src/models/Program.js";
import CoursePackage from "../src/models/CoursePackage.js";
import Course from "../src/models/Course.js";

export async function parseCoursePackages(filePath) {
    console.log("📖 Processing 'Kurspaket' worksheet...");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[1]; // ✅ Second sheet: "Kurspaket"

    if (!worksheet || worksheet.name.toUpperCase() !== "kurspaket") {
        console.error("❌ Error: 'Kurspaket' worksheet not found.");
        return;
    }

    const programs = new Map();
    const coursePackageMap = new Map(); // ✅ Store course package names
    let currentProgram = null;
    let currentCoursePackage = null;

    try {
        // ✅ **First pass: Ensure course packages exist & are assigned to programs**
        for (const row of worksheet._rows) {
            if (!row || row.number === 1) continue; // ✅ Skip the header row

            const programName =
                row.getCell(1).value?.toString().trim().toUpperCase() || null; // Column A
            const cellB = row.getCell(2);
            const isBold = cellB?.font?.bold;
            const packageOrCourseName =
                cellB.value?.toString().trim().toUpperCase() || null; // Column B
            const packageOrCourseCode =
                row.getCell(3).value?.toString().trim().toUpperCase() || "N/A"; // Column C
            const packageOrCoursePoints =
                row.getCell(4).value?.toString().trim() || "N/A"; // Column D
            const packageOrCourseExtent =
                row.getCell(5).value?.toString().trim() || "N/A"; // Column E

            if (!packageOrCourseName) continue; // ✅ Skip empty rows

            // ✅ Update the current program if a new program name is found
            if (programName) {
                if (!programs.has(programName)) {
                    currentProgram = await Program.findOne({ programName });

                    if (!currentProgram) {
                        console.log(`🆕 Found new program: ${programName}`);
                        currentProgram = await Program.create({
                            programName,
                            programCourses: [],
                            programCoursePackages: [],
                        });
                    }
                    programs.set(programName, currentProgram);
                } else {
                    currentProgram = programs.get(programName);
                }
            }

            if (!currentProgram) {
                console.error(
                    `🚨 Error: No valid program found for '${packageOrCourseName}'. Skipping.`
                );
                continue;
            }

            // ✅ **If bold, it's a course package → Save it**
            if (isBold) {
                if (!coursePackageMap.has(packageOrCourseName)) {
                    console.log(
                        `📦 Found new course package for ${currentProgram.programName}: ${packageOrCourseName}`
                    );

                    currentCoursePackage = await CoursePackage.findOneAndUpdate(
                        { coursePackageName: packageOrCourseName },
                        {
                            coursePackageName: packageOrCourseName,
                            coursePackageCode: packageOrCourseCode,
                            coursePackagePoints: packageOrCoursePoints,
                            coursePackageExtent: packageOrCourseExtent,
                            coursePackageCourses: [],
                        },
                        { new: true, upsert: true }
                    );

                    coursePackageMap.set(
                        packageOrCourseName,
                        currentCoursePackage._id
                    );
                } else {
                    currentCoursePackage = await CoursePackage.findById(
                        coursePackageMap.get(packageOrCourseName)
                    );
                }

                if (
                    !currentProgram.programCoursePackages.includes(
                        currentCoursePackage._id
                    )
                ) {
                    currentProgram.programCoursePackages.push(
                        currentCoursePackage._id
                    );
                    await currentProgram.save();
                }
            }
        }

        // ✅ **Second pass: Ensure courses are correctly added to the correct course packages**
        for (const row of worksheet._rows) {
            if (!row || row.number === 1) continue; // ✅ Skip the header row

            const cellB = row.getCell(2);
            const isBold = cellB?.font?.bold;
            const packageOrCourseName =
                cellB.value?.toString().trim().toUpperCase() || null; // Column B
            const packageOrCourseCode =
                row.getCell(3).value?.toString().trim().toUpperCase() || "N/A"; // Column C
            const packageOrCourseExtent =
                row.getCell(5).value?.toString().trim() || "N/A"; // Column E

            if (!packageOrCourseName) continue; // ✅ Skip empty rows

            // ✅ If it's bold, update `currentCoursePackage`
            if (isBold) {
                currentCoursePackage = await CoursePackage.findById(
                    coursePackageMap.get(packageOrCourseName)
                );
                continue; // ✅ Skip processing this row further
            }

            // ✅ Find the correct course package
            if (!currentCoursePackage) {
                console.error(
                    `🚨 Error: No valid course package before '${packageOrCourseName}'. Skipping.`
                );
                continue;
            }

            // ✅ Find or create the course
            const existingCourse = await Course.findOneAndUpdate(
                {
                    courseName: packageOrCourseName,
                    courseCode: packageOrCourseCode,
                },
                {
                    courseName: packageOrCourseName,
                    courseCode: packageOrCourseCode,
                    courseExtent: packageOrCourseExtent,
                },
                { new: true, upsert: true }
            );

            // ✅ Ensure course is added to the correct course package
            await CoursePackage.findByIdAndUpdate(currentCoursePackage._id, {
                $addToSet: { coursePackageCourses: existingCourse._id },
            });

            console.log(
                `✅ Added course to package '${currentCoursePackage.coursePackageName}': ${existingCourse.courseName}`
            );
        }

        console.log("🎉 Course packages processed successfully.");
    } catch (error) {
        console.error("❌ Error processing course packages:", error);
    }
}
