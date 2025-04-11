import mongoose, { mongo } from "mongoose";

const courseSchema = new mongoose.Schema({
    programs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Program' }],
    courseName: { type: String, required: true },
    courseCode: { type: String, required: true },
    coursePoints: { type: String },
    courseExtent: String,
});

export default mongoose.model("Course", courseSchema, "courses");
