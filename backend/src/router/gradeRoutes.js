import { Router } from "express";
const router = Router();
import Student from "../models/Student.js";
import { authenticateUser } from "../controllers/authController.js";
import Notification from "../models/Notification.js";
import Course from "../models/Course.js";
import Program from "../models/Program.js";
import CoursePackage from "../models/CoursePackage.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";

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

router.get('/students-to-grade', authenticateUser, async (req, res) => {
  try {
    const now = new Date();

    // Find enrollments that have passed end date and are not graded
    const enrollments = await StudentEnrollment.find({
      endDate: { $lt: now },
      $or: [{ grade: null }, { grade: "" }],
      status: { $in: ["enrolled", "active", "completed"] }
    })
      .populate("studentId")
      .populate({
        path: "courseInstanceId",
        populate: { path: "mainCourseId", select: "courseName courseCode" }
      });

    // Format for frontend (from StudentEnrollment)
    const studentsFromEnrollments = enrollments.map(enrollment => ({
      student: enrollment.studentId,
      courseInstance: enrollment.courseInstanceId,
      endDate: enrollment.endDate,
      grade: enrollment.grade,
      enrollmentId: enrollment._id,
    }));

    // Also include students from Student.education entries (older data path)
    const studentsWithPastEducation = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          endDate: { $lt: now },
          $or: [{ grade: null }, { grade: "" }],
        },
      },
    }).lean();

    const studentsFromEducation = [];
    for (const s of studentsWithPastEducation) {
      for (const edu of (s.education || [])) {
        if (!edu || edu.removedAt) continue;
        if (!edu.endDate || edu.endDate >= now) continue;
        if (edu.grade && edu.grade !== "") continue;

        studentsFromEducation.push({
          student: { _id: s._id, name: s.name, email: s.email },
          courseInstance: null,
          endDate: edu.endDate,
          grade: edu.grade || null,
          enrollmentId: edu._id, // refers to education entry id
          courseRefId: edu.refId, // The actual course ID for saving grades
          courseName: edu.name || null, // Course name if available
          courseCode: null, // Will need to be populated from Course model if needed
          source: "student_education",
        });
      }
    }

    const studentsToGrade = [...studentsFromEnrollments, ...studentsFromEducation]
      .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

    res.json(studentsToGrade);
  } catch (err) {
    console.error('Error fetching students to grade:', err);
    res.status(500).send('Server error');
  }
});

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

// Delete an enrollment by ID
router.delete('/enrollments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const enrollment = await StudentEnrollment.findByIdAndDelete(id);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json({ success: true, message: 'Enrollment deleted' });
  } catch (err) {
    console.error('Error deleting enrollment:', err);
    res.status(500).json({ error: 'Failed to delete enrollment' });
  }
});

// ===== ADDITIONAL GRADING ROUTES =====

// Debug endpoint to check what students-to-grade endpoint returns
router.get('/debug/students-to-grade', authenticateUser, async (req, res) => {
  try {
    const now = new Date();

    // Find enrollments that have passed end date and are not graded
    const enrollments = await StudentEnrollment.find({
      endDate: { $lt: now },
      $or: [{ grade: null }, { grade: "" }],
      status: { $in: ["enrolled", "active", "completed"] }
    })
      .populate("studentId", "name email")
      .populate({
        path: "courseInstanceId",
        populate: { path: "mainCourseId", select: "courseName courseCode" }
      })
      .lean();

    // Also check Student.education entries
    const studentsWithPastEducation = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          endDate: { $lt: now },
          $or: [{ grade: null }, { grade: "" }],
        },
      },
    })
      .select("name email education")
      .lean();

    res.json({
      success: true,
      debug: {
        now: now.toISOString(),
        enrollments: {
          count: enrollments.length,
          data: enrollments.map(e => ({
            student: e.studentId?.name || "Unknown",
            studentId: e.studentId?._id,
            courseInstance: e.courseInstanceId?.courseCode || "N/A",
            courseName: e.courseInstanceId?.courseName || e.courseInstanceId?.mainCourseId?.courseName || "Unknown",
            endDate: e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : null,
            grade: e.grade,
            status: e.status,
            enrollmentId: e._id
          }))
        },
        studentEducation: {
          count: studentsWithPastEducation.length,
          data: studentsWithPastEducation.map(s => ({
            student: s.name,
            studentId: s._id,
            educationEntries: s.education?.filter(e => 
              !e.removedAt && 
              e.endDate && 
              new Date(e.endDate) < now && 
              (!e.grade || e.grade === "")
            ).map(e => ({
              endDate: e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : null,
              grade: e.grade,
              refId: e.refId,
              name: e.name,
              type: e.type
            }))
          }))
        }
      }
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to check what students exist
router.get('/debug/students-past-end-date', authenticateUser, async (req, res) => {
  try {
    const now = new Date();
    
    // Check StudentEnrollment
    const enrollments = await StudentEnrollment.find({
      endDate: { $lt: now },
      status: { $in: ["active", "completed", "enrolled"] }
    })
    .populate("studentId", "name email")
    .populate("mainCourseId", "courseName")
    .populate("teacherId", "userId")
    .populate("teacherId.userId", "username")
    .lean();

    // Check Student.education
    const students = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          endDate: { $lt: now }
        }
      }
    })
    .populate("teacherId", "userId")
    .populate("teacherId.userId", "username")
    .lean();

    res.json({
      success: true,
      debug: {
        now: now.toISOString(),
        enrollments: {
          total: enrollments.length,
          data: enrollments.map(e => ({
            id: e._id,
            student: e.studentId?.name,
            course: e.mainCourseId?.courseName,
            endDate: e.endDate,
            status: e.status,
            grade: e.grade,
            teacher: e.teacherId?.userId?.username
          }))
        },
        students: {
          total: students.length,
          data: students.map(s => ({
            id: s._id,
            name: s.name,
            teacher: s.teacherId?.userId?.username,
            education: s.education.filter(e => e.endDate && e.endDate < now).map(e => ({
              id: e._id,
              name: e.name,
              endDate: e.endDate,
              grade: e.grade,
              locked: e.locked
            }))
          }))
        }
      }
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get locked grades for admin review
router.get('/locked-grades', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    if (!["admin", "systemadmin"].includes(user.role)) {
      return res.status(403).json({ error: 'Only administrators can view locked grades' });
    }

    const lockedGrades = await StudentEnrollment.find({
      isGradeLocked: true,
    })
      .populate("studentId", "name email personalNumber")
      .populate("courseInstanceId", "courseName courseCode")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", "userId subject")
      .populate("teacherId.userId", "username email")
      .populate("gradeLockedBy", "username email")
      .sort({ gradeLockedAt: -1 });

    res.json({
      success: true,
      lockedGrades,
      total: lockedGrades.length,
    });
  } catch (error) {
    console.error('Error fetching locked grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grades for a specific student
router.get('/student/:studentId/grades', authenticateUser, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const grades = await StudentEnrollment.find({
      studentId,
      grade: { $ne: null },
    })
      .populate("courseInstanceId", "courseName courseCode startDate endDate")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", "userId subject")
      .populate("teacherId.userId", "username email")
      .populate("gradeBy", "username email")
      .sort({ gradeDate: -1 });

    res.json({
      success: true,
      grades,
      total: grades.length,
    });
  } catch (error) {
    console.error('Error fetching student grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grades for a specific course instance
router.get('/course-instance/:courseInstanceId/grades', authenticateUser, async (req, res) => {
  try {
    const { courseInstanceId } = req.params;
    
    const grades = await StudentEnrollment.find({
      courseInstanceId,
      grade: { $ne: null },
    })
      .populate("studentId", "name email personalNumber")
      .populate("courseInstanceId", "courseName courseCode startDate endDate")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", "userId subject")
      .populate("teacherId.userId", "username email")
      .populate("gradeBy", "username email")
      .sort({ gradeDate: -1 });

    res.json({
      success: true,
      grades,
      total: grades.length,
    });
  } catch (error) {
    console.error('Error fetching course instance grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update grade (if not locked)
router.put('/update-grade/:enrollmentId', authenticateUser, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { grade, motivation, comments, nationalTestPoints } = req.body;
    const userId = req.user?.userId;

    const enrollment = await StudentEnrollment.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.isGradeLocked) {
      return res.status(403).json({ error: 'Grade is locked and cannot be modified' });
    }

    // Update grade fields
    if (grade) enrollment.grade = grade;
    if (motivation) enrollment.motivation = motivation;
    if (comments !== undefined) enrollment.comments = comments;
    if (nationalTestPoints) enrollment.nationalTestPoints = nationalTestPoints;
    
    enrollment.gradeDate = new Date();
    enrollment.gradeBy = userId;

    await enrollment.save();

    res.json({
      success: true,
      message: 'Grade updated successfully',
      enrollment,
    });
  } catch (error) {
    console.error('Error updating grade:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
