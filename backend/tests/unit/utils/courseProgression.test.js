import { describe, it, expect } from "vitest";
import {
    applyProgression,
    computeStepStates,
    isAssignmentUnlocked,
    isSectionUnlocked,
    lockedModuleNumbers,
    LOCKED_SECTION_TEXT,
} from "../../../src/utils/courseProgression.js";

// Shape mirrors CourseInstance.modules (courseModuleSchema): moduleNumber,
// sections[] and an optional assignment. Deliberately out of order to prove
// the sequence follows moduleNumber, not array position.
const buildModules = () => [
    {
        moduleNumber: 2,
        title: "Modul 2",
        sections: [{ title: "Avsnitt 2.1", instructions: "Innehåll 2.1" }],
    },
    {
        moduleNumber: 1,
        title: "Introduktion",
        instructions: "Välkommen",
        sections: [
            { title: "Kom igång", instructions: "Innehåll 1.1", blocks: [{ type: "image", url: "/x.png" }] },
            { title: "Frågor och svar", instructions: "Innehåll 1.2" },
        ],
        assignment: { title: "Uppgift 1", description: "Skriv en presentation" },
    },
    {
        moduleNumber: 3,
        title: "Innehåll dolt",
        isHiddenFromStudent: true,
        sections: [{ title: "Dold" }],
    },
];

const none = { completedSections: [], submittedModuleNumbers: [] };
const introDone = {
    completedSections: [
        { moduleNumber: 1, sectionIndex: 0 },
        { moduleNumber: 1, sectionIndex: 1 },
    ],
    submittedModuleNumbers: [1],
};

describe("courseProgression", () => {
    it("opens only the first section of the first module at the start", () => {
        const modules = buildModules();
        expect(isSectionUnlocked(modules, 1, 0, none)).toBe(true);
        expect(isSectionUnlocked(modules, 1, 1, none)).toBe(false);
        expect(isAssignmentUnlocked(modules, 1, none)).toBe(false);
        expect(isSectionUnlocked(modules, 2, 0, none)).toBe(false);
        expect([...lockedModuleNumbers(modules, none)]).toEqual([2]);
    });

    it("strips the content of locked steps", () => {
        const [intro, second] = applyProgression(buildModules(), none);
        expect(intro.locked).toBe(false);
        expect(intro.sections[0]).toMatchObject({ locked: false, instructions: "Innehåll 1.1" });
        expect(intro.sections[1]).toEqual({
            title: "Frågor och svar",
            description: "",
            instructions: LOCKED_SECTION_TEXT,
            blocks: [],
            locked: true,
            completed: false,
        });
        expect(intro.assignmentLocked).toBe(true);
        expect(intro.assignment).toEqual({ title: "Uppgift 1", description: "" });
        expect(second.locked).toBe(true);
        expect(second.sections[0].instructions).toBe(LOCKED_SECTION_TEXT);
    });

    it("requires the assignment to be submitted before the next module opens", () => {
        const modules = buildModules();
        const sectionsOnly = { ...introDone, submittedModuleNumbers: [] };
        expect(isAssignmentUnlocked(modules, 1, sectionsOnly)).toBe(true);
        expect(isSectionUnlocked(modules, 2, 0, sectionsOnly)).toBe(false);
        expect(isSectionUnlocked(modules, 2, 0, introDone)).toBe(true);
    });

    it("accepts submitted module numbers as strings (Object.keys of submissions)", () => {
        const modules = buildModules();
        expect(isSectionUnlocked(modules, 2, 0, { ...introDone, submittedModuleNumbers: ["1"] })).toBe(true);
    });

    it("marks a module completed when all its steps are done", () => {
        const [intro, second] = applyProgression(buildModules(), introDone);
        expect(intro.completed).toBe(true);
        expect(second.locked).toBe(false);
        expect(second.completed).toBe(false);
    });

    it("skips hidden modules and leaves them untouched", () => {
        const modules = buildModules();
        const states = computeStepStates(modules, none);
        expect(states.has("3:0")).toBe(false);
        const hidden = applyProgression(modules, none).find((m) => m.moduleNumber === 3);
        expect(hidden).toEqual(modules[2]);
    });

    it("rejects sections and assignments that do not exist", () => {
        const modules = buildModules();
        expect(isSectionUnlocked(modules, 1, 5, introDone)).toBe(false);
        expect(isSectionUnlocked(modules, 9, 0, introDone)).toBe(false);
        expect(isAssignmentUnlocked(modules, 2, introDone)).toBe(false);
    });
});
