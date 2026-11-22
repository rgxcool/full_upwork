// #102 — merge Teacher into User: copies each Teacher into `user.teacherProfile`
// and rewrites every Teacher id reference to the User id (see
// scripts/lib/teacherIntoUser.js for the list). Idempotent: a second run
// changes nothing. Does not delete the `teachers` collection.
//
// Run on every environment BEFORE starting the #102 backend.
// Usage (from backend/; uses MONGODB_URI from the environment or backend/.env):
//   DRY_RUN=1 node scripts/migrateTeacherIntoUser.js   # report only
//   node scripts/migrateTeacherIntoUser.js
// Exit code 1 when a reference could not be rewritten (see the ❌ lines).
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { migrateTeacherIntoUser, formatTeacherMigrationReport } from "./lib/teacherIntoUser.js";

async function main() {
    const backendDir = path.resolve(import.meta.dirname, "..");
    if (!process.env.MONGODB_URI) dotenv.config({ path: path.join(backendDir, ".env"), quiet: true });
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set.");

    const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
    await mongoose.connect(uri);
    try {
        const dbName = mongoose.connection.db.databaseName;
        console.log(`${dryRun ? "🔎 DRY RUN — " : ""}migrateTeacherIntoUser on "${dbName}"`);
        const report = await migrateTeacherIntoUser(mongoose.connection.db, { dryRun });
        console.log(formatTeacherMigrationReport(report, { dryRun }));
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
