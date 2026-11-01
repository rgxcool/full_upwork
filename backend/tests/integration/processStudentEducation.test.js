import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import { recalculateStudentScheduleSummary } from "../../src/services/enrollmentService.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("processStudentEducation — course package studietakt (pace)", () => {
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

    it("persists the chosen pace on generated package enrollments and stretches durations", async () => {
        const student = await Student.create({
            name: "Pace Elev",
            personalNumber: "19990101-1111",
            email: "pace@elev.se",
        });

        const kurs1 = await Course.create({
            courseName: "Matematik 3",
            courseCode: "MAT300",
            courseExtent: "5",
            coursePoints: 100,
            isActive: true,
        });
        const kurs2 = await Course.create({
            courseName: "Fysik 1",
            courseCode: "FYS100",
            courseExtent: "5",
            coursePoints: 100,
            isActive: true,
        });

        const pkg = await CoursePackage.create({
            coursePackageName: "Pacepaketet",
            coursePackageCode: "PACE1",
            coursePackagePoints: "200",
            coursePackageExtent: "Termin",
            coursePackageCourses: [kurs1._id, kurs2._id],
        });

        const results = await CourseMatchingService.processStudentEducation(
            student._id.toString(),
            [
                {
                    type: "CoursePackage",
                    refId: pkg._id.toString(),
                    name: "PACE1",
                    startDate: "2026-09-21",
                },
            ],
            null,
            { pace: 50 }
        );

        expect(results.errors).toEqual([]);
        expect(results.enrollments).toHaveLength(2);

        const enrollments = await StudentEnrollment.find({
            studentId: student._id,
        }).sort({ startDate: 1 });

        expect(enrollments).toHaveLength(2);
        for (const enrollment of enrollments) {
            expect(enrollment.coursePackageId.toString()).toBe(pkg._id.toString());
            expect(enrollment.pace).toBe(50);

            // Each 5-week course at 50% speed runs 10 weeks
            const start = new Date(enrollment.startDate);
            const end = new Date(enrollment.endDate);
            const weeks = Math.round((end - start) / (7 * 24 * 60 * 60 * 1000));
            expect(weeks).toBe(10);
        }
    });

    it("keeps the default 100% pace when the option is omitted", async () => {
        const student = await Student.create({
            name: "FullFart Elev",
            personalNumber: "20000101-2222",
            email: "fullfart@elev.se",
        });

        const kurs = await Course.create({
            courseName: "Svenska 1",
            courseCode: "SVE100",
            courseExtent: "5",
            coursePoints: 100,
            isActive: true,
        });

        const pkg = await CoursePackage.create({
            coursePackageName: "Svenska-paketet",
            coursePackageCode: "SVE1",
            coursePackagePoints: "100",
            coursePackageExtent: "Termin",
            coursePackageCourses: [kurs._id],
        });

        const results = await CourseMatchingService.processStudentEducation(
            student._id.toString(),
            [
                {
                    type: "CoursePackage",
                    refId: pkg._id.toString(),
                    name: "SVE1",
                    startDate: "2026-09-21",
                },
            ],
            null,
            {}
        );

        expect(results.enrollments).toHaveLength(1);

        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
        });
        expect(enrollment.pace).toBe(100);

        const start = new Date(enrollment.startDate);
        const end = new Date(enrollment.endDate);
        const weeks = Math.round((end - start) / (7 * 24 * 60 * 60 * 1000));
        expect(weeks).toBe(5);
    });

    it("recalculates an individual course's dates and exam date when a pace is applied", async () => {
        const student = await Student.create({
            name: "Individuell Elev",
            personalNumber: "20010101-3333",
            email: "individuell@elev.se",
        });

        const course = await Course.create({
            courseName: "Engelska 5",
            courseCode: "ENG500",
            courseExtent: "5",
            coursePoints: 100,
            isActive: true,
        });

        const results = await CourseMatchingService.processStudentEducation(
            student._id.toString(),
            [
                {
                    type: "Course",
                    refId: course._id.toString(),
                    name: "ENG500",
                    // Spreadsheet dates describe the 100% plan. The pace must
                    // override them and also move the final exam.
                    startDate: "2026-09-21",
                    endDate: "2026-10-26",
                    slutprovDate: "2026-10-23",
                },
            ],
            null,
            { pace: 50, applyPace: true }
        );

        expect(results.errors).toEqual([]);
        expect(results.enrollments).toHaveLength(1);

        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
        });
        expect(enrollment.pace).toBe(50);

        const start = new Date(enrollment.startDate);
        const end = new Date(enrollment.endDate);
        const weeks = Math.round(
            (end - start) / (7 * 24 * 60 * 60 * 1000)
        );
        expect(weeks).toBe(10);

        // The stale spreadsheet date must not be kept.
        expect(new Date(enrollment.slutprovDate).getTime()).toBeGreaterThan(
            new Date("2026-10-26").getTime()
        );
        expect(new Date(enrollment.slutprovDate).getTime()).toBeLessThan(
            end.getTime()
        );
    });

    it("keeps explicit spreadsheet dates when no pace is applied", async () => {
        const student = await Student.create({
            name: "Explicit Elev",
            personalNumber: "20020101-4444",
            email: "explicit@elev.se",
        });

        const course = await Course.create({
            courseName: "Historia 1",
            courseCode: "HIS100",
            courseExtent: "5",
            coursePoints: 100,
            isActive: true,
        });

        await CourseMatchingService.processStudentEducation(
            student._id.toString(),
            [
                {
                    type: "Course",
                    refId: course._id.toString(),
                    name: "HIS100",
                    startDate: "2026-09-21",
                    endDate: "2026-10-26",
                    slutprovDate: "2026-10-23",
                },
            ],
            null,
            { pace: 50 }
        );

        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
        });
        expect(enrollment.pace).toBe(50);

        const start = new Date(enrollment.startDate);
        const end = new Date(enrollment.endDate);
        const weeks = Math.round(
            (end - start) / (7 * 24 * 60 * 60 * 1000)
        );
        expect(weeks).toBe(5);
        expect(new Date(enrollment.slutprovDate).toISOString().slice(0, 10)).toBe(
            "2026-10-23"
        );
    });

    it("refreshes the student's end and final exam dates from active enrollments", async () => {
        const student = await Student.create({
            name: "Sammanfattning Elev",
            personalNumber: "20030101-5555",
            email: "sammanfattning@elev.se",
            endDate: new Date("2020-01-01"),
            finalExamDate: new Date("2020-01-01"),
        });

        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: new mongoose.Types.ObjectId(),
            startDate: new Date("2026-09-21"),
            endDate: new Date("2026-11-30"),
            slutprovDate: new Date("2026-11-25"),
            status: "enrolled",
        });
        // Completed courses must not push the plan summary forward.
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: new mongoose.Types.ObjectId(),
            startDate: new Date("2027-01-01"),
            endDate: new Date("2028-01-01"),
            slutprovDate: new Date("2027-12-25"),
            status: "completed",
        });

        const summary = await recalculateStudentScheduleSummary(student._id);

        expect(summary.endDate.toISOString().slice(0, 10)).toBe("2026-11-30");
        expect(summary.finalExamDate.toISOString().slice(0, 10)).toBe(
            "2026-11-25"
        );

        const updated = await Student.findById(student._id);
        expect(new Date(updated.endDate).toISOString().slice(0, 10)).toBe(
            "2026-11-30"
        );
        expect(new Date(updated.finalExamDate).toISOString().slice(0, 10)).toBe(
            "2026-11-25"
        );
    });
});