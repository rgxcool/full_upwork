import dotenv from "dotenv";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Program from "../src/models/Program.js";
import CoursePackage from "../src/models/CoursePackage.js";
import Course from "../src/models/Course.js";

dotenv.config();

const MONGODB_URI = "mongodb://localhost:27017/mindfullearning";

async function parseEducationData(filePath) {
    console.log(`Reading file: ${filePath}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    console.log("File read successfully");

    for (const worksheet of workbook.worksheets) {
        console.log(`Processing worksheet: ${worksheet.name}`);
        let currentProgram = null;
        let currentCoursePackage = null;

        for (const [rowNumber, row] of worksheet
            .getRows(2, worksheet.rowCount)
            .entries()) {
            const programName = row.getCell(1).value;
            const columnBText = row.getCell(2).value;
            const columnBFont = row.getCell(2).font;
            let courseCode = row.getCell(3).value;
            const coursePackagePoints = row.getCell(4).value || "0";
            const courseExtent = row.getCell(5).value;
            const isBold = columnBFont && columnBFont.bold;

            if (worksheet.name === "Kurser" && !courseCode) {
                courseCode = "N/A";
            }

            if (programName) {
                console.log(`New Program: ${programName}`);
                currentProgram = new Program({
                    programName,
                    programCourses: [],
                    programCoursePackage: null,
                });
                await currentProgram.save();

                if (columnBText) {
                    console.log(`-> Assigning Course Package: ${columnBText}`);
                    currentCoursePackage = new CoursePackage({
                        coursePackageName: columnBText,
                        coursePackageCode: courseCode,
                        coursePackagePoints,
                        coursePackageExtent: courseExtent || "0",
                        coursePackageCourses: [],
                    });
                    currentProgram.programCoursePackage = currentCoursePackage;
                    await currentCoursePackage.save();
                }
            } else if (columnBText && currentProgram) {
                if (isBold) {
                    console.log(`New Course Package: ${columnBText}`);
                    currentCoursePackage = new CoursePackage({
                        coursePackageName: columnBText,
                        coursePackageCode: courseCode,
                        coursePackagePoints,
                        coursePackageExtent: courseExtent || "0",
                        coursePackageCourses: [],
                    });
                    currentProgram.programCoursePackage = currentCoursePackage;
                    await currentCoursePackage.save();
                } else {
                    console.log(`Adding Course: ${columnBText}`);
                    const course = new Course({
                        courseName: columnBText,
                        courseCode: courseCode,
                        courseExtent: courseExtent || "0",
                    });
                    await course.save();
                    currentProgram.programCourses.push(course);
                    if (currentCoursePackage) {
                        currentCoursePackage.coursePackageCourses.push(course);
                    }
                }
            }
        }
    }
    console.log("Data saved successfully");
}

async function main() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("Connected to MongoDB");
        await parseEducationData("./EducationData.xlsx");
        console.log("Parsing completed");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

main();

export default parseEducationData;
