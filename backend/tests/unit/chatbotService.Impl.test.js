import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

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

vi.mock("../../src/services/faqService.js", () => ({
    findMatchingFaq: vi.fn(),
}));

import logger from "../../src/utils/logger.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import { findMatchingFaq } from "../../src/services/faqService.js";
import chatbotService from "../../src/services/chatbotService.impl.js";

const ciId = "507f1f77bcf86cd799439011";
const ciId2 = "507f1f77bcf86cd799439012";

const courseFindChain = (instances) => ({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(instances) }),
});

const moduleWith = (overrides = {}) => ({
    moduleNumber: 1,
    title: "Algebra och funktioner",
    instructions: "Lös uppgifterna i kapitel 3 om algebra.",
    assignment: {
        title: "Inlämningsuppgift algebra",
        description: "Lämna in era lösningar på uppgifterna.",
    },
    ...overrides,
});

describe("chatbotService.impl", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Student.findById.mockReturnValue({ lean: vi.fn() });
        StudentEnrollment.findOne.mockReturnValue({ lean: vi.fn() });
    });

    describe("ask", () => {
        it("returns an invalid question response for empty input", async () => {
            const result = await chatbotService.ask("student-1", "   ");
            expect(result.answer).toContain("Ogiltig fråga");
            expect(result.approved).toBe(false);
            expect(result.confidence).toBe(0);
        });

        it("returns a verified FAQ answer with category and keyword match", async () => {
            findMatchingFaq.mockResolvedValue({
                faq: {
                    answer: "Kursstarten är vecka 35.",
                    categoryId: { name: "Schema" },
                },
                matchType: "keyword",
            });
            const result = await chatbotService.ask("student-1", "När börjar kursen?");
            expect(result.answer).toBe("Kursstarten är vecka 35.");
            expect(result.approved).toBe(true);
            expect(result.confidence).toBe(1.0);
            expect(result.sources[0]).toContain("Vanliga frågor · Schema (nyckelord)");
        });

        it("returns a verified FAQ answer without category or keyword marker", async () => {
            findMatchingFaq.mockResolvedValue({
                faq: { answer: "En generell regler-svar." },
                matchType: "semantic",
            });
            const result = await chatbotService.ask("student-1", "Vilka regler gäller?");
            expect(result.sources[0]).toBe("Vanliga frågor");
        });

        it("tells students without enrollments that no courses are available", async () => {
            findMatchingFaq.mockResolvedValue(null);
            Student.findById.mockReturnValue({
                lean: vi.fn().mockResolvedValue(null),
            });
            const result = await chatbotService.ask("student-1", "Vad läser vi?");
            expect(result.answer).toContain("inte inskriven på några kurser");
            expect(result.approved).toBe(false);
        });

        it("rejects questions about a course the student is not enrolled in", async () => {
            findMatchingFaq.mockResolvedValue(null);
            StudentEnrollment.findOne.mockReturnValue({
                lean: vi.fn().mockResolvedValue(null),
            });
            const result = await chatbotService.ask("student-1", "Vad gör vi?", ciId);
            expect(result.answer).toContain("inte inskriven på den kursen");
        });

        it("returns a low-confidence fallback when no approved sources exist", async () => {
            findMatchingFaq.mockResolvedValue(null);
            Student.findById.mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    _id: "student-1",
                    enrollments: [{ status: "active", courseInstanceId: ciId }],
                }),
            });
            CourseInstance.find.mockReturnValue(
                courseFindChain([{ _id: ciId, modules: [moduleWith({ title: "Python" })] }])
            );

            const result = await chatbotService.ask("student-1", "Vad är ekorre?");
            expect(result.answer).toContain("hittar ingen specifik information");
            expect(result.confidence).toBe(0.2);
            expect(result.approved).toBe(false);
        });

        it("builds an approved answer from course content and logs it", async () => {
            findMatchingFaq.mockResolvedValue(null);
            Student.findById.mockReturnValue({
                lean: vi.fn().mockResolvedValue({
                    _id: "student-1",
                    enrollments: [{ status: "active", courseInstanceId: ciId }],
                }),
            });
            CourseInstance.find.mockReturnValue(
                courseFindChain([{ _id: ciId, modules: [moduleWith()] }])
            );

            const result = await chatbotService.ask(
                "student-1",
                "inlämningsuppgift algebra"
            );

            expect(result.approved).toBe(true);
            expect(result.sources).toHaveLength(1);
            expect(result.confidence).toBe(0.8);
            expect(result.answer).toBeTruthy();
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({ event: "chatbot_interaction", success: true }),
                "Chatbot interaction logged"
            );
        });

        it("answers within a specific enrolled course", async () => {
            findMatchingFaq.mockResolvedValue(null);
            StudentEnrollment.findOne.mockReturnValue({
                lean: vi.fn().mockResolvedValue({ _id: "enroll-1" }),
            });
            CourseInstance.find.mockReturnValue(
                courseFindChain([{ _id: ciId, modules: [moduleWith()] }])
            );

            const result = await chatbotService.ask(
                "student-1",
                "algebra",
                ciId
            );

            expect(result.approved).toBe(true);
            expect(CourseInstance.find).toHaveBeenCalledWith({
                _id: { $in: [new mongoose.Types.ObjectId(ciId)] },
            });
        });

        it("logs an interaction and returns an error answer on failure", async () => {
            findMatchingFaq.mockResolvedValue(null);
            Student.findById.mockReturnValue({
                lean: vi.fn().mockRejectedValue(new Error("db down")),
            });

            const result = await chatbotService.ask("student-1", "Vad gör vi?");

            expect(result.answer).toContain("Ett fel uppstod");
            expect(logger.error).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({ event: "chatbot_interaction", success: false }),
                "Chatbot interaction logged"
            );
        });
    });

    describe("searchContent", () => {
        it("finds module title, instructions and assignment matches", async () => {
            CourseInstance.find.mockReturnValue(
                courseFindChain([
                    {
                        _id: ciId,
                        modules: [moduleWith()],
                    },
                ])
            );

            const sources = await chatbotService.searchContent(
                "student-1",
                "algebra",
                [ciId]
            );

            expect(sources.length).toBeGreaterThanOrEqual(1);
            expect(sources.some((s) => s.source === `CourseInstance ${ciId}`)).toBe(true);
        });

        it("uses the related-question matcher when the title is not an exact match", async () => {
            CourseInstance.find.mockReturnValue(
                courseFindChain([
                    {
                        _id: ciId,
                        modules: [moduleWith({ instructions: "" })],
                    },
                ])
            );

            const sources = await chatbotService.searchContent(
                "student-1",
                "funktioner algebra",
                [ciId]
            );

            expect(sources.some((s) => s.source === `CourseInstance ${ciId}`)).toBe(true);
        });

        it("deduplicates sources keeping the highest confidence", async () => {
            const chain = {
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue([
                        {
                            _id: ciId,
                            modules: [{ title: "Algebra" }],
                        },
                        {
                            _id: ciId2,
                            modules: [{ title: "Algebra" }],
                        },
                    ]),
                }),
            };
            CourseInstance.find.mockReturnValue(chain);

            const sources = await chatbotService.searchContent(
                "student-1",
                "algebra",
                [ciId, ciId2]
            );

            expect(sources).toHaveLength(1);
        });
    });

    describe("isRelatedToQuestion", () => {
        it("matches on shared words", () => {
            expect(chatbotService.isRelatedToQuestion("Algebra och funktioner", "Vi börjar med funktioner och algebra")).toBe(true);
        });

        it("does not match on empty titles", () => {
            expect(chatbotService.isRelatedToQuestion("a", "vad som helst långt här")).toBe(false);
        });
    });

    describe("generateAnswer", () => {
        it("handles an empty source list", () => {
            expect(chatbotService.generateAnswer("hej", [])).toContain("ingen relevant information");
        });

        it("extracts a direct answer from a single high-confidence source", () => {
            const answer = chatbotService.generateAnswer("inlämning", [
                {
                    content: "Deadline för inlämning är fredag.\nStart vecka 36.",
                    confidence: 0.8,
                },
            ]);
            expect(answer).toContain("Deadline");
        });

        it("returns the raw content when no keywords are present", () => {
            const answer = chatbotService.generateAnswer("fråga", [
                {
                    content: "Detta är bara vanlig text utan nyckelord här.",
                    confidence: 0.8,
                },
            ]);
            expect(answer).toBe("Detta är bara vanlig text utan nyckelord här.");
        });

        it("returns the joined assignment contents for assignment questions", () => {
            const answer = chatbotService.generateAnswer("när är deadline", [
                { content: "inlämningsuppgift Algebra: lämnas in fredag.", confidence: 0.8 },
                { content: "inlämningsuppgift Fysik: lämnas in tisdag.", confidence: 0.8 },
            ]);
            expect(answer).toContain("inlämningsuppgift Algebra");
            expect(answer).toContain("inlämningsuppgift Fysik");
        });

        it("synthesizes from the first source when not about assignments", () => {
            const answer = chatbotService.generateAnswer("vad handlar kursen om", [
                { content: "Kursen introducerar algebra.", confidence: 0.5 },
                { content: "Kursen introducerar geometri.", confidence: 0.5 },
            ]);
            expect(answer).toContain("Kursen introducerar algebra.");
            expect(answer).toContain("ytterligare 1 källor");
        });
    });

    describe("extractDirectAnswer", () => {
        it("drops to a fallback when no keyword lines exist", () => {
            const content = "x".repeat(400);
            expect(chatbotService.extractDirectAnswer(content, "q")).toHaveLength(300);
        });
    });

    describe("calculateConfidence", () => {
        it("returns low for empty sources", () => {
            expect(chatbotService.calculateConfidence([])).toBe(0.2);
        });

        it("returns high when a high-confidence source exists", () => {
            expect(chatbotService.calculateConfidence([{ confidence: 0.8 }])).toBe(0.8);
        });

        it("returns medium for several medium sources", () => {
            expect(
                chatbotService.calculateConfidence([
                    { confidence: 0.5 },
                    { confidence: 0.5 },
                ])
            ).toBe(0.5);
        });

        it("returns low for a single medium source", () => {
            expect(chatbotService.calculateConfidence([{ confidence: 0.5 }])).toBe(0.2);
        });
    });

    describe("deduplicateSources", () => {
        it("keeps the highest confidence duplicate", () => {
            const result = chatbotService.deduplicateSources([
                { content: "A".repeat(120), confidence: 0.5 },
                { content: "A".repeat(120), confidence: 0.8 },
            ]);
            expect(result).toHaveLength(1);
            expect(result[0].confidence).toBe(0.8);
        });
    });

    describe("generateSessionId", () => {
        it("returns a session-prefixed id", () => {
            expect(chatbotService.generateSessionId()).toMatch(/^session_/);
        });
    });
});