import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { pathToFileURL } from "url";
import CourseInstance from "../src/models/CourseInstance.js";
import CourseTemplate from "../src/models/CourseTemplate.js";
import { migrateAvsnittForModel } from "../src/utils/avsnittMigration.js";

// Match the env-file selection used by the other migration scripts.
let envFile = "../.env.development";
if (process.env.NODE_ENV === "production") {
    envFile = "../.env.production";
} else if (process.env.NODE_ENV === "test") {
    envFile = "../.env.test";
}
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

export const runMigration = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    try {
        for (const [label, Model] of [
            ["CourseInstance", CourseInstance],
            ["CourseTemplate", CourseTemplate],
        ]) {
            const { scanned, migrated } = await migrateAvsnittForModel(Model);
            console.log(
                `${label}: scanned ${scanned}, migrated ${migrated}`
            );
        }
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
};

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    runMigration().catch((err) => {
        console.error("Avsnitt migration failed:", err);
        process.exitCode = 1;
    });
}
