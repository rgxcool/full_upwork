// Usage: node backend/scripts/flushAllButAdmins.js
import mongoose from 'mongoose';
import Student from '../src/models/Student.js';
import Teacher from '../src/models/Teacher.js';
import User from '../src/models/User.js';
import CourseInstance from '../src/models/CourseInstance.js';
import StudentEnrollment from '../src/models/StudentEnrollment.js';
import CalendarEvent from '../src/models/Event.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mindfullearning';

async function main() {
  await mongoose.connect(MONGO_URI);

  // Delete all students
  const students = await Student.deleteMany({});
  // Delete all teachers
  const teachers = await Teacher.deleteMany({});
  // Delete all course instances
  const courseInstances = await CourseInstance.deleteMany({});
  // Delete all enrollments
  const enrollments = await StudentEnrollment.deleteMany({});
  // Delete all calendar events
  const events = await CalendarEvent.deleteMany({});
  // Delete all users except admins and systemadmins
  const users = await User.deleteMany({ role: { $nin: ['admin', 'systemadmin'] } });

  console.log(`Deleted: ${students.deletedCount} students, ${teachers.deletedCount} teachers, ${courseInstances.deletedCount} course instances, ${enrollments.deletedCount} enrollments, ${events.deletedCount} events, ${users.deletedCount} non-admin users.`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); }); 