import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import Teacher from "../src/models/Teacher.js";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/mindful";

async function resetUlrikaPassword() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Try to find Ulrika by email (common formats)
    const emailVariants = [
      "ulrika@mindful.se",
      "ulrika@mindful.com",
      "Ulrika@mindful.se",
      "Ulrika@mindful.com",
    ];

    let user = null;
    for (const email of emailVariants) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        console.log(`✅ Found user with email: ${email}`);
        break;
      }
    }

    // If not found by email, try by username
    if (!user) {
      const usernameVariants = ["Ulrika", "ulrika"];
      for (const username of usernameVariants) {
        user = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });
        if (user) {
          console.log(`✅ Found user with username: ${username}`);
          break;
        }
      }
    }

    if (!user) {
      console.log("❌ User 'Ulrika' not found. Searching for all teachers...");
      const allTeachers = await Teacher.find().populate("userId", "username email");
      console.log(`\n📋 Found ${allTeachers.length} teachers:`);
      allTeachers.forEach((t, idx) => {
        if (t.userId) {
          console.log(`   ${idx + 1}. ${t.userId.username} (${t.userId.email})`);
        }
      });
      process.exit(1);
    }

    console.log(`\n👤 User details:`);
    console.log(`   - ID: ${user._id}`);
    console.log(`   - Username: ${user.username}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Has password: ${!!user.password}`);
    console.log(`   - Roles: ${JSON.stringify(user.roles || [])}`);

    // Set new password
    const newPassword = "mindful"; // Default password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;
    await user.save();

    console.log(`\n✅ Password reset successfully!`);
    console.log(`   New password: ${newPassword}`);
    console.log(`\n⚠️  Please change this password after logging in!`);

    // Check if teacher profile exists
    const teacher = await Teacher.findOne({ userId: user._id });
    if (teacher) {
      console.log(`\n📚 Teacher profile found:`);
      console.log(`   - Subject: ${teacher.subject || "Not set"}`);
      console.log(`   - Color: ${teacher.colorCode || "Not set"}`);
    } else {
      console.log(`\n⚠️  No teacher profile found for this user.`);
    }
  } catch (err) {
    console.error("❌ Error resetting password:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

resetUlrikaPassword();
