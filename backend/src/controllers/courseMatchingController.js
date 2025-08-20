import CourseMatchingService from "../utils/courseMatchingService.js";
import Student from "../models/Student.js";
import CourseInstance from "../models/CourseInstance.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { parseStudentExcel } from "../utils/parseStudentExcel.js";
import { createOrFindTeacher } from "../utils/teacherService.js";
import { createGlobalNotification } from "../controllers/notificationController.js";
import { normalizeMunicipalityName } from "./studentController.js";
import Course from "../models/Course.js";
import { distance } from "fastest-levenshtein";

/**
 * Course Matching Controller
 * Handles endpoints for uploading students, matching courses, managing enrollments, and course instances.
 * Relies on CourseMatchingService and related models/utilities.
 */
import CoursePackage from '../models/CoursePackage.js';

console.log('[DEBUG] courseMatchingController.js loaded');

/**
 * Uploads an Excel file of students for course matching, parses the file, creates teachers if needed, and returns results.
 * @async
 * @param {import('express').Request} req - Express request object (expects file upload)
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const uploadStudentsForMatching = async (req, res) => {
    console.log('[DEBUG] uploadStudentsForMatching called');
    try {
        console.log("🔍 req.user:", req.user);
        console.log("🔍 req.userId:", req.userId);
        console.log("🔍 req.cookies:", req.cookies);

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const fileBuffer = req.file.buffer;
        const fileName = req.file.originalname;
        const teacherName = fileName.split(" ").pop().split(".")[0];

        // Parse students using the existing parser
        const parsedStudents = await parseStudentExcel(fileBuffer, teacherName);

        console.log(`[DEBUG] 📊 Excel parsing results:`);
        console.log(`[DEBUG] Total students parsed from Excel: ${parsedStudents.length}`);
        console.log(`[DEBUG] Student names:`, parsedStudents.map(s => s.name || s.email || 'unknown'));

        if (parsedStudents.length === 0) {
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

        // Handle teacher creation if needed
        let teacherInfo = null;
        try {
            const teacherResult = await createOrFindTeacher(
                teacherName,
                req.user?.userId
            );

            if (teacherResult.wasCreated) {
                const safeUsername = teacherResult.user?.username || teacherName;
                const safeEmail = teacherResult.user?.email || `${teacherName.toLowerCase().replace(/\s+/g, ".")}@mindful.se`;
                results.createdTeachers.push({
                    name: safeUsername,
                    email: safeEmail,
                    password: teacherResult.password,
                    subject: teacherResult.teacher?.subject || "Övrigt",
                });

                console.log(
                    `👨‍🏫 Auto-created teacher: ${safeUsername}`
                );

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

            teacherInfo = teacherResult.teacher;
            console.log(`[DEBUG] Teacher info:`, teacherInfo ? { _id: teacherInfo._id, name: teacherInfo.userId?.username } : 'null');
        } catch (error) {
            console.error("❌ Error handling teacher creation:", error);
            results.errors.push({
                type: "teacher_creation",
                error: error.message,
            });
        }

        // Build normalized package map
        const allPackages = await CoursePackage.find({}).lean();
        const normalizedPackageMap = {};
        for (const pkg of allPackages) {
            const norm = (pkg.coursePackageName || '').toString().trim().toUpperCase().replace(/[^A-Z0-9ÅÄÖ\s-]/gi, '');
            normalizedPackageMap[norm] = pkg;
        }

        // Build normalized course map
        const allCourses = await Course.find({}).lean();
        const normalizedCourseMap = {};
        for (const c of allCourses) {
            const norm = (c.courseName || '').toString().trim().toUpperCase().replace(/[^A-Z0-9ÅÄÖ\s-]/gi, '');
            normalizedCourseMap[norm] = c;
        }

        // Pre-validation: if any course or package entry cannot be matched, abort upload
        (function prevalidateUnmatchedCourses() {
            const reasons = [];

            function strictMatch(target, candidates) {
                if (candidates.includes(target)) return target;
                let best = null;
                let minDistance = Infinity;
                for (const candidate of candidates) {
                    const d = distance(target, candidate);
                    if (d < minDistance) {
                        minDistance = d;
                        best = candidate;
                    }
                }
                if (target.length > 12 && minDistance === 1) return best;
                return null;
            }

            for (const student of parsedStudents) {
                const studentIdLabel = student.email || student.name || 'unknown';
                const entries = Array.isArray(student.education) ? student.education : [];
                for (const entry of entries) {
                    let normalized = (entry.name || '').toString().trim().toUpperCase().replace(/[^A-Z0-9ÅÄÖ\s-]/gi, '');
                    normalized = normalized.replace(/[-\s]*\d+\s*v$/i, '');
                    normalized = normalized.replace(/[-\s]*\d+v$/i, '');
                    normalized = normalized.replace(/\d+v$/i, '');
                    const isCourse = /NIVÅ\s*\d+$/i.test(normalized);

                    let type = null;
                    if (normalizedPackageMap[normalized]) {
                        type = 'CoursePackage';
                    } else {
                        type = isCourse ? 'Course' : 'CoursePackage';
                    }

                    const matchPkg = strictMatch(normalized, Object.keys(normalizedPackageMap));
                    const matchCourse = strictMatch(normalized, Object.keys(normalizedCourseMap));

                    if (type === 'Course') {
                        if (!matchCourse && !matchPkg) {
                            reasons.push({
                                type: 'no_match',
                                student: studentIdLabel,
                                courseName: entry.name,
                                message: `No matching course found for "${entry.name}" for student ${studentIdLabel}`,
                            });
                        }
                    } else if (type === 'CoursePackage') {
                        if (!matchPkg) {
                            reasons.push({
                                type: 'no_package_match',
                                student: studentIdLabel,
                                courseName: entry.name,
                                message: `No matching course package found for "${entry.name}" for student ${studentIdLabel}`,
                            });
                        }
                    }
                }
            }

            if (reasons.length > 0) {
                const error = new Error('Unmatched courses found; upload aborted.');
                error.statusCode = 422;
                error.reasons = reasons;
                throw error;
            }
        })();

        // Process each student with the new course versioning system
        for (const studentData of parsedStudents) {
            console.log(`[DEBUG] Processing student: ${studentData.name || studentData.email || 'unknown'} | Raw education:`, studentData.education);
            
            // First, create or find the student
            let dbStudent = null;
            try {
                // Normalize municipality before any DB operation
                if (studentData.municipality && typeof studentData.municipality.type === 'string') {
                    studentData.municipality.type = normalizeMunicipalityName(studentData.municipality.type);
                }
                
                // Check if student already exists
                if (studentData.personalNumber) {
                    dbStudent = await Student.findOne({ personalNumber: studentData.personalNumber });
                }
                if (!dbStudent && studentData.email) {
                    dbStudent = await Student.findOne({ email: studentData.email });
                }

                if (!dbStudent) {
                    // Create new student
                    console.log('[DEBUG] Creating student with data:', studentData);
                    console.log('[DEBUG] Municipality value before creation:', studentData.municipality);
                    
                    // Allowed municipality types from schema
                    const allowedMunicipalities = [
                        "Botkyrka", "Danderyd", "Huddinge", "Järfälla", "KCNO", "Lidingö", "Norrtälje", "Nykvarn", "Privat kunder", "Salem", "Sigtuna", "Sollentuna", "Solna", "Sundbyberg", "Södertälje", "Täby", "Upplands Bro", "Upplands Väsby", "Vallentuna", "Vaxholm", "Växjö", "Österåker"
                    ];
                    
                    // Mapping for common Excel variants
                    const municipalityMap = {
                        "uppl väsby": "Upplands Väsby",
                        "upplands väsby": "Upplands Väsby",
                        "privat": "Privat kunder",
                        "privat kunder": "Privat kunder",
                        "jarfalla": "Järfälla",
                        "sundbyberg": "Sundbyberg",
                        "sodertalje": "Södertälje",
                        // Add more mappings as needed
                    };
                    
                    let rawMunicipality = studentData.municipality && (studentData.municipality.type || studentData.municipality);
                    let normalizedMunicipality = (rawMunicipality || "").toString().trim().toLowerCase();
                    normalizedMunicipality = municipalityMap[normalizedMunicipality] || allowedMunicipalities.find(m => m.toLowerCase() === normalizedMunicipality) || rawMunicipality;
                    
                    // Fuzzy fallback if not found in allowed list
                    if (!allowedMunicipalities.includes(normalizedMunicipality)) {
                        // Use getClosestMunicipality from studentController.js
                        const { getClosestMunicipality } = await import("./studentController.js");
                        const fuzzyMatch = getClosestMunicipality(rawMunicipality);
                        if (fuzzyMatch) {
                            console.log(`[DEBUG] Fuzzy matched municipality: '${rawMunicipality}' → '${fuzzyMatch}'`);
                            normalizedMunicipality = fuzzyMatch;
                        } else {
                            console.error(`[ERROR] Invalid municipality for student ${studentData.name || studentData.email || 'unknown'}:`, rawMunicipality);
                            throw new Error(`Invalid municipality: "${rawMunicipality}"`);
                        }
                    }

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
                        teacher: studentData.teacher || teacherName,
                        teacherId: teacherInfo?._id || null,
                        dropout: studentData.dropout || false,
                        aplStatus: studentData.aplStatus || "GRAY",
                        education: [],
                    });

                    await dbStudent.save();
                    console.log(`✅ Created new student: ${dbStudent.name} (${dbStudent.email}) with teacherId: ${dbStudent.teacherId || 'null'}`);
                    results.students.push(dbStudent);
                } else {
                    // Update existing student with teacher if not already assigned
                    if (teacherInfo && !dbStudent.teacherId) {
                        dbStudent.teacherId = teacherInfo._id;
                        await dbStudent.save();
                    }
                    results.students.push(dbStudent);
                }
            } catch (error) {
                console.error(`❌ Error creating/finding student ${studentData.name || studentData.email}:`, error);
                results.errors.push({
                    studentName: studentData.name,
                    type: "student_creation",
                    error: error.message,
                });
                continue; // Skip to next student
            }

            // Now process education entries for this student
            if (!studentData.education || !Array.isArray(studentData.education) || studentData.education.length === 0) {
                console.log(`[DEBUG] No education entries for student: ${studentData.name || studentData.email || 'unknown'}`);
                continue;
            }
            
            for (const entry of studentData.education) {
                console.log(`[DEBUG] Education entry (raw):`, entry);
                let normalized = (entry.name || '').toString().trim().toUpperCase().replace(/[^A-Z0-9ÅÄÖ\s-]/gi, '');
                // Remove trailing week extent patterns for package matching
                normalized = normalized.replace(/[-\s]*\d+\s*v$/i, '');
                normalized = normalized.replace(/[-\s]*\d+v$/i, '');
                normalized = normalized.replace(/\d+v$/i, '');
                const isCourse = /NIVÅ\s*\d+$/i.test(normalized);
                
                // --- PATCH: Always prefer CoursePackage if name matches a package ---
                let type = null;
                if (normalizedPackageMap[normalized]) {
                    type = 'CoursePackage';
                    console.log(`[DEBUG] Name '${normalized}' matches a CoursePackage. Forcing type to CoursePackage.`);
                } else {
                    type = isCourse ? 'Course' : 'CoursePackage';
                }
                console.log(`[DEBUG] Education entry (normalized): '${normalized}' | Type: ${type}`);
                
                if (type === 'CoursePackage') {
                    const pkg = normalizedPackageMap[normalized];
                    if (pkg) {
                        console.log(`[DEBUG] Matched package: '${normalized}' → '${pkg.coursePackageName}'`);
                        
                        // Call courseMatchingService to process the package enrollment
                        try {
                            const result = await CourseMatchingService.processStudentEducation(
                                dbStudent._id,
                                [{
                                    type: 'CoursePackage',
                                    refId: pkg._id,
                                    name: pkg.coursePackageName,
                                    startDate: entry.startDate,
                                    endDate: entry.endDate,
                                    slutprovDate: entry.slutprovDate // <-- PATCH: preserve explicit exam date
                                }]
                            );
                            console.log(`[DEBUG] Enrollment result for student ${dbStudent.name || dbStudent.email}:`, result);
                            
                            // Aggregate the enrollments from the service result
                            if (result && result.enrollments && Array.isArray(result.enrollments)) {
                                results.enrollments.push(...result.enrollments);
                                console.log(`[DEBUG] Added ${result.enrollments.length} enrollments to results for student ${dbStudent.name || dbStudent.email}`);
                            }
                            
                            // Also aggregate any warnings or errors
                            if (result && result.warnings && Array.isArray(result.warnings)) {
                                results.warnings.push(...result.warnings);
                            }
                            if (result && result.errors && Array.isArray(result.errors)) {
                                results.errors.push(...result.errors);
                            }
                        } catch (err) {
                            console.error(`[ERROR] Failed to enroll student ${dbStudent.name || dbStudent.email} in package ${pkg.coursePackageName}:`, err);
                            results.errors.push({
                                studentName: dbStudent.name || dbStudent.email,
                                type: "enrollment_error",
                                error: err.message,
                                packageName: pkg.coursePackageName
                            });
                        }
                    } else {
                        // Do NOT push a warning for unmatched course packages
                        // Only log for debugging
                        console.warn(`[WARN] No course package match for: '${normalized}'. Available keys:`, Object.keys(normalizedPackageMap));
                    }
                } else if (type === 'Course') {
                    console.log(`[DEBUG] Processing individual course: '${normalized}'`);
                    
                    // Call courseMatchingService to process the individual course enrollment
                    try {
                        const result = await CourseMatchingService.processStudentEducation(
                            dbStudent._id,
                            [{
                                type: 'Course',
                                name: entry.name,
                                startDate: entry.startDate,
                                endDate: entry.endDate,
                                slutprovDate: entry.slutprovDate // <-- PATCH: preserve explicit exam date
                            }]
                        );
                        console.log(`[DEBUG] Course enrollment result for student ${dbStudent.name || dbStudent.email}:`, result);
                        
                        // Aggregate the enrollments from the service result
                        if (result && result.enrollments && Array.isArray(result.enrollments)) {
                            results.enrollments.push(...result.enrollments);
                            console.log(`[DEBUG] Added ${result.enrollments.length} course enrollments to results for student ${dbStudent.name || dbStudent.email}`);
                        }
                        
                        // Also aggregate any warnings or errors
                        if (result && result.warnings && Array.isArray(result.warnings)) {
                            results.warnings.push(...result.warnings);
                        }
                        if (result && result.errors && Array.isArray(result.errors)) {
                            results.errors.push(...result.errors);
                        }
                    } catch (err) {
                        console.error(`[ERROR] Failed to enroll student ${dbStudent.name || dbStudent.email} in course ${entry.name}:`, err);
                        results.errors.push({
                            studentName: dbStudent.name || dbStudent.email,
                            type: "enrollment_error",
                            error: err.message,
                            courseName: entry.name
                        });
                    }
                }
            }
        }

        console.log(`[DEBUG] 📊 Processing results:`);
        console.log(`[DEBUG] Students processed: ${results.students.length}`);
        console.log(`[DEBUG] Students created/found:`, results.students.map(s => s.name || s.email || 'unknown'));

        // After processing all students, deduplicate missing package errors globally
        const seenPackages = new Set();
        results.errors = results.errors.filter(err => {
            if (err.type !== 'missing_package') return true;
            const norm = (err.packageName || '').toUpperCase().replace(/[,;|]/g, '').replace(/\s+/g, ' ').trim();
            if (seenPackages.has(norm)) return false;
            seenPackages.add(norm);
            return true;
        });
        console.log('[DEBUG] Deduplicated missing package errors:', results.errors.filter(e => e.type === 'missing_package'));

        console.log("📊 Final results:", {
            students: results.students.length,
            enrollments: results.enrollments?.length || 0,
            warnings: results.warnings?.length || 0,
            errors: results.errors?.length || 0,
            createdTeachers: results.createdTeachers.length,
        });

        // Prepare response message
        let message = `Processed ${results.students.length} students`;
        if (results.createdTeachers.length > 0) {
            message += ` and created ${results.createdTeachers.length} new teacher account(s)`;
        }

        // Filter out 'instance_created' warnings if everything else is fine
        results.warnings = results.warnings.filter(w => w.type !== 'instance_created');

        res.json({
            success: true,
            message,
            results,
        });
    } catch (error) {
        console.error("Error uploading students for matching:", error);
        const status = error.statusCode || 500;
        if (status === 422) {
            return res.status(422).json({
                error: "Unmatched courses found; upload aborted.",
                reasons: error.reasons || [],
            });
        }
        res.status(500).json({ error: "Internal server error" });
    }
};

export const processStudentEducation = async (req, res) => {
    try {
        const { studentId, educationEntries } = req.body;
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
            userId
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

        // For each instance, count enrollments and get slutprov date
        const instancesWithCounts = await Promise.all(
            instances.map(async (instance) => {
                const enrollmentCount = await StudentEnrollment.countDocuments({ courseInstanceId: instance._id });
                
                // Get the slutprov date from the first enrollment (they should all have the same date for a course instance)
                const firstEnrollment = await StudentEnrollment.findOne({ 
                    courseInstanceId: instance._id,
                    slutprovDate: { $ne: null }
                }).select('slutprovDate');
                
                return {
                    ...instance.toObject(),
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
        console.error("Error fetching course instances:", error);
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
            .populate("studentId", "name email")
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

        const enrollment = await StudentEnrollment.findById(enrollmentId);
        if (!enrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        await enrollment.changeStatus(status, reason, notes, userId);

        // Update course instance statistics
        await CourseMatchingService.updateCourseInstanceStats(
            enrollment.courseInstanceId
        );

        res.json({
            success: true,
            message: "Enrollment status updated successfully",
            enrollment,
        });
    } catch (error) {
        console.error("Error updating enrollment status:", error);
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
        } = req.body;
        const userId = req.user?.userId;

        if (!mainCourseId || !startDate || !endDate) {
            return res.status(400).json({
                error: "Main course ID, start date, and end date are required",
            });
        }

        const { instance, wasCreated } =
            await CourseMatchingService.findOrCreateCourseInstance(
                mainCourseId,
                new Date(startDate),
                new Date(endDate),
                userId
            );

        // If we found an existing instance, update it with any new data
        if (
            !wasCreated &&
            (courseName || courseCode || coursePoints || courseExtent || notes)
        ) {
            const updateData = {};
            if (courseName) updateData.courseName = courseName;
            if (courseCode) updateData.courseCode = courseCode;
            if (coursePoints) updateData.coursePoints = coursePoints;
            if (courseExtent) updateData.courseExtent = courseExtent;
            if (notes) updateData.notes = notes;

            await CourseInstance.findByIdAndUpdate(instance._id, updateData);
            await instance.save();
        }

        res.json({
            success: true,
            message: wasCreated
                ? "Course instance created successfully"
                : "Course instance updated successfully",
            instance,
            wasCreated,
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
        const updateData = req.body;
        
        // Find the instance first
        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Update the instance with the provided data
        const updatedInstance = await CourseInstance.findByIdAndUpdate(
            instanceId,
            updateData,
            { new: true, runValidators: true }
        );

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
        console.log(`[API] Deleted ${courseResult.deletedCount} course instances and ${enrollmentResult.deletedCount} enrollments`);
        res.json({ success: true, message: `All course instances (${courseResult.deletedCount}) and related enrollments (${enrollmentResult.deletedCount}) deleted` });
    } catch (error) {
        console.error("Error deleting all course instances:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
