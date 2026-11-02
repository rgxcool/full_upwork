// Usage: node backend/scripts/flushAllButAdmins.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Student from "../src/models/Student.js";
import AplRecord from "../src/models/AplRecord.js";
import Document from "../src/models/Document.js";
import Teacher from "../src/models/Teacher.js";
import User from "../src/models/User.js";
import CourseInstance from "../src/models/CourseInstance.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import CalendarEvent from "../src/models/Event.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDirectory = path.resolve(__dirname, "../public/uploads");

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

    const existingStudents = await Student.find({}, { _id: 1 }).lean();
    const studentIds = existingStudents.map((student) => student._id);
    const existingAplRecords = await AplRecord.find({})
        .select("cvDocId contractDocId")
        .lean();
    const aplDocumentIds = existingAplRecords
        .flatMap((record) => [record.cvDocId, record.contractDocId])
        .filter(Boolean);

    // Include student documents and APL-specific uploads, plus files referenced
    // by APL records left behind by an earlier student-only reset.
    const documentFilters = [
        ...(studentIds.length ? [{ student: { $in: studentIds } }] : []),
        { type: { $in: ["APL_CV", "APL_CONTRACT"] } },
        ...(aplDocumentIds.length ? [{ _id: { $in: aplDocumentIds } }] : []),
    ];
    const studentDocuments = await Document.find({
        $or: documentFilters,
    }).lean();

    let deletedUploadFiles = 0;
    for (const document of studentDocuments) {
        if (!document.filename || path.basename(document.filename) !== document.filename) {
            throw new Error(`Unsafe upload filename on document ${document._id}`);
        }

        const uploadPath = path.resolve(uploadsDirectory, document.filename);
        if (path.dirname(uploadPath) !== uploadsDirectory) {
            throw new Error(`Upload path is outside the uploads directory: ${document._id}`);
        }

        try {
            await fs.unlink(uploadPath);
            deletedUploadFiles++;
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw new Error(
                    `Failed to delete upload for document ${document._id}: ${error.message}`,
                    { cause: error }
                );
            }
        }
    }

    const documents = studentDocuments.length
        ? await Document.deleteMany({
              _id: { $in: studentDocuments.map((document) => document._id) },
          })
        : { deletedCount: 0 };

    // APL records are stored separately and do not cascade-delete with students.
    const aplRecords = await AplRecord.deleteMany({});
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
        `Deleted: ${students.deletedCount} students, ${aplRecords.deletedCount} APL records, ${documents.deletedCount} document records, ${deletedUploadFiles} uploaded files, ${teachers.deletedCount} teachers, ${courseInstances.deletedCount} course instances, ${enrollments.deletedCount} enrollments, ${events.deletedCount} events, ${users.deletedCount} non-admin users.`
    );
    await mongoose.disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
