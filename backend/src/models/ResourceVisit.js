import mongoose from "mongoose";

// A durable record of a student opening a learning resource. Visits are
// deduplicated per calendar day so refreshing a course card does not inflate
// the report, while still showing which resources were used over time.
const resourceVisitSchema = new mongoose.Schema(
    {
        idempotencyKey: { type: String, required: true, unique: true },

        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        studentName: { type: String, default: "" },

        resourceType: {
            type: String,
            enum: ["course_card", "lesson", "document", "support_resource"],
            required: true,
        },
        resourceId: { type: String, default: "" },
        resourceName: { type: String, default: "" },
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
            default: null,
        },

        visitedAt: { type: Date, default: Date.now },
        municipality: { type: String, default: "" },
    },
    { timestamps: true }
);

resourceVisitSchema.index({ studentId: 1, visitedAt: -1 });
resourceVisitSchema.index({ visitedAt: -1 });
resourceVisitSchema.index({ resourceType: 1, visitedAt: -1 });

export default mongoose.model(
    "ResourceVisit",
    resourceVisitSchema,
    "resourceVisits"
);
