import express from "express";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
import Teacher from "../models/Teacher.js";
import { authenticateUser } from "../controllers/authController.js";
const router = express.Router();

import { evaluateActionPlanStatusAndNotify } from "../controllers/notificationController.js";



router.get("/notifications", authenticateUser, async (req, res) => {
  try {
    let query = { resolved: false };
    
    // If user is a teacher, filter notifications by their teacherId
    if (req.user.role === "teacher") {
      // Find the teacher record for this user
      const teacher = await Teacher.findOne({ userId: req.user.userId });
      
      if (!teacher) {
        return res.status(403).json({ error: "Teacher profile not found" });
      }
      
      // Filter notifications by this teacher's ID
      query.teacher = teacher._id;
      console.log(`🔍 Teacher ${teacher._id} fetching their notifications`);
    }
    
    const notes = await Notification.find(query);

    const uniqueNotes = [];
    const seenTypes = new Set();
    const seenDropouts = new Set();

    for (const note of notes) {
      if (['action_plan_required', 'grades_pending'].includes(note.type)) {

        if (!seenTypes.has(note.type)) {
          uniqueNotes.push(note);
          seenTypes.add(note.type);
        }
      } else if (note.type === 'dropout') {
        const studentId = note.meta.studentId.toString();
        if (!seenDropouts.has(studentId)) {
          uniqueNotes.push(note);
          seenDropouts.add(studentId);
        }
      } else {
        uniqueNotes.push(note);
      }
    }

    res.json(uniqueNotes);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
/*

  
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
*/

router.put('/notifications/resolve/:studentId', async (req, res) => {
  try {
    const studentId = req.params.studentId;
    await Notification.updateMany(
      { studentId: studentId, type: 'action_plan_required', resolved: false },
      { $set: { resolved: true } }
    );
    res.status(200).json({ message: 'Notification resolved' });
  } catch (error) {
    res.status(500).json({ message: 'Error resolving notification', error });
  }
});


router.put("/notifications/:id/resolve", async (req, res) => {
  try {
    const note = await Notification.findById(req.params.id);
    
    if (!note) {
      return res.status(404).send("Notis hittades inte");
    }

    // Uppdatera notisen
    note.resolved = true;
    note.resolvedBy = req.body.userId; // valfritt
    note.resolvedAt = new Date();
    await note.save();

    // Utvärdera och uppdatera global status
    await evaluateActionPlanStatusAndNotify(note.studentId, note.courseId);

    res.json({ 
      message: "Notis markerad som hanterad", 
      note 
    });
  } catch (error) {
    console.error('Fel vid lösning av notifikation:', error)
    res.status(500).json({ 
      message: 'Serverfel vid lösning av notifikation', 
      error: error.message 
    });
  }
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
  

  

