import mongoose from "mongoose"
import dotenv from "dotenv"
import Program from "../src/models/Program.js"
import Course from "../src/models/Course.js"

dotenv.config({ path: ".env.development" })

await mongoose.connect(process.env.MONGO_URI)
console.log("📡 Connected to MongoDB")

const programs = await Program.find().lean()

for (const program of programs) {
  if (!program.programCourses || program.programCourses.length === 0) continue

  console.log(`🔍 Processing Program: ${program.name}`)

  for (const entry of program.programCourses) {
    const courseId = entry.courseId

    const course = await Course.findById(courseId)
    if (!course) {
      console.warn(`⚠️ Course not found: ${courseId}`)
      continue
    }

    const alreadyLinked = course.programs?.some((id) => id.toString() === program._id.toString())
    if (!alreadyLinked) {
      course.programs = course.programs || []
      course.programs.push(program._id)
      await course.save()
      console.log(`✅ Added program '${program.name}' to course '${course.courseName}'`)
    } else {
      console.log(`ℹ️ Course '${course.courseName}' already includes program '${program.name}'`)
    }
  }
}

console.log("🎉 Done! Programs added to relevant courses.")
await mongoose.disconnect()
