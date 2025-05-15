import mongoose from 'mongoose'

const fileAuditLogSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Student' },
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'fs.files' }, // gridFS file id
  filename: String,
  action: { type: String, enum: ['upload', 'delete'], required: true },
  performedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: String,
    email: String,
  },
  timestamp: { type: Date, default: Date.now },
})

const FileAuditLog = mongoose.model('FileAuditLog', fileAuditLogSchema)
export default FileAuditLog
