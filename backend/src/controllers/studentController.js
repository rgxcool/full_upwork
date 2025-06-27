import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import { parseStudentExcel } from "../utils/parseStudentExcel.js";
import { distance } from "fastest-levenshtein";

// Normalize a string
function normalize(value) {
    if (!value) return "";
    return value
        .toString()
        .replace(/\(.*?\)/g, "")
        .replace(/\bmot\b/gi, "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
}

function getBestFuzzyMatch(target, candidates, maxRatio = 0.3) {
    let best = null;
    let minDistance = Infinity;

    for (const candidate of candidates) {
        const d = distance(target, candidate);
        if (d < minDistance) {
            minDistance = d;
            best = candidate;
        }
    }

    const maxAllowed = Math.floor(target.length * maxRatio);
    return minDistance <= maxAllowed ? best : null;
}

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
    return minDistance <= 4 ? bestMatch : null;
}

function buildNormalizedMap(originals) {
    const map = {};
    for (const name of originals) {
        map[normalize(name)] = name;
    }
    return map;
}

// ✅ Main upload function
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

        // ✅ Group by email and merge multiple entries
        const grouped = new Map();
        for (const s of parsedStudents) {
            if (!s.email) continue;
            if (grouped.has(s.email)) {
                grouped.get(s.email).education.push(...(s.education || []));
            } else {
                grouped.set(s.email, {
                    ...s,
                    education: [...(s.education || [])],
                });
            }
        }

        const mergedStudents = [...grouped.values()];
        const emails = mergedStudents.map((s) => s.email);
        const existingStudents = await Student.find({ email: { $in: emails } });
        const existingMap = new Map(existingStudents.map((s) => [s.email, s]));

        const [programs, packages, courses] = await Promise.all([
            Program.find({}).lean(),
            CoursePackage.find({}).lean(),
            Course.find({}).lean(),
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

        const normalizedProgramMap = buildNormalizedMap(
            Object.keys(programMap)
        );
        const normalizedPackageMap = buildNormalizedMap(
            Object.keys(packageMap)
        );
        const normalizedCourseMap = buildNormalizedMap(Object.keys(courseMap));

        const now = new Date();

        const bulkOps = await Promise.all(
            mergedStudents.map(async (student) => {
                const existing = existingMap.get(student.email);
                const existingEdu = existing?.education || [];

                const rawMunicipality =
                    typeof student.municipality === "string"
                        ? student.municipality
                        : student.municipality?.type || "";
                const correctedMunicipality =
                    getClosestMunicipality(rawMunicipality);
                if (!correctedMunicipality) {
                    throw new Error(
                        `❌ Could not match municipality: "${rawMunicipality}"`
                    );
                }

                // Convert education entries → { refId, type, ... }
                const newEducation = student.education.map((entry) => {
                    const normalized = normalize(entry.name);

                    const matchProgram = getBestFuzzyMatch(
                        normalized,
                        Object.keys(normalizedProgramMap)
                    );
                    const matchPackage = getBestFuzzyMatch(
                        normalized,
                        Object.keys(normalizedPackageMap)
                    );
                    const matchCourse = getBestFuzzyMatch(
                        normalized,
                        Object.keys(normalizedCourseMap)
                    );

                    let refId = null;
                    let type = entry.type;

                    if (matchProgram) {
                        refId = programMap[normalizedProgramMap[matchProgram]];
                        type = "Program";
                    } else if (matchPackage) {
                        refId = packageMap[normalizedPackageMap[matchPackage]];
                        type = "CoursePackage";
                    } else if (matchCourse) {
                        refId = courseMap[normalizedCourseMap[matchCourse]];
                        type = "Course";
                    } else {
                        if (!type || type === "Auto") type = "Course";
                        console.warn(
                            `🟡 No match for: "${entry.name}" → "${normalized}"`
                        );
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

                // Merge new education with existing
                const mergedEducation = [...existingEdu];
                for (const e of newEducation) {
                    const exists = mergedEducation.some(
                        (old) =>
                            old.refId?.toString() === e.refId?.toString() &&
                            old.type === e.type
                    );
                    if (!exists) mergedEducation.push(e);
                }

                const studentDoc = {
                    ...student,
                    education: mergedEducation,
                    municipality: { type: correctedMunicipality },
                    aplStatus: existing?.aplStatus || "GRAY",
                    createdAt: existing?.createdAt || now,
                    updatedAt: now,
                    uploadedBy: teacherName,
                };

                return {
                    updateOne: {
                        filter: { email: student.email },
                        update: { $set: studentDoc },
                        upsert: true,
                    },
                };
            })
        );

        await Student.bulkWrite(bulkOps);

        const sample = await Student.findOne({
            email: mergedStudents[0].email,
        });
        console.log("🔍 Sample saved student.education:", sample.education);

        res.status(200).json({
            message: "Upload successful",
            students: mergedStudents,
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
