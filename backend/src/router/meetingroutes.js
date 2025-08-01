import express from "express";
import { authenticateUser } from '../controllers/authController.js'; // om du har detta
import Meeting from "../models/Meeting.js";


const router = express.Router();

// GET: Alla möten
router.get('/meetings', authenticateUser, async (req, res) => {
  try {
    const { role, userId, personalNumber } = req.user;

    let query = {};

    if (role === 'elev') {
      // Visa endast möten som gäller elevens personnummer
      query = { 'student.personalNumber': personalNumber };
    }

    const meetings = await Meeting.find(query).sort({ start: 1 });
    res.json(meetings);
  } catch (err) {
    console.error('❌ Kunde inte hämta möten:', err);
    res.status(500).json({ error: 'Serverfel vid hämtning av möten' });
  }
});

// POST: Skapa nytt möte
router.post('/meetings', authenticateUser, async (req, res) => {
  try {
    const {
      title,
      start,
      location,
      studentId,
      studentName,
      personalNumber,
      bookedBy // 👈 lägg till här
    } = req.body;

    if (!studentId || !start || !title || !bookedBy) {
      return res.status(400).json({ error: 'Obligatoriska fält saknas' });
    }

    const saved = await new Meeting({
      title,
      start,
      location,
      student: {
        id: studentId,
        name: studentName,
        personalNumber
      },
      bookedBy, // 👈 spara rollen som bokade mötet
      createdAt: new Date()
    }).save();

    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Kunde inte spara möte:', err);
    res.status(500).json({ error: 'Serverfel vid sparande av möte' });
  }
});

// PUT: Uppdatera möte (t.ex. för att ändra datum/tid via drag-n-drop)
router.put('/meetings/:id', authenticateUser, async (req, res) => {
  try {
    const { start } = req.body;
    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { start },
      { new: true }
    );
    if (!meeting) {
      return res.status(404).json({ error: "Möte hittades inte" });
    }
    res.json(meeting);
  } catch (err) {
    console.error('❌ Kunde inte uppdatera möte:', err);
    res.status(500).json({ error: 'Serverfel vid uppdatering av möte' });
  }
});




export default router;
