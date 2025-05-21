import express from "express";
const router = express.Router();
import Teacher from "../models/Teacher.js";

//Generate Random Color for the colorCode in TeacherProfile
function generateRandomColor() {
    return `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0")}`;
}


// Get all teachers
router.get("/teachers", async (req, res) => {
    try {
        const teachers = await Teacher.find();
        res.status(200).json(teachers);
    } catch (error) {
        console.error("Error fetching teachers:", error.message);
        res.status(500).json({ error: "Failed to fetch teachers." });
    }
});

//Post Teacher
router.post("/teacher", async (req, res) => {
    console.log("Incoming request body:", req.body);

    try {
        const { name, email, colorCode } = req.body;

        // Kontrollera att namn och e-post finns
        if (!name || !email) {
            return res
                .status(400)
                .json({ error: "Name and email are required." });
        }

        // Kontrollera om en lärare med samma e-post redan finns
        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res
                .status(409)
                .json({ error: "A teacher with this email already exists." });
        }

        // Skapa ny lärare om ingen matchande post hittas
        const teacher = new Teacher({
            name,
            email,
            colorCode: colorCode || generateRandomColor(),
        });

        const savedTeacher = await teacher.save();
        res.status(201).json({
            message: "Teacher added successfully",
            data: savedTeacher,
        });
    } catch (error) {
        console.error("Error saving teacher:", error.message);
        res.status(500).json({ error: "Failed to save teacher." });
    }
});

export default router;
