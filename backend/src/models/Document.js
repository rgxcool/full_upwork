import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Student', 
    required: true 
  },
  filename: { 
    type: String, 
    required: true 
  },
  originalName: { 
    type: String, 
    required: true 
  },
  type: {
    type: String,
    default: 'GENERAL',
    enum: ['GENERAL', 'ACTION_PLAN', 'REPORT']
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
})

export default mongoose.model('Document', DocumentSchema, "documents");
