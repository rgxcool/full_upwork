import express from "express"
import Program from "../models/Program.js"

const router = express.Router()

// ✅ Get all programs + their courses populated
// backend router example: src/router/programRoutes.js
// GET all programs with populated course packages and their courses
router.get('/programs', async (req, res) => {
  try {
    const programs = await Program.find()
      .populate({
        path: 'programCourses.courseId',
        model: 'Course',
        select: 'courseName courseCode coursePoints courseExtent'
      })
      .populate({
        path: 'programCoursePackages',
        model: 'CoursePackage',
        populate: {
          path: 'coursePackageCourses',
          model: 'Course',
          select: 'courseName courseCode courseExtent'
        }
      });

    const formattedPrograms = programs.map(program => ({
      _id: program._id,
      programName: program.programName,
      programCourses: program.programCourses.map(pc => ({
        ...pc.courseId?._doc,
        order: pc.order
      })),
      programCoursePackages: program.programCoursePackages.map(pkg => ({
        _id: pkg._id,
        coursePackageName: pkg.coursePackageName,
        coursePackageCode: pkg.coursePackageCode,
        coursePackageExtent: pkg.coursePackageExtent,
        coursePackageCourses: (pkg.coursePackageCourses || []).map(course => ({
          _id: course._id,
          courseName: course.courseName,
          courseCode: course.courseCode,
          courseExtent: course.courseExtent
        }))
      }))
    }));

    console.dir(formattedPrograms, { depth: null });

    res.json(formattedPrograms);
  } catch (error) {
    console.error('❌ Error fetching programs:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// ✅ Get all courses by programId (raw, unflattened)
router.get("/program/:programId/courses", async (req, res) => {
  try {
    const program = await Program.findById(req.params.programId).populate("programCourses.courseId")

    if (!program) {
      return res.status(404).json({ error: "Program not found" })
    }

    const courses = program.programCourses.map((pc) => ({
      _id: pc.courseId?._id,
      courseName: pc.courseId?.courseName,
      courseCode: pc.courseId?.courseCode,
      coursePoints: pc.courseId?.coursePoints,
      courseExtent: pc.courseId?.courseExtent,
    }))

    res.json(courses)
  } catch (error) {
    console.error("Error fetching program courses:", error)
    res.status(500).json({ error: "Server error" })
  }
})

export default router
