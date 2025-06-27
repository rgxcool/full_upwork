import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import { parseStudentExcel } from "../utils/parseStudentExcel.js";
import { distance } from "fastest-levenshtein";

// ✅ Normalize any input string
function normalize(value) {
    if (!value) return "";
    return value
        .toString()
        .replace(/\(.*?\)/g, "") // Remove (REVIDERAD)
        .replace(/\bmot\b/gi, "") // Remove the word "mot"
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
}

// ✅ Levenshtein-based closest match (no threshold)
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

// ✅ Match municipalities by fuzzy name
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

// ✅ Build a lookup map of normalized → original
function buildNormalizedMap(originals) {
    const map = {};
    for (const name of originals) {
        map[normalize(name)] = name;
    }
    return map;
}

// ✅ Main upload route
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

        const studentsToSave = parsedStudents.map((student) => {
            const existing = existingMap.get(student.email);

            const education = Array.isArray(student.education)
                ? student.education.map((entry) => {
                      const normalizedEntryName = normalize(entry.name);

                      const matchedProgramNorm = getBestFuzzyMatch(
                          normalizedEntryName,
                          Object.keys(normalizedProgramMap),
                          0.3
                      );
                      const matchedPackageNorm = getBestFuzzyMatch(
                          normalizedEntryName,
                          Object.keys(normalizedPackageMap),
                          0.3
                      );
                      const matchedCourseNorm = getBestFuzzyMatch(
                          normalizedEntryName,
                          Object.keys(normalizedCourseMap),
                          0.3
                      );

                      let refId = null;
                      let type = entry.type;

                      if (matchedProgramNorm) {
                          const original =
                              normalizedProgramMap[matchedProgramNorm];
                          refId = programMap[original];
                          type = "Program";
                      } else if (matchedPackageNorm) {
                          const original =
                              normalizedPackageMap[matchedPackageNorm];
                          refId = packageMap[original];
                          type = "CoursePackage";
                      } else if (matchedCourseNorm) {
                          const original =
                              normalizedCourseMap[matchedCourseNorm];
                          refId = courseMap[original];
                          type = "Course";
                      }

                      if (!refId) {
                          if (!type || type === "Auto") type = "Course";
                          console.warn(
                              `🟡 No match for: "${entry.name}" → "${normalizedEntryName}"`
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
                  })
                : [];

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

            return {
                ...student,
                education,
                municipality: { type: correctedMunicipality },
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
