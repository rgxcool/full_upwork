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
        // Hämta användare, kurser, studenter och lärare som matchar söktermen
        const users = await User.find({
            $or: [
                { username: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } },
            ],
        }).select("_id username email role");

        const courses = await Course.find({
            name: { $regex: query, $options: "i" },
        }).select("_id name description");

        const students = await Student.find({
            $or: [
                { name: { $regex: query, $options: "i" } },
            ],
        }).select("_id name studentId email");

        const teachers = await Teacher.find({
            $or: [
                { name: { $regex: query, $options: "i" } },
                { email: { $regex: query, $options: "i" } },
            ],
        }).select("_id name email colorCode");

        // Formatera resultaten med en 'type' för att kunna särskilja
        const results = [
            ...users.map((user) => ({
                id: user._id,
                name: user.username,
                type: "Användare",
                extra: user.email,
            })),
            ...courses.map((course) => ({
                id: course._id,
                name: course.name,
                type: "Kurs",
                extra: course.description,
            })),
            ...students.map((student) => ({
                id: student._id,
                name: student.name,
                type: "Elev"            
            })),
            ...teachers.map((teacher) => ({
                id: teacher._id,
                name: teacher.name,
                type: "Lärare",
                extra: teacher.email,
                color: teacher.colorCode, // Kan användas för att visa lärarens färg
            })),
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
            case "Användare":
                result = await User.findById(id).select("-password");
                break;
            case "Kurs":
                result = await Course.findById(id);
                break;
            case "Elev":
                result = await Student.findById(id);
                break;
            case "Lärare":
                result = await Teacher.findById(id).select("-password");
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


export default router;
