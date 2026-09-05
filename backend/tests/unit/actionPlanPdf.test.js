import { beforeEach, describe, expect, it, vi } from "vitest";

const planFixture = {
    studentId: "stu-1",
    courseId: "course-1",
    studentName: "Anna Andersson",
    courseName: "Matematik 1",
    teacherName: "Lärare",
    date: "2025-02-01",
    reason: "Behöver stöd",
    schoolEfforts: ["Extra handledning"],
    studentEfforts: "Öva stöd",
    studyTime: "2h",
    meetings: ["Möte A"],
    notified: "Nej",
    answers: { freeField: "xyz" },
    createdAt: "2025-02-01T10:00:00.000Z",
    _id: "plan-1",
};

vi.mock("../../src/models/Student.js", () => ({
    default: { findById: vi.fn() },
}));
vi.mock("../../src/models/ActionPlanQuestions.js", () => ({
    default: { findOne: vi.fn() },
}));
vi.mock("../../src/models/Course.js", () => ({
    default: { findById: vi.fn() },
}));

import Student from "../../src/models/Student.js";
import FormQuestions from "../../src/models/ActionPlanQuestions.js";
import Course from "../../src/models/Course.js";
import { buildActionPlanPdf, getOrBuildActionPlanPdf } from "../../src/services/actionPlanPdf.js";

function makePlanDoc(overrides = {}) {
    const source = { ...planFixture, ...overrides };
    return {
        ...source,
        toObject: () => JSON.parse(JSON.stringify(source)),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

describe("getOrBuildActionPlanPdf", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Student.findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({ _id: "stu-1", name: "Anna Andersson" }),
        });
        FormQuestions.findOne.mockReturnValue({
            lean: () => ({
                catch: () =>
                    Promise.resolve({
                        questions: [{ key: "freeField", label: "Fritext" }],
                    }),
            }),
        });
        Course.findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: () => ({
                    catch: () => Promise.resolve({ courseName: "Matematik 1" }),
                }),
            }),
        });
    });

    it("returns the already-generated pdf without touching the database", async () => {
        const plan = makePlanDoc({ pdf: Buffer.from("%PDF-1.4 cached") });
        const pdf = await getOrBuildActionPlanPdf(plan);

        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(Student.findById).not.toHaveBeenCalled();
        expect(plan.save).not.toHaveBeenCalled();
    });

    it("builds and caches a pdf when the plan has none", async () => {
        const plan = makePlanDoc();
        const pdf = await getOrBuildActionPlanPdf(plan);

        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
        expect(Student.findById).toHaveBeenCalledWith("stu-1");
        expect(Course.findById).not.toHaveBeenCalled();
        expect(plan.save).toHaveBeenCalledTimes(1);
    });

    it("resolves the course name from the course when the plan has none", async () => {
        const plan = makePlanDoc({ courseName: undefined });
        await getOrBuildActionPlanPdf(plan);

        expect(Course.findById).toHaveBeenCalledWith("course-1");
    });

    it("falls back to plan.studentName when the student lookup returns nothing", async () => {
        Student.findById.mockReturnValue({
            select: vi.fn().mockResolvedValue(null),
        });
        const plan = makePlanDoc();
        const pdf = await getOrBuildActionPlanPdf(plan);

        expect(pdf.toString("latin1")).toContain("Anna Andersson");
    });

    it("tolerates a missing form config and keeps the pdf cached", async () => {
        FormQuestions.findOne.mockReturnValue({
            lean: () => ({ catch: () => Promise.resolve(null) }),
        });
        Course.findById.mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: () => ({
                    catch: () => Promise.resolve(null),
                }),
            }),
        });
        const plan = makePlanDoc({ courseName: undefined });
        await getOrBuildActionPlanPdf(plan);

        expect(plan.pdf).toBeDefined();
        expect(plan.save).toHaveBeenCalledTimes(1);
    });
});

describe("buildActionPlanPdf", () => {
    it("renders minimal plans and skips empty sections", () => {
        const pdf = buildActionPlanPdf({
            plan: { studentName: "Elev", createdAt: "not-a-date" },
            studentName: "",
            courseName: "",
            questions: [],
        });

        const content = pdf.toString("latin1");
        expect(content.startsWith("%PDF-")).toBe(true);
        expect(content).toContain("Elev");
    });

    it("renders a locked plan with full details", () => {
        const pdf = buildActionPlanPdf({
            plan: {
                ...planFixture,
                locked: true,
                lockedAt: "2025-03-01T00:00:00.000Z",
                schoolEfforts: ["A", "", null, "B"],
                studentEfforts: [],
            },
            studentName: "Anna Andersson",
            courseName: "Matematik 1",
            questions: [],
        });

        const content = pdf.toString("latin1");
        expect(content).toContain("Handlingsplanen är låst.");
        expect(content).toContain("A");
        expect(content).toContain("B");
    });
});