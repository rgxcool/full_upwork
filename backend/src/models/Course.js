import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
    courseName: String,
    courseCode: String,
    extent: {
        type: [Number],
        default: [0],
        validate: {
            validator: function (values) {
                return values.every((val) => Number.isInteger(val) && val >= 0);
            },
            message: "Extent must be an array of positive integers.",
        },
    },
});

export default mongoose.model("Course", courseSchema, "course");
