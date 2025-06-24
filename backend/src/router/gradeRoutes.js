import { Router } from "express";
const router = Router();
import Student from "../models/Student.js";
import { authenticateUser } from "../controllers/authController.js";
import Notification from "../models/Notification.js";
import Course from "../models/Course.js";
import Program from "../models/Program.js";
import CoursePackage from "../models/CoursePackage.js";

import {
  createNotification,
  resolveNotification,
  evaluateGradingStatusAndNotify,
  evaluateActionPlanStatusAndNotify,
  checkPendingGradesAndNotify,
} from "../controllers/notificationController.js";

router.get("/students/ungraded", async (req, res) => {
  try {
    await evaluateGradingStatusAndNotify();

    const students = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          $or: [
            { grade: null },
            { grade: "" },
            { locked: false },
            { grade: "F", locked: true },
          ],
        },
      },
    }).lean();

    const enrichedStudents = (
      await Promise.all(
        students.map(async (student) => {
          const relevantEducation = await Promise.all(
            student.education
              .filter(async (edu) => {
                if (edu.removedAt) return false;

                const isUngraded = !edu.grade || edu.grade === "";
                const isFAndLocked = edu.grade === "F" && edu.locked;

                if (isFAndLocked) {
                  const pendingPlan = await Notification.findOne({
                    studentId: student._id,
                    courseId: edu.redId,
                    type: "action_plan_required",
                    resolved: false,
                  });

                  return !!pendingPlan;
                }

                return isUngraded;
              })
              .map(async (edu) => {
                let populated = { ...edu };

                try {
                  if (edu.type === "Course") {
                    const course = await Course.findById(edu.refId).lean();
                    if (course) {
                      populated.details = course;
                      populated.displayName = course.courseName;
                      populated.scriveLink =
                        "https://scrive.com/new/login?lang=sv"; // Anpassa efter behov
                    }
                  } else if (edu.type === "Program") {
                    const program = await Program.findById(edu.refId).lean();
                    if (program) {
                      populated.details = program;
                      populated.displayName = program.programName;
                    }
                  } else if (edu.type === "CoursePackage") {
                    const cp = await CoursePackage.findById(edu.refId).lean();
                    if (cp) {
                      populated.details = cp;
                      populated.displayName = cp.coursePackageName;
                    }
                  }
                } catch (err) {
                  console.error("Fel vid hämtning av utbildningsdata:", err);
                }

                populated.isGraded = !!populated.grade;

                populated.requireActionPlan = edu.grade === "F" && edu.locked;

                return populated;
              })
          );

          return {
            studentId: student._id,
            name: student.name,
            personalNumber: student.personalNumber,
            email: student.email,
            ungradedEducation: relevantEducation,
          };
        })
      )
    ).filter((s) => s.ungradedEducation.length > 0);

    res.json(enrichedStudents);
  } catch (error) {
    console.error("❌ Fel vid hämtning av obetygsatta elever:", error);
    res.status(500).json({ message: "Serverfel vid hämtning av elever" });
  }
});

router.put("/admin/unlock-grade", authenticateUser, async (req, res) => {
  // Anta att req.user finns
  const user = req.user;
  if (!(user.role === "admin" || user.role === "systemadmin")) {
    return res
      .status(403)
      .json({ error: "Endast admin/systemadmin kan låsa upp." });
  }
  const { studentId, courseId } = req.body;

  try {
    const result = await Student.updateOne(
      {
        _id: studentId,
        "education.refId": courseId,
        "education.type": "Course",
        "education.removedAt": null,
      },
      {
        $set: {
          "education.$.locked": false,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("Kurs hittades inte");
    }

    // (Skicka adminnotis om du vill!)
    await Notification.create({
      type: "grade_unlocked",
      message: `Admin ${user.name || user.username} låste upp en betygsrad.`,
      meta: { studentId, courseId },
      resolved: false,
    });

    res.send("Betyg upplåst");
  } catch (err) {
    console.error("Upplåsning misslyckades:", err);
    res.status(500).send("Internt serverfel");
  }
});

/*
router.get('/students-to-grade', authenticateUser, async (req, res) => {
  const user = req.user;
  const isTeacher = user.role === 'teacher';

  try {
    const students = await Student.find({
      'education.grade': { $in: [null, ''] },
      'education.locked': { $ne: true },
      ...(isTeacher ? { teacher: user._id } : {}),
    }).populate('education.refId');
    

    // Omvandla education till en enklare struktur för frontend
    const studentsToGrade = students.map(student => ({
      _id: student._id,
      name: student.name,
      coursesToGrade: student.education
        .filter(course => course.type === 'Course' && !course.removedAt)
        .map(course => ({
          refId: course.refId._id,
          courseCode: course.refId.courseCode,
          courseName: course.refId.courseName,
          type: course.type,
          grade: course.grade,
          reason: course.reason,
          comments: course.comments,
          locked: course.locked,
        })),
    }));

    res.json(studentsToGrade);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).send('Server error');
  }
});
*/

router.post("/teacher/save-grade", authenticateUser, async (req, res) => {
  const { studentId, courseId, grade, reason, comments, npScore, type } =
    req.body;

  try {
    const result = await Student.updateOne(
      {
        _id: studentId,
        "education.refId": courseId,
      },
      {
        $set: {
          "education.$.grade": grade,
          "education.$.reason": reason,
          "education.$.comments": comments,
          "education.$.npScore": npScore,
          "education.$.type": type,
        },
      }
    );

    if (grade === "F") {
      await createNotification({
        studentId,
        courseId,
        type: "action_plan_required",
        message: "Handlingsplan krävs pga elever med F i betyg",
      });
    } else {
      await resolveNotification({
        studentId,
        courseId,
        type: "action_plan_required",
      });
    }

    // 🔁 Kontrollera global notisstatus
    await evaluateGradingStatusAndNotify();
    await evaluateActionPlanStatusAndNotify();

    res.send("✅ Betyg sparat!");
  } catch (err) {
    console.error("Error saving grade:", err);
    res.status(500).send("Server error");
  }
});

router.post("/teacher/lock-grade", async (req, res) => {
  const { studentId, courseId } = req.body;

  try {
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Find the course in the education array and lock it
    const educationEntry = student.education.find(
      (edu) => edu.refId.toString() === courseId
    );

    if (educationEntry) {
      educationEntry.locked = true; // Lock the grade for the specific course
      await student.save(); // Persist the change to the database

      return res.status(200).json({ message: "Grade locked", student });
    }

    return res
      .status(404)
      .json({ error: "Course not found in student's education" });
  } catch (error) {
    console.error("❌ Error locking grade:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/unlock-grade", authenticateUser, async (req, res) => {
  const { studentId, courseId } = req.body;

  try {
    const result = await Student.updateOne(
      {
        _id: studentId,
        "education.refId": courseId,
        "education.type": "Course",
        "education.removedAt": null,
      },
      {
        $set: {
          "education.$.locked": false,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("Kurs hittades inte");
    }

    res.send("Betyg upplåst");
  } catch (err) {
    console.error("Upplåsning misslyckades:", err);
    res.status(500).send("Internt serverfel");
  }
});

export default router;
