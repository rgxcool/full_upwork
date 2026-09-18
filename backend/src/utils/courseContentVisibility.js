// Student-facing view of a course instance's module list.
// Teachers author a per-module content map (`instance.content`) with optional
// `isHiddenFromStudent` flags; this overlays that content onto the cloned
// template modules and swaps hidden modules for a placeholder so students never
// see unreleased content. Mirror of the filtering in getCourseInstanceContent.
export const HIDDEN_MODULE_TITLE = "Innehåll dolt";
export const HIDDEN_MODULE_INSTRUCTIONS = "Detta innehåll döljs för studenter.";

export const buildVisibleModules = (modules, content, { applyStudentVisibility = false } = {}) =>
    (modules || []).map((module) => {
        const entry = content?.get ? content.get(Number(module.moduleNumber)) : undefined;
        if (!entry) return module;

        if (applyStudentVisibility && entry.isHiddenFromStudent) {
            return {
                ...module,
                title: HIDDEN_MODULE_TITLE,
                instructions: HIDDEN_MODULE_INSTRUCTIONS,
                isHiddenFromStudent: true,
            };
        }

        const patch = {};
        if (entry.title) patch.title = entry.title;
        if (entry.instructions) patch.instructions = entry.instructions;
        if (Object.keys(patch).length === 0) return module;
        return { ...module, ...patch };
    });