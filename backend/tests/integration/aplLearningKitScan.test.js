/**
 * APL-lärkit scan (#35) against real models (mongodb-memory-server).
 *
 * Fails on the old code:
 *  - ensureStartedAplLearningKits re-read the stale .lean() student after
 *    issuing, so it always reported 0 created
 *  - idempotency was by title, so a renamed kit led to a second kit
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    ensureAplLearningKit,
    ensureStartedAplLearningKits,
    APL_LEARNING_KIT_KIND,
} from "../../src/services/aplService.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

// External side channel only; the scan itself runs unmocked.
vi.mock("../../src/services/emailService.js", () => ({
    sendEmail: vi.fn().mockResolvedValue(true),
}));

const NOW = new Date("2026-06-15T12:00:00");

// #103: the APL period comes from the student's package course enrollments.
let seq = 0;
const makeStudent = async (name, email, packageStart, extra = {}) => {
    seq++;
    const student = await Student.create({
        name,
        email,
        personalNumber: "19000101-0000",
        municipality: { type: "Sollentuna" },
        ...extra,
    });
    const pkg = await CoursePackage.create({
        coursePackageName: "Vård- och omsorgspaket",
        coursePackageCode: `VOO${seq}`,
        coursePackagePoints: "400",
        coursePackageExtent: "Termin",
    });
    const course = await Course.create({ courseName: "Vård och omsorg", courseCode: `VARVAR${seq}` });
    const endDate = new Date("2026-12-18");
    const instance = await CourseInstance.create({
        mainCourseId: course._id,
        courseName: course.courseName,
        courseCode: `VARVAR${seq}-1`,
        startDate: packageStart,
        endDate,
    });
    await StudentEnrollment.create({
        studentId: student._id,
        courseInstanceId: instance._id,
        mainCourseId: course._id,
        coursePackageId: pkg._id,
        startDate: packageStart,
        endDate,
    });
    return student;
};

describe("ensureStartedAplLearningKits (real models)", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);
    });

    it("reports the number of kits it actually created, then 0 on a re-run", async () => {
        await makeStudent("Test Elev Ett", "ett@test.invalid", new Date("2026-06-01"));
        await makeStudent("Test Elev Två", "tva@test.invalid", new Date("2026-06-15"));
        await makeStudent("Test Elev Senare", "senare@test.invalid", new Date("2026-09-01"));

        expect(await ensureStartedAplLearningKits(NOW)).toBe(2);

        const students = await Student.find({}).lean();
        const kits = (email) =>
            students.find((s) => s.email === email).logbook.filter((k) => k.kind === APL_LEARNING_KIT_KIND);
        expect(kits("ett@test.invalid")).toHaveLength(1);
        expect(kits("tva@test.invalid")).toHaveLength(1);
        expect(kits("senare@test.invalid")).toHaveLength(0);

        // Idempotent.
        expect(await ensureStartedAplLearningKits(NOW)).toBe(0);
        const again = await Student.findOne({ email: "ett@test.invalid" }).lean();
        expect(again.logbook).toHaveLength(1);
    });

    it("does not issue a second kit after the kit title is renamed", async () => {
        await makeStudent("Test Elev", "elev@test.invalid", new Date("2026-06-01"));
        expect(await ensureStartedAplLearningKits(NOW)).toBe(1);

        await Student.updateOne(
            { email: "elev@test.invalid" },
            { $set: { "logbook.0.title": "Mitt APL-kit (omdöpt)" } }
        );

        expect(await ensureStartedAplLearningKits(NOW)).toBe(0);
        const student = await Student.findOne({ email: "elev@test.invalid" }).lean();
        expect(student.logbook).toHaveLength(1);
        expect(student.logbook[0].title).toBe("Mitt APL-kit (omdöpt)");
    });

    it("recognises a legacy title-only kit and backfills the marker", async () => {
        await makeStudent("Test Legacy", "legacy@test.invalid", new Date("2026-06-01"), {
            logbook: [
                {
                    id: new mongoose.Types.ObjectId(),
                    title: "APL-lärkit",
                    description: "Utfärdat före kind-markören",
                    status: "active",
                },
            ],
        });

        // The scan recognises the legacy kit: nothing new is issued.
        expect(await ensureStartedAplLearningKits(NOW)).toBe(0);

        // The direct path (used when an APL record is created) tags it.
        const { _id } = await Student.findOne({ email: "legacy@test.invalid" }).lean();
        await ensureAplLearningKit(_id, { now: NOW });
        const student = await Student.findById(_id).lean();
        expect(student.logbook).toHaveLength(1);
        expect(student.logbook[0].kind).toBe(APL_LEARNING_KIT_KIND);
        expect(student.logbook[0].description).toBe("Utfärdat före kind-markören");
    });
});
