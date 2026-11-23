// #102 — merge the Teacher collection into User (one id per person).
//
// 1. Copy each `teachers` document into its User as `user.teacherProfile`
//    (subject, colorCode, phoneNumbers, createdAt). A user that already has a
//    profile is left alone, so a second run copies nothing.
// 2. Rewrite every reference that holds a Teacher id to the matching User id.
//    Only values found in the Teacher → User map are touched, so fields that
//    already hold User ids are safe and a second run changes nothing.
//
// Works on raw collections (not the Mongoose models) so it keeps working after
// the Teacher model is deleted. Nothing is deleted here: the `teachers`
// collection is dropped separately once every environment is migrated.

/** Every place a Teacher id is stored. `array` = path inside an array field. */
export const TEACHER_REFERENCES = [
    { collection: "actionplans", path: "teacherId" },
    { collection: "completionEvents", path: "teacherId" },
    { collection: "courseInstances", path: "responsibleTeacher" },
    { collection: "courseInstances", path: "assistantTeacher" },
    { collection: "exam_attendance", path: "teacherId" },
    { collection: "grades", path: "teacherId" },
    { collection: "gradecatalogs", path: "teacherId" },
    { collection: "notifications", path: "teacher" },
    { collection: "exams", path: "teacherId" },
    { collection: "students", path: "teacherId" },
    { collection: "students", array: "examHistory", path: "teacherId" },
    { collection: "studentEnrollments", path: "teacherId" },
    { collection: "teacherscheduleparameters", path: "teacherId" },
    { collection: "calendar_events", path: "extendedProps.teacherId" },
];

const label = (ref) => `${ref.collection}.${ref.array ? `${ref.array}[].` : ""}${ref.path}`;

// Teacher ids were sometimes stored as strings (Mixed payloads); match both.
const idForms = (id) => [id, String(id)];

function profileFromTeacher(teacher) {
    return {
        subject: typeof teacher.subject === "string" && teacher.subject.trim() ? teacher.subject.trim() : "Övrigt",
        colorCode: teacher.colorCode || "#FF0000",
        phoneNumbers: Array.isArray(teacher.phoneNumbers) ? teacher.phoneNumbers.filter(Boolean) : [],
        createdAt: teacher.createdAt || teacher._id.getTimestamp?.() || new Date(),
    };
}

/**
 * @param {import("mongodb").Db} db
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<{
 *   teachers: number, profilesCopied: number, profilesAlreadyPresent: number,
 *   orphanTeachers: string[], duplicateTeachers: Array<{teacherId: string, userId: string}>,
 *   references: Record<string, number>, orphanReferences: Record<string, number>,
 *   errors: Array<{reference: string, message: string}>
 * }>}
 */
export async function migrateTeacherIntoUser(db, { dryRun = false } = {}) {
    const users = db.collection("users");
    const teachers = await db.collection("teachers").find({}).sort({ createdAt: 1, _id: 1 }).toArray();

    const report = {
        teachers: teachers.length,
        profilesCopied: 0,
        profilesAlreadyPresent: 0,
        orphanTeachers: [],
        duplicateTeachers: [],
        references: {},
        orphanReferences: {},
        errors: [],
    };

    // ── 1. profiles ──────────────────────────────────────────────────────────
    const teacherToUser = new Map(); // String(teacherId) -> { teacherId, userId }
    const orphanIds = [];
    const seenUsers = new Set();
    for (const teacher of teachers) {
        const user = teacher.userId ? await users.findOne({ _id: teacher.userId }, { projection: { teacherProfile: 1 } }) : null;
        if (!user) {
            report.orphanTeachers.push(String(teacher._id));
            orphanIds.push(teacher._id);
            continue;
        }
        teacherToUser.set(String(teacher._id), { teacherId: teacher._id, userId: user._id });

        if (seenUsers.has(String(user._id))) {
            // Two Teacher docs for one user: the oldest profile wins, both ids
            // are rewritten to the same User id.
            report.duplicateTeachers.push({ teacherId: String(teacher._id), userId: String(user._id) });
            continue;
        }
        seenUsers.add(String(user._id));

        if (user.teacherProfile && typeof user.teacherProfile === "object") {
            report.profilesAlreadyPresent += 1;
            continue;
        }
        report.profilesCopied += 1;
        if (!dryRun) {
            await users.updateOne(
                { _id: user._id, teacherProfile: { $not: { $type: "object" } } },
                { $set: { teacherProfile: profileFromTeacher(teacher) } }
            );
        }
    }

    // ── 2. references ────────────────────────────────────────────────────────
    for (const ref of TEACHER_REFERENCES) {
        const key = label(ref);
        const coll = db.collection(ref.collection);
        const fullPath = ref.array ? `${ref.array}.${ref.path}` : ref.path;
        report.references[key] = 0;
        try {
            for (const { teacherId, userId } of teacherToUser.values()) {
                const filter = { [fullPath]: { $in: idForms(teacherId) } };
                if (dryRun) {
                    report.references[key] += await coll.countDocuments(filter);
                    continue;
                }
                const update = ref.array
                    ? coll.updateMany(
                          filter,
                          { $set: { [`${ref.array}.$[entry].${ref.path}`]: userId } },
                          { arrayFilters: [{ [`entry.${ref.path}`]: { $in: idForms(teacherId) } }] }
                      )
                    : coll.updateMany(filter, { $set: { [fullPath]: userId } });
                report.references[key] += (await update).modifiedCount;
            }
            if (orphanIds.length) {
                const n = await coll.countDocuments({ [fullPath]: { $in: orphanIds.flatMap(idForms) } });
                if (n) report.orphanReferences[key] = n;
            }
        } catch (err) {
            // E.g. a unique index (teacherscheduleparameters) when two Teacher
            // docs of one user both had rows: report, don't guess.
            report.errors.push({ reference: key, message: err.message });
        }
    }

    return report;
}

/** Human-readable report lines for the CLI. */
export function formatTeacherMigrationReport(report, { dryRun = false } = {}) {
    const verb = dryRun ? "would" : "did";
    const lines = [
        `Teacher documents: ${report.teachers}`,
        `Profiles copied into User (${verb}): ${report.profilesCopied}; already present: ${report.profilesAlreadyPresent}`,
        `References rewritten Teacher id → User id (${dryRun ? "would match" : "modified"}):`,
        ...Object.entries(report.references).map(([k, n]) => `  ${k.padEnd(44)} ${n}`),
    ];
    if (report.orphanTeachers.length) {
        lines.push(`⚠️  ${report.orphanTeachers.length} Teacher doc(s) without a User (left untouched): ${report.orphanTeachers.join(", ")}`);
        for (const [k, n] of Object.entries(report.orphanReferences)) lines.push(`    ${k}: ${n} reference(s) to those`);
    }
    if (report.duplicateTeachers.length) {
        lines.push(`⚠️  ${report.duplicateTeachers.length} extra Teacher doc(s) for a user that already had one (ids merged):`);
        for (const d of report.duplicateTeachers) lines.push(`    teacher ${d.teacherId} → user ${d.userId}`);
    }
    for (const e of report.errors) lines.push(`❌ ${e.reference}: ${e.message}`);
    return lines.join("\n");
}
