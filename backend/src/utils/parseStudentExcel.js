import ExcelJS from "exceljs";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import mongoose from "mongoose";

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
    let consecutiveEmptyRows = 0;

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        let rowObject = {};
        let row = worksheet.getRow(rowNumber);
        let hasRedBackground = false;

        row.eachCell((cell, colNumber) => {
            const columnName = headers[colNumber - 1];
            if (columnName) {
                rowObject[columnName] = cell.value;
            }

            // ✅ Detect red background color for dropout status
            if (
                cell.style.fill &&
                cell.style.fill.fgColor &&
                cell.style.fill.fgColor.argb &&
                cell.style.fill.fgColor.argb.toUpperCase() === "FFFF0000"
            ) {
                hasRedBackground = true;
            }
        });

        rowObject["teacher"] = teacherName;
        rowObject["dropout"] = hasRedBackground; // ✅ Set dropout status based on red cell color

        // ✅ Check if row is empty
        if (requiredFields.every((field) => !rowObject[field])) {
            consecutiveEmptyRows++;
            if (consecutiveEmptyRows >= 5) {
                console.warn(
                    `⚠️ Detected ${consecutiveEmptyRows} consecutive empty rows. Stopping.`
                );
                break;
            }
            continue;
        } else {
            consecutiveEmptyRows = 0;
        }

        // ✅ Convert program name to ObjectId
        let programId = null;
        if (rowObject["PROGRAM"]) {
            const programName = rowObject["PROGRAM"].toUpperCase().trim();
            const programDoc = await Program.findOne({ name: programName });
            programId = programDoc ? programDoc._id : null;
        }

        let courseIds = [];
        let coursePackageIds = [];

        // ✅ Process `KURS/PAKET` by searching first in Courses, then in CoursePackages
        if (rowObject["KURS/PAKET"]) {
            const courseNames = rowObject["KURS/PAKET"]
                .split(", ")
                .map((name) => name.trim().toUpperCase());

            console.log(`🔍 Searching for courses: ${courseNames}`);

            // ✅ Find matching Courses by courseName
            const foundCourses = await Course.find({
                courseName: { $in: courseNames },
            }).lean();
            console.log(`✅ Found courses:`, foundCourses);

            const courseMap = Object.fromEntries(
                foundCourses.map((course) => [course.courseName, course._id])
            );

            // ✅ Find matching CoursePackages for unmatched courses
            const unmatchedCourses = courseNames.filter(
                (name) => !courseMap[name]
            );
            const foundCoursePackages = await CoursePackage.find({
                name: { $in: unmatchedCourses },
            }).lean();
            console.log(`✅ Found course packages:`, foundCoursePackages);

            const coursePackageMap = Object.fromEntries(
                foundCoursePackages.map((pkg) => [pkg.name, pkg._id])
            );

            // ✅ Assign found matches
            courseIds = foundCourses.map((course) => ({
                courseId: course._id,
                courseName: course.courseName, // Store course name for quick access
                addedAt: new Date(),
            }));

            coursePackageIds = foundCoursePackages.map((pkg) => ({
                coursePackageId: pkg._id,
                coursePackageName: pkg.name,
                addedAt: new Date(),
            }));

            // 🚨 Log unmatched courses/packages
            const completelyUnmatched = unmatchedCourses.filter(
                (name) => !coursePackageMap[name]
            );
            if (completelyUnmatched.length > 0) {
                console.warn(
                    `⚠️ No match found for: ${completelyUnmatched.join(", ")}`
                );
            }
        }

        studentsToSave.push({
            name: rowObject["NAMN"],
            personalNumber: rowObject["PERSONNUMMER"],
            program: programId,
            coursePackages: coursePackageIds,
            courses: courseIds, // ✅ Now correctly assigned
            startDate: parseExcelDate(rowObject["START"]),
            endDate: parseExcelDate(rowObject["SLUT"]),
            municipality: rowObject["KOMMUN/PRIVAT"],
            phone: rowObject["TELEFON"] || "",
            email: extractMail(rowObject["MAIL"]),
            exam: rowObject["PROV"] || "",
            additionalInfo: rowObject["ÖVRIGT"] || "",
            finalExamDate: parseExcelDate(rowObject["PREL. DATUM SLUTPROV"]),
            dropout: hasRedBackground, // ✅ Set based on red cell color
            teacher: rowObject["teacher"],
        });

        console.log(
            `✅ Student ${rowObject["NAMN"]} processed with dropout: ${hasRedBackground}`
        );
    }
    console.log(
        "📝 Final students data before saving:",
        JSON.stringify(studentsToSave, null, 2)
    );

    return studentsToSave;
}

// ✅ Convert Excel Date to JavaScript Date
function parseExcelDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === "number") {
        return new Date((value - 25569) * 86400 * 1000).toISOString();
    }

    return value;
}

// ✅ Extract email from different Excel cell formats
function extractMail(value) {
    if (!value) return "";
    if (typeof value === "object" && value.text) {
        return value.text;
    }
    return value;
}

export { parseStudentExcel };
