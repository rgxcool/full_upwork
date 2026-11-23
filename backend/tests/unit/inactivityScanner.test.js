import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../../src/services/emailService.js", () => ({
    __esModule: true,
    sendInactivityWarningEmail: vi.fn(),
}));

import { sendInactivityWarningEmail } from "../../src/services/emailService.js";
import {
    runInactivityScan,
    getLastScanSummary,
} from "../../src/services/inactivityScanner.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Notification from "../../src/models/Notification.js";
import ExamAttendance from "../../src/models/ExamAttendance.js";
import Provning from "../../src/models/Provning.js";
import Conversation from "../../src/models/Conversation.js";
import Message from "../../src/models/Message.js";

describe("inactivityScanner", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    let teacherUser;
    let teacher;
    let instance;
    let today;

    const daysAgo = (days) => {
        const d = new Date(today);
        d.setDate(d.getDate() - days);
        return d;
    };

    beforeEach(async () => {
        today = new Date();
        vi.clearAllMocks();
        sendInactivityWarningEmail.mockResolvedValue({ sent: true, result: {} });

        await Promise.all([
            User.deleteMany({}),
            Teacher.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            Notification.deleteMany({}),
            ExamAttendance.deleteMany({}),
            Provning.deleteMany({}),
            Conversation.deleteMany({}),
            Message.deleteMany({}),
        ]);

        teacherUser = await User.create({
            email: "auto-larare@mindful.se",
            password: "hashed-placeholder",
            roles: ["teacher"],
        });
        teacher = await Teacher.create({ userId: teacherUser._id, subject: "Matematik" });
        const course = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAT101",
        });
        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: daysAgo(60),
            endDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
            courseName: course.courseName,
            courseCode: course.courseCode,
        });
    });

    const enrollStudent = async ({ email = "auto@elev.se", lastLoginDaysAgo = 20, startDaysAgo = 30, withEmail = true, createLogin = true } = {}) => {
        let user = null;
        if (createLogin) {
            user = await User.create({
                email,
                password: "hashed-placeholder",
                roles: ["student"],
                lastLoginAt:
                    lastLoginDaysAgo === null || lastLoginDaysAgo === undefined
                        ? null
                        : daysAgo(lastLoginDaysAgo),
            });
        }
        const student = await Student.create({
            name: "Auto Elev",
            personalNumber: `19980101-${Math.floor(Math.random() * 9000 + 1000)}`,
            email,
        });
        if (!withEmail) {
            await Student.updateOne({ _id: student._id }, { $unset: { email: "" } });
        }
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: instance.mainCourseId,
            startDate: daysAgo(startDaysAgo),
            endDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
            status: "active",
            teacherId: teacher._id,
        });
        return { user, student };
    };

    it("auto-sends a warning email to students past the warning threshold", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        const summary = await runInactivityScan({ today });

        expect(summary.warned).toBe(1);
        expect(sendInactivityWarningEmail).toHaveBeenCalledTimes(1);
        const call = sendInactivityWarningEmail.mock.calls[0][0];
        expect(call.email).toBe("auto@elev.se");
        expect(call.studentName).toBe("Auto Elev");
        expect(call.withdrawalDate).toBeInstanceOf(Date);

        // Audit trail recorded with the system actor.
        const reloaded = await Student.findById(student._id).lean();
        const entry = reloaded.changeHistory.find((e) =>
            e.changes.includes("inactivity_warning_email")
        );
        expect(entry).toBeTruthy();
        expect(entry.changedByRole).toBe("system");
        expect(entry.changes).toContain("auto");
        expect(entry.newValues.withdrawalDate).toBeInstanceOf(Date);

        // Responsible teacher was notified.
        const notification = await Notification.findOne({ type: "inactivity_action" }).lean();
        expect(notification).toBeTruthy();
        expect(String(notification.teacher)).toBe(String(teacher._id));
    });

    it("is idempotent — a re-run never sends a duplicate email", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });

        const first = await runInactivityScan({ today });
        expect(first.warned).toBe(1);

        const second = await runInactivityScan({ today });
        expect(second.warned).toBe(0);
        expect(second.alreadyWarned).toBe(1);
        expect(sendInactivityWarningEmail).toHaveBeenCalledTimes(1);
    });

    it("does not warn students still within the activity window", async () => {
        await enrollStudent({ lastLoginDaysAgo: 3 });

        const summary = await runInactivityScan({ today });

        expect(summary.inactiveForWarning).toBe(0);
        expect(summary.warned).toBe(0);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
    });

    it("skips flagged students without an email address", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20, withEmail: false });

        const summary = await runInactivityScan({ today });

        expect(summary.noEmail).toBe(1);
        expect(summary.warned).toBe(0);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
    });

    it("does not auto-send when automation is disabled but still counts flags", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });

        const summary = await runInactivityScan({ today, autoSend: false });

        expect(summary.inactiveForWarning).toBe(1);
        expect(summary.warned).toBe(0);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
    });

    it("continues past per-student send failures and reports them", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });
        sendInactivityWarningEmail.mockResolvedValue({ sent: false, reason: "send_failed" });

        const summary = await runInactivityScan({ today });

        expect(summary.failed).toBe(1);
        expect(summary.warned).toBe(0);
        expect(summary.failures[0].reason).toBe("send_failed");
    });

    it("exposes the last scan summary for the status endpoint", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });

        const summary = await runInactivityScan({ today });

        expect(getLastScanSummary()).toMatchObject({
            evaluated: summary.evaluated,
            warned: 1,
        });
        expect(getLastScanSummary().lastScanAt).toBeInstanceOf(Date);
    });

    it("auto-withdraws once the warned withdrawal date has passed without activity", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        // Simulate a warning sent 10 days ago (deadline already past).
        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: daysAgo(10),
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: daysAgo(5) },
                    },
                },
            }
        );

        const summary = await runInactivityScan({ today });

        expect(summary.autoWithdrawn).toBe(1);
        expect(summary.withdrawPending).toBe(0);

        const reloaded = await Student.findById(student._id).lean();
        expect(reloaded.dropout).toBe(true);
        const markers = reloaded.changeHistory
            .filter((e) => e.changes?.includes("inactivity_auto_withdraw"))
            .map((e) => e.changedByRole);
        expect(markers).toContain("system");

        const enrollments = await StudentEnrollment.find({ studentId: student._id }).lean();
        expect(enrollments.length).toBeGreaterThan(0);
        expect(enrollments.every((e) => e.status === "dropped")).toBe(true);
    });

    it("does not auto-withdraw before the warned withdrawal date", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: today,
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000) },
                    },
                },
            }
        );

        const summary = await runInactivityScan({ today });

        expect(summary.autoWithdrawn).toBe(0);
        expect(summary.withdrawPending).toBe(1);
        expect((await Student.findById(student._id).lean()).dropout).toBeFalsy();
    });

    it("does not auto-withdraw students who resumed activity", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: daysAgo(10),
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: daysAgo(5) },
                    },
                },
            }
        );

        // Student logged in again 2 days ago — mustWithdraw flips off.
        await User.updateOne(
            { email: "auto@elev.se" },
            { lastLoginAt: daysAgo(2) }
        );

        const summary = await runInactivityScan({ today });

        expect(summary.autoWithdrawn).toBe(0);
        expect(summary.withdrawPending).toBe(0);
        expect((await Student.findById(student._id).lean()).dropout).toBeFalsy();
    });

    it("creates an admin review notification for a new student with no login (first five days)", async () => {
        const { student } = await enrollStudent({
            lastLoginDaysAgo: null,
            startDaysAgo: 7,
            createLogin: false,
        });

        const summary = await runInactivityScan({ today });

        expect(summary.reviewNotifications).toBe(1);

        const notification = await Notification.findOne({
            type: "inactivity_review",
            "meta.studentId": student._id,
        }).lean();
        expect(notification).toBeTruthy();
        expect(notification.teacher).toBeUndefined();
        expect(notification.resolvedByUsers).toEqual([]);
        expect(notification.message).toContain("Inaktivitetsgranskning krävs");
        expect(notification.message).toContain("Matematik 1");
        expect(notification.meta.studentName).toBe("Auto Elev");
        expect(notification.meta.courseNames).toEqual(["Matematik 1"]);
        expect(notification.meta.url).toBe("/admin/inactivity");
        // Sensitivity: the notification must never carry the personnummer.
        const serialized = JSON.stringify(notification);
        expect(serialized).not.toContain(student.personalNumber);

        // The student is NOT auto-withdrawn or warned by the scan.
        expect(summary.autoWithdrawn).toBe(0);
        expect(summary.autoSend).toBe(true);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
        expect((await Student.findById(student._id).lean()).dropout).toBeFalsy();
    });

    it("did not create a review notification for an active new student", async () => {
        await enrollStudent({ lastLoginDaysAgo: 2, startDaysAgo: 7, createLogin: true });

        const summary = await runInactivityScan({ today });

        expect(summary.reviewNotifications).toBe(0);
        expect(await Notification.countDocuments({ type: "inactivity_review" })).toBe(0);
    });

    it("does not require a 5-day login review when course activity is recent, but does when nothing is recent", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 6 });
        await Student.updateOne(
            { _id: student._id },
            { $set: { lastLearningActivityAt: today } }
        );

        const withRecentActivity = await runInactivityScan({ today });

        expect(withRecentActivity.reviewNotifications).toBe(0);
        expect(withRecentActivity.inactiveForWarning).toBe(0);
        expect(withRecentActivity.warned).toBe(0);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
        expect(
            await Notification.countDocuments({
                type: "inactivity_review",
                "meta.studentId": student._id,
            })
        ).toBe(0);

        // Same stale login, but no other recent activity: the union rule still
        // requires the admin review.
        await Student.updateOne(
            { _id: student._id },
            { $unset: { lastLearningActivityAt: "" } }
        );
        const nothingRecent = await runInactivityScan({ today });

        expect(nothingRecent.reviewNotifications).toBe(1);
        expect(
            await Notification.countDocuments({
                type: "inactivity_review",
                "meta.studentId": student._id,
            })
        ).toBe(1);
    });

    it("never creates a duplicate review notification across repeated scans", async () => {
        const { student } = await enrollStudent({
            lastLoginDaysAgo: null,
            startDaysAgo: 7,
            createLogin: false,
        });

        const first = await runInactivityScan({ today });
        expect(first.reviewNotifications).toBe(1);

        const second = await runInactivityScan({ today });
        expect(second.reviewNotifications).toBe(0);
        expect(second.alreadyWarned).toBe(0);
        expect(await Notification.countDocuments({ type: "inactivity_review" })).toBe(1);

        const markers = (
            await Student.findById(student._id).lean()
        ).changeHistory.filter((e) => e.changes.includes("inactivity_review_notified"));
        expect(markers).toHaveLength(1);
    });

    it("skips the review notification once a warning email has been sent", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });
        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: today,
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: daysAgo(0) },
                    },
                },
            }
        );

        const summary = await runInactivityScan({ today });

        expect(summary.reviewNotifications).toBe(0);
        expect(await Notification.countDocuments({ type: "inactivity_review" })).toBe(0);
    });

    it("stops pending review when the student becomes active", async () => {
        await enrollStudent({
            lastLoginDaysAgo: null,
            startDaysAgo: 7,
            createLogin: false,
        });
        // First scan surfaces the review; afterwards the student logs in.
        await runInactivityScan({ today });
        await User.create({
            email: "auto@elev.se",
            password: "hashed-placeholder",
            roles: ["student"],
            lastLoginAt: daysAgo(1),
        });

        const summary = await runInactivityScan({ today });

        expect(summary.reviewNotifications).toBe(0);
        expect(await Notification.countDocuments({ type: "inactivity_review" })).toBe(1);
        expect(summary.withdrawPending).toBe(0);
        expect(summary.autoWithdrawn).toBe(0);
    });

    it("records a student-facing notification exactly once across repeated auto-withdrawals", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });
        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: daysAgo(10),
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: daysAgo(5) },
                    },
                },
            }
        );

        const first = await runInactivityScan({ today });
        expect(first.autoWithdrawn).toBe(1);

        const second = await runInactivityScan({ today });
        expect(second.autoWithdrawn).toBe(0);

        const studentNotifications = await Notification.find({ type: "dropout" }).lean();
        const own = studentNotifications.filter(
            (n) => n.meta && String(n.meta.studentId) === String(student._id)
        );
        expect(own).toHaveLength(1);
        expect(own[0].meta.studentUserId).toBeTruthy();
        expect(own[0].meta.url).toBe("/");
    });
});
