import mongoose from "mongoose";

// Course Schema
const kursSchema = new mongoose.Schema({
    courseName: String,
    courseCode: String,
    omfattning: {
        type: [Number],
        default: [0],
        validate: {
            validator: function (values) {
                return values.every((val) => Number.isInteger(val) && val >= 0);
            },
            message: "Omfattning must be an array of positive integers.",
        },
    },
});

export default mongoose.model("Kurs", kursSchema, "kurser");
