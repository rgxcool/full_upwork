import mongoose from "mongoose";

const EducationEntrySchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["Program", "CoursePackage", "Course"],
            required: true,
        },
        refId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "education.type",
        },

        // Grading fields only relevant when type === 'Course'
        grade: { type: String, default: null },
        reason: { type: String, default: null },
        comments: { type: String, default: null },
        npScore: { type: Number, default: null },
        locked: { type: Boolean, default: false },

        // Metadata
        addedAt: { type: Date, default: Date.now },
        addedBy: { type: String },
        removedAt: { type: Date, default: null },
        status: { type: String, default: "" },
    },
    { _id: false }
);

// Pre-save cleanup: strip grade fields if type !== 'Course'
EducationEntrySchema.pre("validate", function (next) {
    if (this.type !== "Course") {
        this.grade = null;
        this.reason = null;
        this.comments = null;
        this.npScore = null;
        this.locked = false;
    }
    next();
});

const StudentSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        personalNumber: { type: String, required: true },

        education: [EducationEntrySchema],

        startDate: Date,
        endDate: Date,
        finalExamDate: Date,
        examMunicipality: String,
        examLocation: String,
        examTime: String,

        municipality: {
            type: {
                type: String,
                enum: [
                    "Botkyrka",
                    "Danderyd",
                    "Huddinge",
                    "Järfälla",
                    "KCNO",
                    "Lidingö",
                    "Norrtälje",
                    "Nykvarn",
                    "Privat kunder",
                    "Salem",
                    "Sigtuna",
                    "Sollentuna",
                    "Solna",
                    "Sundbyberg",
                    "Södertälje",
                    "Täby",
                    "Upplands Bro",
                    "Upplands Väsby",
                    "Vallentuna",
                    "Vaxholm",
                    "Växjö",
                    "Österåker",
                ],
                default: "Choose municipality",
            },
        },

        phone: String,
        email: { type: String, required: true, unique: true },
        exam: String,
        additionalInfo: String,
        teacher: String,
        teacherId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },
        dropout: { type: Boolean, default: false },

        aplStatus: {
            type: String,
            enum: ["GRAY", "RED", "BLUE", "YELLOW", "GREEN"],
            default: "GRAY",
        },

        aplStatusHistory: [
            {
                status: {
                    type: String,
                    enum: ["GRAY", "RED", "BLUE", "YELLOW", "GREEN"],
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

export default mongoose.model("Student", StudentSchema, "students");
