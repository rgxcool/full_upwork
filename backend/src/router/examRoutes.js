import express from "express";
const router = express.Router();
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Exam from "../models/Provning.js";
import CalendarEvent from "../models/Event.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { authenticateUser } from "../controllers/authController.js";

import { createGlobalNotification } from "../controllers/notificationController.js"; // Lägg till högst upp

import Notification from "../models/Notification.js";


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

router.get("/exams", authenticateUser, async (req, res) => {
    try {
        let query = {};
        
        // If user is a teacher, filter exams by their teacherId
        if (req.user.role === "teacher") {
            // Find the teacher record for this user
            const teacher = await Teacher.findOne({ userId: req.user.userId });
            
            if (!teacher) {
                return res.status(403).json({ error: "Teacher profile not found" });
            }
            
            // Filter exams by this teacher's ID
            query.teacherId = teacher._id;
            console.log(`🔍 Teacher ${teacher._id} fetching their exams`);
        }
        
        const exams = await Exam.find(query).populate({
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

router.get("/calendar-events", authenticateUser, async (req, res) => {
    try {
        let query = {};
        
        // If user is a teacher, filter events by their teacherId
        if (req.user.role === "teacher") {
            // Find the teacher record for this user
            const teacher = await Teacher.findOne({ userId: req.user.userId });
            
            if (!teacher) {
                return res.status(403).json({ error: "Teacher profile not found" });
            }
            
            // Filter events by this teacher's ID
            query.teacherId = teacher._id;
            console.log(`🔍 Teacher ${teacher._id} fetching their calendar events`);
        }
        
        const events = await CalendarEvent.find(query);
        res.json(events);
    } catch (err) {
        console.error("❌ Fel vid hämtning:", err);
        res.status(500).json({ error: "Kunde inte hämta sparade event" });
    }
});

router.put("/calendar-events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;

    const updatedEvent = await CalendarEvent.findByIdAndUpdate(
      id,
      updateFields,
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ error: "Event hittades inte" });
    }

    res.json({ message: "✅ Event uppdaterat", event: updatedEvent });
  } catch (err) {
    console.error("❌ Fel vid uppdatering av event:", err.message);
    res.status(500).json({ error: "Kunde inte uppdatera event" });
  }
});


router.get("/calendar-events/syncable", authenticateUser, async (req, res) => {
  function pickFirstNonEmpty(arr, field) {
    return (arr.find(e => e[field] && e[field] !== "") || {})[field] || "";
  }
  function localDateKey(dateInput) {
    const d = new Date(dateInput);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

    try {
        console.log("🔍 /calendar-events/syncable called");
        
    let studentQuery = {
            finalExamDate: { $ne: null },
            dropout: { $ne: true },
    };

    let enrollmentQuery = {
      slutprovDate: { $ne: null },
      status: { $in: ['enrolled', 'active'] }
    };

    // Lärare: filtrera på deras elever
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId });
      if (!teacher) {
        return res.status(403).json({ error: "Teacher profile not found" });
      }
      studentQuery.teacherId = teacher._id;
      enrollmentQuery.teacherId = teacher._id;
      console.log(`🔍 Teacher ${teacher._id} fetching their syncable calendar events`);
    }

    // Manuellda slutprov (studenter med finalExamDate)
    const studentsWithFinalExam = await Student.find(studentQuery)
        .populate({
            path: "teacherId",
            populate: { path: "userId", select: "username" },
        });
        await Student.populate(studentsWithFinalExam, { path: 'education.refId', model: 'Course', select: 'courseName courseCode' });
        console.log("📅 Students with finalExamDate:", studentsWithFinalExam.length);

    // Automatiska kurs-slutprov (från enrollments)
    const enrollmentsWithSlutprov = await StudentEnrollment.find(enrollmentQuery)
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

    // ----------- GRUPPERA MANUELLA SLUTPROV -----------
        for (const student of studentsWithFinalExam) {
      try {

        if (!student.finalExamDate || !student.teacherId || !student.teacherId.userId) {
          console.warn("skip, saknar fält", student);
          continue;
        }

            const dateKey = localDateKey(student.finalExamDate);
            const teacherId = student.teacherId._id.toString();
            const key = `${teacherId}_${dateKey}`;

        // Hitta kursnamn
            let courseName = null;
            if (Array.isArray(student.education)) {
                const edu = student.education.find(e => {
                    if (e.type !== "Course" || !e.startDate || !e.endDate) return false;
            const start = new Date(e.startDate).setHours(0, 0, 0, 0);
            const end = new Date(e.endDate).setHours(0, 0, 0, 0);
            const exam = new Date(dateKey).setHours(0, 0, 0, 0);
                    return exam >= start && exam <= end && e.refId && typeof e.refId === "object" && e.refId.courseName;
                });
                if (edu && edu.refId && typeof edu.refId === "object" && edu.refId.courseName) {
                    courseName = edu.refId.courseName;
                }
            }
            if (!courseName) {
                const enrollment = await StudentEnrollment.findOne({
                    studentId: student._id,
            endDate: { $gte: new Date(dateKey), $lt: new Date(new Date(dateKey).getTime() + 24 * 60 * 60 * 1000) }
                }).populate("mainCourseId");
                if (enrollment && enrollment.mainCourseId && enrollment.mainCourseId.courseName) {
                    courseName = enrollment.mainCourseId.courseName;
                }
            }

        // Exam-/närvaroinfo från student-dokumentet
        const attended = student.attendedExam || false;
        const paidExamFee = student.paidExamFee || false;
        const studentExamTime = student.examTime || '';
        const studentExamMunicipality = student.examMunicipality || '';
        const studentExamLocation = student.examLocation || '';

                 // Get attendance data for this specific student and event
         const { default: ExamAttendance } = await import('../models/ExamAttendance.js');
         const startOfDay = new Date(dateKey + 'T00:00:00.000Z');
         const endOfDay = new Date(dateKey + 'T23:59:59.999Z');
         
         // Look for attendance record for this student's exam date
         const attendanceRecord = await ExamAttendance.findOne({
           examDate: { $gte: startOfDay, $lte: endOfDay },
           teacherId: student.teacherId._id,
           studentId: student._id
         });

        // Use attendance data if available, otherwise fallback to student data
        const finalAttended = attendanceRecord ? attendanceRecord.attended : attended;
        const finalPaidExamFee = attendanceRecord ? attendanceRecord.paidExamFee : paidExamFee;
        const finalExamTime = attendanceRecord ? attendanceRecord.examTime : studentExamTime;
        const finalExamMunicipality = attendanceRecord ? attendanceRecord.examMunicipality : studentExamMunicipality;
        const finalExamLocation = attendanceRecord ? attendanceRecord.examLocation : studentExamLocation;

            if (!grouped[key]) {
          // Samla samma tid/kommun/plats bland gruppen
          const sameTime = studentsWithFinalExam
            .filter(s =>
              s.finalExamDate &&
              s.teacherId &&
              s.teacherId._id.toString() === teacherId &&
              new Date(s.finalExamDate).toISOString().split("T")[0] === dateKey
            )
            .map(s => ({
              time: s.examTime,
              municipality: s.examMunicipality,
              location: s.examLocation
            }));

          // Get the most common exam info from attendance records for this event
          const { default: ExamAttendance } = await import('../models/ExamAttendance.js');
          const startOfDay = new Date(dateKey + 'T00:00:00.000Z');
          const endOfDay = new Date(dateKey + 'T23:59:59.999Z');
          
          // Debug the query parameters
          console.log(`🔍 Querying ExamAttendance with:`);
          console.log(`🔍   dateKey: ${dateKey}`);
          console.log(`🔍   startOfDay: ${startOfDay}`);
          console.log(`🔍   endOfDay: ${endOfDay}`);
          console.log(`🔍   teacherId: ${student.teacherId._id} (type: ${typeof student.teacherId._id})`);
          
          const attendanceRecords = await ExamAttendance.find({
            examDate: { $gte: startOfDay, $lte: endOfDay },
            teacherId: student.teacherId._id
          });
          

          
                     // Get the most common exam info from attendance records or fallback to student data
           const recordsWithTime = attendanceRecords.filter(r => r.examTime && r.examTime.trim() !== '');
           const recordsWithMunicipality = attendanceRecords.filter(r => r.examMunicipality && r.examMunicipality.trim() !== '');
           const recordsWithLocation = attendanceRecords.filter(r => r.examLocation && r.examLocation.trim() !== '');
           
           // Debug logging
           console.log(`🔍 Event ${key} - Found ${attendanceRecords.length} attendance records`);
           console.log(`🔍 Records with time: ${recordsWithTime.length}, with municipality: ${recordsWithMunicipality.length}, with location: ${recordsWithLocation.length}`);
           if (recordsWithTime.length > 0) console.log(`🔍 First time record: ${recordsWithTime[0].examTime}`);
           if (recordsWithMunicipality.length > 0) console.log(`🔍 First municipality record: ${recordsWithMunicipality[0].examMunicipality}`);
           if (recordsWithLocation.length > 0) console.log(`🔍 First location record: ${recordsWithLocation[0].examLocation}`);
           
           // Get the most common values (or first if all are the same)
           const eventExamTime = recordsWithTime.length > 0 ? recordsWithTime[0].examTime : (pickFirstNonEmpty(sameTime, 'time') || studentExamTime || '');
           const eventExamMunicipality = recordsWithMunicipality.length > 0 ? recordsWithMunicipality[0].examMunicipality : (pickFirstNonEmpty(sameTime, 'municipality') || studentExamMunicipality || '');
           const eventExamLocation = recordsWithLocation.length > 0 ? recordsWithLocation[0].examLocation : (pickFirstNonEmpty(sameTime, 'location') || studentExamLocation || '');
           
           console.log(`🔍 Final event exam info - Time: "${eventExamTime}", Municipality: "${eventExamMunicipality}", Location: "${eventExamLocation}"`);
          


                const startDate = new Date(dateKey + 'T00:00:00');
                grouped[key] = {
            id: `${teacherId}_${dateKey}`,
                    title: student.teacherId.userId.username,
                    start: dateKey,
                    color: student.teacherId.colorCode || "#999999",
                    extendedProps: {
                        teacher: student.teacherId.userId.username,
                        teacherId: student.teacherId._id,
                        type: "exam",
              examMunicipality: eventExamMunicipality,
              examLocation: eventExamLocation,
              examTime: eventExamTime,
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
          attended: finalAttended,
          paidExamFee: finalPaidExamFee,
          examTime: finalExamTime,
          examMunicipality: finalExamMunicipality,
          examLocation: finalExamLocation,
                courseName: courseName || null,
          finalExamDate: student.finalExamDate,
            });
        
        console.log(`🔍 Manual - Added student ${student.name} with finalExamDate: ${student.finalExamDate}`);
      } catch (err) {
        console.warn("Fel i studentsWithFinalExam-loopen:", err.message, student);
      }
        }

    // ----------- GRUPPERA AUTOMATISKA KURS-SLUTPROV -----------
        for (const enrollment of enrollmentsWithSlutprov) {
      try {
            if (!enrollment.slutprovDate || !enrollment.studentId || !enrollment.mainCourseId) continue;
            
            const student = enrollment.studentId;
            const course = enrollment.mainCourseId;
            
            const dateKey = localDateKey(enrollment.slutprovDate);
            
        // Lärare: från enrollment eller fallback på student
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
                console.log(`⚠️ No teacher found for student ${student.name} in course ${course.courseName}`);
          continue;
            }
            
            const key = `${teacherId._id.toString()}_${dateKey}`;

        const { default: ExamAttendance } = await import('../models/ExamAttendance.js');

        // Datumrange för att hantera timezone
        const startOfDay = new Date(dateKey + 'T00:00:00.000Z');
        const endOfDay = new Date(dateKey + 'T23:59:59.999Z');

        const attendanceRecord = await ExamAttendance.findOne({
          examDate: { $gte: startOfDay, $lte: endOfDay },
          teacherId: teacherId._id,
          studentId: student._id
        });

        const attended = attendanceRecord ? attendanceRecord.attended : false;
        const paidExamFee = attendanceRecord ? attendanceRecord.paidExamFee : false;
        const examTime = attendanceRecord ? attendanceRecord.examTime : '';
        const examMunicipality = attendanceRecord ? attendanceRecord.examMunicipality : '';
        const examLocation = attendanceRecord ? attendanceRecord.examLocation : '';

            if (!grouped[key]) {
                const startDate = new Date(dateKey + 'T00:00:00');
          
          // Get the most common exam info from attendance records for this event
          const { default: ExamAttendance } = await import('../models/ExamAttendance.js');
          const startOfDay = new Date(dateKey + 'T00:00:00.000Z');
          const endOfDay = new Date(dateKey + 'T23:59:59.999Z');
          
          // Debug the query parameters for auto events
          console.log(`🔍 Auto Querying ExamAttendance with:`);
          console.log(`🔍   dateKey: ${dateKey}`);
          console.log(`🔍   startOfDay: ${startOfDay}`);
          console.log(`🔍   endOfDay: ${endOfDay}`);
          console.log(`🔍   teacherId: ${teacherId._id} (type: ${typeof teacherId._id})`);
          
          const attendanceRecords = await ExamAttendance.find({
            examDate: { $gte: startOfDay, $lte: endOfDay },
            teacherId: teacherId._id
          });
          

          
                     // Get the most common exam info from attendance records
           const recordsWithTime = attendanceRecords.filter(r => r.examTime && r.examTime.trim() !== '');
           const recordsWithMunicipality = attendanceRecords.filter(r => r.examMunicipality && r.examMunicipality.trim() !== '');
           const recordsWithLocation = attendanceRecords.filter(r => r.examLocation && r.examLocation.trim() !== '');
           
           // Debug logging
           console.log(`🔍 Auto Event ${key} - Found ${attendanceRecords.length} attendance records`);
           console.log(`🔍 Auto Records with time: ${recordsWithTime.length}, with municipality: ${recordsWithMunicipality.length}, with location: ${recordsWithLocation.length}`);
           if (recordsWithTime.length > 0) console.log(`🔍 Auto First time record: ${recordsWithTime[0].examTime}`);
           if (recordsWithMunicipality.length > 0) console.log(`🔍 Auto First municipality record: ${recordsWithMunicipality[0].examMunicipality}`);
           if (recordsWithLocation.length > 0) console.log(`🔍 Auto First location record: ${recordsWithLocation[0].examLocation}`);
           
           const eventExamTime = recordsWithTime.length > 0 ? recordsWithTime[0].examTime : (student.examTime || "");
           const eventExamMunicipality = recordsWithMunicipality.length > 0 ? recordsWithMunicipality[0].examMunicipality : (student.examMunicipality || "");
           const eventExamLocation = recordsWithLocation.length > 0 ? recordsWithLocation[0].examLocation : (student.examLocation || "");
           
           console.log(`🔍 Auto Final event exam info - Time: "${eventExamTime}", Municipality: "${eventExamMunicipality}", Location: "${eventExamLocation}"`);
          

          
                grouped[key] = {
            id: `${teacherId._id}_${dateKey}`,
                    title: teacherUsername,
                    start: dateKey,
                    color: teacherColor,
                    extendedProps: {
                        teacher: teacherUsername,
                        teacherId: teacherId._id,
                        type: "exam",
              examMunicipality: eventExamMunicipality,
              examLocation: eventExamLocation,
              examTime: eventExamTime,
                        courseName: course.courseName,
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
          paidExamFee,
          examTime,
          examMunicipality,
          examLocation,
                courseName: course.courseName,
          finalExamDate: enrollment.slutprovDate, // Use the enrollment's exam date
            });
        
        console.log(`🔍 Auto - Added student ${student.name} with finalExamDate: ${enrollment.slutprovDate}`);
      } catch (err) {
        console.warn("Fel i enrollmentsWithSlutprov-loopen:", err.message, enrollment);
      }
        }

        console.log("📅 Final grouped events:", Object.keys(grouped).length);
        res.json(Object.values(grouped));
    } catch (err) {
    console.error("❌ Fel vid synk:", err.message, err.stack);
        res.status(500).json({ error: "Kunde inte hämta synkade events." });
    }
});


// GET specific calendar event by ID
router.get("/calendar-events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const event = await CalendarEvent.findById(id);

    if (!event) {
      return res.status(404).json({ error: "Event hittades inte" });
    }

    res.json(event);
  } catch (err) {
    console.error("❌ Fel vid hämtning av event:", err.message);
    res.status(500).json({ error: "Kunde inte hämta event." });
  }
});

// GET attendance data for a specific event (date + teacher)
router.get("/calendar-events/attendance/:date/:teacherId", async (req, res) => {
  try {
    const { date, teacherId } = req.params;
    
    // Handle date conversion properly to avoid timezone issues
    const examDate = new Date(date);
    const dateKey = examDate.getFullYear() + '-' + 
                   String(examDate.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(examDate.getDate()).padStart(2, '0');
    
    const startOfDay = new Date(dateKey + 'T00:00:00.000Z');
    const endOfDay = new Date(dateKey + 'T23:59:59.999Z');
    
    const { default: ExamAttendance } = await import('../models/ExamAttendance.js');
    
    const attendanceRecords = await ExamAttendance.find({
      examDate: { $gte: startOfDay, $lte: endOfDay },
      teacherId: teacherId
    }).select('studentId attended paidExamFee examTime examMunicipality examLocation');
    
    res.json(attendanceRecords);
  } catch (error) {
    console.error('❌ Error fetching attendance data:', error);
    res.status(500).json({ error: 'Failed to fetch attendance data' });
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
const { date, teacherId, students, courseName, courseId,
        examTime: eventExamTime,
        examMunicipality: eventExamMunicipality,
        examLocation: eventExamLocation } = req.body;    
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
    
    // Note: Events are dynamic and not stored in CalendarEvent collection
    // Exam info is stored in ExamAttendance records and retrieved via /calendar-events/syncable
    
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
        
                 console.log(`🔍 Looking for existing attendance record for student ${student._id} on date ${dateKey} with teacher ${teacherId}`);
         let attendanceRecord = await ExamAttendance.findOne({
             examDate: { $gte: startOfDay, $lte: endOfDay },
             teacherId: teacherId,
             studentId: student._id
         });
         
         if (!attendanceRecord) {
           console.log(`🔍 No existing record found, creating new ExamAttendance record`);
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
             paidExamFee: !!student.paidExamFee,
             examTime: (student.examTime || eventExamTime || ''),
             examMunicipality: (student.examMunicipality || eventExamMunicipality || ''),
             examLocation: (student.examLocation || eventExamLocation || ''),
             recordedBy: req.user?._id
           });
           console.log(`🔍 Created new ExamAttendance record:`, {
             examDate: attendanceRecord.examDate,
             teacherId: attendanceRecord.teacherId,
             studentId: attendanceRecord.studentId,
             examTime: attendanceRecord.examTime,
             examMunicipality: attendanceRecord.examMunicipality,
             examLocation: attendanceRecord.examLocation
           });
         } else {
           console.log(`🔍 Found existing record, updating it`);
           // Update existing record
           attendanceRecord.attended = !!student.attended;
           attendanceRecord.paidExamFee = !!student.paidExamFee;
           attendanceRecord.updatedAt = new Date();
           attendanceRecord.updatedBy = req.user?._id;
           // Tillåt event-nivå override om student-fält saknas
           if (student.examTime || eventExamTime)
            attendanceRecord.examTime = student.examTime || eventExamTime;
          if (student.examMunicipality || eventExamMunicipality)
            attendanceRecord.examMunicipality = student.examMunicipality || eventExamMunicipality;
          if (student.examLocation || eventExamLocation)
            attendanceRecord.examLocation = student.examLocation || eventExamLocation;
         }
         
         console.log(`🔍 About to save attendance record...`);
         await attendanceRecord.save();
         console.log(`🔍 Successfully saved attendance record with ID: ${attendanceRecord._id}`);
        console.log(`💾 Saved attendance record: ${attendanceRecord._id} for student ${studentDoc.name} - attended: ${attendanceRecord.attended}`);
        console.log(`💾 Saved examDate: ${attendanceRecord.examDate}`);
        console.log(`💾 Saved teacherId: ${attendanceRecord.teacherId}`);
        console.log(`💾 Saved studentId: ${attendanceRecord.studentId}`);
        
        // Note: Exam info is stored in ExamAttendance records
        // Event-level info is retrieved via /calendar-events/syncable endpoint
        
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
            examTime: student.examTime || eventExamTime || '',
            examMunicipality: student.examMunicipality || eventExamMunicipality || '',
            examLocation: student.examLocation || eventExamLocation || '',
            recordedAt: new Date(),
            recordedBy: req.user?._id
          });
        }

        studentDoc.attendedExam = !!student.attended;
        studentDoc.paidExamFee = !!student.paidExamFee;
        
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
    
    // Note: Events are dynamic and not stored in CalendarEvent collection
    // Exam info is stored in ExamAttendance records and will be retrieved via /calendar-events/syncable
    
    res.json({ 
      message: `Attendance updated for ${successCount} students`, 
      results,
      successCount,
      failureCount
    });
  } catch (err) {
    console.error('❌ Error updating attendance/fee:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


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

export default router;

// --- Student exam instances listing ---
// List all exam instances (manual + course-linked) recorded for a student
router.get('/exams/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { default: ExamAttendance } = await import('../models/ExamAttendance.js');

    const records = await ExamAttendance.find({ studentId })
      .populate('teacherId', 'userId colorCode')
      .populate({ path: 'teacherId.userId', select: 'username' })
      .populate('courseId', 'courseName')
      .sort({ examDate: -1 })
      .lean();

    const items = records.map(r => ({
      id: r._id,
      examDate: r.examDate,
      courseName: r.courseName || r.courseId?.courseName || 'Okänd kurs',
      attended: !!r.attended,
      examTime: r.examTime || '',
      examMunicipality: r.examMunicipality || '',
      examLocation: r.examLocation || '',
      teacher: r.teacherId?.userId?.username || 'Okänd lärare'
    }));

    res.json(items);
  } catch (error) {
    console.error('❌ Failed to list student exams:', error);
    res.status(500).json({ error: 'Failed to list student exams' });
  }
});

// --- Move grouped exams (teacher + date -> newDate) ---
router.put('/calendar-events/move-group', authenticateUser, async (req, res) => {
  try {
    const { teacherId, fromDate, toDate } = req.body;
    if (!teacherId || !fromDate || !toDate) {
      return res.status(400).json({ error: 'Missing teacherId, fromDate or toDate' });
    }

    const fromKey = new Date(fromDate);
    const toKey = new Date(toDate);
    const fromLocal = new Date(fromKey.getFullYear(), fromKey.getMonth(), fromKey.getDate());
    const toLocal = new Date(toKey.getFullYear(), toKey.getMonth(), toKey.getDate());

    // Update enrollments for this teacher on fromDate
    const enrollmentsUpdated = await StudentEnrollment.updateMany(
      {
        teacherId,
        slutprovDate: {
          $gte: new Date(fromLocal.toISOString().split('T')[0] + 'T00:00:00.000Z'),
          $lte: new Date(fromLocal.toISOString().split('T')[0] + 'T23:59:59.999Z')
        }
      },
      { $set: { slutprovDate: toLocal } }
    );

    // Update students with manual finalExamDate for this teacher on fromDate
    const students = await Student.find({
      teacherId,
      finalExamDate: {
        $gte: new Date(fromLocal.toISOString().split('T')[0] + 'T00:00:00.000Z'),
        $lte: new Date(fromLocal.toISOString().split('T')[0] + 'T23:59:59.999Z')
      }
    });
    for (const s of students) {
      s.finalExamDate = toLocal;
      await s.save();
    }

    res.json({
      message: 'Group moved',
      enrollmentsModified: enrollmentsUpdated.modifiedCount,
      studentsModified: students.length
    });
  } catch (error) {
    console.error('❌ Failed to move group:', error);
    res.status(500).json({ error: 'Failed to move group' });
  }
});
