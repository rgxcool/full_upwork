import express from "express";
const router = express.Router();
const Education = require("../models/educationSchema");
const Student = require("../models/elevSchema");

router.get("/programs", async (req, res) => {
    const programs = await Education.Program.find(); // Fetch all programs
    res.json(programs);
});

router.get("/programs/:programId/courses", async (req, res) => {
    const program = await Education.Program.findById(
        req.params.programId
    ).populate("courses"); // Fetch courses for a specific program
    if (!program) return res.status(404).json({ error: "Program not found" });
    res.json(program.courses);
});

router.get("/courses", async (req, res) => {
    const courses = await Education.Course.find(); // Fetch all courses
    res.json(courses);
});

// Add a program to student
router.post("/students/:id/programs", async (req, res) => {
    const { programId } = req.body;

    try {
        const program = await Education.Program.findById(programId).populate(
            "courses"
        );
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
