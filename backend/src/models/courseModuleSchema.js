import mongoose from "mongoose";

// A section inside a module (each module contains exactly 2 sections by default).
// `instructions` holds the actual lesson/study content the student reads.
export const sectionSchema = new mongoose.Schema(
    {
        title: { type: String, default: "" },
        description: { type: String, default: "" },
        instructions: { type: String, default: "" },
        blocks: { type: [mongoose.Schema.Types.Mixed], default: [] },
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
        // Slice 4: planned submission date for this Avsnitt. Module dates stay
        // authoritative for scheduling; this is the Avsnitt-level planning value.
        plannedDate: { type: Date, default: null },
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

// Mongoose subdocuments must be converted before spreading: spreading one
// directly copies internals (`$__`, `_doc`, ...) instead of the stored fields.
const toPlainObject = (value) =>
    value && typeof value.toObject === "function"
        ? value.toObject({ minimize: false })
        : value;

// Clone one Avsnitt (and its content items) without sharing nested references.
const cloneAvsnitt = (rawAvsnitt) => {
    const avsnitt = toPlainObject(rawAvsnitt);
    return {
        avsnittId: avsnitt.avsnittId,
        title: avsnitt.title ?? "",
        order: avsnitt.order,
        // Dates are instance-specific (D7): never carry a template's planned
        // date into a newly cloned course instance.
        plannedDate: null,
        contentItems: (avsnitt.contentItems || []).map((rawItem) => {
            const item = toPlainObject(rawItem);
            const cloned = {
                contentId: item.contentId,
                type: item.type,
                title: item.title ?? "",
                order: item.order,
            };
            for (const payload of ["lektion", "lasning", "uppgift"]) {
                if (item[payload]) cloned[payload] = { ...toPlainObject(item[payload]) };
            }
            return cloned;
        }),
    };
};

// Deep-clone module documents (for duplicating a template into course cards)
export const cloneModules = (modules) =>
    modules?.map((rawModule) => {
        const m = toPlainObject(rawModule);
        return {
            moduleNumber: m.moduleNumber,
            title: m.title ?? "",
            isPartialExam: !!m.isPartialExam,
            isCaseStudy: !!m.isCaseStudy,
            sections: (m.sections || []).map((rawSection) => {
                const s = toPlainObject(rawSection);
                return {
                    title: s.title ?? "",
                    description: s.description ?? "",
                    instructions: s.instructions ?? "",
                    ...(Array.isArray(s.blocks) && s.blocks.length > 0
                        ? { blocks: s.blocks }
                        : {}),
                };
            }),
            // Preserve the hierarchy when cloning already-migrated templates.
            // Templates without Avsnitt are left untouched (the migration
            // script is responsible for backfilling them).
            ...(Array.isArray(m.avsnitt)
                ? { avsnitt: m.avsnitt.map(cloneAvsnitt) }
                : {}),
            assignment:
                m.assignment?.title || m.assignment?.description
                    ? {
                          title: m.assignment.title ?? "",
                          description: m.assignment.description ?? "",
                      }
                    : undefined,
        };
    }) ?? [];

// ---------------------------------------------------------------------------
// Slice 1: Avsnitt backfill helpers
//
// These are pure functions used by the one-time migration script. They are
// intentionally separate from buildDefaultModules/cloneModules so that the
// existing module-creation paths keep producing exactly the same shape.
// ---------------------------------------------------------------------------

export const SYNTHETIC_AVSNITT_TITLE = "Avsnitt 1";

// Slice 4 / D8: a synthetic Avsnitt inherits the module's start date when one
// exists. Invalid or missing values stay null rather than producing Invalid Date.
const toPlannedDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isSyntheticAvsnitt = (moduleNumber, avsnitt) =>
    avsnitt?.avsnittId === `m${moduleNumber}-a1`;

// Backfill plannedDate on already-migrated synthetic Avsnitt. Custom Avsnitt
// are left alone, and the original module reference is kept when nothing changes.
const ensureSyntheticPlannedDates = (module) => {
    if (!Array.isArray(module.avsnitt) || module.avsnitt.length === 0) return module;

    let changed = false;
    const avsnitt = module.avsnitt.map((rawAvsnitt) => {
        if (!isSyntheticAvsnitt(module.moduleNumber, rawAvsnitt)) return rawAvsnitt;

        const current = toPlainObject(rawAvsnitt);
        if (current.plannedDate !== undefined && current.plannedDate !== null) {
            return rawAvsnitt;
        }
        const plannedDate = toPlannedDate(module.startDate);
        if (current.plannedDate === plannedDate) return rawAvsnitt;

        changed = true;
        return { ...current, plannedDate };
    });

    if (!changed) return module;
    return { ...toPlainObject(module), avsnitt };
};

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
        plannedDate: toPlannedDate(module?.startDate),
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
 * An existing non-empty `avsnitt` array is treated as already migrated: its
 * structure is preserved, but a synthetic Avsnitt that still lacks `plannedDate`
 * is backfilled from the module's start date (Slice 4 / D8). An absent OR empty
 * array is backfilled with a fresh synthetic Avsnitt. Mongoose applies the
 * schema default `[]` when hydrating legacy documents, so an empty array cannot
 * be distinguished from a missing field at the model layer. The migration
 * script reads raw collections to sidestep that ambiguity, but this helper
 * stays safe for both callers.
 */
export const ensureModuleAvsnitt = (module) => {
    if (!module) return module;
    if (Array.isArray(module.avsnitt) && module.avsnitt.length > 0) {
        return ensureSyntheticPlannedDates(module);
    }

    const plain = toPlainObject(module);
    return { ...plain, avsnitt: [buildSyntheticAvsnitt(plain)] };
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
