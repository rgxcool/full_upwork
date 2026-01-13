import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { parseCourses } from "./courseParser.js";
import { parseCoursePackages } from "./coursePackageParser.js";

// Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env based on NODE_ENV
let envFile = ".env.development";
if (process.env.NODE_ENV === "production") {
    envFile = ".env.production";
} else if (process.env.NODE_ENV === "test") {
    envFile = ".env.test";
}
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

async function parseEducationData(filePath) {
    console.log("🔗 Connecting to MongoDB...");
    const mongoUri = process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);

    try {
        await parseCourses(filePath);
        await parseCoursePackages(filePath);

        console.log("✅ All data parsed successfully.");
    } catch (error) {
        console.error("❌ Error:", error);
    } finally {
        console.log("🔌 Disconnecting from MongoDB...");
        await mongoose.disconnect(); // ✅ Wait for disconnection
        console.log("🔌 Disconnected from MongoDB.");
    }
}

parseEducationData("./EducationData.xlsx");

export default parseEducationData;
