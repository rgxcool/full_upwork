import mongoose from "mongoose";

// A durable, idempotent record of a course (or course-package) completion.
//
// Every completion — course-level (a single course enrollment finished) and
// package-level (the whole course package finished) — is recorded here exactly
// once. The `idempotencyKey` is built from the student + package/course pair so
// the daily scheduler can never double-record a completion or fire duplicate
// notifications, even when the same enrollment is scanned again.
const completionEventSchema = new mongoose.Schema(
    {
        // Stable dedupe key: `course:<studentId>:<courseInstanceId>`
        // or `package:<studentId>:<coursePackageId>`.
        idempotencyKey: { type: String, required: true, unique: true },

        // Student (denormalized for cheap admin-dashboard reads).
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        studentName: { type: String, default: "" },

        // Completion scope. Exactly one of courseInstanceId / coursePackageId
        // is populated per record (the other stays null).
        completionType: {
            type: String,
            enum: ["course", "course_package"],
            required: true,
        },
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
            default: null,
        },
        courseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Course",
            default: null,
        },
        courseName: { type: String, default: "" },
        coursePackageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CoursePackage",
            default: null,
        },
        packageName: { type: String, default: "" },

        // When the completion took place.
        completionDate: { type: Date, default: Date.now },

        // Responsible teacher (denormalized).
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            default: null,
        },
        teacherName: { type: String, default: "" },

        // Tenant (municipality) the student belongs to.
        municipality: { type: String, default: "" },

        // Relevant enrollment IDs ("mycket" of the completion). First element
        // is the primary enrollment that triggered the event.
        enrollmentIds: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: "StudentEnrollment",
            default: [],
        },

        // Meta flags so a partially-failed notification round can be retried
        // without re-recording the completion itself.
        meta: {
            adminNotifiedAt: { type: Date, default: null },
            teacherNotifiedAt: { type: Date, default: null },
            studentNotifiedAt: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

// The scheduler is idempotent BY CONSTRUCTION: a unique idempotencyKey makes a
// second insert for the same student+scope a duplicate-key error, so
// createCompletionEvent() can safely fall back to the existing record.
completionEventSchema.index({ studentId: 1, completionType: 1 });
completionEventSchema.index({ completionDate: -1 });

export default mongoose.model(
    "CompletionEvent",
    completionEventSchema,
    "completionEvents"
);