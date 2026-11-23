import mongoose from "mongoose";
import { ALL_MUNICIPALITIES } from "../config/municipalities.js";

// Education entries recorded on the student's study plan (used by course
// placement, study plan tab and APL filtering). Kept in parallel with the
// StudentEnrollment system so the student document carries a denormalized
// plan snapshot.
const EducationEntrySchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["Course", "CoursePackage", "Program"],
            required: true,
        },
        refId: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String },
        startDate: { type: Date },
        endDate: { type: Date },
        grade: { type: String },
        // Set by POST /teacher/lock-grade on legacy rows; honoured by save-grade.
        locked: { type: Boolean, default: false },
        addedAt: { type: Date },
        addedBy: { type: mongoose.Schema.Types.ObjectId },
        removedAt: { type: Date },
    },
    { _id: false }
);

const StudentSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        personalNumber: { type: String, required: true },

        // Studietakt (study pace) in percent. 100% is the normal pace,
        // 50% doubles the course duration and 25% quadruples it.
        pace: {
            type: Number,
            enum: [25, 50, 100],
            default: 100,
        },

        education: [EducationEntrySchema],

        startDate: Date,
        endDate: Date,
        finalExamDate: Date,
        examMunicipality: String,
        examLocation: String,
        examTime: String,
        examRoom: String,

        // Exam history tracking
        examHistory: [
            {
                examDate: { type: Date, required: true },
                courseName: { type: String, required: true },
                courseId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Course",
                },
                teacherId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                attended: { type: Boolean, default: false },
                examTime: String,
                examMunicipality: String,
                examLocation: String,
                examRoom: String,
                grade: String,
                notes: String,
                recordedAt: { type: Date, default: Date.now },
                recordedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
            },
        ],

        // `municipality` must be declared as an explicit sub-schema: `type` is a
        // reserved key, so an inline `{ type: { type: String, ... } }` would be
        // registered as the nested path `municipality.type` and the object
        // itself would never be created. That silently dropped every
        // municipality written as a plain string (see scripts/seedE2EData.js).
        municipality: {
            type: new mongoose.Schema(
                {
                    // No default value; must be set explicitly
                    type: {
                        type: String,
                        enum: ALL_MUNICIPALITIES,
                    },
                },
                { _id: false }
            ),
        },

        phone: String,
        email: { type: String, required: true, unique: true },
        exam: String,
        additionalInfo: String,
        // Free-text field describing any special needs or accommodations
        specialNeeds: String,
        teacher: String,
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        dropout: { type: Boolean, default: false },

        // Last time the student performed meaningful learning activity beyond a
        // login — course-card access or lesson/module views. Used by the
        // inactivity detection as an activity signal (never login alone).
        lastLearningActivityAt: { type: Date, default: null },
        attendedExam: { type: Boolean, default: false },
        paidExamFee: { type: Boolean, default: false },

        // Exam accommodations (Section 19.8, 21.5)
        examAccommodations: {
            extraTime: { type: Number, default: 0, min: 0 },
            computer: { type: Boolean, default: false },
            separateRoom: { type: Boolean, default: false },
            notes: { type: String },
        },

        aplStatus: {
            type: String,
            enum: ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"],
            default: "GRAY",
        },
        aplStatusManualOverride: { type: Boolean, default: false },

        // "Eleven har redan utfört praktik via annan skola" (tidigare praktik)
        priorAplCompleted: { type: Boolean, default: false },

        // Link to the uploaded intyg document (visible in Dokument-fliken)
        priorAplIntygDocId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Document",
            default: null,
        },

        aplStatusHistory: [
            {
                status: {
                    type: String,
                    enum: ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"],
                },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: String },
            },
        ],

        commentHistory: [
            {
                comment: String,
                author: String,
                authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                authorRole: String,
                date: Date,
                seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
                isDeleted: { type: Boolean, default: false },
                deletedAt: Date,
                deletedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                deletedByRole: String,
                deletedContent: String,
                editedAt: Date,
                editedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                editedByRole: String,
                previousVersion: String,
            },
        ],

        // Logbook/kits for APL-only students
        // Each kit is sent at internship start and contains placement information
        logbook: [
            {
                id: { type: mongoose.Schema.Types.ObjectId, required: true },
                title: { type: String, required: true }, // e.g. "Introduktionskit"
                // Stable machine marker (#35): idempotency must not depend on the
                // human-readable title. "apl-learning-kit" for the APL-lärkit.
                kind: { type: String },
                description: String, // Internship description
                startDate: Date, // When the kit was sent
                endDate: Date, // When the kit expires/placement ends
                status: {
                    type: String,
                    enum: ["pending", "active", "completed", "archived"],
                    default: "pending",
                },
                placementId: { type: mongoose.Schema.Types.ObjectId, ref: "Placement" },
                // Optional: link to the student's APL CoursePackage enrollment
                coursePackageId: { type: mongoose.Schema.Types.ObjectId, ref: "CoursePackage" },
            }
        ],

        supportInfo: [
            {
                contactName: { type: String, required: true },
                contactRole: String,
                contactPhone: String,
                contactEmail: String,
                supportType: String,
                notes: String,
                addedAt: { type: Date, default: Date.now },
                addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            },
        ],

        changeHistory: [
            {
                timestamp: { type: Date, default: Date.now },
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                changedByRole: String,
                changes: [String],
                previousValues: mongoose.Schema.Types.Mixed,
                newValues: mongoose.Schema.Types.Mixed,
            },
        ],
    },
    { timestamps: true }
);

StudentSchema.index({ dropout: 1 });
StudentSchema.index({ name: 1, personalNumber: 1 });
StudentSchema.index({ name: "text", email: "text" });

const municipalityPath = StudentSchema.path("municipality");
if (municipalityPath?.set) {
    municipalityPath.set((value) => {
        if (typeof value === "string") {
            return { type: value };
        }
        return value;
    });
}

StudentSchema.pre("validate", function() {
    if (typeof this.municipality === "string") {
        this.municipality = { type: this.municipality };
    }
});

export default mongoose.model("Student", StudentSchema, "students");
