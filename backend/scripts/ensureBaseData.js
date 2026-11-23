// Non-destructive first-run setup used by launch.sh. It never deletes or changes
// existing data:
//   - For each base role (admin, systemadmin, syv, specped) that has NO account yet,
//     it creates one dev account. Roles that already have an account are left alone.
//   - `--is-empty catalog|faq` only answers a question for launch.sh: exit code 0 when
//     that collection set is empty (so launch.sh imports it), 1 when it has data.
// Teachers and students are NOT created here: add them at runtime (the app, or
// scripts/createTeacher.js and scripts/importStudents.js).
//
// Usage (from backend/):
//   node scripts/ensureBaseData.js                  # create missing base accounts
//   DRY_RUN=1 node scripts/ensureBaseData.js        # only report
//   node scripts/ensureBaseData.js --is-empty catalog
// Refuses non-local databases (ALLOW_REMOTE_DB=1 to override), NODE_ENV=production,
// and machines without backend/.env.development (i.e. the production host).
import dotenv from "dotenv";
import path from "path";
import { parseArgs } from "util";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import { assertDevEnvironment, assertLocalMongoUri } from "./lib/dbReset.js";

export const BASE_ACCOUNTS = Object.freeze([
    { role: "systemadmin", email: "systemadmin@example.se", name: "Test Systemadmin", password: "Systemadmin123!" },
    { role: "admin", email: "admin@example.se", name: "Test Admin", password: "Admin123!" },
    { role: "syv", email: "syv@example.se", name: "Test SYV", password: "Syv123!" },
    { role: "specped", email: "specped@example.se", name: "Test Specialpedagog", password: "Specped123!" },
]);

const EMPTY_CHECKS = {
    catalog: ["programs", "courses", "coursepackages"],
    faq: ["faqs", "faqcategories"],
};

/** True when every collection in the named set has no documents. */
export async function isEmpty(db, what) {
    const collections = EMPTY_CHECKS[what];
    if (!collections) throw new Error(`Unknown set "${what}". Use: ${Object.keys(EMPTY_CHECKS).join(", ")}`);
    for (const name of collections) {
        if ((await db.collection(name).countDocuments({}, { limit: 1 })) > 0) return false;
    }
    return true;
}

/**
 * Create one dev account for each base role that has none. Never modifies existing users.
 * Also counts legacy users that only have the old `role` string.
 * @returns {Promise<Array<{ role: string, email: string, password: string, status: "created"|"exists"|"would-create" }>>}
 */
export async function ensureBaseAccounts({ dryRun = false } = {}) {
    const results = [];
    for (const account of BASE_ACCOUNTS) {
        const existing = await User.collection.countDocuments(
            { $or: [{ roles: account.role }, { role: account.role }] },
            { limit: 1 }
        );
        // An account with the same email but another role would collide on the unique email.
        const emailTaken = await User.collection.countDocuments({ email: account.email }, { limit: 1 });
        if (existing > 0 || emailTaken > 0) {
            results.push({ ...account, status: "exists" });
            continue;
        }
        if (!dryRun) {
            await User.create({
                name: account.name,
                username: account.name,
                email: account.email,
                password: await bcrypt.hash(account.password, 12),
                roles: [account.role],
                active: true,
                mustChangePassword: false,
            });
        }
        results.push({ ...account, status: dryRun ? "would-create" : "created" });
    }
    return results;
}

async function main() {
    const backendDir = path.resolve(import.meta.dirname, "..");
    dotenv.config({ path: assertDevEnvironment(backendDir), quiet: true });

    const { values } = parseArgs({ options: { "is-empty": { type: "string" }, "dry-run": { type: "boolean" } } });
    const dryRun = process.env.DRY_RUN === "1" || values["dry-run"] === true;
    const uri = process.env.MONGODB_URI;
    assertLocalMongoUri(uri, { allowRemote: process.env.ALLOW_REMOTE_DB === "1" });

    await mongoose.connect(uri);
    try {
        if (values["is-empty"]) {
            process.exitCode = (await isEmpty(mongoose.connection.db, values["is-empty"])) ? 0 : 1;
            return;
        }
        const results = await ensureBaseAccounts({ dryRun });
        for (const r of results) {
            const label = { created: "created", exists: "already has an account, left as is", "would-create": "would create" }[r.status];
            console.log(`   ${r.role.padEnd(12)} ${label}${r.status === "exists" ? "" : `: ${r.email} / ${r.password}`}`);
        }
    } finally {
        await mongoose.disconnect();
    }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename;
if (isDirectRun) {
    main().catch((error) => {
        console.error(`❌ ${error.message}`);
        process.exitCode = 2;
    });
}
