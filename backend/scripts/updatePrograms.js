import mongoose from "mongoose";
import Program from "../src/models/Program.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env.development" }); // 👈 explicitly load the .env

const mongoUri = process.env.MONGODB_URI;
await mongoose.connect(mongoUri);

const programs = await Program.find({})

for (const program of programs) {
  const converted = program.programCourses.map((id, index) => ({
    courseId: id,
    order: index + 1,
  }))

  program.programCourses = converted
  await program.save()

  console.log(`✅ Converted ${program.programName}`)
}

await mongoose.disconnect()
