import mongoose from "mongoose";
import StudentEnrollment from "../src/models/StudentEnrollment.js";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/mindful";

async function modifyEnrollmentsForTesting() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Set end date to yesterday for testing
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    const twoWeeksAgo = new Date(yesterday);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Find enrollments that are currently active but not graded
    const enrollments = await StudentEnrollment.find({
      $or: [{ grade: null }, { grade: "" }],
      status: { $in: ["enrolled", "active", "completed"] },
    })
      .populate("studentId", "name")
      .populate("courseInstanceId", "courseCode courseName")
      .limit(5); // Only modify first 5 to avoid too many changes

    if (enrollments.length === 0) {
      console.log("⚠️ No enrollments found to modify.");
      console.log("💡 Try running createTestGradingData.js instead to create test data.");
      process.exit(0);
    }

    console.log(`\n📋 Found ${enrollments.length} enrollment(s) to modify:`);
    enrollments.forEach((e, idx) => {
      console.log(
        `   ${idx + 1}. ${e.studentId?.name || "Unknown"} - ${e.courseInstanceId?.courseName || "Unknown Course"} (Current end: ${e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : 'N/A'})`
      );
    });

    console.log(`\n🔄 Modifying enrollments to have end date: ${yesterday.toISOString().split('T')[0]}`);

    let modifiedCount = 0;
    for (const enrollment of enrollments) {
      enrollment.endDate = yesterday;
      enrollment.startDate = twoWeeksAgo;
      enrollment.status = "completed"; // Ensure valid status
      enrollment.grade = null; // Ensure no grade
      await enrollment.save();
      modifiedCount++;
      console.log(`   ✅ Modified: ${enrollment.studentId?.name || "Unknown"} - ${enrollment.courseInstanceId?.courseName || "Unknown"}`);
    }

    console.log(`\n✅ Successfully modified ${modifiedCount} enrollment(s)!`);
    console.log("\n💡 These students should now appear in /betyg view for their teachers!");
    console.log("\n🔍 To verify:");
    console.log("   1. Log in as one of the teachers");
    console.log("   2. Navigate to /betyg");
    console.log("   3. You should see the modified students");

    // Show which teachers to test with
    const teacherIds = [...new Set(enrollments.map((e) => e.teacherId?.toString()).filter(Boolean))];
    if (teacherIds.length > 0) {
      console.log(`\n👥 Test with teachers having IDs: ${teacherIds.join(", ")}`);
    }

  } catch (err) {
    console.error("❌ Error modifying enrollments:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

modifyEnrollmentsForTesting();
