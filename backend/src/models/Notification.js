// models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: { type: String, required: true }, // t.ex. "grades_pending"
  resolved: { type: Boolean, default: false },
  message: String,
  createdAt: { type: Date, default: Date.now },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Nytt fält för flexibel metadata
    meta: {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
      teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      url: { type: String }, // för direktlänk i frontend
    }
});

export default mongoose.model("Notification", notificationSchema, "notifications");