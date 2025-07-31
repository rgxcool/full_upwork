import express from "express";
const router = express.Router();
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Exam from "../models/Provning.js";
import CalendarEvent from "../models/Event.js";
import StudentEnrollment from "../models/StudentEnrollment.js";

import { createGlobalNotification } from "../controllers/notificationController.js"; // Lägg till högst upp

import Notification from "../models/Notification.js";

router.put("/exams/:id/decision", async (req, res) => {
    try {
        const { decision, comment } = req.body;
        const examId = req.params.id;

        console.log(`Hantera beslut: ${decision} för examId: ${examId}`);

        // Hämta den befintliga prövningen
        const exam = await Exam.findById(examId).populate("teacherId");
        if (!exam) {
            return res.status(404).json({ error: "Prövning hittades inte." });
        }

        const updateData = { decision, comment };

        switch (decision) {
            case "accept":
                const finalExamDate = calculateExamDate(exam.requestedMonth);
                if (!finalExamDate) {
                    return res
                        .status(400)
                        .json({ error: "Ogiltigt datum för accept" });
                }

                const student = await Student.findOneAndUpdate(
                    { personalNumber: exam.personalNumber },
                    {
                        personalNumber: exam.personalNumber,
                        name: exam.name, // or whatever fields are relevant
                        finalExamDate,
                    },
                    { upsert: true, new: true }
                );

                updateData.status = "scheduled";
                updateData.studentId = student._id;
                break;

            case "deny":
                updateData.status = "denied";
                break;

            default:
                return res.status(400).json({ error: "Ogiltigt beslut." });
        }

        const updatedExam = await Exam.findByIdAndUpdate(examId, updateData, {
            new: true,
        });

        res.json(updatedExam);
    } catch (err) {
        console.error("Fel vid uppdatering av beslut:", err);
        res.status(500).json({ error: "Kunde inte spara beslut." });
    }
});

function calculateExamDate(requestedMonth) {
    const months = {
        Januari: 0,
        Februari: 1,
        Mars: 2,
        April: 3,
        Maj: 4,
        Juni: 5,
        Juli: 6,
        Augusti: 7,
        September: 8,
        Oktober: 9,
        November: 10,
        December: 11,
    };

    const month = months[requestedMonth];
    const year = new Date().getFullYear();

    if (month === undefined) {
        console.error("Ogiltigt månad:", requestedMonth);
        return null;
    }

    return new Date(Date.UTC(year, month, 15));
}

function getNextMonth(currentMonth) {
    const months = {
        Januari: 0,
        Februari: 1,
        Mars: 2,
        April: 3,
        Maj: 4,
        Juni: 5,
        Juli: 6,
        Augusti: 7,
        September: 8,
        Oktober: 9,
        November: 10,
        December: 11,
    };

    const monthIndex = months[currentMonth];
    if (monthIndex === undefined) return null;

    const newMonth = (monthIndex + 1) % 12;
    const yearAdjustment = newMonth === 0 ? 1 : 0;
    const newYear = new Date().getFullYear() + yearAdjustment;

    return `${newYear}-${(newMonth + 1).toString().padStart(2, "0")}`;
}

router.post("/exams", async (req, res) => {
    try {
        // Clean up the request body
        const examData = { ...req.body };

        // Handle empty teacherId - remove it if it's empty string
        if (examData.teacherId === "") {
            delete examData.teacherId;
        }

        // Handle empty paymentDate
        if (examData.paymentDate === "") {
            delete examData.paymentDate;
        }

        const exam = new Exam(examData);
        const savedExam = await exam.save();

        // 🔔 Skapa global notis till admin
        await createGlobalNotification(
            "new_exam_registered",
            `Ny prövning registrerad för ${exam.name} (${exam.course})`
        );

        res.status(201).json(savedExam);
    } catch (err) {
        console.error("Error saving exam:", err.message);

        // Provide more specific error messages
        if (err.name === "ValidationError") {
            const validationErrors = Object.values(err.errors).map(
                (e) => e.message
            );
            return res.status(400).json({
                error: "Validation failed",
                details: validationErrors,
            });
        }

        res.status(500).json({ error: "Failed to register exam." });
    }
});

router.get("/exams", async (req, res) => {
    try {
        const exams = await Exam.find().populate({
            path: "teacherId",
            populate: {
                path: "userId",
                select: "username",
            },
        });
        // 🔔 Skapa notiser för kommande prövningar (3-4 veckor före månadsslut)
        const now = new Date();
        const currentYear = now.getFullYear();

        const months = [
            "Januari",
            "Februari",
            "Mars",
            "April",
            "Maj",
            "Juni",
            "Juli",
            "Augusti",
            "September",
            "Oktober",
            "November",
            "December",
        ];

        for (const exam of exams) {
            if (
                !exam.requestedMonth ||
                !exam.teacherId ||
                exam.status !== "intresse"
            )
                continue;

            const monthIndex = months.indexOf(exam.requestedMonth);
            if (monthIndex === -1) continue;

            const endOfMonth = new Date(currentYear, monthIndex + 1, 0); // sista dagen i månaden
            const diffDays = Math.ceil(
                (endOfMonth - now) / (1000 * 60 * 60 * 24)
            );

            if (diffDays >= 21 && diffDays <= 30) {
                const exists = await Notification.findOne({
                    teacher: exam.teacherId._id,
                    examId: exam._id,
                });
                if (!exists) {
                    const message = `Ny prövningselev: ${exam.name} (${exam.course}) önskar skriva i ${exam.requestedMonth}`;
                    await Notification.create({
                        teacher: exam.teacherId._id,
                        message,
                        examId: exam._id,
                    });
                }
            }
        }

        res.json(exams);
    } catch (err) {
        console.error("Error fetching exams:", err.message);
        res.status(500).json({ error: "Failed to fetch exams." });
    }
});

router.post("/calendar-events", async (req, res) => {
    try {
        const event = new CalendarEvent(req.body);
        await event.save();
        res.status(201).json({ message: "Event sparat", event });
    } catch (error) {
        console.error("❌ Fel vid manuell event-skapning:", error.message);
        res.status(500).json({ error: "Kunde inte spara event." });
    }
});

router.get("/calendar-events", async (req, res) => {
    try {
        const events = await CalendarEvent.find();
        res.json(events);
    } catch (err) {
        console.error("❌ Fel vid hämtning:", err);
        res.status(500).json({ error: "Kunde inte hämta sparade event" });
    }
});

router.get("/calendar-events/syncable", async (req, res) => {
    try {
        console.log("🔍 /calendar-events/syncable called");
        
        // Get students with finalExamDate (manual scheduling)
        const studentsWithFinalExam = await Student.find({
            finalExamDate: { $ne: null },
            dropout: { $ne: true },
        })
        .populate({
            path: "teacherId",
            populate: { path: "userId", select: "username" },
        });
        await Student.populate(studentsWithFinalExam, { path: 'education.refId', model: 'Course', select: 'courseName courseCode' });

        console.log("📅 Students with finalExamDate:", studentsWithFinalExam.length);

        // Get enrollments with slutprovDate (automatic from courses)
        const enrollmentsWithSlutprov = await StudentEnrollment.find({
            slutprovDate: { $ne: null },
            status: { $in: ['enrolled', 'active'] }
        })
        .populate('studentId')
        .populate('mainCourseId')
        .populate({
            path: 'teacherId',
            populate: { path: 'userId', select: 'username' }
        });

        console.log("📅 Enrollments with slutprovDate:", enrollmentsWithSlutprov.length);
        enrollmentsWithSlutprov.forEach(e => {
            console.log("  - Student:", e.studentId?.name, "Course:", e.mainCourseId?.courseName, "Date:", e.slutprovDate, "Teacher:", e.teacherId?.userId?.username || e.studentId?.teacherId?.userId?.username || "None");
        });

        const grouped = {};

        // Process students with finalExamDate (existing logic)
        for (const student of studentsWithFinalExam) {
            if (!student.finalExamDate || !student.teacherId || !student.teacherId.userId) continue;
            // Use only the date part (YYYY-MM-DD) for grouping
            const dateObj = new Date(student.finalExamDate);
            const dateKey = dateObj.toISOString().split("T")[0];
            const teacherId = student.teacherId._id.toString();
            const key = `${teacherId}_${dateKey}`;

            // Find course name from education array
            let courseName = null;
            if (Array.isArray(student.education)) {
                const edu = student.education.find(e => {
                    if (e.type !== "Course" || !e.startDate || !e.endDate) return false;
                    const start = new Date(e.startDate).setHours(0,0,0,0);
                    const end = new Date(e.endDate).setHours(0,0,0,0);
                    const exam = new Date(dateKey).setHours(0,0,0,0);
                    return exam >= start && exam <= end && e.refId && typeof e.refId === "object" && e.refId.courseName;
                });
                if (edu && edu.refId && typeof edu.refId === "object" && edu.refId.courseName) {
                    courseName = edu.refId.courseName;
                }
            }
            // If not found, try StudentEnrollment
            if (!courseName) {
                const enrollment = await StudentEnrollment.findOne({
                    studentId: student._id,
                    endDate: { $gte: new Date(dateKey), $lt: new Date(new Date(dateKey).getTime() + 24*60*60*1000) }
                }).populate("mainCourseId");
                if (enrollment && enrollment.mainCourseId && enrollment.mainCourseId.courseName) {
                    courseName = enrollment.mainCourseId.courseName;
                }
            }

            // Load per-event attendance if present
            let attended = student.attendedExam || false;
            // Try to find an existing event for this group and date
            let eventDoc = await CalendarEvent.findOne({
                title: { $regex: /^Slutprov/i },
                start: new Date(dateKey + 'T00:00:00'),
                'extendedProps.teacherId': student.teacherId._id,
                'extendedProps.type': 'exam',
            });
            if (eventDoc && eventDoc.extendedProps && Array.isArray(eventDoc.extendedProps.students)) {
                const found = eventDoc.extendedProps.students.find(s => s._id?.toString() === student._id.toString() || s.personalNumber === student.personalNumber);
                if (found && typeof found.attended === 'boolean') {
                    attended = found.attended;
                }
            }

            if (!grouped[key]) {
                // Set event start to local midnight for the date
                const startDate = new Date(dateKey + 'T00:00:00');
                grouped[key] = {
                    title: student.teacherId.userId.username,
                    start: startDate,
                    color: student.teacherId.colorCode || "#999999",
                    extendedProps: {
                        teacher: student.teacherId.userId.username,
                        teacherId: student.teacherId._id,
                        type: "exam",
                        examMunicipality: student.examMunicipality || "",
                        examLocation: student.examLocation || "",
                        examTime: student.examTime || "",
                        courseName: courseName || null,
                        students: [],
                    },
                };
            }

            grouped[key].extendedProps.students.push({
                _id: student._id,
                name: student.name,
                personalNumber: student.personalNumber,
                additionalInfo: student.additionalInfo || "",
                attended,
                courseName: courseName || null,
            });
        }

        // Process enrollments with slutprovDate (new logic)
        for (const enrollment of enrollmentsWithSlutprov) {
            if (!enrollment.slutprovDate || !enrollment.studentId || !enrollment.mainCourseId) continue;
            
            const student = enrollment.studentId;
            const course = enrollment.mainCourseId;
            
            // Use only the date part (YYYY-MM-DD) for grouping
            const dateObj = new Date(enrollment.slutprovDate);
            const dateKey = dateObj.toISOString().split("T")[0];
            
            // Use teacherId from enrollment or fall back to student's teacherId
            let teacherId = enrollment.teacherId;
            let teacherUsername = 'Unknown';
            let teacherColor = "#999999";
            
            if (teacherId && teacherId.userId) {
                teacherUsername = teacherId.userId.username;
                teacherColor = teacherId.colorCode || "#999999";
            } else if (student.teacherId && student.teacherId.userId) {
                teacherId = student.teacherId;
                teacherUsername = student.teacherId.userId.username;
                teacherColor = student.teacherId.colorCode || "#999999";
            } else {
                // If no teacher found, use a default teacher or skip
                console.log(`⚠️ No teacher found for student ${student.name} in course ${course.courseName}`);
                continue; // Skip if no teacher found
            }
            
            const key = `${teacherId._id.toString()}_${dateKey}`;

            // Load attendance from ExamAttendance records
            const { default: ExamAttendance } = await import('../models/ExamAttendance.js');
            
            // Use date range query to handle timezone issues
            const startOfDay = new Date(dateKey + 'T00:00:00.000Z');
            const endOfDay = new Date(dateKey + 'T23:59:59.999Z');
            
            console.log(`🔍 Querying attendance for ${student.name} on date ${dateKey}`);
            console.log(`🔍 Query range: ${startOfDay} to ${endOfDay}`);
            console.log(`🔍 Query teacherId: ${teacherId._id}`);
            console.log(`🔍 Query studentId: ${student._id}`);
            
            const attendanceRecord = await ExamAttendance.findOne({
                examDate: { $gte: startOfDay, $lte: endOfDay },
                teacherId: teacherId._id,
                studentId: student._id
            });
            let attended = attendanceRecord ? attendanceRecord.attended : false;
            console.log(`📊 Student ${student.name} attendance: ${attended} (from ExamAttendance: ${attendanceRecord ? 'found' : 'not found'}) for date ${dateKey}`);
            if (attendanceRecord) {
                console.log(`📊 Found record: examDate=${attendanceRecord.examDate}, attended=${attendanceRecord.attended}`);
            }

            if (!grouped[key]) {
                // Set event start to local midnight for the date
                const startDate = new Date(dateKey + 'T00:00:00');
                grouped[key] = {
                    title: teacherUsername,
                    start: startDate,
                    color: teacherColor,
                    extendedProps: {
                        teacher: teacherUsername,
                        teacherId: teacherId._id,
                        type: "slutprov",
                        examMunicipality: student.examMunicipality || "",
                        examLocation: student.examLocation || "",
                        examTime: student.examTime || "",
                        courseName: course.courseName,
                        students: [],
                    },
                };
            }

            const studentData = {
                _id: student._id,
                name: student.name,
                personalNumber: student.personalNumber,
                additionalInfo: student.additionalInfo || "",
                attended,
                courseName: course.courseName,
            };
            console.log(`📤 Sending student data for ${student.name}: attended=${attended}`);
            grouped[key].extendedProps.students.push(studentData);
        }

        console.log("📅 Final grouped events:", Object.keys(grouped).length);
        console.log("📅 Grouped events:", Object.values(grouped));
        
        res.json(Object.values(grouped));
    } catch (err) {
        console.error("❌ Fel vid synk:", err.message);
        res.status(500).json({ error: "Kunde inte hämta synkade events." });
    }
});

router.put("/update-exam/:id", async (req, res) => {
    const { id } = req.params;
    const { examTime, examMunicipality, examLocation } = req.body;

    if (!id || id.length !== 24) {
        return res.status(400).json({ error: "Ogiltigt student-ID" });
    }

    try {
        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Studenten hittades inte" });
        }

        // Uppdatera endast dessa tre fält
        if (examTime) student.examTime = examTime;
        if (examMunicipality) student.examMunicipality = examMunicipality;
        if (examLocation) student.examLocation = examLocation;

        await student.save();

        res.json({ message: "✅ Slutprov uppdaterat", student });
    } catch (error) {
        console.error("❌ Fel vid uppdatering av prov:", error.message);
        res.status(500).json({ error: "Serverfel", details: error.message });
    }
});

router.put("/mark-attendance/:personalNumber", async (req, res) => {
    console.log("📌 API /mark-attendance anropad! Data mottagen:", req.body);
    try {
        const { personalNumber } = req.params;

        // Trim whitespace/newlines
        const normalizedPN = personalNumber.trim();

        const student = await Student.findOne({ personalNumber: normalizedPN });

        console.log("🔍 Hittade student:", student);
        if (!student) {
            return res.status(404).json({ message: "Student not found" });
        }

        // ✅ Markera närvaro
        student.attendedExam = req.body.attended;
        await student.save();

        console.log("✅ Attendance marked for:", student);
        res.json({ message: "Attendance marked", student });
    } catch (error) {
        console.error("❌ Error marking attendance:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

router.post("/examtime-location", async (req, res) => {
    const { studentIds, examTime, examMunicipality, examLocation } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: "Inga student-ID:n angivna" });
    }

    try {
        const result = await Student.updateMany(
            { _id: { $in: studentIds } },
            {
                $set: {
                    examTime,
                    examMunicipality,
                    examLocation,
                },
            }
        );

        console.log("✅ Uppdaterade studenter:", result.modifiedCount);
        res.status(200).json({
            message: "Provinfo uppdaterad",
            updatedCount: result.modifiedCount,
        });
    } catch (error) {
        console.error("❌ Fel vid uppdatering av exam:", error.message);
        res.status(500).json({ message: "Serverfel", error: error.message });
    }
});

// Get attendance statistics for a student
router.get("/attendance-stats/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    const { default: ExamAttendance } = await import('../models/ExamAttendance.js');
    
    const attendanceRecords = await ExamAttendance.find({ studentId })
      .populate('teacherId', 'userId')
      .populate('courseId', 'courseName')
      .sort({ examDate: -1 });
    
    const totalExams = attendanceRecords.length;
    const attendedExams = attendanceRecords.filter(r => r.attended).length;
    const attendanceRate = totalExams > 0 ? (attendedExams / totalExams * 100).toFixed(1) : 0;
    
    const stats = {
      totalExams,
      attendedExams,
      missedExams: totalExams - attendedExams,
      attendanceRate: parseFloat(attendanceRate),
      recentExams: attendanceRecords.slice(0, 10), // Last 10 exams
      byCourse: {}
    };
    
    // Group by course
    attendanceRecords.forEach(record => {
      const courseName = record.courseName;
      if (!stats.byCourse[courseName]) {
        stats.byCourse[courseName] = {
          total: 0,
          attended: 0,
          missed: 0
        };
      }
      stats.byCourse[courseName].total++;
      if (record.attended) {
        stats.byCourse[courseName].attended++;
      } else {
        stats.byCourse[courseName].missed++;
      }
    });
    
    res.json(stats);
  } catch (error) {
    console.error('❌ Error getting attendance stats:', error);
    res.status(500).json({ error: 'Failed to get attendance statistics' });
  }
});

router.delete("/exams/:id", async (req, res) => {
    try {
        const examId = req.params.id;
        const exam = await Exam.findByIdAndDelete(examId);
        if (!exam) {
            return res.status(404).json({ error: "Prövning hittades inte." });
        }
        res.json({ message: "Prövning raderad.", exam });
    } catch (err) {
        console.error("Fel vid radering av prövning:", err.message);
        res.status(500).json({ error: "Kunde inte radera prövning." });
    }
});

// PATCH: Batch update attendance for a specific event (date + teacher)
router.post('/calendar-events/mark-attendance', async (req, res) => {
  console.log('🚀 mark-attendance endpoint called!');
  console.log('📥 Request body:', req.body);
  console.log('📥 Request method:', req.method);
  console.log('📥 Request URL:', req.url);
  console.log('📥 Request headers:', req.headers);
  try {
    const { date, teacherId, students, courseName, courseId } = req.body; // students: [{ _id, attended }]
    console.log('🔍 mark-attendance called with:', { date, teacherId, students, courseName, courseId });
    
    if (!date || !teacherId || !Array.isArray(students)) {
      return res.status(400).json({ error: 'Missing date, teacherId, or students array' });
    }
    
    // Import models
    const { default: Student } = await import('../models/Student.js');
    const { default: ExamAttendance } = await import('../models/ExamAttendance.js');
    
    // Handle date conversion properly to avoid timezone issues
    const examDate = new Date(date);
    // Use the local date from the frontend, not UTC
    const dateKey = examDate.getFullYear() + '-' + 
                   String(examDate.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(examDate.getDate()).padStart(2, '0');
    console.log(`🔍 Original date: ${date}`);
    console.log(`🔍 Parsed examDate: ${examDate}`);
    console.log(`🔍 Generated dateKey: ${dateKey}`);
    
    const updatePromises = students.map(async (student) => {
      try {
        const studentDoc = await Student.findById(student._id);
        if (!studentDoc) {
          console.log(`❌ Student not found: ${student._id}`);
          return { success: false, studentId: student._id, error: 'Student not found' };
        }
        
                // Find or create exam attendance record
        const startOfDay = new Date(dateKey + 'T00:00:00.000Z');
        const endOfDay = new Date(dateKey + 'T23:59:59.999Z');
        
        let attendanceRecord = await ExamAttendance.findOne({
            examDate: { $gte: startOfDay, $lte: endOfDay },
            teacherId: teacherId,
            studentId: student._id
        });
        
        if (!attendanceRecord) {
          // Create new attendance record
          attendanceRecord = new ExamAttendance({
            examDate: new Date(dateKey + 'T00:00:00.000Z'),
            courseName: courseName || 'Unknown Course',
            courseId: courseId,
            teacherId: teacherId,
            studentId: student._id,
            studentName: studentDoc.name,
            personalNumber: studentDoc.personalNumber,
            attended: !!student.attended,
            examTime: student.examTime || '',
            examMunicipality: student.examMunicipality || '',
            examLocation: student.examLocation || '',
            recordedBy: req.user?._id
          });
        } else {
          // Update existing record
          attendanceRecord.attended = !!student.attended;
          attendanceRecord.updatedAt = new Date();
          attendanceRecord.updatedBy = req.user?._id;
          if (student.examTime) attendanceRecord.examTime = student.examTime;
          if (student.examMunicipality) attendanceRecord.examMunicipality = student.examMunicipality;
          if (student.examLocation) attendanceRecord.examLocation = student.examLocation;
        }
        
        await attendanceRecord.save();
        console.log(`💾 Saved attendance record: ${attendanceRecord._id} for student ${studentDoc.name} - attended: ${attendanceRecord.attended}`);
        console.log(`💾 Saved examDate: ${attendanceRecord.examDate}`);
        console.log(`💾 Saved teacherId: ${attendanceRecord.teacherId}`);
        console.log(`💾 Saved studentId: ${attendanceRecord.studentId}`);
        
                 // Update student's exam history
         const existingHistoryIndex = studentDoc.examHistory.findIndex(h => {
           const historyDate = h.examDate.toISOString().split('T')[0];
           return historyDate === dateKey && h.teacherId.toString() === teacherId.toString();
         });
        
        if (existingHistoryIndex >= 0) {
          // Update existing history entry
          studentDoc.examHistory[existingHistoryIndex].attended = !!student.attended;
          studentDoc.examHistory[existingHistoryIndex].updatedAt = new Date();
        } else {
                     // Add new history entry
           studentDoc.examHistory.push({
             examDate: new Date(dateKey + 'T00:00:00.000Z'),
            courseName: courseName || 'Unknown Course',
            courseId: courseId,
            teacherId: teacherId,
            attended: !!student.attended,
            examTime: student.examTime || '',
            examMunicipality: student.examMunicipality || '',
            examLocation: student.examLocation || '',
            recordedAt: new Date(),
            recordedBy: req.user?._id
          });
        }
        
        await studentDoc.save();
        
        console.log(`✅ Updated attendance for student ${studentDoc.name}: ${student.attended}`);
        return { success: true, studentId: student._id, attendanceId: attendanceRecord._id };
        
      } catch (error) {
        console.error(`❌ Error updating student ${student._id}:`, error);
        return { success: false, studentId: student._id, error: error.message };
      }
    });
    
    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    console.log(`📊 Attendance update results: ${successCount} successful, ${failureCount} failed`);
    
    res.json({ 
      message: `Attendance updated for ${successCount} students`, 
      results,
      successCount,
      failureCount
    });
  } catch (err) {
    console.error('❌ Error updating student attendance:', err);
    res.status(500).json({ error: 'Failed to update student attendance' });
  }
});

export default router;
