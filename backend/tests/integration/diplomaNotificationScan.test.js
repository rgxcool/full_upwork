import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Notification from "../../src/models/Notification.js";
import CompletionEvent from "../../src/models/CompletionEvent.js";
import AssignmentSubmission from "../../src/models/AssignmentSubmission.js";
import User from "../../src/models/User.js";
import NOTIFICATION_TYPES from "../../src/controllers/notificationTypes.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { giveTeacherProfile } from "../helpers/teacherFixture.js";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

const { runDiplomaNotificationScan, checkCourseCompletion, checkPackageCompletion } =
    await import("../../src/services/diplomaNotificationScan.js");
const {
    courseCompletionKey,
    packageCompletionKey,
} = await import("../../src/services/courseCompletionService.js");

const date = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("Completion scan (course + package + diploma trigger)", () => {
    let student;
    let course;
    let instance;
    let pkg;
    let teacher;
    let teacherUser;
    let studentUser;

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
            CompletionEvent.deleteMany({}),
            AssignmentSubmission.deleteMany({}),
            User.deleteMany({}),
        ]);

        teacherUser = await User.create({
            email: "larare@skola.se",
            name: "Läraren",
            username: "larare",
            password: "x",
            roles: ["teacher"],
        });
        teacher = await giveTeacherProfile(teacherUser._id, { subject: "Matematik" });
        studentUser = await User.create({
            email: "ebba@elev.se",
            name: "Ebba Lindgren",
            username: "ebba",
            password: "x",
            roles: ["student"],
        });
        student = await Student.create({
            name: "Ebba Lindgren",
            personalNumber: "20000101-1234",
            email: "ebba@elev.se",
            municipality: { type: "Sollentuna" },
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
            responsibleTeacher: teacher._id,
            modules: [
                {
                    moduleNumber: 1,
                    title: "Modul 1",
                    assignment: { title: "Uppgift 1", description: "Lös uppgiften" },
                },
                {
                    moduleNumber: 2,
                    title: "Modul 2",
                    assignment: { title: "", description: "" },
                },
            ],
        });

        pkg = await CoursePackage.create({
            coursePackageName: "Teknikpaketet",
            coursePackageCode: "TEK1",
            coursePackagePoints: "1000",
            coursePackageExtent: "Termin",
            coursePackageCourses: [course._id],
        });
    });

    const createEnrollment = (overrides = {}) =>
        StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            teacherId: teacher._id,
            startDate: date(-100),
            endDate: date(-10),
            status: "completed",
            grade: "C",
            completedAt: date(-5),
            ...overrides,
        });

    const acceptModule = (enrollment, moduleNumber) =>
        AssignmentSubmission.create({
            studentId: student._id,
            enrollmentId: enrollment._id,
            courseInstanceId: instance._id,
            moduleNumber,
            submittedText: "Inlämning",
            feedback: { status: "godkänd", at: new Date() },
            revisionDecision: "godkänd",
        });

    // ── Course-level completion ────────────────────────────────────────────

    it("detects a completed standalone course and notifies admins", async () => {
        const enrollment = await createEnrollment();
        await acceptModule(enrollment, 1);

        const summary = await runDiplomaNotificationScan();

        expect(summary.checked).toBe(1);
        expect(summary.courseEvents).toBe(1);
        expect(summary.created).toBe(1);
        expect(summary.skipped).toBe(0);
        expect(summary.adminNotified).toBe(1);
        expect(summary.teacherNotified).toBe(1);

        const event = await CompletionEvent.findOne({
            idempotencyKey: courseCompletionKey(student._id, instance._id),
        }).lean();
        expect(event).toBeTruthy();
        expect(event.completionType).toBe("course");
        expect(event.courseName).toBe("Matematik 2");

        const adminNote = await Notification.findOne({
            type: NOTIFICATION_TYPES.COURSE_COMPLETED,
            teacher: { $exists: false },
            "meta.responsibleTeacher": { $exists: true },
            "meta.studentId": student._id,
        }).lean();
        expect(adminNote).toBeTruthy();
        expect(adminNote.message).toContain("Ebba Lindgren");
        expect(adminNote.studentId.toString()).toBe(student._id.toString());
        expect(adminNote.meta.url).toBe(`/student/${student._id}`);

        const teacherNote = await Notification.findOne({
            type: NOTIFICATION_TYPES.COURSE_COMPLETED,
            teacher: teacher._id,
        }).lean();
        expect(teacherNote).toBeTruthy();
        expect(teacherNote.teacher.toString()).toBe(teacher._id.toString());
        expect(teacherNote.meta.teacherId.toString()).toBe(teacherUser._id.toString());
    });

    it("skips a completed enrollment that is missing the approved grade", async () => {
        const enrollment = await createEnrollment({ grade: null });
        await acceptModule(enrollment, 1);

        const summary = await runDiplomaNotificationScan();

        expect(summary.checked).toBe(1);
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(await CompletionEvent.countDocuments({})).toBe(0);
    });

    it("skips when a required module assignment is not accepted", async () => {
        await createEnrollment();
        // No accepted submission for module 1.
        const summary = await runDiplomaNotificationScan();

        expect(summary.checked).toBe(1);
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(
            await Notification.countDocuments({ type: NOTIFICATION_TYPES.COURSE_COMPLETED })
        ).toBe(0);
    });

    it("skips a package when one of its courses is withdrawn", async () => {
        const second = await Course.create({ courseName: "Fysik 1", courseCode: "FYS100" });
        const secondInstance = await CourseInstance.create({
            mainCourseId: second._id,
            courseName: second.courseName,
            courseCode: second.courseCode,
            startDate: date(-100),
            endDate: date(-10),
            responsibleTeacher: teacher._id,
            modules: [],
        });
        await CoursePackage.updateOne(
            { _id: pkg._id },
            { $push: { coursePackageCourses: second._id } }
        );
        await createEnrollment({ coursePackageId: pkg._id });
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: secondInstance._id,
            mainCourseId: second._id,
            teacherId: teacher._id,
            coursePackageId: pkg._id,
            startDate: date(-100),
            endDate: date(-10),
            status: "dropped",
            grade: null,
        });

        const summary = await runDiplomaNotificationScan();
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it("re-checks standalone course completion via the service", async () => {
        // explicit status and grade but assignment missing → false
        const enrollment = await createEnrollment();
        const incomplete = await checkCourseCompletion(student._id, instance._id);
        expect(incomplete.completed).toBe(false);
        expect(incomplete.reasons.join()).toContain("assignment_missing");

        await acceptModule(enrollment, 1);
        const complete = await checkCourseCompletion(student._id, instance._id);
        expect(complete.completed).toBe(true);
        expect(complete.grade).toBe("C");
    });

    // ── Package-level completion + diploma trigger ─────────────────────────

    it("creates a diploma_ready notification when package + APL are complete", async () => {
        const enrollment = await createEnrollment({
            coursePackageId: pkg._id,
        });
        await acceptModule(enrollment, 1);

        const summary = await runDiplomaNotificationScan();

        expect(summary.packageEvents).toBe(1);
        expect(summary.created).toBe(1);
        expect(summary.skipped).toBe(0);
        expect(summary.adminNotified).toBe(1);
        expect(summary.teacherNotified).toBe(1);

        const event = await CompletionEvent.findOne({
            idempotencyKey: packageCompletionKey(student._id, pkg._id),
        }).lean();
        expect(event).toBeTruthy();
        expect(event.completionType).toBe("course_package");
        expect(event.packageName).toBe("Teknikpaketet");

        const adminNote = await Notification.findOne({
            type: NOTIFICATION_TYPES.DIPLOMA_READY,
            teacher: { $exists: false },
            "meta.studentId": student._id,
            "meta.studentMunicipality": { $exists: true },
        }).lean();
        expect(adminNote).toBeTruthy();
        expect(adminNote.message).toContain("Ebba Lindgren");
        expect(adminNote.meta.studentMunicipality).toBe("Sollentuna");
        expect(adminNote.meta.url).toBe(`/api/diploma/${enrollment._id}/pdf`);

        const teacherNote = await Notification.findOne({
            type: NOTIFICATION_TYPES.DIPLOMA_READY,
            teacher: teacher._id,
        }).lean();
        expect(teacherNote).toBeTruthy();
        expect(teacherNote.teacher.toString()).toBe(teacher._id.toString());
    });

    it("skips the diploma trigger when APL is not approved", async () => {
        await createEnrollment({ coursePackageId: pkg._id });
        await Student.updateOne({ _id: student._id }, { $set: { aplStatus: "GRAY" } });

        const summary = await runDiplomaNotificationScan();

        expect(summary.packageEvents).toBe(0);
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(
            await Notification.countDocuments({ type: NOTIFICATION_TYPES.DIPLOMA_READY })
        ).toBe(0);
    });

    it("accepts prior APL completion instead of current GREEN", async () => {
        await createEnrollment({ coursePackageId: pkg._id });
        await Student.updateOne(
            { _id: student._id },
            { $set: { aplStatus: "GRAY", priorAplCompleted: true } }
        );

        const summary = await runDiplomaNotificationScan();
        expect(summary.created).toBe(1);
        expect(summary.packageEvents).toBe(1);
    });

    it("skips a package with missing courses", async () => {
        const second = await Course.create({ courseName: "Fysik 1", courseCode: "FYS100" });
        await CoursePackage.updateOne(
            { _id: pkg._id },
            { $push: { coursePackageCourses: second._id } }
        );
        await createEnrollment({ coursePackageId: pkg._id });

        const summary = await runDiplomaNotificationScan();
        expect(summary.created).toBe(0);
        expect(summary.skipped).toBe(1);
    });

    it("does not duplicate notifications when the scan runs twice", async () => {
        await createEnrollment({ coursePackageId: pkg._id });
        await runDiplomaNotificationScan();
        const before = await Notification.countDocuments({
            type: NOTIFICATION_TYPES.DIPLOMA_READY,
        });

        const summary = await runDiplomaNotificationScan();

        expect(summary.skipped).toBe(1);
        expect(await Notification.countDocuments({
            type: NOTIFICATION_TYPES.DIPLOMA_READY,
        })).toBe(before);
        expect(await CompletionEvent.countDocuments({})).toBe(1);
    });

    it("zero counts when nothing to scan", async () => {
        const summary = await runDiplomaNotificationScan();
        expect(summary.checked).toBe(0);
        expect(summary.created).toBe(0);
        expect(summary.packageEvents + summary.courseEvents).toBe(0);
        expect(summary.skipped).toBe(0);
    });
});