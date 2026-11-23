// #126 — Apply pending database migrations (backend/migrations) and record
// them in the `migrations` collection. deploy.sh runs this on every deploy.
//
// Usage (from backend/):
//   node scripts/migrate.js            # apply pending migrations
//   node scripts/migrate.js status     # list applied and pending
//   DRY_RUN=1 node scripts/migrate.js  # list what would run, change nothing
// Env: NODE_ENV=production reads backend/.env.production, otherwise
// backend/.env.development. An exported MONGODB_URI always wins.
// Exit code 1 when a migration fails (it is not recorded; the next run retries it).
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { appliedMigrations, loadMigrations, pendingMigrations, runMigrations } from "../src/utils/migrations.js";

const BACKEND_DIR = path.resolve(import.meta.dirname, "..");

export async function main(argv = process.argv.slice(2)) {
    const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
    dotenv.config({ path: path.join(BACKEND_DIR, envFile), quiet: true });
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error(`MONGODB_URI is not set (looked in backend/${envFile}).`);

    const dryRun = process.env.DRY_RUN === "1" || argv.includes("--dry-run");
    // Migrations work on the native driver; never let model loading create collections.
    mongoose.set("autoCreate", false);
    mongoose.set("autoIndex", false);
    await mongoose.connect(uri);
    try {
        const db = mongoose.connection.db;
        const all = await loadMigrations();
        if (argv[0] === "status") {
            const applied = await appliedMigrations(db);
            const pending = await pendingMigrations(db, all);
            console.log(`Migrations on "${db.databaseName}": ${applied.length} applied, ${pending.length} pending`);
            for (const m of applied) console.log(`  ✓ ${m._id}  ${m.appliedAt.toISOString()}  ${m.description}`);
            for (const m of pending) console.log(`  … ${m.id}  pending  ${m.description}`);
            return;
        }
        const result = await runMigrations(db, { all, dryRun });
        if (dryRun) {
            console.log(result.pending.length ? `Would apply on "${db.databaseName}": ${result.pending.join(", ")}` : `No pending migrations on "${db.databaseName}".`);
        } else {
            console.log(result.applied.length ? `✅ Applied on "${db.databaseName}": ${result.applied.join(", ")}` : `✅ No pending migrations on "${db.databaseName}".`);
        }
    } finally {
        await mongoose.disconnect();
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isDirectRun) {
    main().catch((error) => {
        console.error(`❌ Migration failed: ${error.message}`);
        process.exitCode = 1;
    });
}
