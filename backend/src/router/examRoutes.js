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
                console.log("📌 Student Exam Data:", student);

                const teacher = teachers.find(t => t.name === student.teacher);
                const date = student.finalExamDate.toISOString().split("T")[0]; // 🟢 Konvertera till YYYY-MM-DD format
                const teacherName = teacher?.name || 'Unknown teacher';

                const examTime = student.examTime || "No exam time";
                const examMunicipality = student.examMunicipality || "Unknown exam municipality";
                const examLocation = student.examLocation || "Unknown exam Location";
                const course = student.coursePackages.map(pkg => pkg.coursePackageId?.name || "Okänd kurs").join(", ");

                console.log("📌 Extracted exam data:", { date, examTime, examMunicipality, examLocation });

                // ✅ Gruppnyckel per lärare och datum
                const key = `${teacherName}-${date}`;

                if (!groupedEvents[key]) {
                    groupedEvents[key] = {
                        title: `${teacherName} - ${examMunicipality} (${examTime})`,
                        start: date,
                        color: teacher?.colorCode || '#cccccc',
                        extendedProps: {
                            teacher: teacherName,
                            examMunicipality,
                            examLocation,
                            examTime,
                            students: [],
                        },
                    };
                }

                // ✅ Lägg endast till elever kopplade till det specifika eventet
                groupedEvents[key].extendedProps.students.push({
                    _id: student._id,
                    name: student.name || "Unknown student",
                    personalNumber: student.personalNumber || "No personal number",
                    examLocation,
                    examTime,
                    course,
                    attended: student.attendedExam || false,
                });
            });

        const events = Object.values(groupedEvents);
        console.log("✅ Slutliga event:", JSON.stringify(events, null, 2));

        res.json(events);
    } catch (error) {
        console.error("❌ Error in /calendar-color:", error.message);
        res.status(500).send("Server error");
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
