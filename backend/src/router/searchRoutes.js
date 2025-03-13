import express from "express";
import User from "../models/User.js";
import Course from "../models/Course.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

const router = express.Router();

router.get("/search", async (req, res) => {
    const query = req.query.q;
    if (!query || !query.trim()) {
        return res.status(200).json([]); // Return empty array for empty search query
    }

    try {
        // Hämta användare (övrig personal + lärare)
        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } },
            ],
        }).select("_id username email role");

        // Hämta elever
        const students = await Student.find({
            name: { $regex: query, $options: "i" },
        }).select("_id name email");

        // Filtrera ut lärare och övrig personal baserat på roll
        const teachers = users.filter(user => user.role === "teacher");
        const staff = users.filter(user => ["admin", "systemadmin", "syv", "specped", "coordinator"].includes(user.role));

        // Formatera resultaten med en 'type' för att kunna särskilja
        const results = [
            ...students.map(student => ({
                id: student._id,
                name: student.name,
                type: "Elev",
                extra: student.email
            })),
            ...teachers.map(teacher => ({
                id: teacher._id,
                name: teacher.username,
                type: "Lärare",
                extra: teacher.email
            })),
            ...staff.map(person => ({
                id: person._id,
                name: person.username,
                type: "Personal",
                extra: person.email
            }))
        ];

        res.json(results);
    } catch (error) {
        console.error("❌ Search error:", error);
        res.status(500).json({ message: "Server error during search." });
    }
});


router.get("/details/:type/:id", async (req, res) => {
    const { type, id } = req.params;

    try {
        let result;

        switch (type) {
            case "Elev":
                result = await Student.findById(id)
                    .populate("program")
                    .populate("teacher", "name email")
                    .select("-__v"); // Exkludera metadata
                break;
            case "Lärare":
                result = await User.findById(id)
                    .select("username email role")
                    .where("role").equals("teacher"); // Säkerställer att endast lärare hämtas
                break;
            case "Personal":
                result = await User.findById(id)
                    .select("username email role")
                    .where("role").in(["admin", "systemadmin", "syv", "specped", "coordinator"]); // Hämtar personal
                break;
            default:
                return res.status(400).json({ message: "Ogiltig typ av objekt" });
        }

        if (!result) {
            return res.status(404).json({ message: "Objektet hittades inte" });
        }

        res.json(result);
    } catch (error) {
        console.error("❌ Fetch details error:", error);
        res.status(500).json({ message: "Serverfel vid hämtning av detaljer" });
    }
});



router.put("/update-student/:id", async (req, res) => {
    try {
        const updatedStudent = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedStudent);
    } catch (error) {
        console.error("❌ Error updating student:", error);
        res.status(500).json({ message: "Kunde inte uppdatera studenten" });
    }
});


router.put("/student/:id", async (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;

    try {
        const student = await Student.findByIdAndUpdate(id, updatedData, { new: true });

        if (!student) {
            return res.status(404).json({ message: "Studenten hittades inte" });
        }

        res.json(student);
    } catch (error) {
        console.error("❌ Fel vid uppdatering av student:", error);
        res.status(500).json({ message: "Serverfel vid uppdatering av student" });
    }
});


export default router;
