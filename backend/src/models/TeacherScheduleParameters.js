import mongoose from "mongoose";
import { PLAN_LENGTHS, resolveSectionOffsets } from "../utils/datePlan.js";

const TeacherScheduleParametersSchema = new mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    courseId: {
        type: String,
        required: true,
    },
    lengthWeeks: {
        type: Number,
        enum: [5, 10, 20],
        required: true,
    },
    sectionOffsets: {
        type: [Number],
        default: [],
        validate: {
            validator: function (v) {
                return v.length === 5 || v.length === 0;
            },
            message: "sectionOffsets must have exactly 5 values (one per module) or be empty",
        },
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Helper: resolve section offsets — use saved if present, otherwise default
TeacherScheduleParametersSchema.methods.getSectionOffsets = function () {
    const lengthWeeks = PLAN_LENGTHS.includes(this.lengthWeeks)
        ? this.lengthWeeks
        : 5;
    return resolveSectionOffsets(lengthWeeks, this.sectionOffsets).offsets;
};

// Index for fast lookup by teacher + course + length
TeacherScheduleParametersSchema.index({ teacherId: 1, courseId: 1, lengthWeeks: 1 }, { unique: true });

export default mongoose.model("TeacherScheduleParameters", TeacherScheduleParametersSchema);