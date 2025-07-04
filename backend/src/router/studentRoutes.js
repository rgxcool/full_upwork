/**
 * @file studentRoutes.js
 * @description Contains all student-related routes for CRUD operations, grading,
 * comment handling, education assignment, dropout notifications, and APL tracking.
 * Uses Mongoose models and Express routing.
 */

import { Router } from "express";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import Notification from "../models/Notification.js";
import CoursePackage from "../models/CoursePackage.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasCommentPermission } from "../utils/roles.js";
import User from "../models/User.js";
import { sendDropoutNotification } from "../controllers/notificationController.js";

const router = Router();


router.get("/students/by-teacher/:teacherId", async (req, res) => {
  try {
    const students = await Student.find({ teacherId: req.params.teacherId });
    res.json(
      students.map((s) => ({
        _id: s._id,
        name: s.name,
        personalNumber: s.personalNumber,
        attended: s.attendedExam || false,
        additionalInfo: s.additionalInfo || '',
      }))
    );
  } catch (error) {
    console.error("❌ Error fetching students by teacher:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});


/**
 * @route   PUT /students/:studentId/education/:educationId/status
 * @desc    Updates the status of a student's education entry. Sends a notification if status is 'Avbrott'.
 * @access  Public
 */
router.put(
  "/students/:studentId/education/:educationId/status",
  async (req, res) => {
    const { studentId, educationId } = req.params;
    const { status } = req.body;

    try {
      const student = await Student.findById(studentId);
      if (!student)
        return res.status(404).json({ message: "Student not found" });

      const education = student.education.find(
        (e) => e.refId.toString() === educationId
      );
      if (!education)
        return res
          .status(404)
          .json({ message: "Education not found for student" });

      education.status = status;

      if (status === "Avbrott") {
        student.dropout = true;

        const notification = await sendDropoutNotification({
          student,
          education,
        });
        console.log("Notification sent:", notification);
        await student.save();
        return res.status(200).json({
          message: "Status updated and notification sent",
          notification,
        });
      } else {
        student.dropout = false; // (om du vill nollställa annars)
        await student.save();
        return res.status(200).json({ message: "Status updated successfully" });
      }
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * @route   GET /students
 * @desc    Fetch all students with populated education references and comment visibility info.
 * @access  Protected
 */
router.get("/students", authenticateUser, async (req, res) => {
  try {
    const students = await Student.find().lean();

    for (const student of students) {
      for (const edu of student.education) {
        if (!edu.refId) continue;

        const Model =
          edu.type === "Course"
            ? Course
            : edu.type === "CoursePackage"
            ? CoursePackage
            : edu.type === "Program"
            ? Program
            : null;

        if (Model) {
          edu.refId = await Model.findById(edu.refId)
            .lean()
            .select(
              edu.type === "Course"
                ? "courseName courseCode"
                : edu.type === "CoursePackage"
                ? "coursePackageName coursePackageCode"
                : "programName"
            );
        }
      }
    }

    res.status(200).json(students);
  } catch (error) {
    console.error("❌ Error fetching students:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route   POST /student
 * @desc    Adds a new student to the database.
 * @access  Public
 */
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

/**
 * @route   POST /student/:studentId/addcourse
 * @desc    Adds a course to a student's education array.
 * @access  Public
 */
router.post("/student/:studentId/addcourse", async (req, res) => {
  const { studentId } = req.params;
  const { courseId } = req.body;

  try {
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Check if the course already exists in the student's education
    const alreadyExists = student.education.some(
      (entry) => entry.type === "Course" && entry.refId.toString() === courseId
    );

    if (alreadyExists) {
      return res.status(400).json({ error: "Course already exists" });
    }

    // Add course to the student's education
    student.education.push({
      type: "Course",
      refId: course._id,
      grade: "", // Default grade if needed
    });

    // Save the updated student document
    await student.save();

    // Return the updated student with populated education references
    const updatedStudent = await Student.findById(studentId).populate({
      path: "education.refId",
      model: "Course", // populate the course details
      select: "courseName courseCode coursePoints courseExtent",
    });

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error("❌ Error adding course to student:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route   POST /student/:studentId/setprogram
 * @desc    Assigns a program to a student.
 * @access  Public
 */
router.post("/student/:studentId/setprogram", async (req, res) => {
  const { studentId } = req.params;
  const { programId } = req.body;

  try {
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    student.program = { programId, grade: null };
    await student.save();

    res.status(200).json(student);
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route   POST /student/:studentId/addcoursepackage
 * @desc    Adds a course package to a student.
 * @access  Public
 */
router.post("/student/:studentId/addcoursepackage", async (req, res) => {
  const { studentId } = req.params;
  const { coursePackageId } = req.body;

  try {
    const student = await Student.findById(studentId);

    if (!student) return res.status(404).json({ error: "Student not found" });

    student.coursePackages.push({ coursePackageId, grade: null });
    await student.save();

    res.status(200).json(student);
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @route   DELETE /student/:id/courses/:courseId
 * @desc    Removes a course from a student's courses array.
 * @access  Public
 */
router.delete("/student/:id/courses/:courseId", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });

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

/**
 * @route   GET /student/:id
 * @desc    Fetches a single student with populated fields.
 * @access  Public
 */
router.get("/student/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate({
        path: "education.refId",
        model: function (doc) {
          if (doc.type === "Course") return "Course"; // populate Course model
          if (doc.type === "CoursePackage") return "CoursePackage"; // populate CoursePackage model
          if (doc.type === "Program") return "Program"; // populate Program model
          return null; // In case of an invalid type, we don’t populate anything
        },
        select:
          "courseName courseCode coursePackageName coursePackageCode programName", // Adjust selection based on type
      })
      .select("+commentHistory.seenBy");

    if (!student) return res.status(404).json({ error: "Student not found" });

    res.json(student);
  } catch (error) {
    console.error("❌ Error fetching student:", error);
    res.status(500).json({ error: "Failed to fetch student details" });
  }
});

/**
 * @route   DELETE /student/:id
 * @desc    Deletes a specific student.
 * @access  Public
 */
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

/**
 * @route   DELETE /students
 * @desc    Deletes all student records.
 * @access  Public
 */
router.delete("/students", async (req, res) => {
  try {
    await Student.deleteMany({});
    res.json({ message: "All students deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting all students:", error);
    res.status(500).json({ error: "Failed to delete all students" });
  }
});

/**
 * @route   PATCH /students/:id
 * @desc    Updates APL status and tracks changes.
 * @access  Protected
 */
router.patch("/students/:id", authenticateUser, async (req, res) => {
  const { aplStatus } = req.body;
  const userId = req.user?.userId;

  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // 🔒 Only allow aplStatus to be changed
    if (typeof aplStatus === "string") {
      student.aplStatus = aplStatus;
      student.aplStatusHistory.push({
        status: aplStatus,
        changedAt: new Date(),
        changedBy: userId,
      });

      await student.save();
      return res.json(student);
    } else {
      return res.status(400).json({ error: "Invalid APL status update" });
    }
  } catch (err) {
    console.error("❌ Failed to update APL status:", err);
    return res.status(500).json({ error: "Failed to update APL status" });
  }
});

/**
 * @route   POST /students/:id/comment
 * @desc    Adds a comment to a student's commentHistory.
 * @access  Protected
 */
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
    if (!student) return res.status(404).json({ error: "Student not found" });

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

/**
 * @route   PUT /students/:id/comment
 * @desc    Edits a comment in a student's commentHistory.
 * @access  Protected (admin/systemadmin only)
 */
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

/**
 * @route   DELETE /students/:id/comment
 * @desc    Deletes a comment from a student's commentHistory.
 * @access  Protected (admin/systemadmin only)
 */
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

/**
 * @route   PUT /student/:id
 * @desc    Updates full student object (excluding Mongo ID).
 * @access  Public
 */
router.put("/student/:id", async (req, res) => {
  console.log("📥 Received payload:", req.body);

  const allowedFields = [
    "name",
    "personalNumber",
    "additionalInfo",
    "aplStatus",
    "phone",
    "email",
    "exam",
    "teacher",
    "dropout",
    "startDate",
    "endDate",
    "finalExamDate",
    "examMunicipality",
    "examLocation",
    "examTime",
    "education", // This will now be processed separately for course, coursePackage, program
  ];

  const updates = {};

  // Process the allowed fields and populate the updates object
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  // 🛡️ Special handling for municipality
  if (
    req.body.municipality &&
    typeof req.body.municipality === "object" &&
    typeof req.body.municipality.type === "string"
  ) {
    updates["municipality"] = { type: req.body.municipality.type };
  }

  try {
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Special handling for education field
    if (req.body.education) {
      // We need to process each education entry separately based on type
      const updatedEducation = student.education.map((edu) => {
        const updateData = req.body.education.find(
          (newEdu) => newEdu.refId.toString() === edu.refId.toString()
        );

        if (updateData) {
          if (updateData.type === "Course") {
            edu.grade = updateData.grade || edu.grade;
            edu.locked = updateData.locked || edu.locked;
            edu.comments = updateData.comments || edu.comments;
          }

          // Apply other potential changes from the request
          edu.status = updateData.status || edu.status;
          edu.addedBy = updateData.addedBy || edu.addedBy;
        }

        return edu;
      });

      updates.education = updatedEducation;
    }

    // Perform the update operation
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).populate(
      "education.refId",
      "courseName courseCode coursePackageName coursePackageCode programName"
    );

    if (!updatedStudent) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error("❌ Error updating student:", error);
    res.status(500).json({ error: "Failed to update student" });
  }
});

/**
 * @route   POST /students/:id/mark-comments-seen
 * @desc    Marks all comments as seen by the current user.
 * @access  Protected
 */
router.post(
  "/students/:id/mark-comments-seen",
  authenticateUser,
  async (req, res) => {
    try {
      const student = await Student.findById(req.params.id);
      if (!student) return res.status(404).json({ error: "Student not found" });

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

/**
 * @route   PATCH /student/:studentId/education/:educationId/grade
 * @desc    Updates a course grade in a student's education array.
 * @access  Public
 */
router.patch(
  "/student/:studentId/education/:educationId/grade",
  async (req, res) => {
    const { studentId, educationId } = req.params;
    const { grade } = req.body;

    if (!["A", "B", "C", "D", "E", "F"].includes(grade)) {
      return res.status(400).json({ error: "Invalid grade." });
    }

    try {
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      // Find the education entry to update based on educationId
      const education = student.education.find(
        (edu) => edu._id.toString() === educationId
      );

      if (!education) {
        return res.status(404).json({ error: "Education entry not found" });
      }

      // Only update the grade if the type is "Course"
      if (education.type === "Course") {
        education.grade = grade;
      }

      await student.save();

      // Fetch the updated student and populate education data
      const updatedStudent = await Student.findById(studentId).populate(
        "education.refId",
        "courseName courseCode coursePackageName coursePackageCode programName"
      );

      res.status(200).json(updatedStudent);
    } catch (error) {
      console.error("❌ Error updating grade:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * @route   GET /all-programs
 * @desc    Fetches all available programs.
 * @access  Public
 */
router.get("/all-programs", async (req, res) => {
  const programs = await Program.find().select("programName");
  res.json(programs);
});
/**
 * @route   GET /all-course-packages
 * @desc    Fetches all available course packages.
 * @access  Public
 */
router.get("/all-course-packages", async (req, res) => {
  const packages = await CoursePackage.find().select("coursePackageName");
  res.json(packages);
});
/**
 * @route   GET /all-courses
 * @desc    Fetches all available courses.
 * @access  Public
 */
router.get("/all-courses", async (req, res) => {
  const courses = await Course.find().select("courseName courseCode");
  res.json(courses);
});

/**
 * @route   PUT /student/:id/education/:courseId/grade
 * @desc    Updates the grade of a course in the student's education array.
 * @access  Public
 */
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

/**
 * @route   GET /students/earnings
 * @desc    Returns students with non-null education grades (for analytics).
 * @access  Public
 */
router.get("/students/earnings", async (req, res) => {
  try {
    const students = await Student.find(
      { "education.grade": { $ne: null } }, // only students with grades
      {
        municipality: 1,
        education: 1,
      }
    );
    res.json(students);
  } catch (err) {
    console.error("❌ Failed to fetch earnings students", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
