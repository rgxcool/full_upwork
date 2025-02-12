import mongoose from "mongoose";

const programSchema = new mongoose.Schema({
    programName: { type: String, required: true },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
});

export default mongoose.model("Program", programSchema, "program");
