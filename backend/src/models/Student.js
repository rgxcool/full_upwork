import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
    name: { type: String, required: true }, // "namn" → "name"
    personalNumber: { type: String }, // "personnummer" → "personalNumber"
    program: { type: mongoose.Schema.Types.ObjectId, ref: "Program" }, // Reference Program model

    coursePackages: [
        {
            coursePackageId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "CoursePackage",
            }, // Reference CoursePackage model
            coursePackageName: { type: String }, // Fixed syntax error
            addedAt: { type: Date, default: Date.now }, // Track when the course package was added
        },
    ],

    startDate: mongoose.Schema.Types.Mixed, // "startDatum" → "startDate"
    endDate: mongoose.Schema.Types.Mixed, // "slutDatum" → "endDate"

    municipality: { type: String }, // "kommun" → "municipality"
    phone: { type: String }, // "telefon" → "phone"
    email: { type: String }, // "mail" → "email"

    exam: { type: String }, // "prov" → "exam"
    additionalInfo: { type: String }, // "ovrigt" → "additionalInfo"
    finalExamDate: mongoose.Schema.Types.Mixed, // "slutprovDatum" → "finalExamDate" (Can be Date or String)

    teacher: { type: String }, // "teacher" kept as is
    dropout: { type: Boolean, default: false }, // Kept as "dropout"

    grades: {
        grade: { type: String, default: null }, // A-F
        comments: { type: String, default: "" },
        locked: { type: Boolean, default: false }, // Locked status
    },

    courses: [
        {
            courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" }, // Reference Course model
            courseName: { type: String }, // Store course name for quick access
            addedAt: { type: Date, default: Date.now }, // Track when the course was added
        },
    ],

    password: { type: String }, // "password" kept as is (for hashed passwords)
});

// ✅ Auto-populate `program`, `coursePackages.coursePackageId`, and `courses.courseId`
studentSchema.pre("find", function (next) {
    this.populate("program", "name") // Populate program name only
        .populate("coursePackages.coursePackageId", "name") // Populate course package names
        .populate("courses.courseId", "courseName"); // Populate course name
    next();
});

studentSchema.pre("findOne", function (next) {
    this.populate("program", "name")
        .populate("coursePackages.coursePackageId", "name")
        .populate("courses.courseId", "courseName");
    next();
});

export default mongoose.model("Student", studentSchema, "students"); // Updated collection name to "students"
