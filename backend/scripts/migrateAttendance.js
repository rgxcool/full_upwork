import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.development" });

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri);

// Import models
const Student = (await import('../src/models/Student.js')).default;
const ExamAttendance = (await import('../src/models/ExamAttendance.js')).default;

async function migrateAttendance() {
  try {
    console.log('🔄 Starting attendance migration...');
    
    // Get all students with examHistory
    const students = await Student.find({ 'examHistory.0': { $exists: true } });
    console.log(`📊 Found ${students.length} students with exam history`);
    
    let migratedCount = 0;
    
    for (const student of students) {
      for (const examRecord of student.examHistory) {
        // Check if attendance record already exists
        const existingAttendance = await ExamAttendance.findOne({
          examDate: examRecord.examDate,
          teacherId: examRecord.teacherId,
          studentId: student._id
        });
        
        if (!existingAttendance) {
          // Create new attendance record
          const attendanceRecord = new ExamAttendance({
            examDate: examRecord.examDate,
            courseName: examRecord.courseName,
            courseId: examRecord.courseId,
            teacherId: examRecord.teacherId,
            studentId: student._id,
            studentName: student.name,
            personalNumber: student.personalNumber,
            attended: examRecord.attended,
            examTime: examRecord.examTime,
            examMunicipality: examRecord.examMunicipality,
            examLocation: examRecord.examLocation,
            grade: examRecord.grade,
            notes: examRecord.notes,
            recordedAt: examRecord.recordedAt,
            recordedBy: examRecord.recordedBy
          });
          
          await attendanceRecord.save();
          migratedCount++;
          console.log(`✅ Migrated attendance for ${student.name} - ${examRecord.courseName} (${examRecord.examDate.toDateString()})`);
        }
      }
    }
    
    console.log(`🎉 Migration completed! Migrated ${migratedCount} attendance records`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
migrateAttendance(); 
