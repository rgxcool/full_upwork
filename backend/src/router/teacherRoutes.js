import express from "express";
const router = express.Router();
import Teacher from "../models/Teacher.js";
import User from "../models/User.js"; // Make sure you import the User model

//Generate Random Color for the colorCode in TeacherProfile
function generateRandomColor() {
  return `#${Math.floor(Math.random() * 16777215)
    .toString(16)
    .padStart(6, "0")}`;
}

// Get all teachers
router.get("/teachers", async (req, res) => {
  try {
    const teachers = await Teacher.find().populate("userId", "username email");
    res.status(200).json(teachers);
  } catch (error) {
    console.error("Error fetching teachers:", error.message);
    res.status(500).json({ error: "Failed to fetch teachers." });
  }
});

// POST /teacher - Create a user + teacher profile
router.post("/teacher", async (req, res) => {
  console.log("📨 Incoming teacher POST:", req.body);

  try {
    const { username, email, colorCode } = req.body;

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

    // Create new User
    const user = new User({
      username,
      email,
      role: "teacher", // ensure this aligns with your role system
    });
    const savedUser = await user.save();

    // Create new Teacher linked to the User
    const teacher = new Teacher({
      userId: savedUser._id,
      colorCode: colorCode || generateRandomColor(),
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

export default router;
