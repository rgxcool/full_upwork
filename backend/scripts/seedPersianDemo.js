// Demo cast for showing the platform without importing anything: two teachers
// (Professor Cyrus, purple, and Magister Xerxes, his assistant teacher) and a court of
// Persian kings as students, spread over three real GY25 courses in different states:
//   - active in one or two ongoing kurskort (a deterministic "random" mix)
//   - NO education at all (to demo placing them on courses / course packages)
//   - ready to be graded (past Matematik 1A instance, no grade yet)
//   - avbrott (run through the app's own dropout service)
//   - warned for inactivity (warning recorded, withdrawal date ahead)
// plus one mall per course ("Persepolis-mall: …"); the two ongoing kurskort are built
// from theirs, Matematik 1A's is left for creating a new instance live,
// and a document Cyrus shares with Xerxes and posts on the kurskort anslagstavla.
//
// Only ADDS data. On a re-run it first removes what it created itself before (its own
// @example.se accounts and course instances marked "persian-demo"), nothing else.
// The courses must exist (GY25 catalog; launch.sh imports it on an empty database).
//
// Usage (from backend/):
//   node scripts/seedPersianDemo.js
//   DRY_RUN=1 node scripts/seedPersianDemo.js
// Logins: professor.cyrus@example.se / magister.xerxes@example.se / any king, e.g.
// kyros.akemenid@example.se. Password for all: Persepolis123!
// Refuses non-local databases, NODE_ENV=production and machines without .env.development.
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import Student from "../src/models/Student.js";
import Course from "../src/models/Course.js";
import CourseInstance from "../src/models/CourseInstance.js";
import CourseTemplate from "../src/models/CourseTemplate.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import Document from "../src/models/Document.js";
import Notification from "../src/models/Notification.js";
import { buildDefaultModules, cloneModules } from "../src/models/courseModuleSchema.js";
import { performStudentDropout } from "../src/services/dropoutService.js";
import CalendarEvent from "../src/models/Event.js";
import { assertDevEnvironment, assertLocalMongoUri } from "./lib/dbReset.js";

export const DEMO_MARKER = "persian-demo";
export const DEMO_PASSWORD = "Persepolis123!";
const DAY = 86400000;
const daysFromNow = (n, now) => new Date(now.getTime() + n * DAY);

/**
 * Instance dates exactly as the placement wizard produces them (UTC midnight,
 * start on a Monday, end = start + N weeks), so "+ Placera kurs" with the same
 * start date and length joins the seeded shared kurskort instead of creating a new one.
 */
export function mondayWeeksAgo(weeks, now) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - weeks * 7);
    return d;
}
const addWeeksUTC = (date, weeks) => new Date(date.getTime() + weeks * 7 * DAY);
/** Wednesday before the end date: the app's slutprov rule for stretched courses. */
const wednesdayBefore = (end) => {
    const d = new Date(end);
    let back = (d.getUTCDay() - 3 + 7) % 7;
    if (back === 0) back = 7;
    d.setUTCDate(d.getUTCDate() - back);
    return d;
};

export const TEACHERS = Object.freeze([
    { key: "cyrus", name: "Professor Cyrus", email: "professor.cyrus@example.se", subject: "Historia", colorCode: "#7B2CBF" },
    { key: "xerxes", name: "Magister Xerxes", email: "magister.xerxes@example.se", subject: "Svenska som andraspråk", colorCode: "#C9A227" },
]);

/** The courses the demo uses; they come from the GY25 catalog. */
export const DEMO_COURSES = Object.freeze({ sva: "SVEA1000X", eng: "ENGE1000X", mat: "MATE1A00X" });

/**
 * The court. `state`: active | none | grading | avbrott | warned. `teacher`: who is the
 * student's own (responsible) teacher. Kommuner match the client's real mix (no Stockholm).
 */
export const KINGS = Object.freeze([
    // Achaemenids
    { name: "Kyros Akemenid", state: "active", teacher: "cyrus", municipality: "Sollentuna" },
    { name: "Kambyses Akemenid", state: "active", teacher: "cyrus", municipality: "Upplands Väsby" },
    { name: "Dareios Akemenid", state: "grading", teacher: "cyrus", municipality: "Sollentuna" },
    { name: "Artaxerxes Akemenid", state: "active", teacher: "xerxes", municipality: "KCNO" },
    { name: "Bardiya Akemenid", state: "avbrott", teacher: "cyrus", municipality: "Botkyrka" },
    { name: "Arses Akemenid", state: "none", teacher: "cyrus", municipality: "Sollentuna" },
    { name: "Kodomannos Akemenid", state: "warned", teacher: "cyrus", municipality: "Upplands Väsby" },
    // Parthians (Arsakids)
    { name: "Arsakes Arsakid", state: "active", teacher: "cyrus", municipality: "Sigtuna" },
    { name: "Mithridates Arsakid", state: "grading", teacher: "cyrus", municipality: "Upplands Väsby" },
    { name: "Fraates Arsakid", state: "active", teacher: "xerxes", municipality: "Sollentuna" },
    { name: "Vologases Arsakid", state: "none", teacher: "xerxes", municipality: "Solna" },
    { name: "Artabanos Arsakid", state: "active", teacher: "cyrus", municipality: "KCNO" },
    // Sasanids
    { name: "Ardashir Sasanid", state: "active", teacher: "cyrus", municipality: "Sollentuna" },
    { name: "Shapur Sasanid", state: "grading", teacher: "xerxes", municipality: "Botkyrka" },
    { name: "Bahram Gur Sasanid", state: "active", teacher: "cyrus", municipality: "Upplands Väsby" },
    { name: "Kavad Sasanid", state: "warned", teacher: "xerxes", municipality: "Sollentuna" },
    { name: "Khosrow Anushirvan Sasanid", state: "active", teacher: "cyrus", municipality: "Upplands Väsby" },
    { name: "Hormizd Sasanid", state: "none", teacher: "cyrus", municipality: "KCNO" },
    { name: "Peroz Sasanid", state: "avbrott", teacher: "xerxes", municipality: "Sigtuna" },
    { name: "Yazdegerd Sasanid", state: "active", teacher: "xerxes", municipality: "Sollentuna" },
    // Later dynasties
    { name: "Ismail Safavid", state: "active", teacher: "cyrus", municipality: "Botkyrka" },
    { name: "Abbas Safavid", state: "none", teacher: "cyrus", municipality: "Upplands Väsby" },
    { name: "Nader Afshar", state: "active", teacher: "xerxes", municipality: "Sollentuna" },
    { name: "Karim Zand", state: "none", teacher: "cyrus", municipality: "Upplands Väsby" },
    { name: "Agha Mohammad Qajar", state: "active", teacher: "cyrus", municipality: "Solna" },
    { name: "Naser al-Din Qajar", state: "none", teacher: "xerxes", municipality: "Sollentuna" },
]);

const slug = (name) =>
    name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.|\.$/g, "");
export const kingEmail = (king) => {
    const parts = slug(king.name).split(".");
    return `${parts[0]}.${parts[parts.length - 1]}@example.se`;
};
// Born 1900: obviously fake personnummer, unique per king.
const kingPersonnummer = (i) =>
    `1900${String((i % 12) + 1).padStart(2, "0")}${String((i % 28) + 1).padStart(2, "0")}-${String(7000 + i)}`;

/** Small seeded PRNG so the "random" course mix is the same on every run. */
function mulberry32(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function allDemoEmails() {
    return [...TEACHERS.map((t) => t.email), ...KINGS.map(kingEmail)];
}

async function removeDemoFromCalendar(studentIds) {
    const ids = new Set(studentIds.map(String));
    const names = new Set(KINGS.map((k) => k.name));
    const isDemo = (s) => ids.has(String(s?._id)) || names.has(s?.name);
    const events = await CalendarEvent.find({
        $or: [{ "extendedProps.students._id": { $in: studentIds } }, { "extendedProps.students.name": { $in: [...names] } }],
    });
    let entries = 0;
    let deleted = 0;
    for (const event of events) {
        const before = event.extendedProps?.students || [];
        const remaining = before.filter((s) => !isDemo(s));
        entries += before.length - remaining.length;
        if (remaining.length === 0) {
            await CalendarEvent.deleteOne({ _id: event._id });
            deleted += 1;
        } else {
            event.extendedProps.students = remaining;
            event.markModified("extendedProps");
            await event.save();
        }
    }
    return { entries, deleted };
}

/** Remove everything a previous run of this script created, and nothing else. */
export async function removePreviousDemo() {
    const emails = allDemoEmails();
    const users = await User.find({ email: { $in: emails } }).select("_id").lean();
    const userIds = users.map((u) => u._id);
    const students = await Student.find({ email: { $in: emails } }).select("_id").lean();
    const studentIds = students.map((s) => s._id);
    const docs = await Document.find({ uploadedBy: { $in: userIds } }).select("filename").lean();
    // Teacher references hold the teacher's User id (#102).
    const teacherIds = userIds;
    const templateIds = (await CourseTemplate.find({ description: DEMO_MARKER }).select("_id").lean()).map((t) => t._id);
    // Seeded instances, plus any made live during a demo with Cyrus/Xerxes or a Persepolis mall.
    const instances = await CourseInstance.find({
        $or: [
            { notes: DEMO_MARKER },
            { responsibleTeacher: { $in: teacherIds } },
            { assistantTeacher: { $in: teacherIds } },
            { courseTemplateId: { $in: templateIds } },
        ],
    })
        .select("_id")
        .lean();
    const instanceIds = instances.map((i) => i._id);

    // Enrollments put the kings on slutprov calendar events. Take them off every
    // event, past ones included (the app's own helper keeps past events for real
    // attendance history, which fake kings don't need). Matching on the king names
    // as well catches entries left by an older run. Events left empty are deleted.
    const calendar = await removeDemoFromCalendar(studentIds);

    const removed = {
        enrollments: (await StudentEnrollment.deleteMany({ $or: [{ studentId: { $in: studentIds } }, { courseInstanceId: { $in: instanceIds } }] })).deletedCount,
        courseInstances: (await CourseInstance.deleteMany({ _id: { $in: instanceIds } })).deletedCount,
        // Only real Notification fields: studentId (Student) and teacher (User id).
        notifications: (await Notification.deleteMany({ $or: [{ studentId: { $in: studentIds } }, { teacher: { $in: teacherIds } }] })).deletedCount,
        documents: (await Document.deleteMany({ uploadedBy: { $in: userIds } })).deletedCount,
        templates: (await CourseTemplate.deleteMany({ _id: { $in: templateIds } })).deletedCount,
        calendarEntries: calendar.entries,
        calendarEventsDeleted: calendar.deleted,
        students: (await Student.deleteMany({ _id: { $in: studentIds } })).deletedCount,
        // Legacy rows from runs before #102 (the collection has no model any more).
        teachers: (await mongoose.connection.db.collection("teachers").deleteMany({ userId: { $in: userIds } })).deletedCount,
        users: (await User.deleteMany({ _id: { $in: userIds } })).deletedCount,
    };
    return { removed, files: docs.map((d) => d.filename) };
}

/**
 * Seed the demo. Returns a summary for logging and tests.
 * @param {{ now?: Date, uploadsDir?: string|null }} options  uploadsDir null = don't write files
 */
export async function seedPersianDemo({ now = new Date(), uploadsDir = null } = {}) {
    const courses = {};
    for (const [key, code] of Object.entries(DEMO_COURSES)) {
        courses[key] = await Course.findOne({ courseCode: code });
        if (!courses[key]) {
            throw new Error(`Course ${code} not found. Import the GY25 catalog first (node scripts/updateEducation.js).`);
        }
    }

    const previous = await removePreviousDemo();
    if (uploadsDir) {
        for (const f of previous.files) fs.rmSync(path.join(uploadsDir, f), { force: true });
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // ── Teachers ────────────────────────────────────────────
    const teacherUsers = {};
    const teachers = {};
    for (const t of TEACHERS) {
        teacherUsers[t.key] = await User.create({
            name: t.name,
            username: t.name,
            email: t.email,
            password: passwordHash,
            roles: ["teacher"],
            active: true,
            mustChangePassword: false,
            lastLoginAt: daysFromNow(-1, now),
            teacherProfile: { subject: t.subject, colorCode: t.colorCode, createdAt: now },
        });
        // The User is the teacher (#102).
        teachers[t.key] = teacherUsers[t.key];
    }
    const cyrusUser = teacherUsers.cyrus;

    // ── Mallar (one per course; Matematik's stays unused for the "new instance" demo) ──
    const MALL_NAMES = { sva: "Persepolis-mall: Svenska som andraspråk 1", eng: "Persepolis-mall: Engelska 1", mat: "Persepolis-mall: Matematik 1A" };
    const templates = {};
    for (const [key, course] of Object.entries(courses)) {
        const modules = buildDefaultModules().map((module) => ({
            ...module,
            sections: module.sections.map((section, si) => ({
                ...section,
                instructions:
                    section.instructions ||
                    `Modul ${module.moduleNumber}, avsnitt ${si + 1}: läs kapitlet och gör övningarna innan nästa lektion.`,
            })),
            assignment:
                module.moduleNumber === 1
                    ? { title: "Inlämningsuppgift 1 – Reflektion", description: "Skriv minst 150 ord om vad du har lärt dig i modulen." }
                    : module.assignment,
        }));
        templates[key] = await CourseTemplate.create({
            templateName: MALL_NAMES[key],
            courseId: course._id,
            courseCode: course.courseCode,
            description: DEMO_MARKER,
            modules,
            createdBy: cyrusUser._id,
            isActive: true,
        });
    }

    // ── Course instances (kurskort) ─────────────────────────
    // Instance code as the app generates it: course code + YY + MM (+ vN if taken).
    const instanceCode = async (course, startDate) => {
        const base = `${course.courseCode}${String(startDate.getUTCFullYear()).slice(-2)}${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`;
        let code = base;
        for (let v = 1; await CourseInstance.exists({ courseCode: code }); v += 1) code = `${base}v${v}`;
        return code;
    };

    const instance = async (course, startWeeksAgo, weeks, responsible, assistant, template, extra = {}) => {
        const startDate = mondayWeeksAgo(startWeeksAgo, now);
        const endDate = addWeeksUTC(startDate, weeks);
        return CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: await instanceCode(course, startDate),
            coursePoints: course.coursePoints,
            courseExtent: String(weeks),
            startDate,
            endDate,
            slutprovDate: wednesdayBefore(endDate),
            responsibleTeacher: responsible._id,
            assistantTeacher: assistant ? assistant._id : undefined,
            createdBy: cyrusUser._id,
            isActive: true,
            notes: DEMO_MARKER,
            courseTemplateId: template ? template._id : undefined,
            modules: cloneModules(template ? template.modules : buildDefaultModules()),
            ...extra,
        });
    };

    const svaNow = await instance(courses.sva, 3, 10, teachers.cyrus, teachers.xerxes, templates.sva, {
        activityFeed: [
            { id: new mongoose.Types.ObjectId(), text: "Välkomna till Svenska som andraspråk 1! Modul 1 är öppen, börja med läsuppgiften.", by: cyrusUser._id, at: daysFromNow(-20, now) },
            { id: new mongoose.Types.ObjectId(), text: "Påminnelse: inlämningsuppgift 1 ska vara inne på fredag. Magister Xerxes hjälper till på torsdagens handledning.", by: cyrusUser._id, at: daysFromNow(-3, now) },
        ],
    });
    const engNow = await instance(courses.eng, 2, 10, teachers.xerxes, teachers.cyrus, templates.eng);
    const matPast = await instance(courses.mat, 12, 10, teachers.cyrus, null, null);

    // ── Kings ───────────────────────────────────────────────
    const rand = mulberry32(546); // 546 BC: Cyrus takes Sardis
    const summary = { kings: 0, active: 0, none: 0, grading: 0, avbrott: 0, warned: 0, enrollments: 0 };
    const counts = new Map();
    const kingDocs = [];

    for (const [i, king] of KINGS.entries()) {
        const email = kingEmail(king);
        const ownTeacher = teachers[king.teacher];
        const lastLogin = king.state === "warned" ? daysFromNow(-16, now) : daysFromNow(-1, now);

        await User.create({
            name: king.name,
            username: king.name,
            email,
            password: passwordHash,
            roles: ["student"],
            active: true,
            mustChangePassword: false,
            lastLoginAt: king.state === "none" ? null : lastLogin,
        });
        const student = await Student.create({
            name: king.name,
            email,
            personalNumber: kingPersonnummer(i),
            phone: `070-000 70 ${String(i).padStart(2, "0")}`,
            municipality: king.municipality,
            teacherId: ownTeacher._id,
            aplStatus: "GRAY",
            lastLearningActivityAt: king.state === "warned" ? daysFromNow(-16, now) : king.state === "none" ? null : daysFromNow(-1, now),
        });

        // Which instances this king is on.
        let placements = [];
        if (king.state === "active") {
            const r = rand();
            placements = r < 0.4 ? [svaNow] : r < 0.75 ? [engNow] : [svaNow, engNow];
        } else if (king.state === "grading") {
            placements = rand() < 0.5 ? [matPast] : [matPast, svaNow];
        } else if (king.state === "avbrott" || king.state === "warned") {
            placements = [svaNow];
        }

        for (const inst of placements) {
            await StudentEnrollment.create({
                studentId: student._id,
                courseInstanceId: inst._id,
                mainCourseId: inst.mainCourseId,
                teacherId: ownTeacher._id,
                startDate: inst.startDate,
                endDate: inst.endDate,
                slutprovDate: inst.slutprovDate,
                status: "active",
                enrollmentDate: inst.startDate,
            });
            counts.set(String(inst._id), (counts.get(String(inst._id)) || 0) + 1);
            summary.enrollments += 1;
        }

        if (king.state === "warned") {
            // Same audit marker the manual and automatic warning paths write.
            student.changeHistory.push({
                timestamp: daysFromNow(-2, now),
                changedBy: cyrusUser._id,
                changedByRole: "teacher",
                changes: ["inactivity_warning_email"],
                newValues: { withdrawalDate: daysFromNow(7, now) },
            });
        }
        await student.save();

        if (king.state === "avbrott") {
            await performStudentDropout({ studentId: student._id, userId: cyrusUser._id, role: "teacher", reason: "Demo: avbrott" });
        }

        summary.kings += 1;
        summary[king.state] += 1;
        kingDocs.push(student);
    }

    for (const [id, n] of counts) await CourseInstance.updateOne({ _id: id }, { $set: { enrollmentCount: n } });

    // ── Shared document (Cyrus → Xerxes) ────────────────────
    const filename = `${DEMO_MARKER}-betygsunderlag.txt`;
    const content = "Betygsunderlag Svenska som andraspråk 1 (demo)\n\nDelat av Professor Cyrus med Magister Xerxes.\nInga riktiga elever.\n";
    if (uploadsDir) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, filename), content);
    }
    await Document.create({
        teacher: cyrusUser._id,
        uploadedBy: cyrusUser._id,
        sharedWith: [teacherUsers.xerxes._id],
        filename,
        originalName: "Betygsunderlag SVEA1000X.txt",
        type: "TEACHER_DOCUMENT",
        mimeType: "text/plain",
        size: Buffer.byteLength(content),
        fileType: "txt",
    });

    return {
        ...summary,
        removedFromPreviousRun: previous.removed,
        instances: { svaNow: svaNow._id, engNow: engNow._id, matPast: matPast._id },
        templates: Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, t._id])),
    };
}

async function main() {
    const backendDir = path.resolve(import.meta.dirname, "..");
    dotenv.config({ path: assertDevEnvironment(backendDir), quiet: true });
    const uri = process.env.MONGODB_URI;
    assertLocalMongoUri(uri, { allowRemote: process.env.ALLOW_REMOTE_DB === "1" });

    const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
    await mongoose.connect(uri);
    try {
        if (dryRun) {
            const existing = await User.countDocuments({ email: { $in: allDemoEmails() } });
            console.log(`🔎 DRY RUN — would (re)create 2 teachers and ${KINGS.length} kings; ${existing} demo accounts exist now and would be replaced.`);
            return;
        }
        const s = await seedPersianDemo({ uploadsDir: path.join(backendDir, "public", "uploads") });
        console.log(`👑 Persian demo ready on "${mongoose.connection.db.databaseName}"`);
        console.log(`   ${s.kings} kings: ${s.active} active, ${s.none} without courses, ${s.grading} ready to grade, ${s.avbrott} avbrott, ${s.warned} warned`);
        console.log(`   ${s.enrollments} enrollments over SVEA1000X (now), ENGE1000X (now), MATE1A00X (ended)`);
        console.log(`\n   Professor Cyrus:  professor.cyrus@example.se / ${DEMO_PASSWORD}`);
        console.log(`   Magister Xerxes:  magister.xerxes@example.se / ${DEMO_PASSWORD}`);
        console.log(`   Any king:         e.g. ${kingEmail(KINGS[0])} / ${DEMO_PASSWORD}`);
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
