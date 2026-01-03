import mongoose from "mongoose";
import Program from "../src/models/Program.js";
import Course from "../src/models/Course.js";
import CoursePackage from "../src/models/CoursePackage.js";

async function dropData() {
    try {
        console.log("🔗 Connecting to MongoDB...");
        const mongoUri = process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);

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
    } finally {
        console.log("🔌 Disconnecting from MongoDB...");
        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB.");
    }
}

dropData();
