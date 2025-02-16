import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js"; // ✅ Ensure Course model is imported
import CoursePackage from "../models/CoursePackage.js";
import { parseStudentExcel } from "../utils/parseStudentExcel.js";
import mongoose from "mongoose";

async function uploadXlsx(req, res) {
    console.log("🟢 Received XLSX file upload request");

    if (!req.file) {
        console.error("❌ No file received!");
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const teacherName = fileName.split(" ").pop().split(".")[0];

        console.log(`🔹 Extracted teacher name: ${teacherName}`);

        // ✅ Parse the Excel file
        let studentsToSave = await parseStudentExcel(fileBuffer, teacherName);

        console.log(`✅ Processed ${studentsToSave.length} students...`);

        if (studentsToSave.length === 0) {
            console.warn("⚠️ No valid student data found");
            return res.status(400).json({ error: "No valid data to save." });
        }

        // ✅ Fetch all program names, course names, and course package names in a single query
        const programNames = [
            ...new Set(studentsToSave.map((s) => s.program).filter(Boolean)),
        ];
        const courseNames = [
            ...new Set(
                studentsToSave.flatMap((s) =>
                    s.courses.map((c) => c.courseName)
                )
            ),
        ];
        const coursePackageNames = [
            ...new Set(
                studentsToSave.flatMap((s) =>
                    s.coursePackages.map((cp) => cp.coursePackageName)
                )
            ),
        ];

        console.log(
            `🔍 Fetching programs: ${programNames.length}, courses: ${courseNames.length}, course packages: ${coursePackageNames.length}`
        );

        const programs = await Program.find({
            name: { $in: programNames },
        }).lean();
        const courses = await Course.find({
            courseName: { $in: courseNames },
        }).lean();
        const coursePackages = await CoursePackage.find({
            name: { $in: coursePackageNames },
        }).lean();

        // ✅ Create mapping for quick lookup
        const programMap = Object.fromEntries(
            programs.map((p) => [p.name, p._id])
        );
        const courseMap = Object.fromEntries(
            courses.map((c) => [c.courseName, c._id])
        );
        const coursePackageMap = Object.fromEntries(
            coursePackages.map((cp) => [cp.name, cp._id])
        );

        // ✅ Map students with proper ObjectId references
        studentsToSave = studentsToSave.map((student) => ({
            ...student,
            program: programMap[student.program] || null,
            coursePackages: student.coursePackages.map((cp) => ({
                coursePackageId: coursePackageMap[cp.coursePackageName] || null,
                coursePackageName: cp.coursePackageName,
                addedAt: new Date(),
            })),
            courses: student.courses.map((c) => ({
                courseId: courseMap[c.courseName] || null,
                courseName: c.courseName,
                addedAt: new Date(),
            })),
        }));

        console.log(
            "📝 Final student data before saving:",
            JSON.stringify(studentsToSave, null, 2)
        );

        // ✅ Use `bulkWrite()` for efficiency
        const bulkOps = studentsToSave.map((student) => ({
            insertOne: { document: student },
        }));

        await Student.bulkWrite(bulkOps);
        console.log("✅ Data successfully inserted into MongoDB");

        res.status(200).json({
            message: "Upload successful",
            students: studentsToSave,
        });
    } catch (error) {
        console.error("❌ Error processing file:", error);
        res.status(500).json({
            error: "Failed to process file",
            details: error.message,
        });
    }
}

export { uploadXlsx };
