import mongoose from "mongoose";

const examAttendanceSchema = new mongoose.Schema(
    {
        // Exam details
        examDate: { type: Date, required: true },
        courseName: { type: String, required: true },
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
        
        // Student details
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        studentName: { type: String, required: true },
        personalNumber: { type: String, required: true },
        
        // Attendance status
        attended: { type: Boolean, default: false },
        paidExamFee: { type: Boolean, default: false },
        
        // Exam details
        examTime: String,
        examMunicipality: String,
        examLocation: String,
        
        // Academic details
        grade: String,
        notes: String,
        
        // Metadata
        recordedAt: { type: Date, default: Date.now },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

// Index for efficient queries
examAttendanceSchema.index({ examDate: 1, teacherId: 1 });
examAttendanceSchema.index({ studentId: 1, examDate: 1 });
examAttendanceSchema.index({ courseId: 1, examDate: 1 });

export default mongoose.model("ExamAttendance", examAttendanceSchema, "exam_attendance"); 