import express from "express";
import User from "../models/User.js";
import Course from "../models/Course.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

const router = express.Router();

router.get("/courses", async (req, res) => {
  try {
    const students = await Student.find({
      "education.type": "Course",
      "education.refId": { $exists: true },
    })
      .populate("education.refId", "courseName")
      .select("education");

    const allCourseRefs = [];

    for (const student of students) {
      for (const edu of student.education) {
        if (edu.type === "Course" && edu.refId?._id && edu.refId?.courseName) {
          allCourseRefs.push({
            _id: edu.refId._id.toString(),
            name: edu.refId.courseName,
          });
        }
      }
    }

    // Deduplicate
    const uniqueCoursesMap = new Map();
    allCourseRefs.forEach((course) => {
      uniqueCoursesMap.set(course._id, course);
    });

    const uniqueCourses = Array.from(uniqueCoursesMap.values());
    res.json(uniqueCourses);
  } catch (error) {
    console.error("❌ Error fetching courses from education[]:", error);
    res.status(500).json({ message: "Serverfel vid hämtning av kurser" });
  }
});

router.get("/search", async (req, res) => {
  const { q, date } = req.query;

  try {
    let results = [];

    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format." });
      }
      const studentsByDate = await Student.find({
        $or: [{ startDate: parsedDate }, { endDate: parsedDate }],
      }).select("_id name email");
      results.push(
        ...studentsByDate.map((student) => ({
          id: student._id,
          name: student.name,
          type: "Elev",
          extra: `Email: ${student.email}`,
        }))
      );
    }

    if (q && q.length >= 3) {
      const studentMatches = await Student.find({
        name: { $regex: q, $options: "i" }, // Added case-insensitivity
      }).select("_id name email");

      results.push(
        ...studentMatches.map((student) => ({
          id: student._id,
          name: student.name,
          type: "Elev",
          extra: `Email: ${student.email}`,
        }))
      );
    }

    res.json(results);
  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({ message: "Server error during search." });
  }
});

router.get("/details/:type/:id", async (req, res) => {
  const { type, id } = req.params;

  try {
    let result;

    switch (type) {
      case "Elev":
        result = await Student.findById(id)
          .populate({
            path: "education.refId",
            select:
              "programName coursePackageName courseName courseCode coursePoints courseExtent",
            // 👇 No need for `model` if you use refPath in schema
          })
          .populate("teacher", "name email")
          .select("-__v");
        break;

      case "Lärare":
        result = await User.findOne({
          _id: id,
          role: "teacher",
        }).select("username email role");
        break;

      case "Personal":
        result = await User.findOne({
          _id: id,
          role: {
            $in: ["admin", "systemadmin", "syv", "specped", "coordinator"],
          },
        }).select("username email role");
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
    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedStudent);
  } catch (error) {
    console.error("❌ Error updating student:", error);
    res.status(500).json({ message: "Kunde inte uppdatera studenten" });
  }
});

router.put("/update-user/:id", async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json(updatedUser);
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({ message: "Kunde inte uppdatera användaren" });
  }
});

export default router;
