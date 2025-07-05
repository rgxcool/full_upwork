import express from "express";
const router = express.Router();
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Exam from "../models/Provning.js";
import CalendarEvent from "../models/Event.js"

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
          return res.status(400).json({ error: "Ogiltigt datum för accept" });
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

      case "move":
        const newRequestedMonth = getNextMonth(exam.requestedMonth);
        if (!newRequestedMonth) {
          return res.status(400).json({ error: "Ogiltigt månad för flytt" });
        }
        updateData.status = "moved";
        updateData.requestedMonth = newRequestedMonth;
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
    const exam = new Exam(req.body);
    const savedExam = await exam.save();
    res.status(201).json(savedExam);
  } catch (err) {
    console.error("Error saving exam:", err.message);
    res.status(500).json({ error: "Failed to register exam." });
  }
});

router.get("/exams", async (req, res) => {
  try {
    const exams = await Exam.find().populate("teacherId", "name");

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
      if (!exam.requestedMonth || !exam.teacherId || exam.status !== "intresse")
        continue;

      const monthIndex = months.indexOf(exam.requestedMonth);
      if (monthIndex === -1) continue;

      const endOfMonth = new Date(currentYear, monthIndex + 1, 0); // sista dagen i månaden
      const diffDays = Math.ceil((endOfMonth - now) / (1000 * 60 * 60 * 24));

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
    const students = await Student.find({
      finalExamDate: { $ne: null },
      dropout: { $ne: true },
    }).populate({
      path: "teacherId",
      populate: { path: "userId", select: "username" },
    });

    const grouped = {};

    students.forEach((student) => {
      const dateKey = student.finalExamDate.toISOString().split("T")[0];
      const teacher = student.teacherId;

      if (!teacher || !teacher.userId) return;

      const key = `${teacher._id}_${dateKey}`;

      if (!grouped[key]) {
        grouped[key] = {
          title: teacher.userId.username,
          start: new Date(student.finalExamDate),
          color: teacher.colorCode || "#999999",
          extendedProps: {
            teacher: teacher.userId.username,
            teacherId: teacher._id,
            type: "exam",
            examMunicipality: student.examMunicipality || "",
            examLocation: student.examLocation || "",
            examTime: student.examTime || "",
            students: [],
          },
        };
      }

      grouped[key].extendedProps.students.push({
        _id: student._id,
        name: student.name,
        personalNumber: student.personalNumber,
        additionalInfo: student.additionalInfo || "",
        attended: student.attendedExam || false,
      });
    });

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

export default router;
