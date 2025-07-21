import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

/**
 * Generate a strong random password
 */
function generateStrongPassword(length = 12) {
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

/**
 * Generate a random color for teacher profile
 */
function generateRandomColor() {
    return `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0")}`;
}

/**
 * Create or find teacher by name
 * @param {string} teacherName - The teacher's name
 * @param {string} createdByUserId - ID of the user who created this teacher
 * @param {string} subject - The subject for the teacher (optional)
 * @returns {Object} - { teacher, wasCreated, password }
 */
export async function createOrFindTeacher(
    teacherName,
    createdByUserId = null,
    subject = "Övrigt"
) {
    try {
        // First, try to find existing teacher by name
        const allTeachers = await Teacher.find().populate(
            "userId",
            "username email"
        );
        const existingTeacher = allTeachers.find((t) => {
            if (!t.userId || !t.userId.username) {
                console.warn(
                    "Teacher found without valid userId or username:",
                    t
                );
                return false;
            }
            return (
                t.userId.username.toLowerCase() === teacherName.toLowerCase()
            );
        });

        if (existingTeacher) {
            return {
                teacher: existingTeacher,
                wasCreated: false,
                password: null,
            };
        }

        // Create new user account
        const username = teacherName.trim();
        const email = `${username
            .toLowerCase()
            .replace(/\s+/g, ".")}@mindful.se`;

        // Generate password
        const plainPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        // Create new User
        const user = new User({
            username,
            email,
            password: hashedPassword,
            role: "teacher",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const savedUser = await user.save();

        // Create new Teacher linked to the User
        const teacher = new Teacher({
            userId: savedUser._id,
            colorCode: generateRandomColor(),
            subject: subject || "Övrigt",
        });

        const savedTeacher = await teacher.save();

        // Log the creation
        console.log(`👨‍🏫 Auto-created teacher: ${username} (${email})`);

        return {
            teacher: savedTeacher,
            wasCreated: true,
            password: plainPassword,
        };
    } catch (error) {
        console.error("Error creating or finding teacher:", error);
        throw error;
    }
}
