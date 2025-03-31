import { Router } from "express";
const router = Router();
import Student from "../models/Student.js";
import { authenticateUser } from "../controllers/authController.js";

router.get("/students-to-grade/", authenticateUser, async (req, res) => {
    const user = req.user;
    const today = new Date();
  
    const isAdmin = ["admin", "systemadmin"].includes(user.role);
    const isTeacher = user.role === "teacher";
  
    let query = {
        courses: {
            $elemMatch: {
              endDate: { $lte: new Date() },
              $or: [
                { "grades.grade": null },
                { "grades.grade": { $exists: false } },
                { grades: { $exists: false } }
              ]
            }
          }
          
    };
  
    if (isTeacher) {
      query.teacher = user._id;
    }
  
    console.log("🔍 Query som skickas till DB:", JSON.stringify(query, null, 2));
  
    const students = await Student.find(query).populate("courses.courseId teacher");
  
    console.log("✅ Elever funna:", students.length);
    res.json(students);
  });
  
  
  

  // POST /api/teacher/save-grade
router.post("/teacher/save-grade/", authenticateUser, async (req, res) => {
    const { studentId, courseId, grade, reason, comments, npScore } = req.body;
  
    const student = await Student.findById(studentId);
    const course = student.courses.find(c => c.courseId.toString() === courseId);
  
    if (!course) return res.status(404).send("Kurs ej funnen");
  
    course.grades = { grade, reason, comments, npScore, locked: false };
    await student.save();
  
    res.send("Betyg sparat");
  });

  // POST /api/teacher/lock-grade
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
