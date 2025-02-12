import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema({
    name: { type: String, required: true },
    colorCode: { type: String, default: "#FF0000" },
    email: { type: String, required: true },
    password: { type: String, required: true },
});

export default mongoose.model("Teacher", teacherSchema, "teachers");
