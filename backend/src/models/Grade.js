import mongoose from "mongoose";

const gradeSchema = new mongoose.Schema(
    {
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },
        grade: {
            type: String,
            enum: ["A", "B", "C", "D", "E", "F", "G", "VG", "G", "IG", null],
            default: null,
        }, // or use numbers if preferred
        gradedAt: { type: Date },
        completed: { type: Boolean, default: false },
        teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }, // optional
    },
    { timestamps: true }
);

export default mongoose.model("Grade", gradeSchema);
