// Clears all people and activity data but keeps:
//   - admin and systemadmin accounts (plus their Teacher profiles and those
//     teachers' schedule parameters),
//   - the education catalog and content: programs, courses, course packages,
//     kursmallar, grading scales, question bank, FAQ, handlingsplan questions,
//   - configuration: certificate settings/templates, counters, and the GridFS
//     files they reference (logo/signature).
// Everything else (students, teachers, kurskort/course instances, enrollments,
// submissions, grades, APL, documents + their upload files, messages,
// notifications, events, prövningar, certificates, audit logs, …) is cleared,
// including collections added in the future. See KEEP_COLLECTIONS in
// scripts/lib/dbReset.js to keep a new catalog-like collection.
//
// Usage (from backend/):
//   DRY_RUN=1 node scripts/flushAllButAdmins.js   # preview counts
//   node scripts/flushAllButAdmins.js --yes       # execute
import { flushAllButAdmins, formatCounts } from "./lib/dbReset.js";
import { runReset } from "./lib/runReset.js";

runReset({
    title: "flushAllButAdmins",
    describe:
        "It deletes every student, teacher, kurskort, enrollment, grade, document and message; only admin/systemadmin accounts and the education catalog are kept.",
    action: async (db, opts) => {
        const { deleted, kept, uploadFiles } = await flushAllButAdmins(db, opts);
        console.log(`\n${opts.dryRun ? "Would delete" : "Deleted"} documents per collection:\n${formatCounts(deleted)}`);
        console.log(`Upload files on disk: ${uploadFiles}`);
        console.log(`\nKept:\n${formatCounts(kept)}`);
    },
});
