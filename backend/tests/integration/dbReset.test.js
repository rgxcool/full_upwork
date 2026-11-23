/**
 * Dev reset scripts (scripts/lib/dbReset.js) against mongodb-memory-server.
 * Never touches the dev database. Data is created through the real models.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import mongoose from "mongoose";
import { BSON } from "mongodb";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import {
    KEEP_COLLECTIONS,
    assertLocalMongoUri,
    dropEducationCatalog,
    flushAllButAdmins,
    ownCollectionNames,
    wipeEverything,
    wipeOwnCollections,
} from "../../scripts/lib/dbReset.js";
import { giveTeacherProfile } from "../helpers/teacherFixture.js";

const modelsDir = path.resolve(import.meta.dirname, "../../src/models");

let db;
let uploadsDir;

const count = (name) => db.collection(name).countDocuments({});

async function seed() {
    const User = mongoose.model("User");
    const Student = mongoose.model("Student");
    const Course = mongoose.model("Course");
    const CourseInstance = mongoose.model("CourseInstance");
    const StudentEnrollment = mongoose.model("StudentEnrollment");
    const Document = mongoose.model("Document");

    const admin = await User.create({ name: "Test Admin", email: "admin@test.invalid", password: "x".repeat(12), roles: ["admin"] });
    const sysadmin = await User.create({ name: "Test Sys", email: "sys@test.invalid", password: "x".repeat(12), roles: ["systemadmin"] });
    const adminTeacherUser = await User.create({ name: "Test AdminLärare", email: "al@test.invalid", password: "x".repeat(12), roles: ["admin", "teacher"] });
    const teacherUser = await User.create({ name: "Test Lärare", email: "t@test.invalid", password: "x".repeat(12), roles: ["teacher"] });
    await User.create({ name: "Test Elev", email: "e@test.invalid", password: "x".repeat(12), roles: ["student"] });
    // Legacy shape: role string only.
    await db.collection("users").insertOne({ name: "Legacy Sys", email: "legacy@test.invalid", role: "systemadmin" });

    const keptTeacher = await giveTeacherProfile(adminTeacherUser._id, { subject: "Svenska" });
    const goneTeacher = await giveTeacherProfile(teacherUser._id, { subject: "Matte" });
    // Legacy Teacher rows, as on a database the #102 migration has not run on yet.
    const legacyKept = new mongoose.Types.ObjectId();
    await db.collection("teachers").insertMany([
        { _id: legacyKept, userId: adminTeacherUser._id, subject: "Svenska" },
        { userId: teacherUser._id, subject: "Matte" },
    ]);
    await db.collection("teacherscheduleparameters").insertMany([
        { teacherId: keptTeacher._id, courseId: new mongoose.Types.ObjectId(), lengthWeeks: 5 },
        { teacherId: goneTeacher._id, courseId: new mongoose.Types.ObjectId(), lengthWeeks: 10 },
    ]);

    const course = await Course.create({ courseName: "Svenska 1", courseCode: "SVESVE01" });
    await db.collection("programs").insertOne({ name: "Vård" });
    await db.collection("coursepackages").insertOne({ coursePackageName: "Vårdpaket" });
    await db.collection("courseTemplates").insertOne({ templateName: "Svenska 1 – Kursmall", courseId: course._id });
    await db.collection("faqs").insertOne({ question: "Hur?", answer: "Så." });
    await db.collection("counters").insertOne({ _id: "certificate-2026", seq: 42 });

    const student = await Student.create({ name: "Test Elev", email: "e@test.invalid", personalNumber: "19000101-0000" });
    const instance = await CourseInstance.create({
        mainCourseId: course._id,
        courseName: "Svenska 1",
        courseCode: "SVESVE01",
        startDate: new Date("2026-01-05"),
        endDate: new Date("2026-02-09"),
    });
    await StudentEnrollment.create({
        studentId: student._id,
        courseInstanceId: instance._id,
        courseName: "Svenska 1",
        mainCourseId: course._id,
        municipalityName: "Huddinge",
        startDate: new Date("2026-01-05"),
        endDate: new Date("2026-02-09"),
    });
    await db.collection("notifications").insertOne({ type: "x", message: "hej" });
    await db.collection("brand_new_feature_data").insertOne({ studentId: student._id }); // future type

    // GridFS: one config file (certificate logo) and one student upload.
    const logoId = new mongoose.Types.ObjectId();
    const studentFileId = new mongoose.Types.ObjectId();
    await db.collection("fs.files").insertMany([
        { _id: logoId, filename: "logo.png" },
        { _id: studentFileId, filename: "cv.pdf", metadata: { studentId: String(student._id) } },
    ]);
    await db.collection("fs.chunks").insertMany([
        { files_id: logoId, n: 0, data: "x" },
        { files_id: studentFileId, n: 0, data: "y" },
    ]);
    await db.collection("certificatesettings").insertOne({ key: "default", branding: { logoFileId: logoId } });

    // Disk upload referenced by a Document.
    fs.writeFileSync(path.join(uploadsDir, "123-elev.pdf"), "pdf");
    await Document.create({ student: student._id, filename: "123-elev.pdf", originalName: "elev.pdf", type: "GENERAL" });

    return { admin, sysadmin, adminTeacherUser, keptTeacher, legacyKept, logoId };
}

describe("dev reset scripts (dbReset)", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        db = mongoose.connection.db;
        // Register every model, like the app does.
        for (const file of fs.readdirSync(modelsDir).filter((f) => f.endsWith(".js"))) {
            await import(path.join(modelsDir, file));
        }
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await db.dropDatabase();
        uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dbreset-uploads-"));
    });

    it("every KEEP_COLLECTIONS entry is a real model collection (no typos / renamed models)", () => {
        const modelCollections = new Set(
            Object.values(mongoose.models).map((m) => m.collection.collectionName)
        );
        modelCollections.add("counters"); // created ad hoc by certificateService
        const unknown = KEEP_COLLECTIONS.filter((name) => !modelCollections.has(name));
        expect(unknown).toEqual([]);
    });

    describe("flushAllButAdmins", () => {
        it("keeps admins, their teacher profiles, the catalog and config files; clears the rest", async () => {
            const { keptTeacher, legacyKept, logoId } = await seed();

            await flushAllButAdmins(db, { uploadsDir });

            const users = await db.collection("users").find({}).toArray();
            expect(users.map((u) => u.email).sort()).toEqual(
                ["admin@test.invalid", "al@test.invalid", "legacy@test.invalid", "sys@test.invalid"]
            );
            const kept = users.find((u) => String(u._id) === String(keptTeacher._id));
            expect(kept.teacherProfile.subject).toBe("Svenska");
            const teachers = await db.collection("teachers").find({}).toArray();
            expect(teachers.map((t) => String(t._id))).toEqual([String(legacyKept)]);
            expect(await count("teacherscheduleparameters")).toBe(1);

            for (const name of ["programs", "courses", "coursepackages", "courseTemplates", "faqs", "counters", "certificatesettings"]) {
                expect(await count(name)).toBe(1);
            }

            for (const name of ["students", "courseInstances", "studentEnrollments", "notifications", "documents", "brand_new_feature_data"]) {
                expect(await count(name)).toBe(0);
            }

            const files = await db.collection("fs.files").find({}).toArray();
            expect(files.map((f) => String(f._id))).toEqual([String(logoId)]);
            expect(await db.collection("fs.chunks").countDocuments({ files_id: logoId })).toBe(1);
            expect(await count("fs.chunks")).toBe(1);

            expect(fs.existsSync(path.join(uploadsDir, "123-elev.pdf"))).toBe(false);
        });

        it("dry run reports but deletes nothing", async () => {
            await seed();
            const before = await count("students");
            const result = await flushAllButAdmins(db, { dryRun: true, uploadsDir });
            expect(result.deleted.students).toBe(before);
            expect(result.deleted.users).toBe(2);
            expect(result.kept.users).toBe(4);
            expect(await count("students")).toBe(before);
            expect(fs.existsSync(path.join(uploadsDir, "123-elev.pdf"))).toBe(true);
        });
    });

    describe("wipeEverything (dropData)", () => {
        it("empties every collection, admins and GridFS included, and deletes upload files", async () => {
            await seed();
            const result = await wipeEverything(db, { uploadsDir });
            expect(result.uploadFiles).toBe(1);
            const names = (await db.listCollections().toArray()).map((c) => c.name);
            for (const name of names) {
                expect(await count(name), name).toBe(0);
            }
            expect(fs.existsSync(path.join(uploadsDir, "123-elev.pdf"))).toBe(false);
        });

        it("keeps indexes (collections are emptied, not dropped)", async () => {
            await seed();
            const before = (await db.collection("studentEnrollments").indexes()).length;
            await wipeEverything(db, { uploadsDir });
            expect((await db.collection("studentEnrollments").indexes()).length).toBe(before);
        });
    });

    describe("dropEducationCatalog (dropEducation)", () => {
        it("removes only programs, courses and course packages", async () => {
            await seed();
            await dropEducationCatalog(db);
            for (const name of ["programs", "courses", "coursepackages"]) expect(await count(name)).toBe(0);
            expect(await count("courseTemplates")).toBe(1);
            expect(await count("users")).toBe(6);
            expect(await count("students")).toBe(1);
        });
    });

    describe("wipeOwnCollections (production reset, #124)", () => {
        // Another service's data in the same database must never be touched.
        const insertForeign = () => db.collection("other_site_pages").insertOne({ slug: "hem" });
        let backupDir;
        beforeEach(() => {
            backupDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dbreset-backup-")), "backup");
        });

        it("knows every model collection plus GridFS, counters, teachers and the ledger", async () => {
            const own = await ownCollectionNames(modelsDir);
            for (const name of ["students", "users", "studentEnrollments", "fs.files", "fs.chunks", "counters", "teachers", "migrations"]) {
                expect(own.has(name)).toBe(true);
            }
            expect(own.has("other_site_pages")).toBe(false);
        });

        it("stops while unknown collections exist, and changes nothing", async () => {
            await seed();
            await insertForeign();
            const before = await count("students");

            const result = await wipeOwnCollections(db, { ownNames: await ownCollectionNames(modelsDir), backupDir, uploadsDir });

            expect(result.refused).toBe("foreign");
            expect(Object.keys(result.foreign).sort()).toEqual(["brand_new_feature_data", "other_site_pages"]);
            expect(await count("students")).toBe(before);
            expect(fs.existsSync(backupDir)).toBe(false);
        });

        it("a dry run changes nothing", async () => {
            await seed();
            const result = await wipeOwnCollections(db, {
                ownNames: await ownCollectionNames(modelsDir), backupDir, uploadsDir, allowForeign: true, dryRun: true,
            });
            expect(result.own.students).toBe(1);
            expect(await count("students")).toBe(1);
            expect(fs.existsSync(backupDir)).toBe(false);
        });

        it("backs up, then empties only our collections; unknown ones survive", async () => {
            await seed();
            await insertForeign();
            const studentId = (await db.collection("students").findOne({}))._id;

            const result = await wipeOwnCollections(db, {
                ownNames: await ownCollectionNames(modelsDir), backupDir, uploadsDir, allowForeign: true,
            });

            // Ours are empty (indexes kept), theirs untouched.
            for (const name of ["students", "users", "studentEnrollments", "fs.files", "fs.chunks", "counters", "teachers", "documents"]) {
                expect({ name, n: await count(name) }).toEqual({ name, n: 0 });
            }
            expect(await count("other_site_pages")).toBe(1);
            expect(await count("brand_new_feature_data")).toBe(1);
            // Emptied, not dropped: the collections (and their indexes) remain.
            expect(await db.listCollections({ name: "students" }).toArray()).toHaveLength(1);

            // The backup holds the deleted data, with types intact (Extended JSON).
            const lines = fs.readFileSync(path.join(backupDir, "students.jsonl"), "utf8").trim().split("\n");
            expect(lines).toHaveLength(1);
            expect(BSON.EJSON.parse(lines[0], { relaxed: false })._id.equals(studentId)).toBe(true);
            expect(fs.existsSync(path.join(backupDir, "uploads", "123-elev.pdf"))).toBe(true);
            expect(JSON.parse(fs.readFileSync(path.join(backupDir, "MANIFEST.json"), "utf8")).documents.students).toBe(1);
            expect(fs.existsSync(path.join(backupDir, "other_site_pages.jsonl"))).toBe(false);
            // Personal data: owner-only directory and files.
            const mode = (p) => fs.statSync(p).mode & 0o777;
            expect(mode(backupDir)).toBe(0o700);
            expect(mode(path.join(backupDir, "students.jsonl"))).toBe(0o600);
            expect(mode(path.join(backupDir, "MANIFEST.json"))).toBe(0o600);
            expect(mode(path.join(backupDir, "uploads"))).toBe(0o700);
            expect(mode(path.join(backupDir, "uploads", "123-elev.pdf"))).toBe(0o600);
            // Upload files on disk are gone after the backup.
            expect(fs.existsSync(path.join(uploadsDir, "123-elev.pdf"))).toBe(false);
            expect(result.uploadFiles).toBe(1);
        });

        it("deletes nothing when the backup cannot be written", async () => {
            await seed();
            const blocked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dbreset-blocked-")), "file");
            fs.writeFileSync(blocked, "not a directory");

            await expect(
                wipeOwnCollections(db, {
                    ownNames: await ownCollectionNames(modelsDir),
                    backupDir: path.join(blocked, "backup"),
                    uploadsDir,
                    allowForeign: true,
                })
            ).rejects.toThrow();
            expect(await count("students")).toBe(1);
            expect(fs.existsSync(path.join(uploadsDir, "123-elev.pdf"))).toBe(true);
        });
    });

    describe("assertLocalMongoUri", () => {
        it.each([
            "mongodb://localhost:27017/mindfullearning",
            "mongodb://127.0.0.1:27017/x",
            "mongodb://user:pw@mongo:27017/x?authSource=admin",
        ])("allows %s", (uri) => expect(() => assertLocalMongoUri(uri)).not.toThrow());

        it.each([
            "mongodb+srv://cluster0.example.net/x",
            "mongodb://db.example.com:27017/x",
            "mongodb://localhost:27017,prod.example.com:27017/x",
        ])("refuses %s", (uri) => expect(() => assertLocalMongoUri(uri)).toThrow(/Refusing/));

        it("allows a remote host only when explicitly overridden", () => {
            expect(() => assertLocalMongoUri("mongodb://db.example.com/x", { allowRemote: true })).not.toThrow();
        });
    });
});
