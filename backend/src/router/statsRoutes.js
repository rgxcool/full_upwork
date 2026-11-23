// /routes/statsRoutes.js
import express from "express";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { authenticateUser } from "../controllers/authController.js";
import logger from "../utils/logger.js";
import { canFeature } from "../middleware/authorization.js";
import { PERMISSION_FEATURES } from "../config/permissions.js";

const router = express.Router();

// Statistics follow PERMISSION_MATRIX "statistics" (+ per-user overrides);
// students and coordinators get 403 (audit E1-01).
router.get("/courses-per-month", authenticateUser, canFeature(PERMISSION_FEATURES.STATISTICS), async (req, res) => {
  try {
    // Registrations per month, course and grade, from enrollments (#103).
    const enrollments = await StudentEnrollment.find({ mainCourseId: { $ne: null } })
      .select("mainCourseId studentId grade enrollmentDate createdAt")
      .populate("mainCourseId", "courseName")
      .populate("studentId", "municipality")
      .lean();

    const stats = {};

    for (const enrollment of enrollments) {
      const course = enrollment.mainCourseId?.courseName;
      const added = enrollment.enrollmentDate || enrollment.createdAt;
      if (!course || !added) continue;

      const municipality = enrollment.studentId?.municipality?.type || "UNKNOWN";
      const date = new Date(added);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const grade = (enrollment.grade || "UNKNOWN").toUpperCase();

      stats[month] ??= {};
      stats[month][course] ??= {};

      // Add grade count
      stats[month][course][grade] ??= 0;
      stats[month][course][grade]++;

      // Add municipality info
      stats[month][course]._municipality ??= [];
      if (!stats[month][course]._municipality.includes(municipality)) {
        stats[month][course]._municipality.push(municipality);
      }
    }

    res.json(stats);
  } catch (err) {
    logger.error({ err }, "Error generating course stats")
    res.status(500).json({ error: "Failed to generate stats" });
  }
});

export default router;
