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
    default: { findOne: vi.fn() },
}));

vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: { find: vi.fn(), aggregate: vi.fn() },
}));

import logger from "../../src/utils/logger.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import BaseChatbotService, { generateSessionId } from "../../src/services/chatbotService.js";

describe("chatbotService", () => {
    let service;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new BaseChatbotService();
        Student.findById.mockReturnValue({ lean: vi.fn() });
        CourseInstance.find.mockReturnValue({
            select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
        });
        CourseInstance.aggregate.mockResolvedValue([]);
        StudentEnrollment.findOne.mockReturnValue({ lean: vi.fn() });
    });

    it("generates a unique session id", () => {
        const a = generateSessionId("ctx");
        const b = generateSessionId("ctx");
        expect(a).toMatch(/^ctx_/);
        expect(a).not.toBe(b);
    });

    it("returns the enrolled course instance ids for a student", async () => {
        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "student-1",
                enrollments: [
                    { status: "enrolled", courseInstanceId: "ci-1" },
                    { status: "active", courseInstanceId: "ci-2" },
                    { status: "cancelled", courseInstanceId: "ci-3" },
                ],
            }),
        });
        CourseInstance.find.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([{ _id: "ci-1" }, { _id: "ci-2" }]),
            }),
        });

        const ids = await service.getEnrolledCourseInstances("student-1");
        expect(ids).toEqual(["ci-1", "ci-2"]);
        expect(CourseInstance.find).toHaveBeenCalledWith({
            _id: { $in: ["ci-1", "ci-2"] },
        });
    });

    it("returns an empty list when the student is not found", async () => {
        Student.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
        const ids = await service.getEnrolledCourseInstances("missing");
        expect(ids).toEqual([]);
    });

    it("confirms enrollment when a matching enrollment exists", async () => {
        StudentEnrollment.findOne.mockReturnValue({
            lean: vi.fn().mockResolvedValue({ _id: "enroll-1" }),
        });
        const enrolled = await service.isEnrolledIn("student-1", "ci-1");
        expect(enrolled).toBe(true);
        expect(StudentEnrollment.findOne).toHaveBeenCalledWith({
            studentId: "student-1",
            courseInstanceId: "ci-1",
            status: { $in: ["enrolled", "active"] },
        });
    });

    it("reports non-enrollment when no matching enrollment exists", async () => {
        StudentEnrollment.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
        const enrolled = await service.isEnrolledIn("student-1", "ci-9");
        expect(enrolled).toBe(false);
    });

    it("filters sources to approved entries", () => {
        const sources = [
            { id: 1, isApproved: true },
            { id: 2, isApproved: false },
            { id: 3, isApproved: true },
        ];
        expect(service.filterApprovedSources(sources)).toHaveLength(2);
    });

    it("builds context from course module titles and instructions", async () => {
        CourseInstance.aggregate.mockResolvedValue([
            {
                modules: [
                    { title: "Modul 1", instructions: "Gör startuppgiften." },
                    { title: "Modul 2", instructions: "" },
                ],
            },
        ]);
        const ciId = "507f1f77bcf86cd799439011";
        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "student-1",
                enrollments: [
                    { status: "active", courseInstanceId: ciId },
                ],
            }),
        });
        CourseInstance.find.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue([{ _id: ciId }]),
            }),
        });

        const context = await service.buildContext("student-1", "Vad gör jag nästa modul?");
        expect(context).toContain("Modul 1");
        expect(context).toContain("Gör startuppgiften.");
    });

    it("returns empty context when there are no course instances", async () => {
        Student.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
        const context = await service.buildContext("student-1", "något");
        expect(context).toBe("");
    });

    it("logs interactions without throwing", async () => {
        await service.logInteraction("student-1", "Hej", "Svaret", [{ id: 1 }], true);
        expect(logger.info).toHaveBeenCalled();
    });
});