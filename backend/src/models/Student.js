import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  personalNumber: { type: String, required: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: "Program" },
  coursePackages: [
    {
      coursePackageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CoursePackage",
      },
    },
  ],
  courses: [
    {
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" }, // ✅ Only store reference
      addedAt: { type: Date, default: Date.now },
    },
  ],
  startDate: Date,
  endDate: Date,
  finalExamDate: Date,
  examMunicipality: String,
  examLocation: String,
  examTime: String,
  municipality: String,
  phone: String,
  email: { type: String, required: true, unique: true },
  exam: String,
  additionalInfo: String,
  teacher: String,
  dropout: { type: Boolean, default: false },
  aplStatus: {
    type: String,
    enum: ["GRAY", "RED", "BLUE", "ORANGE", "GREEN", "WHITE"],
    default: "GRAY",
  },
  commentHistory: [
    {
      comment: String,
      date: { type: Date, default: Date.now },
      author: String, // Optional: who wrote it
      seenBy: [String], // Optional: who has seen it
    },
  ],
});

export default mongoose.model("Student", StudentSchema);
