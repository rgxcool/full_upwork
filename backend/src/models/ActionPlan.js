import mongoose from "mongoose";

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Student" },
  educationId: { type: String, required: true },
  teacherName: String,
  date: String,
  reason: String,
  schoolEfforts: [String],
  studentEfforts: [String],
  studyTime: String,
  meetings: [String],
  notified: [String],
  createdAt: { type: Date, default: Date.now },
  locked: { type: Boolean, default: false }
});

const ActionPlan = mongoose.model("ActionPlan", schema);
export default ActionPlan;