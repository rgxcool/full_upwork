/**
 * CLI wrapper shared by the reset scripts: loads backend/.env.<NODE_ENV>,
 * refuses non-local databases (ALLOW_REMOTE_DB=1 to override), requires
 * --yes for destructive runs (DRY_RUN=1 only reports), connects, runs the
 * action and prints a summary.
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { assertLocalMongoUri } from "./dbReset.js";

const BACKEND_DIR = path.resolve(import.meta.dirname, "..", "..");
export const UPLOADS_DIR = path.join(BACKEND_DIR, "public", "uploads");

export async function runReset({ title, action, requireYes = true, describe }) {
    const envFile =
        process.env.NODE_ENV === "production"
            ? ".env.production"
            : process.env.NODE_ENV === "test"
              ? ".env.test"
              : ".env.development";
    dotenv.config({ path: path.join(BACKEND_DIR, envFile), quiet: true });

    const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
    const yes = process.argv.includes("--yes");
    const uri = process.env.MONGODB_URI;

    try {
        assertLocalMongoUri(uri, { allowRemote: process.env.ALLOW_REMOTE_DB === "1" });
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exitCode = 1;
        return;
    }

    if (requireYes && !dryRun && !yes) {
        console.error(`❌ ${title} is destructive.\n${describe}\n\nRun with --yes to execute, or DRY_RUN=1 to preview.`);
        process.exitCode = 1;
        return;
    }

    let connected = false;
    try {
        await mongoose.connect(uri);
        connected = true;
        const dbName = mongoose.connection.db.databaseName;
        console.log(`${dryRun ? "🔎 DRY RUN — " : "🚨 "}${title} on database "${dbName}"`);
        await action(mongoose.connection.db, { dryRun, uploadsDir: UPLOADS_DIR });
        if (dryRun) console.log("\nNothing was deleted (dry run).");
    } catch (error) {
        console.error(`❌ ${title} failed:`, error);
        process.exitCode = 1;
    } finally {
        if (connected) await mongoose.disconnect();
    }
}
