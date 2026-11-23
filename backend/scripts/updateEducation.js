// Imports the education catalog (programs, courses, course packages) from an Excel workbook.
// Replaces the old scripts/educationParser.js. Upserts only, so it is safe to re-run.
// Usage (from backend/): node scripts/updateEducation.js [path/to/workbook.xlsx]
import path from "path";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Program from "../src/models/Program.js";
import CoursePackage from "../src/models/CoursePackage.js";
import Course from "../src/models/Course.js";

// launch.sh sources the env file itself; a plain run reads .env.development.
// An exported MONGODB_URI still wins (dotenv never overrides it).
dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.development"), quiet: true });

async function parseEducation(filePath) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error("❌ MONGODB_URI is not set (looked in backend/.env.development).");
        process.exitCode = 1;
        return;
    }
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  try {
    const [coursesSheet, coursePackagesSheet] = workbook.worksheets;

    // Parse Courses and Programs
    let currentProgram;
    let courseOrder = 1;
    for (const row of coursesSheet.getRows(2, coursesSheet.rowCount - 1)) {
      const programName = row.getCell(1).text.trim().toUpperCase();
      const courseName = row.getCell(2).text.trim().toUpperCase();
      const courseCode = row.getCell(3).text.trim().toUpperCase();
      const coursePoints = row.getCell(4).text.trim();
      const courseExtent = row.getCell(5).text.trim();

      if (programName) {
        currentProgram = await Program.findOneAndUpdate(
          { programName },
          { programName },
          { new: true, upsert: true }
        );
        courseOrder = 1;
        console.log(`🆕 Program processed: ${programName}`);
      }

      if (!courseName || !currentProgram) continue;

      const course = await Course.findOneAndUpdate(
        { courseName, courseCode },
        { courseName, courseCode, coursePoints, courseExtent },
        { new: true, upsert: true }
      );

      await Program.findByIdAndUpdate(currentProgram._id, {
        $addToSet: { programCourses: { courseId: course._id, order: courseOrder } },
      });

      console.log(`✅ Course processed: ${courseName}`);
      courseOrder++;
    }

    // Parse Course Packages
    currentProgram = null;
    let currentPackage = null;

    for (const row of coursePackagesSheet.getRows(2, coursePackagesSheet.rowCount - 1)) {
      const programName = row.getCell(1).text.trim().toUpperCase();
      const cellB = row.getCell(2);
      const isBold = cellB.font?.bold;
      const itemName = cellB.text.trim().toUpperCase();
      const itemCode = row.getCell(3).text.trim().toUpperCase();
      const itemPoints = row.getCell(4).text.trim();
      const itemExtent = row.getCell(5).text.trim();
      const isPackage = isBold || /-\s*\d+\s*v$/i.test(itemName);

      if (programName) {
        currentProgram = await Program.findOneAndUpdate(
          { programName },
          { programName },
          { new: true, upsert: true }
        );
        currentPackage = null;
        console.log(`🆕 Program updated: ${programName}`);
      }

      if (!itemName && !itemCode && !itemPoints && !itemExtent) continue;

      if (isPackage) {
        currentPackage = await CoursePackage.findOneAndUpdate(
          { coursePackageName: itemName },
          {
            coursePackageName: itemName,
            coursePackageCode: itemCode,
            coursePackagePoints: itemPoints,
            coursePackageExtent: itemExtent,
          },
          { new: true, upsert: true }
        );

        await Program.findByIdAndUpdate(currentProgram._id, {
          $addToSet: { programCoursePackages: currentPackage._id },
        });

        console.log(`📦 Course Package processed: ${itemName}`);
      } else if (currentPackage) {
        const course = await Course.findOneAndUpdate(
          { courseName: itemName, courseCode: itemCode },
          { courseName: itemName, courseCode: itemCode, courseExtent: itemExtent },
          { new: true, upsert: true }
        );

        await CoursePackage.findByIdAndUpdate(currentPackage._id, {
          $addToSet: { coursePackageCourses: course._id },
        });

        console.log(`✅ Added course ${itemName} to package ${currentPackage.coursePackageName}`);
      }
    }

    console.log('🎉 Education data processed successfully.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

export default parseEducation;

// Usage (from backend/): node scripts/updateEducation.js [path/to/workbook.xlsx]
// Default: data/Kurser och kurspaket GY25.xlsx (the workbook launch.sh imports on an empty database).
const DEFAULT_WORKBOOK = new URL("../../data/Kurser och kurspaket GY25.xlsx", import.meta.url).pathname;
parseEducation(process.argv[2] || decodeURIComponent(DEFAULT_WORKBOOK));
