/**
 * Student Controller
 * Handles student data, normalization, municipality matching, and related utilities.
 * Uses Student, Program, Course, User and CoursePackage models.
 */
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import CoursePackage from "../models/CoursePackage.js";
import {
    parseStudentExcel,
    normalizeCodeForMatching,
} from "../utils/parseStudentExcel.js";
import { distance } from "fastest-levenshtein";
import { ALL_MUNICIPALITIES } from "../config/municipalities.js";
import { createOrFindTeacher } from "../utils/teacherService.js";
import logger from "../utils/logger.js";
import { maybeSendLarteametEmail, SOLLENTUNA_MUNICIPALITY } from "../services/emailService.js";

logger.debug("studentController.js loaded");

/**
 * Normalizes a string by removing special characters, accents, and converting to lowercase.
 * @param {string} value - The string to normalize
 * @returns {string} The normalized string
 */
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

/**
 * Returns the closest valid municipality name to the input using Levenshtein distance.
 */
// Single source of truth shared with the Student model enum, so every valid
// kommun (incl. Stockholm and Göteborg) is accepted by the Alvis import.
const VALID_MUNICIPALITIES = ALL_MUNICIPALITIES;

/**
 * Returns the closest valid municipality name to the input using Levenshtein distance.
 * @param {string} input - The input municipality name
 * @returns {string|null} The closest valid municipality or null
 */
export function getClosestMunicipality(input) {
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

/**
 * Builds a normalized map from an array of original names.
 * @param {string[]} originals - Array of original names
 * @returns {Object} Map of normalized names to original names
 */
function buildNormalizedMap(originals) {
    const map = {};
    for (const name of originals) {
        map[normalize(name)] = name;
    }
    return map;
}

/**
 * Normalizes a municipality name, handling common aliases.
 * @param {string} name - The municipality name
 * @returns {string} The normalized municipality name
 */
export function normalizeMunicipalityName(name) {
    if (!name) return name;
    const trimmed = name.trim().toLowerCase();

    // Alias map for common variants
    const aliasMap = {
        "uppl väsby": "Upplands Väsby",
        "uppl. väsby": "Upplands Väsby",
        "upplands väsby": "Upplands Väsby", // canonical
        // Add more aliases as needed
    };

    if (aliasMap[trimmed]) {
        return aliasMap[trimmed];
    }

    // Fallback: fuzzy match for anything containing both "uppl" and "väsby"
    if (trimmed.includes("uppl") && trimmed.includes("väsby")) {
        return "Upplands Väsby";
    }

    return name;
}

// ✅ Main upload function
async function uploadXlsx(req, res) {
    logger.debug("uploadXlsx called");
    logger.info("Received XLSX file upload request");

    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        const fileBuffer = req.file.buffer;
        // Teacher will be read from the document, so we pass empty string as fallback
        const teacherNameFallback = "";
        const parsedStudents = await parseStudentExcel(
            fileBuffer,
            teacherNameFallback
        );

        // Teacher will be read from each student's "Lärare" column in the document
        // Use the first student's teacher as fallback for metadata fields if needed
        let teacherNameFallbackForMetadata = teacherNameFallback;
        if (parsedStudents.length > 0 && parsedStudents[0].teacher) {
            teacherNameFallbackForMetadata = parsedStudents[0].teacher.trim();
        }
        if (parsedStudents.length === 0) {
            return res.status(400).json({ error: "No valid data to save." });
        }

        // ✅ Group by email and merge multiple entries
        const grouped = new Map();
        for (const s of parsedStudents) {
            if (!s.email) continue;
            if (grouped.has(s.email)) {
                const existingGroup = grouped.get(s.email);
                existingGroup.education.push(...(s.education || []));
                if (!existingGroup.pace && s.pace) {
                    existingGroup.pace = s.pace;
                }
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
        // Use coursePackageCode for matching
        const packageMap = Object.fromEntries(
            packages.map((p) => [p.coursePackageCode, p._id])
        );
        // Use courseCode for matching
        const courseMap = Object.fromEntries(
            courses.map((c) => [c.courseCode, c._id])
        );

        const normalizedProgramMap = buildNormalizedMap(
            Object.keys(programMap)
        );
        // Build normalized maps using codes (apply same normalization as Excel parser)
        const normalizedPackageMap = {};
        for (const pkg of packages) {
            const norm = normalizeCodeForMatching(pkg.coursePackageCode || "");
            normalizedPackageMap[norm] = pkg.coursePackageCode;
            logger.debug({ original: pkg.coursePackageCode, normalized: norm }, "Package code mapping");
        }
        const normalizedCourseMap = {};
        for (const c of courses) {
            const norm = normalizeCodeForMatching(c.courseCode || "");
            normalizedCourseMap[norm] = c.courseCode;
            logger.debug({ original: c.courseCode, normalized: norm }, "Course code mapping");
        }
        logger.debug({ count: Object.keys(normalizedPackageMap).length }, "Total packages in map");
        logger.debug({ count: Object.keys(normalizedCourseMap).length }, "Total courses in map");

        const now = new Date();

        // ---------------------------------------------
        // Pre-validation: abort upload if any course cannot be matched
        // ---------------------------------------------
        (function prevalidateUnmatchedCourses() {
            const reasons = [];

            function strictMatch(target, candidates) {
                // Only exact match - no fuzzy matching
                if (candidates.includes(target)) return target;
                return null;
            }

            for (const student of mergedStudents) {
                const studentIdLabel =
                    student.email || student.name || "unknown";
                const entries = Array.isArray(student.education)
                    ? student.education
                    : [];
                for (const entry of entries) {
                    // Skip empty entries
                    if (!entry.name || !entry.name.trim()) {
                        continue;
                    }

                    // Normalize as code using the same function as database codes
                    // (entry.name already has cleanCourseName applied during parsing)
                    const originalName = entry.name || "";
                    let normalizedName = normalizeCodeForMatching(originalName);

                    // Skip if normalization resulted in empty string
                    if (!normalizedName) {
                        logger.debug({ originalName }, "Skipping entry with empty normalized name");
                        continue;
                    }

                    logger.debug({ originalName, normalized: normalizedName }, "Matching entry");

                    const isCourse = /NIVÅ\s*\d+$/i.test(normalizedName);
                    let type = isCourse ? "Course" : "CoursePackage";

                    const matchPackage = strictMatch(
                        normalizedName,
                        Object.keys(normalizedPackageMap)
                    );
                    const matchCourse = strictMatch(
                        normalizedName,
                        Object.keys(normalizedCourseMap)
                    );

                    logger.debug({
                        normalized: normalizedName,
                        package: matchPackage || "none",
                        course: matchCourse || "none",
                    }, "Match results");
                    logger.debug({
                        packageKeys: Object.keys(normalizedPackageMap).slice(0, 10),
                    }, "Available package keys");
                    logger.debug({
                        courseKeys: Object.keys(normalizedCourseMap).slice(0, 10),
                    }, "Available course keys");

                    // Treat as failure when an entry is a course and neither a course nor package match exists
                    if (type === "Course" && !matchCourse && !matchPackage) {
                        // Find closest matches for better error message
                        let closestPkg = null,
                            closestPkgDist = Infinity;
                        let closestCourse = null,
                            closestCourseDist = Infinity;
                        for (const key of Object.keys(normalizedPackageMap)) {
                            const d = distance(normalizedName, key);
                            if (d < closestPkgDist) {
                                closestPkgDist = d;
                                closestPkg = normalizedPackageMap[key];
                            }
                        }
                        for (const key of Object.keys(normalizedCourseMap)) {
                            const d = distance(normalizedName, key);
                            if (d < closestCourseDist) {
                                closestCourseDist = d;
                                closestCourse = normalizedCourseMap[key];
                            }
                        }

                        const suggestions = [];
                        if (closestPkg && closestPkgDist <= 3) {
                            suggestions.push(
                                `closest package: "${closestPkg}" (distance: ${closestPkgDist})`
                            );
                        }
                        if (closestCourse && closestCourseDist <= 3) {
                            suggestions.push(
                                `closest course: "${closestCourse}" (distance: ${closestCourseDist})`
                            );
                        }

                        reasons.push({
                            type: "no_match",
                            student: studentIdLabel,
                            courseName: entry.name,
                            normalizedName: normalizedName,
                            message: `No matching course found for "${
                                entry.name
                            }" (normalized: "${normalizedName}") for student ${studentIdLabel}. ${
                                suggestions.length > 0
                                    ? "Suggestions: " + suggestions.join(", ")
                                    : ""
                            }`,
                        });
                    }
                }
            }

            if (reasons.length > 0) {
                throw Object.assign(
                    new Error("Unmatched courses found; upload aborted."),
                    {
                        statusCode: 422,
                        reasons,
                    }
                );
            }
        })();

        const warnings = [];
        const larteametCandidates = [];
        // The uploader is recorded on the created enrollments (a real ObjectId or null).
        const uploaderId = mongoose.Types.ObjectId.isValid(req.user?.userId)
            ? req.user.userId
            : null;
        // The mapped entries (refId/type/dates) per student: the enrollment step
        // below processes exactly the same data as the manual POST /student flow.
        // They are never stored on the student (#103).
        const educationByEmail = new Map();
        const bulkOps = await Promise.all(
            mergedStudents.map(async (student) => {
                const existing = existingMap.get(student.email);

                let rawMunicipality =
                    typeof student.municipality === "string"
                        ? student.municipality
                        : student.municipality?.type || "";
                rawMunicipality = normalizeMunicipalityName(rawMunicipality);
                const correctedMunicipality =
                    getClosestMunicipality(rawMunicipality);
                if (!correctedMunicipality) {
                    throw new Error(
                        `❌ Could not match municipality: "${rawMunicipality}"`
                    );
                }

                // Remember the resolved municipality per student so the
                // Lärteamet trigger (#26) can fire for NEWLY created records
                // after the bulk write, without extra DB reads.
                larteametCandidates.push({
                    email: student.email,
                    name: student.name,
                    municipality: correctedMunicipality,
                });

                // Convert education entries → { refId, type, ... }
                const studentWarnings = [];
                const newEducation = (student.education || [])
                    .map((entry) => {
                        // Skip blank rows; the parser already trims names but an
                        // empty entry must never reach the student document.
                        if (!entry?.name || !entry.name.trim()) return null;

                        // Normalize as code using the same function as database codes
                        // (entry.name already has cleanCourseName applied during parsing)
                        const normalized = normalizeCodeForMatching(entry.name || "");
                        if (!normalized) return null;

                        // Name ending is only a hint. The actual collection match
                        // below decides the type so a course code without the
                        // "NIVÅ N" suffix is still stored as a Course.
                        const looksLikeCourse = /NIVÅ\s*\d+$/i.test(normalized);

                        // Always log normalized input and all normalized package keys
                        logger.debug({ normalized, packageKeys: Object.keys(normalizedPackageMap) }, "Normalized input and package keys");

                        // Only exact match - no fuzzy matching
                        function strictMatch(target, candidates) {
                            if (candidates.includes(target)) return target;
                            return null;
                        }

                        const matchProgram = strictMatch(
                            normalized,
                            Object.keys(normalizedProgramMap)
                        );
                        const matchPackage = strictMatch(
                            normalized,
                            Object.keys(normalizedPackageMap)
                        );
                        const matchCourse = strictMatch(
                            normalized,
                            Object.keys(normalizedCourseMap)
                        );

                        let type = looksLikeCourse ? "Course" : "CoursePackage";
                        let refId = null;

                        if (matchProgram) {
                            type = "Program";
                            refId = programMap[normalizedProgramMap[matchProgram]];
                        } else if (matchPackage) {
                            type = "CoursePackage";
                            refId = packageMap[normalizedPackageMap[matchPackage]];
                        } else if (matchCourse) {
                            type = "Course";
                            refId = courseMap[normalizedCourseMap[matchCourse]];
                        } else {
                            // No exact match: default to Course and surface a
                            // non-blocking warning so the uploader can fix the
                            // row without the whole file being rejected.
                            type = "Course";
                            let bestPkg = null,
                                bestPkgDist = Infinity;
                            for (const candidate of Object.keys(
                                normalizedPackageMap
                            )) {
                                const d = distance(normalized, candidate);
                                if (d < bestPkgDist) {
                                    bestPkgDist = d;
                                    bestPkg = candidate;
                                }
                            }
                            let bestCourse = null,
                                bestCourseDist = Infinity;
                            for (const candidate of Object.keys(
                                normalizedCourseMap
                            )) {
                                const d = distance(normalized, candidate);
                                if (d < bestCourseDist) {
                                    bestCourseDist = d;
                                    bestCourse = candidate;
                                }
                            }
                            logger.warn({
                                entryName: entry.name,
                                normalized,
                                bestPackage: bestPkg,
                                bestPackageDistance: bestPkgDist,
                                bestCourse,
                                bestCourseDistance: bestCourseDist,
                                packageKeys: Object.keys(normalizedPackageMap),
                            }, "No match found");
                            logger.warn({
                                entryName: entry.name,
                                type,
                                matchPackage,
                                normalized,
                                packageKeys: Object.keys(normalizedPackageMap),
                            }, "Pushing no_match warning");
                            studentWarnings.push({
                                type: "no_match",
                                courseName: entry.name,
                                message: `No matching course found for \"${entry.name}\"`,
                            });
                        }

                        return {
                            type,
                            refId,
                            name: entry.name,
                            // Dates are required for APL period derivation and
                            // for de-duplicating re-uploads of the same row.
                            startDate: entry.startDate
                                ? new Date(entry.startDate)
                                : undefined,
                            endDate: entry.endDate
                                ? new Date(entry.endDate)
                                : undefined,
                            grade: null,
                            addedAt: now,
                            // Must be an ObjectId-compatible value; a teacher
                            // name here made Mongoose reject the bulkWrite.
                            addedBy: uploaderId,
                            removedAt: null,
                        };
                    })
                    .filter(Boolean);
                // After processing this student, add their warnings to the global array
                warnings.push(...studentWarnings);

                // The enrollment step below places exactly these entries.
                educationByEmail.set(student.email, newEducation);

                let teacherDoc = null;
                if (student.teacher) {
                    const rawName = student.teacher.trim();
                    const firstName = rawName.split(",")[0].split(" ")[0];
                    const user = await User.findOne({
                        username: new RegExp(`^${firstName}`, "i"),
                    });
                    if (user) {
                        // The teacher is the User itself when it has a teacher profile (#102).
                        teacherDoc = user.teacherProfile ? user : null;
                        if (!user.username) {
                            logger.warn({ user }, "User found without username");
                        }
                    } else {
                        // Auto-create teacher with subject if not found
                        const { teacher } = await createOrFindTeacher(
                            rawName,
                            null,
                            student.subject || "Övrigt"
                        );
                        teacherDoc = teacher;
                    }
                }

                // Parsed course rows become enrollments below, not a stored array.
                const { education: _parsedEducation, ...studentFields } = student;
                const studentDoc = {
                    ...studentFields,
                    teacherId: teacherDoc?._id || null,
                    municipality: { type: correctedMunicipality },
                    aplStatus: existing?.aplStatus || "GRAY",
                    createdAt: existing?.createdAt || now,
                    updatedAt: now,
                    uploadedBy:
                        student.teacher?.trim() ||
                        teacherNameFallbackForMetadata,
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

        // Persist the imported education through the same service used by
        // manual student creation (POST /student) so courses/packages are not
        // silently dropped and both upload methods produce equivalent
        // enrollments for APL (#103: enrollments are the only record). A single student's enrollment
        // failure must not abort the rest of the import.
        try {
            const savedStudents = await Student.find({
                email: { $in: emails },
            })
                .select("_id email pace")
                .lean();
            const savedByEmail = new Map(
                savedStudents.map((student) => [student.email, student])
            );
            const { default: CourseMatchingService } = await import(
                "../utils/courseMatchingService.js"
            );

            for (const student of mergedStudents) {
                const saved = savedByEmail.get(student.email);
                const processedEducation =
                    educationByEmail.get(student.email) ||
                    student.education ||
                    [];
                if (!saved || processedEducation.length === 0) continue;

                try {
                    // An explicit STUDIETAKT cell makes the pace authoritative:
                    // course lengths and exam dates are recalculated from the
                    // course extent instead of trusting the spreadsheet dates.
                    const parsedPace = student.pace
                        ? Number(student.pace)
                        : null;
                    const applyPace = parsedPace !== null;
                    const result =
                        await CourseMatchingService.processStudentEducation(
                            saved._id,
                            processedEducation,
                            uploaderId,
                            {
                                pace: parsedPace || saved.pace || 100,
                                applyPace,
                            }
                        );
                    if (result?.errors?.length) {
                        logger.error(
                            { errors: result.errors, studentId: saved._id },
                            "Enrollment errors from Excel import"
                        );
                    }

                    if (applyPace) {
                        const { recalculateStudentScheduleSummary } =
                            await import("../services/enrollmentService.js");
                        await recalculateStudentScheduleSummary(saved._id);
                    }
                } catch (enrollmentError) {
                    logger.error(
                        { err: enrollmentError, studentId: saved._id },
                        "Failed to create enrollments from Excel import"
                    );
                }
            }
        } catch (enrollmentImportError) {
            logger.error(
                { err: enrollmentImportError },
                "Failed to process enrollments from Excel import"
            );
        }

        // Requirement #26: every NEWLY created Sollentuna student gets the
        // Lärteamet admission email. Pre-existing students (matched by email in
        // existingMap) are updated, never re-triggered. One failed send is
        // logged and must not abort the rest of the import.
        const newlyCreated = larteametCandidates.filter(
            (candidate) => !existingMap.has(candidate.email)
        );
        await Promise.all(
            newlyCreated.map(async (candidate) => {
                if (candidate.municipality !== SOLLENTUNA_MUNICIPALITY) return;
                try {
                    await maybeSendLarteametEmail({
                        student: candidate,
                        studentName: candidate.name,
                        email: candidate.email,
                    });
                } catch (emailError) {
                    logger.error({ err: emailError }, "Lärteamet email trigger failed (non-fatal)");
                }
            })
        );

        res.status(200).json({
            message: "Upload successful",
            students: mergedStudents,
            warnings,
        });
    } catch (err) {
        logger.error({ err }, "Upload failed");
        const status = err.statusCode || 500;
        const payload =
            err.statusCode === 422
                ? {
                      error: "Unmatched courses found; upload aborted.",
                      reasons: err.reasons,
                  }
                : { error: "Failed to process file", details: err.message };
        res.status(status).json(payload);
    }
}

export { uploadXlsx };
