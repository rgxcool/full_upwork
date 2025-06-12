import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import User from "../models/User.js";

export const checkPendingGradesAndNotify = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    
  
    const unGradedStudents = await Student.countDocuments({
      education: {
        $elemMatch: {
          removedAt: null,
          $or: [
            { grade: null },
            { grade: "" },
            { locked: false },
            { grade: "F", locked: true }
          ]
        }
      },
      dropout: false
    });
  
    const existing = await Notification.findOne({ type: "grades_pending", resolved: false });
  
    if (ungradedStudents > 0) {
      // Skapa notis om den inte redan finns
      if (!existing) {
        await Notification.create({
          type: "grades_pending",
          message: "Du har elever att betygsätta",
          resolved: false
        });
      }
    } else {
      // Ta bort/lös notisen om alla elever är betygsatta
      if (existing) {
        existing.resolved = true;
        await existing.save();
      }
    }
  };
  
  


export async function createNotification({ studentId, courseId, type, message }) {
    const existing = await Notification.findOne({
      studentId,
      courseId,
      type,
      resolved: false
    });
  
    if (!existing) {
      return await Notification.create({
        studentId,
        courseId,
        type,
        message,
        resolved: false,
      });
    }
  }
  
  export async function resolveNotification({ studentId, courseId, type }) {
    return await Notification.updateMany(
      {
        studentId,
        courseId,
        type,
        resolved: false,
      },
      { $set: { resolved: true } }
    );
  }


// 🔔 Skapa en systemnotis om den inte finns
export async function createGlobalNotification(type, message) {
  const existing = await Notification.findOne({ type, resolved: false });
  if (!existing) {
    return await Notification.create({
      type,
      message,
      resolved: false,
    });
  }
}

// ✅ Avsluta systemnotis av viss typ
export async function resolveGlobalNotification(type) {
  return await Notification.updateMany(
    { type, resolved: false },
    { $set: { resolved: true } }
  );
}

export async function evaluateActionPlanStatusAndNotify() {
  try {
    const finnsObearbetadeHandlingsplaner = await Notification.exists({
      type: "action_plan_required",
      resolved: false
    });
    if (finnsObearbetadeHandlingsplaner) {
      await createGlobalNotification(
        "global_action_plan_required",
        "Handlingsplan krävs pga elever med F i betyg"
      );
    } else {
      await resolveGlobalNotification("global_action_plan_required");
    }
  } catch (err) {
    console.error("Fel i evaluateActionPlanStatusAndNotify:", err);
  }
}
  
  
  export async function evaluateGradingStatusAndNotify() {
    try {
      const students = await Student.find().lean();
  
      const ungradedStudents = students.filter(student => {
        const courses = (student.education || []).filter(edu => !edu.removedAt);
        return courses.some(edu => {
          const noGrade = !edu.grade || edu.grade === "";
          const notLocked = edu.locked === false;
          const fAndLocked = edu.grade === "F" && edu.locked === true;
          return noGrade || notLocked || fAndLocked;
        });
      });
  
      if (ungradedStudents.length > 0) {
        const message = "Det finns elever som inte har fått betyg ännu. Vänlig betygsätt dem snarast."
        await createGlobalNotification("grades_pending", message);
        console.log("Notis skickad om ofullständig betygssättning:", message);
      } else {
        await resolveGlobalNotification("grades_pending");
        console.log("Alla elever har fått betyg – ingen notis behövs.");
      }
    } catch (err) {
      console.error("Fel i evaluateGradingStatusAndNotify:", err);
    }
  }
  


  export async function sendDropoutNotification({ student, education }) {
    let teacherId = null;

    // Try to resolve teacherId from teacher name string (in Student model)
    if (student.teacher && typeof student.teacher === "string" && student.teacher.trim() !== "") {
        const teacherUser = await User.findOne({ name: student.teacher });
        if (teacherUser) {
            teacherId = teacherUser._id;
        }
    }

    // Prevent duplicate
    const existing = await Notification.findOne({
        type: "dropout",
        "meta.studentId": student._id,
        "meta.educationId": education._id,
    });
    if (existing) return existing;

    // If education.refId can be empty/null, that's OK as it allows null

    const notification = new Notification({
        type: "dropout",
        message: `Studenten ${student.name} har avbrutit utbildningen ${education?.name || 'okänd utbildning'}`,
        meta: {
            teacherId: teacherId,      // Will be null if no match found
            studentId: student._id,
            educationId: education?._id,
            courseId: education?.refId || null,
            url: `/students/${student._id}/education`
        }
    });
    await notification.save();
    return notification;
}
  