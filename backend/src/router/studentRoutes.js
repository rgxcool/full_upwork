import { Router } from "express";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import CoursePackage from "../models/CoursePackage.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasCommentPermission } from "../utils/roles.js";

const router = Router();

// PUT: Uppdatera kursstatus för en specifik kurs i studentens kurslista
router.put('/students/:studentId/course/:courseId/status', async (req, res) => {
    console.log("📥 ROUTE HIT", req.params);

    console.log("BODY", req.body)

  const { studentId, courseId } = req.params;
  const { status } = req.body;

  try {
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const course = student.courses.find(c => c.courseId.toString() === courseId);
    if (!course) return res.status(404).json({ message: 'Course not found in student' });

    course.status = status; // 👈 Lägg till status i schemat om det inte finns!

    await student.save();
    res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get("/students", authenticateUser, async (req, res) => {
    try {
        const students = await Student.find()
            .populate(
                "courses.courseId",
                "courseName courseCode coursePoints courseExtent"
            )
            .populate(
                "coursePackages.coursePackageId",
                "coursePackageName coursePackageCode"
            )
            .populate("program.programId", "programName")
            .select("+commentHistory.seenBy");

        res.status(200).json(students);
    } catch (error) {
        console.error("❌ Error fetching students:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ Add a new student
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

// Add a course to student with default grade
router.post("/student/:studentId/addcourse", async (req, res) => {
    const { studentId } = req.params;
    const { courseId } = req.body;

    try {
        const student = await Student.findById(studentId);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ error: "Course not found" });

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

// Similarly, add a program with default grade
router.post("/student/:studentId/setprogram", async (req, res) => {
    const { studentId } = req.params;
    const { programId } = req.body;

    try {
        const student = await Student.findById(studentId);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.program = { programId, grade: null };
        await student.save();

        res.status(200).json(student);
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// Adding course package similarly
router.post("/student/:studentId/addcoursepackage", async (req, res) => {
    const { studentId } = req.params;
    const { coursePackageId } = req.body;

    try {
        const student = await Student.findById(studentId);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.coursePackages.push({ coursePackageId, grade: null });
        await student.save();

        res.status(200).json(student);
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ Remove course from student
router.delete("/student/:id/courses/:courseId", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

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

// ✅ Get single student by ID
router.get("/student/:id", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id)
            .populate(
                "courses.courseId",
                "courseName courseCode coursePoints courseExtent"
            )
            .populate("coursePackages.coursePackageId", "coursePackageName")
            .populate("program.programId", "programName");

        if (!student)
            return res.status(404).json({ error: "Student not found" });

        res.json(student);
    } catch (error) {
        console.error("❌ Error fetching student:", error);
        res.status(500).json({ error: "Failed to fetch student details" });
    }
});

// ✅ Delete single student
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
router.patch("/students/:id", authenticateUser, async (req, res) => {
    const { aplStatus } = req.body;
    const userId = req.user?.userId;

    try {
        const student = await Student.findById(req.params.id);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.aplStatus = aplStatus;
        student.aplStatusHistory.push({
            status: aplStatus,
            changedAt: new Date(),
            changedBy: userId,
        });

        await student.save();

        res.json(student);
    } catch (err) {
        console.error("❌ Failed to update APL status:", err);
        res.status(500).json({ error: "Failed to update APL status" });
    }
});

// ✅ Add comment
router.post("/students/:id/comment", authenticateUser, async (req, res) => {
    const { comment } = req.body;
    const { userId, role, name } = req.user;

    if (!hasCommentPermission(role)) {
        return res
            .status(403)
            .json({ error: "Insufficient permissions to comment." });
    }

    try {
        const student = await Student.findById(req.params.id);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.commentHistory.unshift({
            comment,
            author: name,
            date: new Date(),
            seenBy: [new mongoose.Types.ObjectId(userId)],
        });

        await student.save();
        res.status(200).json({ commentHistory: student.commentHistory });
    } catch (err) {
        console.error("❌ Failed to save comment:", err);
        res.status(500).json({ error: "Failed to add comment" });
    }
});

// ✅ Edit comment
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

// ✅ Delete comment
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
    await student.save();
    res.json({ success: true });
});
// ✅ Update student fully (not just dropout)
router.put("/student/:id", async (req, res) => {
    try {
        const updatedStudent = await Student.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        )
            .populate("courses.courseId", "courseName courseCode")
            .populate("coursePackages.coursePackageId", "coursePackageName")
            .populate("program.programId", "programName");

        if (!updatedStudent) {
            return res.status(404).json({ error: "Student not found" });
        }

        res.status(200).json(updatedStudent);
    } catch (error) {
        console.error("❌ Error updating student:", error);
        res.status(500).json({ error: "Failed to update student" });
    }
});

// ✅ Mark comments as seen (🛠 FIXED)
router.post(
    "/students/:id/mark-comments-seen",
    authenticateUser,
    async (req, res) => {
        try {
            const student = await Student.findById(req.params.id);
            if (!student)
                return res.status(404).json({ error: "Student not found" });

            const userId = req.userId;
            console.log("🔑 userId from session:", userId);
            console.log(
                "🎯 seenBy BEFORE update:",
                student.commentHistory.map((c) => c.seenBy)
            );

            const objectId = new mongoose.Types.ObjectId(userId);
            let updated = false;

            student.commentHistory.forEach((entry, i) => {
                const alreadySeen = (entry.seenBy || []).some((id) =>
                    id.equals(objectId)
                );
                if (!alreadySeen) {
                    entry.seenBy.push(objectId);
                    updated = true;
                }
            });

            if (updated) {
                student.markModified("commentHistory");
                await student.save();
                console.log(
                    "✅ Final seenBy in DB:",
                    student.commentHistory.map((c) => c.seenBy)
                );
            }

            res.json({ message: "Marked as seen", updatedStudent: student });
        } catch (err) {
            console.error("❌ Error in mark-comments-seen:", err);
            res.status(500).json({ error: "Failed to mark comments as seen." });
        }
    }
);
router.patch("/student/:studentId/course/:courseId/grade", async (req, res) => {
    const { studentId, courseId } = req.params;
    const { grade } = req.body;

    if (!["A", "B", "C", "D", "E", "F"].includes(grade))
        return res.status(400).json({ error: "Invalid grade." });

    try {
        const student = await Student.findOneAndUpdate(
            { _id: studentId, "courses.courseId": courseId },
            { $set: { "courses.$.grade": grade } },
            { new: true }
        ).populate("courses.courseId", "courseName courseCode");

        res.json(student);
    } catch (error) {
        console.error("❌ Error updating grade:", error);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/programs", async (req, res) => {
    const programs = await Program.find().select("programName");
    res.json(programs);
});
router.get("/course-packages", async (req, res) => {
    const packages = await CoursePackage.find().select("coursePackageName");
    res.json(packages);
});
router.get("/courses", async (req, res) => {
    const courses = await Course.find().select("courseName");
    res.json(courses);
});

router.put("/student/:id/education/:courseId/grade", async (req, res) => {
    const { id, courseId } = req.params;
    const { grade } = req.body;

    try {
        // Find the student by ID
        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Find the course in the student's education array
        const courseIndex = student.education.findIndex(
            (edu) => edu.refId.toString() === courseId
        );

        if (courseIndex === -1) {
            return res
                .status(404)
                .json({ error: "Course not found in student's education" });
        }

        // Update the grade of the course
        student.education[courseIndex].grade = grade;
        student.updatedAt = new Date(); // Update modified date

        await student.save();

        res.status(200).json(student);
    } catch (err) {
        console.error("❌ Error updating grade:", err);
        res.status(500).json({ error: "Failed to update grade" });
    }
});

export default router;
