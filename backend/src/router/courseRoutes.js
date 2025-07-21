import express from "express";
import Course from "../models/Course.js";
import {
    courseDetailRateLimiter,
    exemptAdminsFromRateLimit,
} from "../middleware/security.js";

const router = express.Router();

// 🔹 Fetch all courses
router.get("/courses", async (req, res) => {
    try {
        const courses = await Course.find();
        res.json(courses);
    } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🔹 Fetch a single course by ID
router.get(
    "/courses/:courseId",
    exemptAdminsFromRateLimit,
    courseDetailRateLimiter,
    async (req, res) => {
        try {
            const course = await Course.findById(req.params.courseId);
            if (!course)
                return res.status(404).json({ error: "Course not found" });
            res.json(course);
        } catch (error) {
            console.error("Error fetching course:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

// 🔹 Fetch a course ID by name
router.get("/courses/id", async (req, res) => {
    const { name } = req.query;
    try {
        const course = await Course.findOne({ courseName: name });

        if (!course) {
            return res.status(404).json({ error: "Course not found." });
        }

        res.json({ courseId: course._id });
    } catch (error) {
        console.error("Error fetching course ID:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get(
    "/course/:id",
    exemptAdminsFromRateLimit,
    courseDetailRateLimiter,
    async (req, res) => {
        try {
            const course = await Course.findById(req.params.id);
            if (!course)
                return res.status(404).json({ message: "Course not found" });
            res.json(course);
        } catch (err) {
            res.status(500).json({ message: "Server error" });
        }
    }
);

export default router;
