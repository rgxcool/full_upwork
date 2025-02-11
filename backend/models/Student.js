import mongoose from "mongoose";
const { Schema } = mongoose;

const Eductaion = require("./educationSchema");

const elevSchema = new Schema({
    namn: String,
    personnummer: String,
    program: String,
    kurspaket: { type: [String], default: null },
    startDatum: Schema.Types.Mixed,
    slutDatum: Schema.Types.Mixed,
    kommun: String,
    telefon: String,
    mail: String,
    prov: String,
    ovrigt: String,
    slutprovDatum: Schema.Types.Mixed, // Kan vara både Date och String
    teacher: String,
    dropout: {
        type: Boolean,
        default: false,
    },
    betyg: {
        grade: { type: String, default: null }, // A-F
        comments: { type: String, default: "" },
        locked: { type: Boolean, default: false }, // Låst status
    },
    courses: [
        {
            courseId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Course", // Reference to the Course model
            },
            courseName: String, // Store the course name for quick access
            addedAt: {
                type: Date,
                default: Date.now, // Track when the course was added
            },
        },
    ],
    password: String, // Hashat lösenord
});

export default mongoose.model("Student", elevSchema, "elever");
