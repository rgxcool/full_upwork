/**
 * Shared, tested logic for the destructive dev-reset scripts:
 *   - scripts/dropData.js           → wipeEverything()
 *   - scripts/flushAllButAdmins.js  → flushAllButAdmins()
 *   - scripts/dropEducation.js      → dropEducationCatalog()
 *
 * Collections are DISCOVERED at runtime (listCollections), so new models are
 * covered automatically. flushAllButAdmins keeps an explicit allow-list of
 * education/content/config collections (KEEP_COLLECTIONS) and clears
 * everything else. When you add a new catalog-like model that must survive a
 * flush, add its collection name to KEEP_COLLECTIONS.
 *
 *   - scripts/resetProduction.js    → inventoryOwnCollections(), backupCollections(),
 *                                      wipeOwnCollections() (#124)
 *
 * Documents are deleted (deleteMany), collections are never dropped, so
 * indexes survive. Every function supports { dryRun: true }, which only
 * reports what would be deleted.
 */
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { BSON } from "mongodb";
import mongoose from "mongoose";

/** Education, content and configuration that a flush must not touch. */
export const KEEP_COLLECTIONS = Object.freeze([
    // Education catalog
    "programs",
    "courses",
    "coursepackages",
    "courseTemplates", // kursmallar
    "gradingscales",
    // Content libraries
    "questions", // question bank
    "question_bank_pdfs",
    "faqs",
    "faqcategories",
    "formquestions", // handlingsplan question set (ActionPlanQuestions)
    // Configuration
    "certificatesettings",
    "certificatetemplates",
    "counters", // certificate numbering; keeping it prevents number reuse
]);

/** Collections handled specially by flushAllButAdmins (partial keep). */
const PARTIAL_COLLECTIONS = new Set([
    "users",
    "teachers",
    "teacherscheduleparameters",
    "fs.files",
    "fs.chunks",
]);

export const ADMIN_ROLES = Object.freeze(["admin", "systemadmin"]);

/** Education catalog removed by dropEducation.js before a re-import. */
export const EDUCATION_CATALOG_COLLECTIONS = Object.freeze(["programs", "courses", "coursepackages"]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "mongo", "mongodb", "host.docker.internal"]);

/**
 * Refuse to run against anything but a local database unless explicitly
 * allowed. CLAUDE.md: only the local dev DB may be used.
 */
export function assertLocalMongoUri(uri, { allowRemote = false } = {}) {
    if (!uri) throw new Error("MONGODB_URI is not set.");
    if (allowRemote) return;
    if (uri.startsWith("mongodb+srv://")) {
        throw new Error("Refusing to run against a mongodb+srv (Atlas) URI. Set ALLOW_REMOTE_DB=1 to override.");
    }
    const hostPart = uri.replace(/^mongodb:\/\//, "").split("/")[0].split("@").pop();
    const hosts = hostPart.split(",").map((h) => h.replace(/^\[|\](:\d+)?$/g, "").split(":")[0]);
    const remote = hosts.filter((h) => !LOCAL_HOSTS.has(h));
    if (remote.length) {
        throw new Error(`Refusing to run against non-local host(s): ${remote.join(", ")}. Set ALLOW_REMOTE_DB=1 to override.`);
    }
}

/**
 * Dev-only scripts (fixed test passwords) must never run on the production host,
 * where MongoDB is ALSO on localhost, so assertLocalMongoUri alone cannot tell.
 * Requires NODE_ENV != production and an existing backend/.env.development.
 * @returns {string} path of the env file to load
 */
export function assertDevEnvironment(backendDir) {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to run a dev script with NODE_ENV=production.");
    }
    const envFile = path.join(backendDir, process.env.NODE_ENV === "test" ? ".env.test" : ".env.development");
    if (!fsSync.existsSync(envFile)) {
        throw new Error(`${path.basename(envFile)} not found. Dev scripts only run on a development machine.`);
    }
    return envFile;
}

const userCollections = async (db) =>
    (await db.listCollections({}, { nameOnly: true }).toArray())
        .map((c) => c.name)
        .filter((name) => !name.startsWith("system."))
        .sort();

async function clear(db, name, filter, { dryRun }) {
    const col = db.collection(name);
    const count = await col.countDocuments(filter);
    if (!dryRun && count > 0) await col.deleteMany(filter);
    return count;
}

/** Delete the disk files of the given Document records from public/uploads. */
async function deleteUploadFiles(docs, uploadsDir, { dryRun }) {
    let deleted = 0;
    if (!uploadsDir) return deleted;
    const root = path.resolve(uploadsDir);
    for (const doc of docs) {
        const name = doc?.filename;
        if (!name) continue;
        if (path.basename(name) !== name) {
            throw new Error(`Unsafe upload filename on document ${doc._id}`);
        }
        const file = path.resolve(root, name);
        if (path.dirname(file) !== root) {
            throw new Error(`Upload path is outside the uploads directory: ${doc._id}`);
        }
        if (dryRun) {
            deleted++;
            continue;
        }
        try {
            await fs.unlink(file);
            deleted++;
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw new Error(`Failed to delete upload for document ${doc._id}: ${error.message}`, { cause: error });
            }
        }
    }
    return deleted;
}

/**
 * dropData: empty EVERY collection (users and admins included), GridFS too,
 * and delete the disk files of every Document. Run an admin-create script
 * afterwards (e.g. scripts/createSystemAdmin.js) to be able to log in.
 */
export async function wipeEverything(db, { dryRun = false, uploadsDir } = {}) {
    const docs = (await db.listCollections({ name: "documents" }).toArray()).length
        ? await db.collection("documents").find({}, { projection: { filename: 1 } }).toArray()
        : [];
    const uploadFiles = await deleteUploadFiles(docs, uploadsDir, { dryRun });

    const deleted = {};
    for (const name of await userCollections(db)) {
        deleted[name] = await clear(db, name, {}, { dryRun });
    }
    return { deleted, uploadFiles };
}

/**
 * flushAllButAdmins: clear all people and activity data, keep
 *  - KEEP_COLLECTIONS (education catalog, content, config),
 *  - users with an admin/systemadmin role (incl. their teacher profile on the
 *    User, #102), their schedule parameters and any legacy `teachers` rows,
 *  - GridFS files still referenced by kept config (certificate logo/signature).
 */
export async function flushAllButAdmins(db, { dryRun = false, uploadsDir } = {}) {
    const names = await userCollections(db);
    const has = (n) => names.includes(n);

    const keptUsers = has("users")
        ? await db
              .collection("users")
              .find(
                  { $or: [{ roles: { $in: ADMIN_ROLES } }, { role: { $in: ADMIN_ROLES } }] },
                  { projection: { _id: 1 } }
              )
              .toArray()
        : [];
    const keptUserIds = keptUsers.map((u) => u._id);

    const keptTeachers = has("teachers")
        ? await db
              .collection("teachers")
              .find({ userId: { $in: keptUserIds } }, { projection: { _id: 1 } })
              .toArray()
        : [];
    const keptTeacherIds = keptTeachers.map((t) => t._id);

    // GridFS files referenced by kept configuration.
    const keptFileIds = [];
    for (const name of ["certificatesettings", "certificatetemplates"]) {
        if (!has(name)) continue;
        for (const doc of await db.collection(name).find({}).toArray()) {
            const collect = (value) => {
                if (!value || typeof value !== "object") return;
                for (const [key, v] of Object.entries(value)) {
                    if (/FileId$/.test(key) && v) keptFileIds.push(v);
                    else if (v && typeof v === "object" && !(v instanceof Date)) collect(v);
                }
            };
            collect(doc);
        }
    }

    const docs = has("documents")
        ? await db.collection("documents").find({}, { projection: { filename: 1 } }).toArray()
        : [];
    const uploadFiles = await deleteUploadFiles(docs, uploadsDir, { dryRun });

    const deleted = {};
    const kept = {};
    for (const name of names) {
        if (KEEP_COLLECTIONS.includes(name)) {
            kept[name] = await db.collection(name).countDocuments({});
            continue;
        }
        let filter = {};
        if (name === "users") filter = { _id: { $nin: keptUserIds } };
        else if (name === "teachers") filter = { _id: { $nin: keptTeacherIds } };
        // teacherId is a User id after #102, a Teacher id on a not-yet-migrated DB.
        else if (name === "teacherscheduleparameters") filter = { teacherId: { $nin: [...keptUserIds, ...keptTeacherIds] } };
        else if (name === "fs.files") filter = { _id: { $nin: keptFileIds } };
        else if (name === "fs.chunks") filter = { files_id: { $nin: keptFileIds } };
        deleted[name] = await clear(db, name, filter, { dryRun });
        if (PARTIAL_COLLECTIONS.has(name)) {
            kept[name] = await db.collection(name).countDocuments(dryRun ? { $nor: [filter] } : {});
        }
    }
    return { deleted, kept, uploadFiles };
}

/** dropEducation: remove only the education catalog before a re-import. */
export async function dropEducationCatalog(db, { dryRun = false } = {}) {
    const names = await userCollections(db);
    const deleted = {};
    for (const name of EDUCATION_CATALOG_COLLECTIONS) {
        if (names.includes(name)) deleted[name] = await clear(db, name, {}, { dryRun });
    }
    return { deleted };
}

/** Pretty-print a { name: count } map, skipping zeroes. */
export function formatCounts(counts) {
    const rows = Object.entries(counts).filter(([, n]) => n > 0);
    if (!rows.length) return "  (nothing)";
    return rows.map(([name, n]) => `  ${name.padEnd(28)} ${n}`).join("\n");
}

// ─── Production reset (#124) ────────────────────────────────────────────────
// The production MongoDB also holds another service's data. These functions
// only ever touch collections that Mindful Learning owns.

/** Collections Mindful Learning owns that have no Mongoose model. */
export const EXTRA_OWN_COLLECTIONS = Object.freeze([
    "fs.files", // GridFS (uploaded files, PDFs)
    "fs.chunks",
    "counters", // certificate numbering (services/certificateService.js)
    "teachers", // legacy, merged into users by #102
    "migrations", // migration ledger
]);

/**
 * Names of every collection Mindful Learning owns: one per Mongoose model in
 * src/models, plus EXTRA_OWN_COLLECTIONS.
 * @param {string} modelsDir - absolute path of backend/src/models
 * @returns {Promise<Set<string>>}
 */
export async function ownCollectionNames(modelsDir) {
    const files = (await fs.readdir(modelsDir)).filter((f) => f.endsWith(".js"));
    for (const file of files) await import(path.join(modelsDir, file));
    const names = Object.values(mongoose.models).map((m) => m.collection.collectionName);
    return new Set([...names, ...EXTRA_OWN_COLLECTIONS]);
}

/**
 * Split the database's collections into ours and unknown, with counts.
 * @returns {Promise<{ own: Record<string, number>, foreign: Record<string, number> }>}
 */
export async function inventoryOwnCollections(db, ownNames) {
    const own = {};
    const foreign = {};
    for (const name of await userCollections(db)) {
        const n = await db.collection(name).estimatedDocumentCount();
        if (ownNames.has(name)) own[name] = n;
        else foreign[name] = n;
    }
    return { own, foreign };
}

/**
 * Export collections to <dir>/<name>.jsonl (canonical Extended JSON, one
 * document per line), and copy uploadsDir to <dir>/uploads when it exists.
 * Throws on any write error (e.g. a full disk), so callers can abort first.
 * @returns {Promise<{ documents: Record<string, number>, bytes: number, uploads: boolean }>}
 */
export async function backupCollections(db, names, dir, { uploadsDir } = {}) {
    await fs.mkdir(dir, { recursive: true });
    const documents = {};
    let bytes = 0;
    for (const name of names) {
        const file = path.join(dir, `${name}.jsonl`);
        const handle = await fs.open(file, "w");
        let n = 0;
        try {
            for await (const doc of db.collection(name).find({})) {
                const line = BSON.EJSON.stringify(doc, { relaxed: false }) + "\n";
                await handle.write(line);
                bytes += Buffer.byteLength(line);
                n++;
            }
        } finally {
            await handle.close();
        }
        documents[name] = n;
    }
    let uploads = false;
    if (uploadsDir && fsSync.existsSync(uploadsDir)) {
        await fs.cp(uploadsDir, path.join(dir, "uploads"), { recursive: true });
        uploads = true;
    }
    await fs.writeFile(
        path.join(dir, "MANIFEST.json"),
        JSON.stringify({ database: db.databaseName, createdAt: new Date().toISOString(), documents, uploads }, null, 2)
    );
    return { documents, bytes, uploads };
}

/**
 * Empty only the collections Mindful Learning owns, after a backup.
 * Unknown collections are never touched, and while any exist nothing is
 * deleted unless allowForeign is set (someone has checked them).
 * @param {object} db
 * @param {object} opts
 * @param {Set<string>} opts.ownNames - from ownCollectionNames()
 * @param {string} [opts.backupDir] - required unless dryRun
 * @param {string} [opts.uploadsDir] - backed up, then the disk files of Documents are deleted
 * @param {boolean} [opts.allowForeign]
 * @param {boolean} [opts.dryRun]
 */
export async function wipeOwnCollections(db, { ownNames, backupDir, uploadsDir, allowForeign = false, dryRun = false }) {
    const { own, foreign } = await inventoryOwnCollections(db, ownNames);
    const result = { own, foreign, deleted: {}, backup: null, uploadFiles: 0, refused: null };
    if (Object.keys(foreign).length && !allowForeign) {
        result.refused = "foreign";
        return result;
    }
    if (dryRun) return result;
    if (!backupDir) throw new Error("backupDir is required");

    // Backup first. If it fails (e.g. disk full) nothing has been deleted.
    result.backup = await backupCollections(db, Object.keys(own), backupDir, { uploadsDir });

    const docs = own.documents !== undefined
        ? await db.collection("documents").find({}, { projection: { filename: 1 } }).toArray()
        : [];
    result.uploadFiles = await deleteUploadFiles(docs, uploadsDir, { dryRun: false });
    for (const name of Object.keys(own)) {
        result.deleted[name] = (await db.collection(name).deleteMany({})).deletedCount;
    }
    return result;
}
