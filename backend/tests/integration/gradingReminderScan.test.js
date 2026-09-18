import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import Notification from "../../src/models/Notification.js";
import NOTIFICATION_TYPES from "../../src/controllers/notificationTypes.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { runGradingReminderScan } from "../../src/services/gradingReminderScan.js";

const dayMs = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * dayMs);
const daysAhead = (days) => new Date(Date.now() + days * dayMs);

describe("Grading Reminder Scan", () => {
    let teacherRecord;
    let student;
    let course;
    let instance;

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
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            User.deleteMany({}),
            Teacher.deleteMany({}),
            Notification.deleteMany({}),
        ]);

        const teacherUser = await User.create({
            email: "karin@larare.se",
            password: "hashed-placeholder",
            roles: ["teacher"],
        });

        teacherRecord = await Teacher.create({
            userId: teacherUser._id,
            subject: "Matematik",
        });

        student = await Student.create({
            name: "Anna Svensson",
            personalNumber: "19950101-1234",
            email: "anna@elev.se",
            teacherId: teacherRecord._id,
        });

        course = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAT101",
        });

        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: daysAgo(60),
            endDate: daysAhead(60),
            courseName: course.courseName,
            courseCode: course.courseCode,
        });
    });

    const createEnrollment = (overrides = {}) =>
        StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: daysAgo(60),
            endDate: daysAgo(3),
            status: "active",
            ...overrides,
        });

    describe("scan behavior", () => {
        it("creates a notification when endDate is within the window, grade null, not locked", async () => {
            await createEnrollment();

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(1);
            expect(summary.created).toBe(1);
            expect(summary.skipped).toBe(0);

            const notification = await Notification.findOne({
                type: NOTIFICATION_TYPES.GRADES_PENDING,
            }).lean();
            expect(notification).toBeTruthy();
            expect(notification.studentId.toString()).toBe(student._id.toString());
            expect(notification.courseId.toString()).toBe(instance._id.toString());
            expect(notification.teacher.toString()).toBe(teacherRecord._id.toString());
            expect(notification.meta.enrollmentId.toString()).toBeTruthy();
            expect(notification.meta.studentId.toString()).toBe(student._id.toString());
            expect(notification.meta.courseId.toString()).toBe(instance._id.toString());
            expect(notification.meta.teacherId.toString()).toBe(
                teacherRecord.userId.toString()
            );
            expect(notification.message).toContain("Anna Svensson");
            expect(notification.resolved).toBe(false);
        });

        it("does not create a duplicate when an unresolved one already exists", async () => {
            const enrollment = await createEnrollment();

            await Notification.create({
                type: NOTIFICATION_TYPES.GRADES_PENDING,
                studentId: student._id,
                courseId: instance._id,
                teacher: teacherRecord._id,
                message: "existing",
                meta: { enrollmentId: enrollment._id },
                resolved: false,
            });

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(1);
            expect(summary.created).toBe(0);
            expect(summary.skipped).toBe(1);
            expect(
                await Notification.countDocuments({
                    type: NOTIFICATION_TYPES.GRADES_PENDING,
                })
            ).toBe(1);
        });

        it("creates a new notification after an existing one was resolved", async () => {
            const enrollment = await createEnrollment();

            await Notification.create({
                type: NOTIFICATION_TYPES.GRADES_PENDING,
                studentId: student._id,
                courseId: instance._id,
                teacher: teacherRecord._id,
                message: "existing",
                meta: { enrollmentId: enrollment._id },
                resolved: true,
            });

            const summary = await runGradingReminderScan();

            expect(summary.created).toBe(1);
            expect(
                await Notification.countDocuments({
                    type: NOTIFICATION_TYPES.GRADES_PENDING,
                })
            ).toBe(2);
        });

        it("does not create when grade is already set", async () => {
            await createEnrollment({ grade: "A" });

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(0);
            expect(summary.created).toBe(0);
        });

        it("does not create when the grade is locked", async () => {
            await createEnrollment({ isGradeLocked: true });

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(0);
            expect(summary.created).toBe(0);
        });

        it("does not create when endDate is past the window", async () => {
            await createEnrollment({ endDate: daysAgo(30) });

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(0);
            expect(summary.created).toBe(0);
        });

        it("does not create when endDate is in the future beyond the window", async () => {
            await createEnrollment({ endDate: daysAhead(30) });

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(0);
            expect(summary.created).toBe(0);
        });

        it("does not create for non-gradable statuses", async () => {
            await createEnrollment({ status: "dropped" });
            await createEnrollment({ status: "inactive" });
            await createEnrollment({ status: "suspended" });

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(0);
            expect(summary.created).toBe(0);
        });

        it("skips enrollments without a responsible teacher", async () => {
            await Student.updateOne(
                { _id: student._id },
                { $unset: { teacherId: 1 } }
            );
            await createEnrollment();

            const summary = await runGradingReminderScan();

            expect(summary.checked).toBe(1);
            expect(summary.created).toBe(0);
            expect(summary.skipped).toBe(1);
            expect(
                await Notification.countDocuments({
                    type: NOTIFICATION_TYPES.GRADES_PENDING,
                })
            ).toBe(0);
        });

        it("returns zero counts when no enrollments match", async () => {
            const summary = await runGradingReminderScan();
            expect(summary).toEqual({ checked: 0, created: 0, skipped: 0 });
        });
    });
});
