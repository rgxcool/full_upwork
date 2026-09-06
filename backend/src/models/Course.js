import mongoose from "mongoose";

const resultTypeSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        label: { type: String, required: true },
        type: {
            type: String,
            enum: ["grade", "numeric", "percentage", "text", "pass_fail", "date"],
            default: "grade",
        },
        min: { type: Number },
        max: { type: Number },
        options: [{ type: String }],
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const courseSchema = new mongoose.Schema(
    {
        programs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Program" }],
        courseName: { type: String, required: true },
        courseCode: { type: String, required: true },
        coursePoints: { type: String },
        courseExtent: String,
        price: { type: Number, default: null, min: 0 },
        isActive: { type: Boolean, default: true },
        resultTypes: {
            type: [resultTypeSchema],
            default: undefined,
        },
    },
    { timestamps: true }
);

export default mongoose.model("Course", courseSchema, "courses");
