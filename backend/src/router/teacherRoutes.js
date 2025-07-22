import express from "express";
const router = express.Router();
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { isAuthenticated, hasRole } from "../middleware/auth.js";

//Generate Random Color for the colorCode in TeacherProfile
function generateRandomColor() {
    return `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0")}`;
}

// Function to generate a strong random password
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
// DEBUG: Testa populering av userId för alla lärare
router.get(
  "/debug-teachers",
  async (req, res) => {
    try {
      const teachers = await Teacher.find().populate("userId", "username email role");

      const results = teachers.map((t) => ({
        teacherId: t._id,
        subject: t.subject,
        colorCode: t.colorCode,
        user: t.userId
          ? {
              id: t.userId._id,
              username: t.userId.username,
              email: t.userId.email,
              role: t.userId.role,
            }
          : null,
      }));

      res.json({ success: true, count: results.length, teachers: results });
    } catch (err) {
      console.error("❌ DEBUG populate error:", err);
      res.status(500).json({ error: "Debug route failed." });
    }
  }
);


// Get all teachers
router.get(
    "/teachers",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const teachers = await Teacher.find()
                .populate("userId", "username email")
                .sort({ createdAt: -1 });
            res.status(200).json(teachers);
        } catch (error) {
            console.error("Error fetching teachers:", error.message);
            res.status(500).json({ error: "Failed to fetch teachers." });
        }
    }
);

// POST /admin/teacher - Create a user + teacher profile (Admin only)
router.post(
    "/admin/teacher",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        console.log("📨 Incoming teacher POST:", req.body);

        try {
            const { username, email, subject, colorCode, generatePassword } =
                req.body;

            if (!username || !email || !subject) {
                return res.status(400).json({
                    error: "Username, email, and subject are required.",
                });
            }

            // Check if user with this email already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res
                    .status(409)
                    .json({ error: "A user with this email already exists." });
            }

            // Generate password if requested
            let plainPassword = null;
            let hashedPassword = null;

            if (generatePassword) {
                plainPassword = generateStrongPassword();
                hashedPassword = await bcrypt.hash(plainPassword, 12);
            } else {
                // If no password generation requested, set a default that forces password change
                plainPassword = "ChangeMe123!";
                hashedPassword = await bcrypt.hash(plainPassword, 12);
            }

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
                colorCode: colorCode || generateRandomColor(),
                subject: (subject || "").trim(),
            });

            const savedTeacher = await teacher.save();

            // Return success with password if generated
            const response = {
                success: true,
                message: "Teacher created successfully.",
                data: {
                    user: {
                        id: savedUser._id,
                        username: savedUser.username,
                        email: savedUser.email,
                        role: savedUser.role,
                    },
                    teacher: {
                        id: savedTeacher._id,
                        subject: savedTeacher.subject,
                        colorCode: savedTeacher.colorCode,
                    },
                },
            };

            if (generatePassword) {
                response.password = plainPassword;
            }

            res.status(201).json(response);
        } catch (error) {
            console.error("❌ Error in POST /admin/teacher:", error.message);
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// POST /teacher - Create a user + teacher profile (kept for backward compatibility)
router.post("/teacher", async (req, res) => {
    console.log("📨 Incoming teacher POST:", req.body);

    try {
        const { username, email, colorCode, subject } = req.body;

        if (!username || !email) {
            return res
                .status(400)
                .json({ error: "Username and email are required." });
        }

        // Check if user with this email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res
                .status(409)
                .json({ error: "A user with this email already exists." });
        }

        // Create new User (without password for backward compatibility)
        const user = new User({
            username,
            email,
            role: "teacher",
        });
        const savedUser = await user.save();

        // Create new Teacher linked to the User
        const teacher = new Teacher({
            userId: savedUser._id,
            colorCode: colorCode || generateRandomColor(),
            subject: subject || "Övrigt", // Default subject if not provided
        });
        const savedTeacher = await teacher.save();

        res.status(201).json({
            message: "Teacher created successfully.",
            data: {
                user: savedUser,
                teacher: savedTeacher,
            },
        });
    } catch (error) {
        console.error("❌ Error in POST /teacher:", error.message);
        res.status(500).json({ error: "Internal server error." });
    }
});

// PUT /teachers/:id - Update teacher information
router.put(
    "/teachers/:id",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { username, email, subject, colorCode } = req.body;

            // Find teacher
            const teacher = await Teacher.findById(id).populate("userId");
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            // Update user information
            if (username || email) {
                const updateData = {};
                if (username) updateData.username = username;
                if (email) updateData.email = email;

                await User.findByIdAndUpdate(teacher.userId._id, updateData);
            }

            // Update teacher information
            const teacherUpdateData = {};
            if (subject) teacherUpdateData.subject = subject;
            if (colorCode) teacherUpdateData.colorCode = colorCode;

            const updatedTeacher = await Teacher.findByIdAndUpdate(
                id,
                teacherUpdateData,
                { new: true }
            ).populate("userId", "username email");

            res.json({
                success: true,
                message: "Teacher updated successfully",
                teacher: updatedTeacher,
            });
        } catch (error) {
            console.error("❌ Error updating teacher:", error.message);
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// PUT /teachers/:id/password - Change teacher password
router.put(
    "/teachers/:id/password",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { password } = req.body;

            if (!password) {
                return res.status(400).json({ error: "Password is required." });
            }

            // Find teacher
            const teacher = await Teacher.findById(id).populate("userId");
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Update password
            await User.findByIdAndUpdate(teacher.userId._id, {
                password: hashedPassword,
                updatedAt: new Date(),
            });

            res.json({
                success: true,
                message: "Password updated successfully",
            });
        } catch (error) {
            console.error("❌ Error updating password:", error.message);
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// DELETE /teachers/:id - Delete teacher
router.delete(
    "/teachers/:id",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { id } = req.params;

            // Find teacher
            const teacher = await Teacher.findById(id).populate("userId");
            if (!teacher) {
                return res.status(404).json({ error: "Teacher not found." });
            }

            // Check if teacher has assigned students
            const Student = (await import("../models/Student.js")).default;
            const studentCount = await Student.countDocuments({
                teacherId: id,
            });
            if (studentCount > 0) {
                return res.status(400).json({
                    error: `Cannot delete teacher. ${studentCount} student(s) are assigned to this teacher.`,
                });
            }

            // Delete teacher and user
            await Teacher.findByIdAndDelete(id);
            await User.findByIdAndDelete(teacher.userId._id);

            res.json({
                success: true,
                message: "Teacher deleted successfully",
            });
        } catch (error) {
            console.error("❌ Error deleting teacher:", error.message);
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

// Unassign all students from a teacher
router.put(
    "/teachers/:id/unassign-all-students",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    async (req, res) => {
        try {
            const { id } = req.params;
            const Student = (await import("../models/Student.js")).default;
            const result = await Student.updateMany({ teacherId: id }, { $set: { teacherId: null } });
            res.json({ success: true, message: `Unassigned ${result.modifiedCount} students from teacher.` });
        } catch (error) {
            console.error("Error unassigning students from teacher:", error);
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

export default router;
