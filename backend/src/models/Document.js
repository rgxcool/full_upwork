import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  filename: String,
  originalName: String,
  uploadedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Document', DocumentSchema, "documents");
