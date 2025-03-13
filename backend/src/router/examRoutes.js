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
                        title: `${teacherName} - ${student.examMunicipality} (${student.examTime})`,
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
    const { date } = req.body;

    if (!id || id.length !== 24) {
        return res.status(400).json({ error: "Invalid student ID" });
    }

    try {
        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // 🔥 Se till att vi alltid sparar i **midnatt UTC**
        const newDate = new Date(date);
        newDate.setUTCHours(0, 0, 0, 0);  // 🕛 Sätter exakt midnatt i UTC

        // 🟢 Uppdatera alla studenter som hade samma datum
        const updatedStudents = await Student.updateMany(
            { finalExamDate: student.finalExamDate }, 
            { $set: { finalExamDate: newDate } }
        );

        console.log(`✅ Uppdaterade ${updatedStudents.modifiedCount} studenter från ${student.finalExamDate} till ${newDate.toISOString()}`);

        res.json({ message: "Exam date updated", updatedStudents });

    } catch (error) {
        console.error("❌ Error updating exam:", error);
        res.status(500).json({ error: "Server error", details: error.message });
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
        student.attendedExam = true;
        await student.save();

        console.log("✅ Attendance marked for:", student);
        res.json({ message: "Attendance marked", student });
    } catch (error) {
        console.error("❌ Error marking attendance:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});



export default router;
