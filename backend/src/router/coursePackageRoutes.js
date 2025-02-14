import express from "express";
import CoursePackage from "../models/CoursePackage.js";
import Course from "../models/Course.js";

const router = express.Router();

// Get all course packages
router.get("/coursePackages", async (req, res) => {
    try {
        const coursePackages = await CoursePackage.find().populate(
            "coursePackageCourses"
        );
        res.json(coursePackages);
    } catch (error) {
        console.error("Error fetching course packages:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get all courses by course package
router.get("/coursePackage/:coursePackageId/courses", async (req, res) => {
    try {
        const coursePackage = await CoursePackage.findById(
            req.params.coursePackageId
        ).populate("coursePackageCourses");
        if (!coursePackage) {
            return res.status(404).json({ error: "CoursePackage not found" });
        }
        res.json(coursePackage.coursePackageCourses);
    } catch (error) {
        console.error("Error fetching courses for course package:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
