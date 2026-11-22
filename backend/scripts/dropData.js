// Wipes EVERYTHING in the local database: every collection (all users,
// admins included), GridFS files, and the disk files in public/uploads.
// Collections are emptied, not dropped, so indexes survive.
//
// Usage (from backend/):
//   DRY_RUN=1 node scripts/dropData.js   # preview counts
//   node scripts/dropData.js --yes       # execute
// Afterwards create an admin to log in again, e.g. node scripts/createSystemAdmin.js
//
// To reload only the education catalog, use scripts/dropEducation.js instead.
import { formatCounts, wipeEverything } from "./lib/dbReset.js";
import { runReset } from "./lib/runReset.js";

runReset({
    title: "dropData (wipe everything)",
    describe:
        "It empties EVERY collection, including all admin accounts, GridFS files and public/uploads.",
    action: async (db, opts) => {
        const { deleted, uploadFiles } = await wipeEverything(db, opts);
        console.log(`\n${opts.dryRun ? "Would delete" : "Deleted"} documents per collection:\n${formatCounts(deleted)}`);
        console.log(`Upload files on disk: ${uploadFiles}`);
        if (!opts.dryRun) {
            console.log("\nNo accounts are left. Create an admin, e.g. node scripts/createSystemAdmin.js");
        }
    },
});
