import { Router } from "express";
const router = Router();
import Student from "../models/Student.js";
import { authenticateUser } from "../controllers/authController.js";

router.get("/students-to-grade/", authenticateUser, async (req, res) => {
  const user = req.user;

  const isAdmin = ["admin", "systemadmin"].includes(user.role);
  const isTeacher = user.role === "teacher";

  let query = {
    endDate: { $lte: new Date() },
    courses: {
      $elemMatch: {
        $or: [
          { "grades.grade": null },
          { "grades.grade": { $exists: false } }
        ]
      }
    }
  };

  if (isTeacher) {
    query.teacher = user._id;
  }

  const students = await Student.find(query).populate("courses.courseId");

  console.log("📦 Elever att betygsätta:", students.length);
  res.json(students);
});
  

router.post("/teacher/save-grade/", authenticateUser, async (req, res) => {
    const { studentId, courseId, grade, reason, comments, npScore } = req.body;
  
    const student = await Student.findById(studentId);
    const course = student.courses.find(c => c.courseId.toString() === courseId);
  
    if (!course) return res.status(404).send("Kurs ej funnen");
  
    course.grades = { grade, reason, comments, npScore, locked: false };
    await student.save();
  
    res.send("Betyg sparat");
  });

router.post("/teacher/lock-grade/", authenticateUser, async (req, res) => {
    const { studentId, courseId } = req.body;
     
    const student = await Student.findById(studentId);
    const course = student.courses.find(c => c.courseId.toString() === courseId);
  
    if (!course || !course.grades?.grade || !course.grades?.reason)
      return res.status(400).send("Betyg ej komplett");
  
    course.grades.locked = true;
    await student.save();
  
    // TODO: Skicka avisering till admin
    res.send("Betyg låst!");
  });
  

export default router;
