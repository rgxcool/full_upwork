import express from "express";
import Meeting from "../models/Meeting.js";

const router = express.Router();

// GET: Alla möten
router.get('/meetings', async (req, res) => {
    const meetings = await Meeting.find();
    res.json(meetings);
});
  
// POST: Skapa nytt möte
router.post('/meetings', async (req, res) => {
    const { title, description, participants, start, end, createdBy } = req.body;
    const meeting = new Meeting({ title, description, participants, start, end, createdBy });
    await meeting.save();
    res.status(201).json(meeting);
  });


export default router;
