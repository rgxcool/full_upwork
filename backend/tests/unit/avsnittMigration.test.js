import { describe, expect, it, vi } from "vitest";
import { migrateAvsnittForModel } from "../../src/utils/avsnittMigration.js";

const fakeModel = (docs) => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    return {
        collection: {
            find: vi.fn(() => {
                let index = 0;
                return {
                    async *[Symbol.asyncIterator]() {
                        while (index < docs.length) {
                            yield docs[index++];
                        }
                    },
                };
            }),
            updateOne,
        },
        updateOne,
    };
};

describe("migrateAvsnittForModel", () => {
    it("backfills only documents whose modules changed", async () => {
        const legacy = {
            _id: "doc-1",
            modules: [
                {
                    moduleNumber: 1,
                    assignment: { title: "Inlämning", description: "" },
                },
                { moduleNumber: 2 },
            ],
        };
        const alreadyMigrated = {
            _id: "doc-2",
            modules: [
                {
                    moduleNumber: 1,
                    avsnitt: [
                        {
                            avsnittId: "custom",
                            title: "Befintligt",
                            order: 1,
                            contentItems: [],
                        },
                    ],
                },
            ],
        };
        const Model = fakeModel([legacy, alreadyMigrated]);

        const result = await migrateAvsnittForModel(Model);

        expect(result).toEqual({ scanned: 2, migrated: 1 });
        expect(Model.collection.updateOne).toHaveBeenCalledTimes(1);
        expect(Model.collection.updateOne).toHaveBeenCalledWith(
            { _id: "doc-1" },
            {
                $set: {
                    modules: [
                        expect.objectContaining({
                            moduleNumber: 1,
                            avsnitt: [
                                expect.objectContaining({
                                    avsnittId: "m1-a1",
                                    contentItems: [
                                        expect.objectContaining({ type: "uppgift" }),
                                    ],
                                }),
                            ],
                        }),
                        expect.objectContaining({
                            moduleNumber: 2,
                            avsnitt: [
                                expect.objectContaining({
                                    avsnittId: "m2-a1",
                                    contentItems: [],
                                }),
                            ],
                        }),
                    ],
                },
            }
        );
    });

    it("is idempotent on a second run", async () => {
        const doc = {
            _id: "doc-1",
            modules: [{ moduleNumber: 3, title: "Delprov" }],
        };
        const Model = fakeModel([doc]);

        const first = await migrateAvsnittForModel(Model);
        expect(first).toEqual({ scanned: 1, migrated: 1 });

        // Feed back the persisted shape (the field is now present and non-empty).
        const migratedDoc = Model.collection.updateOne.mock.calls[0][1].$set;
        const secondModel = fakeModel([{ _id: doc._id, ...migratedDoc }]);
        const second = await migrateAvsnittForModel(secondModel);

        expect(second).toEqual({ scanned: 1, migrated: 0 });
        expect(secondModel.collection.updateOne).not.toHaveBeenCalled();
    });

    it("does not write when there are no modules", async () => {
        const Model = fakeModel([
            { _id: "doc-1", modules: [] },
            { _id: "doc-2" },
        ]);

        const result = await migrateAvsnittForModel(Model);

        expect(result).toEqual({ scanned: 2, migrated: 0 });
        expect(Model.collection.updateOne).not.toHaveBeenCalled();
    });
});
