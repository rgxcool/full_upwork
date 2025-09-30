import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        colorCode: {
            type: String,
            default: "#FF0000",
        },
        subject: {
            type: String,
            required: true, // if you always want it defined
            trim: true,
        },
        phoneNumbers: {
            type: [
                {
                    type: String,
                    trim: true,
                },
            ],
            default: [],
        },
        // You can add more teacher-specific fields later here
    },
    { timestamps: true }
);

export default mongoose.model("Teacher", teacherSchema, "teachers");
