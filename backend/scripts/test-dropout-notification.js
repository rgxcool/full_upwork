/**
 * Test script to check if dropout notifications are being created and queried correctly
 * Run with: node scripts/test-dropout-notification.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables (same as backend/index.js)
let envFile = ".env.development";
if (process.env.NODE_ENV === "production") {
    envFile = ".env.production";
} else if (process.env.NODE_ENV === "test") {
    envFile = ".env.test";
}
dotenv.config({ path: join(__dirname, '..', envFile) });
console.log(`📌 Using environment file: ${envFile}`);

// Import models
import Student from '../src/models/Student.js';
import Teacher from '../src/models/Teacher.js';
import Notification from '../src/models/Notification.js';
import User from '../src/models/User.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/mindful';
console.log(`🔗 MongoDB URI: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide password if present

async function testDropoutNotification() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check total students count
    const totalStudents = await Student.countDocuments({});
    console.log(`📊 Total students in database: ${totalStudents}`);

    // Find Cyrus M Malekani (try exact match first, then partial)
    let student = await Student.findOne({ name: 'Cyrus M Malekani' });
    if (!student) {
      student = await Student.findOne({ name: { $regex: /Cyrus.*Malekani/i } });
    }
    if (!student) {
      // List all students to help find the right one
      const allStudents = await Student.find({}).select('name _id dropout teacherId').limit(20);
      console.log('❌ Student "Cyrus M Malekani" not found');
      console.log(`📋 Showing ${allStudents.length} students in database:`);
      allStudents.forEach((s, idx) => {
        console.log(`   ${idx + 1}. ${s.name} (ID: ${s._id}, dropout: ${s.dropout})`);
      });
      if (totalStudents === 0) {
        console.log('\n⚠️ Database appears to be empty. Make sure MongoDB is running and the database name is correct.');
      }
      process.exit(1);
    }
    console.log(`✅ Found student: ${student.name} (ID: ${student._id})`);
    console.log(`   - dropout: ${student.dropout}`);
    console.log(`   - teacherId: ${student.teacherId}`);

    // Find Ulrika
    const ulrikaUser = await User.findOne({ email: 'ulrika@mindful.se' });
    if (!ulrikaUser) {
      console.log('❌ User "ulrika@mindful.se" not found');
      process.exit(1);
    }
    console.log(`✅ Found user: ${ulrikaUser.email} (ID: ${ulrikaUser._id})`);

    // Find Ulrika's Teacher record
    const ulrikaTeacher = await Teacher.findOne({ userId: ulrikaUser._id });
    if (!ulrikaTeacher) {
      console.log('❌ Teacher record not found for Ulrika');
      process.exit(1);
    }
    console.log(`✅ Found teacher record: ${ulrikaTeacher._id} (user: ${ulrikaTeacher.userId})`);

    // Check if student's teacherId matches Ulrika's teacher record
    if (student.teacherId) {
      const studentTeacher = await Teacher.findById(student.teacherId);
      if (studentTeacher) {
        console.log(`✅ Student's teacher: ${studentTeacher._id} (user: ${studentTeacher.userId})`);
        console.log(`   - Match with Ulrika? ${studentTeacher._id.toString() === ulrikaTeacher._id.toString()}`);
      }
    }

    // Check all dropout notifications
    const allDropoutNotifications = await Notification.find({ 
      type: 'dropout',
      resolved: false 
    });
    console.log(`\n📬 All dropout notifications (${allDropoutNotifications.length}):`);
    allDropoutNotifications.forEach((note, idx) => {
      console.log(`   ${idx + 1}. ID: ${note._id}`);
      console.log(`      - teacher: ${note.teacher ? note.teacher.toString() : 'MISSING'}`);
      console.log(`      - meta.teacherId: ${note.meta?.teacherId ? note.meta.teacherId.toString() : 'MISSING'}`);
      console.log(`      - meta.studentId: ${note.meta?.studentId ? note.meta.studentId.toString() : 'MISSING'}`);
      console.log(`      - resolved: ${note.resolved}`);
    });

    // Check notifications for Ulrika's teacher ID
    const ulrikaNotifications = await Notification.find({
      type: 'dropout',
      teacher: ulrikaTeacher._id,
      resolved: false
    });
    console.log(`\n📬 Notifications for Ulrika's teacher ID (${ulrikaNotifications.length}):`);
    ulrikaNotifications.forEach((note, idx) => {
      console.log(`   ${idx + 1}. ID: ${note._id}`);
      console.log(`      - student: ${note.meta?.studentId}`);
    });

    // Check notifications for Cyrus
    const cyrusNotifications = await Notification.find({
      type: 'dropout',
      'meta.studentId': student._id,
      resolved: false
    });
    console.log(`\n📬 Notifications for Cyrus M Malekani (${cyrusNotifications.length}):`);
    cyrusNotifications.forEach((note, idx) => {
      console.log(`   ${idx + 1}. ID: ${note._id}`);
      console.log(`      - teacher: ${note.teacher ? note.teacher.toString() : 'MISSING'}`);
      console.log(`      - Should match Ulrika? ${note.teacher && note.teacher.toString() === ulrikaTeacher._id.toString()}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Test completed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testDropoutNotification();
