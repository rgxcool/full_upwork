import express from "express";
const router = express.Router();

const Task = require("../models/taskSchema");
const jwt = require("jsonwebtoken"); // Fix: Importera JWT

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    console.log("🔍 Received Authorization Header:", authHeader); // ✅ Debugging

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.error("❌ No token provided or invalid format");
        return res.status(401).json({ message: "Ingen giltig token angiven." });
    }

    const token = authHeader.split(" ")[1]; // Extract token after "Bearer "

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        console.log("🔍 Decoded JWT:", decoded); // ✅ DEBUG: See what the token contains

        req.user = decoded;
        req.userId = decoded.userId || decoded.id; // ✅ Fix: Support `id` as well

        if (!req.userId) {
            console.error("❌ No `userId` found in token payload:", decoded);
            return res
                .status(400)
                .json({ error: "Autentisering saknas (No userId in token)." });
        }

        console.log("✅ Token verified, userId:", req.userId); // ✅ Debugging
        next();
    } catch (error) {
        console.error("❌ JWT-verifieringsfel:", error.message);
        return res.status(401).json({ message: "Ogiltig token." });
    }
};

router.get("/tasks", authenticate, async (req, res) => {
    const tasks = await Task.find({ userId: req.userId });
    res.json(tasks);
});

router.post("/tasks", authenticate, async (req, res) => {
    try {
        const { description } = req.body;

        console.log("🟢 Creating task for userId:", req.userId); // ✅ Debugging

        if (!req.userId) {
            console.error("❌ No userId in request!");
            return res
                .status(400)
                .json({ error: "Autentisering saknas (Missing userId)" });
        }

        if (!description) {
            console.error("❌ No task description!");
            return res.status(400).json({ error: "Beskrivning krävs" });
        }

        const newTask = await Task.create({
            description,
            isDone: false,
            userId: req.userId, // ✅ Ensure this is set correctly
        });

        console.log("✅ New task created:", newTask);
        res.status(201).json(newTask);
    } catch (error) {
        console.error("❌ Error creating task:", error);
        res.status(500).json({ error: "Serverfel vid skapande av uppgift" });
    }
});

router.put("/tasks/:id", authenticate, async (req, res) => {
    const { isDone } = req.body;
    const updatedTask = await Task.findByIdAndUpdate(
        req.params.id,
        { isDone },
        { new: true }
    );
    res.json(updatedTask);
});

router.delete("/tasks/:id", authenticate, async (req, res) => {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: "Uppgift borttagen" });
});

router.delete("/tasks", authenticate, async (req, res) => {
    await Task.deleteMany({ userId: req.userId });
    res.json({ message: "Alla uppgifter borttagna" });
});

export default router;
