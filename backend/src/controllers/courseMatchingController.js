import CourseMatchingService from "../utils/courseMatchingService.js";
import Student from "../models/Student.js";
import CourseInstance from "../models/CourseInstance.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { parseStudentExcel, normalizeCodeForMatching } from "../utils/parseStudentExcel.js";
import { createOrFindTeacher } from "../utils/teacherService.js";
import { createGlobalNotification } from "../controllers/notificationController.js";
import { normalizeMunicipalityName } from "./studentController.js";
import Course from "../models/Course.js";
import { distance } from "fastest-levenshtein";
import mongoose from "mongoose";

/**
 * Course Matching Controller
 * Handles endpoints for uploading students, matching courses, managing enrollments, and course instances.
 * Relies on CourseMatchingService and related models/utilities.
 */
import CoursePackage from "../models/CoursePackage.js";

console.log("[DEBUG] courseMatchingController.js loaded");

const formatDateOnlyUTC = (dateValue) => {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "";
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const getInstanceKey = (instance) => {
    const mainCourseId = String(
        instance.mainCourseId?._id || instance.mainCourseId || ""
    );
    const responsibleTeacher = String(
        instance.responsibleTeacher?._id || instance.responsibleTeacher || ""
    );
    const startKey = formatDateOnlyUTC(instance.startDate);
    const endKey = formatDateOnlyUTC(instance.endDate);
    return `${mainCourseId}|${responsibleTeacher}|${startKey}|${endKey}`;
};

const mergeDuplicateCourseInstances = async (instances) => {
    if (!instances || instances.length === 0) return false;
    const grouped = new Map();
    for (const instance of instances) {
        const key = getInstanceKey(instance);
        if (!key) continue;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(instance);
    }

    let mergedAny = false;
    for (const duplicates of grouped.values()) {
        if (duplicates.length <= 1) continue;
        mergedAny = true;

        const counts = await Promise.all(
            duplicates.map(async (instance) => {
                const count = await StudentEnrollment.countDocuments({
                    courseInstanceId: instance._id,
                });
                return { instance, count };
            })
        );
        counts.sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return new Date(a.instance.createdAt || 0) - new Date(b.instance.createdAt || 0);
        });

        const base = counts[0].instance;
        const duplicatesToMerge = counts.slice(1).map((c) => c.instance);

        let needsSave = false;
        for (const dup of duplicatesToMerge) {
            await StudentEnrollment.updateMany(
                { courseInstanceId: dup._id },
                { $set: { courseInstanceId: base._id } }
            );

            if (!base.responsibleTeacher && dup.responsibleTeacher) {
                base.responsibleTeacher = dup.responsibleTeacher;
                needsSave = true;
            }
            if (!base.slutprovDate && dup.slutprovDate) {
                base.slutprovDate = dup.slutprovDate;
                needsSave = true;
            }
            if (base.isActive === false && dup.isActive === true) {
                base.isActive = true;
                needsSave = true;
            }
        }

        if (needsSave) {
            await base.save();
        }

        const duplicateIds = duplicatesToMerge.map((d) => d._id);
        await CourseInstance.deleteMany({ _id: { $in: duplicateIds } });
    }

    return mergedAny;
};

/**
 * Uploads an Excel file of students for course matching, parses the file, creates teachers if needed, and returns results.
 * @async
 * @param {import('express').Request} req - Express request object (expects file upload)
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const uploadStudentsForMatching = async (req, res) => {
    console.log("[DEBUG] uploadStudentsForMatching called");
    try {
        console.log("🔍 req.user:", req.user);
        console.log("🔍 req.userId:", req.userId);
        console.log("🔍 req.cookies:", req.cookies);

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        // Teacher will be read from the document, so we pass empty string as fallback
        const teacherNameFallback = "";

        // Parse students using the existing parser
        const parsedStudents = await parseStudentExcel(fileBuffer, teacherNameFallback);

        console.log(`[DEBUG] 📊 Excel parsing results:`);
        console.log(
            `[DEBUG] Total students parsed from Excel: ${parsedStudents.length}`
        );
        console.log(
            `[DEBUG] Student names:`,
            parsedStudents.map((s) => s.name || s.email || "unknown")
        );

        // ✅ Group by email and merge multiple entries (same logic as studentController.js)
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
        console.log(
            `[DEBUG] 📊 After deduplication: ${mergedStudents.length} unique students`
        );
        console.log(
            `[DEBUG] Merged student names:`,
            mergedStudents.map((s) => s.name || s.email || "unknown")
        );

        if (mergedStudents.length === 0) {
            return res
                .status(400)
                .json({ error: "No valid data found in file." });
        }

        const results = {
            students: [],
            warnings: [],
            errors: [],
            createdTeachers: [],
            enrollments: [], // <-- add this line
        };

        // ---------------------------------------------
        // Sanitize and pre-validate parsed data before any DB writes
        // - Convert Excel richText objects to strings
        // - Ensure education entry names are strings
        // - Collect reasons and abort with 422 if any unconvertible values exist
        // ---------------------------------------------
        (function sanitizeAndValidateParsedStudents() {
            const reasons = [];

            function coerceToString(value) {
                if (value === undefined || value === null) return "";
                if (typeof value === "string") return value;
                if (typeof value === "number" || typeof value === "boolean")
                    return String(value);
                if (typeof value === "object") {
                    // xlsx richText object: { richText: [ { text: '...' }, ... ] }
                    if (Array.isArray(value.richText)) {
                        return value.richText
                            .map((part) =>
                                typeof part?.text === "string" ? part.text : ""
                            )
                            .join("");
                    }
                    if (typeof value.text === "string") {
                        return value.text;
                    }
                }
                return null; // not safely convertible
            }

            for (const student of mergedStudents) {
                const studentIdLabel =
                    student.email || student.name || "unknown";

                // additionalInfo
                const coercedAdditional = coerceToString(
                    student.additionalInfo
                );
                if (coercedAdditional === null) {
                    reasons.push({
                        type: "invalid_field",
                        student: studentIdLabel,
                        studentEmail: student.email || "",
                        studentName: student.name || "",
                        field: "ÖVRIGT (additionalInfo)",
                        fieldValue: JSON.stringify(student.additionalInfo),
                        message: `Kunde inte konvertera fältet 'ÖVRIGT' till text för student ${studentIdLabel}. Fältet innehåller data som inte kan läsas korrekt. Kontrollera att cellen innehåller vanlig text och inte formaterade objekt.`,
                        suggestion: "Kontrollera kolumnen 'ÖVRIGT' i Excel-filen och se till att den innehåller vanlig text.",
                    });
                } else {
                    student.additionalInfo = coercedAdditional;
                }

                // education entry names
                if (Array.isArray(student.education)) {
                    for (const entry of student.education) {
                        const coercedName = coerceToString(entry?.name);
                        if (coercedName === null || coercedName.trim() === "") {
                            reasons.push({
                                type: "invalid_field",
                                student: studentIdLabel,
                                studentEmail: student.email || "",
                                studentName: student.name || "",
                                field: "KURS/PAKET",
                                fieldValue: JSON.stringify(entry?.name),
                                message: `Ogiltigt eller tomt kurs-/paketnamn för student ${studentIdLabel}. Kolumnen 'KURS/PAKET' måste innehålla en kurskod eller paketkod.`,
                                suggestion: "Kontrollera att kolumnen 'KURS/PAKET' innehåller en giltig kurskod (t.ex. MATE2A00X) eller paketkod (t.ex. KVARVO).",
                            });
                        } else {
                            entry.name = coercedName;
                        }
                    }
                }
            }

            if (reasons.length > 0) {
                const errorSummary = `Validering misslyckades: ${reasons.length} fel hittades i dokumentet.`;
                const error = new Error(errorSummary);
                error.statusCode = 422;
                error.reasons = reasons;
                error.detailedMessage = `Dokumentet innehåller ${reasons.length} fel som måste åtgärdas innan uppladdning kan fortsätta. Se detaljerna nedan för mer information.`;
                throw error;
            }
        })();

        // Collect all unique teachers from the document and create/find them
        const uniqueTeachers = new Set();
        for (const student of mergedStudents) {
            if (student.teacher && student.teacher.trim()) {
                uniqueTeachers.add(student.teacher.trim());
            }
        }

        // Create a map of teacher names to teacher documents
        const teacherMap = new Map();
        for (const teacherName of uniqueTeachers) {
            try {
                const teacherResult = await createOrFindTeacher(
                    teacherName,
                    req.user?.userId
                );

                if (teacherResult.wasCreated) {
                    const safeUsername =
                        teacherResult.user?.username || teacherName;
                    const safeEmail =
                        teacherResult.user?.email ||
                        `${teacherName
                            .toLowerCase()
                            .replace(/\s+/g, ".")}@mindful.se`;
                    results.createdTeachers.push({
                        name: safeUsername,
                        email: safeEmail,
                        password: teacherResult.password,
                        subject: teacherResult.teacher?.subject || "Övrigt",
                    });

                    console.log(`👨‍🏫 Auto-created teacher: ${safeUsername}`);

                    // Create notification for the user who uploaded the file
                    try {
                        await createGlobalNotification(
                            "teacher_auto_created",
                            `Lärare "${safeUsername}" skapades automatiskt vid uppladdning av studenter. Lösenord: ${teacherResult.password}`
                        );
                    } catch (notificationError) {
                        console.error(
                            "❌ Error creating notification:",
                            notificationError
                        );
                    }
                }

                teacherMap.set(teacherName, teacherResult.teacher);
                console.log(
                    `[DEBUG] Teacher mapped: '${teacherName}' → ${teacherResult.teacher?._id || 'null'}`
                );
            } catch (error) {
                console.error(
                    `❌ Error handling teacher creation for '${teacherName}':`,
                    error
                );
                results.errors.push({
                    type: "teacher_creation",
                    teacher: teacherName,
                    field: "Lärare",
                    error: error.message,
                    message: `Kunde inte skapa eller hitta lärare "${teacherName}": ${error.message}`,
                    suggestion: `Kontrollera att lärarens namn i kolumnen 'Lärare' är korrekt angivet. Om läraren inte finns i systemet kommer en ny lärare att skapas automatiskt, men detta kan misslyckas om namnet är ogiltigt.`,
                });
            }
        }

        // Build normalized package map using coursePackageCode
        const allPackages = await CoursePackage.find({}).lean();
        const normalizedPackageMap = {};
        for (const pkg of allPackages) {
            // Normalize code using the same function as Excel parser
            const norm = normalizeCodeForMatching(pkg.coursePackageCode || "");
            normalizedPackageMap[norm] = pkg;
            console.log(`[DEBUG] Package code mapping: "${pkg.coursePackageCode}" → "${norm}"`);
        }
        console.log(`[DEBUG] Total packages in map: ${Object.keys(normalizedPackageMap).length}`);

        // Build normalized course map using courseCode
        const allCourses = await Course.find({}).lean();
        console.log(`[DEBUG] Found ${allCourses.length} courses in database`);
        const normalizedCourseMap = {};
        for (const c of allCourses) {
            // Normalize code using the same function as Excel parser
            const norm = normalizeCodeForMatching(c.courseCode || "");
            normalizedCourseMap[norm] = c;
            // Only log first 50 to avoid spam, but log all if there are issues
            if (Object.keys(normalizedCourseMap).length <= 50) {
                console.log(`[DEBUG] Course code mapping: "${c.courseCode}" → "${norm}"`);
            }
        }
        console.log(`[DEBUG] Total courses in map: ${Object.keys(normalizedCourseMap).length}`);
        // Log all normalized course codes for debugging (limit to first 100)
        const allNormalizedCodes = Object.keys(normalizedCourseMap).sort();
        console.log(`[DEBUG] All normalized course codes (first 100): ${allNormalizedCodes.slice(0, 100).join(', ')}`);
        if (allNormalizedCodes.length === 0) {
            console.error(`[ERROR] ⚠️ NO COURSES FOUND IN DATABASE! This will cause all matching to fail.`);
            console.error(`[ERROR] Please check that courses have been imported into the database.`);
        }

        // Pre-validation: if any course or package entry cannot be matched, abort upload
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
                    
                    // Normalize the code/name using the same function as database codes
                    // (entry.name already has cleanCourseName applied during parsing)
                    const originalName = entry.name || "";
                    let normalized = normalizeCodeForMatching(originalName);
                    
                    // Skip if normalization resulted in empty string
                    if (!normalized) {
                        console.warn(`[DEBUG] Skipping entry with empty normalized name: "${originalName}"`);
                        continue;
                    }
                    
                    console.log(`[DEBUG] Matching entry: "${originalName}" → normalized: "${normalized}"`);
                    console.log(`[DEBUG] Checking if "${normalized}" exists in course map: ${normalized in normalizedCourseMap}`);
                    console.log(`[DEBUG] Checking if "${normalized}" exists in package map: ${normalized in normalizedPackageMap}`);
                    if (!(normalized in normalizedCourseMap) && !(normalized in normalizedPackageMap)) {
                        // Show closest matches for debugging
                        const allCodes = [...Object.keys(normalizedCourseMap), ...Object.keys(normalizedPackageMap)];
                        const closest = allCodes
                            .map(code => ({ code, dist: distance(normalized, code) }))
                            .sort((a, b) => a.dist - b.dist)
                            .slice(0, 5);
                        console.log(`[DEBUG] Closest matches for "${normalized}":`, closest);
                    }
                    const isCourse = /NIVÅ\s*\d+$/i.test(normalized);

                    // Check if the normalized name exists in either Course or CoursePackage collections
                    const matchPkg = strictMatch(
                        normalized,
                        Object.keys(normalizedPackageMap)
                    );
                    const matchCourse = strictMatch(
                        normalized,
                        Object.keys(normalizedCourseMap)
                    );
                    
                    console.log(`[DEBUG] Match results for "${normalized}": package=${matchPkg || 'none'}, course=${matchCourse || 'none'}`);
                    console.log(`[DEBUG] Available package keys (first 20): ${Object.keys(normalizedPackageMap).slice(0, 20).join(', ')}`);
                    console.log(`[DEBUG] Available course keys (first 20): ${Object.keys(normalizedCourseMap).slice(0, 20).join(', ')}`);
                    console.log(`[DEBUG] Total available courses: ${Object.keys(normalizedCourseMap).length}, packages: ${Object.keys(normalizedPackageMap).length}`);

                    // If no match found in either collection, add to reasons
                    if (!matchCourse && !matchPkg) {
                        console.warn(`[WARNING] No match found for "${originalName}" (normalized: "${normalized}")`);
                        // Find closest matches for suggestions
                        const allCodes = [
                            ...Object.keys(normalizedCourseMap),
                            ...Object.keys(normalizedPackageMap),
                        ];
                        const suggestions = [];
                        let bestMatch = null;
                        let bestDistance = Infinity;
                        
                        for (const code of allCodes) {
                            const dist = distance(normalized, code);
                            if (dist < bestDistance) {
                                bestDistance = dist;
                                bestMatch = code;
                            }
                            if (dist <= 2 && suggestions.length < 3) {
                                const matchItem = normalizedCourseMap[code] || normalizedPackageMap[code];
                                if (matchItem) {
                                    suggestions.push({
                                        code: matchItem.courseCode || matchItem.coursePackageCode,
                                        name: matchItem.courseName || matchItem.coursePackageName,
                                        distance: dist,
                                    });
                                }
                            }
                        }
                        
                        // Sort suggestions by distance
                        suggestions.sort((a, b) => a.distance - b.distance);
                        
                        const suggestionText = suggestions.length > 0
                            ? ` Föreslagna matchningar: ${suggestions.map(s => `${s.code} (${s.name})`).join(", ")}.`
                            : bestMatch && bestDistance <= 5
                            ? ` Närmaste matchning: ${bestMatch} (avstånd: ${bestDistance}).`
                            : "";
                        
                        reasons.push({
                            type: "no_match",
                            student: studentIdLabel,
                            studentEmail: student.email || "",
                            studentName: student.name || "",
                            courseCode: entry.name,
                            normalizedCode: normalized,
                            message: `Ingen matchande kurs eller kurspaket hittades för koden "${entry.name}" för student ${studentIdLabel}.${suggestionText}`,
                            suggestion: suggestions.length > 0
                                ? `Kontrollera om du menade någon av de föreslagna koderna: ${suggestions.map(s => s.code).join(", ")}.`
                                : "Kontrollera att kurskoden/paketkoden är korrekt stavad. Koder ska matcha exakt (t.ex. MATE2A00X, KVARVO).",
                            suggestions: suggestions,
                        });
                    }
                }
            }

            if (reasons.length > 0) {
                const uniqueCodes = new Set(reasons.map(r => r.courseCode));
                const errorSummary = `Hittade ${reasons.length} omatchade kurser/paket (${uniqueCodes.size} unika koder) i dokumentet.`;
                const error = new Error(errorSummary);
                error.statusCode = 422;
                error.reasons = reasons;
                error.detailedMessage = `Dokumentet innehåller ${reasons.length} kurser/paket som inte kunde matchas mot systemet. Detta kan bero på felstavade kurskoder eller att kurserna/paketen inte finns i systemet. Se detaljerna nedan för varje omatchad kod.`;
                throw error;
            }
        })();

        // Process each student with the new course versioning system
        let zeroEnrollmentErrors = [];
        const createdStudentIds = [];
        for (const studentData of mergedStudents) {
            console.log(
                `[DEBUG] Processing student: ${
                    studentData.name || studentData.email || "unknown"
                } | Raw education:`,
                studentData.education
            );

            // First, create or find the student
            let dbStudent = null;
            let wasStudentCreated = false;
            try {
                // Normalize municipality before any DB operation
                if (
                    studentData.municipality &&
                    typeof studentData.municipality.type === "string"
                ) {
                    studentData.municipality.type = normalizeMunicipalityName(
                        studentData.municipality.type
                    );
                }

                // Check if student already exists
                if (studentData.personalNumber) {
                    dbStudent = await Student.findOne({
                        personalNumber: studentData.personalNumber,
                    });
                }
                if (!dbStudent && studentData.email) {
                    dbStudent = await Student.findOne({
                        email: studentData.email,
                    });
                }

                if (!dbStudent) {
                    // Create new student
                    console.log(
                        "[DEBUG] Creating student with data:",
                        studentData
                    );
                    console.log(
                        "[DEBUG] Municipality value before creation:",
                        studentData.municipality
                    );

                    // Allowed municipality types from schema
                    const allowedMunicipalities = [
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

                    // Mapping for common Excel variants
                    const municipalityMap = {
                        "uppl väsby": "Upplands Väsby",
                        "upplands väsby": "Upplands Väsby",
                        privat: "Privat kunder",
                        "privat kunder": "Privat kunder",
                        jarfalla: "Järfälla",
                        sundbyberg: "Sundbyberg",
                        sodertalje: "Södertälje",
                        // Add more mappings as needed
                    };

                    let rawMunicipality =
                        studentData.municipality &&
                        (studentData.municipality.type ||
                            studentData.municipality);
                    let normalizedMunicipality = (rawMunicipality || "")
                        .toString()
                        .trim()
                        .toLowerCase();
                    normalizedMunicipality =
                        municipalityMap[normalizedMunicipality] ||
                        allowedMunicipalities.find(
                            (m) => m.toLowerCase() === normalizedMunicipality
                        ) ||
                        rawMunicipality;

                    // Fuzzy fallback if not found in allowed list
                    if (
                        !allowedMunicipalities.includes(normalizedMunicipality)
                    ) {
                        // Use getClosestMunicipality from studentController.js
                        const { getClosestMunicipality } = await import(
                            "./studentController.js"
                        );
                        const fuzzyMatch =
                            getClosestMunicipality(rawMunicipality);
                        if (fuzzyMatch) {
                            console.log(
                                `[DEBUG] Fuzzy matched municipality: '${rawMunicipality}' → '${fuzzyMatch}'`
                            );
                            normalizedMunicipality = fuzzyMatch;
                        } else {
                            const allowedList = allowedMunicipalities.join(", ");
                            console.error(
                                `[ERROR] Invalid municipality for student ${
                                    studentData.name ||
                                    studentData.email ||
                                    "unknown"
                                }:`,
                                rawMunicipality
                            );
                            const error = new Error(
                                `Ogiltig kommun för student ${studentData.name || studentData.email || "unknown"}: "${rawMunicipality}"`
                            );
                            error.statusCode = 422;
                            error.reasons = [{
                                type: "invalid_municipality",
                                student: studentData.name || studentData.email || "unknown",
                                studentEmail: studentData.email || "",
                                studentName: studentData.name || "",
                                field: "KOMMUN/PRIVAT",
                                fieldValue: rawMunicipality,
                                message: `Ogiltig kommun "${rawMunicipality}" för student ${studentData.name || studentData.email || "unknown"}.`,
                                suggestion: `Kommunen måste vara en av följande: ${allowedList}. Kontrollera stavningen i kolumnen 'KOMMUN/PRIVAT'.`,
                                allowedMunicipalities: allowedMunicipalities,
                            }];
                            throw error;
                        }
                    }

                    // Get the teacher for this specific student from the teacherMap
                    const studentTeacherName = studentData.teacher?.trim() || "";
                    const studentTeacherInfo = studentTeacherName
                        ? teacherMap.get(studentTeacherName)
                        : null;

                    dbStudent = new Student({
                        name: studentData.name,
                        personalNumber: studentData.personalNumber,
                        email: studentData.email,
                        phone: studentData.phone || "",
                        municipality: { type: normalizedMunicipality },
                        startDate: studentData.startDate,
                        endDate: studentData.endDate,
                        finalExamDate: studentData.finalExamDate,
                        examMunicipality: studentData.examMunicipality || "",
                        examLocation: studentData.examLocation || "",
                        examTime: studentData.examTime || "",
                        exam: studentData.exam || "",
                        additionalInfo: studentData.additionalInfo || "",
                        teacher: studentTeacherName,
                        teacherId: studentTeacherInfo?._id || null,
                        dropout: studentData.dropout || false,
                        aplStatus: studentData.aplStatus || "GRAY",
                        education: [],
                    });

                    await dbStudent.save();
                    wasStudentCreated = true;
                    createdStudentIds.push(dbStudent._id.toString());
                    console.log(
                        `✅ Created new student: ${dbStudent.name} (${
                            dbStudent.email
                        }) with teacherId: ${dbStudent.teacherId || "null"}`
                    );
                    // Convert to plain object for easier manipulation
                    try {
                        const studentObj = dbStudent.toObject ? dbStudent.toObject() : (dbStudent.toJSON ? dbStudent.toJSON() : dbStudent);
                        results.students.push(studentObj);
                    } catch (objErr) {
                        console.error("Error converting student to object:", objErr);
                        // Fallback: use the student as-is
                        results.students.push(dbStudent);
                    }
                } else {
                    // Update existing student with teacher from document if not already assigned
                    const studentTeacherName = studentData.teacher?.trim() || "";
                    const studentTeacherInfo = studentTeacherName
                        ? teacherMap.get(studentTeacherName)
                        : null;
                    if (studentTeacherInfo && !dbStudent.teacherId) {
                        dbStudent.teacherId = studentTeacherInfo._id;
                        dbStudent.teacher = studentTeacherName;
                        await dbStudent.save();
                    }
                    // Convert to plain object for easier manipulation
                    try {
                        const studentObj = dbStudent.toObject ? dbStudent.toObject() : (dbStudent.toJSON ? dbStudent.toJSON() : dbStudent);
                        results.students.push(studentObj);
                    } catch (objErr) {
                        console.error("Error converting student to object:", objErr);
                        // Fallback: use the student as-is
                        results.students.push(dbStudent);
                    }
                }
            } catch (error) {
                console.error(
                    `❌ Error creating/finding student ${
                        studentData.name || studentData.email
                    }:`,
                    error
                );
                const errorDetails = {
                    studentName: studentData.name || "Okänt namn",
                    studentEmail: studentData.email || "Ingen e-post",
                    studentPersonalNumber: studentData.personalNumber || "Inget personnummer",
                    type: "student_creation",
                    error: error.message,
                    message: `Kunde inte skapa eller hitta student ${studentData.name || studentData.email || "okänd"}: ${error.message}`,
                };
                
                // If it's a municipality error, include the reasons
                if (error.reasons && Array.isArray(error.reasons)) {
                    errorDetails.reasons = error.reasons;
                    errorDetails.suggestion = "Kontrollera att kommunen är korrekt angiven i kolumnen 'KOMMUN/PRIVAT'.";
                } else {
                    errorDetails.suggestion = "Kontrollera att alla obligatoriska fält är korrekt ifyllda (NAMN, PERSONNUMMER, EMAIL, KOMMUN/PRIVAT).";
                }
                
                results.errors.push(errorDetails);
                continue; // Skip to next student
            }

            // Now process education entries for this student
            if (
                !studentData.education ||
                !Array.isArray(studentData.education) ||
                studentData.education.length === 0
            ) {
                console.log(
                    `[DEBUG] No education entries for student: ${
                        studentData.name || studentData.email || "unknown"
                    }`
                );
                continue;
            }

            // Track enrollments at DB-level and in-memory results
            const dbEnrollmentsBefore = await StudentEnrollment.countDocuments({
                studentId: dbStudent._id,
            });
            const enrollmentsBefore = results.enrollments.length;
            for (const entry of studentData.education) {
                console.log(`[DEBUG] Education entry (raw):`, entry);
                // Normalize the code using the same function as database codes
                // (entry.name already has cleanCourseName applied during parsing)
                const originalName = entry.name || "";
                let normalized = normalizeCodeForMatching(originalName);
                
                // Skip if normalization resulted in empty string
                if (!normalized) {
                    console.warn(`[DEBUG] Skipping entry with empty normalized name: "${originalName}"`);
                    continue;
                }
                
                console.log(`[DEBUG] Matching entry: "${originalName}" → normalized: "${normalized}"`);
                
                // Check if it's a course (ends with NIVÅ + number, or contains common course keywords)
                // Treat as Course if it ends with common NIVÅ patterns: 1, 1A, 1B, 2A, 1A1, etc.
                // Examples matched: "MATEMATIK NIVÅ 1B", "MATEMATIK NIVÅ 2A", "ANATOMI OCH FYSIOLOGI NIVÅ 1A1"
                const isCourse =
                    /NIVÅ\s*\d+(?:[A-Z](?:\d)?)?$/i.test(normalized) ||
                    /SPRÅK|PEDAGOGIK|SPECIALPEDAGOGIK|KOST|FÖRSKOLAN|GRUNDLÄGGANDE/i.test(
                        normalized
                    );

                // --- Determine type: Try to match against both CoursePackage and Course codes ---
                let type = null;
                const matchesPackage = normalizedPackageMap[normalized];
                const matchesCourse = normalizedCourseMap[normalized];
                
                if (matchesPackage) {
                    type = "CoursePackage";
                    console.log(
                        `[DEBUG] Name '${normalized}' matches a CoursePackage. Forcing type to CoursePackage.`
                    );
                } else if (matchesCourse) {
                    type = "Course";
                    console.log(
                        `[DEBUG] Name '${normalized}' matches a Course. Forcing type to Course.`
                    );
                } else {
                    // No exact match found, use pattern-based detection
                    type = isCourse ? "Course" : "CoursePackage";
                    console.log(
                        `[DEBUG] No exact match for '${normalized}', using pattern-based type: ${type}`
                    );
                }
                console.log(
                    `[DEBUG] Education entry (normalized): '${normalized}' | Type: ${type}`
                );

                if (type === "CoursePackage") {
                    // Only exact match - no fuzzy matching or fallback
                    let pkg = normalizedPackageMap[normalized];
                    if (!pkg) {
                        console.log(
                            `[DEBUG] No exact package match found for: '${normalized}'`
                        );
                    }
                    if (pkg) {
                        console.log(
                            `[DEBUG] Matched package: '${normalized}' → '${pkg.coursePackageName}'`
                        );

                        // Call courseMatchingService to process the package enrollment
                        try {
                            const result =
                                await CourseMatchingService.processStudentEducation(
                                    dbStudent._id,
                                    [
                                        {
                                            type: "CoursePackage",
                                            refId: pkg._id,
                                            name: pkg.coursePackageName,
                                            startDate: entry.startDate,
                                            endDate: entry.endDate,
                                            slutprovDate: entry.slutprovDate, // <-- PATCH: preserve explicit exam date
                                        },
                                    ],
                                    req.user?.userId || null
                                );
                            console.log(
                                `[DEBUG] Enrollment result for student ${
                                    dbStudent.name || dbStudent.email
                                }:`,
                                result
                            );

                            // Aggregate the enrollments from the service result
                            if (
                                result &&
                                result.enrollments &&
                                Array.isArray(result.enrollments)
                            ) {
                                results.enrollments.push(...result.enrollments);
                                console.log(
                                    `[DEBUG] Added ${
                                        result.enrollments.length
                                    } enrollments to results for student ${
                                        dbStudent.name || dbStudent.email
                                    }`
                                );
                            }

                            // Also aggregate any warnings or errors
                            if (
                                result &&
                                result.warnings &&
                                Array.isArray(result.warnings)
                            ) {
                                results.warnings.push(...result.warnings);
                            }
                            if (
                                result &&
                                result.errors &&
                                Array.isArray(result.errors)
                            ) {
                                results.errors.push(...result.errors);
                            }
                        } catch (err) {
                            console.error(
                                `[ERROR] Failed to enroll student ${
                                    dbStudent.name || dbStudent.email
                                } in package ${pkg.coursePackageName}:`,
                                err
                            );
                            results.errors.push({
                                studentName: dbStudent.name || dbStudent.email,
                                studentEmail: dbStudent.email || "",
                                type: "enrollment_error",
                                error: err.message,
                                packageName: pkg.coursePackageName,
                                packageCode: pkg.coursePackageCode,
                                message: `Kunde inte registrera student ${dbStudent.name || dbStudent.email || "okänd"} på kurspaketet ${pkg.coursePackageName} (${pkg.coursePackageCode}): ${err.message}`,
                                suggestion: "Kontrollera att kurspaketet finns i systemet och att studentens start- och slutdatum är korrekt angivna.",
                            });
                        }
                    } else {
                        // Do NOT push a warning for unmatched course packages
                        // Only log for debugging
                        console.warn(
                            `[WARN] No course package match for: '${normalized}'. Available keys:`,
                            Object.keys(normalizedPackageMap)
                        );
                    }
                } else if (type === "Course") {
                    console.log(
                        `[DEBUG] Processing individual course: '${normalized}'`
                    );

                    // Call courseMatchingService to process the individual course enrollment
                    try {
                        const result =
                            await CourseMatchingService.processStudentEducation(
                                dbStudent._id,
                                [
                                    {
                                        type: "Course",
                                        name: entry.name,
                                        startDate: entry.startDate,
                                        endDate: entry.endDate,
                                        slutprovDate: entry.slutprovDate, // <-- PATCH: preserve explicit exam date
                                    },
                                ],
                                req.user?.userId || null
                            );
                        console.log(
                            `[DEBUG] Course enrollment result for student ${
                                dbStudent.name || dbStudent.email
                            }:`,
                            result
                        );

                        // Aggregate the enrollments from the service result
                        if (
                            result &&
                            result.enrollments &&
                            Array.isArray(result.enrollments)
                        ) {
                            results.enrollments.push(...result.enrollments);
                            console.log(
                                `[DEBUG] Added ${
                                    result.enrollments.length
                                } course enrollments to results for student ${
                                    dbStudent.name || dbStudent.email
                                }`
                            );
                        }

                        // Also aggregate any warnings or errors
                        if (
                            result &&
                            result.warnings &&
                            Array.isArray(result.warnings)
                        ) {
                            results.warnings.push(...result.warnings);
                        }
                        if (
                            result &&
                            result.errors &&
                            Array.isArray(result.errors)
                        ) {
                            results.errors.push(...result.errors);
                        }
                    } catch (err) {
                        console.error(
                            `[ERROR] Failed to enroll student ${
                                dbStudent.name || dbStudent.email
                            } in course ${entry.name}:`,
                            err
                        );
                        results.errors.push({
                            studentName: dbStudent.name || dbStudent.email,
                            studentEmail: dbStudent.email || "",
                            type: "enrollment_error",
                            error: err.message,
                            courseCode: entry.name,
                            message: `Kunde inte registrera student ${dbStudent.name || dbStudent.email || "okänd"} på kursen ${entry.name}: ${err.message}`,
                            suggestion: "Kontrollera att kurskoden är korrekt och att studentens start- och slutdatum är korrekt angivna.",
                        });
                    }
                }
            }

            const enrollmentsAfter = results.enrollments.length;
            const dbEnrollmentsAfter = await StudentEnrollment.countDocuments({
                studentId: dbStudent._id,
            });

            // Consider it a success if either enrollments increased or the student has a CoursePackage in education
            const refreshedStudent = await Student.findById(
                dbStudent._id
            ).lean();
            const hasAnyCoursePackage = Array.isArray(
                refreshedStudent?.education
            )
                ? refreshedStudent.education.some(
                      (e) => e?.type === "CoursePackage"
                  )
                : false;

            // Treat as success if the student has any enrollments at all after processing
            const noNewEnrollments =
                enrollmentsAfter === enrollmentsBefore &&
                dbEnrollmentsAfter === dbEnrollmentsBefore &&
                dbEnrollmentsAfter === 0;

            if (noNewEnrollments && !hasAnyCoursePackage) {
                // No enrollments created for this student → treat as fatal error
                const studentEducationCodes = studentData.education
                    ?.map(e => e.name)
                    .filter(Boolean)
                    .join(", ") || "Inga kurser/paket angivna";
                
                // Find specific unmatched courses for this student from warnings/errors
                // Check both studentId (ObjectId) and studentId as string
                const unmatchedCourses = results.warnings
                    .filter(w => {
                        if (w.type !== "no_match") return false;
                        const warningStudentId = w.studentId?.toString();
                        const dbStudentId = dbStudent._id?.toString();
                        const matches = warningStudentId === dbStudentId;
                        if (!matches && warningStudentId) {
                            console.log(`[DEBUG] Warning studentId mismatch: warning="${warningStudentId}" vs dbStudent="${dbStudentId}"`);
                        }
                        return matches;
                    })
                    .map(w => w.courseName)
                    .filter(Boolean);
                
                console.log(`[DEBUG] Found ${unmatchedCourses.length} unmatched courses for student ${dbStudent.name}: ${unmatchedCourses.join(', ')}`);
                console.log(`[DEBUG] Total warnings in results: ${results.warnings.length}, no_match warnings: ${results.warnings.filter(w => w.type === 'no_match').length}`);
                
                // Find similar course suggestions for unmatched courses
                const suggestions = [];
                for (const unmatchedCode of unmatchedCourses) {
                    const normalizedUnmatched = normalizeCodeForMatching(unmatchedCode);
                    const allCodes = [
                        ...Object.keys(normalizedCourseMap),
                        ...Object.keys(normalizedPackageMap),
                    ];
                    
                    // Find closest matches
                    let bestMatches = [];
                    for (const code of allCodes) {
                        const dist = distance(normalizedUnmatched, code);
                        if (dist <= 3 && bestMatches.length < 3) {
                            const matchItem = normalizedCourseMap[code] || normalizedPackageMap[code];
                            if (matchItem) {
                                bestMatches.push({
                                    code: matchItem.courseCode || matchItem.coursePackageCode,
                                    name: matchItem.courseName || matchItem.coursePackageName,
                                    distance: dist,
                                });
                            }
                        }
                    }
                    bestMatches.sort((a, b) => a.distance - b.distance);
                    if (bestMatches.length > 0) {
                        suggestions.push({
                            unmatched: unmatchedCode,
                            suggestions: bestMatches.map(m => `${m.code} (${m.name})`).join(", "),
                        });
                    }
                }
                
                const unmatchedCoursesList = unmatchedCourses.length > 0 
                    ? ` Omatchade kurser: ${unmatchedCourses.join(", ")}.`
                    : "";
                
                let suggestionText = `Kontrollera att kurskoderna/paketkoderna (${studentEducationCodes}) är korrekta och finns i systemet.`;
                if (suggestions.length > 0) {
                    const suggestionDetails = suggestions.map(s => 
                        `"${s.unmatched}" → Förslag: ${s.suggestions}`
                    ).join("; ");
                    suggestionText += ` Liknande kurser i systemet: ${suggestionDetails}.`;
                }
                
                zeroEnrollmentErrors.push({
                    type: "no_enrollments_created",
                    student: dbStudent.name || dbStudent.email || "unknown",
                    studentEmail: dbStudent.email || "",
                    studentName: dbStudent.name || "",
                    educationCodes: studentEducationCodes,
                    unmatchedCourses: unmatchedCourses,
                    suggestions: suggestions,
                    message: `Inga kurser kunde matchas eller skapas för student ${dbStudent.name || dbStudent.email || "okänd"}.${unmatchedCoursesList}`,
                    suggestion: suggestionText,
                });
                // Cleanup newly created student to avoid dangling records
                if (wasStudentCreated && dbStudent?._id) {
                    try {
                        await Student.findByIdAndDelete(dbStudent._id);
                    } catch (e) {
                        console.error(
                            "[CLEANUP] Failed to delete student with zero enrollments:",
                            e
                        );
                    }
                }
            }
        }

        console.log(`[DEBUG] 📊 Processing results:`);
        console.log(`[DEBUG] Students processed: ${results.students.length}`);
        console.log(
            `[DEBUG] Students created/found:`,
            results.students.map((s) => s.name || s.email || "unknown")
        );

        // After processing all students, deduplicate missing package errors globally
        const seenPackages = new Set();
        results.errors = results.errors.filter((err) => {
            if (err.type !== "missing_package") return true;
            const norm = (err.packageName || "")
                .toUpperCase()
                .replace(/[,;|]/g, "")
                .replace(/\s+/g, " ")
                .trim();
            if (seenPackages.has(norm)) return false;
            seenPackages.add(norm);
            return true;
        });
        console.log(
            "[DEBUG] Deduplicated missing package errors:",
            results.errors.filter((e) => e.type === "missing_package")
        );

        // Normalize error shape for frontend (use 'error' property, not 'message')
        results.errors = (results.errors || []).map((e) => ({
            ...e,
            error: e.error || e.message || "",
        }));

        console.log("📊 Final results:", {
            students: results.students.length,
            enrollments: results.enrollments?.length || 0,
            warnings: results.warnings?.length || 0,
            errors: results.errors?.length || 0,
            createdTeachers: results.createdTeachers.length,
        });

        // If any student ended with zero enrollments, abort entire upload
        if (zeroEnrollmentErrors.length > 0) {
            const errorSummary = `${zeroEnrollmentErrors.length} student(er) kunde inte registreras på några kurser.`;
            const error = new Error(errorSummary);
            error.statusCode = 422;
            error.reasons = zeroEnrollmentErrors;
            error.detailedMessage = `Uppladdningen avbröts eftersom ${zeroEnrollmentErrors.length} student(er) inte kunde registreras på några kurser. Detta beror vanligtvis på att kurskoderna/paketkoderna inte kunde matchas. Se detaljerna nedan för varje student.`;
            throw error;
        }

        // Prepare response message
        let message = `Processed ${results.students.length} students`;
        if (results.createdTeachers.length > 0) {
            message += ` and created ${results.createdTeachers.length} new teacher account(s)`;
        }

        // Filter out 'instance_created' warnings if everything else is fine
        results.warnings = results.warnings.filter(
            (w) => w.type !== "instance_created"
        );

        // Populate education data from enrollments for each student
        if (results.students && Array.isArray(results.students)) {
            try {
                const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
                for (const student of results.students) {
                try {
                    // Ensure we have a valid student ID
                    const studentId = student._id || student.id;
                    if (!studentId) {
                        console.warn(`Student missing ID, skipping education population:`, student.name || student.email);
                        student.education = Array.isArray(student.education) ? student.education : [];
                        continue;
                    }

                    const enrollments = await StudentEnrollment.find({ studentId: studentId })
                        .populate("mainCourseId", "courseName courseCode")
                        .populate("coursePackageId", "coursePackageName coursePackageCode")
                        .lean();

                    const enrollmentEducation = enrollments.map((enrollment) => {
                        if (enrollment.mainCourseId) {
                            return {
                                type: "Course",
                                refId: enrollment.mainCourseId._id,
                                name: enrollment.mainCourseId.courseName,
                                startDate: enrollment.startDate,
                                endDate: enrollment.endDate,
                                slutprovDate: enrollment.slutprovDate,
                            };
                        } else if (enrollment.coursePackageId) {
                            return {
                                type: "CoursePackage",
                                refId: enrollment.coursePackageId._id,
                                name: enrollment.coursePackageId.coursePackageName,
                                startDate: enrollment.startDate,
                                endDate: enrollment.endDate,
                                slutprovDate: enrollment.slutprovDate,
                            };
                        }
                        return null;
                    }).filter(Boolean);

                    // Merge with existing education entries from student document
                    const existingEducation = Array.isArray(student.education) ? student.education : [];
                    student.education = [...existingEducation, ...enrollmentEducation];
                } catch (err) {
                    console.error(`Error populating education for student ${student._id || student.id || 'unknown'}:`, err);
                    // If enrollment fetch fails, use existing education or empty array
                    student.education = Array.isArray(student.education) ? student.education : [];
                }
            }
            } catch (importErr) {
                console.error("Error importing StudentEnrollment model:", importErr);
                // If import fails, just use existing education data
                for (const student of results.students) {
                    student.education = Array.isArray(student.education) ? student.education : [];
                }
            }
        }

        res.json({
            success: true,
            message,
            results,
        });
    } catch (error) {
        console.error("Error uploading students for matching:", error);
        const status = error.statusCode || 500;
        if (status === 422) {
            // Build a comprehensive error response
            const errorResponse = {
                success: false,
                error: error.message || "Valideringsfel: uppladdning avbruten.",
                detailedMessage: error.detailedMessage || "Dokumentet innehåller fel som måste åtgärdas innan uppladdning kan fortsätta.",
                reasons: error.reasons || [],
                errorCount: error.reasons?.length || 0,
                errorTypes: {},
            };
            
            // Count error types for summary
            if (error.reasons && Array.isArray(error.reasons)) {
                error.reasons.forEach(reason => {
                    const type = reason.type || "unknown";
                    errorResponse.errorTypes[type] = (errorResponse.errorTypes[type] || 0) + 1;
                });
            }
            
            // Add helpful summary
            const typeSummary = Object.entries(errorResponse.errorTypes)
                .map(([type, count]) => {
                    const typeNames = {
                        "invalid_field": "Ogiltiga fält",
                        "no_match": "Omatchade kurser/paket",
                        "invalid_municipality": "Ogiltiga kommuner",
                        "student_creation": "Student-skapande fel",
                        "enrollment_error": "Registreringsfel",
                        "no_enrollments_created": "Inga registreringar skapade",
                    };
                    return `${typeNames[type] || type}: ${count}`;
                })
                .join(", ");
            
            if (typeSummary) {
                errorResponse.summary = `Feltyper: ${typeSummary}`;
            }
            
            return res.status(422).json(errorResponse);
        }
        res.status(500).json({ 
            success: false,
            error: "Ett internt serverfel uppstod vid bearbetning av filen.",
            message: error.message || "Okänt fel",
            suggestion: "Kontrollera att filen är i korrekt format (Excel .xlsx) och försök igen. Om problemet kvarstår, kontakta systemadministratören.",
        });
    }
};

export const processStudentEducation = async (req, res) => {
    try {
        const { studentId, educationEntries, needsSupport, examMode } = req.body;
        const userId = req.user?.userId;

        if (!studentId || !educationEntries) {
            return res.status(400).json({
                error: "Student ID and education entries are required",
            });
        }

        // Verify student exists
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Process education entries
        const results = await CourseMatchingService.processStudentEducation(
            studentId,
            educationEntries,
            userId,
            { needsSupport, examMode }
        );

        res.json({
            success: true,
            message: "Education processing completed",
            results,
        });
    } catch (error) {
        console.error("Error processing student education:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const findCourseMatch = async (req, res) => {
    try {
        const { courseName, threshold = 0.7 } = req.query;

        if (!courseName) {
            return res.status(400).json({ error: "Course name is required" });
        }

        const match = await CourseMatchingService.findBestCourseMatch(
            courseName,
            parseFloat(threshold)
        );

        if (!match) {
            return res.json({
                success: false,
                message: "No matching course found",
                suggestions: [],
            });
        }

        res.json({
            success: true,
            match: {
                course: match.course,
                score: match.score,
            },
        });
    } catch (error) {
        console.error("Error finding course match:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getCourseInstances = async (req, res) => {
    try {
        const { courseId, startDate, endDate, isActive } = req.query;

        const query = {};

        if (courseId) query.mainCourseId = courseId;
        if (isActive !== undefined) query.isActive = isActive === "true";
        if (startDate || endDate) {
            query.$and = [];
            if (startDate)
                query.$and.push({ startDate: { $gte: new Date(startDate) } });
            if (endDate)
                query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }

        const instances = await CourseInstance.find(query)
            .populate("mainCourseId")
            .populate("createdBy", "username email")
            .populate({
                path: "responsibleTeacher",
                populate: { path: "userId", select: "username email" },
                select: "userId subject",
            })
            .sort({ startDate: -1 });

        const merged = await mergeDuplicateCourseInstances(instances);
        const finalInstances = merged
            ? await CourseInstance.find(query)
                  .populate("mainCourseId")
                  .populate("createdBy", "username email")
                  .populate({
                      path: "responsibleTeacher",
                      populate: { path: "userId", select: "username email" },
                      select: "userId subject",
                  })
                  .sort({ startDate: -1 })
            : instances;

        // For each instance, count enrollments and get slutprov date
        const instancesWithCounts = await Promise.all(
            finalInstances.map(async (instance) => {
                const enrollmentCount = await StudentEnrollment.countDocuments({
                    courseInstanceId: instance._id,
                });

                // Use the slutprovDate from the course instance itself (not from enrollments)
                // If the instance doesn't have one, fall back to the first enrollment's date
                const instanceObj = instance.toObject();
                let slutprovDate = instanceObj.slutprovDate || null;
                
                // Fallback to enrollment date only if instance doesn't have one
                if (!slutprovDate) {
                    const firstEnrollment = await StudentEnrollment.findOne({
                        courseInstanceId: instance._id,
                        slutprovDate: { $ne: null },
                    }).select("slutprovDate");
                    slutprovDate = firstEnrollment?.slutprovDate || null;
                }

                return {
                    ...instanceObj,
                    enrollmentCount,
                    slutprovDate: slutprovDate,
                };
            })
        );

        res.json({
            success: true,
            instances: instancesWithCounts,
        });
    } catch (error) {
        console.error("Error fetching course instances:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getMyCourseInstances = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        const { startDate, endDate, isActive } = req.query;

        // For admins/systemadmins, return all course instances (or filter by query params)
        // For teachers, return only their assigned course instances
        let query = {};
        
        if (userRole === "teacher") {
            // Find the teacher document corresponding to the logged-in user
            const Teacher = mongoose.model("Teacher");
            const teacher = await Teacher.findOne({ userId: userId });

            if (!teacher) {
                return res.status(404).json({ error: "Teacher profile not found for the current user." });
            }

            query.responsibleTeacher = teacher._id;
        }
        // For admins/systemadmins, query is empty (will return all instances)

        if (isActive !== undefined) query.isActive = isActive === "true";
        if (startDate || endDate) {
            query.$and = query.$and || [];
            if (startDate)
                query.$and.push({ startDate: { $gte: new Date(startDate) } });
            if (endDate)
                query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }

        const instances = await CourseInstance.find(query)
            .populate("mainCourseId")
            .populate({
                path: "responsibleTeacher",
                populate: { path: "userId", select: "username email" },
                select: "userId subject",
            })
            .sort({ startDate: -1 });

        // Debug: Log first instance to see population
        if (instances.length > 0) {
            console.log('[DEBUG] Sample course instance responsibleTeacher:', instances[0].responsibleTeacher);
            console.log('[DEBUG] Sample course instance (full):', JSON.stringify(instances[0].toObject(), null, 2));
        }

        const merged = await mergeDuplicateCourseInstances(instances);
        const finalInstances = merged
            ? await CourseInstance.find(query)
                  .populate("mainCourseId")
                  .populate({
                      path: "responsibleTeacher",
                      populate: { path: "userId", select: "username email" },
                      select: "userId subject",
                  })
                  .sort({ startDate: -1 })
            : instances;

        const instancesWithCounts = await Promise.all(
            finalInstances.map(async (instance) => {
                const enrollmentCount = await StudentEnrollment.countDocuments({
                    courseInstanceId: instance._id,
                });
                const firstEnrollment = await StudentEnrollment.findOne({
                    courseInstanceId: instance._id,
                    slutprovDate: { $ne: null },
                }).select("slutprovDate");

                const instanceObj = instance.toObject();
                
                // Ensure responsibleTeacher is properly structured
                if (instanceObj.responsibleTeacher && typeof instanceObj.responsibleTeacher === 'object') {
                    // If userId is not populated, it might be just an ObjectId
                    if (!instanceObj.responsibleTeacher.userId && instanceObj.responsibleTeacher._id) {
                        console.log('[DEBUG] responsibleTeacher.userId not populated, attempting manual populate');
                        // This shouldn't happen if populate worked, but handle it gracefully
                    }
                }

                return {
                    ...instanceObj,
                    enrollmentCount,
                    slutprovDate: firstEnrollment?.slutprovDate || null,
                };
            })
        );

        res.json({
            success: true,
            instances: instancesWithCounts,
        });
    } catch (error) {
        console.error("Error fetching teacher's course instances:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};


export const getStudentEnrollments = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { status, startDate, endDate } = req.query;

        const query = { studentId };

        if (status) query.status = status;
        if (startDate || endDate) {
            query.$and = [];
            if (startDate)
                query.$and.push({ startDate: { $gte: new Date(startDate) } });
            if (endDate)
                query.$and.push({ endDate: { $lte: new Date(endDate) } });
        }

        const enrollments = await StudentEnrollment.find(query)
            .populate("courseInstanceId")
            .populate("mainCourseId")
            .populate("teacherId", "username email")
            .populate("gradeBy", "username email")
            .sort({ startDate: -1 });

        res.json({
            success: true,
            enrollments,
        });
    } catch (error) {
        console.error("Error fetching student enrollments:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getCourseInstanceEnrollments = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { status } = req.query;

        const query = { courseInstanceId: instanceId };

        if (status) query.status = status;

        const enrollments = await StudentEnrollment.find(query)
            .populate("studentId", "name email dropout")
            .populate("mainCourseId", "courseName courseCode")
            .populate("teacherId", "username email")
            .populate("gradeBy", "username email")
            .sort({ startDate: -1 });

        res.json({
            success: true,
            enrollments,
        });
    } catch (error) {
        console.error("Error fetching course instance enrollments:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const updateEnrollmentStatus = async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { status, reason, notes } = req.body;
        const userId = req.user?.userId;

        console.log(`[updateEnrollmentStatus] Updating enrollment ${enrollmentId} to status: ${status}`);

        const enrollment = await StudentEnrollment.findById(enrollmentId);
        if (!enrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        // Validate status
        const validStatuses = ["enrolled", "active", "completed", "dropped", "inactive", "suspended", "reviderad"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: "Invalid status", 
                validStatuses 
            });
        }

        await enrollment.changeStatus(status, reason, notes, userId);

        // Update course instance statistics (wrap in try-catch to not fail if this errors)
        try {
            await CourseMatchingService.updateCourseInstanceStats(
                enrollment.courseInstanceId
            );
        } catch (statsError) {
            console.error("Error updating course instance stats (non-fatal):", statsError);
        }

        // Reload enrollment to get updated data
        const updatedEnrollment = await StudentEnrollment.findById(enrollmentId)
            .populate("teacherId", "name email")
            .populate("mainCourseId", "courseName courseCode");

        res.json({
            success: true,
            message: "Enrollment status updated successfully",
            enrollment: updatedEnrollment,
        });
    } catch (error) {
        console.error("Error updating enrollment status:", error);
        console.error("Error stack:", error.stack);
        res.status(500).json({ 
            error: "Internal server error",
            message: error.message 
        });
    }
};

/**
 * Update enrollment dates
 */
export const updateEnrollmentDates = async (req, res) => {
    try {
        const { enrollmentId } = req.params;
        const { startDate, endDate } = req.body;

        const enrollment = await StudentEnrollment.findById(enrollmentId);
        if (!enrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        if (startDate !== undefined) {
            enrollment.startDate = new Date(startDate);
        }
        if (endDate !== undefined) {
            enrollment.endDate = new Date(endDate);
        }

        await enrollment.save();

        res.json({
            success: true,
            message: "Enrollment dates updated successfully",
            enrollment,
        });
    } catch (error) {
        console.error("Error updating enrollment dates:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getCourseStatistics = async (req, res) => {
    try {
        const { startDate, endDate, courseId } = req.query;

        if (!startDate || !endDate) {
            return res
                .status(400)
                .json({ error: "Start date and end date are required" });
        }

        const stats = await CourseMatchingService.getCourseStatistics(
            new Date(startDate),
            new Date(endDate),
            courseId
        );

        res.json({
            success: true,
            statistics: stats,
        });
    } catch (error) {
        console.error("Error fetching course statistics:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const createCourseInstance = async (req, res) => {
    try {
        const {
            mainCourseId,
            startDate,
            endDate,
            courseName,
            courseCode,
            coursePoints,
            courseExtent,
            notes,
            slutprovDate,
            responsibleTeacher,
        } = req.body;
        const userId = req.user?.userId;

        if (!mainCourseId || !startDate || !endDate) {
            return res.status(400).json({
                error: "Main course ID, start date, and end date are required",
            });
        }

        // Get the main course to inherit values if not provided
        const mainCourse = await Course.findById(mainCourseId);
        if (!mainCourse) {
            return res.status(404).json({ error: "Main course not found" });
        }

        // Generate course code if not provided
        let finalCourseCode = courseCode;
        if (!finalCourseCode) {
            const startDateObj = new Date(startDate);
            const year = String(startDateObj.getFullYear()).slice(-2);
            const month = String(startDateObj.getMonth() + 1).padStart(2, '0');
            finalCourseCode = `${mainCourse.courseCode}${year}${month}`;
        }

        // Check for uniqueness and add version suffix if needed
        let uniqueCourseCode = finalCourseCode;
        let version = 1;
        while (await CourseInstance.findOne({ courseCode: uniqueCourseCode })) {
            uniqueCourseCode = `${finalCourseCode}v${version}`;
            version++;
        }

        // Use inherited values if not provided
        const finalCourseName = courseName || mainCourse.courseName;
        const finalCoursePoints = coursePoints || mainCourse.coursePoints;
        const finalCourseExtent = courseExtent || mainCourse.courseExtent;

        // Parse dates correctly - handle date strings in YYYY-MM-DD format
        const parseDate = (dateString) => {
            if (!dateString || dateString.trim() === '') return undefined;
            // If it's already a Date object, return it
            if (dateString instanceof Date) return dateString;
            // Parse YYYY-MM-DD format and create date at local midnight
            const parts = dateString.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const day = parseInt(parts[2], 10);
                return new Date(year, month, day);
            }
            // Fallback to standard Date parsing
            const parsed = new Date(dateString);
            return isNaN(parsed.getTime()) ? undefined : parsed;
        };

        const parsedStartDate = parseDate(startDate);
        const parsedEndDate = parseDate(endDate);
        const responsibleTeacherId = responsibleTeacher || undefined;

        // Prevent duplicate course instances for same course + dates + teacher
        const existingInstance = await CourseInstance.findOne({
            mainCourseId,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            responsibleTeacher: responsibleTeacherId,
        });
        if (existingInstance) {
            return res.status(409).json({
                error: "Duplicate course instance exists for this course and date range",
                instance: existingInstance,
            });
        }

        // Create the course instance
        const newInstance = new CourseInstance({
            mainCourseId,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            courseName: finalCourseName,
            courseCode: uniqueCourseCode,
            coursePoints: finalCoursePoints,
            courseExtent: finalCourseExtent,
            createdBy: userId,
            responsibleTeacher: responsibleTeacherId,
            slutprovDate: parseDate(slutprovDate),
            notes: notes || '',
            isActive: true,
        });

        await newInstance.save();

        res.json({
            success: true,
            message: "Course instance created successfully",
            instance: newInstance,
            wasCreated: true,
        });
    } catch (error) {
        console.error("Error creating course instance:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Update a course instance
export const updateCourseInstance = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const updateData = { ...req.body };

        // Find the instance first
        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get main course to inherit values if fields are empty
        const mainCourse = await Course.findById(instance.mainCourseId);
        if (mainCourse) {
            // Inherit coursePoints if not provided or empty
            if (!updateData.coursePoints || updateData.coursePoints.trim() === '') {
                updateData.coursePoints = mainCourse.coursePoints;
            }
            // Inherit courseExtent if not provided or empty
            if (!updateData.courseExtent || updateData.courseExtent.trim() === '') {
                updateData.courseExtent = mainCourse.courseExtent;
            }
            // Inherit courseName if not provided or empty
            if (!updateData.courseName || updateData.courseName.trim() === '') {
                updateData.courseName = mainCourse.courseName;
            }
        }

        // Handle courseCode uniqueness if it's being updated
        if (updateData.courseCode && updateData.courseCode !== instance.courseCode) {
            let uniqueCourseCode = updateData.courseCode;
            let version = 1;
            while (await CourseInstance.findOne({ 
                courseCode: uniqueCourseCode,
                _id: { $ne: instanceId } // Exclude current instance
            })) {
                uniqueCourseCode = `${updateData.courseCode}v${version}`;
                version++;
            }
            updateData.courseCode = uniqueCourseCode;
        }

        // Parse dates correctly - handle date strings in YYYY-MM-DD or MM/DD/YYYY format
        const parseDate = (dateString) => {
            if (!dateString || dateString.trim() === '' || dateString === null || dateString === undefined) {
                return null;
            }
            // If it's already a Date object, return it
            if (dateString instanceof Date) {
                return isNaN(dateString.getTime()) ? null : dateString;
            }
            // Convert to string and trim
            const dateStr = String(dateString).trim();
            if (dateStr === '' || dateStr === 'null' || dateStr === 'undefined') {
                return null;
            }
            
            console.log(`[DEBUG] parseDate input:`, dateStr);
            
            // Try YYYY-MM-DD format first (ISO format)
            let parts = dateStr.split('-');
            if (parts.length === 3 && parts[0].length === 4) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const day = parseInt(parts[2], 10);
                // Validate the parsed values
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    // Validate reasonable date range
                    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
                        const date = new Date(year, month, day);
                        // Double-check the date is valid
                        if (!isNaN(date.getTime())) {
                            console.log(`[DEBUG] Parsed as YYYY-MM-DD: ${year}-${month + 1}-${day}`);
                            return date;
                        }
                    }
                }
            }
            
            // Try MM/DD/YYYY format
            parts = dateStr.split('/');
            if (parts.length === 3) {
                // Check if first part is month (1-12) or year (4 digits)
                const firstPart = parseInt(parts[0], 10);
                const secondPart = parseInt(parts[1], 10);
                const thirdPart = parseInt(parts[2], 10);
                
                let year, month, day;
                if (firstPart > 12 && thirdPart <= 12) {
                    // Format: YYYY/MM/DD (unlikely but possible)
                    year = firstPart;
                    month = thirdPart - 1;
                    day = secondPart;
                } else if (thirdPart > 12 || thirdPart.toString().length === 4) {
                    // Format: MM/DD/YYYY
                    month = firstPart - 1;
                    day = secondPart;
                    year = thirdPart;
                } else {
                    // Format: DD/MM/YYYY (European)
                    day = firstPart;
                    month = secondPart - 1;
                    year = thirdPart;
                }
                
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                    // Validate reasonable date range
                    if (year >= 1900 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
                        const date = new Date(year, month, day);
                        if (!isNaN(date.getTime())) {
                            console.log(`[DEBUG] Parsed as MM/DD/YYYY: ${month + 1}/${day}/${year}`);
                            return date;
                        }
                    }
                }
            }
            
            // Fallback to standard Date parsing
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
                console.log(`[DEBUG] Parsed using standard Date constructor:`, parsed);
                return parsed;
            }
            
            console.log(`[WARNING] Failed to parse date: ${dateStr}`);
            return null;
        };

        // Convert date strings to Date objects
        if (updateData.startDate) updateData.startDate = parseDate(updateData.startDate);
        if (updateData.endDate) updateData.endDate = parseDate(updateData.endDate);
        
        // Handle slutprovDate - check if it's being explicitly set (even if null/empty)
        const slutprovDateInRequest = 'slutprovDate' in req.body;
        let slutprovDateExplicitlySet = false;
        
        if (slutprovDateInRequest) {
            console.log(`[DEBUG] slutprovDate in request:`, req.body.slutprovDate, `(type: ${typeof req.body.slutprovDate})`);
            const parsedDate = parseDate(req.body.slutprovDate);
            console.log(`[DEBUG] Parsed slutprovDate:`, parsedDate);
            if (parsedDate) {
                console.log(`[DEBUG] Parsed date details:`, {
                    getTime: parsedDate.getTime(),
                    toISOString: parsedDate.toISOString(),
                    toDateString: parsedDate.toDateString(),
                    isValid: !isNaN(parsedDate.getTime()),
                    year: parsedDate.getFullYear()
                });
            }
            
            // Only set it if it's a valid date, or explicitly set to null/empty
            if (parsedDate !== null && !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1970) {
                updateData.slutprovDate = parsedDate;
                slutprovDateExplicitlySet = true;
                console.log(`[DEBUG] Setting slutprovDate to:`, parsedDate, `(${parsedDate.toISOString()})`);
            } else if (req.body.slutprovDate === '' || req.body.slutprovDate === null) {
                updateData.slutprovDate = null; // Explicitly clear it
                slutprovDateExplicitlySet = true; // User explicitly cleared it
                console.log(`[DEBUG] Clearing slutprovDate (explicitly set to empty)`);
            } else {
                console.log(`[WARNING] Failed to parse slutprovDate:`, req.body.slutprovDate, `parsed result:`, parsedDate);
            }
        } else {
            console.log(`[DEBUG] slutprovDate NOT in request body`);
        }

        // Check if we need to recalculate slutprovDate
        const teacherChanged = updateData.responsibleTeacher !== undefined;
        const endDateChanged = updateData.endDate !== undefined;

        // If teacher or endDate is changing, and slutprovDate is not explicitly set in this update,
        // we should recalculate it based on the new teacher/endDate
        if ((teacherChanged || endDateChanged) && !slutprovDateExplicitlySet) {
            const newTeacher = updateData.responsibleTeacher || instance.responsibleTeacher;
            const newEndDate = updateData.endDate || instance.endDate;

            // Auto-calculate if teacher is set
            if (newTeacher && newEndDate) {
                const { calculateSlutprovDate } = await import("../utils/slutprovDateCalculator.js");
                const calculatedDate = await calculateSlutprovDate(newTeacher, newEndDate);
                if (calculatedDate) {
                    updateData.slutprovDate = calculatedDate;
                    console.log(
                        `📅 Auto-calculated slutprovDate on update for course "${instance.courseName}": ${calculatedDate.toDateString()}`
                    );
                }
            }
        }

        // Update the instance - use direct update to bypass pre-save hook issues
        const instanceToUpdate = await CourseInstance.findById(instanceId);
        if (!instanceToUpdate) {
            return res.status(404).json({ error: "Course instance not found" });
        }
        
        // Store the original slutprovDate before applying updates
        const originalSlutprovDate = instanceToUpdate.slutprovDate;
        console.log(`[DEBUG] Original slutprovDate:`, originalSlutprovDate);
        
        // If we explicitly set slutprovDate, handle it separately to ensure it's preserved
        let finalSlutprovDate = updateData.slutprovDate;
        if (slutprovDateExplicitlySet) {
            finalSlutprovDate = updateData.slutprovDate; // This is already the parsed Date object
            console.log(`[DEBUG] Will set slutprovDate to:`, finalSlutprovDate);
            // Remove from updateData so we can set it separately
            delete updateData.slutprovDate;
        }
        
        // Apply all other updates first
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined) {
                console.log(`[DEBUG] Setting ${key} to:`, updateData[key]);
                instanceToUpdate[key] = updateData[key];
            }
        });
        
        // Now set slutprovDate explicitly after other updates, and mark it as modified
        if (slutprovDateExplicitlySet) {
            instanceToUpdate.slutprovDate = finalSlutprovDate;
            instanceToUpdate.markModified('slutprovDate');
            // Set a flag to prevent pre-save hook from overriding
            instanceToUpdate._slutprovDateExplicitlySet = true;
            console.log(`[DEBUG] Set slutprovDate directly, value:`, instanceToUpdate.slutprovDate);
            console.log(`[DEBUG] Date object details:`, {
                value: instanceToUpdate.slutprovDate,
                getTime: instanceToUpdate.slutprovDate?.getTime(),
                toISOString: instanceToUpdate.slutprovDate?.toISOString(),
                isValid: instanceToUpdate.slutprovDate && !isNaN(instanceToUpdate.slutprovDate.getTime()),
                year: instanceToUpdate.slutprovDate?.getFullYear()
            });
        }
        
        // Save the instance (this will trigger pre-save hooks, but our hook should respect the explicit date)
        let updatedInstance;
        try {
            updatedInstance = await instanceToUpdate.save();
            console.log(`[DEBUG] Saved instance, final slutprovDate:`, updatedInstance.slutprovDate);
            if (updatedInstance.slutprovDate) {
                console.log(`[DEBUG] Final date details:`, {
                    value: updatedInstance.slutprovDate,
                    getTime: updatedInstance.slutprovDate.getTime(),
                    toISOString: updatedInstance.slutprovDate.toISOString(),
                    isValid: !isNaN(updatedInstance.slutprovDate.getTime()),
                    year: updatedInstance.slutprovDate.getFullYear()
                });
                
                // If the date was changed to 1970-01-01, force update it directly via MongoDB
                if (updatedInstance.slutprovDate.getFullYear() === 1970 && slutprovDateExplicitlySet && finalSlutprovDate) {
                    console.log(`[WARNING] Date was changed to 1970-01-01, forcing direct MongoDB update`);
                    await CourseInstance.updateOne(
                        { _id: instanceId },
                        { $set: { slutprovDate: finalSlutprovDate } }
                    );
                    // Reload the instance
                    updatedInstance = await CourseInstance.findById(instanceId);
                    console.log(`[DEBUG] After force update, slutprovDate:`, updatedInstance.slutprovDate);
                }
            } else {
                console.log(`[DEBUG] Final slutprovDate is null/undefined`);
            }
        } catch (error) {
            console.error(`[ERROR] Error saving instance:`, error);
            throw error;
        }
        
        // If slutprovDate was updated, sync calendar events for all enrollments
        if (slutprovDateExplicitlySet && finalSlutprovDate) {
            try {
                const { default: StudentEnrollment } = await import("../models/StudentEnrollment.js");
                const { syncCalendarEventFromEnrollment } = await import("../utils/calendarEventSync.js");
                
                // Find all enrollments for this course instance
                const enrollments = await StudentEnrollment.find({
                    courseInstanceId: instanceId
                });
                
                // Update enrollments with the new slutprovDate
                for (const enrollment of enrollments) {
                    enrollment.slutprovDate = finalSlutprovDate;
                    await enrollment.save(); // This will trigger calendar sync via post-save hook
                }
                
                console.log(`📅 Synced calendar events for ${enrollments.length} enrollments after course instance update`);
            } catch (calendarError) {
                console.error(`❌ Error syncing calendar events after course instance update:`, calendarError);
                // Don't fail the request if calendar sync fails
            }
        }

        res.json({
            success: true,
            message: "Course instance updated successfully",
            instance: updatedInstance,
        });
    } catch (error) {
        console.error("Error updating course instance:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Add students to a course instance
export const addStudentsToInstance = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { studentIds } = req.body;
        const userId = req.user?.userId;

        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: "Student IDs array is required" });
        }

        // Find the course instance
        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get the main course to get course details
        const mainCourse = await Course.findById(instance.mainCourseId);
        if (!mainCourse) {
            return res.status(404).json({ error: "Main course not found" });
        }

        const enrollments = [];
        const errors = [];

        for (const studentId of studentIds) {
            try {
                // Check if enrollment already exists
                const existingEnrollment = await StudentEnrollment.findOne({
                    studentId,
                    courseInstanceId: instanceId,
                });

                if (existingEnrollment) {
                    console.log(`[SKIP] Enrollment already exists for student ${studentId} in instance ${instanceId}`);
                    continue;
                }

                // Get student to find teacherId
                const student = await Student.findById(studentId);
                if (!student) {
                    errors.push(`Student ${studentId} not found`);
                    continue;
                }

                // Create enrollment
                const enrollment = new StudentEnrollment({
                    studentId,
                    courseInstanceId: instanceId,
                    mainCourseId: instance.mainCourseId,
                    startDate: instance.startDate,
                    endDate: instance.endDate,
                    status: "enrolled",
                    teacherId: student.teacherId || instance.responsibleTeacher || null,
                    // Copy slutprovDate from course instance if it exists
                    slutprovDate: instance.slutprovDate || null,
                });

                await enrollment.save();
                enrollments.push(enrollment);

                console.log(`✅ Created enrollment for student ${student.name} in course instance ${instance.courseName}`);

                // Sync calendar event if enrollment has a slutprovDate
                if (enrollment.slutprovDate) {
                    try {
                        const { syncCalendarEventFromEnrollment } = await import("../utils/calendarEventSync.js");
                        await syncCalendarEventFromEnrollment(enrollment._id);
                    } catch (calendarError) {
                        console.error(`❌ Error syncing calendar event for enrollment ${enrollment._id}:`, calendarError);
                        // Don't fail the enrollment creation if calendar sync fails
                    }
                }
            } catch (error) {
                console.error(`❌ Error creating enrollment for student ${studentId}:`, error);
                errors.push(`Failed to enroll student ${studentId}: ${error.message}`);
            }
        }

        res.json({
            success: true,
            message: `Added ${enrollments.length} student(s) to course instance`,
            enrollmentsCreated: enrollments.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error("Error adding students to course instance:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Delete a course instance and its enrollments
export const deleteCourseInstance = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const instance = await CourseInstance.findByIdAndDelete(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }
        // Delete related enrollments
        await StudentEnrollment.deleteMany({ courseInstanceId: instanceId });
        res.json({
            success: true,
            message: "Course instance and related enrollments deleted",
        });
    } catch (error) {
        console.error("Error deleting course instance:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Bulk delete all course instances and related enrollments
export const deleteAllCourseInstances = async (req, res) => {
    try {
        console.log("[API] DELETE /course-instances/all called");
        const courseResult = await CourseInstance.deleteMany({});
        const enrollmentResult = await StudentEnrollment.deleteMany({});
        console.log(
            `[API] Deleted ${courseResult.deletedCount} course instances and ${enrollmentResult.deletedCount} enrollments`
        );
        res.json({
            success: true,
            message: `All course instances (${courseResult.deletedCount}) and related enrollments (${enrollmentResult.deletedCount}) deleted`,
        });
    } catch (error) {
        console.error("Error deleting all course instances:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
