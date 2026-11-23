// utils/createFailingNotification.js
import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import logger from "./logger.js";

export const createFailingStudentNotification = async (studentId, courseId) => {
  try {
    const student = await Student.findById(studentId).lean();

    if (!student) return;

    // Leta upp kursens betyg i elevens registreringar (#103)
    const enrollment = await StudentEnrollment.findOne({
      studentId,
      mainCourseId: courseId,
      grade: 'F',
    })
      .populate('mainCourseId', 'courseName')
      .lean();

    if (!enrollment) return;
    const course = { name: enrollment.mainCourseId?.courseName };

    // Kontrollera att ingen dubblett redan finns
    const exists = await Notification.findOne({
      type: 'failing_grade',
      'meta.studentId': studentId,
      'meta.courseId': courseId,
      resolved: false,
    });

    if (exists) return;

    const notification = new Notification({
      type: 'failing_grade',
      message: `⚠️ Eleven ${student.name} har fått F i ${course.name || "en kurs"}!`,
      meta: {
        studentId: student._id,
        courseId,
        teacherId: student.teacher || null,
        url: `/student/${student._id}`,  // Frontend-länk
      },
    });

    await notification.save();
  } catch (err) {
    logger.error({ err: err }, "Kunde inte skapa F-notis");
  }
};
