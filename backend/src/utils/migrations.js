/**
 * Migration ledger (#126).
 *
 * Migrations live in backend/migrations/NNNN-short-name.js and export
 *   export const description = "What it changes";
 *   export async function up(db, { logger }) { ... }   // db: the native MongoDB Db
 *
 * Each database records what has run on it in the `migrations` collection
 * ({ _id: "0001-short-name", description, appliedAt, durationMs }), so every
 * environment catches up on its own, whatever git state it came from.
 *
 * Rules for a migration (see backend/migrations/README.md): idempotent, safe on
 * an empty database, additive (remove old fields in a LATER migration).
 */
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";

export const LEDGER = "migrations";
const LOCK_ID = "__lock";
const LOCK_TTL_MS = 30 * 60 * 1000;
const FILE_PATTERN = /^(\d{4})-[a-z0-9-]+\.js$/;

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "..", "..", "migrations");

/**
 * Load every migration file in `dir`, sorted by id.
 * @returns {Promise<Array<{ id: string, description: string, up: Function }>>}
 */
export async function loadMigrations(dir = MIGRATIONS_DIR) {
    let files;
    try {
        files = await fs.readdir(dir);
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
    const migrations = [];
    const numbers = new Set();
    for (const file of files.filter((f) => f.endsWith(".js")).sort()) {
        const match = FILE_PATTERN.exec(file);
        if (!match) throw new Error(`Migration file name must be NNNN-short-name.js: ${file}`);
        if (numbers.has(match[1])) throw new Error(`Two migrations share the number ${match[1]}`);
        numbers.add(match[1]);
        const mod = await import(pathToFileURL(path.join(dir, file)).href);
        if (typeof mod.up !== "function" || typeof mod.description !== "string") {
            throw new Error(`${file} must export \`description\` (string) and \`up(db)\``);
        }
        migrations.push({ id: file.replace(/\.js$/, ""), description: mod.description, up: mod.up });
    }
    return migrations;
}

/** Ledger entries of this database, oldest first. */
export async function appliedMigrations(db) {
    return db
        .collection(LEDGER)
        .find({ _id: { $ne: LOCK_ID } })
        .sort({ _id: 1 })
        .toArray();
}

/** Migrations in `all` that are not in the ledger yet, in order. */
export async function pendingMigrations(db, all) {
    const applied = new Set((await appliedMigrations(db)).map((m) => m._id));
    return all.filter((m) => !applied.has(m.id));
}

async function acquireLock(db, now) {
    const ledger = db.collection(LEDGER);
    // A lock older than the TTL belongs to a crashed run: take it over.
    await ledger.deleteOne({ _id: LOCK_ID, lockedAt: { $lt: new Date(now.getTime() - LOCK_TTL_MS) } });
    try {
        await ledger.insertOne({ _id: LOCK_ID, lockedAt: now, pid: process.pid });
    } catch (error) {
        if (error.code === 11000) {
            throw new Error("Another migration run holds the lock. Wait for it, or remove { _id: \"__lock\" } from the migrations collection if it crashed.");
        }
        throw error;
    }
}

/**
 * Apply every pending migration in order and record each one. Stops at the
 * first failure (it is not recorded, so the next run retries it).
 * @returns {Promise<{ applied: string[], pending: string[] }>} pending = what a dry run would apply
 */
export async function runMigrations(db, { all, dryRun = false, logger = console, now = () => new Date() } = {}) {
    const migrations = all ?? (await loadMigrations());
    const pending = await pendingMigrations(db, migrations);
    if (dryRun || pending.length === 0) {
        return { applied: [], pending: pending.map((m) => m.id) };
    }
    await acquireLock(db, now());
    const applied = [];
    try {
        for (const migration of pending) {
            const started = Date.now();
            logger.info?.(`▶ ${migration.id}: ${migration.description}`);
            await migration.up(db, { logger });
            await db.collection(LEDGER).insertOne({
                _id: migration.id,
                description: migration.description,
                appliedAt: now(),
                durationMs: Date.now() - started,
            });
            applied.push(migration.id);
        }
    } finally {
        await db.collection(LEDGER).deleteOne({ _id: LOCK_ID });
    }
    return { applied, pending: [] };
}
