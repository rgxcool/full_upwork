import express from "express";
const router = express.Router();
import Student from "../models/elevSchema";
import Teacher from "../models/Teacher.js";

router.get("/calender-color", async (req, res) => {
    try {
        const students = await Student.find();
        const teachers = await Teacher.find();

        const groupedEvents = {};

        students
            .filter((student) => !student.dropout) // Filtrera bort elever med dropout = true
            .forEach((student) => {
                const teacher = teachers.find(
                    (t) => t.name.split(" ")[0] === student.teacher
                );
                const date = student.slutprovDatum;
                const teacherName = teacher?.name || "Ingen lärare";
                const course = student.kurspaket;
                const key = `${teacherName}-${date}`; // Gruppnyckel per lärare per datum

                if (!groupedEvents[key]) {
                    groupedEvents[key] = {
                        title: teacherName,
                        start: date,
                        color: teacher?.colorCode || "#cccccc",
                        extendedProps: {
                            teacher: teacherName,
                            students: [],
                        },
                    };
                }

                groupedEvents[key].extendedProps.students.push({
                    name: student.namn,
                    id: student.personnummer,
                    course,
                });
            });

        const events = Object.values(groupedEvents);

        res.json(events);
    } catch (error) {
        console.error("Error in /events:", error.message);
        res.status(500).send("Server error");
    }
});

export default router;
