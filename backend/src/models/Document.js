import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Student', 
    required: false 
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to User (teacher's userId)
    required: false
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  // Staff members who were explicitly given access to this document, e.g.
  // Mirsada shares a grading-support document with Anes. Sharing is per
  // document so it never widens access to the rest of the owner's files.
  sharedWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
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
    // DELPROV/SLUTPROV are staff-only exam files (see utils/documentAuthorization.js).
    enum: ['GENERAL', 'ACTION_PLAN', 'REPORT', 'COURSE_ARCHIVE', 'DELPROV', 'SLUTPROV', 'TEACHER_DOCUMENT', 'APL_CONTRACT', 'APL_CV', 'CV']
  },
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentEnrollment',
    default: null,
  },
  // File metadata captured at upload time. Older documents may not have these
  // fields; the API derives them from originalName when missing.
  mimeType: {
    type: String,
    default: null,
  },
  size: {
    type: Number,
    default: null,
  },
  // Lower-case extension without the leading dot (e.g. "pdf").
  fileType: {
    type: String,
    default: null,
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
})

// Note: Validation for student/teacher is done in the route handler
// to avoid issues with Document.create() and pre-hooks

export default mongoose.model('Document', DocumentSchema, "documents");
