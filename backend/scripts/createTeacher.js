// Creates (or repairs) a teacher login on the LOCAL dev database so you can
// enter the system as a teacher. Safe to re-run: an existing account keeps its
// data, gets the "teacher" role and a Teacher profile if either is missing,
// and its password is reset to the one given.
//
// Usage (from backend/):
//   node scripts/createTeacher.js
//   node scripts/createTeacher.js --email larare2@example.se --name "Test Lärare 2" --password "Hemligt123!"
//   DRY_RUN=1 node scripts/createTeacher.js        # show what would happen
//
// Defaults: test.larare@example.se / Larare123! ("Test Lärare", subject Svenska).
// Refuses non-local databases (ALLOW_REMOTE_DB=1 to override), NODE_ENV=production,
// and machines without backend/.env.development (i.e. the production host).
import dotenv from "dotenv";
import path from "path";
import { parseArgs } from "util";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import { getNextAvailableColor } from "../src/utils/teacherProfile.js";
import { assertDevEnvironment, assertLocalMongoUri } from "./lib/dbReset.js";

export const DEFAULT_TEACHER = Object.freeze({
    email: "test.larare@example.se",
    name: "Test Lärare",
    password: "Larare123!",
    subject: "Svenska",
});


/**
 * Create or repair a teacher account. Returns what happened, for logging and tests.
 * The teacher profile lives on the User (#102), so `teacher` is the same document as `user`.
 * @returns {Promise<{ action: "created"|"updated"|"would-create"|"would-update", user, teacher, changes: string[] }>}
 */
export async function createTeacher(options = {}, { dryRun = false } = {}) {
    const email = String(options.email ?? DEFAULT_TEACHER.email).trim().toLowerCase();
    const name = options.name ?? DEFAULT_TEACHER.name;
    const password = options.password ?? DEFAULT_TEACHER.password;
    const subject = options.subject ?? DEFAULT_TEACHER.subject;

    let user = await User.findOne({ email });
    const changes = [];

    if (!user) {
        changes.push("create user", "create Teacher profile");
        if (dryRun) return { action: "would-create", user: null, teacher: null, changes };
        user = await User.create({
            name,
            username: name,
            email,
            password: await bcrypt.hash(password, 12),
            roles: ["teacher"],
            active: true,
            mustChangePassword: false,
        });
    } else {
        if (!user.roles.includes("teacher")) changes.push("add teacher role");
        if (user.active === false) changes.push("reactivate account");
        changes.push("reset password");
        if (!dryRun) {
            if (!user.roles.includes("teacher")) user.roles.push("teacher");
            user.active = true;
            user.mustChangePassword = false;
            user.password = await bcrypt.hash(password, 12);
            await user.save();
        }
    }

    const isNew = changes.includes("create user");
    const hasProfile = Boolean(user.teacherProfile);
    if (!hasProfile && !isNew) changes.push("create Teacher profile");
    if (dryRun) return { action: "would-update", user, teacher: hasProfile ? user : null, changes };

    if (!hasProfile) {
        user.teacherProfile = { subject, colorCode: await getNextAvailableColor() };
        await user.save();
    }

    return { action: isNew ? "created" : "updated", user, teacher: user, changes };
}

async function main() {
    const backendDir = path.resolve(import.meta.dirname, "..");
    dotenv.config({ path: assertDevEnvironment(backendDir), quiet: true });

    const { values } = parseArgs({
        options: {
            email: { type: "string" },
            name: { type: "string" },
            password: { type: "string" },
            subject: { type: "string" },
            "dry-run": { type: "boolean" },
        },
    });
    const dryRun = process.env.DRY_RUN === "1" || values["dry-run"] === true;
    const uri = process.env.MONGODB_URI;

    assertLocalMongoUri(uri, { allowRemote: process.env.ALLOW_REMOTE_DB === "1" });
    await mongoose.connect(uri);
    try {
        const result = await createTeacher(values, { dryRun });
        const email = (values.email ?? DEFAULT_TEACHER.email).toLowerCase();
        console.log(`${dryRun ? "🔎 DRY RUN — " : ""}Database "${mongoose.connection.db.databaseName}": ${result.action}`);
        console.log(`   Changes: ${result.changes.join(", ") || "none"}`);
        if (!dryRun) {
            console.log(`\n   Log in at http://localhost:5173 with`);
            console.log(`   E-post:   ${email}`);
            console.log(`   Lösenord: ${values.password ?? DEFAULT_TEACHER.password}`);
        }
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
