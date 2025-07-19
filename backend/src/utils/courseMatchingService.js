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
        userId = null
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

                    // Find or create course instance
                    const { instance, wasCreated } =
                        await this.findOrCreateCourseInstance(
                            match.course._id,
                            new Date(entry.startDate),
                            new Date(entry.endDate),
                            userId
                        );

                    if (wasCreated) {
                        results.warnings.push({
                            type: "instance_created",
                            courseName: entry.name,
                            instanceId: instance._id,
                            message: `Created new course instance for "${
                                entry.name
                            }" (${instance.startDate.toDateString()} - ${instance.endDate.toDateString()})`,
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
                    results.enrollments.push(enrollment);
                    console.log(
                        `✅ Created enrollment for student ${studentId} in course ${entry.name}`
                    );

                    // Update course instance statistics
                    await CourseInstance.findByIdAndUpdate(instance._id, {
                        $inc: { enrollmentCount: 1 },
                    });
                } else if (
                    entry.type === "Program" ||
                    entry.type === "CoursePackage"
                ) {
                    // Handle programs and course packages (could be expanded later)
                    results.warnings.push({
                        type: "not_implemented",
                        entryType: entry.type,
                        message: `${entry.type} processing not yet implemented`,
                    });
                }
            } catch (error) {
                results.errors.push({
                    courseName: entry.name,
                    error: error.message,
                });
            }
        }

        return results;
    }

    /**
     * Get course statistics for a specific time period
     */
    static async getCourseStatistics(startDate, endDate, courseId = null) {
        const matchQuery = {
            startDate: { $gte: startDate },
            endDate: { $lte: endDate },
        };

        if (courseId) {
            matchQuery.mainCourseId = courseId;
        }

        const stats = await StudentEnrollment.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: "$mainCourseId",
                    totalEnrollments: { $sum: 1 },
                    completedEnrollments: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
                        },
                    },
                    droppedEnrollments: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "dropped"] }, 1, 0],
                        },
                    },
                    activeEnrollments: {
                        $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
                    },
                    averageAttendance: { $avg: "$attendancePercentage" },
                },
            },
            {
                $lookup: {
                    from: "courses",
                    localField: "_id",
                    foreignField: "_id",
                    as: "course",
                },
            },
            { $unwind: "$course" },
        ]);

        return stats;
    }

    /**
     * Get student enrollment history
     */
    static async getStudentEnrollmentHistory(studentId) {
        return await StudentEnrollment.find({ studentId })
            .populate("courseInstanceId")
            .populate("mainCourseId")
            .populate("teacherId")
            .sort({ startDate: -1 });
    }

    /**
     * Update course instance statistics
     */
    static async updateCourseInstanceStats(courseInstanceId) {
        const stats = await StudentEnrollment.aggregate([
            { $match: { courseInstanceId: courseInstanceId } },
            {
                $group: {
                    _id: null,
                    enrollmentCount: { $sum: 1 },
                    completionCount: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
                        },
                    },
                    dropoutCount: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "dropped"] }, 1, 0],
                        },
                    },
                },
            },
        ]);

        if (stats.length > 0) {
            await CourseInstance.findByIdAndUpdate(courseInstanceId, {
                enrollmentCount: stats[0].enrollmentCount,
                completionCount: stats[0].completionCount,
                dropoutCount: stats[0].dropoutCount,
            });
        }
    }
}

export default CourseMatchingService;
