// Removes ONLY the education catalog (programs, courses, course packages) so
// updateEducation.js can re-import it from the Excel workbook. This is what
// dropData.js used to do; launch.sh / launch_win.ps1 call this script.
//
// Usage (from backend/):
//   node scripts/dropEducation.js
//   DRY_RUN=1 node scripts/dropEducation.js   # preview counts
import { dropEducationCatalog, formatCounts } from "./lib/dbReset.js";
import { runReset } from "./lib/runReset.js";

runReset({
    title: "dropEducation (programs, courses, course packages)",
    requireYes: false,
    action: async (db, opts) => {
        const { deleted } = await dropEducationCatalog(db, opts);
        console.log(`${opts.dryRun ? "Would delete" : "Deleted"}:\n${formatCounts(deleted)}`);
    },
});
