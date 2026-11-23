// #103 — create a StudentEnrollment for every legacy Student.education entry that
// has none, so StudentEnrollment can become the only source of a student's courses.
// Grade, grade lock and dropout status are carried over. Entries that cannot be
// matched safely (same course with other dates, unknown course, missing dates)
// are listed and left alone. Idempotent: a second run creates nothing.
//
// Run on every environment BEFORE deploying the #103 backend (after #102's
// migrateTeacherIntoUser.js).
// Usage (from backend/; uses MONGODB_URI from the environment or backend/.env.development):
//   DRY_RUN=1 node scripts/backfillEnrollmentsFromEducation.js   # report only
//   node scripts/backfillEnrollmentsFromEducation.js
// Exit code 1 when an entry could not be processed (see the ❌ lines).
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { backfillEnrollmentsFromEducation, formatEducationBackfillReport } from "./lib/educationBackfill.js";

async function main() {
    const backendDir = path.resolve(import.meta.dirname, "..");
    if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendDir, ".env.development"), quiet: true });
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set.");

    const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
    await mongoose.connect(uri);
    try {
        const dbName = mongoose.connection.db.databaseName;
        console.log(`${dryRun ? "🔎 DRY RUN — " : ""}backfillEnrollmentsFromEducation on "${dbName}"`);
        const report = await backfillEnrollmentsFromEducation({ dryRun });
        console.log(formatEducationBackfillReport(report));
        if (report.errors.length) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isDirectRun) {
    main().catch((error) => {
        console.error(`❌ ${error.message}`);
        process.exitCode = 1;
    });
}
