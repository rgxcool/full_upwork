import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  personalNumber: { type: String, required: true },

  program: {
    programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program" },
    grade: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', null], default: null },
  },

  coursePackages: [
    {
      coursePackageId: { type: mongoose.Schema.Types.ObjectId, ref: "CoursePackage" },
      grade: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', null], default: null },
    },
  ],

  courses: [
    {
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
      addedAt: { type: Date, default: Date.now },
      grade: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', null], default: null },
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

  commentHistory: [
    {
      comment: String,
      author: String,
      date: { type: Date, default: Date.now },
      seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
  ],

  aplStatus: { type: String, default: "GRAY" },
});

export default mongoose.model("Student", StudentSchema);
