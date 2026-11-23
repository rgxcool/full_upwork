// #121: a teacher may change a student's record or study plan only when the
// student is connected to them. Other staff roles are not restricted here.
import mongoose from "mongoose";
import logger from "../utils/logger.js";

// Roles that may edit any student. A teacher who also has one of these is
// not restricted.
const UNRESTRICTED_STAFF_ROLES = ["systemadmin", "admin", "coordinator", "syv", "specped", "tester"];

const getModel = (name) => mongoose.models?.[name] || mongoose.model(name);

function rolesOf(user) {
    const roles = Array.isArray(user?.roles) ? [...user.roles] : [];
    if (user?.role) roles.push(user.role);
    return roles.filter((r) => typeof r === "string").map((r) => r.toLowerCase());
}

/** True when the user is a teacher and has no role that may edit any student. */
export function isRestrictedTeacher(user) {
    const roles = rolesOf(user);
    return roles.includes("teacher") && !roles.some((r) => UNRESTRICTED_STAFF_ROLES.includes(r));
}

/**
 * True when the student is connected to the teacher (#121):
 *  - the teacher is the student's assigned teacher (Student.teacherId), or
 *  - the teacher teaches one of the student's courses: an enrollment with
 *    teacherId = the teacher, or a course instance where the teacher is the
 *    responsible or assistant teacher.
 * All teacher references hold the teacher's User id (#102). Fails closed.
 */
export async function isTeacherConnectedToStudent(teacherUserId, studentId) {
    if (!mongoose.isValidObjectId(teacherUserId) || !mongoose.isValidObjectId(studentId)) {
        return false;
    }
    const Student = getModel("Student");
    const StudentEnrollment = getModel("StudentEnrollment");
    const CourseInstance = getModel("CourseInstance");

    if (await Student.exists({ _id: studentId, teacherId: teacherUserId })) return true;

    const enrollments = await StudentEnrollment.find({ studentId })
        .select("teacherId courseInstanceId")
        .lean();
    if (enrollments.some((e) => e.teacherId && String(e.teacherId) === String(teacherUserId))) {
        return true;
    }
    const instanceIds = enrollments.map((e) => e.courseInstanceId).filter(Boolean);
    if (instanceIds.length === 0) return false;
    return Boolean(
        await CourseInstance.exists({
            _id: { $in: instanceIds },
            $or: [{ responsibleTeacher: teacherUserId }, { assistantTeacher: teacherUserId }],
        })
    );
}

/**
 * Express middleware: a restricted teacher gets 403 unless the student in
 * `req.params[param]` is connected to them. Other users pass through.
 * Place it after authentication and hasRole (which refreshes req.user.roles).
 * @param {string} [param] - route param holding the student id
 */
export function requireOwnStudentForTeacher(param = "id") {
    return async (req, res, next) => {
        try {
            if (!isRestrictedTeacher(req.user)) return next();
            if (await isTeacherConnectedToStudent(req.user.userId, req.params[param])) return next();
            return res.status(403).json({
                error: "Du kan bara ändra elever som är kopplade till dig.",
            });
        } catch (err) {
            logger.error({ err }, "Teacher student-access check failed");
            return res.status(500).json({ error: "Serverfel vid behörighetskontroll" });
        }
    };
}
