import ExcelJS from "exceljs";
import Program from "../src/models/Program.js";
import CoursePackage from "../src/models/CoursePackage.js";
import Course from "../src/models/Course.js";

function normalize(str) {
    return str
        ?.toString()
        .replace(/\\s+/g, " ")
        .replace(/–/g, "-")
        .trim()
        .toUpperCase();
}

export async function parseCoursePackages(filePath) {
    console.log("📖 Processing 'Kurspaket' worksheet...");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[1];

    if (!worksheet || normalize(worksheet.name) !== "KURSPAKET") {
        console.error("❌ Error: 'Kurspaket' worksheet not found.");
        return;
    }

    const programs = new Map();
    const coursePackageMap = new Map();
    let currentProgram = null;
    let currentCoursePackage = null;

    try {
        // First pass: detect and create programs and course packages
        for (const row of worksheet._rows) {
            if (!row || row.number === 1) continue; // Skip header

            const programName = normalize(row.getCell(1).value);
            const cellB = row.getCell(2);
            const isBold = cellB?.font?.bold;
            const nameB = normalize(cellB?.value);
            const code = normalize(row.getCell(3).value);
            const points = row.getCell(4).value?.toString().trim() || "";
            const extent = row.getCell(5).value?.toString().trim() || "";

            // Check and process the program
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
                continue; // Skip program-only rows
            }

            // Check and process the course package (bold cell in column B or name ends with - XX V)
            const isPackage = isBold || /-\s*\d+\s*v$/i.test(nameB);
            if (isPackage && nameB) {
                if (!currentProgram) {
                    console.error(
                        `🚨 Row ${row.number}: Course package '${nameB}' has no assigned program.`
                    );
                    continue;
                }

                if (!coursePackageMap.has(code)) {
                    console.log(
                        `📦 Found new course package for ${currentProgram.programName}: ${nameB}`
                    );

                    currentCoursePackage = await CoursePackage.findOneAndUpdate(
                        { coursePackageCode: code },
                        {
                            coursePackageName: nameB,
                            coursePackageCode: code,
                            coursePackagePoints: points,
                            coursePackageExtent: extent,
                            coursePackageCourses: [],
                        },
                        { new: true, upsert: true }
                    );

                    coursePackageMap.set(code, currentCoursePackage._id);
                } else {
                    currentCoursePackage = await CoursePackage.findById(
                        coursePackageMap.get(code)
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

        // Second pass: attach courses to each course package
        for (const row of worksheet._rows) {
            if (!row || row.number === 1) continue; // Skip header

            const programName = normalize(row.getCell(1).value);
            if (programName && programs.has(programName)) {
                currentProgram = programs.get(programName);
            }

            const cellB = row.getCell(2);
            const isBold = cellB?.font?.bold;
            const nameB = normalize(cellB?.value);
            const code = normalize(row.getCell(3).value);
            const extent = row.getCell(5).value?.toString().trim() || "";

            if (!nameB) continue; // Skip rows without a course package name

            // Skip rows that don't contain valid course packages
            const isPackage = isBold || /-\s*\d+\s*v$/i.test(nameB);
            if (isPackage) {
                currentCoursePackage = await CoursePackage.findById(
                    coursePackageMap.get(code)
                );
                continue;
            }

            if (!currentCoursePackage) {
                console.error(
                    `🚨 Row ${row.number}: No valid course package before '${nameB}'. Skipping.`
                );
                continue;
            }

            const existingCourse = await Course.findOneAndUpdate(
                {
                    courseCode: code,
                },
                {
                    courseName: nameB,
                    courseCode: code,
                    courseExtent: extent,
                },
                { new: true, upsert: true }
            );

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
