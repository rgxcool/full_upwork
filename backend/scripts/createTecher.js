import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import Teacher from "../src/models/Teacher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.production") });

function getRandomHexColor() {
  return (
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );
}

async function createNextAvailableTeacher() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    const baseName = "Mindful Teacher";
    const baseEmail = "teacher";
    const domain = "@mindful.com";
    const plainPassword = "mindful"; // ⚠️ Change this in production

    let index = 1;
    let name, email;

    // Find next available email
    while (true) {
      name = `${baseName} ${index}`;
      email = `${baseEmail}${index}${domain}`;
      const existingUser = await User.findOne({ email });
      if (!existingUser) break;
      index++;
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    // Create User
    const newUser = new User({
      username: name,
      email,
      password: hashedPassword,
      role: "teacher",
    });

    await newUser.save();

    // Create Teacher profile
    const colorCode = getRandomHexColor();

    const newTeacher = new Teacher({
      userId: newUser._id,
      colorCode,
    });

    await newTeacher.save();

    console.log("🎉 New teacher created:");
    console.log(`👤 Name: ${name}`);
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${plainPassword}`);
    console.log(`🎨 Color: ${colorCode}`);
  } catch (err) {
    console.error("❌ Error creating teacher:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

createNextAvailableTeacher();
