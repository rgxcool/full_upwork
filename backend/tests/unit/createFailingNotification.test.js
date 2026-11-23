import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Notification from "../../src/models/Notification.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

const { createFailingStudentNotification } = await import(
    "../../src/utils/createFailingNotification.js"
);

describe("createFailingStudentNotification", () => {
    let student;
    let course;

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
            Notification.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);

        student = await Student.create({
            name: "Test Elev",
            personalNumber: "19000101-0000",
            email: "test.elev@example.se",
        });

        course = await Course.create({
            courseName: "Engelska 5",
            courseCode: "ENG500",
        });
    });

    // #103: the grade lives on the student's enrollment in the course.
    const seedEducationGrade = async (grade) => {
        const instance = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: `ENG500-${grade}`,
            startDate: new Date("2026-01-12"),
            endDate: new Date("2026-03-20"),
        });
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: instance.startDate,
            endDate: instance.endDate,
            grade,
        });
    };

    it("does nothing when the student does not exist", async () => {
        await createFailingStudentNotification(
            new mongoose.Types.ObjectId().toString(),
            course._id.toString()
        );

        expect(await Notification.countDocuments()).toBe(0);
    });

    it("does nothing when the student has no enrollment in the course", async () => {
        await createFailingStudentNotification(
            student._id.toString(),
            course._id.toString()
        );

        expect(await Notification.countDocuments()).toBe(0);
    });

    it("does nothing when the course grade is not F", async () => {
        await seedEducationGrade("C");

        await createFailingStudentNotification(
            student._id.toString(),
            course._id.toString()
        );

        expect(await Notification.countDocuments()).toBe(0);
    });

    it("creates a failing_grade notification when the student has an F", async () => {
        await seedEducationGrade("F");

        await createFailingStudentNotification(
            student._id.toString(),
            course._id.toString()
        );

        const notification = await Notification.findOne({
            type: "failing_grade",
        }).lean();
        expect(notification).toBeTruthy();
        expect(notification.message).toContain("Test Elev");
        expect(notification.message).toContain("Engelska 5");
        expect(notification.meta.courseId.toString()).toBe(course._id.toString());
        expect(notification.meta.url).toBe(`/student/${student._id}`);
    });

    it("does not duplicate an unresolved failing_grade notification", async () => {
        await seedEducationGrade("F");

        await createFailingStudentNotification(
            student._id.toString(),
            course._id.toString()
        );
        await createFailingStudentNotification(
            student._id.toString(),
            course._id.toString()
        );

        expect(
            await Notification.countDocuments({ type: "failing_grade" })
        ).toBe(1);
    });

    it("logs an error instead of throwing when the student lookup fails", async () => {
        const logger = (await import("../../src/utils/logger.js")).default;

        await createFailingStudentNotification(
            "not-a-valid-object-id",
            course._id.toString()
        );

        expect(logger.error).toHaveBeenCalled();
    });
});