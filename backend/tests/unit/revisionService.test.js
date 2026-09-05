import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: { findById: vi.fn() },
}));

vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: { find: vi.fn(), findOne: vi.fn() },
}));

vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: { findByIdAndDelete: vi.fn() },
}));

vi.mock("../../src/models/Notification.js", () => ({
    __esModule: true,
    default: { create: vi.fn() },
}));

vi.mock("../../src/models/User.js", () => ({
    __esModule: true,
    default: { findById: vi.fn(), findOne: vi.fn() },
}));

vi.mock("../../src/utils/courseMatchingService.js", () => ({
    __esModule: true,
    default: { findOrCreateCourseInstance: vi.fn() },
}));

vi.mock("../../src/services/emailService.js", () => ({
    sendEmail: vi.fn().mockResolvedValue({ messageId: "test" }),
    getEmailSignature: vi.fn().mockResolvedValue("signature"),
}));

vi.mock("mongoose", async () => {
    const actual = await vi.importActual("mongoose");
    return {
        __esModule: true,
        default: {
            ...actual,
            startSession: vi.fn(),
        },
    };
});

import {
    performStudyplanRevision,
    getRevisionHistory,
    REVISION_REASONS,
} from "../../src/services/revisionService.js";
import Student from "../../src/models/Student.js";
import Notification from "../../src/models/Notification.js";
import User from "../../src/models/User.js";
import { sendEmail, getEmailSignature } from "../../src/services/emailService.js";
import mongoose from "mongoose";

const studentDoc = (overrides = {}) => ({
    _id: "student-1",
    name: "Ulla Studerande",
    email: "ulla@example.com",
    teacherId: "teacher-1",
    tempoWeeks: 10,
    changeHistory: [],
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
});

const teacherUser = { _id: "user-1", name: "Läraren", email: "teacher@example.com" };

const sessionStub = () => {
    const session = {
        withTransaction: vi.fn(async (fn) => fn()),
        endSession: vi.fn(),
    };
    return session;
};

describe("revisionService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mongoose.startSession.mockReturnValue(sessionStub());
        Student.findById.mockResolvedValue(studentDoc());
        User.findById.mockReturnValue({
            select: vi.fn().mockResolvedValue(teacherUser),
        });
        User.findOne.mockResolvedValue({ _id: "student-user-1" });
        Notification.create.mockResolvedValue({ _id: "note-1" });
    });

    it("exposes the supported revision reasons", () => {
        expect(REVISION_REASONS).toContain("pace_change");
    });

    it("notifies teacher and student in-app and by email after a revision", async () => {
        const result = await performStudyplanRevision({
            studentId: "student-1",
            revisionReason: "pace_change",
            description: "Ny fart",
            changes: {},
            userId: "user-admin",
            userRole: "admin",
        });

        expect(result.success).toBe(true);

        const teacherNote = Notification.create.mock.calls.find(([note]) =>
            note.meta?.studentId === "student-1" && note.teacher === "teacher-1"
        );
        expect(teacherNote).toBeTruthy();
        expect(teacherNote[0].type).toBe("studyplan_changed");

        const studentNote = Notification.create.mock.calls.find(([note]) =>
            note.studentId === "student-1"
        );
        expect(studentNote).toBeTruthy();
        expect(studentNote[0].message).toContain("Din studieplan har reviderats");
        expect(studentNote[0].meta.studentUserId).toBe("student-user-1");

        expect(User.findOne).toHaveBeenCalledWith({ email: "ulla@example.com" });

        expect(sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: "teacher@example.com", text: expect.stringContaining("Ulla Studerande") })
        );
        expect(sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: "ulla@example.com", subject: "Studieplan reviderad" })
        );
        expect(getEmailSignature).toHaveBeenCalled();
    });

    it("still notifies the student when the student has no linked teacher", async () => {
        Student.findById.mockResolvedValue(studentDoc({ teacherId: null }));
        User.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

        const result = await performStudyplanRevision({
            studentId: "student-1",
            revisionReason: "course_removed",
            changes: {},
            userId: "user-admin",
            userRole: "admin",
        });

        expect(result.success).toBe(true);
        const studentNote = Notification.create.mock.calls.find(
            ([note]) => note.studentId === "student-1"
        );
        expect(studentNote).toBeTruthy();
        expect(sendEmail).not.toHaveBeenCalledWith(
            expect.objectContaining({ to: "teacher@example.com" })
        );
        expect(sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: "ulla@example.com" })
        );
    });

    it("skips student notification entirely when student has no email", async () => {
        Student.findById.mockResolvedValue(studentDoc({ email: null }));

        await performStudyplanRevision({
            studentId: "student-1",
            revisionReason: "other",
            changes: {},
            userId: "user-admin",
            userRole: "admin",
        });

        const studentNotes = Notification.create.mock.calls.filter(
            ([note]) => note.studentId === "student-1"
        );
        expect(studentNotes).toHaveLength(0);
        const studentEmails = sendEmail.mock.calls.filter(
            ([payload]) => payload.to === undefined
        );
        expect(studentEmails).toHaveLength(0);
        expect(sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: "teacher@example.com" })
        );
    });

    it("rejects an invalid revision reason", async () => {
        await expect(
            performStudyplanRevision({
                studentId: "student-1",
                revisionReason: "not-a-reason",
                changes: {},
                userId: "user-admin",
                userRole: "admin",
            })
        ).rejects.toThrow("Invalid revision reason");
    });

    it("throws 404 when the student does not exist", async () => {
        Student.findById.mockResolvedValue(null);
        await expect(
            performStudyplanRevision({
                studentId: "missing",
                revisionReason: "pace_change",
                changes: {},
                userId: "user-admin",
                userRole: "admin",
            })
        ).rejects.toThrow("Student not found");
    });

    it("returns revision history for a student", async () => {
        Student.findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    name: "Ulla Studerande",
                    changeHistory: [
                        {
                            timestamp: new Date(),
                            changedBy: "user-admin",
                            changedByRole: "admin",
                            changes: ["studyplan_revision"],
                            revisionReason: "pace_change",
                            revisionDescription: "Ny fart",
                            previousValues: { tempoWeeks: 10 },
                            newValues: { tempoWeeks: 12 },
                        },
                        {
                            timestamp: new Date(),
                            changedBy: "user-admin",
                            changedByRole: "admin",
                            changes: ["other_change"],
                        },
                    ],
                }),
            }),
        });

        const history = await getRevisionHistory("student-1");
        expect(history).toHaveLength(1);
        expect(history[0].reason).toBe("pace_change");
    });

    it("throws 404 when fetching revision history for a missing student", async () => {
        Student.findById.mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
        });
        await expect(getRevisionHistory("missing")).rejects.toThrow("Student not found");
    });
});