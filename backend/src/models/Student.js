import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        personalNumber: { type: String, required: true },

        program: {
            programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program" },
            addedAt: { type: Date, default: Date.now },
            addedBy: { type: String },
            removedAt: { type: Date, default: null },
        },

        coursePackages: [
            {
                coursePackageId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "CoursePackage",
                },
                addedAt: { type: Date, default: Date.now },
                addedBy: { type: String },
                removedAt: { type: Date, default: null },
            },
        ],

        courses: [
            {
                courseId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Course",
                },
                grades: {
                    grade: { type: String },
                    reason: { type: String },
                    comments: { type: String },
                    npScore: { type: Number },
                    locked: { type: Boolean, default: false },
                },
                addedAt: { type: Date, default: Date.now },
                addedBy: { type: String },
                status: { type: String, default: null },
                removedAt: { type: Date, default: null },
            },
        ],

        education: [
            {
                type: {
                    type: String,
                    enum: ["Program", "CoursePackage", "Course"],
                    required: true,
                },
                refId: { type: mongoose.Schema.Types.ObjectId },
                name: { type: String },

                //Betygsdata
                grade: { type: String, default: null },
                reason: { type: String, default: null },
                comments: { type: String, default: null },
                npScore: { type: Number, default: null },
                locked: { type: Boolean, default: false },

                addedAt: { type: Date, default: Date.now },
                addedBy: { type: String },
                removedAt: { type: Date, default: null },
                status: { type: String, default: "" },
            },
        ],

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
                date: Date,
                seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
            },
        ],
    },
    { timestamps: true }
);

export default mongoose.model("Student", StudentSchema);
