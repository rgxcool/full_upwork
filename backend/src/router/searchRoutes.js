import express from "express";
import User from "../models/User.js";
import Course from "../models/Course.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

const router = express.Router();

router.get("/courses", async (req, res) => {
    try {
        const students = await Student.find({ "courses.courseId": { $exists: true } })
            .populate("courses.courseId", "name")
            .select("courses");

        const allCourseIds = [];

        for (const student of students) {
            for (const courseObj of student.courses) {
                if (courseObj.courseId?._id && courseObj.courseId?.name) {
                    allCourseIds.push({
                        _id: courseObj.courseId._id.toString(),
                        name: courseObj.courseId.name,
                    });
                }
            }
        }

        const uniqueCoursesMap = new Map();
        allCourseIds.forEach(course => {
            uniqueCoursesMap.set(course._id, course);
        });

        const uniqueCourses = Array.from(uniqueCoursesMap.values());
        res.json(uniqueCourses);
    } catch (error) {
        console.error("\u274C Error fetching courses from students:", error);
        res.status(500).json({ message: "Serverfel vid h\u00e4mtning av kurser" });
    }
});

router.get("/search", async (req, res) => {
    const { q, courseId, date } = req.query;
  
    try {
      let students = [];
      let users = [];
      let results = [];
  
      // 1. Kursfilter
      if (courseId) {
        students = await Student.find({ "courses.courseId": courseId }).lean();
      }
  
      // 2. Textfilter
      if (q) {
        users = await User.find({
          $or: [
            { username: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        }).select("_id username email role");
  
        const matchingStudents = await Student.find({
          name: { $regex: q, $options: "i" },
        }).select("_id name email");
  
        students = students.length ? students : matchingStudents;
      }
  
      // 3. Datumfilter (start/slutdatum exakt match)
      if (date) {
        const parsed = new Date(date);
        const dateMatches = await Student.find({
          $or: [
            { startDate: parsed },
            { endDate: parsed }
          ]
        }).select("_id name email startDate endDate");
  
        students = students.length ? students.filter(s =>
          dateMatches.some(m => m._id.toString() === s._id.toString())
        ) : dateMatches;
      }
  
      // 4. Om inga filter → returnera tom lista
      if (!q && !courseId && !date) return res.json([]);
  
      // 5. Hämta lärare
      const allTeachers = await User.find({ role: "teacher" }).select("username email");
  
      // 6. Bygg resultatlista
      results = [
        ...students.map(student => {
          const teacher = allTeachers.find(t => t.username === student.teacher);
          return {
            id: student._id,
            name: student.name,
            type: "Elev",
            extra: teacher ? `Lärare: ${teacher.username}` : "",
          };
        }),
        ...users.map(user => {
          const type = user.role === "teacher" ? "Lärare" : "Personal";
          return {
            id: user._id,
            name: user.username,
            type,
            extra: user.email,
          };
        }),
      ];
  
      return res.json(results);
    } catch (error) {
      console.error("❌ Search error:", error);
      res.status(500).json({ message: "Serverfel vid sökning." });
    }
  });
  


router.get("/details/:type/:id", async (req, res) => {
    const { type, id } = req.params;

    try {
        let result;

        switch (type) {
            case "Elev":
                result = await Student.findById(id)
                    .populate("program")
                    .populate("teacher", "name email")
                    .select("-__v"); // Exkludera metadata
                break;
            case "Lärare":
                result = await User.findById(id)
                    .select("username email role")
                    .where("role").equals("teacher"); // Säkerställer att endast lärare hämtas
                break;
            case "Personal":
                result = await User.findById(id)
                    .select("username email role")
                    .where("role").in(["admin", "systemadmin", "syv", "specped", "coordinator"]); // Hämtar personal
                break;
            default:
                return res.status(400).json({ message: "Ogiltig typ av objekt" });
        }

        if (!result) {
            return res.status(404).json({ message: "Objektet hittades inte" });
        }

        res.json(result);
    } catch (error) {
        console.error("❌ Fetch details error:", error);
        res.status(500).json({ message: "Serverfel vid hämtning av detaljer" });
    }
});



router.put("/update-student/:id", async (req, res) => {
    try {
        const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedStudent);
    } catch (error) {
        console.error("❌ Error updating student:", error);
        res.status(500).json({ message: "Kunde inte uppdatera studenten" });
    }
});

router.put("/update-user/:id", async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedUser);
    } catch (error) {
        console.error("❌ Error updating user:", error);
        res.status(500).json({ message: "Kunde inte uppdatera användaren" });
    }
});


export default router;
