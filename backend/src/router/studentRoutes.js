import { Router } from "express";
import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasCommentPermission } from "../utils/roles.js";

const router = Router();

// ✅ Get all students (Populates coursePackages, and courses)
router.get("/students", async (req, res) => {
  try {
    const students = await Student.find()
      .populate("courses.courseId", "courseName courseCode")
      .populate("coursePackages.coursePackageId", "coursePackageName");

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
      .populate("coursePackages.coursePackageId", "coursePackageName")
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
router.post("/student/:studentId/addcourse", async (req, res) => {
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
      .populate("courses.courseId", "courseName courseCode")
      .populate("coursePackages.coursePackageId", "coursePackageName");

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
      .populate("coursePackages.coursePackageId", "coursePackageName")
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

// ✅ Delete all students
router.delete("/students", async (req, res) => {
  try {
    await Student.deleteMany({});
    res.json({ message: "All students deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting all students:", error);
    res.status(500).json({ error: "Failed to delete all students" });
  }
});

// ✅ Update APL status
router.patch("/students/:id", async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { aplStatus: req.body.aplStatus },
      { new: true }
    );
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: "Failed to update APL status" });
  }
});

// ✅ Comment routes with authentication
router.post("/students/:id/comment", authenticateUser, async (req, res) => {
  const { comment } = req.body;
  const { role, name } = req.user;

  if (!hasCommentPermission(role)) {
    return res
      .status(403)
      .json({ error: "Insufficient permissions to comment." });
  }

  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });

    student.commentHistory.unshift({ comment, author: name, date: new Date() });
    await student.save();
    res.status(200).json(student);
  } catch (err) {
    res.status(500).json({ error: "Failed to add comment" });
  }
});

router.put("/students/:id/comment", authenticateUser, async (req, res) => {
  const { index, updatedEntry } = req.body;
  const { role } = req.user;

  if (!["admin", "systemadmin"].includes(role)) {
    return res
      .status(403)
      .json({ error: "You don't have permission to edit comments." });
  }

  const student = await Student.findById(req.params.id);
  if (!student || !student.commentHistory[index]) {
    return res.status(404).json({ error: "Comment not found." });
  }

  student.commentHistory[index] = updatedEntry;
  await student.save();

  res.json({ success: true });
});

router.delete("/students/:id/comment", authenticateUser, async (req, res) => {
  const { index } = req.body;
  const { role } = req.user;

  if (!["admin", "systemadmin"].includes(role)) {
    return res
      .status(403)
      .json({ error: "You don't have permission to delete comments." });
  }

  const student = await Student.findById(req.params.id);
  if (!student || !student.commentHistory[index]) {
    return res.status(404).json({ error: "Comment not found." });
  }

  student.commentHistory.splice(index, 1);
  console.log("🔍 Before save:", student.commentHistory);
  await student.save();
  console.log("✅ After save:", student.commentHistory);

  res.json({ success: true });
});

router.post(
  "/students/:id/mark-comments-seen",
  authenticateUser,
  async (req, res) => {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const userId = req.user?.userId || req.user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let updated = false;

    student.commentHistory.forEach((entry) => {
      if (!entry.seenBy) entry.seenBy = [];
      if (!entry.seenBy.includes(userId)) {
        entry.seenBy.push(userId);
        updated = true;
      }
    });

    if (updated) await student.save();

    res.json({ message: "Marked as seen" });
  }
);

export default router;
