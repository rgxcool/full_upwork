import CourseMatchingService from "../utils/courseMatchingService.js";
import Student from "../models/Student.js";
import CourseInstance from "../models/CourseInstance.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { parseStudentExcel } from "../utils/parseStudentExcel.js";
import { createOrFindTeacher } from "../utils/teacherService.js";
import { createGlobalNotification } from "../controllers/notificationController.js";
import { normalizeMunicipalityName } from "./studentController.js";
import CoursePackage from '../models/CoursePackage.js';

console.log('[DEBUG] courseMatchingController.js loaded');

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

        // Process each student with the new course versioning system
        for (const studentData of parsedStudents) {
            console.log(`[DEBUG] Processing student: ${studentData.name || studentData.email || 'unknown'} | Raw education:`, studentData.education);
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
                        // Find or create the student in the DB
                        let dbStudent = null;
                        if (studentData.personalNumber) {
                            dbStudent = await Student.findOne({ personalNumber: studentData.personalNumber });
                        }
                        if (!dbStudent && studentData.email) {
                            dbStudent = await Student.findOne({ email: studentData.email });
                        }
                        if (!dbStudent) {
                            dbStudent = new Student({
                                name: studentData.name,
                                email: studentData.email,
                                personalNumber: studentData.personalNumber,
                                // Add any other fields as needed
                            });
                            await dbStudent.save();
                        }
                        // Call courseMatchingService to process the package enrollment
                        try {
                            const result = await CourseMatchingService.processStudentEducation(
                                dbStudent._id,
                                [{
                                    type: 'CoursePackage',
                                    refId: pkg._id,
                                    name: pkg.coursePackageName,
                                    startDate: entry.startDate,
                                    endDate: entry.endDate
                                }]
                            );
                            console.log(`[DEBUG] Enrollment result for student ${dbStudent.name || dbStudent.email}:`, result);
                        } catch (err) {
                            console.error(`[ERROR] Failed to enroll student ${dbStudent.name || dbStudent.email} in package ${pkg.coursePackageName}:`, err);
                        }
                    } else {
                        // Do NOT push a warning for unmatched course packages
                        // Only log for debugging
                        console.warn(`[WARN] No course package match for: '${normalized}'. Available keys:`, Object.keys(normalizedPackageMap));
                        continue;
                    }
                }
            }
            try {
                // Normalize municipality before any DB operation
                if (studentData.municipality && typeof studentData.municipality.type === 'string') {
                    studentData.municipality.type = normalizeMunicipalityName(studentData.municipality.type);
                }
                // Check if student already exists
                let student = await Student.findOne({
                    email: studentData.email,
                });

                if (!student) {
                    // Create new student
                    // Debug log for municipality
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
                            continue; // Skip this student
                        }
                    }
                    console.log(`[DEBUG] Raw municipality: '${rawMunicipality}' | Normalized: '${normalizedMunicipality}'`);
                    if (!allowedMunicipalities.includes(normalizedMunicipality)) {
                        console.error(`[ERROR] Invalid municipality for student ${studentData.name || studentData.email || 'unknown'}:`, rawMunicipality);
                        // Optionally, you can push to a results.errors array or return a message to the frontend
                        continue; // Skip this student
                    }
                    const municipality = { type: normalizedMunicipality };
                    // Build student object field-by-field, do NOT use ...studentData
                    const studentObj = {
                        name: studentData.name,
                        email: studentData.email,
                        personalNumber: studentData.personalNumber,
                        municipality: municipality,
                        education: [],
                        teacherId: teacherInfo?._id,
                        // Add any other required fields here
                    };
                    console.log('[DEBUG] FINAL studentObj to be created:', studentObj);
                    try {
                        student = new Student(studentObj);
                        await student.save();
                    } catch (err) {
                        console.error('[DEBUG] Student creation error:', err);
                        throw err;
                    }
                    results.students.push(student);
                } else {
                    // Update existing student with teacher if not already assigned
                    if (teacherInfo && !student.teacherId) {
                        student.teacherId = teacherInfo._id;
                        await student.save();
                    }
                    results.students.push(student);
                }

                // Process education entries using the new course matching service
                if (studentData.education && studentData.education.length > 0) {
                    // Log normalization for each education entry
                    for (const entry of studentData.education) {
                        let normalized = entry.name && entry.name.toString().toLowerCase().replace(/[-\s]*\d+\s*v$/i, '').replace(/[-\s]*\d+v$/i, '').replace(/\d+v$/i, '');
                        console.log(`[DEBUG] Normalized input: '${normalized}' | Package keys:`, Object.keys(normalizedPackageMap));
                    }
                    const educationResults =
                        await CourseMatchingService.processStudentEducation(
                            student._id,
                            studentData.education,
                            req.user?.userId
                        );

                    // Add results to overall results
                    results.warnings.push(...educationResults.warnings);
                    results.errors.push(...educationResults.errors);
                    if (educationResults.enrollments) {
                        results.enrollments.push(...educationResults.enrollments);
                    }
                }
            } catch (error) {
                results.errors.push({
                    studentName: studentData.name,
                    error: error.message,
                });
            }
        }

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

        // For each instance, count enrollments
        const instancesWithCounts = await Promise.all(
            instances.map(async (instance) => {
                const enrollmentCount = await StudentEnrollment.countDocuments({ courseInstanceId: instance._id });
                return {
                    ...instance.toObject(),
                    enrollmentCount,
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
