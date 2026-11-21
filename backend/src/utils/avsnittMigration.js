import { ensureAvsnitt } from "../models/courseModuleSchema.js";

/**
 * Backfill the synthetic Avsnitt on every module of a collection.
 *
 * Reads via the raw collection (not the Mongoose model) so that schema
 * defaults such as `avsnitt: []` are not injected into legacy documents —
 * an absent field and an empty default must both be treated as "needs
 * migration". Only documents whose modules actually changed are written.
 *
 * @param {import('mongoose').Model} Model Mongoose model whose documents carry a `modules` array
 * @returns {Promise<{ scanned: number, migrated: number }>}
 */
export const migrateAvsnittForModel = async (Model) => {
    const collection = Model.collection;
    const cursor = collection.find({});

    let scanned = 0;
    let migrated = 0;

    for await (const doc of cursor) {
        scanned += 1;
        const modules = doc.modules || [];
        const updated = ensureAvsnitt(modules);

        if (updated !== modules) {
            await collection.updateOne(
                { _id: doc._id },
                { $set: { modules: updated } }
            );
            migrated += 1;
        }
    }

    return { scanned, migrated };
};
