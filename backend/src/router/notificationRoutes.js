import express from "express";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
const router = express.Router();

// === backend/routes/notificationRoutes.js ===
// === routes/notificationRoutes.js ===

// routes/notificationRoutes.js
router.get("/notifications", async (req, res) => {
  try {
    const notes = await Notification.find({ resolved: false });
    res.json(notes);
  } catch (err) {
    console.error('Fel vid hämtning av notiser:', err);
    res.status(500).json({ message: 'Serverfel' });
  }
});

  
  
// Markera individuellt åtgärdsnotis som klar
router.put("/notifications/:id/resolve", async (req, res) => {
  const note = await Notification.findById(req.params.id);
  if (!note) return res.status(404).send("Notis hittades inte");

  note.resolved = true;
  note.resolvedBy = req.body.userId; // valfritt
  await note.save();

  // Uppdatera globalnotis-status
  await evaluateActionPlanStatusAndNotify();

  res.json({ message: "Notis markerad som hanterad", note });
});


router.put("/notifications/:id/reset", async (req, res) => {
    try {
      const note = await Notification.findById(req.params.id);
      if (!note) return res.status(404).send("Notis hittades inte");
  
      note.resolved = false;
      note.resolvedBy = null;
      await note.save();
  
      res.json({ message: "Notis återställd", note });
    } catch (err) {
      console.error("🔴 Fel vid återställning av notis:", err.message);
      res.status(500).send("Serverfel");
    }
  });
  
  
  
  export default router;
  

  

