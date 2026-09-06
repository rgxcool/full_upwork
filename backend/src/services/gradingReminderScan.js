import logger from "../utils/logger.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Notification from "../models/Notification.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const NON_GRADABLE_STATUSES = ["dropped", "inactive", "suspended"];

export async function runGradingReminderScan() {
    const daysBefore = parseInt(process.env.GRADE_REMINDER_DAYS_BEFORE, 10) || 7;
    const daysAfter = parseInt(process.env.GRADE_REMINDER_DAYS_AFTER, 10) || 14;

    const now = new Date();
    const pastCutoff = new Date(now.getTime() - daysAfter * DAY_MS);
    const futureCutoff = new Date(now.getTime() + daysBefore * DAY_MS);

    const enrollments = await StudentEnrollment.find({
        endDate: { $gte: pastCutoff, $lte: futureCutoff },
        grade: null,
        isGradeLocked: false,
        status: { $nin: NON_GRADABLE_STATUSES },
    })
        .select("studentId courseInstanceId endDate")
        .lean();

    if (!enrollments.length) {
        return { checked: 0, created: 0, skipped: 0 };
    }

    let created = 0;
    let skipped = 0;

    for (const enrollment of enrollments) {
        try {
            const student = await Student.findById(enrollment.studentId)
                .select("name teacherId")
                .lean();

            if (!student || !student.teacherId) {
                skipped++;
                continue;
            }

            const teacherRecord = await Teacher.findById(student.teacherId)
                .select("userId")
                .lean();

            if (!teacherRecord) {
                skipped++;
                continue;
            }

            const existing = await Notification.findOne({
                type: NOTIFICATION_TYPES.GRADES_PENDING,
                "meta.enrollmentId": enrollment._id,
                resolved: false,
            }).lean();

            if (existing) {
                skipped++;
                continue;
            }

            const endDateStr = new Date(enrollment.endDate).toISOString().slice(0, 10);

            await Notification.create({
                type: NOTIFICATION_TYPES.GRADES_PENDING,
                studentId: enrollment.studentId,
                courseId: enrollment.courseInstanceId,
                teacher: teacherRecord._id,
                message: `Betyg saknas för ${student.name} — kursen avslutades ${endDateStr}.`,
                meta: {
                    enrollmentId: enrollment._id,
                    studentId: enrollment.studentId,
                    courseId: enrollment.courseInstanceId,
                    teacherId: teacherRecord.userId,
                },
                resolved: false,
            });

            created++;
        } catch (err) {
            logger.error(
                { err, enrollmentId: enrollment._id },
                "Grading reminder scan — failed for enrollment"
            );
        }
    }

    const summary = { checked: enrollments.length, created, skipped };
    logger.info(summary, "Grading reminder scan finished");
    return summary;
}
