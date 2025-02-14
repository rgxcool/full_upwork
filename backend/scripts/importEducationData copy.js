import mongoose from "mongoose";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

// Import the models
import Program from "../src/models/Program.js";
import CoursePackage from "../src/models/CoursePackage.js";
import Course from "../src/models/Course.js";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to MongoDB
mongoose.connect(process.env("MONGO_URI"));

async function parseExcelFile() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(__dirname, "EducationData.xlsx"));
    const worksheet = workbook.getWorksheet(1);

    let currentProgram = null;
    let currentCoursePackage = null;
    const programs = [];
    const coursePackages = [];
    const courses = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row

        const programName = row.getCell(1).value;
        const coursePackageOrCourse = row.getCell(2).value;
        const courseCode = row.getCell(3).value;
        const courseExtent = row.getCell(5).value;
        const coursePoints = row.getCell(6).value;

        if (programName) {
            currentProgram = new Program({ programName });
            programs.push(currentProgram);
        }

        if (coursePackageOrCourse && isBoldText(row.getCell(2))) {
            currentCoursePackage = new CoursePackage({
                coursePackageName: coursePackageOrCourse,
                coursePackageCode: courseCode,
                coursePackagePoints: coursePoints,
                coursePackageExtent: courseExtent,
            });
            currentProgram.programCoursePackage = currentCoursePackage._id;
            coursePackages.push(currentCoursePackage);
        } else if (coursePackageOrCourse) {
            const course = new Course({
                courseName: coursePackageOrCourse,
                courseCode,
                courseExtent,
            });
            currentCoursePackage.coursePackageCourses.push(course._id);
            currentProgram.programCourses.push(course._id);
            courses.push(course);
        }
    });

    await saveData(programs, coursePackages, courses);
}

async function saveData(programs, coursePackages, courses) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        await Promise.all(programs.map((program) => program.save({ session })));
        await Promise.all(
            coursePackages.map((coursePackage) =>
                coursepackage.save({ session })
            )
        );
        await Promise.all(courses.map((course) => course.save({ session })));
        await session.commitTransaction();
        console.log("Data saved successfully");
    } catch (error) {
        await session.abortTransaction();
        console.error("Error saving data:", error);
    } finally {
        session.endSession();
        mongoose.connection.close();
    }
}

function isBoldText(cell) {
    return cell.font && cell.font.bold;
}

parseExcelFile();
