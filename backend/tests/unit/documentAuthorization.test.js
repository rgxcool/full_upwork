import { beforeEach, describe, expect, it, vi } from "vitest";

const { models } = vi.hoisted(() => ({
    models: {
        Student: {
            findById: vi.fn(),
            findOne: vi.fn(),
        },
    },
}));

vi.mock("mongoose", () => ({
    __esModule: true,
    default: {
        models,
        model: vi.fn((name) => models[name]),
    },
}));

import {
    canAccessDocument,
    canAccessStudentDocuments,
    canAccessTeacherDocuments,
    isStaffOnlyDocumentType,
    isStaffUser,
} from "../../src/utils/documentAuthorization.js";

describe("documentAuthorization", () => {
    beforeEach(() => {
        models.Student.findById.mockReset();
        models.Student.findOne.mockReset();
    });

    it("allows global staff without looking up the student", async () => {
        await expect(
            canAccessStudentDocuments({ role: "admin", municipalities: [] }, "student-1")
        ).resolves.toBe(true);
        expect(models.Student.findById).not.toHaveBeenCalled();
    });

    it("limits scoped staff to the student's municipality", async () => {
        models.Student.findById.mockResolvedValue({
            _id: "student-1",
            municipality: "Malmö",
        });

        await expect(
            canAccessStudentDocuments(
                { roles: ["coordinator"], municipalities: ["Stockholm"] },
                "student-1"
            )
        ).resolves.toBe(false);
        await expect(
            canAccessStudentDocuments(
                { roles: ["coordinator"], municipalities: ["Malmö"] },
                "student-1"
            )
        ).resolves.toBe(true);
    });

    it("allows only an assigned teacher (Student.teacherId is the User id, #102)", async () => {
        models.Student.findById.mockResolvedValue({
            _id: "student-1",
            municipality: "Malmö",
            teacherId: "user-1",
        });

        await expect(
            canAccessStudentDocuments(
                { role: "teacher", userId: "user-1", municipalities: [] },
                "student-1"
            )
        ).resolves.toBe(true);
        await expect(
            canAccessStudentDocuments(
                { role: "teacher", userId: "user-2", municipalities: [] },
                "student-1"
            )
        ).resolves.toBe(false);
    });

    it("allows a student to access only their own documents", async () => {
        models.Student.findById.mockResolvedValue({
            _id: "student-1",
            municipality: "Malmö",
        });
        models.Student.findOne.mockResolvedValue({ _id: "student-1" });

        await expect(
            canAccessStudentDocuments(
                { role: "student", email: "student@example.com", municipalities: [] },
                "student-1"
            )
        ).resolves.toBe(true);
        models.Student.findOne.mockResolvedValue({ _id: "student-2" });
        await expect(
            canAccessStudentDocuments(
                { role: "student", email: "student@example.com", municipalities: [] },
                "student-1"
            )
        ).resolves.toBe(false);
    });

    it("authorizes teacher documents by owner and orphan documents by global staff", async () => {
        await expect(
            canAccessTeacherDocuments({ role: "teacher", userId: "teacher-1" }, "teacher-1")
        ).resolves.toBe(true);
        await expect(
            canAccessDocument({ role: "teacher", userId: "teacher-1" }, {
                teacher: "teacher-1",
            })
        ).resolves.toBe(true);
        await expect(
            canAccessDocument({ role: "coordinator", municipalities: ["Malmö"] }, {
                filename: "orphan.pdf",
            })
        ).resolves.toBe(false);
        await expect(
            canAccessDocument({ role: "admin", municipalities: [] }, {
                filename: "orphan.pdf",
            })
        ).resolves.toBe(true);
    });

    it("grants access to a document that was explicitly shared with the user", async () => {
        const document = {
            teacher: "teacher-1",
            sharedWith: ["user-2"],
        };

        await expect(
            canAccessDocument({ role: "teacher", userId: "user-2" }, document)
        ).resolves.toBe(true);
        await expect(
            canAccessDocument({ role: "teacher", userId: "user-3" }, document)
        ).resolves.toBe(false);
    });

    it("grants access to a shared document even without a matching role", async () => {
        await expect(
            canAccessDocument({ role: "coordinator", userId: "user-4" }, {
                filename: "orphan.pdf",
                sharedWith: [{ _id: "user-4" }],
            })
        ).resolves.toBe(true);
    });

    it("classifies delprov/slutprov as staff-only and identifies staff users", () => {
        expect(isStaffOnlyDocumentType("SLUTPROV")).toBe(true);
        expect(isStaffOnlyDocumentType("delprov")).toBe(true);
        expect(isStaffOnlyDocumentType("COURSE_ARCHIVE")).toBe(false);
        expect(isStaffUser({ role: "teacher" })).toBe(true);
        expect(isStaffUser({ roles: ["syv"] })).toBe(true);
        expect(isStaffUser({ role: "student", roles: ["student"] })).toBe(false);
    });

    it("denies a student their own slutprov/delprov files, even when shared", async () => {
        models.Student.findById.mockResolvedValue({ _id: "student-1", municipality: "Malmö" });
        models.Student.findOne.mockResolvedValue({ _id: "student-1" });
        const student = { role: "student", userId: "stu-user", email: "student@example.com", municipalities: [] };

        await expect(
            canAccessDocument(student, { student: "student-1", type: "SLUTPROV" })
        ).resolves.toBe(false);
        await expect(
            canAccessDocument(student, { student: "student-1", type: "DELPROV", sharedWith: ["stu-user"] })
        ).resolves.toBe(false);
        // The same student still reaches ordinary Kursarkiv documents.
        await expect(
            canAccessDocument(student, { student: "student-1", type: "COURSE_ARCHIVE" })
        ).resolves.toBe(true);
    });

    it("still lets staff open slutprov files", async () => {
        await expect(
            canAccessDocument({ role: "admin", municipalities: [] }, { student: "student-1", type: "SLUTPROV" })
        ).resolves.toBe(true);
    });
});
