import mongoose from "mongoose";
import Program from "../src/models/Program.js";

async function cleanupProgramCourses() {
  const mongoUri = process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB for cleanup.');

  try {
    const result = await Program.updateMany({}, { $set: { programCourses: [] } });
    console.log(`✅ Cleanup successful. Modified documents: ${result.modifiedCount}`);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

cleanupProgramCourses();
