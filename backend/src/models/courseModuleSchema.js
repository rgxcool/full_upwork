import mongoose from "mongoose";

// A section inside a module (each module contains exactly 2 sections by default).
// `instructions` holds the actual lesson/study content the student reads.
export const sectionSchema = new mongoose.Schema(
    {
        title: { type: String, default: "" },
        description: { type: String, default: "" },
        instructions: { type: String, default: "" },
    },
    { _id: false }
);

// Content inside an Avsnitt. Type-specific fields are intentionally optional
// in this slice: the hierarchy is stored, but no UI or completion rules use it.
export const contentItemSchema = new mongoose.Schema(
    {
        contentId: String,
        type: { type: String, enum: ["lektion", "lasning", "uppgift"] },
        title: { type: String, default: "" },
        order: Number,
        // Type-specific payloads, all optional in this slice.
        lektion: {
            videoUrl: String,
            durationMinutes: Number,
        },
        lasning: {
            resourceUrl: String,
            estimatedMinutes: Number,
        },
        // uppgift: embedded copy of the legacy module.assignment shape
        uppgift: {
            title: { type: String, default: "" },
            description: { type: String, default: "" },
        },
    },
    { _id: false }
);

export const avsnittSchema = new mongoose.Schema(
    {
        avsnittId: String,
        title: { type: String, default: "" },
        order: Number,
        contentItems: { type: [contentItemSchema], default: [] },
    },
    { _id: false }
);

// A module inside a course template / course card
// 5 modules by default; module 3 = partial exams, module 5 = case study
export const courseModuleSchema = new mongoose.Schema(
    {
        moduleNumber: { type: Number, required: true },
        title: { type: String, default: "" },
        isPartialExam: { type: Boolean, default: false },
        isCaseStudy: { type: Boolean, default: false },
        sections: { type: [sectionSchema], default: [] },
        // Additive content hierarchy. Legacy modules are backfilled with one
        // synthetic Avsnitt by the migration script; nothing else reads this
        // field yet, so progress/activity logic is unaffected.
        avsnitt: { type: [avsnittSchema], default: [] },
        // Optional assignment the student submits for this module. Modules
        // without an assignment contribute nothing to the course progress.
        assignment: {
            title: { type: String, default: "" },
            description: { type: String, default: "" },
        },
        // Scheduled dates (auto-applied from teacher schedule parameters)
        startDate: { type: Date },
        endDate: { type: Date },
    },
    { _id: false }
);

/**
 * Build the default 5-module structure with 2 sections each.
 * Module 3 is flagged as "partial exams" and module 5 as "case study".
 */
export const buildDefaultModules = () => {
    const modules = [];
    for (let i = 1; i <= 5; i++) {
        modules.push({
            moduleNumber: i,
            title: `Modul ${i}`,
            isPartialExam: i === 3,
            isCaseStudy: i === 5,
            sections: [
                { title: "Sektion 1", description: "", instructions: "" },
                { title: "Sektion 2", description: "", instructions: "" },
            ],
            assignment: { title: "", description: "" },
        });
    }
    return modules;
};

// Deep-clone module documents (for duplicating a template into course cards)
export const cloneModules = (modules) =>
    modules?.map((m) => ({
        moduleNumber: m.moduleNumber,
        title: m.title ?? "",
        isPartialExam: !!m.isPartialExam,
        isCaseStudy: !!m.isCaseStudy,
        sections: (m.sections || []).map((s) => ({
            title: s.title ?? "",
            description: s.description ?? "",
            instructions: s.instructions ?? "",
        })),
        assignment:
            m.assignment?.title || m.assignment?.description
                ? {
                      title: m.assignment.title ?? "",
                      description: m.assignment.description ?? "",
                  }
                : undefined,
    })) ?? [];

// ---------------------------------------------------------------------------
// Slice 1: Avsnitt backfill helpers
//
// These are pure functions used by the one-time migration script. They are
// intentionally separate from buildDefaultModules/cloneModules so that the
// existing module-creation paths keep producing exactly the same shape.
// ---------------------------------------------------------------------------

export const SYNTHETIC_AVSNITT_TITLE = "Avsnitt 1";

// A module "has an assignment" only when the legacy field carries actual
// content. This matches courseCompletionService (title or description set),
// so the default empty `{ title: "", description: "" }` placeholder does not
// turn into an invented uppgift item.
const hasAssignment = (module) =>
    !!(module?.assignment?.title || module?.assignment?.description);

export const buildSyntheticAvsnitt = (module) => {
    const moduleNumber = module?.moduleNumber;
    const avsnitt = {
        avsnittId: `m${moduleNumber}-a1`,
        title: SYNTHETIC_AVSNITT_TITLE,
        order: 1,
        contentItems: [],
    };

    if (hasAssignment(module)) {
        avsnitt.contentItems.push({
            contentId: `m${moduleNumber}-a1-c1`,
            type: "uppgift",
            title: module.assignment.title || "",
            order: 1,
            uppgift: {
                title: module.assignment.title || "",
                description: module.assignment.description || "",
            },
        });
    }

    return avsnitt;
};

/**
 * Return a module with exactly one synthetic Avsnitt when it is missing.
 *
 * An existing non-empty `avsnitt` array is treated as already migrated and is
 * returned untouched. An absent OR empty array is backfilled: Mongoose applies
 * the schema default `[]` when hydrating legacy documents, so an empty array
 * cannot be distinguished from a missing field at the model layer. The
 * migration script reads raw collections to sidestep that ambiguity, but this
 * helper stays safe for both callers.
 */
export const ensureModuleAvsnitt = (module) => {
    if (!module) return module;
    if (Array.isArray(module.avsnitt) && module.avsnitt.length > 0) return module;

    return { ...module, avsnitt: [buildSyntheticAvsnitt(module)] };
};

// Apply the backfill to a whole modules array. Returns the original array
// reference when nothing changed, which lets the migration script skip writes.
export const ensureAvsnitt = (modules) => {
    if (!Array.isArray(modules)) return modules ?? [];

    const updated = modules.map(ensureModuleAvsnitt);
    return updated.some((module, index) => module !== modules[index])
        ? updated
        : modules;
};
