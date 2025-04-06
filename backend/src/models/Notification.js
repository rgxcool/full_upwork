// models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: { type: String, required: true }, // t.ex. "grades_pending"
  resolved: { type: Boolean, default: false },
  message: String,
  createdAt: { type: Date, default: Date.now },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

export default mongoose.model("Notification", notificationSchema, "notifications");