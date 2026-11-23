// Stegvis upplåsning (sequential unlock, issue #112).
//
// Mirrors how Mindful builds courses in itslearning: the course is one ordered
// sequence. Module 1 (Introduktion) comes first, then each module's sections in
// order, then that module's assignment (if it has one). A step opens only when
// every earlier step is done:
//   - a section is done when the student has marked it as done
//   - an assignment is done when the student has submitted it (feedback is
//     not required, so students are not stuck waiting for the teacher)
// Modules hidden from students are skipped and never block progress.
//
// Locked content is stripped here, on the server, so it never reaches the
// browser.

export const LOCKED_SECTION_TEXT = "Slutför föregående steg för att låsa upp det här avsnittet.";

// Accepts hydrated subdocuments, `.lean()` objects, and the `{ ...subdoc, title }`
// spreads buildVisibleModules can return (those carry the real fields in `_doc`).
const toPlain = (value) => {
    if (!value) return value;
    if (typeof value.toObject === "function") return value.toObject();
    if (value._doc) {
        const overrides = Object.fromEntries(
            Object.entries(value).filter(([key]) => key !== "_doc" && !key.startsWith("$"))
        );
        const base = typeof value._doc.toObject === "function" ? value._doc.toObject() : value._doc;
        return { ...base, ...overrides };
    }
    return value;
};

const hasAssignment = (module) => !!(module?.assignment?.title || module?.assignment?.description);

const sectionKey = (moduleNumber, sectionIndex) => `${Number(moduleNumber)}:${Number(sectionIndex)}`;

const sortedModules = (modules) =>
    [...(modules || [])].map(toPlain).sort((a, b) => Number(a.moduleNumber) - Number(b.moduleNumber));

const buildCompletedSet = (completedSections) =>
    new Set((completedSections || []).map((c) => sectionKey(c.moduleNumber, c.sectionIndex)));

const buildSubmittedSet = (submittedModuleNumbers) =>
    new Set([...(submittedModuleNumbers || [])].map((n) => Number(n)));

/**
 * Walk the course in order and return the state of every step.
 * @returns {Map<string, {locked: boolean, completed: boolean}>} keyed by
 *   "m:s" for sections, "m:assignment" for assignments and "m:module" for
 *   whether the module itself is reached yet.
 */
export const computeStepStates = (modules, { completedSections, submittedModuleNumbers } = {}) => {
    const completed = buildCompletedSet(completedSections);
    const submitted = buildSubmittedSet(submittedModuleNumbers);
    const states = new Map();
    let blocked = false;

    for (const module of sortedModules(modules)) {
        if (module.isHiddenFromStudent) continue;
        const moduleNumber = Number(module.moduleNumber);
        states.set(`${moduleNumber}:module`, { locked: blocked, completed: false });
        (module.sections || []).forEach((_section, index) => {
            const key = sectionKey(moduleNumber, index);
            const isDone = completed.has(key);
            states.set(key, { locked: blocked, completed: isDone });
            if (!isDone) blocked = true;
        });
        if (hasAssignment(module)) {
            const isDone = submitted.has(moduleNumber);
            states.set(`${moduleNumber}:assignment`, { locked: blocked, completed: isDone });
            if (!isDone) blocked = true;
        }
    }
    return states;
};

/** True when the given section exists and every earlier step is done. */
export const isSectionUnlocked = (modules, moduleNumber, sectionIndex, progress) => {
    const state = computeStepStates(modules, progress).get(sectionKey(moduleNumber, sectionIndex));
    return !!state && !state.locked;
};

/** True when the module's assignment exists and every earlier step is done. */
export const isAssignmentUnlocked = (modules, moduleNumber, progress) => {
    const state = computeStepStates(modules, progress).get(`${Number(moduleNumber)}:assignment`);
    return !!state && !state.locked;
};

/**
 * Student-facing module list with lock state. Locked sections keep only their
 * title; locked assignments keep only their title. Each module gets
 * `locked` (an earlier step is not done yet) and `completed` (all its steps are done).
 */
export const applyProgression = (modules, progress = {}) => {
    const states = computeStepStates(modules, progress);

    return sortedModules(modules).map((module) => {
        if (module.isHiddenFromStudent) return module;
        const moduleNumber = Number(module.moduleNumber);
        const stepStates = [];

        const sections = (module.sections || []).map((section, index) => {
            const state = states.get(sectionKey(moduleNumber, index)) || { locked: false, completed: false };
            stepStates.push(state);
            if (state.locked) {
                return { title: section.title || "", description: "", instructions: LOCKED_SECTION_TEXT, blocks: [], locked: true, completed: false };
            }
            return { ...section, locked: false, completed: state.completed };
        });

        const result = { ...module, sections };
        if (hasAssignment(module)) {
            const state = states.get(`${moduleNumber}:assignment`);
            stepStates.push(state);
            result.assignmentLocked = state.locked;
            result.assignmentCompleted = state.completed;
            if (state.locked) {
                result.assignment = { title: module.assignment.title || "Inlämningsuppgift", description: "" };
            }
        }

        result.locked = states.get(`${moduleNumber}:module`).locked;
        result.completed = stepStates.length > 0 && stepStates.every((s) => s.completed);
        if (result.locked) result.instructions = "";
        return result;
    });
};

/** Module numbers the student has not reached yet (for module-level content). */
export const lockedModuleNumbers = (modules, progress = {}) => {
    const locked = new Set();
    for (const [key, state] of computeStepStates(modules, progress)) {
        if (key.endsWith(":module") && state.locked) locked.add(Number(key.split(":")[0]));
    }
    return locked;
};
