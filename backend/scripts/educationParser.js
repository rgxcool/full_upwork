import dotenv from "dotenv";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import Program from "../src/models/Program.js";
import CoursePackage from "../src/models/CoursePackage.js";
import Course from "../src/models/Course.js";

// Load environment variables from .env file
dotenv.config();

const MONGODB_URI = "mongodb://localhost:27017/mindfullearning";

console.log("Parsing education data to MongoDB");
console.log(`Connecting to MongoDB at ${MONGODB_URI}`);

// Check if MONGODB_URI is loaded correctly
if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined. Please check your .env file.");
    process.exit(1);
}

async function parseEducationData(filePath) {
    console.log(`Reading file: ${filePath}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    console.log("File read successfully");

    const worksheet1 = workbook.getWorksheet("Kurser");
    const worksheet2 = workbook.getWorksheet("Kurspaket");

    if (!worksheet1) {
        console.error("Worksheet 1 not found");
        return;
    }
    if (!worksheet2) {
        console.error("Worksheet 2 not found");
        return;
    }

    // Parsing Worksheets
    console.log("Parsing Worksheets");
    const programs = [];
    const coursePackages = [];
    let currentProgram = null;
    let currentCoursePackage = null;

    worksheet1.eachRow((row, rowNumber) => {
        console.log(`Processing row ${rowNumber} in Worksheet 1`);
        if (rowNumber > 1) {
            const programName = row.getCell(1).value;
            const coursePackageNameOrCourseName = row.getCell(2).value;
            const coursePackageCodeOrCourseCode = row.getCell(3).value;
            const points = row.getCell(4).value;
            const extent = row.getCell(5).value;
            const isBold = row.getCell(2).font && row.getCell(2).font.bold;

            if (programName) {
                console.log(`Found new program: ${programName}`);
                currentProgram = new Program({
                    programName,
                    programCourses: [],
                    programCoursePackage: null,
                });
                programs.push(currentProgram);
            }

            if (coursePackageNameOrCourseName && currentProgram) {
                if (isBold) {
                    console.log(
                        `Found new course package for program ${currentProgram.programName}: ${coursePackageNameOrCourseName}`
                    );
                    currentCoursePackage = new CoursePackage({
                        coursePackageName: coursePackageNameOrCourseName,
                        coursePackageCode: coursePackageCodeOrCourseCode,
                        coursePackageExtent: extent,
                        coursePackageCourses: [],
                    });
                    currentProgram.programCoursePackage = currentCoursePackage;
                    coursePackages.push(currentCoursePackage);
                } else {
                    console.log(
                        `Adding course to program ${
                            currentProgram.programName
                        } or course package ${
                            currentCoursePackage
                                ? currentCoursePackage.coursePackageName
                                : "N/A"
                        }: ${coursePackageNameOrCourseName}`
                    );
                    const course = new Course({
                        courseName: coursePackageNameOrCourseName,
                        courseCode: coursePackageCodeOrCourseCode,
                        courseExtent: extent,
                    });
                    if (currentCoursePackage) {
                        currentCoursePackage.coursePackageCourses.push(course);
                    } else {
                        currentProgram.programCourses.push(course);
                    }
                }
            }
        }
    });

    worksheet2.eachRow((row, rowNumber) => {
        console.log(`Processing row ${rowNumber} in Worksheet 2`);
        if (rowNumber > 1) {
            const programName = row.getCell(1).value;
            const coursePackageNameOrCourseName = row.getCell(2).value;
            const coursePackageCodeOrCourseCode = row.getCell(3).value;
            const points = row.getCell(4).value;
            const extent = row.getCell(5).value;
            const isBold = row.getCell(2).font && row.getCell(2).font.bold;

            if (programName) {
                console.log(`Found new program: ${programName}`);
                currentProgram = new Program({
                    programName,
                    programCoursePackage: null,
                    programCourses: [],
                });
                programs.push(currentProgram);
            }

            if (coursePackageNameOrCourseName && currentProgram) {
                if (isBold) {
                    console.log(
                        `Found new course package for program ${currentProgram.programName}: ${coursePackageNameOrCourseName}`
                    );
                    currentCoursePackage = new CoursePackage({
                        coursePackageName: coursePackageNameOrCourseName,
                        coursePackageCode: coursePackageCodeOrCourseCode,
                        coursePackageExtent: extent,
                        coursePackageCourses: [],
                    });
                    currentProgram.programCoursePackage = currentCoursePackage;
                    coursePackages.push(currentCoursePackage);
                } else {
                    console.log(
                        `Adding course to program ${
                            currentProgram.programName
                        } or course package ${
                            currentCoursePackage
                                ? currentCoursePackage.coursePackageName
                                : "N/A"
                        }: ${coursePackageNameOrCourseName}`
                    );
                    const course = new Course({
                        courseName: coursePackageNameOrCourseName,
                        courseCode: coursePackageCodeOrCourseCode,
                        courseExtent: extent,
                    });
                    if (currentCoursePackage) {
                        currentCoursePackage.coursePackageCourses.push(course);
                    } else {
                        currentProgram.programCourses.push(course);
                    }
                }
            }
        }
    });

    // Debug output for programs and course packages
    console.log(
        "Programs data before saving:",
        JSON.stringify(programs, null, 2)
    );
    console.log(
        "Course packages data before saving:",
        JSON.stringify(coursePackages, null, 2)
    );

    // Save to database
    console.log("Saving data to database");
    await Promise.all(
        programs.map(async (program) => {
            await program.save();
            console.log(`Saved program: ${program.programName}`);
            await Promise.all(
                program.programCourses.map(async (course) => {
                    await course.save();
                    console.log(`Saved course: ${course.courseName}`);
                })
            );
        })
    );

    await Promise.all(
        coursePackages.map(async (coursePackage) => {
            await coursePackage.save();
            console.log(
                `Saved course package: ${coursePackage.coursePackageName}`
            );
            await Promise.all(
                coursePackage.coursePackageCourses.map(async (course) => {
                    await course.save();
                    console.log(`Saved course: ${course.courseName}`);
                })
            );
        })
    );

    console.log("Data saved successfully");
}

// Connect to MongoDB and run the parser
mongoose
    .connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => {
        console.log("Connected to MongoDB");
        parseEducationData("./EducationData.xlsx")
            .then(() => {
                console.log("Parsing completed");
                mongoose.disconnect();
            })
            .catch((err) => {
                console.error("Error parsing data:", err);
                mongoose.disconnect();
            });
    })
    .catch((err) => {
        console.error("Error connecting to MongoDB:", err);
    });

export default parseEducationData;
