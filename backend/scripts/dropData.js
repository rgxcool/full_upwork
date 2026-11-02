import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Program from "../src/models/Program.js";
import Course from "../src/models/Course.js";
import CoursePackage from "../src/models/CoursePackage.js";

const envFile =
    process.env.NODE_ENV === "production"
        ? ".env.production"
        : process.env.NODE_ENV === "test"
          ? ".env.test"
          : ".env.development";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", envFile) });

async function dropData() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error(
            `❌ MONGODB_URI is not set. Set it in backend/${envFile} or export it before running this script.`
        );
        process.exitCode = 1;
        return;
    }

    let connected = false;
    try {
        console.log("🔗 Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        connected = true;

        // Dropping all programs
        console.log("🚨 Dropping all programs...");
        await Program.deleteMany({});
        console.log("✅ All programs dropped.");

        // Dropping all courses
        console.log("🚨 Dropping all courses...");
        await Course.deleteMany({});
        console.log("✅ All courses dropped.");

        // Dropping all course packages
        console.log("🚨 Dropping all course packages...");
        await CoursePackage.deleteMany({});
        console.log("✅ All course packages dropped.");
    } catch (error) {
        console.error("❌ Error dropping data:", error);
        process.exitCode = 1;
    } finally {
        if (connected) {
            console.log("🔌 Disconnecting from MongoDB...");
            await mongoose.disconnect();
            console.log("🔌 Disconnected from MongoDB.");
        }
    }
}

dropData();
