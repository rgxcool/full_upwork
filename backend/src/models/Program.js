import mongoose from "mongoose";

const ProgramSchema = new mongoose.Schema({
    programName: { type: String, required: true },
    programCourses: [
        {
            courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
            order: Number,
        },
    ],
    programCoursePackages: [
        { type: mongoose.Schema.Types.ObjectId, ref: "CoursePackage" },
    ],
});

export default mongoose.model("Program", ProgramSchema);
