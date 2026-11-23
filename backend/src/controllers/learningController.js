import mongoose from "mongoose";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import CourseInstance from "../models/CourseInstance.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import logger from "../utils/logger.js";
import { buildVisibleModules } from "../utils/courseContentVisibility.js";
import { recordStudentLearningActivity } from "../utils/learningActivity.js";
import { recordResourceVisit } from "../services/resourceVisitService.js";
import {
    calculateActivityStatus,
    calculateBatchActivityStatus,
} from "../services/activityStatusService.js";

const STAFF_ROLES = ["systemadmin", "admin", "tester"];
const SUBMITTABLE_STATUSES = ["enrolled", "active"];
const FEEDBACK_STATUSES = ["godkänd", "komplettera"];

const getUserRoles = (user) => user?.roles || (user?.role ? [user.role] : []);
const isStaffUser = (user) => getUserRoles(user).some((r) => STAFF_ROLES.includes(r));
const isTeacherUser = (user) => getUserRoles(user).includes("teacher");
const isStudentUser = (user) => getUserRoles(user).includes("student");

const getStudentForUser = async (user) => {
    if (!isStudentUser(user)) return null;
    return Student.findOne({ email: user?.email });
};

const getTeacherForUser = async (user) => {
    if (!isTeacherUser(user) && !isStaffUser(user)) return null;
    if (isStaffUser(user)) return null;
    return Teacher.findOne({ userId: user?.userId });
};

const teacherOwnsInstance = (teacher, instance) => {
    if (!teacher || !instance) return false;
    const own = (id) => id && String(id) === String(teacher._id);
    return own(instance.responsibleTeacher) || own(instance.assistantTeacher);
};

// Return the most recent of named activity timestamps as { type, at }, or null.
const pickMostRecent = (labels, dates) => {
    let best = null;
    let bestTime = -Infinity;
    for (let i = 0; i < labels.length; i++) {
        const d = dates[i];
        if (d) {
            const t = new Date(d).getTime();
            if (t > bestTime) {
                bestTime = t;
                best = { type: labels[i], at: d };
            }
        }
    }
    return best;
};

// A module is "scheduled" when it carries its own start date (set during date
// planning) or when the instance has a section date for its module index.
// Unscheduled modules must not be reported as "Not completed".
const getModuleScheduledDate = (module, instance, modules) => {
    if (module && module.startDate) return new Date(module.startDate);
    const sectionDates = instance?.sectionDates || [];
    const idx = modules.findIndex((m) => m._id ? String(m._id) === String(module._id) : m.moduleNumber === module.moduleNumber);
    const sectionDate = sectionDates[idx];
    return sectionDate ? new Date(sectionDate) : null;
};

// Slice 4 / D9: report rows expose a nested, ordered Avsnitt list with the
// generated planned submission date. Module-level scheduleDate/submissionDate
// stay unchanged; there is no Avsnitt-level actual submission date yet.
const toReportDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
};

const buildReportAvsnitt = (module) => {
    const items = Array.isArray(module?.avsnitt) ? module.avsnitt : [];
    return items
        .map((avsnitt, index) => ({ avsnitt, index }))
        .sort((a, b) => {
            const aOrder = Number(a.avsnitt?.order);
            const bOrder = Number(b.avsnitt?.order);
            const aValid = Number.isFinite(aOrder);
            const bValid = Number.isFinite(bOrder);
            if (aValid && bValid) return aOrder - bOrder || a.index - b.index;
            if (aValid) return -1;
            if (bValid) return 1;
            return a.index - b.index;
        })
        .map(({ avsnitt }) => ({
            avsnittId: avsnitt?.avsnittId ?? null,
            title: avsnitt?.title ?? "",
            order: Number.isFinite(Number(avsnitt?.order)) ? Number(avsnitt.order) : null,
            plannedDate: toReportDateOnly(avsnitt?.plannedDate),
        }));
};

/**
 * GET /learning/instances/:instanceId/modules
 * Lesson content (module sections + instructions) and the optional assignment
 * for each module. A student caller gets their own submissions attached;
 * teachers/staff get the raw modules (submissions live on the submissions routes).
 */
export const getInstanceModules = async (req, res) => {
    try {
        const { instanceId } = req.params;
        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance id" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        const user = req.user;
        const isStudent = isStudentUser(user);
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);

        if (!isStudent && !isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const isSelfViewingStudent = isStudent && !isTeacher && !isStaff;

        const payload = {
            success: true,
            instance: {
                _id: instance._id,
                courseName: instance.courseName,
                courseCode: instance.courseCode,
            },
            modules: isSelfViewingStudent
                ? buildVisibleModules(instance.modules, instance.content, {
                      applyStudentVisibility: true,
                  })
                : instance.modules || [],
        };

        if (isSelfViewingStudent) {
            const student = await getStudentForUser(user);
            if (!student) {
                return res.status(403).json({ error: "Ingen elevprofil hittades för kontot" });
            }
            const enrollment = await StudentEnrollment.findOne({
                studentId: student._id,
                courseInstanceId: instance._id,
                status: { $in: SUBMITTABLE_STATUSES },
            });
            if (!enrollment) {
                return res.status(403).json({ error: "Du är inte inskriven på den här kursen" });
            }

            // Lesson content access is meaningful learning activity for the
            // inactive-student automation (never login alone).
            await recordStudentLearningActivity(student._id).catch(() => {});
            // Durable, deduplicated usage log for the resource-visit report.
            await recordResourceVisit({
                studentId: student._id,
                resourceType: "lesson",
                resourceId: String(instance._id),
                resourceName: instance.courseName || "",
                courseInstanceId: instance._id,
            });

            const submissions = await AssignmentSubmission.find({
                studentId: student._id,
                enrollmentId: enrollment._id,
            });
            const byModule = {};
            for (const submission of submissions) {
                byModule[submission.moduleNumber] = submission.toObject();
            }
            payload.submissions = byModule;
            payload.enrollmentId = enrollment._id;
        } else if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            if (!teacher || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        res.json(payload);
    } catch (error) {
        logger.error({ err: error }, "Error fetching instance modules");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /learning/instances/:instanceId/modules/:moduleNumber/submissions
 * Create or update the student's submission for one module. Resubmitting
 * replaces the previous attempt and clears any existing feedback.
 * Body: { submittedText, fileId, fileName } — at least one of text/file.
 */
export const submitAssignment = async (req, res) => {
    try {
        const { instanceId, moduleNumber } = req.params;
        const moduleNumberInt = Number(moduleNumber);
        const { submittedText, fileId, fileName } = req.body || {};

        if (!mongoose.isValidObjectId(instanceId) || !Number.isInteger(moduleNumberInt)) {
            return res.status(400).json({ error: "Invalid instance id or module number" });
        }

        const user = req.user;
        if (!isStudentUser(user) || isStaffUser(user)) {
            return res.status(403).json({ error: "Only students can submit assignments" });
        }

        const student = await getStudentForUser(user);
        if (!student) {
            return res.status(403).json({ error: "Ingen elevprofil hittades för kontot" });
        }

        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
            courseInstanceId: instanceId,
            status: { $in: SUBMITTABLE_STATUSES },
        });
        if (!enrollment) {
            return res.status(403).json({ error: "Du är inte inskriven på den här kursen" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }
        const module = (instance.modules || []).find((m) => m.moduleNumber === moduleNumberInt);
        if (!module) {
            return res.status(404).json({ error: "Modulen finns inte på kursen" });
        }
        if (!module.assignment?.title && !module.assignment?.description) {
            return res.status(400).json({ error: "Den här modulen har ingen inlämningsuppgift" });
        }

        const text = String(submittedText || "").trim();
        const hasFile = fileId && mongoose.isValidObjectId(fileId);
        if (!text && !hasFile) {
            return res.status(400).json({ error: "Ange en text eller ladda upp en fil" });
        }

        const submission = await AssignmentSubmission.findOneAndUpdate(
            { studentId: student._id, enrollmentId: enrollment._id, moduleNumber: moduleNumberInt },
            {
                $set: {
                    courseInstanceId: instance._id,
                    submittedText: text,
                    fileId: hasFile ? fileId : null,
                    fileName: fileName ? String(fileName) : "",
                    submittedAt: new Date(),
                    // A resubmission invalidates earlier feedback.
                    feedback: { comment: "", status: "", by: null, at: null },
                },
            },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );

        // A resubmission invalidates any prior "godkänd" marking for the module.
        try {
            if (enrollment.completedComponents) {
                enrollment.completedComponents.set(String(moduleNumberInt), "✗");
                enrollment.skipNotification = true;
                await enrollment.save();
            }
        } catch (completedError) {
            logger.warn({ err: completedError, enrollmentId: enrollment._id }, "Error resetting module completion on resubmission");
        }

        // Persist the student's current section position on the instance so
        // CourseInstance.sectionPositions reflects where the student is working
        // (the freshly submitted module). Non-fatal — never blocks the submit.
        try {
            await CourseInstance.updateOne(
                { _id: instance._id },
                { $set: { [`sectionPositions.${String(student._id)}`]: moduleNumberInt } }
            );
        } catch (positionError) {
            logger.warn(
                { err: positionError, instanceId: instance._id, studentId: student._id },
                "Error recording section position"
            );
        }

        logger.info(
            { studentId: student._id, enrollmentId: enrollment._id, moduleNumber: moduleNumberInt },
            "Assignment submitted"
        );
        res.status(201).json({ success: true, submission });
    } catch (error) {
        logger.error({ err: error }, "Error submitting assignment");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /learning/instances/:instanceId/submissions
 * All submissions for one course instance. Teachers must be responsible or
 * assistant teacher of the instance; staff may see any instance.
 */
export const getInstanceSubmissions = async (req, res) => {
    try {
        const { instanceId } = req.params;
        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance id" });
        }

        const user = req.user;
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            if (!teacher || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        const { moduleNumber } = req.query;
        const query = { courseInstanceId: instance._id };
        if (moduleNumber !== undefined && Number.isInteger(Number(moduleNumber))) {
            query.moduleNumber = Number(moduleNumber);
        }

        const submissions = await AssignmentSubmission.find(query)
            .populate("studentId", "name email")
            .populate("feedback.by", "username email")
            .sort({ moduleNumber: 1, submittedAt: 1 });

        res.json({ success: true, submissions });
    } catch (error) {
        logger.error({ err: error }, "Error fetching instance submissions");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * PUT /learning/submissions/:submissionId/feedback
 * Teacher feedback on a submission: a single comment plus a grade-style
 * status ("godkänd" = accepted, "komplettera" = needs revision/resubmission).
 */
export const setSubmissionFeedback = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { comment, status } = req.body || {};

        if (!mongoose.isValidObjectId(submissionId)) {
            return res.status(400).json({ error: "Invalid submission id" });
        }
        if (!FEEDBACK_STATUSES.includes(status)) {
            return res.status(400).json({ error: "Status måste vara godkänd eller komplettera" });
        }

        const user = req.user;
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            const instance = await CourseInstance.findById(submission.courseInstanceId);
            if (!teacher || !instance || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        submission.feedback = {
            comment: String(comment || ""),
            status,
            by: user.userId || null,
            at: new Date(),
        };
        await submission.save();

        // Keep the enrollment's per-module completion tracking in sync so the
        // activity/report ✓/✗ views reflect teacher feedback. "godkänd" marks
        // the module complete, anything else marks it as needing revision.
        if (submission.enrollmentId) {
            try {
                const enrollment = await StudentEnrollment.findById(submission.enrollmentId);
                if (enrollment) {
                    const completedComponents = enrollment.completedComponents || new Map();
                    completedComponents.set(String(submission.moduleNumber), status === "godkänd" ? "✓" : "✗");
                    enrollment.completedComponents = completedComponents;
                    enrollment.skipNotification = true;
                    await enrollment.save();
                }
            } catch (completedError) {
                logger.warn({ err: completedError, submissionId: submission._id }, "Error updating enrollment module completion");
            }
        }

        logger.info(
            { submissionId: submission._id, status, by: user.userId },
            "Assignment feedback set"
        );
        res.json({ success: true, submission });
    } catch (error) {
        logger.error({ err: error }, "Error setting submission feedback");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /learning/submissions/pending
 * Unreviewed submissions (no feedback yet) for the logged-in teacher's own
 * course instances, or for all instances for staff.
 */
export const getPendingSubmissions = async (req, res) => {
    try {
        const user = req.user;
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const query = { "feedback.status": "" };

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            if (!teacher) {
                return res.status(403).json({ error: "Teacher profile not found" });
            }
            const instances = await CourseInstance.find({
                $or: [{ responsibleTeacher: teacher._id }, { assistantTeacher: teacher._id }],
            }).select("_id");
            query.courseInstanceId = { $in: instances.map((i) => i._id) };
        }

        const submissions = await AssignmentSubmission.find(query)
            .populate("studentId", "name email")
            .populate("feedback.by", "username email")
            .populate("courseInstanceId", "courseName courseCode")
            .sort({ submittedAt: 1 });

        res.json({ success: true, submissions });
    } catch (error) {
        logger.error({ err: error }, "Error fetching pending submissions");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Per-component completion report for a student
// GET /learning/instances/:instanceId/report/:studentId
export const getCourseInstanceReport = async (req, res) => {
    try {
        const { instanceId, studentId } = req.params;

        if (!mongoose.isValidObjectId(instanceId) || !mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({ error: "Invalid IDs" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Get the student's enrollment for this instance
        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
            courseInstanceId: instanceId,
        });

        // Compute completion status from enrollment
        let completedComponents = {};
        let totalModules = 0;
        let completedModules = 0;

        if (enrollment && enrollment.completedComponents) {
            completedComponents = Object.fromEntries(enrollment.completedComponents);
            totalModules = instance.modules ? instance.modules.length : 0;
            completedModules = Object.values(completedComponents).filter(
                c => c === "✓"
            ).length;
        }

        // Get module information for component details
        const modules = instance.modules || [];

        // Compute assignment status per module
        const assignmentStatus = {};
        if (enrollment && enrollment._id) {
            const submissions = await AssignmentSubmission.find({
                enrollmentId: enrollment._id,
                courseInstanceId: instance._id,
            }).select("moduleNumber submittedText submittedAt feedback status fileId");
            for (const submission of submissions) {
                assignmentStatus[submission.moduleNumber] = {
                    submitted: !!submission.submittedText || !!submission.fileId,
                    status: submission.feedback?.status || "",
                    submittedAt: submission.submittedAt,
                    feedbackComment: submission.feedback?.comment || "",
                };
            }
        }

        // Compute student activity and last access
        const now = new Date();
        let lastAccess = null;
        let activityDays = 0;

        // Check last login from user model
        const user = await User.findById(student._id).select("lastLoginAt");
        if (user && user.lastLoginAt) {
            const diffMs = now - user.lastLoginAt;
            activityDays = Math.floor(diffMs / 86400000);
            lastAccess = user.lastLoginAt;
        }

        // If no login activity, check last submission
        if (activityDays === 0) {
            const lastSub = await AssignmentSubmission.findOne({
                studentId: student._id,
                enrollmentId: enrollment?._id,
            }).sort({ submittedAt: -1 });
            if (lastSub && lastSub.submittedAt) {
                const diffMs = now - lastSub.submittedAt;
                activityDays = Math.floor(diffMs / 86400000);
                lastAccess = lastSub.submittedAt;
            }
        }

        // Determine status labels. A module without its own start date and
        // without a scheduled section date is not expected to have been
        // completed yet — it shows "not scheduled" instead of "not completed".
        const statuses = {};
        for (const module of modules) {
            const scheduledDate = getModuleScheduledDate(module, instance, modules);
            statuses[module.moduleNumber] = {
                completed: completedComponents[module.moduleNumber] === "✓",
                scheduled: !!scheduledDate,
                scheduledDate: scheduledDate ? scheduledDate.toISOString().split("T")[0] : null,
                submitted: !!(assignmentStatus[module.moduleNumber]?.submitted),
                statusText: assignmentStatus[module.moduleNumber]?.status || "",
            };
        }

        res.json({
            success: true,
            instanceId,
            studentId,
            totalModules,
            completedModules,
            completionRate: totalModules > 0 ? (completedModules / totalModules * 100).toFixed(1) : 0,
            completedComponents,
            modules: modules.map((m) => {
                const scheduledDate = getModuleScheduledDate(m, instance, modules);
                return {
                    moduleNumber: m.moduleNumber,
                    title: m.title,
                    isPartialExam: m.isPartialExam,
                    isCaseStudy: m.isCaseStudy,
                    completed: completedComponents[m.moduleNumber] === "✓",
                    scheduled: !!scheduledDate,
                    scheduleDate: scheduledDate ? scheduledDate.toISOString().split("T")[0] : null,
                    submissionDate: assignmentStatus[m.moduleNumber]?.submittedAt || null,
                    avsnitt: buildReportAvsnitt(m),
                    assignment: assignmentStatus[m.moduleNumber],
                };
            }),
            assignmentStatus,
            scheduledDates: instance.sectionDates?.map((d, i) => ({
                moduleIndex: i,
                date: d ? d.toISOString().split("T")[0] : null,
            })) || [],
            studentActivity: {
                lastAccess,
                activityDays,
                lastLogin: user?.lastLoginAt,
                lastSubmission: activityDays > 0 ? null : null,
            },
            participantCount: enrollment ? enrollment.students?.length || 0 : 0,
        });
} catch (error) {
        logger.error({ err: error }, "Error fetching course instance report");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Get participants for a course instance.
// GET /learning/instances/:instanceId/participants
export const getCourseInstanceParticipants = async (req, res) => {
    try {
        const { instanceId } = req.params;

        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance ID" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get all enrollments for this instance
        const enrollments = await StudentEnrollment.find({ courseInstanceId: instance._id })
            .select("studentId students status")
            .populate("studentId", "name email")
            .lean();

        const studentIds = enrollments
            .map((e) => e.studentId?._id)
            .filter(Boolean);
        const usersByStudentId = new Map(
            (
                await User.find({ _id: { $in: studentIds } })
                    .select("lastLoginAt")
                    .lean()
            ).map((u) => [u._id.toString(), u.lastLoginAt || null])
        );

        // Latest submission per student gives the true "last course-card activity"
        // when no login exists for the student account.
        const submissions = await AssignmentSubmission.find({
            studentId: { $in: studentIds },
        })
            .select("studentId submittedAt")
            .lean();
        const lastSubmissionById = new Map();
        for (const sub of submissions) {
            const current = lastSubmissionById.get(sub.studentId.toString());
            if (!current || new Date(sub.submittedAt) > new Date(current)) {
                lastSubmissionById.set(sub.studentId.toString(), sub.submittedAt);
            }
        }

        const participants = enrollments.map((enrollment) => {
            const studentId = enrollment.studentId._id;
            const loginAt = usersByStudentId.get(studentId.toString()) || null;
            const submissionAt = lastSubmissionById.get(studentId.toString()) || null;
            const lastActivity = pickMostRecent(["login", "submission"], [loginAt, submissionAt]);
            return {
                participantId: studentId,
                name: enrollment.studentId.name,
                email: enrollment.studentId.email,
                role: "student",
                status: enrollment.status,
                lastActivity,
            };
        });

        // Staff participants: responsible + assistant teachers on the instance.
        const teacherIds = [instance.responsibleTeacher, instance.assistantTeacher].filter(Boolean);
        if (teacherIds.length > 0) {
            const staffTeachers = await Teacher.find({ _id: { $in: teacherIds } })
                .select("userId subject")
                .lean();
            const staffUserIds = staffTeachers
                .map((t) => t.userId)
                .filter(Boolean);
            const usersByUser = new Map(
                (
                    await User.find({ _id: { $in: staffUserIds } })
                        .select("name email lastLoginAt")
                        .lean()
                ).map((u) => [u._id.toString(), u])
            );

            for (const teacher of staffTeachers) {
                const user = usersByUser.get(String(teacher.userId)) || {};
                participants.push({
                    participantId: teacher._id,
                    userId: teacher.userId || null,
                    name: user.name || "Lärare",
                    email: user.email || null,
                    role: "staff",
                    staffRole: teacher.subject ? `Lärare (${teacher.subject})` : "Lärare",
                    status: user.active === false ? "inactive" : "active",
                    lastActivity: user.lastLoginAt ? { type: "login", at: user.lastLoginAt } : null,
                });
            }
        }

        res.json({
            success: true,
            participants,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instance participants");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Add a participant (student or staff) to a course instance.
 * Only admin/systemadmin can add participants; teacher can add students in their own courses.
 * POST /learning/instances/:instanceId/participants
 */
export const addCourseInstanceParticipant = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { participantId, role } = req.body;

        if (!participantId || !role) {
            return res.status(400).json({ error: "Participant ID and role are required" });
        }

        if (!mongoose.isValidObjectId(participantId)) {
            return res.status(400).json({ error: "Invalid participant ID" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Check permissions: admin/systemadmin can add anyone; teacher can add students in their course
        const user = req.user;
        const isAdmin = user.roles && user.roles.includes("systemadmin");
        const isAdminStaff = user.roles && user.roles.includes("admin");
        const isTeacher = user.role === "teacher";

        let hasPermission = false;

        if (isAdmin || isAdminStaff) {
            hasPermission = true;
        } else if (isTeacher) {
            // Teacher can add students to their own course
            hasPermission = instance.responsibleTeacher &&
                String(instance.responsibleTeacher) === String(user.userId);
        }

        if (!hasPermission) {
            return res.status(403).json({ error: "Saknad behörighet för att lägga till deltagare" });
        }

        // Check if participant already exists
        const existingEnrollment = await StudentEnrollment.findOne({
            courseInstanceId: instance._id,
            studentId: participantId,
        }).lean();

        if (existingEnrollment) {
            return res.status(409).json({ error: "Denna elev är redan inskriven på kursen" });
        }

        // Create new enrollment
        let mainCourseId = instance.mainCourseId || null;
        let enrollmentPrice = null;
        if (mainCourseId && mongoose.isValidObjectId(mainCourseId)) {
            const mainCourse = await Course.findById(mainCourseId).lean();
            enrollmentPrice = mainCourse?.price ?? null;
        }

        const newEnrollment = new StudentEnrollment({
            studentId: participantId,
            courseInstanceId: instance._id,
            mainCourseId,
            enrollmentPrice,
            status: "enrolled",
        });

        await newEnrollment.save();

        res.json({
            success: true,
            enrollment: {
                studentId: participantId,
                courseInstanceId: instance._id,
                status: "enrolled",
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Error adding course instance participant");
        res.status(500).json({ error: "Intern servererror" });
    }
};

/**
 * Remove a participant from a course instance.
 * Admin/systemadmin can remove anyone; teacher can remove students from their own course.
 * DELETE /learning/instances/:instanceId/participants/:participantId
 */
export const removeCourseInstanceParticipant = async (req, res) => {
    try {
        const { instanceId, participantId } = req.params;

        if (!mongoose.isValidObjectId(instanceId) || !mongoose.isValidObjectId(participantId)) {
            return res.status(400).json({ error: "Invalid IDs" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Check permissions
        const user = req.user;
        const isAdmin = user.roles && user.roles.includes("systemadmin");
        const isAdminStaff = user.roles && user.roles.includes("admin");
        const isTeacher = user.role === "teacher";

        let hasPermission = false;

        if (isAdmin || isAdminStaff) {
            hasPermission = true;
        } else if (isTeacher) {
            hasPermission = instance.responsibleTeacher &&
                String(instance.responsibleTeacher) === String(user.userId);
        }

        if (!hasPermission) {
            return res.status(403).json({ error: "Saknad behörighet för att ta bort deltagare" });
        }

        // Find and remove the enrollment
        const enrollment = await StudentEnrollment.findOne({
            courseInstanceId: instance._id,
            studentId: participantId,
        });

        if (!enrollment) {
            return res.status(404).json({ error: "Deltagare hittades inte på den här kursen" });
        }

        // Soft remove: set status to withdrawn instead of deleting
        enrollment.status = "withdrawn";
        enrollment.dropoutDate = new Date();
        enrollment.dropoutBy = user._id;
        await enrollment.save();

        res.json({
            success: true,
            message: "Deltagare har tagits bort från kursen",
        });
    } catch (error) {
        logger.error({ err: error }, "Error removing course instance participant");
        res.status(500).json({ error: "Intern servererror" });
    }
};

/**
 * Get last access time for a student in a course instance.
 * Returns the last login date and last submission date.
 * GET /learning/instances/:instanceId/access-last/:studentId
 */
export const getStudentLastAccess = async (req, res) => {
    try {
        const { instanceId, studentId } = req.params;

        if (!mongoose.isValidObjectId(instanceId) || !mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({ error: "Invalid IDs" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Get the student's enrollment for this instance
        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
            courseInstanceId: instanceId,
        });

        // Check last login from user model
        const user = await User.findById(student._id).select("lastLoginAt");
        const lastLogin = user?.lastLoginAt || null;

        // Check last submission
        let lastSubmission = null;
        if (enrollment && enrollment._id) {
            const lastSub = await AssignmentSubmission.findOne({
                studentId: student._id,
                enrollmentId: enrollment._id,
            }).sort({ submittedAt: -1 });
            lastSubmission = lastSub?.submittedAt || null;
        }

        res.json({
            success: true,
            lastLogin,
            lastSubmission,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching student last access");
        res.status(500).json({ error: "Intern servererror" });
    }
};

// Macro reports for a course instance (multiple students)
// GET /learning/instances/:instanceId/reports
export const getCourseInstanceReports = async (req, res) => {
    try {
        const { instanceId } = req.params;

        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance ID" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get all enrollments for this instance
        const enrollments = await StudentEnrollment.find({ courseInstanceId: instanceId })
            .select("completedAt completionCertificate studentId completedComponents");

        const totalEnrollments = enrollments.length;
        let totalCompletedStudents = 0;
        let totalCompletedModules = 0;

        enrollments.forEach(enrollment => {
            if (enrollment.completedAt) totalCompletedStudents++;
            if (enrollment.completedComponents) {
                const completed = Object.values(enrollment.completedComponents || {}).filter(c => c === "✓").length;
                totalCompletedModules += completed;
            }
        });

        const overallCompletionRate = totalEnrollments > 0
            ? (totalCompletedStudents / totalEnrollments * 100).toFixed(1)
            : 0;

        res.json({
            success: true,
            instanceId,
            totalEnrollments,
            totalCompletedStudents,
            totalCompletedModules,
            overallCompletionRate,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instance reports");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * HTTP adapter for the batch activity-status service.
 *
 * The service expects a plain { courseInstanceId, studentIds } object, while
 * the router previously handed it the raw Express request. That produced an
 * "Invalid course instance ID" result that was never sent back, leaving the
 * request hanging. Keep the URL and payload shape unchanged; only bridge the
 * request into the service and serialise its result.
 */
export const getBatchActivityStatus = async (req, res) => {
    const result = await calculateBatchActivityStatus({
        courseInstanceId: req.params?.instanceId,
        studentIds: req.body?.studentIds,
    });

    if (result?.error) {
        const status = result.error === "Internal server error" ? 500 : 400;
        return res.status(status).json(result);
    }
    return res.json(result);
};

/**
 * HTTP adapter for the single-student activity-status service. Mirrors
 * getBatchActivityStatus: the service takes a plain params object and returns
 * a result that must be serialised, rather than receiving the raw request.
 */
export const getActivityStatus = async (req, res) => {
    const result = await calculateActivityStatus({
        studentId: req.params?.studentId,
        courseInstanceId: req.params?.instanceId,
    });

    if (result?.error) {
        const status = result.error === "Internal server error" ? 500 : 400;
        return res.status(status).json(result);
    }
    return res.json(result);
};

/**
 * GET /learning/submissions/:submissionId/comments
 * Assignment-tied discussion thread for one submission. A student caller may
 * only read comments on their own submission; teachers/staff may read any.
 */
export const getSubmissionComments = async (req, res) => {
    try {
        const { submissionId } = req.params;
        if (!mongoose.isValidObjectId(submissionId)) {
            return res.status(400).json({ error: "Invalid submission id" });
        }

        const user = req.user;
        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        if (!isTeacherUser(user) && !isStaffUser(user)) {
            const student = await getStudentForUser(user);
            if (!student || String(submission.studentId) !== String(student._id)) {
                return res.status(403).json({ error: "Forbidden: Access denied." });
            }
        }

        res.json({ success: true, comments: submission.comments || [] });
    } catch (error) {
        logger.error({ err: error }, "Error fetching submission comments");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /learning/submissions/:submissionId/comments
 * Add a comment/reply to a submission's discussion thread. Replies are
 * identified by parentCommentId pointing to the parent comment (null = top-level).
 */
export const addSubmissionComment = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { text, parentCommentId } = req.body || {};

        if (!mongoose.isValidObjectId(submissionId)) {
            return res.status(400).json({ error: "Invalid submission id" });
        }
        if (!text || !String(text).trim()) {
            return res.status(400).json({ error: "Text krävs" });
        }

        const user = req.user;
        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff && !isStudentUser(user)) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            const instance = await CourseInstance.findById(submission.courseInstanceId);
            if (!teacher || !instance || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        if (isStudentUser(user)) {
            const student = await getStudentForUser(user);
            if (!student || String(submission.studentId) !== String(student._id)) {
                return res.status(403).json({ error: "Forbidden: Access denied." });
            }
        }

        if (parentCommentId && !mongoose.isValidObjectId(parentCommentId)) {
            return res.status(400).json({ error: "Invalid parentCommentId" });
        }

        submission.comments = (submission.comments || []).concat({
            id: new mongoose.Types.ObjectId(),
            text: String(text).trim(),
            by: user.userId || null,
            at: new Date(),
            parentCommentId: parentCommentId || null,
        });
        await submission.save();

        logger.info(
            { submissionId: submission._id, by: user.userId },
            "Submission comment added"
        );
        res.json({ success: true, comments: submission.comments });
    } catch (error) {
        logger.error({ err: error }, "Error adding submission comment");
        res.status(500).json({ error: "Internal server error" });
    }
};


