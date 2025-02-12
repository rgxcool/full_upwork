import express from "express";
import Program from "../models/Program.js";
import Student from "../models/Student.js";
import Course from "../models/Course.js";

const router = express.Router();

router.get("/program", async (req, res) => {
    const programs = await Program.find(); // Fetch all programs
    res.json(programs);
});

router.get("/program/:programId/courses", async (req, res) => {
    const program = await Program.findById(req.params.programId).populate(
        "courses"
    ); // Fetch courses for a specific program
    if (!program) return res.status(404).json({ error: "Program not found" });
    res.json(program.courses);
});

router.get("/program/courses", async (req, res) => {
    const courses = await Course.find(); // Fetch all courses
    res.json(courses);
});

export default router;
