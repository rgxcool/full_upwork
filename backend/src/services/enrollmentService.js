import mongoose from "mongoose";
import logger from "../utils/logger.js";
import { AppError } from "../utils/errorHandler.js";
import CourseMatchingService from "../utils/courseMatchingService.js";
import { buildVisibleModules } from "../utils/courseContentVisibility.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";

export const VALID_ENROLLMENT_STATUSES = [
    "enrolled",
    "active",
    "completed",
    "dropped",
    "inactive",
    "suspended",
    "reviderad",
];

export const VALID_TEMPO_WEEKS = [5, 10, 20];

/**
 * Fetch a student's enrollments with the shared filter shape used by the
 * enrollments endpoints (status + date-range filters).
 */
export const fetchStudentEnrollments = async ({ studentId, status, startDate, endDate }) => {
    const query = { studentId };

    if (status) query.status = status;
    if (startDate || endDate) {
        query.$and = [];
        if (startDate) query.$and.push({ startDate: { $gte: new Date(startDate) } });
        if (endDate) query.$and.push({ endDate: { $lte: new Date(endDate) } });
    }

    return StudentEnrollment.find(query)
        .populate("courseInstanceId")
        .populate("mainCourseId")
        .populate("teacherId", "username email")
        .populate("gradeBy", "username email")
        .sort({ startDate: -1 });
};

/**
 * Build course cards for a student from their enrollments.
 * Cards are aggregated from StudentEnrollments grouped by CourseInstance
 * (which is unique per course + dates + responsible teacher), so the same
 * course over the same period shares a single card. Course content (modules)
 * comes from the course instance, which already holds the duplicated template
 * modules created at admission.
 */
export const buildCourseCards = async (studentId, { applyStudentVisibility = false } = {}) => {
    const enrollments = await StudentEnrollment.find({ studentId })
        .populate({
            path: "courseInstanceId",
            populate: [
                {
                    path: "responsibleTeacher",
                    populate: { path: "userId", select: "username" },
                },
                { path: "mainCourseId" },
            ],
        })
        .populate("mainCourseId")
        .sort({ startDate: 1 });

    // Group by course instance so the same course + dates share one card.
    const byInstance = new Map();
    for (const enrollment of enrollments) {
        const instanceId = enrollment.courseInstanceId?._id?.toString();
        if (!instanceId) continue;
        const existing = byInstance.get(instanceId);
        if (!existing || new Date(enrollment.startDate) > new Date(existing.startDate)) {
            byInstance.set(instanceId, enrollment);
        }
    }

    // Every student enrolled on the same course instance shares that card, so
    // collect them per instance (aggregated from StudentEnrollment + Student).
    const sharedStudents = new Map();
    if (byInstance.size > 0) {
        const instanceIds = [...byInstance.keys()];
        const sharedEnrollments = await StudentEnrollment.find({
            courseInstanceId: { $in: instanceIds },
        })
            .populate("studentId", "name email")
            .select("courseInstanceId studentId");
        for (const shared of sharedEnrollments) {
            const rawInstanceId =
                shared.courseInstanceId?._id || shared.courseInstanceId;
            const instanceId = rawInstanceId?.toString();
            if (!instanceId || !byInstance.has(instanceId)) continue;
            const student = shared.studentId;
            if (!student?._id) continue;
            const students = sharedStudents.get(instanceId) || [];
            if (!students.some((s) => s._id.toString() === student._id.toString())) {
                students.push({
                    _id: student._id,
                    name: student.name || "Okänd elev",
                    email: student.email || null,
                });
            }
            sharedStudents.set(instanceId, students);
        }
        for (const students of sharedStudents.values()) {
            students.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        }
    }

    const cards = [...byInstance.values()]
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
        .map((enrollment, index) => {
            const instance = enrollment.courseInstanceId;
            const startDate = instance?.startDate || enrollment.startDate;
            const endDate = instance?.endDate || enrollment.endDate;
            const weeks = Math.ceil(
                (new Date(endDate) - new Date(startDate)) / (7 * 24 * 60 * 60 * 1000)
            );
            const instanceId = instance?._id?.toString();

            return {
                courseInstanceId: instance?._id || null,
                enrollmentId: enrollment._id,
                students: sharedStudents.get(instanceId) || [],
                courseName:
                    instance?.courseName ||
                    instance?.mainCourseId?.courseName ||
                    enrollment.mainCourseId?.courseName ||
                    "",
                courseCode:
                    instance?.courseCode ||
                    instance?.mainCourseId?.courseCode ||
                    enrollment.mainCourseId?.courseCode ||
                    "",
                coursePoints:
                    instance?.coursePoints ||
                    instance?.mainCourseId?.coursePoints ||
                    enrollment.mainCourseId?.coursePoints ||
                    "",
                courseExtent:
                    instance?.courseExtent ||
                    instance?.mainCourseId?.courseExtent ||
                    enrollment.mainCourseId?.courseExtent ||
                    "",
                responsibleTeacher:
                    instance?.responsibleTeacher?.userId?.username ||
                    instance?.responsibleTeacher?.name ||
                    instance?.responsibleTeacher?.email ||
                    "",
                startDate,
                endDate,
                weeks: Number.isFinite(weeks) ? Math.max(0, weeks) : 0,
                studyPeriod: index + 1,
                status: enrollment.status,
                scheduledDates:
                    instance?.sectionDates
                        ?.filter(Boolean)
                        .map((d) => d.toISOString().split("T")[0]) || [],
                isCurrentlyActive:
                    enrollment.status === "active" &&
                    new Date(startDate) <= new Date() &&
                    new Date(endDate) >= new Date(),
                modules: buildVisibleModules(instance?.modules, instance?.content, {
                    applyStudentVisibility,
                }),
            };
        });

    // Per-card learning progress: accepted ("godkänd") submissions over the
    // modules that carry an assignment. Cards without any assignment report null.
    const enrollmentIds = cards
        .map((c) => c.enrollmentId)
        .filter((id) => mongoose.isValidObjectId(id));
    const submissionsByEnrollment = new Map();
    if (enrollmentIds.length > 0) {
        const submissions = await AssignmentSubmission.find({
            enrollmentId: { $in: enrollmentIds },
        });
        for (const submission of submissions) {
            const key = String(submission.enrollmentId);
            const list = submissionsByEnrollment.get(key) || [];
            list.push(submission);
            submissionsByEnrollment.set(key, list);
        }
    }

    for (const card of cards) {
        const assignmentModules = (card.modules || []).filter(
            (m) => m.assignment?.title || m.assignment?.description
        );
        const total = assignmentModules.length;
        if (total === 0) {
            card.progress = null;
            continue;
        }
        const moduleNumbers = new Set(assignmentModules.map((m) => m.moduleNumber));
        const accepted = (
            submissionsByEnrollment.get(String(card.enrollmentId)) || []
        ).filter(
            (s) => s.feedback?.status === "godkänd" && moduleNumbers.has(s.moduleNumber)
        ).length;
        card.progress = {
            completed: accepted,
            total,
            percent: Math.round((accepted / total) * 100),
        };
    }

    // "Student's current module": the first assignment-bearing module (by
    // moduleNumber) without an accepted submission. Uses the same module set as
    // `progress` above so the two never disagree — modules without an assignment
    // are not steps the student can complete. Computed at read-time so it never
    // goes stale. Null when there is nothing left to work on.
    for (const card of cards) {
        const assignmentModules = [...(card.modules || [])]
            .filter((m) => m.assignment?.title || m.assignment?.description)
            .sort((a, b) => (a.moduleNumber ?? 0) - (b.moduleNumber ?? 0));
        if (assignmentModules.length === 0) {
            card.currentModule = null;
            card.currentModuleNumber = null;
            continue;
        }
        const accepted = new Set(
            (submissionsByEnrollment.get(String(card.enrollmentId)) || [])
                .filter((s) => s.feedback?.status === "godkänd")
                .map((s) => s.moduleNumber)
        );
        const current = assignmentModules.find((m) => !accepted.has(m.moduleNumber));
        card.currentModule = current
            ? {
                moduleNumber: current.moduleNumber,
                title: current.title || `Modul ${current.moduleNumber}`,
                status: "Pågår",
              }
            : null;
        card.currentModuleNumber = current?.moduleNumber ?? null;
    }

    // Attach lastAccess: most recent of lastLoginAt or last submission per student
    try {
        const studentIds = [...new Set(cards.map((c) => c.students?.map((s) => s._id)).flat().filter(Boolean))];
        if (studentIds.length > 0) {
            const users = await User.find({ _id: { $in: studentIds } }).select("lastLoginAt").lean();
            const loginById = new Map(users.map((u) => [u._id.toString(), u.lastLoginAt || null]));
            const lastSubs = await AssignmentSubmission.aggregate([
                { $match: { studentId: { $in: studentIds } } },
                { $sort: { submittedAt: -1 } },
                { $group: { _id: "$studentId", lastSubmittedAt: { $first: "$submittedAt" } } },
            ]);
            const subById = new Map(lastSubs.map((s) => [s._id.toString(), s.lastSubmittedAt]));
            for (const card of cards) {
                let latestAccess = null;
                for (const student of (card.students || [])) {
                    const sid = student._id?.toString();
                    if (!sid) continue;
                    const loginDate = loginById.get(sid);
                    const subDate = subById.get(sid);
                    const candidate = loginDate && subDate
                        ? (new Date(loginDate) > new Date(subDate) ? loginDate : subDate)
                        : loginDate || subDate || null;
                    if (candidate && (!latestAccess || new Date(candidate) > new Date(latestAccess))) {
                        latestAccess = candidate;
                    }
                }
                card.lastAccess = latestAccess;
            }
        }
    } catch (err) {
        logger.warn({ err }, "Failed to attach lastAccess to course cards");
    }

    return cards;
};

/**
 * Fetch all enrollments for a course instance (participant list). Attaches the
 * student's last login time (best-effort) from the linked user account.
 */
export const fetchCourseInstanceEnrollments = async ({ instanceId, status }) => {
    const query = { courseInstanceId: instanceId };

    if (status) query.status = status;

    const enrollments = await StudentEnrollment.find(query)
        .populate("studentId", "name email dropout personalNumber")
        .populate("mainCourseId", "courseName courseCode resultTypes")
        .populate("teacherId", "username email")
        .populate("gradeBy", "username email")
        .sort({ startDate: -1 })
        .lean();

    // Attach the student's last login time (participants "last-access" column).
    // Students and staff are linked to login accounts by email; best-effort lookup.
    try {
        const studentEmails = [
            ...new Set(
                enrollments
                    .map((e) => e.studentId?.email)
                    .filter((email) => email && typeof email === "string")
            ),
        ];
        if (studentEmails.length > 0) {
            const users = await User.find({ email: { $in: studentEmails } })
                .select("email lastLoginAt")
                .lean();
            const lastLoginByEmail = new Map(
                users.map((u) => [u.email, u.lastLoginAt || null])
            );
            for (const enrollment of enrollments) {
                const email = enrollment.studentId?.email;
                if (email && lastLoginByEmail.has(email)) {
                    enrollment.lastLoginAt = lastLoginByEmail.get(email);
                } else {
                    enrollment.lastLoginAt = null;
                }
            }
        }
    } catch (lastLoginError) {
        logger.error({ err: lastLoginError }, "Error attaching lastLoginAt to enrollments");
    }

    return enrollments;
};

/**
 * Remove a single dropped enrollment from the exam list: delete its
 * ExamAttendance rows and rebuild the student's slutprov calendar so only the
 * still-active enrollments remain. This mirrors the "ta bort från
 * slutprovslistan" requirement for course-level avbrott.
 */
const removeDroppedEnrollmentFromExamList = async (enrollment) => {
    try {
        const { default: ExamAttendance } = await import("../models/ExamAttendance.js");

        const query = {
            studentId: enrollment.studentId,
            ...(enrollment.mainCourseId ? { courseId: enrollment.mainCourseId } : {}),
        };

        if (enrollment.slutprovDate) {
            const d = new Date(enrollment.slutprovDate);
            if (!isNaN(d.getTime())) {
                query.examDate = {
                    $gte: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)),
                    $lte: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)),
                };
            }
        }

        await ExamAttendance.deleteMany(query);
    } catch (err) {
        logger.error(
            { err, enrollmentId: enrollment._id },
            "Error removing dropped enrollment from exam list (non-fatal)"
        );
    }
};

/**
 * Rebuild the student's slutprov calendar from scratch using their active
 * enrollments. Used after a course-level status change so dropped courses no
 * longer appear on the exam calendar but the remaining ones still do.
 */
const rebuildStudentExamCalendar = async (studentId) => {
    try {
        const { default: CalendarEvent } = await import("../models/Event.js");
        const { syncCalendarEventFromEnrollment } = await import("../utils/calendarEventSync.js");

        await CalendarEvent.updateMany(
            {
                "extendedProps.type": "slutprov",
                "extendedProps.students._id": studentId,
            },
            { $pull: { "extendedProps.students": { _id: studentId } } }
        );

        await CalendarEvent.deleteMany({
            "extendedProps.type": "slutprov",
            $or: [
                { "extendedProps.students": { $size: 0 } },
                { "extendedProps.students": { $exists: false } },
                { "extendedProps.students": null },
            ],
        });

        const activeEnrollments = await StudentEnrollment.find({
            studentId,
            status: { $nin: ["dropped", "completed"] },
            slutprovDate: { $ne: null },
        }).select("_id");

        for (const active of activeEnrollments) {
            await syncCalendarEventFromEnrollment(active._id);
        }
    } catch (err) {
        logger.error({ err, studentId }, "Error rebuilding student exam calendar (non-fatal)");
    }
};

/**
 * Keep the student-level avbrott state in sync with their enrollments.
 *
 * - When the last active enrollment is dropped, run the full dropout cascade
 *   (student flag, exam/APL removal, teacher notification, inactive list).
 * - When no dropped enrollments remain, clear a previously set dropout flag
 *   (reinstate) and resolve dropout notifications.
 */
const syncStudentDropoutState = async ({ studentId, userId, role, reason }) => {
    const [activeCount, droppedCount] = await Promise.all([
        StudentEnrollment.countDocuments({
            studentId,
            status: { $nin: ["dropped", "completed"] },
        }),
        StudentEnrollment.countDocuments({ studentId, status: "dropped" }),
    ]);

    if (activeCount === 0 && droppedCount > 0) {
        const { performStudentDropout } = await import("./dropoutService.js");
        await performStudentDropout({ studentId, userId, role, reason });
        return "dropout";
    }

    if (droppedCount === 0) {
        const student = await Student.findById(studentId).select("dropout");
        if (student?.dropout) {
            const { removeStudentDropoutRecord } = await import("./dropoutService.js");
            await removeStudentDropoutRecord({ studentId, userId, role });
            return "reactivated";
        }
    }

    return null;
};

/**
 * Update an enrollment's status, refresh course instance stats, and return the
 * reloaded enrollment. Throws AppError(404) when the enrollment is missing and
 * AppError(400) for unknown statuses (with the valid statuses attached).
 */
export const updateEnrollmentStatus = async ({ enrollmentId, status, reason, notes, userId, role, roles = [] }) => {
    const enrollment = await StudentEnrollment.findById(enrollmentId);
    if (!enrollment) {
        throw new AppError("Enrollment not found", 404);
    }

    if (!VALID_ENROLLMENT_STATUSES.includes(status)) {
        const error = new AppError("Invalid status", 400);
        error.validStatuses = VALID_ENROLLMENT_STATUSES;
        throw error;
    }

    // "completed" (Betygsatt) must come from the grading flow, and a locked
    // grade freezes the enrollment; only admins may override either rule.
    const callerRoles = new Set([role, ...(Array.isArray(roles) ? roles : [])].filter(Boolean));
    const isAdminCaller = callerRoles.has("admin") || callerRoles.has("systemadmin");
    if (!isAdminCaller) {
        if (enrollment.isGradeLocked) {
            throw new AppError("Betyget är låst – statusen kan inte ändras", 403);
        }
        if (status === "completed" && enrollment.status !== "completed") {
            throw new AppError("Status Betygsatt sätts via betygssättningen, inte direkt", 403);
        }
    }

    await enrollment.changeStatus(status, reason, notes, userId);

    // Course-level avbrott: remove the course from the exam list and refresh
    // the student's exam calendar.
    if (status === "dropped") {
        await removeDroppedEnrollmentFromExamList(enrollment);
    }

    // Promote/demote the student-level dropout state. Non-fatal: a cascade
    // failure must not roll back the status change the user asked for.
    try {
        await syncStudentDropoutState({
            studentId: enrollment.studentId,
            userId,
            role,
            reason,
        });
    } catch (dropoutError) {
        logger.error(
            { err: dropoutError, enrollmentId, status },
            "Error syncing student dropout state after status change (non-fatal)"
        );
    }

    if (status === "dropped") {
        await rebuildStudentExamCalendar(enrollment.studentId);
    }

    // Update course instance statistics (wrap in try-catch to not fail if this errors)
    try {
        await CourseMatchingService.updateCourseInstanceStats(
            enrollment.courseInstanceId
        );
    } catch (statsError) {
        logger.error({ err: statsError }, "Error updating course instance stats (non-fatal)");
    }

    // Reload enrollment to get updated data
    return StudentEnrollment.findById(enrollmentId)
        .populate("teacherId", "name email")
        .populate("mainCourseId", "courseName courseCode");
};

/**
 * Update an enrollment's start/end dates. Throws AppError(404) when the
 * enrollment is missing.
 */
export const updateEnrollmentDates = async ({ enrollmentId, startDate, endDate }) => {
    const enrollment = await StudentEnrollment.findById(enrollmentId);
    if (!enrollment) {
        throw new AppError("Enrollment not found", 404);
    }

    if (startDate !== undefined) {
        enrollment.startDate = new Date(startDate);
    }
    if (endDate !== undefined) {
        enrollment.endDate = new Date(endDate);
    }

    await enrollment.save();

    return enrollment;
};

/**
 * Delete a student enrollment and shift subsequent course dates up.
 * Throws AppError(404) when the student or the enrollment is missing.
 */
export const deleteEnrollmentAndShift = async ({ studentId, enrollmentId, userId }) => {
    const student = await Student.findById(studentId).select("teacherId name");
    if (!student) {
        throw new AppError("Student not found", 404);
    }

    const enrollments = await StudentEnrollment.find({
        studentId,
        mainCourseId: { $exists: true, $ne: null },
    }).sort({ startDate: 1, createdAt: 1 });

    const targetIndex = enrollments.findIndex(
        (enrollment) => String(enrollment._id) === String(enrollmentId)
    );
    if (targetIndex === -1) {
        throw new AppError("Enrollment not found for student", 404);
    }

    const dateSlots = enrollments.map((enrollment) => ({
        startDate: enrollment.startDate ? new Date(enrollment.startDate) : null,
        endDate: enrollment.endDate ? new Date(enrollment.endDate) : null,
    }));

    const targetEnrollment = enrollments[targetIndex];
    await StudentEnrollment.findByIdAndDelete(targetEnrollment._id);

    if (targetEnrollment.courseInstanceId) {
        const remainingForInstance = await StudentEnrollment.countDocuments({
            courseInstanceId: targetEnrollment.courseInstanceId,
        });
        if (remainingForInstance === 0) {
            await CourseInstance.findByIdAndDelete(targetEnrollment.courseInstanceId);
        }
    }

    const remainingEnrollments = enrollments.filter(
        (enrollment) => String(enrollment._id) !== String(enrollmentId)
    );

    const updatedEnrollments = [];
    for (let i = 0; i < remainingEnrollments.length; i += 1) {
        const enrollment = remainingEnrollments[i];
        const slot = dateSlots[i];
        if (!slot?.startDate || !slot?.endDate) continue;

        const sameDates =
            enrollment.startDate &&
            enrollment.endDate &&
            new Date(enrollment.startDate).getTime() === slot.startDate.getTime() &&
            new Date(enrollment.endDate).getTime() === slot.endDate.getTime();

        if (sameDates) continue;

        const { instance } = await CourseMatchingService.findOrCreateCourseInstance(
            enrollment.mainCourseId,
            slot.startDate,
            slot.endDate,
            userId,
            student.teacherId || enrollment.teacherId || null
        );

        const previousInstanceId = enrollment.courseInstanceId;
        enrollment.startDate = slot.startDate;
        enrollment.endDate = slot.endDate;
        if (instance?._id) {
            enrollment.courseInstanceId = instance._id;
        }
        if (!enrollment.teacherId && student.teacherId) {
            enrollment.teacherId = student.teacherId;
        }

        await enrollment.save();
        updatedEnrollments.push(enrollment);

        if (
            previousInstanceId &&
            String(previousInstanceId) !== String(enrollment.courseInstanceId)
        ) {
            const remainingForPrevious = await StudentEnrollment.countDocuments({
                courseInstanceId: previousInstanceId,
            });
            if (remainingForPrevious === 0) {
                await CourseInstance.findByIdAndDelete(previousInstanceId);
            }
        }
    }

    return {
        deletedEnrollmentId: enrollmentId,
        updatedEnrollmentsCount: updatedEnrollments.length,
    };
};

/**
 * Map the study-plan tempo (weeks) used by the UI to a pace percentage.
 * 5 weeks = 100%, 10 weeks = 50%, 20 weeks = 25%.
 */
export const tempoWeeksToPace = (tempoWeeks) => {
    const weeks = Number(tempoWeeks);
    if (weeks === 5) return 100;
    if (weeks === 10) return 50;
    if (weeks === 20) return 25;
    return null;
};

/** Map a pace percentage to the tempo weeks understood by the UI. */
export const paceToTempoWeeks = (pace) => {
    const value = Number(pace);
    if (value === 100) return 5;
    if (value === 50) return 10;
    if (value === 25) return 20;
    return null;
};

const addWeeks = (date, weeks) => {
    const result = new Date(date);
    result.setDate(result.getDate() + Number(weeks) * 7);
    return result;
};

const STUDYPLAN_FIELD_LABELS = {
    pace: "Studietakt",
    startDate: "Startdatum",
    endDate: "Slutdatum",
    slutprovDate: "Slutprovsdatum",
    finalExamDate: "Slutprovsdatum",
};

const formatDay = (value) => {
    if (!value) return "–";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "–" : d.toISOString().slice(0, 10);
};

const sameValue = (a, b) =>
    (a instanceof Date || b instanceof Date || typeof a === "string" || typeof b === "string")
        ? formatDay(a) === formatDay(b)
        : a === b;

/**
 * Create one `studyplan_changed` notification for a pace change, listing the
 * fields that actually changed (the old hook produced "Fält ändrade: .").
 * Exported for tests.
 */
export async function notifyStudyplanTempoChanged({ student, userId, previous, next, enrollments = [] }) {
    const { default: Notification } = await import("../models/Notification.js");

    const changedFields = [];
    const previousValues = {};
    const newValues = {};
    const record = (key, from, to) => {
        if (from === undefined && to === undefined) return;
        const equal = key === "pace" ? Number(from) === Number(to) : sameValue(from, to);
        if (equal) return;
        changedFields.push(key);
        previousValues[key] = from ?? null;
        newValues[key] = to ?? null;
    };
    record("pace", previous.pace, next.pace);
    record("endDate", previous.endDate, next.endDate);
    record("finalExamDate", previous.finalExamDate, next.finalExamDate);
    // Course-level changes also count (e.g. same end date but a moved start).
    for (const e of enrollments) {
        for (const key of ["startDate", "endDate", "slutprovDate"]) {
            if (sameValue(e.previous[key], e.next[key]) || changedFields.includes(key)) continue;
            // Student-level finalExamDate already covers the slutprov label.
            if (key === "slutprovDate" && changedFields.includes("finalExamDate")) continue;
            changedFields.push(key);
        }
    }
    if (changedFields.length === 0) return null;

    const labels = [...new Set(changedFields.map((k) => STUDYPLAN_FIELD_LABELS[k] || k))];
    const details = [
        `studietakt ${previous.pace ?? "–"}% → ${next.pace}%`,
        `slutdatum ${formatDay(previous.endDate)} → ${formatDay(next.endDate)}`,
        `slutprov ${formatDay(previous.finalExamDate)} → ${formatDay(next.finalExamDate)}`,
    ].join(", ");
    const message = `Studieplan uppdaterad för ${student.name}: ${details}. Fält ändrade: ${labels.join(", ")}.`;

    let studentUserId = null;
    if (student.email) {
        const studentUser = await User.findOne({ email: student.email }).select("_id");
        studentUserId = studentUser?._id || null;
    }

    return Notification.create({
        type: "studyplan_changed",
        message,
        teacher: student.teacherId || null,
        studentId: student._id,
        meta: {
            studentId: student._id,
            studentName: student.name,
            studentUserId,
            changeType: "pace_changed",
            changedBy: userId || null,
            details: { changedFields, previousValues, newValues, enrollments },
        },
        resolved: false,
    });
}

/**
 * Change a student's study pace and reschedule the study plan.
 *
 * A pace change affects the duration of every non-completed course:
 * duration = course extent in weeks x (100 / pace). The first course keeps
 * its start date, later courses are chained after the previous one, and the
 * student's end date / final exam date are moved with the plan.
 *
 * Throws AppError(400) for unsupported pace/tempo values and AppError(404)
 * when the student is missing.
 */
export const updateStudyplanTempo = async ({
    studentId,
    tempoWeeks,
    pace,
    userId,
    includeActive = false,
}) => {
    const requestedPace =
        pace !== undefined && pace !== null
            ? Number(pace)
            : tempoWeeksToPace(tempoWeeks);

    if (![25, 50, 100].includes(requestedPace)) {
        throw new AppError("Invalid pace or tempoWeeks", 400);
    }

    const student = await Student.findById(studentId).select(
        "teacherId name pace email endDate finalExamDate"
    );
    if (!student) {
        throw new AppError("Student not found", 404);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enrollments = await StudentEnrollment.find({
        studentId,
        mainCourseId: { $exists: true, $ne: null },
    }).sort({ startDate: 1, createdAt: 1 });

    const targetEnrollments = enrollments.filter((enrollment) => {
        if (!enrollment.startDate) return false;
        if (["completed", "dropped"].includes(enrollment.status)) return false;
        if (includeActive) return true;
        return new Date(enrollment.startDate).getTime() > today.getTime();
    });

    if (targetEnrollments.length === 0) {
        // Still record the chosen pace so the student profile reflects it.
        if (student && String(student.pace) !== String(requestedPace)) {
            student.pace = requestedPace;
            if (typeof student.save === "function") await student.save();
        }
        return { updatedCount: 0, pace: requestedPace };
    }

    const previousPace = student.pace ?? null;
    const previousEndDate = student.endDate || null;
    const previousFinalExamDate = student.finalExamDate || null;
    const changedEnrollments = [];

    const paceFactor = 100 / requestedPace;
    let nextStartDate = new Date(targetEnrollments[0].startDate);
    let updatedCount = 0;
    let lastSlutprovDate = null;
    let lastEndDate = null;

    for (const enrollment of targetEnrollments) {
        const startDate = new Date(nextStartDate);

        // Duration is based on the course's own extent so a 2.5-week course
        // at 50% becomes 5 weeks, not an arbitrary fixed length.
        let extentWeeks = 5;
        try {
            const course = await Course.findById(enrollment.mainCourseId);
            const parsedExtent = parseFloat(course?.courseExtent);
            if (Number.isFinite(parsedExtent) && parsedExtent > 0) {
                extentWeeks = parsedExtent;
            }
        } catch (courseError) {
            logger.warn(
                { err: courseError, courseId: enrollment.mainCourseId },
                "Could not load course extent, using 5 weeks"
            );
        }

        const endDate = addWeeks(startDate, extentWeeks * paceFactor);

        const { instance } =
            await CourseMatchingService.findOrCreateCourseInstance(
                enrollment.mainCourseId,
                startDate,
                endDate,
                userId,
                student.teacherId || enrollment.teacherId || null
            );

        const previousInstanceId = enrollment.courseInstanceId;
        const before = {
            startDate: enrollment.startDate,
            endDate: enrollment.endDate,
            slutprovDate: enrollment.slutprovDate,
        };

        // Update in place so grades, assessment results, certificates and
        // history are preserved. Recreating the enrollment used to wipe them.
        enrollment.courseInstanceId = instance._id;
        enrollment.startDate = startDate;
        enrollment.endDate = endDate;
        enrollment.slutprovDate =
            instance.slutprovDate || enrollment.slutprovDate || null;
        enrollment.pace = requestedPace;
        enrollment.statusHistory = [
            ...(enrollment.statusHistory || []),
            {
                status: enrollment.status || "enrolled",
                changedAt: new Date(),
                changedBy: userId || undefined,
                reason: `Studietakt ändrad till ${requestedPace}%`,
            },
        ];

        // One summary notification is sent for the whole pace change below,
        // instead of one per enrollment from the post-save hook.
        enrollment.skipNotification = true;
        if (typeof enrollment.save === "function") {
            await enrollment.save();
        }
        changedEnrollments.push({
            enrollmentId: enrollment._id,
            courseId: enrollment.mainCourseId,
            previous: before,
            next: { startDate, endDate, slutprovDate: enrollment.slutprovDate },
        });

        if (instance.slutprovDate) {
            lastSlutprovDate = instance.slutprovDate;
        }
        lastEndDate = endDate;

        if (
            previousInstanceId &&
            String(previousInstanceId) !== String(instance._id)
        ) {
            const remainingForPrevious =
                await StudentEnrollment.countDocuments({
                    courseInstanceId: previousInstanceId,
                });
            if (remainingForPrevious === 0) {
                await CourseInstance.findByIdAndDelete(previousInstanceId);
            }
        }

        updatedCount += 1;
        nextStartDate = new Date(endDate);
    }

    const studentToUpdate = await Student.findById(studentId);
    if (studentToUpdate) {
        studentToUpdate.pace = requestedPace;
        if (lastEndDate) {
            studentToUpdate.endDate = lastEndDate;
        }
        if (lastSlutprovDate) {
            studentToUpdate.finalExamDate = lastSlutprovDate;
        }

        if (typeof studentToUpdate.save === "function") {
            await studentToUpdate.save();

        }
    }

    // Move the student on the slutprov calendar: drop them from the old
    // (now stale) slutprov dates and add them to the new ones (audit E1-11).
    let calendar = null;
    try {
        const { syncStudentSlutprovCalendar } = await import(
            "../utils/calendarEventSync.js"
        );
        calendar = await syncStudentSlutprovCalendar(studentId);
    } catch (syncErr) {
        logger.warn({ err: syncErr }, "Failed to sync student slutprov calendar");
    }

    try {
        await notifyStudyplanTempoChanged({
            student,
            userId,
            previous: {
                pace: previousPace,
                endDate: previousEndDate,
                finalExamDate: previousFinalExamDate,
            },
            next: {
                pace: requestedPace,
                endDate: studentToUpdate?.endDate || lastEndDate,
                finalExamDate: studentToUpdate?.finalExamDate || lastSlutprovDate,
            },
            enrollments: changedEnrollments,
        });
    } catch (notifyErr) {
        logger.warn({ err: notifyErr }, "Failed to create studyplan_changed notification");
    }

    const result = { updatedCount, pace: requestedPace };
    if (calendar) result.calendar = calendar;
    if (studentToUpdate?.finalExamDate) {
        result.finalExamDate = studentToUpdate.finalExamDate;
    }
    if (studentToUpdate?.endDate) {
        result.endDate = studentToUpdate.endDate;
    }
    return result;
};

/**
 * Recalculate a student's plan summary (end date and final exam date) from
 * their active/non-completed enrollments and resync the exam calendar event.
 * Used after imports that apply a study pace so the student header does not
 * keep stale spreadsheet dates.
 */
export const recalculateStudentScheduleSummary = async (studentId) => {
    const enrollments = await StudentEnrollment.find({
        studentId,
        status: { $nin: ["completed", "dropped"] },
        startDate: { $ne: null },
    })
        .select("startDate endDate slutprovDate")
        .lean();

    if (!enrollments.length) {
        return null;
    }

    let endDate = null;
    let finalExamDate = null;
    for (const enrollment of enrollments) {
        const enrollmentEnd = enrollment.endDate
            ? new Date(enrollment.endDate)
            : null;
        if (enrollmentEnd && (!endDate || enrollmentEnd > endDate)) {
            endDate = enrollmentEnd;
        }
        const exam = enrollment.slutprovDate
            ? new Date(enrollment.slutprovDate)
            : null;
        if (exam && (!finalExamDate || exam > finalExamDate)) {
            finalExamDate = exam;
        }
    }

    const student = await Student.findById(studentId);
    if (!student) {
        return null;
    }

    if (endDate) student.endDate = endDate;
    if (finalExamDate) student.finalExamDate = finalExamDate;

    if (typeof student.save === "function") {
        await student.save();
    }

    try {
        const { syncCalendarEventsForStudent } = await import(
            "../utils/calendarEventSync.js"
        );
        await syncCalendarEventsForStudent(student._id);
    } catch (syncErr) {
        logger.warn(
            { err: syncErr, studentId },
            "Failed to sync student calendar event"
        );
    }

    return { endDate, finalExamDate };
};

/**
 * Add students to a course instance, skipping students that are already
 * enrolled. Per-student failures are collected and reported without aborting
 * the batch. Throws AppError(400) for a missing/invalid studentIds array and
 * AppError(404) when the instance or its main course is missing.
 */
export const addStudentsToInstance = async ({ instanceId, studentIds }) => {
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        throw new AppError("Student IDs array is required", 400);
    }

    const instance = await CourseInstance.findById(instanceId);
    if (!instance) {
        throw new AppError("Course instance not found", 404);
    }

    const mainCourse = await Course.findById(instance.mainCourseId);
    if (!mainCourse) {
        throw new AppError("Main course not found", 404);
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
                logger.debug({ studentId, instanceId }, "Enrollment already exists, skipping");
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
                enrollmentPrice: mainCourse.price ?? null,
                startDate: instance.startDate,
                endDate: instance.endDate,
                status: "enrolled",
                teacherId: student.teacherId || instance.responsibleTeacher || null,
                // Copy slutprovDate from course instance if it exists
                slutprovDate: instance.slutprovDate || null,
            });

            await enrollment.save();
            enrollments.push(enrollment);

            logger.info({ studentName: student.name, courseName: instance.courseName }, "Created enrollment for student in course instance");

            // Sync calendar event if enrollment has a slutprovDate
            if (enrollment.slutprovDate) {
                try {
                    const { syncCalendarEventFromEnrollment } = await import("../utils/calendarEventSync.js");
                    await syncCalendarEventFromEnrollment(enrollment._id);
                } catch (calendarError) {
                    logger.error({ err: calendarError, enrollmentId: enrollment._id }, "Error syncing calendar event for enrollment");
                    // Don't fail the enrollment creation if calendar sync fails
                }
            }
        } catch (error) {
            logger.error({ err: error, studentId }, "Error creating enrollment for student");
            errors.push(`Failed to enroll student ${studentId}: ${error.message}`);
        }
    }

    return { enrollments, errors };
};
