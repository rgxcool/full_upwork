import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
    name: String,
    personalNumber: String,
    phone: String,
    email: String,
    address: String,
    course: String,
    municipality: String,
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
    requestedMonth: String, // exempelvis "2025-06"
    materialReceived: Boolean,
    paymentDate: Date,
    decision: { type: String, enum: ['accept', 'move', 'deny', ''], default: '' },
    comment: String,
    status: { type: String, enum: ['intresse', 'scheduled', 'moved', 'denied'], default: 'intresse' }
  });
  

export default mongoose.model("Exam", examSchema, "exams");
