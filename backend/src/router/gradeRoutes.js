import { Router } from "express";
const router = Router();
import Student from "../models/Student.js";
import { authenticateUser } from "../controllers/authController.js";
import Notification from "../models/Notification.js";
import Course from "../models/Course.js";
import Program from "../models/Program.js";
import CoursePackage from "../models/CoursePackage.js";


export async function createFailingStudentNotification(studentId, courseId) {
  const existing = await Notification.findOne({
    studentId,
    courseId,
    type: "action_plan_required",
    resolved: false,
  });

  if (!existing) {
    await Notification.create({
      studentId,
      courseId,
      type: "action_plan_required",
      message: "Handlingsplan krävs pga elever med F i betyg",
      resolved: false,
    });
  }
}


router.get("/students/ungraded", async (req, res) => {

  try {
    const students = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          $or: [
            { grade: null },
            { grade: "" },
            { locked: false },
            { grade: "F", locked: true}
          ]
        }
      }
    }).lean();

    const enrichedStudents = (await Promise.all(
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
                  resolved: false
                })

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
                    populated.scriveLink = "https://scrive.com/new/login?lang=sv"; // Anpassa efter behov
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
    )).filter((s) => s.ungradedEducation.length > 0);

    res.json(enrichedStudents);
  } catch (error) {
    console.error("❌ Fel vid hämtning av obetygsatta elever:", error);
    res.status(500).json({ message: "Serverfel vid hämtning av elever" });
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

router.post('/teacher/save-grade', authenticateUser, async (req, res) => {
  const { studentId, courseId, grade, reason, comments, npScore, type } = req.body;

  try {
    const result = await Student.updateOne(
      {
        _id: studentId,
        "education.refId": courseId
      },
      {
        $set: {
          "education.$.grade": grade,
          "education.$.reason": reason,
          "education.$.comments": comments,
          "education.$.npScore": npScore,
          "education.$.type": type
        }
      }
    );

    // 🔔 Skapa notis om betyg är F
    if (grade === 'F') {
      await createFailingStudentNotification(studentId, courseId);
    }

    res.send('✅ Betyg sparat!');
  } catch (err) {
    console.error('Error saving grade:', err);
    res.status(500).send('Server error');
  }
});


router.post("/teacher/lock-grade", authenticateUser, async (req, res) => {
  const { studentId, courseId } = req.body;
  console.log('Received studentId:', studentId, 'courseId:', courseId); // Logga mottagna värden

  try {
    // Hitta student
    const student = await Student.findById(studentId).lean();
    if (!student) {
      return res.status(404).send("Studenten hittades inte.");
    }

    // Hitta kursen i studentens utbildningar
    const courseIndex = student.education.findIndex(edu => edu.refId.toString() === courseId);
    if (courseIndex === -1) {
      return res.status(404).send("Kursen är inte kopplad till studenten.");
    }

    const education = student.education[courseIndex];

    // Kontrollera om betyg och anledning finns
    if (!education.grade) {
      return res.status(400).send("Betyg saknas.");
    }

   // Uppdatera locked till true
    const result = await Student.updateOne(
      { _id: studentId, "education.refId": courseId },
      { $set: { "education.$.locked": true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send("Det gick inte att låsa betyget.");
    }

    // 🔔 Skapa notis om betyget är F
    if (education.grade === 'F') {
      await createFailingStudentNotification(studentId, courseId);
    }

    res.send("Betyg har låsts!");

  } catch (err) {
    console.error("Fel vid låsning av betyg:", err);
    res.status(500).send("Internt serverfel.");
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
        "education.removedAt": null
      },
      {
        $set: {
          "education.$.locked": false
        }
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
