import { describe, it, expect } from "vitest";
import {
    avsnittSchema,
    buildDefaultModules,
    buildSyntheticAvsnitt,
    cloneModules,
    ensureAvsnitt,
    ensureModuleAvsnitt,
    SYNTHETIC_AVSNITT_TITLE,
} from "../../src/models/courseModuleSchema.js";

describe("courseModuleSchema helpers", () => {
    it("defaults Avsnitt plannedDate to a nullable Date", () => {
        expect(avsnittSchema.path("plannedDate").instance).toBe("Date");
        expect(avsnittSchema.path("plannedDate").defaultValue).toBeNull();
    });

    it("builds 5 modules with 2 sections each", () => {
        const modules = buildDefaultModules();

        expect(modules).toHaveLength(5);
        for (const module of modules) {
            expect(module.sections).toHaveLength(2);
        }
    });

    it("seeds empty instructions and assignment on every default module/section", () => {
        const modules = buildDefaultModules();

        for (const module of modules) {
            for (const section of module.sections) {
                expect(section).toHaveProperty("instructions", "");
            }
            expect(module).toHaveProperty("assignment");
            expect(module.assignment.title).toBe("");
            expect(module.assignment.description).toBe("");
        }
    });

    it("flags module 3 as partial exams and module 5 as case study", () => {
        const modules = buildDefaultModules();

        expect(modules[2].isPartialExam).toBe(true);
        expect(modules[2].isCaseStudy).toBe(false);
        expect(modules[4].isCaseStudy).toBe(true);
        expect(modules[4].isPartialExam).toBe(false);
        expect(modules[0].isPartialExam).toBe(false);
        expect(modules[0].isCaseStudy).toBe(false);
    });

    it("numbers modules 1 through 5", () => {
        const modules = buildDefaultModules();
        expect(modules.map((m) => m.moduleNumber)).toEqual([1, 2, 3, 4, 5]);
    });

    it("returns [] when cloning nothing", () => {
        expect(cloneModules()).toEqual([]);
        expect(cloneModules(null)).toEqual([]);
        expect(cloneModules([])).toEqual([]);
    });

    it("deep-clones modules and fills missing flags", () => {
        const original = [
            {
                moduleNumber: 3,
                title: "Delprov",
                isPartialExam: true,
                sections: [{ title: "S1", description: "d1" }],
            },
        ];
        const cloned = cloneModules(original);

        expect(cloned).toEqual([
            {
                moduleNumber: 3,
                title: "Delprov",
                isPartialExam: true,
                isCaseStudy: false,
                sections: [{ title: "S1", description: "d1", instructions: "" }],
            },
        ]);
        expect(cloned[0]).not.toBe(original[0]);
        expect(cloned[0].sections[0]).not.toBe(original[0].sections[0]);
    });

    it("clones section instructions and module assignment", () => {
        const original = [
            {
                moduleNumber: 1,
                title: "Modul 1",
                sections: [
                    { title: "S1", description: "d1", instructions: "Läs texten." },
                    { title: "S2", description: "d2" },
                ],
                assignment: { title: "Inlämning", description: "Skriv en text." },
            },
        ];
        const cloned = cloneModules(original);

        expect(cloned[0].sections[0].instructions).toBe("Läs texten.");
        expect(cloned[0].sections[1].instructions).toBe("");
        expect(cloned[0].assignment).toEqual({
            title: "Inlämning",
            description: "Skriv en text.",
        });
    });

    it("omits empty assignment objects when cloning", () => {
        const original = [
            {
                moduleNumber: 2,
                title: "Modul 2",
                sections: [{ title: "S1" }],
                assignment: { title: "", description: "" },
            },
        ];
        const cloned = cloneModules(original);

        expect(cloned[0].assignment).toBeUndefined();
    });

    it("deep-clones the Avsnitt hierarchy but clears its planned date", () => {
        const plannedDate = new Date("2026-11-16T00:00:00.000Z");
        const original = [
            {
                moduleNumber: 1,
                avsnitt: [
                    {
                        avsnittId: "m1-a1",
                        title: "Avsnitt 1",
                        order: 1,
                        plannedDate,
                        contentItems: [
                            {
                                contentId: "c1",
                                type: "lektion",
                                title: "Film",
                                order: 1,
                                lektion: { videoUrl: "v", durationMinutes: 5 },
                            },
                            {
                                contentId: "c2",
                                type: "lasning",
                                title: "Text",
                                order: 2,
                                lasning: { resourceUrl: "r", estimatedMinutes: 10 },
                            },
                            {
                                contentId: "c3",
                                type: "uppgift",
                                title: "Skriv",
                                order: 3,
                                uppgift: { title: "Skriv", description: "d" },
                            },
                        ],
                    },
                ],
            },
        ];

        const cloned = cloneModules(original);

        // D7: a template's absolute date must never leak into a new instance.
        expect(cloned[0].avsnitt[0].plannedDate).toBeNull();
        expect(cloned[0].avsnitt[0].contentItems).toEqual(
            original[0].avsnitt[0].contentItems
        );
        expect(cloned[0].avsnitt[0]).not.toBe(original[0].avsnitt[0]);
        expect(cloned[0].avsnitt[0].contentItems[0]).not.toBe(
            original[0].avsnitt[0].contentItems[0]
        );
        expect(cloned[0].avsnitt[0].contentItems[0].lektion).not.toBe(
            original[0].avsnitt[0].contentItems[0].lektion
        );
    });

    it("clones Mongoose-like module and Avsnitt subdocuments via toObject", () => {
        const contentDoc = {
            toObject: () => ({
                contentId: "c1",
                type: "lektion",
                title: "Film",
                order: 1,
                lektion: { videoUrl: "u", durationMinutes: 2 },
            }),
        };
        const avsnittDoc = {
            toObject: () => ({
                avsnittId: "m2-a1",
                title: "Avsnitt 1",
                order: 1,
                contentItems: [contentDoc],
            }),
        };
        const moduleDoc = {
            toObject: () => ({
                moduleNumber: 2,
                title: "Modul 2",
                avsnitt: [avsnittDoc],
            }),
        };

        const cloned = cloneModules([moduleDoc]);

        expect(cloned[0].moduleNumber).toBe(2);
        expect(cloned[0].avsnitt[0].contentItems[0]).toEqual({
            contentId: "c1",
            type: "lektion",
            title: "Film",
            order: 1,
            lektion: { videoUrl: "u", durationMinutes: 2 },
        });
    });
});

describe("Avsnitt backfill helpers", () => {
    it("creates one synthetic Avsnitt with a deterministic id", () => {
        const avsnitt = buildSyntheticAvsnitt({
            moduleNumber: 3,
            title: "Delprov",
        });

        expect(avsnitt).toEqual({
            avsnittId: "m3-a1",
            title: SYNTHETIC_AVSNITT_TITLE,
            order: 1,
            plannedDate: null,
            contentItems: [],
        });
        expect(SYNTHETIC_AVSNITT_TITLE).toBe("Avsnitt 1");
    });

    it("inherits the module start date as the synthetic Avsnitt planned date", () => {
        const startDate = new Date("2026-11-16T00:00:00.000Z");

        expect(buildSyntheticAvsnitt({ moduleNumber: 1, startDate }).plannedDate).toEqual(
            startDate
        );
        expect(
            buildSyntheticAvsnitt({
                moduleNumber: 2,
                startDate: "2026-11-23T00:00:00.000Z",
            }).plannedDate
        ).toEqual(new Date("2026-11-23T00:00:00.000Z"));
        expect(
            buildSyntheticAvsnitt({ moduleNumber: 3, startDate: "not-a-date" }).plannedDate
        ).toBeNull();
    });

    it("backfills plannedDate on an already-migrated synthetic Avsnitt", () => {
        const startDate = new Date("2026-11-16T00:00:00.000Z");
        const module = {
            moduleNumber: 1,
            startDate,
            avsnitt: [
                {
                    avsnittId: "m1-a1",
                    title: SYNTHETIC_AVSNITT_TITLE,
                    order: 1,
                    contentItems: [],
                },
            ],
        };

        const migrated = ensureModuleAvsnitt(module);

        expect(migrated).not.toBe(module);
        expect(migrated.avsnitt[0].plannedDate).toEqual(startDate);
        expect(module.avsnitt[0].plannedDate).toBeUndefined();
        expect(ensureModuleAvsnitt(migrated)).toBe(migrated);
    });

    it("leaves custom Avsnitt untouched and stays idempotent without a start date", () => {
        const custom = {
            avsnittId: "custom",
            title: "Egna avsnittet",
            order: 1,
            contentItems: [],
        };
        const module = { moduleNumber: 2, avsnitt: [custom] };

        expect(ensureModuleAvsnitt(module)).toBe(module);

        const synthetic = {
            avsnittId: "m2-a1",
            title: SYNTHETIC_AVSNITT_TITLE,
            order: 1,
            contentItems: [],
        };
        const withoutStart = { moduleNumber: 2, avsnitt: [synthetic] };
        const migrated = ensureModuleAvsnitt(withoutStart);

        expect(migrated.avsnitt[0].plannedDate).toBeNull();
        expect(ensureModuleAvsnitt(migrated)).toBe(migrated);
    });

    it("keeps the legacy assignment field and copies it into an uppgift item", () => {
        const module = {
            moduleNumber: 2,
            title: "Skrivande",
            assignment: { title: "Inlämning", description: "Skriv en text." },
        };

        const migrated = ensureModuleAvsnitt(module);

        expect(migrated.assignment).toEqual({
            title: "Inlämning",
            description: "Skriv en text.",
        });
        expect(migrated.avsnitt).toEqual([
            {
                avsnittId: "m2-a1",
                title: "Avsnitt 1",
                order: 1,
                plannedDate: null,
                contentItems: [
                    {
                        contentId: "m2-a1-c1",
                        type: "uppgift",
                        title: "Inlämning",
                        order: 1,
                        uppgift: {
                            title: "Inlämning",
                            description: "Skriv en text.",
                        },
                    },
                ],
            },
        ]);
        // Input is not mutated.
        expect(module.avsnitt).toBeUndefined();
    });

    it("leaves the Avsnitt empty when the module has no assignment", () => {
        const migrated = ensureModuleAvsnitt({
            moduleNumber: 4,
            title: "Utan uppgift",
        });

        expect(migrated.avsnitt).toHaveLength(1);
        expect(migrated.avsnitt[0].contentItems).toEqual([]);
    });

    it("does not invent items from the default empty assignment placeholder", () => {
        const migrated = ensureModuleAvsnitt({
            moduleNumber: 1,
            assignment: { title: "", description: "" },
        });

        expect(migrated.avsnitt[0].contentItems).toEqual([]);
    });

    it("treats existing non-empty Avsnitt as already migrated", () => {
        const existing = [
            {
                avsnittId: "custom",
                title: "Egna avsnittet",
                order: 7,
                contentItems: [
                    { contentId: "lektion-1", type: "lektion", title: "Film", order: 1 },
                ],
            },
        ];
        const module = {
            moduleNumber: 1,
            avsnitt: existing,
            assignment: { title: "Inlämning", description: "" },
        };

        const migrated = ensureModuleAvsnitt(module);

        expect(migrated).toBe(module);
        expect(migrated.avsnitt).toEqual(existing);
        expect(migrated.avsnitt).toHaveLength(1);
    });

    it("backfills an empty avsnitt array (the Mongoose default on legacy docs)", () => {
        const module = { moduleNumber: 5, avsnitt: [] };

        const migrated = ensureModuleAvsnitt(module);

        expect(migrated).not.toBe(module);
        expect(migrated.avsnitt).toEqual([
            expect.objectContaining({ avsnittId: "m5-a1", title: "Avsnitt 1" }),
        ]);
    });

    it("backfills a Mongoose-like module without leaking subdocument internals", () => {
        const module = {
            $__: { internal: true },
            toObject: () => ({
                moduleNumber: 6,
                title: "Modul 6",
                assignment: { title: "Inlämning", description: "" },
                avsnitt: [],
            }),
        };

        const migrated = ensureModuleAvsnitt(module);

        expect(migrated.$__).toBeUndefined();
        expect(migrated.toObject).toBeUndefined();
        expect(migrated.avsnitt[0].avsnittId).toBe("m6-a1");
        expect(migrated.avsnitt[0].contentItems[0].contentId).toBe("m6-a1-c1");
    });

    it("ensures Avsnitt across a modules array without changing untouched modules", () => {
        const migratedModule = { moduleNumber: 1, title: "Modul 1" };
        const alreadyMigrated = {
            moduleNumber: 2,
            avsnitt: [{ avsnittId: "keep", title: "Befintligt", order: 1, contentItems: [] }],
        };
        const modules = [migratedModule, alreadyMigrated];

        const updated = ensureAvsnitt(modules);

        expect(updated).not.toBe(modules);
        expect(updated[0].avsnitt[0].avsnittId).toBe("m1-a1");
        expect(updated[1]).toBe(alreadyMigrated);
        expect(ensureAvsnitt(updated)).toBe(updated);
    });

    it("handles empty module lists", () => {
        expect(ensureAvsnitt()).toEqual([]);
        expect(ensureAvsnitt([])).toEqual([]);
    });
});
