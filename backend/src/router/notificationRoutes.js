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


router.get('/course-end-notifications', async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
  
      const count = await Student.countDocuments({
        endDate: { $lte: today },
        dropout: false
      });

      const existing = await Notification.findOne({ type: "grades_pending", resolved: false });

        if (!existing) {
        await Notification.create({
            type: "grades_pending",
            message: "Du har elever att betygsätta"
        });
        }
  
      res.status(200).json({ hasPendingGrades: count > 0 });
    } catch (err) {
      console.error('🔴 Fel vid hämtning av kursslut-notiser:', err.message);
      res.status(500).json({ message: 'Serverfel' });
    }
  });
  

  // Hämta alla aktiva notiser
router.get("/notifications", async (req, res) => {
    const notes = await Notification.find({ resolved: false });
    res.json(notes);
  });
  
  // Bocka av (sätt som klar)
  router.put("/notifications/:id/resolve", async (req, res) => {
    const note = await Notification.findById(req.params.id);
    if (!note) return res.status(404).send("Notis hittades inte");
  
    note.resolved = true;
    note.resolvedBy = req.body.userId; // ← du skickar in inloggade användarens ID
    await note.save();
  
    res.json({ message: "Notis markerad som hanterad", note });
  });


  // Återställ en notis (resettar resolved = false)
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
  
  // Endpoint för att hämta notiser om F-elever
  router.get("/failing-students-notifications", async (req, res) => {
    try {
      const notifications = await Notification.find({
        type: "failing_grade",  // Filtrera på typ av notis
      })
      .populate('meta.studentId', 'name')  // Hämta studentens namn
      .populate('meta.courseId', 'courseName')  // Hämta kursnamn om relevant
      .populate('meta.teacherId', 'name');  // Hämta lärarens namn om relevant
  
      res.json(notifications);
    } catch (error) {
      console.error('Fel vid hämtning av F-elever notiser:', error);
      res.status(500).send('Serverfel');
    }
  });


// Funktion för att skapa notis för F-elever
const createFailingStudentNotification = async (studentId) => {
  try {
    // Hämta elevens information (eller skapa logik för när betygen sätts)
    const student = await Student.findById(studentId);

    if (student.grade === 'F') {
      // Skapa notisen om eleven har fått F
      const notification = new Notification({
        type: 'failing_grade',
        message: `Eleven ${student.name} har fått F i betyg!`,
        meta: {
          studentId: student._id,
          courseId: student.courseId,  // Om du också har kursen
          teacherId: student.teacherId,  // Om du har information om läraren
          url: `/students/${student._id}`,  // Direktlänk till elevens sida
        }
      });

      // Spara notisen i databasen
      await notification.save();
    }
  } catch (error) {
    console.error('Fel vid skapande av F-notis:', error);
  }
};

  
  export default router;
  

  

