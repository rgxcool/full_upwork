import mongoose from "mongoose";

const programSchema = new mongoose.Schema({
    programName: {
        type: String,
        required: true,
    },
    programCoursePackages: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CoursePackage",
        },
    ],
    programCourses: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
        },
    ],
});

export default mongoose.model("Program", programSchema, "programs");
