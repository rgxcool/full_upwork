import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    username: { type: String },
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: [
            "guest",
            "user",
            "student",
            "coordinator",
            "specped",
            "syv",
            "teacher",
            "admin",
            "systemadmin",
        ],
        default: "user",
        required: true,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", UserSchema);
