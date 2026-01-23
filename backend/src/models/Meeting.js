// models/Meeting.js
import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
    title: String,
    start: Date,
    end: Date,
    location: String,
    student: {
        id: mongoose.Schema.Types.ObjectId,
        name: String,
        personalNumber: String
    },
    bookedBy: {
        type: String,
        enum: ['syv', 'specped', 'admin', 'systemadmin'],
        required: true
    },
    info: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

export default mongoose.model("Meeting", meetingSchema);
