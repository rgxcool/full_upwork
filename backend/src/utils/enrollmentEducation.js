/**
 * A student's study plan ("education") built from StudentEnrollment (#103).
 *
 * StudentEnrollment is the only source of a student's courses. API responses
 * and older frontend code still expect an `education`-shaped list
 * (`{ type, refId, name, startDate, endDate, grade, … }`), so this module
 * derives that list from enrollments. Nothing here reads or writes the retired
 * `Student.education` array.
 */
import StudentEnrollment from "../models/StudentEnrollment.js";

const idOf = (v) => (v && typeof v === "object" && v._id ? v._id : v);

const packageName = (pkg) =>
    (pkg && typeof pkg === "object" && (pkg.coursePackageName || pkg.packageName)) || undefined;

/** One education entry for an enrollment (Course, CoursePackage or Program). */
export function entryFromEnrollment(enrollment) {
    if (!enrollment) return null;
    let type;
    let ref;
    let name;
    if (enrollment.mainCourseId) {
        type = "Course";
        ref = enrollment.mainCourseId;
        name = ref?.courseName;
    } else if (enrollment.coursePackageId) {
        type = "CoursePackage";
        ref = enrollment.coursePackageId;
        name = packageName(ref);
    } else if (enrollment.programId) {
        type = "Program";
        ref = enrollment.programId;
        name = ref?.programName;
    } else {
        return null;
    }
    return {
        _id: enrollment._id,
        type,
        refId: ref,
        name,
        startDate: enrollment.startDate,
        endDate: enrollment.endDate,
        finalExamDate: enrollment.slutprovDate,
        status: enrollment.status,
        grade: enrollment.grade,
        isGradeLocked: Boolean(enrollment.isGradeLocked),
        comments: enrollment.notes,
        enrollmentId: enrollment._id,
        courseInstanceId: enrollment.courseInstanceId,
        teacherId: enrollment.teacherId,
        addedAt: enrollment.createdAt,
        addedBy: enrollment.teacherId || "System",
        isEnrollment: true,
    };
}

/**
 * CoursePackage entries for the packages a student's course enrollments belong
 * to: earliest start to latest end over that package's courses. This is the
 * APL period source (aplAutoStatus.computeAplPeriod).
 * @param {Array} enrollments
 * @param {Map<string, object>} [packageMap] - package id → CoursePackage doc, for names
 */
export function packageEntriesFromEnrollments(enrollments = [], packageMap = new Map()) {
    const byPkg = new Map();
    for (const enr of enrollments) {
        // Package-only enrollments already become their own CoursePackage entry.
        if (!enr?.coursePackageId || !enr.mainCourseId) continue;
        const key = String(idOf(enr.coursePackageId));
        if (!byPkg.has(key)) byPkg.set(key, { pkg: enr.coursePackageId, list: [] });
        byPkg.get(key).list.push(enr);
    }
    const entries = [];
    for (const [key, { pkg, list }] of byPkg) {
        const starts = list.map((e) => new Date(e.startDate).getTime()).filter(Number.isFinite);
        const ends = list.map((e) => new Date(e.endDate).getTime()).filter(Number.isFinite);
        const doc = packageMap.get(key) || (typeof pkg === "object" && pkg?._id ? pkg : null);
        entries.push({
            _id: undefined,
            type: "CoursePackage",
            refId: doc || pkg,
            name: packageName(doc),
            startDate: starts.length ? new Date(Math.min(...starts)) : undefined,
            endDate: ends.length ? new Date(Math.max(...ends)) : undefined,
            status: list[0]?.status,
            grade: null,
            isEnrollment: false,
        });
    }
    return entries;
}

/**
 * The full education-shaped study plan for one student's enrollments:
 * one entry per enrollment plus one per package their courses belong to.
 */
export function educationFromEnrollments(enrollments = [], packageMap = new Map()) {
    const entries = enrollments.map(entryFromEnrollment).filter(Boolean);
    const havePackage = new Set(
        entries.filter((e) => e.type === "CoursePackage").map((e) => String(idOf(e.refId)))
    );
    for (const pkg of packageEntriesFromEnrollments(enrollments, packageMap)) {
        if (!havePackage.has(String(idOf(pkg.refId)))) entries.push(pkg);
    }
    return entries;
}

/**
 * Load the education-shaped study plan for several students in one query.
 * @param {Array} studentIds
 * @param {{ statuses?: string[] }} [opts] - only enrollments with these statuses
 * @returns {Promise<Map<string, Array>>} student id → entries
 */
export async function loadEducationByStudent(studentIds = [], { statuses } = {}) {
    const filter = { studentId: { $in: studentIds } };
    if (statuses) filter.status = { $in: statuses };
    const enrollments = await StudentEnrollment.find(filter)
        .populate("mainCourseId", "courseName courseCode coursePoints courseExtent")
        .populate("coursePackageId", "coursePackageName coursePackageCode")
        .populate("programId", "programName")
        .sort({ startDate: 1 })
        .lean();
    const byStudent = new Map(studentIds.map((id) => [String(id), []]));
    for (const enr of enrollments) {
        const key = String(idOf(enr.studentId));
        if (!byStudent.has(key)) byStudent.set(key, []);
        byStudent.get(key).push(enr);
    }
    return new Map([...byStudent].map(([id, list]) => [id, educationFromEnrollments(list)]));
}
