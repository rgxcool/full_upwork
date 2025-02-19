import { Router } from "express";
import Task from "../models/Task.js";
import { authenticateUser } from "../controllers/authController.js"; // ✅ Fixed middleware import

const router = Router();

/**
 * ✅ Fetch All Tasks (Only for the Authenticated User)
 */
router.get("/task/", authenticateUser, async (req, res) => {
    console.log("GET /api/task hit!"); // Debugging

    try {
        const tasks = await Task.find({ userId: req.user.userId }).lean();
        res.json(tasks);
    } catch (error) {
        console.error("❌ Error fetching tasks:", error);
        res.status(500).json({ error: "Serverfel vid hämtning av uppgifter." });
    }
});

/**
 * ✅ Create a New Task
 */
router.post("/task/", authenticateUser, async (req, res) => {
    try {
        const { description } = req.body;

        if (
            !description ||
            typeof description !== "string" ||
            description.trim() === ""
        ) {
            return res.status(400).json({ error: "Beskrivning krävs" });
        }

        const newTask = await Task.create({
            description: description.trim(),
            isDone: false,
            userId: req.user.userId, // ✅ Fixed userId reference
        });

        console.log("✅ New task created:", newTask);
        res.status(201).json(newTask);
    } catch (error) {
        console.error("❌ Error creating task:", error);
        res.status(500).json({ error: "Serverfel vid skapande av uppgift." });
    }
});

/**
 * ✅ Update a Task by ID (Only if Task Belongs to User)
 */
router.put("/task/:id", authenticateUser, async (req, res) => {
    try {
        const { isDone } = req.body;

        if (typeof isDone !== "boolean") {
            return res
                .status(400)
                .json({ error: "Ogiltigt värde för isDone." });
        }

        const updatedTask = await Task.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.userId }, // ✅ Ensuring the task belongs to the user
            { isDone },
            { new: true }
        );

        if (!updatedTask) {
            return res.status(404).json({
                error: "Uppgift hittades inte eller du har inte behörighet.",
            });
        }

        res.json(updatedTask);
    } catch (error) {
        console.error("❌ Error updating task:", error);
        res.status(500).json({
            error: "Serverfel vid uppdatering av uppgift.",
        });
    }
});

/**
 * ✅ Delete a Single Task by ID (Only if Task Belongs to User)
 */
router.delete("/task/:id", authenticateUser, async (req, res) => {
    try {
        console.log(`🛠 Attempting to delete task with ID: ${req.params.id}`); // Debugging

        const deletedTask = await Task.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.userId, // ✅ Ensure the user owns the task
        });

        if (!deletedTask) {
            return res.status(404).json({
                error: "Uppgift hittades inte eller du har inte behörighet att radera den.",
            });
        }

        console.log(`✅ Task deleted: ${deletedTask._id}`);
        res.json({ message: "Uppgift borttagen", taskId: req.params.id });
    } catch (error) {
        console.error("❌ Error deleting task:", error);
        res.status(500).json({
            error: "Serverfel vid borttagning av uppgift.",
        });
    }
});

/**
 * ✅ Delete All Tasks Belonging to the User
 */
router.delete("/task/all", authenticateUser, async (req, res) => {
    try {
        const result = await Task.deleteMany({ userId: req.user.userId });
        res.json({
            message: "Alla uppgifter borttagna",
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        console.error("❌ Error deleting all tasks:", error);
        res.status(500).json({
            error: "Serverfel vid borttagning av uppgifter.",
        });
    }
});

export default router;
