import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  colorCode: { type: String, default: "#FF0000" },
  // Add other teacher specific fields here
});

export default mongoose.model("Teacher", teacherSchema, "teachers");
