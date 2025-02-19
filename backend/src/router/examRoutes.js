import express from "express";
const router = express.Router();
import Student from "../models/Student.js";
//import Teacher from "../models/Teacher.js";
//import Exam from "../models/Final.js";

router.get("/calendar-color", async (req, res) => {
    try {
        console.log("🟡 Fetching final exam dates from students...");

        // Hämta endast studenter som har ett slutprovsdatum
        const students = await Student.find({ finalExamDate: { $exists: true, $ne: null } })
            .populate("teacher", "name colorCode")
            .populate("courses.courseId", "courseName");

        console.log("✅ Final exam dates fetched:", students);

        let exams = [];

        students.forEach(student => {
            exams.push({
                id: student._id,
                title: `${student.teacher?.name || "Okänd lärare"} - Slutprov`,
                start: student.finalExamDate,
                color: student.teacher?.colorCode || "#CCCCCC",
                extendedProps: {
                    student: student.name,
                    courses: student.courses.map(c => c.courseId?.courseName || "Okänd kurs"),
                    exam: student.exam,
                },
            });
        });

        if (exams.length === 0) {
            return res.status(404).json({ message: "Inga prov hittades." });
        }

        res.json(exams);
    } catch (error) {
        console.error("❌ Error in /calendar-color:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
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



router.delete("/delete-exam/:studentId", async (req, res) => {
    try {
        const { studentId } = req.params;

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: "Student ej hittad" });
        }

        // Sätt `finalExamDate` till null
        student.finalExamDate = null;

        await student.save();
        res.json({ message: "Slutprov raderat" });
    } catch (error) {
        console.error("❌ Error deleting exam:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});


router.put("/update-exam/:studentId", async (req, res) => {
    try {
        const { studentId } = req.params;
        const { date } = req.body;

        console.log("📌 PUT-request mottagen:", { studentId, date });

        if (!date) {
            return res.status(400).json({ message: "Datum krävs" });
        }

        const student = await Student.findById(studentId);
        if (!student) {
            console.error("❌ Student ej hittad med ID:", studentId);
            return res.status(404).json({ message: "Student ej hittad" });
        }

        student.finalExamDate = date;
        await student.save();

        console.log("✅ Slutprov uppdaterat i databasen:", student.finalExamDate);

        res.json({ message: "Slutprov uppdaterat", finalExamDate: student.finalExamDate });
    } catch (error) {
        console.error("❌ Error updating exam:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});


export default router;
