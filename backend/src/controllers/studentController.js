// ✅ studentController.js (education[] aware + Levenshtein fuzzy matching)
import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import { parseStudentExcel } from "../utils/parseStudentExcel.js";
import { distance } from "fastest-levenshtein";

const VALID_MUNICIPALITIES = [
    "Botkyrka",
    "Danderyd",
    "Huddinge",
    "Järfälla",
    "KCNO",
    "Lidingö",
    "Norrtälje",
    "Nykvarn",
    "Privat kunder",
    "Salem",
    "Sigtuna",
    "Sollentuna",
    "Solna",
    "Sundbyberg",
    "Södertälje",
    "Täby",
    "Upplands Bro",
    "Upplands Väsby",
    "Vallentuna",
    "Vaxholm",
    "Växjö",
    "Österåker",
];

function getClosestMunicipality(input) {
    if (!input) return null;
    let bestMatch = null;
    let minDistance = Infinity;

    for (const m of VALID_MUNICIPALITIES) {
        const d = distance(input.toLowerCase(), m.toLowerCase());
        if (d < minDistance) {
            minDistance = d;
            bestMatch = m;
        }
    }

    return minDistance <= 4 ? bestMatch : null; // threshold can be adjusted
}

async function uploadXlsx(req, res) {
    console.log("🟢 Received XLSX file upload request");

    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const teacherName = fileName.split(" ").pop().split(".")[0];

        const parsedStudents = await parseStudentExcel(fileBuffer, teacherName);
        if (parsedStudents.length === 0) {
            return res.status(400).json({ error: "No valid data to save." });
        }

        const emails = parsedStudents.map((s) => s.email);
        const existingStudents = await Student.find({ email: { $in: emails } });
        const existingMap = new Map(existingStudents.map((s) => [s.email, s]));

        const educationEntries = parsedStudents.flatMap((s) => s.education);
        const allNames = [...new Set(educationEntries.map((e) => e.name))];

        const [programs, packages, courses] = await Promise.all([
            Program.find({ programName: { $in: allNames } }).lean(),
            CoursePackage.find({ coursePackageName: { $in: allNames } }).lean(),
            Course.find({ courseName: { $in: allNames } }).lean(),
        ]);

        const programMap = Object.fromEntries(
            programs.map((p) => [p.programName, p._id])
        );
        const packageMap = Object.fromEntries(
            packages.map((p) => [p.coursePackageName, p._id])
        );
        const courseMap = Object.fromEntries(
            courses.map((c) => [c.courseName, c._id])
        );

        const now = new Date();

        const studentsToSave = parsedStudents.map((student) => {
            const existing = existingMap.get(student.email);

            const education = student.education.map((entry) => {
                let refId = null;
                let type = entry.type;

                if (programMap[entry.name]) {
                    refId = programMap[entry.name];
                    type = "Program";
                } else if (packageMap[entry.name]) {
                    refId = packageMap[entry.name];
                    type = "CoursePackage";
                } else if (courseMap[entry.name]) {
                    refId = courseMap[entry.name];
                    type = "Course";
                } else {
                    type = entry.type !== "Auto" ? entry.type : "Course";
                }

                return {
                    type,
                    refId,
                    name: entry.name,
                    grade: null,
                    addedAt: now,
                    addedBy: teacherName,
                    removedAt: null,
                };
            });

            const rawMunicipality = student.municipality;
            const raw =
                typeof rawMunicipality === "string"
                    ? rawMunicipality
                    : rawMunicipality?.type || "";

            const correctedMunicipality = getClosestMunicipality(raw);
            if (!correctedMunicipality) {
                console.warn(`⚠️ Unknown municipality: "${raw}"`);
            }

            return {
                ...student,
                education,
                municipality: correctedMunicipality || null,
                aplStatus: existing ? existing.aplStatus : "GRAY",
                createdAt: existing?.createdAt || now,
                updatedAt: now,
                uploadedBy: teacherName,
            };
        });

        const bulkOps = studentsToSave.map((student) => ({
            updateOne: {
                filter: { email: student.email },
                update: { $set: student },
                upsert: true,
            },
        }));

        await Student.bulkWrite(bulkOps);

        const sample = await Student.findOne({
            email: parsedStudents[0].email,
        });
        console.log("🔍 Sample saved student.education:", sample.education);

        res.status(200).json({
            message: "Upload successful",
            students: studentsToSave,
        });
    } catch (err) {
        console.error("❌ Upload failed:", err);
        res.status(500).json({
            error: "Failed to process file",
            details: err.message,
        });
    }
}

export { uploadXlsx };
