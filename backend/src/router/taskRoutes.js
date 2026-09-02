import { Router } from "express";
import Task from "../models/Task.js";
import { authenticateUser } from "../controllers/authController.js";
import { syncTaskReminderForUser } from "../services/taskReminderScan.js";
import logger from "../utils/logger.js";

const router = Router();

const syncReminder = async (userId) => {
    try {
        await syncTaskReminderForUser(userId);
    } catch (err) {
        logger.warn({ err, userId: String(userId) }, "Task reminder sync skipped (non-fatal)");
    }
};

/**
 * ✅ Fetch All Tasks (Only for the Authenticated User)
 */
router.get("/task/", authenticateUser, async (req, res) => {
  logger.debug("GET /api/task hit!")

  try {
    const tasks = await Task.find({ userId: req.userId }).lean();
    res.json(tasks);
  } catch (error) {
    logger.error({ err: error }, "Error fetching tasks")
    res.status(500).json({ error: "Serverfel vid hämtning av uppgifter." });
  }
});

/**
 * ✅ Create a New Task
 */
router.post("/task/", authenticateUser, async (req, res) => {
  try {
    const { description, dueDate, dueTime } = req.body;

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
      userId: req.userId, // ✅ Fixed userId reference
      dueDate: dueDate || null,
      dueTime: dueTime || null,
    });

    logger.info({ newTask }, "New task created")
    res.status(201).json(newTask);
    void syncReminder(req.userId);
  } catch (error) {
    logger.error({ err: error }, "Error creating task")
    res.status(500).json({ error: "Serverfel vid skapande av uppgift." });
  }
});

/**
 * ✅ Update a Task by ID (Only if Task Belongs to User)
 */
router.put("/task/:id", authenticateUser, async (req, res) => {
  try {
    const { isDone, description, dueDate, dueTime } = req.body;

    if (isDone !== undefined && typeof isDone !== "boolean") {
      return res.status(400).json({ error: "Ogiltigt värde för isDone." });
    }

    if (
      description !== undefined &&
      (typeof description !== "string" || description.trim() === "")
    ) {
      return res.status(400).json({ error: "Beskrivning krävs" });
    }

    const updates = {};
    if (isDone !== undefined) updates.isDone = isDone;
    if (description !== undefined) updates.description = description.trim();
    if (dueDate !== undefined) updates.dueDate = dueDate || null;
    if (dueTime !== undefined) updates.dueTime = dueTime || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Inga fält att uppdatera." });
    }

    const updatedTask = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId }, // ✅ Ensuring the task belongs to the user
      updates,
      { new: true }
    );

    if (!updatedTask) {
      return res.status(404).json({
        error: "Uppgift hittades inte eller du har inte behörighet.",
      });
    }

    res.json(updatedTask);
    void syncReminder(req.userId);
  } catch (error) {
    logger.error({ err: error }, "Error updating task")
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
    logger.debug({ taskId: req.params.id }, "Attempting to delete task")

    const deletedTask = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId, // ✅ Ensure the user owns the task
    });

    if (!deletedTask) {
      return res.status(404).json({
        error:
          "Uppgift hittades inte eller du har inte behörighet att radera den.",
      });
    }

    logger.info({ taskId: deletedTask._id }, "Task deleted")
    res.json({ message: "Uppgift borttagen", taskId: req.params.id });
    void syncReminder(req.userId);
  } catch (error) {
    logger.error({ err: error }, "Error deleting task")
    res.status(500).json({
      error: "Serverfel vid borttagning av uppgift.",
    });
  }
});

/**
 * ✅ Delete All Tasks Belonging to the User
 */
router.delete("/delalltasks", authenticateUser, async (req, res) => {
  try {
    const result = await Task.deleteMany({ userId: req.userId });
    res.json({
      message: "Alla uppgifter borttagna",
      deletedCount: result.deletedCount,
    });
    void syncReminder(req.userId);
  } catch (error) {
    logger.error({ err: error }, "Error deleting all tasks")
    res.status(500).json({
      error: "Serverfel vid borttagning av uppgifter.",
    });
  }
});

export default router;
