// #102 migration: Teacher → User.teacherProfile and every Teacher id reference
// rewritten to the User id. Documents are created through the real models; the
// legacy `teachers` rows are inserted raw because that collection has no model
// any more after #102.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import ActionPlan from "../../src/models/ActionPlan.js";
import CompletionEvent from "../../src/models/CompletionEvent.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import ExamAttendance from "../../src/models/ExamAttendance.js";
import Grade from "../../src/models/Grade.js";
import GradeCatalog from "../../src/models/GradeCatalog.js";
import Notification from "../../src/models/Notification.js";
import Provning from "../../src/models/Provning.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import TeacherScheduleParameters from "../../src/models/TeacherScheduleParameters.js";
import CalendarEvent from "../../src/models/Event.js";
import User from "../../src/models/User.js";
import {
    migrateTeacherIntoUser,
    formatTeacherMigrationReport,
    TEACHER_REFERENCES,
} from "../../scripts/lib/teacherIntoUser.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const oid = () => new mongoose.Types.ObjectId();
const day = (iso) => new Date(`${iso}T12:00:00.000Z`);

let db;

async function createUser(name, extra = {}) {
    return User.create({
        username: name,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.se`,
        password: "x",
        roles: ["teacher"],
        ...extra,
    });
}

async function insertTeacher(userId, extra = {}) {
    const _id = oid();
    await db.collection("teachers").insertOne({
        _id,
        userId,
        subject: "Svenska",
        colorCode: "#3cb44b",
        phoneNumbers: ["070-000 00 00"],
        createdAt: day("2025-01-15"),
        updatedAt: day("2025-01-15"),
        ...extra,
    });
    return _id;
}

/** One document in every referencing collection, pointing at `teacherId`. */
async function createReferences(teacherId) {
    const student = await Student.create({
        name: "Test Elev",
        email: `test.elev.${String(teacherId)}@example.se`,
        personalNumber: "19000101-0000",
        teacherId,
        examHistory: [
            { examDate: day("2026-05-06"), courseName: "Testkurs", teacherId },
            { examDate: day("2026-06-03"), courseName: "Annan kurs", teacherId: oid() },
        ],
    });
    const course = oid();
    const instance = await CourseInstance.create({
        mainCourseId: course,
        courseName: "Testkurs",
        courseCode: `TEST${String(teacherId).slice(-4)}`,
        startDate: day("2026-09-07"),
        endDate: day("2026-11-16"),
        slutprovDate: day("2026-11-11"),
        responsibleTeacher: teacherId,
        assistantTeacher: teacherId,
    });
    await StudentEnrollment.create({
        studentId: student._id,
        courseInstanceId: instance._id,
        startDate: day("2026-09-07"),
        endDate: day("2026-11-16"),
        teacherId,
    });
    await ActionPlan.create({ studentId: student._id, educationId: "e1", teacherId });
    await CompletionEvent.create({
        idempotencyKey: `k-${String(teacherId)}`,
        studentId: student._id,
        completionType: "course",
        teacherId,
    });
    await ExamAttendance.create({
        examDate: day("2026-11-11"),
        courseName: "Testkurs",
        teacherId,
        studentId: student._id,
        studentName: "Test Elev",
        personalNumber: "19000101-0000",
    });
    await Grade.create({ studentId: student._id, courseId: course, teacherId });
    await GradeCatalog.create({ title: "Katalog", filename: "katalog.pdf", teacherId });
    await Notification.create({ type: "grades_pending", teacher: teacherId });
    await Provning.create({ teacherId });
    await TeacherScheduleParameters.create({ teacherId, courseId: "TEST", lengthWeeks: 10 });
    await CalendarEvent.create({ title: "Slutprov", extendedProps: { teacherId } });
    return { student, instance };
}

/** Values of every reference path, flattened (examHistory: first entry). */
async function referenceValues() {
    const out = {};
    for (const ref of TEACHER_REFERENCES) {
        const docs = await db.collection(ref.collection).find({}).toArray();
        const get = (doc) => {
            const base = ref.array ? doc[ref.array]?.[0] : doc;
            return ref.path.split(".").reduce((v, k) => v?.[k], base);
        };
        out[`${ref.collection}.${ref.array ? `${ref.array}.` : ""}${ref.path}`] = docs.map((d) => String(get(d)));
    }
    return out;
}

describe("migrateTeacherIntoUser", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        db = mongoose.connection.db;
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await mongoose.connection.db.dropDatabase();
    });

    it("copies the profile and rewrites every reference to the User id", async () => {
        const user = await createUser("Test Lärare");
        const teacherId = await insertTeacher(user._id);
        const { student } = await createReferences(teacherId);
        const otherExamTeacher = String(student.examHistory[1].teacherId);

        const report = await migrateTeacherIntoUser(db);

        expect(report.profilesCopied).toBe(1);
        expect(report.errors).toEqual([]);
        for (const n of Object.values(report.references)) expect(n).toBe(1);

        const migrated = await User.findById(user._id).lean();
        expect(migrated.teacherProfile).toEqual({
            subject: "Svenska",
            colorCode: "#3cb44b",
            phoneNumbers: ["070-000 00 00"],
            createdAt: day("2025-01-15"),
        });

        const values = await referenceValues();
        for (const [path, ids] of Object.entries(values)) {
            expect(ids, path).toEqual([String(user._id)]);
        }
        // Only the matching examHistory entry is rewritten.
        const s = await Student.findById(student._id).lean();
        expect(String(s.examHistory[1].teacherId)).toBe(otherExamTeacher);
        // The Teacher row itself stays until the collection is dropped.
        expect(await db.collection("teachers").countDocuments()).toBe(1);
    });

    it("dry run reports counts and changes nothing", async () => {
        const user = await createUser("Test Lärare");
        const teacherId = await insertTeacher(user._id);
        await createReferences(teacherId);
        const before = await referenceValues();

        const report = await migrateTeacherIntoUser(db, { dryRun: true });

        expect(report.profilesCopied).toBe(1);
        expect(report.references["courseInstances.responsibleTeacher"]).toBe(1);
        expect(report.references["students.examHistory[].teacherId"]).toBe(1);
        expect(await referenceValues()).toEqual(before);
        expect((await User.findById(user._id).lean()).teacherProfile).toBeUndefined();
        expect(formatTeacherMigrationReport(report, { dryRun: true })).toContain("would match");
    });

    it("is idempotent: a second run changes nothing", async () => {
        const user = await createUser("Test Lärare");
        await createReferences(await insertTeacher(user._id));

        await migrateTeacherIntoUser(db);
        const after = await referenceValues();
        const second = await migrateTeacherIntoUser(db);

        expect(second.profilesCopied).toBe(0);
        expect(second.profilesAlreadyPresent).toBe(1);
        expect(Object.values(second.references).every((n) => n === 0)).toBe(true);
        expect(await referenceValues()).toEqual(after);
    });

    it("rewrites Teacher ids stored as strings in calendar payloads", async () => {
        const user = await createUser("Test Lärare");
        const teacherId = await insertTeacher(user._id);
        await db.collection("calendar_events").insertOne({ title: "Gammalt", extendedProps: { teacherId: String(teacherId) } });

        await migrateTeacherIntoUser(db);

        const ev = await db.collection("calendar_events").findOne({ title: "Gammalt" });
        expect(String(ev.extendedProps.teacherId)).toBe(String(user._id));
        expect(ev.extendedProps.teacherId).toBeInstanceOf(mongoose.Types.ObjectId);
    });

    it("leaves values that already are User ids alone", async () => {
        const user = await createUser("Test Lärare");
        await insertTeacher(user._id);
        const unrelated = await createUser("Annan Användare", { roles: ["admin"] });
        await Notification.create({ type: "info", teacher: unrelated._id });

        await migrateTeacherIntoUser(db);

        const n = await Notification.findOne({ type: "info" }).lean();
        expect(String(n.teacher)).toBe(String(unrelated._id));
    });

    it("reports Teacher docs without a User and merges duplicates", async () => {
        const user = await createUser("Test Lärare");
        const first = await insertTeacher(user._id, { createdAt: day("2024-01-01") });
        const second = await insertTeacher(user._id, { subject: "Matematik", createdAt: day("2025-06-01") });
        const orphan = await insertTeacher(oid());
        await Student.create({ name: "Elev A", email: "elev.a@example.se", personalNumber: "19000101-0000", teacherId: second });
        await Student.create({ name: "Elev B", email: "elev.b@example.se", personalNumber: "19000101-0000", teacherId: orphan });

        const report = await migrateTeacherIntoUser(db);

        expect(report.orphanTeachers).toEqual([String(orphan)]);
        expect(report.orphanReferences).toEqual({ "students.teacherId": 1 });
        expect(report.duplicateTeachers).toEqual([{ teacherId: String(second), userId: String(user._id) }]);
        expect((await User.findById(user._id).lean()).teacherProfile.subject).toBe("Svenska"); // oldest wins
        expect(String((await Student.findOne({ name: "Elev A" }).lean()).teacherId)).toBe(String(user._id));
        expect(String((await Student.findOne({ name: "Elev B" }).lean()).teacherId)).toBe(String(orphan));
        expect(first).toBeDefined();
        const text = formatTeacherMigrationReport(report);
        expect(text).toContain("without a User");
        expect(text).toContain("ids merged");
    });

    it("reports a unique-index clash instead of failing the whole run", async () => {
        const user = await createUser("Test Lärare");
        const a = await insertTeacher(user._id, { createdAt: day("2024-01-01") });
        const b = await insertTeacher(user._id, { createdAt: day("2025-01-01") });
        await TeacherScheduleParameters.syncIndexes(); // dropDatabase removed the unique index
        await TeacherScheduleParameters.create({ teacherId: a, courseId: "TEST", lengthWeeks: 10 });
        await TeacherScheduleParameters.create({ teacherId: b, courseId: "TEST", lengthWeeks: 10 });

        const report = await migrateTeacherIntoUser(db);

        expect(report.errors).toHaveLength(1);
        expect(report.errors[0].reference).toBe("teacherscheduleparameters.teacherId");
        expect(formatTeacherMigrationReport(report)).toContain("❌");
        // Other collections were still processed.
        expect(report.references["students.teacherId"]).toBe(0);
    });
});
