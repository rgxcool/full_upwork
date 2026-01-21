// Usage: node backend/scripts/flushAllButAdmins.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Student from "../src/models/Student.js";
import Teacher from "../src/models/Teacher.js";
import User from "../src/models/User.js";
import CourseInstance from "../src/models/CourseInstance.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import CalendarEvent from "../src/models/Event.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
let envFile = ".env.development";
if (process.env.NODE_ENV === "production") {
    envFile = ".env.production";
} else if (process.env.NODE_ENV === "test") {
    envFile = ".env.test";
}
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

async function main() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error("❌ MONGODB_URI is not defined in environment variables");
        process.exit(1);
    }
    await mongoose.connect(mongoUri);

    // Delete all students
    const students = await Student.deleteMany({});
    // Delete all teachers
    const teachers = await Teacher.deleteMany({});
    // Delete all course instances
    const courseInstances = await CourseInstance.deleteMany({});
    // Delete all enrollments
    const enrollments = await StudentEnrollment.deleteMany({});
    // Delete all calendar events
    const events = await CalendarEvent.deleteMany({});
    // Delete all users except admins and systemadmins
    const users = await User.deleteMany({
        roles: { $nin: ["admin", "systemadmin"] },
    });

    console.log(
        `Deleted: ${students.deletedCount} students, ${teachers.deletedCount} teachers, ${courseInstances.deletedCount} course instances, ${enrollments.deletedCount} enrollments, ${events.deletedCount} events, ${users.deletedCount} non-admin users.`
    );
    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
