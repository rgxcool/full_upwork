import { beforeEach, describe, expect, it, vi } from "vitest";

const { models } = vi.hoisted(() => ({
    models: {
        Student: {
            findById: vi.fn(),
            findOne: vi.fn(),
        },
        Teacher: {
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
} from "../../src/utils/documentAuthorization.js";

describe("documentAuthorization", () => {
    beforeEach(() => {
        models.Student.findById.mockReset();
        models.Student.findOne.mockReset();
        models.Teacher.findOne.mockReset();
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

    it("allows only an assigned teacher", async () => {
        models.Student.findById.mockResolvedValue({
            _id: "student-1",
            municipality: "Malmö",
            teacherId: "teacher-1",
        });
        models.Teacher.findOne.mockImplementation(({ userId }) =>
            Promise.resolve(userId === "user-1" ? { _id: "teacher-1" } : null)
        );

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
});
