// models/Meeting.js
import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  title: String,
  description: String,
  participants: [String], // student- eller lärar-ID
  start: Date,
  end: Date,
  createdBy: String // t.ex. "syv", "specialpedagog"
});

export default mongoose.model("Meeting", meetingSchema);