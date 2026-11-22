import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        authorRole: {
            type: String,
            enum: ["staff", "student"],
            required: true,
        },
        text: { type: String, required: true, trim: true, maxlength: 5000 },
        at: { type: Date, default: Date.now },
    },
    { _id: false }
);

const studentConversationSchema = new mongoose.Schema(
    {
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        messages: { type: [messageSchema], default: [] },
    },
    { _id: false }
);

const courseCardDiscussionSchema = new mongoose.Schema(
    {
        courseInstanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CourseInstance",
            required: true,
        },
        moduleNumber: { type: Number, required: true },
        title: { type: String, required: true, trim: true, maxlength: 160 },
        category: {
            type: String,
            enum: ["assignment", "exam", "general"],
            default: "general",
        },
        promptText: { type: String, required: true, trim: true, maxlength: 5000 },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        studentConversations: {
            type: [studentConversationSchema],
            default: [],
        },
    },
    { timestamps: true, optimisticConcurrency: true }
);

courseCardDiscussionSchema.index({ courseInstanceId: 1, moduleNumber: 1, createdAt: 1 });

export default mongoose.model("CourseCardDiscussion", courseCardDiscussionSchema);
