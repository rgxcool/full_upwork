import { Router } from "express";
import Task from "../models/Task.js";
import authenticate from "../middleware/authMiddleware.js"; // ✅ Import middleware

const router = Router();

/**
 * Route: GET /
 * Get all tasks for the authenticated user.
 */
router.get("/", authenticate, async (req, res) => {
    // ✅ Fix: Use "/" instead of "/"
    console.log("✅ GET /api/ hit!"); // ✅ Debugging
    try {
        const tasks = await Task.find({ userId: req.userId }).lean();
        res.json(tasks);
    } catch (error) {
        console.error("❌ Error fetching tasks:", error);
        res.status(500).json({ error: "Serverfel vid hämtning av uppgifter." });
    }
});

/**
 * Route: POST /
 * Create a new task for the authenticated user.
 */
router.post("/", authenticate, async (req, res) => {
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
            userId: req.userId,
        });

        console.log("✅ New task created:", newTask);
        res.status(201).json(newTask);
    } catch (error) {
        console.error("❌ Error creating task:", error);
        res.status(500).json({ error: "Serverfel vid skapande av uppgift." });
    }
});

/**
 * Route: PUT //:id
 * Update task status (only if the task belongs to the authenticated user).
 */
router.put("/:id", authenticate, async (req, res) => {
    try {
        const { isDone } = req.body;

        if (typeof isDone !== "boolean") {
            return res
                .status(400)
                .json({ error: "Ogiltigt värde för isDone." });
        }

        const updatedTask = await Task.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId }, // Ensuring the task belongs to the user
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
 * Route: DELETE //:id
 * Delete a single task (only if the task belongs to the authenticated user).
 */
router.delete("/:id", authenticate, async (req, res) => {
    try {
        console.log(`🛠 Attempting to delete task with ID: ${req.params.id}`); // ✅ Debugging

        const deletedTask = await Task.findOneAndDelete({
            _id: req.params.id,
            userId: req.userId, // Ensure the user owns the task
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
 * Route: DELETE /
 * Delete all tasks for the authenticated user.
 */
router.delete("/", authenticate, async (req, res) => {
    try {
        const result = await Task.deleteMany({ userId: req.userId });
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
