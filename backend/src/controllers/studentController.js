import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import { parseStudentExcel } from "../utils/parseStudentExcel.js";

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

        let studentsToSave = await parseStudentExcel(fileBuffer, teacherName);

        console.log(`✅ Processed ${studentsToSave.length} students...`);

        if (studentsToSave.length === 0) {
            console.warn("⚠️ No valid student data found");
            return res.status(400).json({ error: "No valid data to save." });
        }

        const emails = studentsToSave.map((student) => student.email);
        const existingStudents = await Student.find({ email: { $in: emails } });

        const existingStudentsMap = new Map(
            existingStudents.map((s) => [s.email, s])
        );

        // Corrected field names
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

        const [programs, courses, coursePackages] = await Promise.all([
            Program.find({ programName: { $in: programNames } }).lean(), // ✅ fixed
            Course.find({ courseName: { $in: courseNames } }).lean(), 
            CoursePackage.find({ coursePackageName: { $in: coursePackageNames } }).lean(), // ✅ fixed
        ]);

        const programMap = Object.fromEntries(
            programs.map((p) => [p.programName, p._id]) // ✅ fixed
        );
        const courseMap = Object.fromEntries(
            courses.map((c) => [c.courseName, c._id])
        );
        const coursePackageMap = Object.fromEntries(
            coursePackages.map((cp) => [cp.coursePackageName, cp._id]) // ✅ fixed
        );

        studentsToSave = studentsToSave.map((student) => {
            const existingStudent = existingStudentsMap.get(student.email);

            return {
                ...student,
                aplStatus: existingStudent ? existingStudent.aplStatus : 'GRAY',
                program: student.program ? {
                    programId: programMap[student.program],
                    grade: null
                } : null,
                coursePackages: student.coursePackages
                    .map((cp) => ({
                        coursePackageId: coursePackageMap[cp.coursePackageName],
                        grade: null,
                        addedAt: new Date(),
                    }))
                    .filter((cp) => cp.coursePackageId !== undefined), // filter null refs
                courses: student.courses
                    .map((c) => ({
                        courseId: courseMap[c.courseName],
                        grade: null,
                        addedAt: new Date(),
                    }))
                    .filter((c) => c.courseId !== undefined), // filter null refs
                createdAt: existingStudent ? existingStudent.createdAt : new Date(),
                updatedAt: new Date(),
                uploadedBy: teacherName,
            };
        });

        console.log(
            "📝 Final student data before saving:",
            JSON.stringify(studentsToSave, null, 2)
        );

        const bulkOps = studentsToSave.map((student) => ({
            updateOne: {
                filter: { email: student.email },
                update: { $set: student },
                upsert: true,
            },
        }));

        await Student.bulkWrite(bulkOps);
        console.log("✅ Data successfully inserted/updated in MongoDB");

        res.status(200).json({
            message: "Upload successful",
            students: studentsToSave,
        });
    } catch (error) {
        console.error("❌ Error processing file:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                error: "Duplicate entry: A student with this email already exists.",
            });
        }

        res.status(500).json({
            error: "Failed to process file",
            details: error.message,
        });
    }
}

export { uploadXlsx };
