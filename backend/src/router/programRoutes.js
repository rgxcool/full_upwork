import express from "express";
import Program from "../models/Program.js";
import Student from "../models/Student.js";
import Course from "../models/Course.js";

const router = express.Router();

router.get("/programs", async (req, res) => {
    const programs = await Program.find(); // Fetch all programs
    res.json(programs);
});

router.get("/programs/:programId/courses", async (req, res) => {
    const program = await Program.findById(req.params.programId).populate(
        "courses"
    ); // Fetch courses for a specific program
    if (!program) return res.status(404).json({ error: "Program not found" });
    res.json(program.courses);
});

router.get("/courses", async (req, res) => {
    const courses = await Course.find(); // Fetch all courses
    res.json(courses);
});

// Add a program to student
router.post("/student/:id/programs", async (req, res) => {
    const { programId } = req.body;

    try {
        const program = await Program.findById(programId).populate("courses");
        if (!program) {
            return res.status(404).json({ error: "Program not found" });
        }

        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        student.program = program.programName;
        student.courses.push(
            ...program.courses.map((course) => ({
                courseId: course._id,
                courseName: course.courseName,
            }))
        );

        await student.save();
        res.json("Program and courses added successfully");
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Failed to add program to student" });
    }
});

export default router;
