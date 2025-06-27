import mongoose from "mongoose";
import { parseCourses } from "./courseParser.js";
import { parseCoursePackages } from "./coursePackageParser.js";

const MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://localhost:27017/mindfullearning";

async function parseEducationData(filePath) {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);

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
