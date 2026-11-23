/**
 * Inactivity discussion loop (Etapp 2, Phase 4D).
 *
 * When an admin acts on a flagged student (warning email or withdrawal), the
 * student's responsible teacher is pulled into the loop instead of receiving a
 * one-way alert: they get a Notification and a shared discussion thread
 * (Conversation + opening Message in the existing messaging system) so teacher
 * and admin can discuss and decide together. All helpers are non-fatal — a
 * failure here must never break the underlying action.
 */
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import logger from "../utils/logger.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";
import {
    ACTIVE_ENROLLMENT_STATUSES,
    INACTIVITY_WARNING_DAYS,
    INACTIVITY_WITHDRAW_DAYS,
    computeInactivitySignal,
} from "../utils/inactivityStatus.js";

const REVIEW_MARKER = "inactivity_review_notified";

const hasReviewNotification = (student) =>
    (student.changeHistory || []).some(
        (entry) => entry.changes && entry.changes.includes(REVIEW_MARKER)
    );

export const hasSentInactivityWarning = (student) =>
    (student.changeHistory || []).some(
        (entry) => entry.changes && entry.changes.includes("inactivity_warning_email")
    );

const formatDateLine = (value) => {
    if (!value) return "aldrig";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "aldrig";
    return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
};

/**
 * Create the administrator "withdrawal review" notification for a student who
 * has been inactive during the first five days (compliance rule) but has not
 * yet received a warning email. Idempotent: a student is only notified once
 * (marker in changeHistory), and never after a warning email has been sent.
 *
 * The notification carries everything an administrator needs to decide
 * (requirement: student, course, activity status, last activity date, days
 * inactive, relevant scheduled dates, assignment status, available actions)
 * WITHOUT exposing personnummer or other sensitive data. The decision itself
 * is performed by the admin from the notification (withdraw / warning email).
 *
 * @param {{ studentId: string, student: Object, signal: Object, enrollmentMeta?: Array<{courseName: string, scheduledDates: Date[]}>, lastActivityAt?: Date|null }} params
 * @returns {Promise<"created"|"already_reviewed"|"warning_sent">}
 */
export const createInactivityReviewNotification = async ({
    studentId,
    student,
    signal,
    enrollmentMeta = [],
    lastActivityAt = null,
}) => {
    if (hasSentInactivityWarning(student)) return "warning_sent";
    if (hasReviewNotification(student)) return "already_reviewed";
    if (!studentId) return "already_reviewed";

    const courseNames = enrollmentMeta.map((e) => e.courseName).filter(Boolean);
    const scheduledDates = enrollmentMeta
        .flatMap((e) => e.scheduledDates || [])
        .filter(Boolean)
        .slice(0, 10);

    const daysInactive = signal.activityBasis;

    const meta = {
        studentId,
        studentName: student.name || "",
        courseIds: enrollmentMeta
            .map((e) => e.courseInstanceId)
            .filter(Boolean),
        courseNames,
        scheduledDates,
        lastActivityAt: lastActivityAt || null,
        daysInactive: Number.isFinite(daysInactive) ? daysInactive : null,
        openSubmissions: signal.openSubmissions || 0,
        daysUntilWithdraw: signal.daysUntilWithdraw,
        url: "/admin/inactivity",
    };

    const coursesLine = courseNames.length > 0 ? courseNames.join(", ") : "Okända kurser";
    const datesLine = scheduledDates.length > 0
        ? scheduledDates.map(formatDateLine).join(", ")
        : "inga inplanerade tillfällen";
    const message =
        `Inaktivitetsgranskning krävs: ${student.name || "Eleven"}. ` +
        `Kurser: ${coursesLine}. ` +
        `Senast aktivitet: ${formatDateLine(lastActivityAt)} (${Number.isFinite(daysInactive) ? `${daysInactive} dagar sedan` : "okänd"}). ` +
        `Öppna inlämningar: ${signal.openSubmissions || 0}. ` +
        `Inplanerade tillfällen: ${datesLine}. ` +
        `Åtgärder: skicka varningsmail eller avsluta omedelbart.`;

    await Notification.create({
        type: NOTIFICATION_TYPES.INACTIVITY_REVIEW,
        message,
        meta,
        resolvedByUsers: [],
    });

    await Student.updateOne(
        { _id: studentId, "changeHistory.changes": { $nin: [REVIEW_MARKER] } },
        {
            $push: {
                changeHistory: {
                    timestamp: new Date(),
                    changedBy: null,
                    changedByRole: "system",
                    changes: [REVIEW_MARKER, "auto"],
                    newValues: { createdAt: new Date() },
                },
            },
        }
    );

    return "created";
};

/**
 * Resolve the responsible teacher (first enrollment with a teacherId) for a
 * student.
 * @param {string} studentId
 * @returns {Promise<{ teacherId: ObjectId, userId: ObjectId } | null>}
 */
export async function resolveResponsibleTeacher(studentId) {
    const enrollment = await StudentEnrollment.findOne({
        studentId,
        teacherId: { $ne: null },
    })
        .select("teacherId")
        .lean();
    if (!enrollment?.teacherId) return null;

    const teacher = await Teacher.findById(enrollment.teacherId).select("userId").lean();
    if (!teacher?.userId) return null;

    return { teacherId: teacher._id, userId: teacher.userId };
}

/**
 * Compute the live inactivity signal for a student, reading the same sources as
 * the inactivity report (active enrollments, User.lastLoginAt, submissions).
 * @param {{ studentId: string, email?: string, today?: Date }} params
 * @returns {Promise<Object|null>} the signal, or null when the student has no
 *   current enrollment and is therefore not evaluated.
 */
export async function computeLiveInactivitySignal({ studentId, email, today = new Date() }) {
    const enrollments = await StudentEnrollment.find({
        studentId,
        status: { $in: ACTIVE_ENROLLMENT_STATUSES },
        endDate: { $gte: today },
    })
        .select("status startDate endDate")
        .lean();

    const user = email
        ? await User.findOne({ email }).select("lastLoginAt").lean()
        : null;

    const studentDoc = await Student.findById(studentId)
        .select("lastLearningActivityAt")
        .lean();

    const submissions = await AssignmentSubmission.find({
        enrollmentId: { $in: enrollments.map((e) => e._id) },
    })
        .select("studentId submittedAt feedback revisionDecision")
        .lean();

    let lastSubmissionAt = null;
    let openSubmissions = 0;
    for (const submission of submissions) {
        if (
            !submission.feedback ||
            (submission.feedback.status !== "godkänd" &&
                submission.revisionDecision !== "godkänd")
        ) {
            openSubmissions += 1;
        }
        if (submission.submittedAt) {
            const ts = new Date(submission.submittedAt).getTime();
            if (!lastSubmissionAt || ts > lastSubmissionAt) lastSubmissionAt = ts;
        }
    }

    const signal = computeInactivitySignal({
        lastLoginAt: user?.lastLoginAt || null,
        enrollments,
        lastSubmissionAt: lastSubmissionAt ? new Date(lastSubmissionAt) : null,
        lastLearningActivityAt: studentDoc?.lastLearningActivityAt || null,
        openSubmissions,
        today,
    });

    return signal.evaluated ? signal : null;
}

const daysOrNever = (days) => (days === null || days === undefined ? "aldrig" : `${days} dagar sedan`);

/**
 * Human-readable Swedish summary of a computed inactivity signal, embedded in
 * the discussion thread's opening message and the teacher notification so the
 * live status is visible without opening the report.
 * @param {Object} signal - a computeInactivitySignal result.
 * @param {string} [studentName]
 * @returns {string}
 */
export function summarizeInactivitySignal(signal, studentName = "eleven") {
    const parts = [
        `Senast inloggning: ${daysOrNever(signal.daysSinceLastLogin)}`,
        `Senast kurs-/lektionaktivitet: ${daysOrNever(signal.daysSinceLastLearningActivity)}`,
        `Senast inlämning: ${daysOrNever(signal.daysSinceLastSubmission)}`,
    ];
    if (signal.openSubmissions > 0) {
        parts.push(`Öppna inlämningar: ${signal.openSubmissions}`);
    }
    if (signal.level === "withdraw") {
        parts.push(
            `Ska avslutas (gräns ${INACTIVITY_WITHDRAW_DAYS} dagar) — avslut kvarvarande dagar: ${
                signal.daysUntilWithdraw === null ? "?" : signal.daysUntilWithdraw
            }`
        );
    } else if (signal.level === "warning") {
        parts.push(`Varningsnivå (gräns ${INACTIVITY_WARNING_DAYS} dagar utan aktivitet)`);
    } else {
        parts.push("Aktiviteten OK");
    }
    return `${studentName} — ${parts.join(". ")}.`;
}

/**
 * Find-or-create a discussion thread about a flagged student between an admin
 * and the responsible teacher. The opening message describes the action that
 * triggered the thread so both sides can continue the discussion in the
 * messaging UI.
 * @param {{ studentId: string, adminUserId: string, teacherUserId: string, studentName?: string, actionLabel: string, signalSummary?: string }} params
 * @returns {Promise<Object|null>} the conversation document (existing or new), or null when inputs are missing.
 */
export async function ensureInactivityDiscussionThread({
    studentId,
    adminUserId,
    teacherUserId,
    studentName,
    actionLabel,
    signalSummary,
}) {
    if (!studentId || !adminUserId || !teacherUserId) return null;

    const existing = await Conversation.findOne({
        studentId,
        participants: { $all: [adminUserId, teacherUserId] },
    });
    if (existing) return existing;

    const conversation = await Conversation.create({
        participants: [adminUserId, teacherUserId],
        studentId,
        subject: `Inaktivitetsärende — ${studentName || "elev"}`,
    });

    const signalLine = signalSummary ? `\n\n${signalSummary}` : "";
    await Message.create({
        conversationId: conversation._id,
        senderId: adminUserId,
        body: `${actionLabel}. Diskussion om fortsatt hantering av ${studentName || "eleven"} förs här.${signalLine}`,
        readBy: [{ userId: adminUserId, readAt: new Date() }],
    });

    return conversation;
}

/**
 * Notify the responsible teacher that an admin acted on a flagged student.
 * @param {{ studentId: string, studentName: string, teacherId: ObjectId, teacherUserId: ObjectId, adminUserId: string, action: "warning_email"|"withdraw", signalSummary?: string }} params
 */
export async function notifyInactivityAction({
    studentId,
    studentName,
    teacherId,
    teacherUserId,
    adminUserId,
    action,
    signalSummary,
}) {
    if (!studentId || !teacherId || !teacherUserId) return;

    const actionText =
        action === "withdraw"
            ? `Eleven ${studentName} har avslutats på grund av inaktivitet (avbrott).`
            : `Varningsmail om inaktivitet har skickats till ${studentName}.`;

    const message = signalSummary ? `${actionText} ${signalSummary}` : actionText;

    const existing = await Notification.findOne({
        type: NOTIFICATION_TYPES.INACTIVITY_ACTION,
        teacher: teacherId,
        "meta.studentId": studentId,
    });
    if (existing) {
        // Re-sending the warning updates the notification instead of piling up
        // duplicates, and re-surfaces it to users who had resolved it before.
        existing.message = message;
        existing.createdByAdmin = adminUserId;
        existing.resolved = false;
        existing.resolvedByUsers = [];
        await existing.save();
        return;
    }

    await Notification.create({
        type: NOTIFICATION_TYPES.INACTIVITY_ACTION,
        teacher: teacherId,
        createdByAdmin: adminUserId,
        message,
        meta: {
            teacherId: teacherUserId,
            studentId,
            studentName,
            // The inactivity report is where the admin can act on this
            // notification (warning email / avbrott buttons).
            url: "/admin/inactivity",
        },
        resolved: false,
        resolvedByUsers: [],
    });
}

/**
 * Run an async callback inside a try/catch so a Phase 4D failure can never
 * break the caller (e.g. a warning email or dropout action).
 * @param {() => Promise<*>} fn
 * @param {string} label
 * @returns {Promise<*>}
 */
export const safeInactivitySideEffect = async (fn, label) => {
    try {
        return await fn();
    } catch (error) {
        logger.error({ err: error, step: label }, "Inactivity side effect failed (non-fatal)");
        return null;
    }
};
