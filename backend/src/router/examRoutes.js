import express from "express";
const router = express.Router();
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import mongoose from "mongoose"

//import Exam from "../models/Final.js";
router.get('/calendar-color', async (req, res) => {
    try {
        const students = await Student.find().populate("coursePackages.coursePackageId");
        const teachers = await Teacher.find();
    
        const groupedEvents = {};
    
        students
            .filter(student => !student.dropout) // Exkludera elever med dropout = true
            .forEach(student => {
                const teacher = teachers.find(t => t.name === student.teacher);
                const date = student.finalExamDate; // 🔥 Rätt fältnamn
                const teacherName = teacher?.name || 'Ingen lärare';
                const course = student.coursePackages.map(pkg => pkg.coursePackageId?.name || "Okänd kurs").join(", "); // 🔥 Rätt fält

                const key = `${teacherName}-${date}`; // Gruppnyckel per lärare per datum

                if (!groupedEvents[key]) {
                    groupedEvents[key] = {
                        title: teacherName,
                        start: date,
                        color: teacher?.colorCode || '#cccccc',
                        extendedProps: {
                            teacher: teacherName,
                            students: [],
                        },
                    };
                }

                groupedEvents[key].extendedProps.students.push({
                    name: student.name || "Okänd student",
                    personalNumber: student.personalNumber || "Ingen ID",
                    course,
                });
            });

        const events = Object.values(groupedEvents);
        console.log("✅ Slutliga event:", JSON.stringify(events, null, 2)); // Debug-logg

        res.json(events);
    } catch (error) {
        console.error("❌ Error in /calendar-color:", error.message);
        res.status(500).send("Server error");
    }
});


router.post("/add-exam", async (req, res) => {
    try {
        const { studentId, date } = req.body;

        if (!studentId || !date) {
            return res.status(400).json({ message: "Student ID och datum krävs" });
        }

        // Hämta student
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: "Student ej hittad" });
        }

        // Uppdatera `finalExamDate`
        student.finalExamDate = date;

        await student.save();
        res.status(201).json({ message: "Slutprov tillagt" });
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
