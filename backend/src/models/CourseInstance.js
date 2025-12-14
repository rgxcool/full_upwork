import mongoose from "mongoose";

const courseInstanceSchema = new mongoose.Schema(
    {
        // Reference to the main course (static definition)
        mainCourseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            required: true,
        },

        // Temporal information
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },

        // Instance-specific data (can override main course data)
        courseName: { type: String, required: true },
        courseCode: { type: String, required: true },
        coursePoints: { type: String },
        courseExtent: String,

        // Version tracking
        version: {
            type: String,
            default: "1.0",
        },

        // Status
        isActive: {
            type: Boolean,
            default: true,
        },

        // Metadata
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        responsibleTeacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },
        notes: String,
        slutprovDate: Date,

        // Statistics tracking
        enrollmentCount: {
            type: Number,
            default: 0,
        },
        completionCount: {
            type: Number,
            default: 0,
        },
        dropoutCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        // Index for efficient queries
        indexes: [
            { mainCourseId: 1, startDate: 1, endDate: 1 },
            { startDate: 1, endDate: 1 },
            { isActive: 1 },
        ],
    }
);

// Validation: endDate must be after startDate
courseInstanceSchema.pre("validate", function (next) {
    if (this.endDate <= this.startDate) {
        next(new Error("End date must be after start date"));
    }
    next();
});

// Auto-calculate slutprovDate based on teacher and course end date
courseInstanceSchema.pre("save", async function (next) {
    // Only auto-calculate if:
    // 1. responsibleTeacher is set
    // 2. endDate is set
    // 3. slutprovDate is not already manually set (allow manual override)
    if (this.responsibleTeacher && this.endDate && !this.slutprovDate) {
        try {
            const { calculateSlutprovDate } = await import("../utils/slutprovDateCalculator.js");
            const calculatedDate = await calculateSlutprovDate(this.responsibleTeacher, this.endDate);
            if (calculatedDate) {
                this.slutprovDate = calculatedDate;
                console.log(
                    `📅 Auto-calculated slutprovDate for course "${this.courseName}": ${calculatedDate.toDateString()}`
                );
            }
        } catch (error) {
            console.error("Error calculating slutprovDate:", error);
            // Don't fail the save if calculation fails
        }
    }
    next();
});

// Method to check if instance overlaps with date range
courseInstanceSchema.methods.overlapsWith = function (startDate, endDate) {
    return this.startDate < endDate && this.endDate > startDate;
};

// Method to get duration in days
courseInstanceSchema.methods.getDuration = function () {
    return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
};

export default mongoose.model(
    "CourseInstance",
    courseInstanceSchema,
    "courseInstances"
);
