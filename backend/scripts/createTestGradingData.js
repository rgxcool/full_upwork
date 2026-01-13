import mongoose from "mongoose";
import Student from "../src/models/Student.js";
import Course from "../src/models/Course.js";
import CourseInstance from "../src/models/CourseInstance.js";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import Teacher from "../src/models/Teacher.js";
import User from "../src/models/User.js";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/mindful";

async function createTestGradingData() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Find or create a test teacher
    let teacher = await Teacher.findOne().populate("userId");
    if (!teacher) {
      console.log("⚠️ No teacher found. Creating a test teacher...");
      const testUser = await User.findOne({ role: "teacher" });
      if (!testUser) {
        console.log("❌ No teacher user found. Please create a teacher first.");
        process.exit(1);
      }
      teacher = await Teacher.findOne({ userId: testUser._id });
      if (!teacher) {
        console.log("❌ Teacher profile not found for user.");
        process.exit(1);
      }
    }
    console.log(`✅ Using teacher: ${teacher.userId?.username || teacher.userId?.email}`);

    // Find or create a test student assigned to this teacher
    let student = await Student.findOne({ teacherId: teacher._id });
    if (!student) {
      console.log("⚠️ No student found for this teacher. Creating a test student...");
      student = new Student({
        name: "Test Student för Betyg",
        email: `test-student-${Date.now()}@test.com`,
        personalNumber: "19900101-0001",
        teacherId: teacher._id,
        dropout: false,
      });
      await student.save();
      console.log(`✅ Created test student: ${student.name}`);
    } else {
      console.log(`✅ Using existing student: ${student.name}`);
    }

    // Find or create a test course
    let course = await Course.findOne();
    if (!course) {
      console.log("⚠️ No course found. Creating a test course...");
      course = new Course({
        courseName: "Testkurs för Betyg",
        courseCode: "TEST001",
        coursePoints: 100,
        courseExtent: "100%",
      });
      await course.save();
      console.log(`✅ Created test course: ${course.courseName}`);
    } else {
      console.log(`✅ Using existing course: ${course.courseName}`);
    }

    // Create a course instance with end date in the past (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    const twoWeeksAgo = new Date(yesterday);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    let courseInstance = await CourseInstance.findOne({
      mainCourseId: course._id,
      endDate: { $lt: new Date() },
    });

    if (!courseInstance) {
      console.log("⚠️ No past course instance found. Creating one...");
      courseInstance = new CourseInstance({
        mainCourseId: course._id,
        courseName: course.courseName,
        courseCode: `${course.courseCode}${String(yesterday.getFullYear()).slice(-2)}${String(yesterday.getMonth() + 1).padStart(2, '0')}`,
        startDate: twoWeeksAgo,
        endDate: yesterday,
        responsibleTeacher: teacher._id,
        createdBy: teacher.userId?._id || teacher.userId,
      });
      await courseInstance.save();
      console.log(`✅ Created course instance ending: ${yesterday.toISOString().split('T')[0]}`);
    } else {
      console.log(`✅ Using existing course instance: ${courseInstance.courseCode}`);
    }

    // Check if enrollment already exists
    let enrollment = await StudentEnrollment.findOne({
      studentId: student._id,
      courseInstanceId: courseInstance._id,
    });

    if (enrollment) {
      console.log("⚠️ Enrollment already exists. Updating it...");
      // Update to ensure it meets requirements
      enrollment.endDate = yesterday;
      enrollment.grade = null; // Ensure no grade
      enrollment.status = "completed"; // Ensure valid status
      await enrollment.save();
      console.log(`✅ Updated enrollment - endDate: ${yesterday.toISOString().split('T')[0]}, grade: null`);
    } else {
      console.log("⚠️ No enrollment found. Creating one...");
      enrollment = new StudentEnrollment({
        studentId: student._id,
        courseInstanceId: courseInstance._id,
        teacherId: teacher._id,
        startDate: twoWeeksAgo,
        endDate: yesterday,
        grade: null, // No grade - this is what we're testing
        status: "completed",
      });
      await enrollment.save();
      console.log(`✅ Created enrollment - endDate: ${yesterday.toISOString().split('T')[0]}, grade: null`);
    }

    console.log("\n✅ Test data setup complete!");
    console.log("\n📋 Summary:");
    console.log(`   Student: ${student.name} (${student._id})`);
    console.log(`   Teacher: ${teacher.userId?.username || teacher.userId?.email} (${teacher._id})`);
    console.log(`   Course: ${course.courseName} (${course.courseCode})`);
    console.log(`   Course Instance: ${courseInstance.courseCode}`);
    console.log(`   Enrollment end date: ${yesterday.toISOString().split('T')[0]}`);
    console.log(`   Enrollment grade: ${enrollment.grade || "null"}`);
    console.log(`   Enrollment status: ${enrollment.status}`);
    console.log("\n🔍 This student should now appear in /betyg view for the teacher!");
    console.log("\n💡 To verify:");
    console.log("   1. Log in as the teacher");
    console.log("   2. Navigate to /betyg");
    console.log("   3. You should see the test student with the test course");

  } catch (err) {
    console.error("❌ Error creating test data:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

createTestGradingData();
