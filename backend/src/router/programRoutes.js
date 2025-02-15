import express from "express";
import Program from "../models/Program.js";

const router = express.Router();

router.get("/programs", async (req, res) => {
    try {
        const programs = await Program.find()
            .populate("programCourses")
            .populate({
                path: "programCoursePackages",
                populate: { path: "coursePackageCourses" },
            });
        res.json(programs);
    } catch (err) {
        console.error("Error fetching programs:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Get all courses by programId
router.get("/program/:programId/courses", async (req, res) => {
    try {
        const program = await Program.findById(req.params.programId).populate(
            "programCourses"
        );

        if (!program) {
            console.warn(`Program with ID ${req.params.programId} not found.`);
            return res.status(404).json({ error: "Program not found" });
        }

        console.log("Fetched program data:", program);

        if (!program.programCourses || program.programCourses.length === 0) {
            console.warn(
                `No courses found for program ID: ${req.params.programId}`
            );
            return res.status(200).json([]); // Ensure an empty array is returned instead of an empty string
        }

        res.json(program.programCourses);
    } catch (error) {
        console.error("Error fetching program courses:", error);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
