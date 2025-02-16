import express from "express";
import User from "../models/User.js"; // Ensure these models exist
import Course from "../models/Course.js";
import Student from "../models/Student.js";

const router = express.Router();

router.get("/search", async (req, res) => {
    const query = req.query.q;
    if (!query || !query.trim()) {
        return res.status(200).json([]); // Return empty array for empty search query
    }

    try {
        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } },
            ],
        }).select("_id username email");

        const courses = await Course.find({
            name: { $regex: query, $options: "i" },
        }).select("_id name description");

        const students = await Student.find({
            $or: [
                { name: { $regex: query, $options: "i" } },
                { studentId: { $regex: query, $options: "i" } },
            ],
        }).select("_id name studentId");

        const results = [
            ...users.map((user) => ({
                id: user._id,
                name: user.username,
                type: "Användare",
                extra: user.email,
            })),
            ...courses.map((course) => ({
                id: course._id,
                name: course.name,
                type: "Kurs",
                extra: course.description,
            })),
            ...students.map((student) => ({
                id: student._id,
                name: student.namn,
                type: "Elev",
                extra: `Student ID: ${student.studentId}`,
            })),
        ];

        res.json(results);
    } catch (error) {
        console.error("❌ Search error:", error);
        res.status(500).json({ message: "Server error during search." });
    }
});

export default router;
