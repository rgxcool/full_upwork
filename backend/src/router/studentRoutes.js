import { Router } from "express";
import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";

const router = Router();

// ✅ Get all students (Populates program, coursePackages, and courses)
router.get("/students", async (req, res) => {
    try {
        const students = await Student.find()
            .populate("program", "name") // Fetch program name
            .populate("coursePackages.coursePackageId", "name") // Fetch course package names
            .populate("courses.courseId", "courseName courseCode"); // Fetch course details

        res.status(200).json(students);
    } catch (error) {
        console.error("❌ Error fetching students:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ Add a single student
router.post("/student", async (req, res) => {
    try {
        const student = new Student(req.body);
        const savedStudent = await student.save();
        res.status(201).json(savedStudent);
    } catch (error) {
        console.error("❌ Error adding student:", error.message);
        res.status(500).json({ error: "Failed to add student" });
    }
});

// ✅ Update student dropout status
router.put("/student/:id", async (req, res) => {
    try {
        const updatedStudent = await Student.findByIdAndUpdate(
            req.params.id,
            { $set: { dropout: req.body.dropout } },
            { new: true }
        )
            .populate("program", "name")
            .populate("coursePackages.coursePackageId", "name")
            .populate("courses.courseId", "courseName courseCode");

        if (!updatedStudent) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.status(200).json(updatedStudent);
    } catch (error) {
        console.error("❌ Error updating dropout status:", error);
        res.status(500).json({ error: "Failed to update student" });
    }
});

// ✅ Add a course to a student by ID
router.post("/student/:studentId/courses", async (req, res) => {
    const { studentId } = req.params;
    const { courseId } = req.body;

    try {
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: "Course not found" });
        }

        student.courses.push({ courseId: course._id });
        await student.save();

        const updatedStudent = await Student.findById(studentId)
            .populate("program", "name")
            .populate("coursePackages.coursePackageId", "name")
            .populate("courses.courseId", "courseName courseCode");

        res.status(200).json(updatedStudent);
    } catch (error) {
        console.error("❌ Error adding course to student:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ Remove a course from a student
router.delete("/student/:id/courses/:courseId", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        student.courses = student.courses.filter(
            (course) => course.courseId.toString() !== req.params.courseId
        );
        await student.save();

        res.json({ message: "Course removed successfully" });
    } catch (error) {
        console.error("❌ Error removing course:", error);
        res.status(500).json({ error: "Failed to remove course." });
    }
});

// ✅ Fetch student details by ID
router.get("/student/:id", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id)
            .populate("program", "name")
            .populate("coursePackages.coursePackageId", "name")
            .populate("courses.courseId", "courseName courseCode");

        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }
        res.json(student);
    } catch (error) {
        console.error("❌ Error fetching student:", error);
        res.status(500).json({ error: "Failed to fetch student details" });
    }
});

// ✅ Delete a single student by ID
router.delete("/student/:id", async (req, res) => {
    try {
        const deletedStudent = await Student.findByIdAndDelete(req.params.id);
        if (!deletedStudent) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.json({ message: "Student deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting student:", error);
        res.status(500).json({ error: "Failed to delete student" });
    }
});

// ✅ Delete all students (⚠️ Be careful using this in production)
router.delete("/students", async (req, res) => {
    try {
        await Student.deleteMany({});
        res.json({ message: "All students deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting all students:", error);
        res.status(500).json({ error: "Failed to delete all students" });
    }
});

// ✅ Test route to verify student data
router.get("/test-students", async (req, res) => {
    try {
        const students = await Student.find()
            .populate("program", "name")
            .populate("coursePackages.coursePackageId", "name")
            .populate("courses.courseId", "courseName courseCode");

        res.status(200).json(students);
    } catch (error) {
        res.status(500).json({
            error: "Failed to fetch students",
            details: error.message,
        });
    }
});

export default router;
