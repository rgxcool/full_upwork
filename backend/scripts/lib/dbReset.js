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
 * Documents are deleted (deleteMany), collections are never dropped, so
 * indexes survive. Every function supports { dryRun: true }, which only
 * reports what would be deleted.
 */
import fs from "fs/promises";
import path from "path";

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
 *  - users with an admin/systemadmin role, their Teacher profiles and those
 *    teachers' schedule parameters,
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
        else if (name === "teacherscheduleparameters") filter = { teacherId: { $nin: keptTeacherIds } };
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
