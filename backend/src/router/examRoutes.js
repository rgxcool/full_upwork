import express from "express";
const router = express.Router();
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

//import Exam from "../models/Final.js";
router.get('/calendar-color', async (req, res) => {
    try {
        const students = await Student.find().populate("coursePackages.coursePackageId");
        const teachers = await Teacher.find();

        const groupedEvents = {};

        students
            .filter(student => !student.dropout && student.finalExamDate)
            .forEach(student => {
                const teacher = teachers.find(t => t.name === student.teacher);

                // 🟢 Konvertera till svensk tid (CET/CEST)
                const date = new Date(student.finalExamDate);
                date.setHours(date.getHours() + 1);  // 🕐 Justera +1 timme till CET
                const formattedDate = date.toISOString().split("T")[0];

                const teacherName = teacher?.name || 'Unknown teacher';
                const key = `${teacherName}-${formattedDate}`;

                if (!groupedEvents[key]) {
                    groupedEvents[key] = {
                        _id: student._id.toString(),
                        title: `${teacherName}`,
                        start: formattedDate,
                        color: teacher?.colorCode || '#cccccc',
                        extendedProps: {
                            teacher: teacherName,
                            examMunicipality: student.examMunicipality || "Unknown",
                            examLocation: student.examLocation || "Unknown",
                            examTime: student.examTime || "No exam time",
                            students: [],
                        },
                    };
                }

                groupedEvents[key].extendedProps.students.push({
                    _id: student._id.toString(),
                    name: student.name || "Unknown student",
                    personalNumber: student.personalNumber || "No personal number",
                    attended: student.attendedExam || false,
                    additionalInfo: student.additionalInfo || "",
                });
            });

        res.json(Object.values(groupedEvents));

    } catch (error) {
        console.error("❌ Error in /calendar-color:", error.message);
        res.status(500).send("Server error");
    }
});



router.put('/update-exam/:id', async (req, res) => {
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
  



router.post("/add-exam", async (req, res) => {
    try {
        console.log("📌 API /add-exam anropad! Data mottagen:", req.body);

        const { studentIds, examTime, examMunicipality, examLocation } = req.body;

        if (!studentIds || studentIds.length === 0 || !examTime || !examMunicipality || !examLocation) {
            return res.status(400).json({ message: "Student IDs, exam time, municipality, and location are required" });
        }

        // ✅ Lägg till $set för att säkerställa att vi uppdaterar rätt fält
        const result = await Student.updateMany(
            { _id: { $in: studentIds } },
            { 
                $set: {
                    examTime,  
                    examMunicipality,
                    examLocation
                }
            }
        );

        console.log("📌 MongoDB Update Result:", result); // 🔥 Logga vad som faktiskt uppdateras

        // ✅ Hämta uppdaterade studenter och logga
        const updatedStudents = await Student.find({ _id: { $in: studentIds } });
        console.log("📌 Studenter efter uppdatering:", updatedStudents);

        res.status(201).json({ message: "Exam time and location added" });
    } catch (error) {
        console.error("❌ Error adding exam:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});



router.put("/mark-attendance/:personalNumber", async (req, res) => {
    try {
        const { personalNumber } = req.params;

        // 🔍 Hitta studenten baserat på personnumret
        const student = await Student.findOne({ personalNumber });

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
      res.status(200).json({ message: "Provinfo uppdaterad", updatedCount: result.modifiedCount });
    } catch (error) {
      console.error("❌ Fel vid uppdatering av exam:", error.message);
      res.status(500).json({ message: "Serverfel", error: error.message });
    }
  });
  



export default router;
