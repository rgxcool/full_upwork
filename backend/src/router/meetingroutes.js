import express from "express";
import { authenticateUser } from '../controllers/authController.js'; // om du har detta
import Meeting from "../models/Meeting.js";


const router = express.Router();

// GET: Alla möten
router.get('/meetings', authenticateUser, async (req, res) => {
    try {
        const { role } = req.user;
        const { page = 1, limit = 100, sort = 'start:desc', bookedBy, studentName } = req.query;

        let query = {};

        // SECURITY: Non-admins can only query their own role's meetings.
        if (role === 'syv' || role === 'specped') {
            query.bookedBy = role;
        } else if ((role === 'admin' || role === 'systemadmin') && bookedBy) {
            // Admins can optionally filter by role.
            query.bookedBy = bookedBy;
        }

        // Add filtering by student name if provided
        if (studentName) {
            query['student.name'] = new RegExp(studentName, 'i');
        }

        const [sortField, sortOrder] = sort.split(':');
        const sortOptions = { [sortField]: sortOrder === 'desc' ? -1 : 1 };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const meetings = await Meeting.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean(); // Use lean for performance

        const total = await Meeting.countDocuments(query);

        res.json({
            data: meetings,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            }
        });
    } catch (err) {
        console.error('❌ Kunde inte hämta möten:', err);
        res.status(500).json({ error: 'Serverfel vid hämtning av möten' });
    }
});

// POST: Skapa nytt möte
router.post('/meetings', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;
        const {
            title,
            start,
            location,
            studentId,
            studentName,
            personalNumber,
            bookedBy,
            info // 👈 Destructure new field
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
            bookedBy,
            info, // 👈 Save the new field
            createdBy: userId,
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

// DELETE /meetings/:id: Add a new, secure endpoint for deleting meetings.
router.delete('/meetings/:id', authenticateUser, async (req, res) => {
    try {
        const { role, userId } = req.user;
        const { id } = req.params;

        const meeting = await Meeting.findById(id);

        if (!meeting) {
            return res.status(404).json({ error: "Möte hittades inte" });
        }

        // AUTHORIZATION: User must be creator or admin.
        const isAdmin = role === 'admin' || role === 'systemadmin';
        const isCreator = meeting.createdBy && meeting.createdBy.toString() === userId.toString();

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: "Behörighet saknas för att radera detta möte" });
        }

        await Meeting.findByIdAndDelete(id);
        res.status(204).send();
    } catch (err) {
        console.error('❌ Kunde inte radera möte:', err);
        res.status(500).json({ error: 'Serverfel vid radering av möte' });
    }
});


export default router;
