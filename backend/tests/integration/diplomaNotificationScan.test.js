import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Notification from "../../src/models/Notification.js";
import NOTIFICATION_TYPES from "../../src/controllers/notificationTypes.js";
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

const { runDiplomaNotificationScan } = await import("../../src/services/diplomaNotificationScan.js");

const date = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("Diploma notification scan", () => {
    let student;
    let course;
    let instance;
    let pkg;

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
            CoursePackage.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Notification.deleteMany({}),
        ]);

        student = await Student.create({
            name: "Ebba Lindgren",
            personalNumber: "20000101-1234",
            email: "ebba@elev.se",
            aplStatus: "GREEN",
        });

        course = await Course.create({
            courseName: "Matematik 2",
            courseCode: "MAT200",
        });

        instance = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: course.courseCode,
            startDate: date(-100),
            endDate: date(-10),
        });

        pkg = await CoursePackage.create({
            coursePackageName: "Teknikpaketet",
            coursePackageCode: "TEK1",
            coursePackagePoints: "1000",
            coursePackageExtent: "Termin",
            coursePackageCourses: [course._id],
        });
    });

    const createPackageEnrollment = (overrides = {}) =>
        StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            coursePackageId: pkg._id,
            startDate: date(-100),
            endDate: date(-10),
            status: "completed",
            ...overrides,
        });

    it("creates a diploma_ready notification when package courses and APL are complete", async () => {
        const enrollment = await createPackageEnrollment();

        const summary = await runDiplomaNotificationScan();

        expect(summary.checked).toBe(1);
        expect(summary.created).toBe(1);
        expect(summary.skipped).toBe(0);

        const notification = await Notification.findOne({
            type: NOTIFICATION_TYPES.DIPLOMA_READY,
        }).lean();
        expect(notification).toBeTruthy();
        expect(notification.message).toContain("Ebba Lindgren");
        expect(notification.studentId.toString()).toBe(student._id.toString());
        expect(notification.meta.coursePackageId.toString()).toBe(pkg._id.toString());
        expect(notification.meta.url).toBe(`/diploma/${enrollment._id}/pdf`);
        expect(notification.resolved).toBe(false);
    });

    it("does not create when the student APL status is not GREEN", async () => {
        await createPackageEnrollment();
        await Student.updateOne(
            { _id: student._id },
            { $set: { aplStatus: "GRAY" } }
        );

        const summary = await runDiplomaNotificationScan();

        expect(summary.skip).toBeUndefined();
        expect(summary.checked).toBe(1);
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it("does not create when the course package has no courses", async () => {
        await CoursePackage.updateOne(
            { _id: pkg._id },
            { $set: { coursePackageCourses: [] } }
        );
        await createPackageEnrollment();

        const summary = await runDiplomaNotificationScan();

        expect(summary.checked).toBe(1);
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it("does not create when not all package courses are completed", async () => {
        const second = await Course.create({
            courseName: "Fysik 1",
            courseCode: "FYS100",
        });
        await CoursePackage.updateOne(
            { _id: pkg._id },
            { $push: { coursePackageCourses: second._id } }
        );
        await createPackageEnrollment();

        const summary = await runDiplomaNotificationScan();

        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it("does not duplicate an unresolved notification", async () => {
        await createPackageEnrollment();
        await Notification.create({
            type: NOTIFICATION_TYPES.DIPLOMA_READY,
            teacher: null,
            studentId: student._id,
            message: "existing",
            meta: { studentId: student._id, coursePackageId: pkg._id },
            resolved: false,
        });

        const summary = await runDiplomaNotificationScan();

        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(
            await Notification.countDocuments({
                type: NOTIFICATION_TYPES.DIPLOMA_READY,
            })
        ).toBe(1);
    });

    it("creates again after the previous notification was resolved", async () => {
        await createPackageEnrollment();
        await Notification.create({
            type: NOTIFICATION_TYPES.DIPLOMA_READY,
            studentId: student._id,
            message: "existing",
            meta: { studentId: student._id, coursePackageId: pkg._id },
            resolved: true,
        });

        const summary = await runDiplomaNotificationScan();

        expect(summary.created).toBe(1);
        expect(
            await Notification.countDocuments({
                type: NOTIFICATION_TYPES.DIPLOMA_READY,
            })
        ).toBe(2);
    });

    it("survives a broken enrollment without failing the whole scan", async () => {
        // Student missing → the per-enrollment try/catch catches and logs.
        const brokenEnrollment = await StudentEnrollment.collection.insertOne({
            studentId: student._id,
            courseInstanceId: instance._id,
            coursePackageId: pkg._id,
            startDate: new Date(),
            endDate: new Date(),
            status: "completed",
        });
        await Student.deleteOne({ _id: student._id });

        const summary = await runDiplomaNotificationScan();

        expect(summary.checked).toBe(1);
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(brokenEnrollment.insertedId).toBeTruthy();
    });

    it("returns zero counts when no package enrollments exist", async () => {
        const summary = await runDiplomaNotificationScan();
        expect(summary).toEqual({ checked: 0, created: 0, skipped: 0 });
    });
});