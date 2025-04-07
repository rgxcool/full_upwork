import mongoose from 'mongoose';
import Program from '../src/models/Program.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mindfullearning';

async function cleanupProgramCourses() {
  await mongoose.connect(MONGODB_URI);
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
