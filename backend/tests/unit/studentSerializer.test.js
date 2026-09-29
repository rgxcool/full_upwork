import { describe, expect, it } from "vitest";
import {
    maskPersonalNumber,
    projectStudentForViewer,
    projectStudentsForViewer,
} from "../../src/utils/studentSerializer.js";

const student = () => ({
    _id: "student-1",
    name: "Elev",
    personalNumber: "19900101-1234",
    email: "student@example.com",
    phone: "070-1234567",
    supportInfo: [{ contactName: "Kontakt" }],
    specialNeeds: "Extra tid",
    examAccommodations: { extraTime: 30 },
    deviations: [{ reason: "Avvikelse" }],
    commentHistory: [{ comment: "Kommentar" }],
    changeHistory: [{ changes: ["email"] }],
    user: { email: "student@example.com", password: "secret" },
});

describe("studentSerializer", () => {
    it("returns the full student document for administrators", () => {
        const result = projectStudentForViewer(student(), { role: "admin" });

        expect(result.personalNumber).toBe("19900101-1234");
        expect(result.supportInfo).toHaveLength(1);
        expect(result.changeHistory).toHaveLength(1);
        expect(result.user.password).toBeUndefined();
    });

    it("keeps teacher fields while removing support and history fields", () => {
        const result = projectStudentForViewer(student(), { role: "teacher" });

        expect(result.personalNumber).toBe("19900101-1234");
        expect(result.examAccommodations).toEqual({ extraTime: 30 });
        expect(result.specialNeeds).toBe("Extra tid");
        expect(result.supportInfo).toBeUndefined();
        expect(result.deviations).toBeUndefined();
        expect(result.changeHistory).toBeUndefined();
    });

    it("removes coordinator PII and support fields", () => {
        const result = projectStudentForViewer(student(), { role: "coordinator" });

        expect(result.personalNumber).toBeUndefined();
        expect(result.supportInfo).toBeUndefined();
        expect(result.specialNeeds).toBeUndefined();
        expect(result.examAccommodations).toBeUndefined();
        expect(result.deviations).toBeUndefined();
        expect(result.commentHistory).toBeUndefined();
    });

    it("keeps the owner fields and removes nested user passwords", () => {
        const result = projectStudentForViewer(
            student(),
            { role: "student", email: "STUDENT@example.com" },
            { isOwner: true }
        );

        expect(result.personalNumber).toBe("19900101-1234");
        expect(result.supportInfo).toHaveLength(1);
        expect(result.changeHistory).toBeUndefined();
        expect(result.user.password).toBeUndefined();
    });

    it("projects every student in a list", () => {
        const result = projectStudentsForViewer([student(), student()], { role: "coordinator" });

        expect(result).toHaveLength(2);
        expect(result.every((item) => item.personalNumber === undefined)).toBe(true);
    });

    it("masks all but the final four personal-number characters", () => {
        expect(maskPersonalNumber("19900101-1234")).toBe("*********1234");
    });
});
