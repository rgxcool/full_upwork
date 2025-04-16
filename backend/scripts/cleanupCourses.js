import mongoose from "mongoose";
import Student from "../src/models/Student.js"; 

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mindfullearning';

const cleanDuplicateCourses = async () => {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for cleanup.');


    try {
      const students = await Student.find();
  
      for (const student of students) {
        const uniqueCourses = [];

        const seen = new Set();
  
        for (const course of student.courses) {
          const idStr = course.courseId.toString();
  
          if (!seen.has(idStr)) {
            seen.add(idStr);
            uniqueCourses.push(course);
          }
        }
  
        // Om vi hittade och tog bort några dubbletter:
        if (uniqueCourses.length !== student.courses.length) {
          student.courses = uniqueCourses;
          await student.save();
          console.log(`✅ Rensade dubbletter för student: ${student.name}`);
        }
      }
  
      console.log("🧹 Rensning klar!");
    } catch (err) {
      console.error("❌ Fel vid rensning:", err);
    } finally {
      mongoose.connection.close();
    }
  };
  
  // Kör funktionen
  cleanDuplicateCourses();