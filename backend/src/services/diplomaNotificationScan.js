/**
 * Course / course-package completion scan (Etapp 3, Part 3).
 *
 * Runs daily via the scheduler. Fully idempotent by construction:
 *   - every completion is recorded once in `completionEvents`, keyed by a
 *     stable idempotencyKey (`course:<student>:<instance>` for a single course,
 *     `package:<student>:<package>` for a whole package). A follow-up scan
 *     finds the existing event and skips — no duplicate completion, no
 *     duplicate notification.
 *   - notifications are only created while creating the completion event, and
 *     only when no unresolved notification of the same scope already exists.
 *
 * Two levels are detected:
 *   A. Course completion — a STANDALONE (non-package) completed enrollment is
 *      verified against the ACTUAL course requirements (explicit completion,
 *      teacher-approved grade, accepted assignment submissions). The end date
 *      is deliberately NOT a factor — a course is completed by its work, not
 *      by the calendar.
 *   B. Package completion — the whole package is verified (all courses
 *      completed + graded, no withdrawn course, APL approved), then the
 *      diploma trigger fires (admin diploma_ready + teacher + student).
 *
 * Notification scoping mirrors GET /notifications:
 *   - admin/systemadmin see everything (except dropout)
 *   - teachers see `teacher` = the teacher's User id (#102)
 *   - students see `meta.studentUserId` = User email account (+ email delivery)
 */
import logger from "../utils/logger.js";

import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import CompletionEvent from "../models/CompletionEvent.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";
import { sendEmail } from "./emailService.js";

import {
    checkCourseCompletion,
    checkPackageCompletion,
    getResponsibleTeacher,
    createCompletionEvent,
    courseCompletionKey,
    packageCompletionKey,
    getStudentCompletionContext,
} from "./courseCompletionService.js";

// Re-export the reusable verification service for controllers/tests.
export { checkCourseCompletion, checkPackageCompletion };

// ── Scope-dedup helpers ─────────────────────────────────────────────────────

/**
 * True when an unresolved notification already exists for the given scope.
 * Each recipient has its OWN dedup scope, so an admin notification never
 * suppresses the teacher's (or students' own) copy of the same completion.
 * @param {string} type
 * @param {{ studentId: string, coursePackageId?: string, courseInstanceId?: string, enrollmentId?: string }} scope
 * @param {{ teacher?: string, studentUserId?: string }} [recipient]
 * @returns {Promise<boolean>}
 */
async function hasUnresolvedNotification(type, scope, recipient = {}) {
    const query = {
        type,
        resolved: false,
        "meta.studentId": scope.studentId,
    };
    if (scope.coursePackageId) query["meta.coursePackageId"] = scope.coursePackageId;
    if (scope.courseInstanceId) query["meta.courseInstanceId"] = scope.courseInstanceId;
    if (scope.enrollmentId) query["meta.enrollmentId"] = scope.enrollmentId;
    if (recipient.teacher) query.teacher = recipient.teacher;
    if (recipient.studentUserId) query["meta.studentUserId"] = recipient.studentUserId;
    const existing = await Notification.findOne(query).lean();
    return !!existing;
}

/**
 * Resolve the login User account for a student so in-app notifications reach
 * the student's own inbox (students are linked to accounts by email).
 * @param {string} email
 * @returns {Promise<{ userId: string|null, hasAccount: boolean }>}
 */
async function resolveStudentAccount(email) {
    if (!email) return { userId: null, hasAccount: false };
    try {
        const user = await User.findOne({ email })
            .select("_id")
            .lean();
        return { userId: user?._id ? String(user._id) : null, hasAccount: !!user };
    } catch (err) {
        logger.error({ err, email }, "Failed to resolve student login account");
        return { userId: null, hasAccount: false };
    }
}

/**
 * Create an admin-facing notification (visible to all admin/systemadmin).
 * @returns {Promise<Notification|null>}
 */
async function createAdminNotification(type, data) {
    try {
        return await Notification.create({
            type,
            studentId: data.studentId,
            message: data.message,
            resolved: false,
            meta: {
                studentId: data.studentId,
                studentUserId: data.studentUserId || null,
                courseId: data.courseId || null,
                courseInstanceId: data.courseInstanceId || null,
                coursePackageId: data.coursePackageId || null,
                enrollmentId: data.enrollmentId || null,
                completionDate: data.completionDate || new Date(),
                completionType: data.completionType || "course",
                responsibleTeacher: data.teacherName || "",
                studentMunicipality: data.municipality || "",
                url: data.url || "",
            },
        });
    } catch (err) {
        logger.error({ err, type }, "Failed to create admin completion notification");
        return null;
    }
}

/**
 * Create a teacher-facing notification. `teacher` (the field GET
 * /notifications filters on) and meta.teacherId are both the teacher's User id (#102).
 * @returns {Promise<Notification|null>}
 */
async function createTeacherNotification(type, data) {
    if (!data.teacherId) return null;
    try {
        return await Notification.create({
            type,
            studentId: data.studentId,
            teacher: data.teacherId,
            message: data.message,
            resolved: false,
            meta: {
                studentId: data.studentId,
                teacherId: data.teacherUserId || null,
                courseId: data.courseId || null,
                courseInstanceId: data.courseInstanceId || null,
                coursePackageId: data.coursePackageId || null,
                enrollmentId: data.enrollmentId || null,
                completionDate: data.completionDate || new Date(),
                completionType: data.completionType || "course",
                url: data.url || "",
            },
        });
    } catch (err) {
        logger.error({ err, type }, "Failed to create teacher completion notification");
        return null;
    }
}

/**
 * Notify the student through the existing systems (in-app notification + email).
 * @returns {Promise<{inApp: boolean, email: boolean}>}
 */
async function notifyStudentCompletion(type, data) {
    const result = { inApp: false, email: false };

    if (data.studentUserId) {
        try {
            await Notification.create({
                type,
                studentId: data.studentId,
                message: data.message,
                resolved: false,
                meta: {
                    studentId: data.studentId,
                    studentUserId: data.studentUserId,
                    coursePackageId: data.coursePackageId || null,
                    enrollmentId: data.enrollmentId || null,
                    completionDate: new Date(),
                    completionType: data.completionType || "course",
                    url: data.url || "",
                },
            });
            result.inApp = true;
        } catch (err) {
            logger.error({ err, type }, "Failed to create student in-app notification");
        }
    }

    if (data.email) {
        try {
            const subject =
                type === NOTIFICATION_TYPES.DIPLOMA_READY
                    ? "Ditt diplom är klart"
                    : "Kurs avklarad — Mindful Learning";
            await sendEmail({
                to: data.email,
                subject,
                html: `<p>Hej ${data.studentName}!</p>
<p>${data.message}</p>
<p>Logga in i Mindful Learning för att se mer.</p>`,
            });
            result.email = true;
        } catch (err) {
            logger.warn({ err, email: data.email }, "Completion email skipped");
        }
    }

    return result;
}

// ── Scan ────────────────────────────────────────────────────────────────────

/**
 * Run the idempotent completion scan.
 * @returns {Promise<{
 *   checked: number, courseEvents: number, packageEvents: number,
 *   created: number, skipped: number,
 *   adminNotified: number, teacherNotified: number, studentNotified: number,
 * }>}
 */
export async function runCompletionScan() {
    const summary = {
        checked: 0,
        courseEvents: 0,
        packageEvents: 0,
        created: 0,
        skipped: 0,
        adminNotified: 0,
        teacherNotified: 0,
        studentNotified: 0,
    };

    // ── A. Course-level completion (standalone enrollments) ───────────────
    const courseEnrollments = await StudentEnrollment.find({
        coursePackageId: { $in: [null, undefined] },
        status: "completed",
    }).lean();
    summary.checked += courseEnrollments.length;

    // Batch-prefetch already-recorded events so no per-enrollment dedup query.
    const courseKeys = courseEnrollments.map((e) =>
        courseCompletionKey(e.studentId, e.courseInstanceId)
    );
    const existingCourseKeys = new Set(
        await CompletionEvent.find({ idempotencyKey: { $in: courseKeys } })
            .select("idempotencyKey")
            .lean()
            .then((rows) => rows.map((r) => r.idempotencyKey))
    );

    for (const enrollment of courseEnrollments) {
        const studentId = enrollment.studentId;
        const courseInstanceId = enrollment.courseInstanceId;
        if (existingCourseKeys.has(courseCompletionKey(studentId, courseInstanceId))) {
            summary.skipped++;
            continue;
        }
        try {
            const { student, municipality } = await getStudentCompletionContext(studentId);
            if (!student) {
                summary.skipped++;
                continue;
            }

            const completion = await checkCourseCompletion(studentId, courseInstanceId);
            if (!completion.completed) {
                summary.skipped++;
                continue;
            }

            const key = courseCompletionKey(studentId, courseInstanceId);
            const { created } = await createCompletionEvent({
                idempotencyKey: key,
                studentId,
                studentName: student.name || "",
                completionType: "course",
                courseInstanceId,
                courseId: completion.enrollment?.mainCourseId || null,
                courseName: await resolveCourseName(courseInstanceId),
                coursePackageId: null,
                packageName: "",
                completionDate: completion.completionDate || new Date(),
                municipality,
                teacherId: enrollment.teacherId || null,
                enrollmentIds: [enrollment._id],
            });
            if (!created) {
                summary.skipped++;
                continue;
            }
            summary.created++;
            summary.courseEvents++;

            const teacher = await getResponsibleTeacher(enrollment, courseInstanceId);
            const account = await resolveStudentAccount(student.email);
            const courseName = await resolveCourseName(courseInstanceId);
            const scope = { studentId, courseInstanceId, enrollmentId: enrollment._id };

            if (!(await hasUnresolvedNotification(NOTIFICATION_TYPES.COURSE_COMPLETED, scope))) {
                const note = await createAdminNotification(NOTIFICATION_TYPES.COURSE_COMPLETED, {
                    message: `Kursen ${courseName || "okänd kurs"} är avklarad för ${student.name}.`,
                    studentId,
                    studentUserId: account.userId,
                    courseId: completion.enrollment?.mainCourseId || null,
                    courseInstanceId,
                    enrollmentId: enrollment._id,
                    completionDate: completion.completionDate || new Date(),
                    teacherName: teacher.teacherName || "",
                    municipality,
                    url: `/student/${studentId}`,
                    completionType: "course",
                });
                if (note) summary.adminNotified++;
            }

            if (teacher.teacherId) {
                if (!(await hasUnresolvedNotification(
                    NOTIFICATION_TYPES.COURSE_COMPLETED,
                    scope,
                    { teacher: teacher.teacherId }
                ))) {
                    const note = await createTeacherNotification(
                        NOTIFICATION_TYPES.COURSE_COMPLETED,
                        {
                            message: `Kursen ${courseName || "okänd kurs"} är avklarad för ${student.name}.`,
                            studentId,
                            teacherId: teacher.teacherId,
                            teacherUserId: teacher.teacherUserId,
                            courseId: completion.enrollment?.mainCourseId || null,
                            courseInstanceId,
                            enrollmentId: enrollment._id,
                            completionDate: completion.completionDate || new Date(),
                            url: `/student/${studentId}`,
                            completionType: "course",
                        }
                    );
                    if (note) summary.teacherNotified++;
                }
            }

            const studentResult = await notifyStudentCompletion(
                NOTIFICATION_TYPES.COURSE_COMPLETED,
                {
                    studentId,
                    studentUserId: account.userId,
                    studentName: student.name || "",
                    message: `Kursen ${courseName || "okänd kurs"} är avklarad.`,
                    coursePackageId: null,
                    enrollmentId: enrollment._id,
                    email: student.email,
                    url: `/student/${studentId}`,
                    completionType: "course",
                }
            );
            if (studentResult.inApp) summary.studentNotified++;
        } catch (err) {
            logger.error(
                { err, studentId, courseInstanceId, enrollmentId: enrollment._id },
                "Completion scan — course-level failed"
            );
        }
    }

    // ── B. Package-level completion ────────────────────────────────────────
    const packagePairs = await StudentEnrollment.aggregate([
        {
            $match: {
                coursePackageId: { $exists: true, $ne: null },
                status: "completed",
            },
        },
        {
            $group: {
                _id: { studentId: "$studentId", coursePackageId: "$coursePackageId" },
            },
        },
    ]);
    summary.checked += packagePairs.length;

    // Batch-prefetch already-recorded package events.
    const packageKeys = packagePairs.map((pair) =>
        packageCompletionKey(pair._id.studentId, pair._id.coursePackageId)
    );
    const existingPackageKeys = new Set(
        await CompletionEvent.find({ idempotencyKey: { $in: packageKeys } })
            .select("idempotencyKey")
            .lean()
            .then((rows) => rows.map((r) => r.idempotencyKey))
    );

    for (const pair of packagePairs) {
        const studentId = pair._id.studentId;
        const coursePackageId = pair._id.coursePackageId;
        if (existingPackageKeys.has(packageCompletionKey(studentId, coursePackageId))) {
            summary.skipped++;
            continue;
        }
        try {
            const { student, municipality, aplStatus, priorAplCompleted } =
                await getStudentCompletionContext(studentId);
            if (!student) {
                summary.skipped++;
                continue;
            }

            const completion = await checkPackageCompletion(studentId, coursePackageId, {
                requireApl: true,
            });
            if (!completion.completed) {
                summary.skipped++;
                continue;
            }

            const key = packageCompletionKey(studentId, coursePackageId);
            const { created } = await createCompletionEvent({
                idempotencyKey: key,
                studentId,
                studentName: student.name || "",
                completionType: "course_package",
                courseInstanceId: null,
                courseId: null,
                courseName: "",
                coursePackageId,
                packageName: completion.packageName,
                completionDate: completion.completionDate || new Date(),
                municipality,
                teacherId: completion.enrollment?.teacherId || null,
                enrollmentIds: completion.enrollment ? [completion.enrollment._id] : [],
            });
            if (!created) {
                summary.skipped++;
                continue;
            }
            summary.created++;
            summary.packageEvents++;

            // Diploma trigger sequence: all courses verified, APL approved,
            // end date respected by the existing diploma generation path.
            const primaryEnrollment = completion.enrollment;
            const teacher = primaryEnrollment
                ? await getResponsibleTeacher(primaryEnrollment, primaryEnrollment.courseInstanceId)
                : { teacherId: null, teacherName: "", teacherEmail: null, teacherUserId: null };

            const account = await resolveStudentAccount(student.email);
            const scope = { studentId, coursePackageId };
            const url = primaryEnrollment
                ? `/diploma/${primaryEnrollment._id}/pdf`
                : `/student/${studentId}`;

            if (!(await hasUnresolvedNotification(NOTIFICATION_TYPES.DIPLOMA_READY, scope))) {
                const note = await createAdminNotification(NOTIFICATION_TYPES.DIPLOMA_READY, {
                    message: `Alla kurser och APL är godkända för ${student.name}. När skolsignatur finns skapas diplomet automatiskt och skickas till eleven.`,
                    studentId,
                    studentUserId: account.userId,
                    coursePackageId,
                    enrollmentId: primaryEnrollment?._id || null,
                    completionDate: completion.completionDate || new Date(),
                    teacherName: teacher.teacherName || "",
                    municipality,
                    url,
                    completionType: "course_package",
                });
                if (note) summary.adminNotified++;
            }

            if (teacher.teacherId) {
                if (!(await hasUnresolvedNotification(
                    NOTIFICATION_TYPES.DIPLOMA_READY,
                    scope,
                    { teacher: teacher.teacherId }
                ))) {
                    const note = await createTeacherNotification(
                        NOTIFICATION_TYPES.DIPLOMA_READY,
                        {
                            message: `Kurspaketet ${completion.packageName} är klart för ${student.name}. När skolsignatur finns skapas diplomet automatiskt och skickas till eleven.`,
                            studentId,
                            teacherId: teacher.teacherId,
                            teacherUserId: teacher.teacherUserId,
                            coursePackageId,
                            enrollmentId: primaryEnrollment?._id || null,
                            completionDate: completion.completionDate || new Date(),
                            url,
                            completionType: "course_package",
                        }
                    );
                    if (note) summary.teacherNotified++;
                }
            }

            const studentResult = await notifyStudentCompletion(NOTIFICATION_TYPES.DIPLOMA_READY, {
                studentId,
                studentUserId: account.userId,
                studentName: student.name || "",
                message: `Ditt kurspaket ${completion.packageName} är klart. När skolsignatur finns skapas ditt signerade diplom automatiskt och skickas till din e-post.`,
                coursePackageId,
                enrollmentId: primaryEnrollment?._id || null,
                url,
                completionType: "course_package",
            });
            if (studentResult.inApp) summary.studentNotified++;

            logger.info(
                {
                    studentId,
                    coursePackageId,
                    aplStatus,
                    priorAplCompleted,
                    apiEligibilityPreserved: true,
                },
                "Course package completion recorded"
            );
        } catch (err) {
            logger.error(
                { err, studentId, coursePackageId },
                "Completion scan — package-level failed"
            );
        }
    }

    logger.info(summary, "Completion scan finished");
    return summary;
}

/**
 * Resolve a human-readable course name for notifications/events.
 * @param {string} courseInstanceId
 * @returns {Promise<string>}
 */
async function resolveCourseName(courseInstanceId) {
    if (!courseInstanceId) return "";
    try {
        const instance = await CourseInstance.findById(courseInstanceId)
            .select("courseName")
            .lean();
        return instance?.courseName || "";
    } catch {
        return "";
    }
}

// Backwards-compatible alias — the scheduler still imports this name.
export const runDiplomaNotificationScan = runCompletionScan;