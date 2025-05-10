import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema({
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
            courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
            grade: { type: String, default: null }, // ← detta kan du ta bort om du går all in på "grades"
            grades: {
                grade: { type: String },
                reason: { type: String },
                comments: { type: String },
                npScore: { type: Number },
                locked: { type: Boolean, default: false }
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
            name: { type: String, required: true },
            grade: { type: String, default: null },
            addedAt: { type: Date, default: Date.now },
            addedBy: { type: String },
            removedAt: { type: Date, default: null },
        },
    ],

    startDate: Date,
    endDate: Date,
    finalExamDate: Date,
    examMunicipality: String,
    examLocation: String,
    examTime: String,
    municipality: String,
    phone: String,
    email: { type: String, required: true, unique: true },
    exam: String,
    additionalInfo: String,
    teacher: String,
    dropout: { type: Boolean, default: false },
});

export default mongoose.model("Student", StudentSchema);
