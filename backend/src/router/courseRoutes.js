import express from "express";
import Program from "../models/Program.js";
import Student from "../models/Student.js";
import Course from "../models/Course.js";

const router = express.Router();

router.get("/course", async (req, res) => {
    const courses = await Course.find(); // Fetch all courses
    res.json(courses);
});

router.get("/course/:courseId", async (req, res) => {
    const course = await Course.findById(req.params.courseId).populate(
        "courses"
    ); // Fetch courses for a specific program
    if (!program) return res.status(404).json({ error: "Program not found" });
    res.json(program.courses);
});

// Route to fetch a student ID by name
router.get("/course/id", async (req, res) => {
    const { name } = req.query;

    try {
        const course = await Course.findOne({ courseName: name }); // Check Model

        if (!course) {
            return res.status(404).json({ error: "Kursen hittades inte." });
        }

        res.json({ courseId: course._id });
    } catch (error) {
        console.error("Error fetching course:", error);
        res.status(500).json({ error: "Ett serverfel inträffade." });
    }
});

export default router;
