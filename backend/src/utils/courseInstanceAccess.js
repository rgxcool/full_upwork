/**
 * Who may read, edit or post on a kurskort (CourseInstance).
 *
 * One rule for every course-instance endpoint so content, activity feed and
 * notice-board posting cannot drift apart again (#28, #29):
 *
 * | caller                                  | read | edit | post |
 * |-----------------------------------------|------|------|------|
 * | systemadmin / admin / tester            |  ✓   |  ✓   |  ✓   |
 * | responsible teacher                     |  ✓   |  ✓   |  ✓   |
 * | assistant teacher                       |  ✓   |      |  ✓   |
 * | student with a non-dropped enrollment   |  ✓   |      |      |
 * | anyone else (other teacher/student/...) |      |      |      |
 *
 * Content editing stays with the responsible teacher (unchanged behaviour);
 * the assistant teacher can read the card and post on the anslagstavla.
 *
 * `responsibleTeacher` / `assistantTeacher` hold the teacher's User id (#102),
 * so they are compared with `req.user.userId` directly.
 *
 * Note: CourseInstance carries no kommun, so there is no per-instance tenant
 * filter here; scoped staff roles (coordinator/syv/specped) get no access.
 */
import mongoose from "mongoose";

const SUPERUSER_ROLES = ["systemadmin", "admin", "tester"];

// Dropped students lose access; completed/revised courses stay readable so a
// student can revisit material shown on their course cards.
const NO_ACCESS_ENROLLMENT_STATUSES = ["dropped"];

const NONE = Object.freeze({ canRead: false, canEdit: false, canPost: false, relation: "none" });

export function getUserRoles(user) {
    const roles = Array.isArray(user?.roles) ? [...user.roles] : [];
    if (typeof user?.role === "string") roles.push(user.role);
    return [...new Set(roles.filter((r) => typeof r === "string").map((r) => r.toLowerCase()))];
}

const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a._id ?? a) === String(b._id ?? b);

/**
 * @param {Object} user - req.user ({ userId, email, role, roles })
 * @param {Object} instance - CourseInstance document (hydrated or lean)
 * @returns {Promise<{canRead: boolean, canEdit: boolean, canPost: boolean, relation: string}>}
 */
export async function getCourseInstanceAccess(user, instance) {
    if (!user || !instance) return NONE;
    const roles = getUserRoles(user);

    if (roles.some((r) => SUPERUSER_ROLES.includes(r))) {
        return { canRead: true, canEdit: true, canPost: true, relation: "admin" };
    }

    if (roles.includes("teacher") && user.userId && mongoose.isValidObjectId(user.userId)) {
        if (sameId(instance.responsibleTeacher, user.userId)) {
            return { canRead: true, canEdit: true, canPost: true, relation: "responsible" };
        }
        if (sameId(instance.assistantTeacher, user.userId)) {
            return { canRead: true, canEdit: false, canPost: true, relation: "assistant" };
        }
    }

    if (roles.includes("student") && typeof user.email === "string" && user.email) {
        const Student = mongoose.model("Student");
        const StudentEnrollment = mongoose.model("StudentEnrollment");
        const student = await Student.findOne({ email: user.email }).select("_id").lean();
        if (student) {
            const enrolled = await StudentEnrollment.exists({
                studentId: student._id,
                courseInstanceId: instance._id,
                status: { $nin: NO_ACCESS_ENROLLMENT_STATUSES },
            });
            if (enrolled) {
                return { canRead: true, canEdit: false, canPost: false, relation: "student" };
            }
        }
    }

    return NONE;
}
