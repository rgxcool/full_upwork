// src/utils/integratedEducationParser.js
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import Program from '../models/Program.js';
import CoursePackage from '../models/CoursePackage.js';
import Course from '../models/Course.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mindfullearning';

async function parseEducation(filePath) {
  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  try {
    const [coursesSheet, coursePackagesSheet] = workbook.worksheets;

    // Parse Courses and Programs
    let currentProgram;
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
        console.log(`🆕 Program processed: ${programName}`);
      }

      if (!courseName || !currentProgram) continue;

      const course = await Course.findOneAndUpdate(
        { courseName, courseCode },
        { courseName, courseCode, coursePoints, courseExtent },
        { new: true, upsert: true }
      );

      await Program.findByIdAndUpdate(currentProgram._id, {
        $addToSet: { programCourses: course._id },
      });

      console.log(`✅ Course processed: ${courseName}`);
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

      if (programName) {
        currentProgram = await Program.findOneAndUpdate(
          { programName },
          { programName },
          { new: true, upsert: true }
        );
        console.log(`🆕 Program updated: ${programName}`);
      }

      if (isBold) {
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
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

export default parseEducation;

// Usage example
parseEducation('./test.xlsx');