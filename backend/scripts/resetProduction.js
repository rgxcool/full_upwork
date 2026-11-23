// #124 — Fresh start on the production host: empty ONLY Mindful Learning's
// collections, after a backup. The production MongoDB also runs another
// service and site; their data is never touched.
//
// What it does:
//   1. Lists the database's collections: ours (from src/models plus GridFS,
//      counters, the legacy teachers and the migration ledger) and unknown ones.
//   2. Stops if there are unknown collections, until someone has looked at them
//      (then pass --unknown-collections-checked; they are still never touched).
//   3. Backs up every collection it will empty (one .jsonl per collection,
//      Extended JSON) and copies public/uploads, into
//      ~/mindful-backups/reset-<database>-<time>/ (BACKUP_DIR to change).
//      If the backup fails (e.g. a full disk), nothing is deleted.
//   4. Empties our collections (indexes are kept) and deletes the upload files.
//
// Usage (from backend/ on the production host; reads backend/.env.production):
//   node scripts/resetProduction.js                                  # inventory only
//   node scripts/resetProduction.js --confirm=<database name>        # back up + empty
// Runbook (what to run afterwards): DEPLOYMENT.md, "Fresh start (#124)".
import dotenv from "dotenv";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import { formatCounts, ownCollectionNames, wipeOwnCollections } from "./lib/dbReset.js";

const BACKEND_DIR = path.resolve(import.meta.dirname, "..");
const MODELS_DIR = path.join(BACKEND_DIR, "src", "models");
const UPLOADS_DIR = path.join(BACKEND_DIR, "public", "uploads");

const argValue = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
};

export async function main() {
    const envFile = process.env.NODE_ENV === "test" ? ".env.test" : process.env.ENV_FILE || ".env.production";
    dotenv.config({ path: path.join(BACKEND_DIR, envFile), quiet: true });
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error(`MONGODB_URI is not set (looked in backend/${envFile}).`);

    const confirm = argValue("confirm");
    const allowForeign = process.argv.includes("--unknown-collections-checked");

    // Read-only until confirmed: loading the models must not create
    // collections or build indexes in the production database.
    mongoose.set("autoCreate", false);
    mongoose.set("autoIndex", false);
    await mongoose.connect(uri);
    try {
        const db = mongoose.connection.db;
        const dbName = db.databaseName;
        const execute = confirm !== null;
        if (execute && confirm !== dbName) {
            throw new Error(`--confirm must be the database name "${dbName}" (got "${confirm}"). Nothing was changed.`);
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupDir = process.env.BACKUP_DIR || path.join(os.homedir(), "mindful-backups", `reset-${dbName}-${stamp}`);

        console.log(`${execute ? "🚨 RESET" : "🔎 INVENTORY (nothing is changed)"} — database "${dbName}"`);
        const result = await wipeOwnCollections(db, {
            ownNames: await ownCollectionNames(MODELS_DIR),
            backupDir,
            uploadsDir: UPLOADS_DIR,
            allowForeign,
            dryRun: !execute,
        });

        console.log(`\nMindful Learning collections (documents):\n${formatCounts(result.own)}`);
        const foreign = Object.keys(result.foreign);
        if (foreign.length) {
            console.log(`\n⚠️  Collections Mindful Learning does NOT own — never touched:\n${foreign.map((n) => `  ${n.padEnd(28)} ${result.foreign[n]}`).join("\n")}`);
        }
        if (result.refused === "foreign") {
            console.log(
                "\n❌ Stopped: this database also holds collections Mindful Learning doesn't know (above)." +
                    "\n   Check that the other service does not use any of OUR collection names in this database." +
                    "\n   When you are sure, add --unknown-collections-checked. Nothing was changed."
            );
            process.exitCode = 1;
            return;
        }
        if (!execute) {
            console.log(`\nTo back up and empty the collections above:\n  node scripts/resetProduction.js --confirm=${dbName}${foreign.length ? " --unknown-collections-checked" : ""}`);
            return;
        }
        const mb = (result.backup.bytes / 1024 / 1024).toFixed(1);
        console.log(`\n💾 Backup: ${backupDir} (${mb} MB of documents${result.backup.uploads ? " + public/uploads" : ""})`);
        console.log(`🗑️  Deleted:\n${formatCounts(result.deleted)}\n   Upload files deleted: ${result.uploadFiles}`);
        console.log('\n✅ Done. Next steps: DEPLOYMENT.md, "Fresh start (#124)".');
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
