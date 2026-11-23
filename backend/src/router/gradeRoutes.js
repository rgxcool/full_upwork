import { Router } from "express";
const router = Router();
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import Student from "../models/Student.js";
import { authenticateUser } from "../controllers/authController.js";
import Notification from "../models/Notification.js";
import AuditLog from "../models/AuditLog.js";
import Course from "../models/Course.js";
import Program from "../models/Program.js";
import CoursePackage from "../models/CoursePackage.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import User from "../models/User.js";
import ExamAttendance from "../models/ExamAttendance.js";
import GradingScale from "../models/GradingScale.js";
import {
    gradeFromScale,
    validateScalePayload,
} from "../utils/gradingScale.js";
import { recordAudit } from "../utils/auditLog.js";

import {
  createNotification,
  resolveNotification,
  evaluateGradingStatusAndNotify,
  evaluateActionPlanStatusAndNotify,
} from "../controllers/notificationController.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";
import { TEACHER_POPULATE_FIELDS, findTeacherUser } from "../utils/teacherProfile.js";

const ALLOWED_STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped", "tester"];
const ALLOWED_ADMIN_ROLES = ["systemadmin", "admin"];
const ALLOWED_GRADING_ROLES = ["systemadmin", "admin", "teacher"];

export async function verifyTeacherAuthorizedForEnrollment(userId, enrollment) {
  if (!enrollment || !userId) return false;
  // Teacher references hold the teacher's User id (#102).
  const teacherIdStr = String(userId);

  const ci = enrollment.courseInstanceId;
  const stu = enrollment.studentId;

  let hasExplicitAssignments = false;

  if (enrollment.teacherId) {
    hasExplicitAssignments = true;
    const enrollTeacherId = enrollment.teacherId._id?.toString() || enrollment.teacherId.toString();
    if (enrollTeacherId === teacherIdStr) return true;
  }

  if (ci) {
    const respTeacherId = ci.responsibleTeacher?._id?.toString() || ci.responsibleTeacher?.toString();
    const asstTeacherId = ci.assistantTeacher?._id?.toString() || ci.assistantTeacher?.toString();
    if (respTeacherId) {
      hasExplicitAssignments = true;
      if (respTeacherId === teacherIdStr) return true;
    }
    if (asstTeacherId) {
      hasExplicitAssignments = true;
      if (asstTeacherId === teacherIdStr) return true;
    }

    if (!respTeacherId && typeof CourseInstance?.findById === "function") {
      try {
        const query = CourseInstance.findById(ci._id || ci);
        const instanceDoc = query && typeof query.lean === "function" ? await query.lean().catch(() => null) : await Promise.resolve(query).catch(() => null);
        if (instanceDoc) {
          if (instanceDoc.responsibleTeacher) {
            hasExplicitAssignments = true;
            if (instanceDoc.responsibleTeacher.toString() === teacherIdStr) return true;
          }
          if (instanceDoc.assistantTeacher) {
            hasExplicitAssignments = true;
            if (instanceDoc.assistantTeacher.toString() === teacherIdStr) return true;
          }
        }
      } catch (err) {
        // ignore
      }
    }
  }

  if (stu) {
    const stuTeacherId = stu.teacherId?._id?.toString() || stu.teacherId?.toString();
    if (stuTeacherId) {
      hasExplicitAssignments = true;
      if (stuTeacherId === teacherIdStr) return true;
    }
    if (stu.examHistory?.length) {
      hasExplicitAssignments = true;
      if (stu.examHistory.some((e) => e.teacherId?.toString() === teacherIdStr)) return true;
    }

    if (!stuTeacherId && typeof Student?.findById === "function") {
      try {
        const query = Student.findById(stu._id || stu);
        const stuDoc = query && typeof query.lean === "function" ? await query.lean().catch(() => null) : await Promise.resolve(query).catch(() => null);
        if (stuDoc) {
          if (stuDoc.teacherId) {
            hasExplicitAssignments = true;
            if (stuDoc.teacherId.toString() === teacherIdStr) return true;
          }
          if (stuDoc.examHistory?.length) {
            hasExplicitAssignments = true;
            if (stuDoc.examHistory.some((e) => e.teacherId?.toString() === teacherIdStr)) return true;
          }
        }
      } catch (err) {
        // ignore
      }
    }
  }

  if (mongoose.connection?.readyState === 1 && (typeof ExamAttendance?.exists === "function" || typeof ExamAttendance?.findOne === "function")) {
    try {
      const studentId = stu?._id || stu;
      if (studentId) {
        const hasExam = await (ExamAttendance.exists
          ? ExamAttendance.exists({ studentId, teacherId: teacher._id }).catch(() => false)
          : ExamAttendance.findOne({ studentId, teacherId: teacher._id }).catch(() => null));
        if (hasExam) return true;
      }
    } catch (err) {
      // ignore
    }
  }

  if (hasExplicitAssignments) {
    return false;
  }
  return true;
}


/**
 * The enrollment a grade belongs to (#103: enrollments are the only source).
 * `courseId` may be the main course id or the course instance id; the newest
 * non-dropped enrollment wins. Null when the student has no such enrollment.
 */
async function findGradeEnrollment(studentId, courseId) {
  if (!mongoose.isValidObjectId(studentId) || !mongoose.isValidObjectId(courseId)) return null;
  const query = StudentEnrollment.findOne({
    studentId,
    $or: [{ mainCourseId: courseId }, { courseInstanceId: courseId }],
    status: { $ne: "dropped" },
  });
  return query && typeof query.sort === "function" ? query.sort({ startDate: -1 }) : query;
}

router.put("/admin/unlock-grade", authenticateUser, async (req, res) => {
  const user = req.user;
  if (!(user.role === "admin" || user.role === "systemadmin")) {
    return res
      .status(403)
      .json({ error: "Endast admin/systemadmin kan låsa upp." });
  }
  const { studentId, courseId, enrollmentId } = req.body;

  try {
    let studentName = "Elev";
    let courseName = "Kurs";
    let found = false;

    if (enrollmentId) {
      const enrollment = await StudentEnrollment.findById(enrollmentId)
        .populate("studentId", "name")
        .populate("courseInstanceId", "courseName");
      if (enrollment) {
        found = true;
        enrollment.isGradeLocked = false;
        enrollment.gradeLockedBy = null;
        enrollment.gradeLockedAt = null;
        await enrollment.save();
        if (enrollment.studentId) studentName = enrollment.studentId.name || studentName;
        if (enrollment.courseInstanceId) courseName = enrollment.courseInstanceId.courseName || courseName;
      }
    }

    if (studentId && courseId && !enrollmentId) {
      const enrollment = await findGradeEnrollment(studentId, courseId);
      if (enrollment) {
        found = true;
        enrollment.isGradeLocked = false;
        enrollment.gradeLockedBy = null;
        enrollment.gradeLockedAt = null;
        await enrollment.save();
      }
    }

    if (!found && !enrollmentId) {
      return res.status(404).send("Kurs hittades inte");
    }

    await Notification.create({
      type: NOTIFICATION_TYPES.GRADE_UNLOCKED,
      message: `Admin ${user.name || user.username || 'Admin'} låste upp betyget för ${studentName} (${courseName}).`,
      meta: { studentId, courseId, enrollmentId },
      resolved: false,
    });

    await AuditLog.create({
      entityType: "StudentEnrollment",
      entityId: enrollmentId || courseId,
      action: "grade_unlock",
      description: `Betyg upplåst för ${studentName} (${courseName})`,
      performedBy: {
        userId: user.userId,
        role: user.role,
        email: user.email,
      },
    });

    res.send("Betyg upplåst");
  } catch (err) {
    logger.error({ err }, "Upplåsning misslyckades");
    res.status(500).send("Internt serverfel");
  }
});

router.get('/students-to-grade', authenticateUser, async (req, res) => {
  if (!ALLOWED_GRADING_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const now = new Date();
    const user = req.user;
    const isAdmin = user.role === 'admin' || user.role === 'systemadmin';
    
    let teacherId = null;
    let teacherFilter = null;

    // If user is a teacher, get their Teacher record and set up filtering
    if (!isAdmin && user.role === 'teacher') {
      const teacher = await findTeacherUser(user.userId, { select: "_id", lean: true });
      if (!teacher) {
        return res.status(403).json({ error: 'Teacher profile not found' });
      }
      teacherId = teacher._id;
      teacherFilter = teacherId;
    }

    // Find enrollments: optionally include all/graded enrollments or filter by courseInstanceId
    const includeGraded = req.query.includeGraded === "true" || req.query.all === "true";
    let enrollmentQuery = {
      status: { $in: ["enrolled", "active", "completed"] }
    };
    if (!includeGraded) {
      enrollmentQuery.endDate = { $lt: now };
      enrollmentQuery.$or = [{ grade: null }, { grade: "" }];
    }
    if (req.query.courseInstanceId) {
      enrollmentQuery.courseInstanceId = req.query.courseInstanceId;
    }

    // If teacher, we'll filter after populating to check relationships
    const enrollments = await StudentEnrollment.find(enrollmentQuery)
      .populate({
        path: "studentId",
        populate: { path: "teacherId", select: TEACHER_POPULATE_FIELDS }
      })
      .populate({
        path: "courseInstanceId",
        populate: [
          { path: "mainCourseId", select: "courseName courseCode resultTypes" },
          { path: "responsibleTeacher", select: TEACHER_POPULATE_FIELDS }
        ]
      })
      .populate({ path: "gradeBy", select: "username email" })
      .lean();

    // Filter enrollments based on teacher access if not admin
    let filteredEnrollments = enrollments;
    if (!isAdmin && teacherFilter) {
      filteredEnrollments = [];
      
      // Get all student IDs and course IDs for batch exam checking
      const studentIds = new Set();
      const courseIds = new Set();
      const enrollmentChecks = [];
      
      for (const enrollment of enrollments) {
        const student = enrollment.studentId;
        const courseInstance = enrollment.courseInstanceId;
        
        // Check if teacher is responsible for student
        const studentTeacherId = student?.teacherId?._id?.toString() || student?.teacherId?.toString();
        const isResponsibleTeacher = studentTeacherId === teacherFilter.toString();
        
        // Check if teacher is responsible for course instance
        const courseInstanceTeacherId = courseInstance?.responsibleTeacher?._id?.toString() || 
                                       courseInstance?.responsibleTeacher?.toString();
        const isCourseInstanceTeacher = courseInstanceTeacherId === teacherFilter.toString();
        
        if (isResponsibleTeacher) {
          // Teacher is responsible for the student - include this enrollment
          filteredEnrollments.push(enrollment);
        } else if (isCourseInstanceTeacher) {
          // Teacher is responsible for the course instance - include ALL students in this course instance
          // No need to check for exams - if teacher is responsible for course instance, they should see all students
          filteredEnrollments.push(enrollment);
        } else {
          // Teacher is not directly responsible, but might have given exams to this student
          // Check if student has done exams with this teacher
          const courseId = courseInstance?.mainCourseId?._id || courseInstance?.mainCourseId;
          if (courseId && student?._id) {
            studentIds.add(student._id.toString());
            courseIds.add(courseId.toString());
            enrollmentChecks.push({ enrollment, studentId: student._id.toString(), courseId: courseId.toString() });
          }
        }
      }
      
      // Batch check for exams if needed
      if (enrollmentChecks.length > 0) {
        const examAttendances = await ExamAttendance.find({
          studentId: { $in: Array.from(studentIds).map(id => new mongoose.Types.ObjectId(id)) },
          courseId: { $in: Array.from(courseIds).map(id => new mongoose.Types.ObjectId(id)) },
          teacherId: teacherFilter
        }).lean();
        
        // Create a set of student-course combinations that have exams
        const examSet = new Set();
        examAttendances.forEach(exam => {
          examSet.add(`${exam.studentId.toString()}-${exam.courseId?.toString()}`);
        });
        
        // Also check student examHistory in batch
        const studentsWithHistory = await Student.find({
          _id: { $in: Array.from(studentIds).map(id => new mongoose.Types.ObjectId(id)) }
        }).select('_id examHistory').lean();
        
        studentsWithHistory.forEach(student => {
          if (student.examHistory) {
            student.examHistory.forEach(exam => {
              if (exam.teacherId?.toString() === teacherFilter.toString() && exam.courseId) {
                examSet.add(`${student._id.toString()}-${exam.courseId.toString()}`);
              }
            });
          }
        });
        
        // Filter enrollments based on exam checks
        enrollmentChecks.forEach(({ enrollment, studentId, courseId }) => {
          if (examSet.has(`${studentId}-${courseId}`)) {
            filteredEnrollments.push(enrollment);
          }
        });
      }
    }

    // Format for frontend (from StudentEnrollment)
    const studentsFromEnrollments = filteredEnrollments.map(enrollment => {
      let rawAssessment = {};
      if (enrollment.assessmentResults) {
        if (enrollment.assessmentResults instanceof Map) {
          rawAssessment = Object.fromEntries(enrollment.assessmentResults);
        } else if (typeof enrollment.assessmentResults === "object") {
          rawAssessment = { ...enrollment.assessmentResults };
        }
      }
      return {
        student: enrollment.studentId,
        courseInstance: enrollment.courseInstanceId,
        endDate: enrollment.endDate,
        grade: enrollment.grade || null,
        reason: enrollment.motivation || '', // Map motivation to reason for frontend
        comments: enrollment.comments || '',
        locked: enrollment.isGradeLocked || false,
        npScore: enrollment.nationalTestPoints ?? null,
        assessmentResults: rawAssessment,
        gradeDate: enrollment.gradeDate || null,
        gradeBy: enrollment.gradeBy || null,
        enrollmentId: enrollment._id.toString(),
        source: 'enrollment',
        startDate: enrollment.startDate || null,
        status: enrollment.status || null,
        courseInstanceMeta: enrollment.courseInstanceId
          ? {
              isActive: enrollment.courseInstanceId.isActive ?? true,
              instanceStartDate: enrollment.courseInstanceId.startDate || null,
              instanceEndDate: enrollment.courseInstanceId.endDate || null,
            }
          : null,
      };
    });

    const studentsToGrade = [...studentsFromEnrollments]
      .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

    res.json(studentsToGrade);
  } catch (err) {
    logger.error({ err }, "Error fetching students to grade");
    res.status(500).send('Server error');
  }
});

router.post("/teacher/save-grade", authenticateUser, async (req, res) => {
  if (!ALLOWED_GRADING_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { studentId, courseId, grade, reason, comments, npScore } =
    req.body;

  if (grade && (!reason || reason.trim() === "")) {
    return res.status(400).json({ error: "Motivering krävs för betyg" });
  }

  if (!studentId || !courseId) {
    return res.status(400).json({ error: "studentId och courseId krävs" });
  }

  try {
    // The grade's source of truth is the StudentEnrollment (#103: the only one).
    const enrollment = await findGradeEnrollment(studentId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Ingen kurs att betygsätta hittades för eleven" });
    }

    if (enrollment.isGradeLocked) {
      return res.status(403).json({ error: "Grade is locked and cannot be modified" });
    }
    if (req.user?.role === "teacher") {
      const authorized = await verifyTeacherAuthorizedForEnrollment(req.user.userId, enrollment);
      if (!authorized) {
        return res.status(403).json({ error: "Du är inte behörig att betygsätta denna kurs/elev." });
      }
    }
    if (grade !== undefined) enrollment.grade = grade;
    if (reason !== undefined) enrollment.motivation = reason;
    if (comments !== undefined) enrollment.comments = comments;
    if (npScore !== undefined) {
      enrollment.nationalTestPoints = npScore === null || npScore === "" ? null : Number(npScore);
    }
    enrollment.gradeDate = new Date();
    enrollment.gradeBy = req.user?.userId;
    await enrollment.save();

    await recordAudit(req, {
      entityType: "StudentEnrollment",
      entityId: enrollment?._id || studentId || courseId,
      action: "grade_upsert",
      description: `Betyg ${grade || "N/A"} sparat för student ${studentId} i kurs ${courseId}`,
    });

    let studentRecord = null;
    let teacherRecord = null;
    if (studentId && Student.findById) {
      try {
        const query = Student.findById(studentId);
        studentRecord = query && typeof query.lean === "function" ? await query.lean() : await query;
        if (studentRecord?.teacherId) {
          teacherRecord = await User.findById(studentRecord.teacherId).select("_id").lean().catch(() => null);
        }
      } catch (findErr) {
        studentRecord = null;
      }
    }
    if (!teacherRecord && req.user?.userId) {
      teacherRecord = await findTeacherUser(req.user.userId, { select: "_id", lean: true }).catch(() => null);
    }

    // Match update-grade: notifications are keyed on the course instance.
    const notificationCourseId = enrollment?.courseInstanceId?.toString?.() || enrollment?.courseInstanceId || courseId;
    if (grade === "F") {
      const studentName = studentRecord?.name || "Elev";
      await createNotification({
        studentId,
        courseId: notificationCourseId,
        type: "action_plan_required",
        message: `Handlingsplan krävs: ${studentName} har fått F i betyg`,
        teacher: teacherRecord?._id || undefined,
        meta: {
          studentId,
          courseId: notificationCourseId,
          enrollmentId: enrollment?._id,
          url: `/student/${studentId}?showActionPlan=true`,
          teacherId: req.user?.userId,
        },
      });
    } else {
      await resolveNotification({
        studentId,
        courseId: notificationCourseId,
        type: "action_plan_required",
      });
    }

    // 🔁 Kontrollera global notisstatus
    await evaluateGradingStatusAndNotify();
    await evaluateActionPlanStatusAndNotify();

    res.send("✅ Betyg sparat!");
  } catch (err) {
    logger.error({ err }, "Error saving grade");
    res.status(500).send("Server error");
  }
});

router.post("/teacher/lock-grade", authenticateUser, async (req, res) => {
  const { studentId, courseId, enrollmentId } = req.body;
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (!ALLOWED_GRADING_ROLES.includes(role)) {
    return res
      .status(403)
      .json({ error: "Endast behörig personal kan låsa betyg." });
  }

  try {
    let studentName = "Elev";
    let courseName = "Kurs";
    let targetStudentId = studentId;
    let targetCourseId = courseId;

    if (enrollmentId) {
      const enrollment = await StudentEnrollment.findById(enrollmentId)
        .populate("studentId", "name")
        .populate("courseInstanceId", "courseName");
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }
      if (role === "teacher") {
        const authorized = await verifyTeacherAuthorizedForEnrollment(userId, enrollment);
        if (!authorized) {
          return res.status(403).json({ error: "Du är inte behörig att låsa detta betyg." });
        }
      }
      enrollment.isGradeLocked = true;
      enrollment.gradeLockedBy = userId;
      enrollment.gradeLockedAt = new Date();
      await enrollment.save();

      if (enrollment.studentId) studentName = enrollment.studentId.name || studentName;
      if (enrollment.courseInstanceId) courseName = enrollment.courseInstanceId.courseName || courseName;
      targetStudentId = enrollment.studentId?._id?.toString() || targetStudentId;
    } else if (targetStudentId) {
      const enrollment = await findGradeEnrollment(targetStudentId, targetCourseId);
      if (!enrollment) {
        return res.status(404).json({ error: "Kursen hittades inte för eleven" });
      }
      if (role === "teacher") {
        const authorized = await verifyTeacherAuthorizedForEnrollment(userId, enrollment);
        if (!authorized) {
          return res.status(403).json({ error: "Du är inte behörig att låsa detta betyg." });
        }
      }
      enrollment.isGradeLocked = true;
      enrollment.gradeLockedBy = userId;
      enrollment.gradeLockedAt = new Date();
      await enrollment.save();
      const populated = await StudentEnrollment.findById(enrollment._id)
        .populate("studentId", "name")
        .populate("mainCourseId", "courseName")
        .lean();
      studentName = populated?.studentId?.name || studentName;
      courseName = populated?.mainCourseId?.courseName || courseName;
    } else {
      return res
        .status(400)
        .json({ error: "studentId eller enrollmentId krävs för att låsa betyg." });
    }

    const lockerName = req.user?.name || req.user?.username || "Användare";

    // Target the notification to the responsible teacher (the student's assigned
    // teacher), not the person performing the lock. This keeps the "grade locked"
    // alert visible to the teacher who owns the student/course so it reaches the
    // intended audience. Falls back to the acting user when none can be resolved.
    let responsibleTeacherUser = null;
    let responsibleTeacherRecord = null;
    try {
      const studentForTarget = targetStudentId && Student.findById
        ? await Student.findById(targetStudentId).select("teacherId").catch(() => null)
        : null;
      if (studentForTarget?.teacherId) {
        responsibleTeacherRecord = await User.findById(studentForTarget.teacherId).select("_id").lean().catch(() => null);
      }
      if (!responsibleTeacherRecord) {
        responsibleTeacherRecord = await findTeacherUser(userId, { select: "_id", lean: true }).catch(() => null);
      }
      if (responsibleTeacherRecord) {
        responsibleTeacherUser = responsibleTeacherRecord._id;
      }
    } catch (targetErr) {
      logger.warn({ err: targetErr }, "Could not resolve responsible teacher for grade lock notification");
    }
    // Fall back to the acting user so a notification is always targeted.
    responsibleTeacherUser = responsibleTeacherUser || userId;

    await Notification.create({
      type: NOTIFICATION_TYPES.GRADE_LOCKED,
      message: `Betyg låst för ${studentName} (${courseName}) av ${role === "teacher" ? "lärare" : "admin"} ${lockerName}.`,
      teacher: responsibleTeacherRecord?._id || undefined,
      meta: {
        studentId: targetStudentId,
        courseId: targetCourseId,
        enrollmentId: enrollmentId || null,
        teacherId: responsibleTeacherUser || undefined,
        // Explicit admin/systemadmin routing: locked grades must be flagged for
        // admins (who grade in the municipalities' systems). GET /notifications
        // exposes all non-dropout notes to admin/systemadmin regardless of the
        // teacher field, so this marker is the explicit routing contract.
        routedTo: "admin/systemadmin",
      },
      resolved: false,
    });

    await AuditLog.create({
      entityType: "StudentEnrollment",
      entityId: enrollmentId || targetCourseId,
      action: "grade_lock",
      description: `Betyg låst för ${studentName} (${courseName})`,
      performedBy: {
        userId: userId,
        role: role,
        email: req.user?.email,
      },
    });

    return res.status(200).json({ message: "Grade locked", locked: true });
  } catch (error) {
    logger.error({ err: error }, "Error locking grade");
    res.status(500).json({ error: "Server error" });
  }
});


// Delete an enrollment by ID
router.delete('/enrollments/:id', authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Only administrators can delete enrollments" });
  }
  try {
    const { id } = req.params;
    const enrollment = await StudentEnrollment.findByIdAndDelete(id);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json({ success: true, message: 'Enrollment deleted' });
  } catch (err) {
    logger.error({ err }, "Error deleting enrollment");
    res.status(500).json({ error: 'Failed to delete enrollment' });
  }
});

// ===== ADDITIONAL GRADING ROUTES =====


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
      .populate("teacherId", TEACHER_POPULATE_FIELDS)
      .populate("gradeLockedBy", "username email")
      .sort({ gradeLockedAt: -1 });

    res.json({
      success: true,
      lockedGrades,
      total: lockedGrades.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching locked grades");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grades for a specific student
router.get('/student/:studentId/grades', authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { studentId } = req.params;
    
    const grades = await StudentEnrollment.find({
      studentId,
      grade: { $ne: null },
    })
      .populate("courseInstanceId", "courseName courseCode startDate endDate")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", TEACHER_POPULATE_FIELDS)
      .populate("gradeBy", "username email")
      .sort({ gradeDate: -1 });

    res.json({
      success: true,
      grades,
      total: grades.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching student grades");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grades for a specific course instance
router.get('/course-instance/:courseInstanceId/grades', authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { courseInstanceId } = req.params;
    
    const grades = await StudentEnrollment.find({
      courseInstanceId,
      grade: { $ne: null },
    })
      .populate("studentId", "name email personalNumber")
      .populate("courseInstanceId", "courseName courseCode startDate endDate")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", TEACHER_POPULATE_FIELDS)
      .populate("gradeBy", "username email")
      .sort({ gradeDate: -1 });

    res.json({
      success: true,
      grades,
      total: grades.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching course instance grades");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update grade (if not locked)
router.put('/update-grade/:enrollmentId', authenticateUser, async (req, res) => {
  if (!ALLOWED_GRADING_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { enrollmentId } = req.params;
    const { grade, motivation, comments, nationalTestPoints, assessmentResults, resultType, value } = req.body;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (grade && (!motivation || motivation.trim() === "")) {
      return res.status(400).json({ error: "Motivering krävs för betyg" });
    }

    const enrollment = await StudentEnrollment.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.isGradeLocked) {
      return res.status(403).json({ error: 'Grade is locked and cannot be modified' });
    }

    if (userRole === "teacher") {
      const authorized = await verifyTeacherAuthorizedForEnrollment(userId, enrollment);
      if (!authorized) {
        return res.status(403).json({ error: "Du är inte behörig att betygsätta denna kurs/elev." });
      }
    }

    // Support course-specific result type entry
    if (resultType === "final_grade") {
      if (value !== undefined) {
        if (value && (!motivation || motivation.trim() === "")) {
          return res.status(400).json({ error: "Motivering krävs för betyg" });
        }
        enrollment.grade = value;
      }
    } else if (resultType === "national_test") {
      if (value !== undefined) {
        enrollment.nationalTestPoints = value === null || value === "" ? null : Number(value);
      }
    } else if (resultType) {
      if (!enrollment.assessmentResults) {
        enrollment.assessmentResults = new Map();
      }
      if (typeof enrollment.assessmentResults.set === "function") {
        enrollment.assessmentResults.set(resultType, value);
      } else {
        enrollment.assessmentResults[resultType] = value;
      }
    }

    // Update grade fields
    if (grade !== undefined) enrollment.grade = grade;
    if (motivation !== undefined) enrollment.motivation = motivation;
    if (comments !== undefined) enrollment.comments = comments;
    if (nationalTestPoints !== undefined) {
      enrollment.nationalTestPoints = nationalTestPoints === null || nationalTestPoints === "" ? null : Number(nationalTestPoints);
    }
    if (assessmentResults && typeof assessmentResults === "object") {
      if (!enrollment.assessmentResults) {
        enrollment.assessmentResults = new Map();
      }
      for (const [k, v] of Object.entries(assessmentResults)) {
        if (typeof enrollment.assessmentResults.set === "function") {
          enrollment.assessmentResults.set(k, v);
        } else {
          enrollment.assessmentResults[k] = v;
        }
      }
    }
    
    enrollment.gradeDate = new Date();
    enrollment.gradeBy = userId;

    await enrollment.save();

    await recordAudit(req, {
      entityType: "StudentEnrollment",
      entityId: enrollmentId,
      action: "grade_update",
      description: `Betyg uppdaterat till ${enrollment.grade || "N/A"} för enrollment ${enrollmentId}`,
    });

    const targetStudentId = enrollment.studentId?.toString() || enrollment.studentId;
    const targetCourseId = enrollment.courseInstanceId?.toString() || enrollment.courseInstanceId;

    if (grade === "F") {
      let studentRecord = null;
      let teacherRecord = null;
      if (targetStudentId && Student?.findById) {
        try {
          const query = Student.findById(targetStudentId);
          studentRecord = query && typeof query.lean === "function" ? await query.lean() : await query;
          if (studentRecord?.teacherId) {
            teacherRecord = await User.findById(studentRecord.teacherId).select("_id").lean().catch(() => null);
          }
        } catch (findErr) {
          studentRecord = null;
        }
      }
      if (!teacherRecord && userId) {
        teacherRecord = await findTeacherUser(userId, { select: "_id", lean: true }).catch(() => null);
      }
      const studentName = studentRecord?.name || "Elev";
      await createNotification({
        studentId: targetStudentId,
        courseId: targetCourseId,
        type: "action_plan_required",
        message: `Handlingsplan krävs: ${studentName} har fått F i betyg`,
        teacher: teacherRecord?._id || undefined,
        meta: {
          studentId: targetStudentId,
          courseId: targetCourseId,
          enrollmentId,
          url: `/student/${targetStudentId}?showActionPlan=true`,
          teacherId: userId,
        },
      });
    } else if (grade) {
      await resolveNotification({
        studentId: targetStudentId,
        courseId: targetCourseId,
        type: "action_plan_required",
      });
    }

    await evaluateGradingStatusAndNotify();
    await evaluateActionPlanStatusAndNotify();

    res.json({
      success: true,
      message: 'Grade updated successfully',
      enrollment,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating grade");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Grading scales (national tests: Engelska/Svenska/Matematik) ---
// The points->grade scale changes annually (e.g. HT24) and is managed by
// admins/systemadmins. Writes are admin-only; reads are allowed for staff.

router.get("/grading-scale", authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { term, subject } = req.query;
    const query = {};
    if (term) query.term = term;
    if (subject) query.subject = subject;
    const scales = await GradingScale.find(query).sort({ term: 1, subject: 1 }).lean();
    res.json(scales);
  } catch (error) {
    logger.error({ err: error }, "Error listing grading scales");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/grading-scale/terms", authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const terms = await GradingScale.distinct("term");
    res.json(terms.sort());
  } catch (error) {
    logger.error({ err: error }, "Error listing grading scale terms");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Suggest the grade a national-test score yields for a term+subject.
router.get("/grading-scale/suggest", authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { term, subject } = req.query;
    const points = Number(req.query.points);
    if (!term || !subject || !Number.isFinite(points)) {
      return res.status(400).json({ error: "term, subject och points krävs" });
    }
    const scale = await GradingScale.findOne({ term, subject }).lean();
    if (!scale) {
      return res.json({ grade: null, hasScale: false });
    }
    const grade = gradeFromScale(points, scale.scale);
    res.json({ grade, hasScale: true });
  } catch (error) {
    logger.error({ err: error }, "Error suggesting grade from scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post("/grading-scale", authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Endast admin/systemadmin kan ändra betygsskalor." });
  }
  try {
    const { term, subject, scale } = req.body || {};
    const validationError = validateScalePayload(term, subject, scale);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const existing = await GradingScale.findOne({ term, subject });
    if (existing) {
      return res.status(409).json({ error: "En betygsskala för den termen och det ämnet finns redan." });
    }
    const doc = await GradingScale.create({ term: term.trim(), subject: subject.trim(), scale });
    await recordAudit(req, {
      entityType: "GradingScale",
      entityId: doc._id,
      action: "grading_scale_create",
      description: `Betygsskala skapad för ${term.trim()} ${subject.trim()}`,
    });
    res.status(201).json(doc);
  } catch (error) {
    logger.error({ err: error }, "Error creating grading scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put("/grading-scale/:id", authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Endast admin/systemadmin kan ändra betygsskalor." });
  }
  try {
    const { id } = req.params;
    const { term, subject, scale } = req.body || {};
    const validationError = validateScalePayload(term, subject, scale);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const existing = await GradingScale.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Betygsskalan hittades inte." });
    }
    const dup = await GradingScale.findOne({
      term: term.trim(),
      subject: subject.trim(),
      _id: { $ne: id },
    });
    if (dup) {
      return res.status(409).json({ error: "En betygsskala för den termen och det ämnet finns redan." });
    }
    existing.term = term.trim();
    existing.subject = subject.trim();
    existing.scale = scale;
    await existing.save();
    await recordAudit(req, {
      entityType: "GradingScale",
      entityId: id,
      action: "grading_scale_update",
      description: `Betygsskala uppdaterad (${existing.term} ${existing.subject})`,
    });
    res.json(existing);
  } catch (error) {
    logger.error({ err: error }, "Error updating grading scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete("/grading-scale/:id", authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Endast admin/systemadmin kan ändra betygsskalor." });
  }
  try {
    const { id } = req.params;
    const deleted = await GradingScale.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Betygsskalan hittades inte." });
    }
    await recordAudit(req, {
      entityType: "GradingScale",
      entityId: id,
      action: "grading_scale_delete",
      description: `Betygsskala borttagen (${deleted.term} ${deleted.subject})`,
    });
    res.json({ success: true, message: "Betygsskala borttagen." });
  } catch (error) {
    logger.error({ err: error }, "Error deleting grading scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
