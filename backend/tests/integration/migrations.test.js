/**
 * Migration ledger (#126) against mongodb-memory-server. Migration files are
 * written to a temp directory by the test, like real ones in backend/migrations.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import {
    LEDGER,
    MIGRATIONS_DIR,
    appliedMigrations,
    loadMigrations,
    pendingMigrations,
    runMigrations,
} from "../../src/utils/migrations.js";

const quiet = { info: () => {} };
let db;
let dir;

const writeMigration = (file, body) => fs.writeFileSync(path.join(dir, file), body);

// Idempotent example: give courses without a language the default "sv".
const ADD_LANGUAGE = `
export const description = "Courses get a language";
export async function up(db) {
    await db.collection("courses").updateMany({ language: { $exists: false } }, { $set: { language: "sv" } });
}`;

describe("migration ledger (#126)", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        db = mongoose.connection.db;
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await db.dropDatabase();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
    });

    it("the repo's migrations all load (valid names, exports, unique numbers)", async () => {
        await expect(loadMigrations(MIGRATIONS_DIR)).resolves.toBeInstanceOf(Array);
    });

    it("applies pending migrations in order and records them", async () => {
        await db.collection("courses").insertMany([{ courseCode: "A" }, { courseCode: "B", language: "en" }]);
        writeMigration("0002-second.js", `export const description = "Second"; export async function up(db) { await db.collection("order").insertOne({ n: 2 }); }`);
        writeMigration("0001-add-language.js", ADD_LANGUAGE.replace("export async function up(db) {", `export async function up(db) { await db.collection("order").insertOne({ n: 1 });`));

        const result = await runMigrations(db, { all: await loadMigrations(dir), logger: quiet });

        expect(result.applied).toEqual(["0001-add-language", "0002-second"]);
        expect((await db.collection("order").find().sort({ _id: 1 }).toArray()).map((d) => d.n)).toEqual([1, 2]);
        expect((await db.collection("courses").find().sort({ courseCode: 1 }).toArray()).map((c) => c.language)).toEqual(["sv", "en"]);
        const ledger = await appliedMigrations(db);
        expect(ledger.map((m) => m._id)).toEqual(["0001-add-language", "0002-second"]);
        expect(ledger[0]).toMatchObject({ description: "Courses get a language" });
        expect(ledger[0].appliedAt).toBeInstanceOf(Date);
        expect(await db.collection(LEDGER).countDocuments({ _id: "__lock" })).toBe(0);
    });

    it("a second run applies nothing; a new migration runs on its own", async () => {
        writeMigration("0001-add-language.js", ADD_LANGUAGE);
        await runMigrations(db, { all: await loadMigrations(dir), logger: quiet });
        expect((await runMigrations(db, { all: await loadMigrations(dir), logger: quiet })).applied).toEqual([]);

        writeMigration("0002-later.js", `export const description = "Later"; export async function up() {}`);
        expect((await runMigrations(db, { all: await loadMigrations(dir), logger: quiet })).applied).toEqual(["0002-later"]);
    });

    it("stops at the first failure, records nothing for it and retries it next time", async () => {
        writeMigration("0001-ok.js", `export const description = "Ok"; export async function up() {}`);
        writeMigration("0002-broken.js", `export const description = "Broken"; export async function up() { throw new Error("boom"); }`);
        writeMigration("0003-after.js", `export const description = "After"; export async function up(db) { await db.collection("after").insertOne({}); }`);

        await expect(runMigrations(db, { all: await loadMigrations(dir), logger: quiet })).rejects.toThrow("boom");

        expect((await appliedMigrations(db)).map((m) => m._id)).toEqual(["0001-ok"]);
        expect(await db.collection("after").countDocuments()).toBe(0);
        expect(await db.collection(LEDGER).countDocuments({ _id: "__lock" })).toBe(0); // lock released
        expect((await pendingMigrations(db, await loadMigrations(dir))).map((m) => m.id)).toEqual(["0002-broken", "0003-after"]);
    });

    it("a dry run lists pending migrations and changes nothing", async () => {
        writeMigration("0001-add-language.js", ADD_LANGUAGE);
        await db.collection("courses").insertOne({ courseCode: "A" });

        const result = await runMigrations(db, { all: await loadMigrations(dir), dryRun: true, logger: quiet });

        expect(result).toEqual({ applied: [], pending: ["0001-add-language"] });
        expect((await db.collection("courses").findOne()).language).toBeUndefined();
        expect(await db.collection(LEDGER).countDocuments()).toBe(0);
    });

    it("refuses to run while another run holds the lock, and takes over a stale lock", async () => {
        writeMigration("0001-add-language.js", ADD_LANGUAGE);
        const all = await loadMigrations(dir);
        const now = new Date("2026-11-23T12:00:00Z");
        await db.collection(LEDGER).insertOne({ _id: "__lock", lockedAt: new Date(now.getTime() - 60 * 1000) });

        await expect(runMigrations(db, { all, logger: quiet, now: () => now })).rejects.toThrow(/lock/);
        expect(await appliedMigrations(db)).toEqual([]);

        // Two hours later the lock counts as crashed.
        const later = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        expect((await runMigrations(db, { all, logger: quiet, now: () => later })).applied).toEqual(["0001-add-language"]);
    });

    it("rejects badly named files, duplicate numbers and missing exports", async () => {
        writeMigration("1-bad.js", `export const description = "x"; export async function up() {}`);
        await expect(loadMigrations(dir)).rejects.toThrow(/NNNN-short-name/);

        fs.rmSync(path.join(dir, "1-bad.js"));
        writeMigration("0001-a.js", `export const description = "a"; export async function up() {}`);
        writeMigration("0001-b.js", `export const description = "b"; export async function up() {}`);
        await expect(loadMigrations(dir)).rejects.toThrow(/share the number 0001/);

        fs.rmSync(path.join(dir, "0001-b.js"));
        writeMigration("0002-no-up.js", `export const description = "no up";`);
        await expect(loadMigrations(dir)).rejects.toThrow(/must export/);
    });

    it("an empty or missing directory means nothing to do", async () => {
        expect(await loadMigrations(dir)).toEqual([]);
        expect(await loadMigrations(path.join(dir, "missing"))).toEqual([]);
        expect((await runMigrations(db, { all: [], logger: quiet })).applied).toEqual([]);
    });
});
