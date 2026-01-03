import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js"; // Adjust the path as needed

// Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the correct path
dotenv.config({ path: path.resolve(__dirname, "../.env.production") }); // Adjust path to match your backend folder

async function createSystemAdmin() {
  try {
    const mongoUri = process.env.MONGODB_URI;

    // Connect to MongoDB
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Check if a systemadmin already exists
    const existingAdmin = await User.findOne({ role: "systemadmin" });
    if (existingAdmin) {
      console.log("⚠️ System Admin already exists:", existingAdmin.email);
      process.exit(1);
    }

    // Generate a secure password
    const plainPassword = "mindful"; // Change this before running!
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    // Create System Admin User
    const systemAdmin = new User({
      username: "Mindful Systemadmin",
      email: "admin@mindful.com", // Change this before running!
      password: hashedPassword,
      role: "systemadmin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await systemAdmin.save();
    console.log("🎉 System Admin created successfully!");
    console.log(`🔑 Login Email: admin@mindful.com`);
    console.log(`🔑 Password: ${plainPassword} (Change this ASAP!)`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating system admin:", error);
    process.exit(1);
  }
}

createSystemAdmin();
