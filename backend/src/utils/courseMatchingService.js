import Course from "../models/Course.js";
import CourseInstance from "../models/CourseInstance.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { distance } from "fastest-levenshtein";

class CourseMatchingService {
    /**
     * Clean course name for better matching
     */
    static cleanCourseName(name) {
        return name
            .toUpperCase()
            .replace(/\(.*?\)/g, "") // Remove parentheses
            .replace(/\bmot\b/gi, "") // Remove "mot"
            .replace(/[,;|]/g, "") // Remove separators
            .replace(/\s+/g, " ") // Collapse spaces
            .trim();
    }

    /**
     * Find the best matching course using fuzzy matching
     */
    static async findBestCourseMatch(courseName, threshold = 0.7) {
        const cleanedName = this.cleanCourseName(courseName);

        // Get all courses
        const allCourses = await Course.find({ isActive: true });

        let bestMatch = null;
        let bestScore = 0;

        for (const course of allCourses) {
            const courseNameDistance = distance(
                cleanedName,
                this.cleanCourseName(course.courseName)
            );
            const courseCodeDistance = distance(
                cleanedName,
                this.cleanCourseName(course.courseCode)
            );

            // Convert distance to similarity score (0-1, where 1 is exact match)
            const maxLength = Math.max(
                cleanedName.length,
                course.courseName.length,
                course.courseCode.length
            );
            const courseNameScore = 1 - courseNameDistance / maxLength;
            const courseCodeScore = 1 - courseCodeDistance / maxLength;

            const score = Math.max(courseNameScore, courseCodeScore);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = { course, score };
            }
        }

        return bestScore >= threshold ? bestMatch : null;
    }

    /**
     * Find or create course instance for a specific date range
     */
    static async findOrCreateCourseInstance(
        mainCourseId,
        startDate,
        endDate,
        userId = null,
        responsibleTeacherId = null
    ) {
        // First, try to find an existing instance that overlaps with the date range
        const existingInstance = await CourseInstance.findOne({
            mainCourseId,
            isActive: true,
            $or: [
                // Exact match
                { startDate, endDate },
                // Overlapping periods
                {
                    startDate: { $lte: endDate },
                    endDate: { $gte: startDate },
                },
            ],
        });

        if (existingInstance) {
            console.log(
                `✅ Found existing course instance: ${
                    existingInstance.courseName
                } (${existingInstance.startDate.toDateString()} - ${existingInstance.endDate.toDateString()})`
            );
            return { instance: existingInstance, wasCreated: false };
        }

        // If no existing instance, create a new one
        const mainCourse = await Course.findById(mainCourseId);
        if (!mainCourse) {
            throw new Error(`Main course not found: ${mainCourseId}`);
        }

        const newInstance = new CourseInstance({
            mainCourseId,
            startDate,
            endDate,
            courseName: mainCourse.courseName,
            courseCode: mainCourse.courseCode,
            coursePoints: mainCourse.coursePoints,
            courseExtent: mainCourse.courseExtent,
            createdBy: userId,
            responsibleTeacher: responsibleTeacherId || undefined,
            notes: `Auto-created for student enrollment (${startDate.toDateString()} - ${endDate.toDateString()})`,
        });

        await newInstance.save();

        console.log(
            `🆕 Created new course instance: ${
                newInstance.courseName
            } (${newInstance.startDate.toDateString()} - ${newInstance.endDate.toDateString()})`
        );

        return { instance: newInstance, wasCreated: true };
    }

    /**
     * Process student education entries and create enrollments
     */
    static async processStudentEducation(
        studentId,
        educationEntries,
        userId = null
    ) {
        const results = {
            enrollments: [],
            warnings: [],
            errors: [],
        };

        for (const entry of educationEntries) {
            try {
                if (
                    entry.type === "Course" &&
                    entry.startDate &&
                    entry.endDate
                ) {
                    // Find the best course match
                    const match = await this.findBestCourseMatch(entry.name);

                    if (!match) {
                        results.warnings.push({
                            type: "no_match",
                            courseName: entry.name,
                            message: `No matching course found for "${entry.name}"`,
                        });
                        continue;
                    }

                    // Find or create course instance, pass responsibleTeacherId
                    const { instance, wasCreated } =
                        await this.findOrCreateCourseInstance(
                            match.course._id,
                            new Date(entry.startDate),
                            new Date(entry.endDate),
                            userId,
                            entry.teacherId || null // <-- pass teacherId
                        );

                    if (wasCreated) {
                        results.warnings.push({
                            type: "instance_created",
                            courseName: entry.name,
                            instanceId: instance._id,
                            message: `Created new course instance for "${entry.name}" (${instance.startDate.toDateString()} - ${instance.endDate.toDateString()})`,
                        });
                    }

                    // Create enrollment
                    const enrollment = new StudentEnrollment({
                        studentId,
                        courseInstanceId: instance._id,
                        mainCourseId: match.course._id,
                        startDate: new Date(entry.startDate),
                        endDate: new Date(entry.endDate),
                        status: "enrolled",
                        teacherId: entry.teacherId || null,
                        notes: entry.notes || null,
                    });

                    await enrollment.save();
                    // Attach student email for frontend display
                    const studentDocImport = await import('../models/Student.js');
                    const StudentModel = studentDocImport.default;
                    const studentDoc = await StudentModel.findById(studentId);
                    results.enrollments.push({
                        ...enrollment.toObject(),
                        studentEmail: studentDoc?.email || '',
                        courseInstanceName: instance.courseName || '',
                    });
                    console.log(
                        `✅ Created enrollment for student ${studentId} in course ${entry.name}`
                    );

                    // --- PATCH: Update student's education array ---
                    if (studentDoc) {
                        // Remove any existing education entry for this course and date range
                        studentDoc.education = (studentDoc.education || []).filter(e => {
                            if (e.type !== 'Course') return true;
                            if (!e.refId) return true;
                            return (
                                e.refId.toString() !== match.course._id.toString() ||
                                new Date(e.startDate).getTime() !== new Date(entry.startDate).getTime() ||
                                new Date(e.endDate).getTime() !== new Date(entry.endDate).getTime()
                            );
                        });
                        // Add the new education entry
                        studentDoc.education.push({
                            type: 'Course',
                            refId: match.course._id,
                            name: match.course.courseName,
                            startDate: new Date(entry.startDate),
                            endDate: new Date(entry.endDate),
                            grade: null,
                            addedAt: new Date(),
                            addedBy: userId,
                            removedAt: null,
                        });
                        await studentDoc.save();
                    }
                    // --- END PATCH ---
                }
            } catch (error) {
                results.errors.push({
                    type: "processing_error",
                    courseName: entry.name,
                    message: error.message,
                });
                console.error(
                    `❌ Error processing education entry for student ${studentId}: ${error.message}`
                );
            }
        }

        return results;
    }
}

export default CourseMatchingService;