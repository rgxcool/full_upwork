// models/Meeting.js
import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  title: String,
  start: Date,
  location: String,
  student: {
    id: mongoose.Schema.Types.ObjectId,
    name: String,
    personalNumber: String
  },
  bookedBy: {
    type: String,
    enum: ['syv', 'specped'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Meeting", meetingSchema);