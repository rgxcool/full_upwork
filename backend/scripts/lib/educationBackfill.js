// #103 — backfill StudentEnrollment from the legacy Student.education array.
//
// For every education entry that has no matching enrollment, create one through
// the normal placement path (CourseMatchingService.processStudentEducation), then
// carry over grade / lock / dropout status. Anything that cannot be matched
// safely is REPORTED, never guessed. Idempotent: a second run creates nothing.
//
// Used by scripts/backfillEnrollmentsFromEducation.js.
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";

const REF_FIELD = { Course: "mainCourseId", CoursePackage: "coursePackageId", Program: "programId" };

const dayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const refOf = (entry) => (entry?.refId && typeof entry.refId === "object" && entry.refId._id ? entry.refId._id : entry?.refId);

/**
 * Classify one education entry against the student's existing enrollments.
 * @returns {{ kind: "removed"|"matched"|"create"|"ambiguous", reason?: string, courseId?: any }}
 */
async function classifyEntry(student, entry, enrollments) {
    if (entry.removedAt) return { kind: "removed" };
    const type = entry.type;
    if (!REF_FIELD[type]) return { kind: "ambiguous", reason: `unknown type "${type}"` };

    let ref = refOf(entry);
    if (type === "Course") {
        // Same resolution as placement: refId first, then strict code match on the name.
        const { course, resolvedByRef } = await CourseMatchingService.resolveEntryCourse(entry);
        if (!course) {
            return { kind: "ambiguous", reason: resolvedByRef ? "course id not found" : "no course matches the name" };
        }
        ref = course._id;
        if (!entry.startDate || !entry.endDate) return { kind: "ambiguous", reason: "missing start or end date" };
    } else if (!ref) {
        return { kind: "ambiguous", reason: `${type} without refId` };
    }

    const field = REF_FIELD[type];
    const sameRef = enrollments.filter((e) => String(e[field] || "") === String(ref));
    if (sameRef.length === 0) return { kind: "create", courseId: type === "Course" ? ref : undefined };
    if (type !== "Course") return { kind: "matched" };

    // A course can be taken twice (re-registration), so a course match only
    // counts when the start date matches too. Same course, other dates is drift
    // between the two sources — report it instead of adding a second enrollment.
    const start = dayKey(entry.startDate);
    if (sameRef.some((e) => dayKey(e.startDate) === start)) return { kind: "matched" };
    return {
        kind: "ambiguous",
        reason: `enrolled in this course with other dates (${sameRef.map((e) => dayKey(e.startDate)).join(", ")})`,
    };
}

/** Status/grade fields to carry over onto an enrollment created from `entry`. */
export function carriedOverFields(student, entry) {
    const set = {};
    if (entry.grade) {
        set.grade = entry.grade;
        set.status = "completed";
        set.gradeDate = entry.endDate || null;
        set.isGradeLocked = Boolean(entry.locked);
    } else if (student.dropout) {
        set.status = "dropped";
    }
    return set;
}

/**
 * @param {{ dryRun?: boolean, userId?: any }} [opts]
 * @returns {Promise<object>} report (see formatEducationBackfillReport)
 */
export async function backfillEnrollmentsFromEducation({ dryRun = true, userId = null } = {}) {
    const report = {
        dryRun,
        students: 0,
        entries: 0,
        removed: 0,
        matched: 0,
        toCreate: 0,
        created: 0,
        updated: 0,
        ambiguous: [],
        errors: [],
    };

    // The schema no longer has `education` (#103), so read the legacy array
    // straight from the collection.
    const students = await Student.collection
        .find({ "education.0": { $exists: true } }, { projection: { education: 1, dropout: 1, pace: 1 } })
        .toArray();

    for (const student of students) {
        report.students++;
        const enrollments = await StudentEnrollment.find({ studentId: student._id })
            .select("mainCourseId coursePackageId programId startDate")
            .lean();

        for (const [index, entry] of (student.education || []).entries()) {
            report.entries++;
            const verdict = await classifyEntry(student, entry, enrollments);
            if (verdict.kind === "removed") { report.removed++; continue; }
            if (verdict.kind === "matched") { report.matched++; continue; }
            if (verdict.kind === "ambiguous") {
                // Ids and course data only — never names or personnummer (CLAUDE.md §4).
                report.ambiguous.push({
                    studentId: String(student._id),
                    index,
                    type: entry.type,
                    refId: refOf(entry) ? String(refOf(entry)) : null,
                    start: dayKey(entry.startDate),
                    end: dayKey(entry.endDate),
                    reason: verdict.reason,
                });
                continue;
            }

            report.toCreate++;
            if (dryRun) continue;

            const replay = {
                type: entry.type,
                refId: verdict.courseId || refOf(entry),
                name: entry.name,
                startDate: entry.startDate,
                endDate: entry.endDate,
            };
            const result = await CourseMatchingService.processStudentEducation(student._id, [replay], userId, {
                replay: true, // no reactivation, no introduktionskit
                pace: student.pace,
            });
            for (const err of [...(result.errors || []), ...(result.warnings || []).filter((w) => w.type === "no_match")]) {
                report.errors.push({ studentId: String(student._id), index, type: err.type, message: err.message });
            }
            const createdIds = (result.enrollments || []).map((e) => e._id).filter(Boolean);
            report.created += createdIds.length;

            const set = carriedOverFields(student, entry);
            if (createdIds.length && Object.keys(set).length) {
                // updateMany skips the save hooks on purpose: an *update* hook sends
                // "studieplan ändrad" notifications, which a backfill must not do.
                const history = set.status
                    ? { $push: { statusHistory: { status: set.status, changedAt: new Date(), reason: "Backfill från Student.education (#103)" } } }
                    : {};
                const res = await StudentEnrollment.updateMany({ _id: { $in: createdIds } }, { $set: set, ...history });
                report.updated += res.modifiedCount || 0;
            }
            // Later entries of this student must see what was just created.
            enrollments.push(
                ...(await StudentEnrollment.find({ _id: { $in: createdIds } })
                    .select("mainCourseId coursePackageId programId startDate")
                    .lean())
            );
        }
    }
    return report;
}

export function formatEducationBackfillReport(report) {
    const verb = report.dryRun ? "would create" : "created";
    const lines = [
        `Students with education entries: ${report.students}`,
        `Education entries: ${report.entries} (removed: ${report.removed})`,
        `  already have an enrollment:   ${report.matched}`,
        `  without enrollment:           ${report.toCreate}`,
    ];
    if (!report.dryRun) {
        lines.push(`  enrollments ${verb}:        ${report.created} (status/grade carried over on ${report.updated})`);
    }
    lines.push(`  ambiguous (not touched):      ${report.ambiguous.length}`);
    for (const a of report.ambiguous) {
        lines.push(`    ⚠️  student ${a.studentId} entry #${a.index} ${a.type} ${a.refId || "-"} ${a.start || "?"}–${a.end || "?"}: ${a.reason}`);
    }
    for (const e of report.errors) {
        lines.push(`    ❌ student ${e.studentId} entry #${e.index}: ${e.type} ${e.message || ""}`);
    }
    return lines.join("\n");
}
