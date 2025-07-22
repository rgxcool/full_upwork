// Usage: node backend/scripts/inspectFinalExamGrouping.js
import mongoose from 'mongoose';
import Student from '../src/models/Student.js';
import Teacher from '../src/models/Teacher.js';
import User from '../src/models/User.js';
import Course from '../src/models/Course.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mindfullearning';

async function main() {
  await mongoose.connect(MONGO_URI);
  const students = await Student.find({ dropout: { $ne: true } })
    .populate({ path: 'teacherId', populate: { path: 'userId', select: 'username' } });
  await Student.populate(students, { path: 'education.refId', model: 'Course', select: 'courseName courseCode' });

  if (students.length > 0) {
    console.log('\n--- RAW FIRST STUDENT DOCUMENT ---');
    console.dir(students[0], { depth: 10 });
  }

  for (const s of students) {
    const dateKey = s.finalExamDate ? new Date(s.finalExamDate).toISOString().split('T')[0] : 'NO_DATE';
    const teacherId = s.teacherId?._id?.toString() || 'NO_TEACHER';
    const teacherName = s.teacherId?.userId?.username || 'NO_TEACHER';
    console.log(`Name: ${s.name}, Email: ${s.email}, finalExamDate: ${s.finalExamDate}, TeacherId: ${teacherId}, Teacher: ${teacherName}`);
    if (Array.isArray(s.education)) {
      for (const edu of s.education) {
        let courseName = edu.refId && typeof edu.refId === 'object' ? edu.refId.courseName : undefined;
        console.log(`  - Education: type=${edu.type}, refId=${edu.refId?._id || edu.refId}, courseName=${courseName}, startDate=${edu.startDate}, endDate=${edu.endDate}`);
      }
    }
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); }); 