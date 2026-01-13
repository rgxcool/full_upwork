import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js"; // Adjust the path as needed

// Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the correct path
dotenv.config({ path: path.resolve(__dirname, "../.env.development") }); // Adjust path to match your backend folder

// Function to generate a strong random password
function generateStrongPassword(length = 16) {
    const charset =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let password = "";

    // Ensure at least one character from each category
    const categories = [
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ", // uppercase
        "abcdefghijklmnopqrstuvwxyz", // lowercase
        "0123456789", // numbers
        "!@#$%^&*()_+-=[]{}|;:,.<>?", // special characters
    ];

    // Add one character from each category
    categories.forEach((category) => {
        password += category[crypto.randomInt(0, category.length)];
    });

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
        password += charset[crypto.randomInt(0, charset.length)];
    }

    // Shuffle the password to randomize the order
    return password
        .split("")
        .sort(() => crypto.randomInt(0, 3) - 1)
        .join("");
}

// Extract username from email
function extractUsername(email) {
    const localPart = email.split("@")[0];
    return localPart
        .split(".")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

async function createMindfulAdmins() {
    try {
        const mongoUri = process.env.MONGODB_URI;

        // Connect to MongoDB
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        // Define the admin emails
        const adminEmails = [
            "claudia.rohanova-ruzbarsky@mindful.se",
            "paulina.levonian@mindful.se",
            "natalie@mindful.se",
            "cyrus.malekani@mindful.se",
            "rominaa.ghaderi94@gmail.com",
        ];

        const createdAdmins = [];
        const existingAdmins = [];
        const errors = [];

        for (const email of adminEmails) {
            try {
                // Check if admin already exists
                const existingAdmin = await User.findOne({ email: email });
                if (existingAdmin) {
                    console.log(`⚠️ Admin already exists: ${email}`);
                    existingAdmins.push(email);
                    continue;
                }

                // Generate a secure random password
                const plainPassword = generateStrongPassword();
                const hashedPassword = await bcrypt.hash(plainPassword, 12);

                // Extract username from email
                const username = extractUsername(email);

                // Create Admin User
                const admin = new User({
                    username: username,
                    email: email,
                    password: hashedPassword,
                    role: "systemadmin",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

                await admin.save();

                createdAdmins.push({
                    email: email,
                    username: username,
                    password: plainPassword,
                });

                console.log(`🎉 Admin created successfully: ${email}`);
            } catch (error) {
                console.error(
                    `❌ Error creating admin ${email}:`,
                    error.message
                );
                errors.push({ email, error: error.message });
            }
        }

        // Summary report
        console.log("\n" + "=".repeat(60));
        console.log("📊 MINDFUL ADMINS CREATION SUMMARY");
        console.log("=".repeat(60));

        if (createdAdmins.length > 0) {
            console.log(
                `\n✅ Successfully created ${createdAdmins.length} admin(s):`
            );
            createdAdmins.forEach((admin) => {
                console.log(`\n👤 ${admin.username}`);
                console.log(`📧 Email: ${admin.email}`);
                console.log(`🔑 Password: ${admin.password}`);
                console.log(
                    `⚠️  IMPORTANT: Change this password after first login!`
                );
            });
        }

        if (existingAdmins.length > 0) {
            console.log(
                `\n⚠️ Skipped ${existingAdmins.length} existing admin(s):`
            );
            existingAdmins.forEach((email) => console.log(`   - ${email}`));
        }

        if (errors.length > 0) {
            console.log(`\n❌ Failed to create ${errors.length} admin(s):`);
            errors.forEach(({ email, error }) => {
                console.log(`   - ${email}: ${error}`);
            });
        }

        console.log("\n" + "=".repeat(60));
        console.log("🔐 SECURITY REMINDER: Store these passwords securely and");
        console.log(
            "   ensure all admins change their passwords on first login!"
        );
        console.log("=".repeat(60));

        process.exit(0);
    } catch (error) {
        console.error("❌ Fatal error:", error);
        process.exit(1);
    }
}

createMindfulAdmins();
