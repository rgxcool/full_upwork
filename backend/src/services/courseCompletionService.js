import logger from "../utils/logger.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import CoursePackage from "../models/CoursePackage.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import User from "../models/User.js";
import CompletionEvent from "../models/CompletionEvent.js";

// Enrollment statuses that mean "the student withdrew / did not finish".
export const WITHDRAWN_STATUSES = ["dropped", "inactive", "suspended"];

/**
 * Extract the municipality name from a Student record, which may store it as
 * either a plain string or the schema subdocument { type: "Sollentuna" }.
 * @param {import("mongoose").Types.ObjectId|Object} studentIdOrDoc
 * @returns {Promise<{municipality: string, aplStatus: string, priorAplCompleted: boolean}>}
 */
export const getStudentCompletionContext = async (studentIdOrDoc) => {
    const student =
        typeof studentIdOrDoc === "object" && studentIdOrDoc?.name
            ? studentIdOrDoc
            : await Student.findById(studentIdOrDoc)
                  .select(
                      "name municipality aplStatus priorAplCompleted email"
                  )
                  .lean();

    const raw = student?.municipality;
    const municipality =
        typeof raw === "string" ? raw : raw?.type || "";
    const aplStatus = student?.aplStatus || "GRAY";
    const priorAplCompleted = !!student?.priorAplCompleted;
    return { student, municipality, aplStatus, priorAplCompleted };
};

/**
 * A Module is a "required assignment" for completion purposes when the course
 * card actually defined an assignment for it. Modules without an assignment
 * contribute nothing to the completion requirements (mirrors how course-card
 * progress is computed).
 * @param {Object} module
 * @returns {boolean}
 */
const hasRequiredAssignment = (module) =>
    !!(module?.assignment && (module.assignment.title || module.assignment.description));

/**
 * True when the student's submission for this module was accepted by the
 * teacher (feedback.status === "godkänd" or revisionDecision === "godkänd").
 * @param {Object} submission
 * @returns {boolean}
 */
const isSubmissionAccepted = (submission) =>
    !!submission &&
    (submission.feedback?.status === "godkänd" ||
     submission.revisionDecision === "godkänd");

/**
 * Determine whether a single course instance is completed for a student.
 *
 * Completion is derived from the ACTUAL course requirements — the enrollment
 * being explicitly completed, a non-failing grade having been set/approved by a
 * teacher, and every assignment-carrying module having an accepted submission.
 * The course/instance end date is deliberately NOT used: a course is never
 * marked completed merely because its end date has passed.
 *
 * @param {string} studentId
 * @param {string} courseInstanceId
 * @param {{ requireGrade?: boolean, requireAssignments?: boolean }} [opts]
 * @returns {Promise<{
 *   completed: boolean,
 *   reasons: string[],
 *   completionDate: Date|null,
 *   enrollment: Object,
 *   missingModules: number[],
 *   hasGrade: boolean,
 *   grade: string|null,
 * }>}
 */
export async function checkCourseCompletion(studentId, courseInstanceId, opts = {}) {
    const { requireGrade = true, requireAssignments = true } = opts;
    const reasons = [];
    let completionDate = null;
    let enrollment = null;
    let missingModules = [];

    try {
        enrollment = await StudentEnrollment.findOne({
            studentId,
            courseInstanceId,
        }).lean();
    } catch (err) {
        logger.error({ err, studentId, courseInstanceId }, "Course completion lookup failed");
        return { completed: false, reasons: ["lookup_error"], completionDate, enrollment: null, missingModules, hasGrade: false, grade: null };
    }

    if (!enrollment) {
        return {
            completed: false,
            reasons: ["enrollment_not_found"],
            completionDate,
            enrollment: null,
            missingModules,
            hasGrade: false,
            grade: null,
        };
    }

    const grade = enrollment.grade || null;
    const hasGrade = typeof grade === "string" && grade.trim() !== "";

    if (enrollment.status === "completed") {
        completionDate = enrollment.completedAt || enrollment.updatedAt || new Date();
    }

    if (WITHDRAWN_STATUSES.includes(enrollment.status)) {
        reasons.push(`course_withdrawn (${enrollment.status})`);
    }

    if (enrollment.status !== "completed") {
        reasons.push(`enrollment_not_completed (${enrollment.status})`);
    }

    if (requireGrade) {
        if (!hasGrade) {
            reasons.push("grade_missing");
        } else if (grade.toUpperCase() === "F") {
            reasons.push("grade_failed");
        }
    }

    const instance = await CourseInstance.findById(courseInstanceId).lean().catch(() => null);
    if (!instance) {
        reasons.push("course_instance_not_found");
    }

    if (requireAssignments && instance) {
        const assignmentModules = (instance.modules || []).filter(hasRequiredAssignment).map((m) => m.moduleNumber);
        if (assignmentModules.length > 0) {
            const submissions = await AssignmentSubmission.find({
                studentId,
                enrollmentId: enrollment._id,
                moduleNumber: { $in: assignmentModules },
            })
                .select("moduleNumber feedback revisionDecision")
                .lean();
            const accepted = new Set(
                submissions.filter(isSubmissionAccepted).map((s) => s.moduleNumber)
            );
            missingModules = assignmentModules.filter((n) => !accepted.has(n));
            if (missingModules.length > 0) {
                reasons.push(`assignment_missing (modules ${missingModules.join(",")})`);
            }
        }
    }

    return {
        completed: reasons.length === 0,
        reasons,
        completionDate,
        enrollment,
        missingModules,
        hasGrade,
        grade,
    };
}

/**
 * Verify that a course package is fully completed for a student.
 *
 * A package is complete only when:
 *   - the student has at least one enrollment tied to the package
 *   - every course in the package has a completed, graded enrollment
 *   - every package enrollment has a non-failing grade (approved by a teacher)
 *   - no package course is withdrawn (dropped/inactive/suspended)
 *   - APL is approved where applicable (status GREEN or prior APL completed)
 *
 * @param {string} studentId
 * @param {string} coursePackageId
 * @param {{ requireApl?: boolean }} [opts]
 * @returns {Promise<{
 *   completed: boolean,
 *   reasons: string[],
 *   packageName: string,
 *   packageCourses: Array<string>,
 *   completedCourses: Array<string>,
 *   missingCourses: Array<string>,
 *   withdrawnCourses: Array<string>,
 *   aplApproved: boolean,
 *   completionDate: Date|null,
 *   enrollment: Object|null,
 * }>}
 */
export async function checkPackageCompletion(studentId, coursePackageId, opts = {}) {
    const { requireApl = true } = opts;
    const reasons = [];

    const pkg = await CoursePackage.findById(coursePackageId).lean().catch(() => null);
    if (!pkg) {
        return {
            completed: false,
            reasons: ["package_not_found"],
            packageName: "",
            packageCourses: [],
            completedCourses: [],
            missingCourses: [],
            withdrawnCourses: [],
            aplApproved: false,
            completionDate: null,
            enrollment: null,
        };
    }

    const packageCourses = (pkg.coursePackageCourses || [])
        .map((c) => (c?._id || c)?.toString())
        .filter(Boolean);

    if (packageCourses.length === 0) {
        return {
            completed: false,
            reasons: ["package_has_no_courses"],
            packageName: pkg.coursePackageName || "",
            packageCourses: [],
            completedCourses: [],
            missingCourses: [],
            withdrawnCourses: [],
            aplApproved: false,
            completionDate: null,
            enrollment: null,
        };
    }

    const enrollments = await StudentEnrollment.find({
        studentId,
        coursePackageId,
    })
        .select("mainCourseId status grade completedAt teacherId courseInstanceId")
        .lean();

    if (enrollments.length === 0) {
        return {
            completed: false,
            reasons: ["package_enrollment_not_found"],
            packageName: pkg.coursePackageName || "",
            packageCourses,
            completedCourses: [],
            missingCourses: packageCourses,
            withdrawnCourses: [],
            aplApproved: false,
            completionDate: null,
            enrollment: null,
        };
    }

    // Map each package course to its enrollment status/grade.
    const byCourseId = new Map();
    for (const e of enrollments) {
        const cid = e.mainCourseId?.toString();
        if (!cid) continue;
        const existing = byCourseId.get(cid);
        const eDate = e.completedAt || e.updatedAt || null;
        if (!existing || (e.status === "completed" && existing.status !== "completed")) {
            byCourseId.set(cid, { ...e, courseId: cid });
        }
        void eDate;
    }

    const completedCourses = [];
    const withdrawnCourses = [];
    let completionDate = null;

    for (const enrollment of enrollments) {
        if (WITHDRAWN_STATUSES.includes(enrollment.status)) {
            const courseId = enrollment.mainCourseId?.toString() || "";
            if (courseId && !withdrawnCourses.includes(courseId)) {
                withdrawnCourses.push(courseId);
            }
            reasons.push(`course_withdrawn (${enrollment.status})`);
        }
    }

    for (const courseId of packageCourses) {
        const entry = byCourseId.get(courseId);
        const isComplete = !!entry && entry.status === "completed";
        const grade = entry?.grade || null;
        const hasGrade = typeof grade === "string" && grade.trim() !== "";
        const passed = hasGrade && grade.toUpperCase() !== "F";

        if (isComplete && passed) {
            completedCourses.push(courseId);
            if (!completionDate && entry.completedAt) completionDate = entry.completedAt;
        }
    }

    const missingCourses = packageCourses.filter((c) => !completedCourses.includes(c));

    if (missingCourses.length > 0) {
        const missingNames = missingCourses.join(",");
        reasons.push(`not_all_courses_completed (missing: ${missingNames})`);
    }

    const hasWithdrawn = withdrawnCourses.length > 0;
    if (hasWithdrawn) {
        reasons.push(`withdrawn_course_present (${withdrawnCourses.join(",")})`);
    }

    // APL: approved where applicable. A student with prior APL completed (via
    // another school) does not need a new GREEN status.
    const { aplStatus, priorAplCompleted } = await getStudentCompletionContext(studentId);
    const aplApproved = aplStatus === "GREEN" || priorAplCompleted;
    if (requireApl && !aplApproved) {
        reasons.push(`apl_not_approved (${aplStatus})`);
    }

    // Primary enrollment reported for the event = best completed enrollment.
    const primaryEnrollment =
        enrollments.find((e) => e.status === "completed") || enrollments[0] || null;

    return {
        completed: reasons.length === 0,
        reasons,
        packageName: pkg.coursePackageName || "",
        packageCourses,
        completedCourses,
        missingCourses,
        withdrawnCourses,
        aplApproved,
        completionDate,
        enrollment: primaryEnrollment,
    };
}

/**
 * Resolve the responsible teacher for an enrollment, with sensible fallbacks:
 * enrollment.teacherId → course instance responsibleTeacher.
 *
 * @param {Object} enrollment
 * @param {string} [courseInstanceId]
 * @returns {Promise<{ teacherId: string|null, teacherName: string, teacherEmail: string|null, teacherUserId: string|null }>}
 */
export async function getResponsibleTeacher(enrollment, courseInstanceId) {
    try {
        let teacherId = enrollment?.teacherId || null;
        if (!teacherId && (enrollment?.courseInstanceId || courseInstanceId)) {
            const instance = await CourseInstance.findById(
                enrollment.courseInstanceId || courseInstanceId
            )
                .select("responsibleTeacher")
                .lean();
            teacherId = instance?.responsibleTeacher || null;
        }
        if (!teacherId) {
            return { teacherId: null, teacherName: "", teacherEmail: null, teacherUserId: null };
        }

        // teacherId is the teacher's User id (#102): teacherId === teacherUserId.
        const user = await User.findById(teacherId).select("name username email").lean().catch(() => null);
        if (!user) {
            return { teacherId: String(teacherId), teacherName: "", teacherEmail: null, teacherUserId: null };
        }
        return {
            teacherId: String(user._id),
            teacherName: user.name || user.username || "",
            teacherEmail: user.email || null,
            teacherUserId: String(user._id),
        };
    } catch (err) {
        logger.error({ err, enrollmentId: enrollment?._id }, "Responsible teacher lookup failed");
        return { teacherId: null, teacherName: "", teacherEmail: null, teacherUserId: null };
    }
}

/**
 * Idempotently record a completion event. The unique `idempotencyKey` makes the
 * record durable and prevents any duplicate completion event — and therefore
 * any duplicate notification — no matter how often the scan runs.
 *
 * @param {{
 *   idempotencyKey: string,
 *   studentId: string,
 *   studentName?: string,
 *   completionType: "course"|"course_package",
 *   courseInstanceId?: string,
 *   courseId?: string,
 *   courseName?: string,
 *   coursePackageId?: string,
 *   packageName?: string,
 *   completionDate?: Date,
 *   teacherId?: string,
 *   teacherName?: string,
 *   municipality?: string,
 *   enrollmentIds?: string[],
 * }} data
 * @returns {Promise<{ event: Object, created: boolean }>}
 */
export async function createCompletionEvent(data) {
    const payload = {
        idempotencyKey: data.idempotencyKey,
        studentId: data.studentId,
        studentName: data.studentName || "",
        completionType: data.completionType,
        courseInstanceId: data.courseInstanceId || null,
        courseId: data.courseId || null,
        courseName: data.courseName || "",
        coursePackageId: data.coursePackageId || null,
        packageName: data.packageName || "",
        completionDate: data.completionDate || new Date(),
        teacherId: data.teacherId || null,
        teacherName: data.teacherName || "",
        municipality: data.municipality || "",
        enrollmentIds: data.enrollmentIds || [],
    };

    try {
        const created = await CompletionEvent.create(payload);
        return { event: created, created: true };
    } catch (err) {
        // Unique index on idempotencyKey — a second scan for the same student+
        // scope is a duplicate-key error. That IS the idempotency barrier.
        if (err?.code === 11000) {
            const event = await CompletionEvent.findOne({
                idempotencyKey: data.idempotencyKey,
            }).lean();
            return { event, created: false };
        }
        logger.error({ err, key: data.idempotencyKey }, "Completion event insert failed");
        return { event: null, created: false };
    }
}

/**
 * Find an existing completion event (if any) for a given idempotency key.
 * @param {string} idempotencyKey
 * @returns {Promise<Object|null>}
 */
export async function findCompletionEvent(idempotencyKey) {
    return CompletionEvent.findOne({ idempotencyKey }).lean();
}

/**
 * Build the stable idempotency key for a course-level completion.
 * @param {string} studentId
 * @param {string} courseInstanceId
 * @returns {string}
 */
export const courseCompletionKey = (studentId, courseInstanceId) =>
    `course:${String(studentId)}:${String(courseInstanceId)}`;

/**
 * Build the stable idempotency key for a package-level completion.
 * @param {string} studentId
 * @param {string} coursePackageId
 * @returns {string}
 */
export const packageCompletionKey = (studentId, coursePackageId) =>
    `package:${String(studentId)}:${String(coursePackageId)}`;

/**
 * Normalize an id to a string (used in event meta).
 * @param {*} id
 * @returns {string}
 */
export const normalizeId = (id) => (id ? String(id) : "");