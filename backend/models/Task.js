import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
    {
        description: { type: String, required: true },
        isDone: { type: Boolean, default: false },
        userId: { type: String, required: true },
    },
    { timestamps: true }
);

export default mongoose.model("Task", TaskSchema);
