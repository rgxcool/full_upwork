import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
    courseName: { type: String, required: true },
    courseCode: { type: String, required: true },
    coursePoints: { type: String },
    courseExtent: String,
});

export default mongoose.model("Course", courseSchema, "courses");
