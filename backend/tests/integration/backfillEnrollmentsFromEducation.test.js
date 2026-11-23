// #103 backfill: every legacy Student.education entry without an enrollment gets
// one through the placement path; grade/lock/dropout carried over; drift reported,
// not guessed. All documents are created through the real models.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    backfillEnrollmentsFromEducation,
    carriedOverFields,
    formatEducationBackfillReport,
} from "../../scripts/lib/educationBackfill.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const day = (iso) => new Date(`${iso}T12:00:00.000Z`);
let seq = 0;

async function createCourse(code) {
    return Course.create({ courseName: `Testkurs ${code}`, courseCode: code, coursePoints: "100", courseExtent: "10" });
}

// Legacy data: the schema no longer has `education`, so write it raw (#103).
async function createStudent(education, extra = {}) {
    seq++;
    const student = await Student.create({
        name: "Test Elev",
        email: `test.elev.${seq}@example.se`,
        personalNumber: "19000101-0000",
        ...extra,
    });
    await Student.collection.updateOne({ _id: student._id }, { $set: { education } });
    return student;
}

const courseEntry = (course, start, end, extra = {}) => ({
    type: "Course",
    refId: course._id,
    name: course.courseCode,
    startDate: day(start),
    endDate: day(end),
    ...extra,
});

describe("scripts/lib/educationBackfill", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);
    });

    it("dry run counts the missing enrollment and writes nothing", async () => {
        const course = await createCourse("BFDRY01");
        await createStudent([courseEntry(course, "2026-01-12", "2026-03-20")]);

        const report = await backfillEnrollmentsFromEducation({ dryRun: true });

        expect(report).toMatchObject({ students: 1, entries: 1, toCreate: 1, created: 0, matched: 0 });
        expect(await StudentEnrollment.countDocuments()).toBe(0);
        expect(await CourseInstance.countDocuments()).toBe(0);
    });

    it("creates the enrollment through the placement path; a second run changes nothing", async () => {
        const course = await createCourse("BFNEW01");
        const student = await createStudent([courseEntry(course, "2026-01-12", "2026-03-20")]);

        const first = await backfillEnrollmentsFromEducation({ dryRun: false });
        expect(first).toMatchObject({ toCreate: 1, created: 1, errors: [] });

        const [enrollment] = await StudentEnrollment.find({ studentId: student._id });
        expect(String(enrollment.mainCourseId)).toBe(String(course._id));
        expect(enrollment.startDate.toISOString().slice(0, 10)).toBe("2026-01-12");
        expect(enrollment.status).toBe("enrolled");
        expect(enrollment.courseInstanceId).toBeTruthy();

        const second = await backfillEnrollmentsFromEducation({ dryRun: false });
        expect(second).toMatchObject({ matched: 1, toCreate: 0, created: 0 });
        expect(await StudentEnrollment.countDocuments({ studentId: student._id })).toBe(1);
    });

    it("carries over grade and grade lock as a completed enrollment", async () => {
        const course = await createCourse("BFGRD01");
        const student = await createStudent([
            courseEntry(course, "2025-08-18", "2025-10-24", { grade: "C", locked: true }),
        ]);

        await backfillEnrollmentsFromEducation({ dryRun: false });

        const enrollment = await StudentEnrollment.findOne({ studentId: student._id }).lean();
        expect(enrollment).toMatchObject({ status: "completed", grade: "C", isGradeLocked: true });
        expect(enrollment.gradeDate.toISOString().slice(0, 10)).toBe("2025-10-24");
        expect(enrollment.statusHistory.at(-1)).toMatchObject({ status: "completed" });
    });

    it("keeps a dropout student a dropout and marks the new enrollment dropped", async () => {
        const course = await createCourse("BFDROP1");
        const student = await createStudent([courseEntry(course, "2026-01-12", "2026-03-20")], { dropout: true });

        await backfillEnrollmentsFromEducation({ dryRun: false });

        const enrollment = await StudentEnrollment.findOne({ studentId: student._id }).lean();
        expect(enrollment.status).toBe("dropped");
        // processStudentEducation would normally re-activate the student; the backfill must not.
        expect((await Student.findById(student._id).lean()).dropout).toBe(true);
    });

    it("does not duplicate an entry that already has an enrollment with the same start date", async () => {
        const course = await createCourse("BFHAS01");
        const student = await createStudent([courseEntry(course, "2026-01-12", "2026-03-20")]);
        const instance = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: "BFHAS01-1",
            startDate: day("2026-01-12"),
            endDate: day("2026-03-20"),
        });
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: day("2026-01-12"),
            endDate: day("2026-03-20"),
        });

        const report = await backfillEnrollmentsFromEducation({ dryRun: false });

        expect(report).toMatchObject({ matched: 1, toCreate: 0, created: 0 });
        expect(await StudentEnrollment.countDocuments()).toBe(1);
    });

    it("reports the same course with other dates instead of adding a second enrollment", async () => {
        const course = await createCourse("BFDIF01");
        const student = await createStudent([courseEntry(course, "2026-01-12", "2026-03-20")]);
        const instance = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: "BFDIF01-1",
            startDate: day("2026-02-02"),
            endDate: day("2026-04-10"),
        });
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: day("2026-02-02"),
            endDate: day("2026-04-10"),
        });

        const report = await backfillEnrollmentsFromEducation({ dryRun: false });

        expect(report.created).toBe(0);
        expect(report.ambiguous).toEqual([
            expect.objectContaining({ studentId: String(student._id), index: 0, reason: expect.stringContaining("2026-02-02") }),
        ]);
        expect(await StudentEnrollment.countDocuments()).toBe(1);
    });

    it("reports entries it cannot resolve and skips removed ones", async () => {
        const course = await createCourse("BFREM01");
        await createStudent([
            { type: "Course", name: "FINNS-INTE-99", startDate: day("2026-01-12"), endDate: day("2026-03-20") },
            courseEntry(course, "2026-01-12", "2026-03-20", { removedAt: day("2026-01-20") }),
            { type: "Course", refId: course._id, name: course.courseCode },
        ]);

        const report = await backfillEnrollmentsFromEducation({ dryRun: false });

        expect(report).toMatchObject({ entries: 3, removed: 1, toCreate: 0, created: 0 });
        expect(report.ambiguous.map((a) => a.reason)).toEqual([
            "no course matches the name",
            "missing start or end date",
        ]);
        expect(await StudentEnrollment.countDocuments()).toBe(0);
    });

    it("never puts student names or personnummer in the report", async () => {
        const course = await createCourse("BFGDPR1");
        await createStudent([{ type: "Course", name: "FINNS-INTE-98", startDate: day("2026-01-12"), endDate: day("2026-03-20") }]);
        await createStudent([courseEntry(course, "2026-01-12", "2026-03-20")]);

        const text = formatEducationBackfillReport(await backfillEnrollmentsFromEducation({ dryRun: true }));

        expect(text).not.toContain("Test Elev");
        expect(text).not.toContain("19000101-0000");
        expect(text).toContain("ambiguous (not touched):      1");
    });

    it("carriedOverFields: grade wins over dropout; nothing for an ungraded active student", () => {
        expect(carriedOverFields({ dropout: true }, { grade: "E", endDate: day("2026-01-01") })).toMatchObject({
            status: "completed",
            grade: "E",
            isGradeLocked: false,
        });
        expect(carriedOverFields({ dropout: true }, {})).toEqual({ status: "dropped" });
        expect(carriedOverFields({ dropout: false }, {})).toEqual({});
    });

    it("leaves other students' data alone when replaying one student's entry", async () => {
        const course = await createCourse("BFISO01");
        const other = await createStudent([], { dropout: true });
        await createStudent([courseEntry(course, "2026-01-12", "2026-03-20")]);

        await backfillEnrollmentsFromEducation({ dryRun: false });

        expect(await StudentEnrollment.countDocuments({ studentId: other._id })).toBe(0);
        expect((await Student.findById(other._id).lean()).dropout).toBe(true);
        expect(mongoose.connection.readyState).toBe(1);
    });
});
