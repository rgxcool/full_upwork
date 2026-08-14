import Student from "../models/Student.js";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import {
    ACTIVE_ENROLLMENT_STATUSES,
    computeInactivitySignal,
} from "../utils/inactivityStatus.js";
import {
    computeLiveInactivitySignal,
    ensureInactivityDiscussionThread,
    notifyInactivityAction,
    resolveResponsibleTeacher,
    safeInactivitySideEffect,
    summarizeInactivitySignal,
} from "./inactivityDiscussionService.js";

/**
 * Idempotently applies the P0 inactivity withdrawal rule to eligible students.
 * The operation is intentionally explicit; the existing app has no scheduler.
 */
export async function runInactivityAutomation({ actorId, actorRole, today = new Date() }) {
    const enrollments = await StudentEnrollment.find({
        status: { $in: ACTIVE_ENROLLMENT_STATUSES },
        endDate: { $gte: today },
    }).select("studentId courseInstanceId startDate endDate status").lean();

    const byStudent = new Map();
    for (const enrollment of enrollments) {
        const key = enrollment.studentId?.toString();
        if (!key) continue;
        if (!byStudent.has(key)) byStudent.set(key, []);
        byStudent.get(key).push(enrollment);
    }

    const studentIds = [...byStudent.keys()];
    if (!studentIds.length) return { evaluated: 0, withdrawn: 0, skipped: 0 };

    const students = await Student.find({ _id: { $in: studentIds }, dropout: { $ne: true } })
        .select("name email dropout")
        .lean();
    const emails = students.map((student) => student.email).filter(Boolean);
    const users = await User.find({ email: { $in: emails } }).select("email lastLoginAt").lean();
    const userByEmail = new Map(users.map((user) => [String(user.email).toLowerCase(), user]));
    const submissions = await AssignmentSubmission.find({ studentId: { $in: studentIds } })
        .select("studentId submittedAt feedback revisionDecision")
        .lean();
    const lastSubmissionByStudent = new Map();
    for (const submission of submissions) {
        const key = submission.studentId?.toString();
        if (!key || !submission.submittedAt) continue;
        const current = lastSubmissionByStudent.get(key);
        if (!current || new Date(submission.submittedAt) > current) {
            lastSubmissionByStudent.set(key, new Date(submission.submittedAt));
        }
    }

    const result = { evaluated: 0, withdrawn: 0, skipped: 0 };
    for (const student of students) {
        const studentId = student._id.toString();
        const signal = computeInactivitySignal({
            lastLoginAt: userByEmail.get(String(student.email || "").toLowerCase())?.lastLoginAt,
            enrollments: byStudent.get(studentId),
            lastSubmissionAt: lastSubmissionByStudent.get(studentId),
            today,
        });
        if (!signal.evaluated) continue;
        result.evaluated++;
        if (!signal.mustWithdraw) {
            result.skipped++;
            continue;
        }

        const claimed = await Student.findOneAndUpdate(
            { _id: student._id, dropout: { $ne: true } },
            {
                $set: { dropout: true },
                $push: {
                    changeHistory: {
                        timestamp: new Date(),
                        changedBy: actorId,
                        changedByRole: actorRole,
                        changes: ["dropout", "inactivity_automation"],
                        previousValues: { dropout: false },
                        newValues: { dropout: true },
                    },
                },
            },
            { new: true }
        );
        if (!claimed) {
            result.skipped++;
            continue;
        }

        await StudentEnrollment.updateMany(
            { studentId: student._id, status: { $in: ["enrolled", "active", "inactive", "suspended", "reviderad"] } },
            { $set: { status: "dropped" } }
        );
        result.withdrawn++;

        await safeInactivitySideEffect(async () => {
            const responsible = await resolveResponsibleTeacher(studentId);
            if (!responsible) return null;
            const liveSignal = await computeLiveInactivitySignal({ studentId, email: student.email });
            const signalSummary = liveSignal ? summarizeInactivitySignal(liveSignal, student.name) : summarizeInactivitySignal(signal, student.name);
            await notifyInactivityAction({
                studentId,
                studentName: student.name,
                teacherId: responsible.teacherId,
                teacherUserId: responsible.userId,
                adminUserId: actorId,
                action: "withdraw",
                signalSummary,
            });
            return ensureInactivityDiscussionThread({
                studentId,
                adminUserId: actorId,
                teacherUserId: responsible.userId,
                studentName: student.name,
                actionLabel: "Eleven har avslutats automatiskt på grund av inaktivitet",
                signalSummary,
            });
        }, "notify_teacher_of_automated_withdrawal");
    }

    return result;
}
