import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: ".env.development" }); // switch to .env.production if needed
import Student from "../src/models/Student.js";
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/mindfullearning";
const run = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/mindfullearning", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    const students = await Student.find({});
    let count = 0;

    for (const student of students) {
      let modified = false;

      if (!Array.isArray(student.commentHistory)) {
        student.commentHistory = [];
        modified = true;
      }

      for (let i = 0; i < student.commentHistory.length; i++) {
        const entry = student.commentHistory[i];
        if (!Array.isArray(entry.seenBy)) {
          student.commentHistory[i].seenBy = [];
          modified = true;
        }
      }

      if (modified) {
        await student.save();
        console.log(`✅ Fixed student: ${student.name}`);
        count++;
      }
    }

    console.log(`🎉 Migration completed — ${count} student(s) modified.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
};

run();
