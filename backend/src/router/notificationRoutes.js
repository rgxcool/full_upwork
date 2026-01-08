import express from "express";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
import Teacher from "../models/Teacher.js";
import { authenticateUser } from "../controllers/authController.js";
const router = express.Router();

import { evaluateActionPlanStatusAndNotify } from "../controllers/notificationController.js";



router.get("/notifications", authenticateUser, async (req, res) => {
  try {
    // Exclude notifications that this user has already resolved
    // Use $nin (not in) to exclude notifications where current user is in resolvedByUsers array
    const mongoose = (await import("mongoose")).default;
    const userId = mongoose.Types.ObjectId.isValid(req.user.userId) 
      ? new mongoose.Types.ObjectId(req.user.userId) 
      : req.user.userId;
    
    // Query: notifications not resolved by this user
    // $nin works even if resolvedByUsers doesn't exist or is null
    let query = { 
      resolvedByUsers: { $nin: [userId] }
    };
    
    // If user is an admin, only show notifications they created (for dropout notifications)
    if (["admin", "systemadmin"].includes(req.user.role)) {
      // For dropout notifications, only show those created by this admin
      // For other notification types, show all (existing behavior)
      query.$or = [
        { type: { $ne: "dropout" } }, // Show all non-dropout notifications
        { 
          type: "dropout",
          createdByAdmin: userId // Only show dropout notifications created by this admin
        }
      ];
      console.log(`🔍 Admin ${req.user.userId} (${req.user.name || req.user.username}) fetching notifications`);
      console.log(`   - Will only show dropout notifications created by this admin`);
    }
    
    // If user is a teacher, filter notifications by their teacherId
    if (req.user.role === "teacher") {
      // Find the teacher record for this user
      const teacher = await Teacher.findOne({ userId: req.user.userId });
      
      if (!teacher) {
        console.log(`⚠️ No Teacher record found for user ${req.user.userId} (${req.user.name || req.user.username})`);
        return res.status(403).json({ error: "Teacher profile not found" });
      }
      
      // Filter notifications by this teacher's ID - ensure it's an ObjectId
      const mongoose = (await import("mongoose")).default;
      // Convert teacher._id to ObjectId for consistent comparison
      const teacherObjectId = mongoose.Types.ObjectId.isValid(teacher._id) 
        ? new mongoose.Types.ObjectId(teacher._id) 
        : teacher._id;
      
      query.teacher = teacherObjectId;
      
      console.log(`🔍 Teacher ${teacher._id.toString()} (user: ${req.user.userId}) fetching notifications`);
      console.log(`   - Query teacher field:`, query.teacher.toString());
      console.log(`   - Query teacher type:`, query.teacher.constructor.name);
      console.log(`   - Query object:`, JSON.stringify(query, null, 2));
      
      // Debug: Check all dropout notifications to see what teacher IDs they have
      const allDropoutNotifications = await Notification.find({ 
        type: "dropout", 
        resolvedByUsers: { $nin: [userId] } // Not resolved by this user
      });
      console.log(`🔍 All dropout notifications in DB (${allDropoutNotifications.length}):`);
      for (let idx = 0; idx < allDropoutNotifications.length; idx++) {
        const note = allDropoutNotifications[idx];
        console.log(`   ${idx + 1}. ID: ${note._id}, Teacher: ${note.teacher ? note.teacher.toString() : 'MISSING'}, Student: ${note.meta?.studentId ? note.meta.studentId.toString() : 'MISSING'}`);
        if (note.teacher) {
          const noteTeacherStr = note.teacher.toString();
          const queryTeacherStr = query.teacher.toString();
          const match = noteTeacherStr === queryTeacherStr;
          console.log(`      Match check: "${noteTeacherStr}" === "${queryTeacherStr}" ? ${match}`);
          
          // Try direct query for this specific notification
          if (match) {
            const directQuery = await Notification.findOne({
              _id: note._id,
              teacher: query.teacher,
              resolved: false
            });
            console.log(`      Direct query for this notification: ${directQuery ? 'FOUND' : 'NOT FOUND'}`);
          }
        }
      }
    }
    
    // Execute query with explicit ObjectId casting for teacher field if present
    if (query.teacher) {
      // Try query with explicit ObjectId comparison
      const mongoose = (await import("mongoose")).default;
      const notesWithExplicitId = await Notification.find({
        ...query,
        teacher: mongoose.Types.ObjectId.isValid(query.teacher) 
          ? new mongoose.Types.ObjectId(query.teacher) 
          : query.teacher
      });
      console.log(`📬 Query with explicit ObjectId casting found ${notesWithExplicitId.length} notifications`);
      
      // Also try with string comparison as fallback
      const notesWithStringMatch = await Notification.find({
        resolvedByUsers: { $nin: [userId] },
        teacher: { $eq: query.teacher.toString() }
      });
      console.log(`📬 Query with string match found ${notesWithStringMatch.length} notifications`);
    }
    
    const notes = await Notification.find(query);
    console.log(`📬 Found ${notes.length} notifications matching query`);
    console.log(`   - Query used:`, JSON.stringify(query, null, 2));
    notes.forEach((note, idx) => {
      console.log(`   ${idx + 1}. Type: ${note.type}, Teacher: ${note.teacher ? note.teacher.toString() : 'MISSING'}, Student: ${note.meta?.studentId ? note.meta.studentId.toString() : 'MISSING'}, Resolved: ${note.resolved}`);
      if (query.teacher && note.teacher) {
        const noteTeacherId = note.teacher.toString();
        const queryTeacherId = query.teacher.toString();
        const match = noteTeacherId === queryTeacherId;
        console.log(`      Teacher ID match: "${noteTeacherId}" === "${queryTeacherId}" ? ${match}`);
      }
    });

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
        // For dropout notifications, use notification ID to ensure uniqueness
        // This prevents showing multiple notifications for the same student
        const noteId = note._id.toString();
        if (!seenDropouts.has(noteId)) {
          uniqueNotes.push(note);
          seenDropouts.add(noteId);
        }
      } else {
        uniqueNotes.push(note);
      }
    }
    
    console.log(`📋 After deduplication: ${uniqueNotes.length} unique notifications`);

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


router.put("/notifications/:id/resolve", authenticateUser, async (req, res) => {
  try {
    const note = await Notification.findById(req.params.id);
    
    if (!note) {
      return res.status(404).send("Notis hittades inte");
    }

    // Add current user to resolvedByUsers array (per-user resolution)
    const mongoose = (await import("mongoose")).default;
    const userId = mongoose.Types.ObjectId.isValid(req.user.userId) 
      ? new mongoose.Types.ObjectId(req.user.userId) 
      : req.user.userId;
    
    // Initialize resolvedByUsers if it doesn't exist
    if (!note.resolvedByUsers) {
      note.resolvedByUsers = [];
    }
    
    // Add user to resolvedByUsers if not already there
    const userIdString = userId.toString();
    const isAlreadyResolved = note.resolvedByUsers.some(
      id => id.toString() === userIdString
    );
    
    if (!isAlreadyResolved) {
      note.resolvedByUsers.push(userId);
      await note.save();
      console.log(`✅ User ${userIdString} resolved notification ${note._id}`);
      console.log(`   - resolvedByUsers after save:`, note.resolvedByUsers.map(id => id.toString()));
    } else {
      console.log(`ℹ️ User ${userIdString} already resolved notification ${note._id}`);
      console.log(`   - Current resolvedByUsers:`, note.resolvedByUsers.map(id => id.toString()));
    }
    
    // Reload the note to verify it was saved correctly
    const reloadedNote = await Notification.findById(req.params.id);
    console.log(`🔍 Reloaded notification ${reloadedNote._id}:`);
    console.log(`   - resolvedByUsers:`, reloadedNote.resolvedByUsers ? reloadedNote.resolvedByUsers.map(id => id.toString()) : 'MISSING');

    // Keep legacy fields for backwards compatibility (set resolved if all users resolved it)
    // For now, we'll keep it false to maintain per-user resolution
    // note.resolved = true; // Don't set globally
    // note.resolvedBy = userId; // Keep for reference

    // Utvärdera och uppdatera global status (if applicable)
    if (note.meta?.studentId && note.meta?.courseId) {
      await evaluateActionPlanStatusAndNotify(note.meta.studentId, note.meta.courseId);
    }

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



router.put("/notifications/:id/reset", authenticateUser, async (req, res) => {
    try {
      const note = await Notification.findById(req.params.id);
      if (!note) return res.status(404).send("Notis hittades inte");
  
      // Remove current user from resolvedByUsers array (per-user reset)
      const mongoose = (await import("mongoose")).default;
      const userId = mongoose.Types.ObjectId.isValid(req.user.userId) 
        ? new mongoose.Types.ObjectId(req.user.userId) 
        : req.user.userId;
      
      if (note.resolvedByUsers && note.resolvedByUsers.length > 0) {
        const userIdString = userId.toString();
        note.resolvedByUsers = note.resolvedByUsers.filter(
          id => id.toString() !== userIdString
        );
        await note.save();
        console.log(`✅ User ${userIdString} reset notification ${note._id}`);
      }
  
      res.json({ message: "Notis återställd", note });
    } catch (err) {
      console.error("🔴 Fel vid återställning av notis:", err.message);
      res.status(500).send("Serverfel");
    }
  });
  
  
  
  export default router;
  

  

