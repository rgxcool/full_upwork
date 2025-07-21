import express from "express";
import multer from "multer";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import {
    uploadStudentsForMatching,
    processStudentEducation,
    findCourseMatch,
    getCourseInstances,
    getStudentEnrollments,
    getCourseInstanceEnrollments,
    updateEnrollmentStatus,
    getCourseStatistics,
    createCourseInstance,
    deleteCourseInstance,
    deleteAllCourseInstances,
} from "../controllers/courseMatchingController.js";

const router = express.Router();

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Course matching routes
router.get("/course-match", isAuthenticated, findCourseMatch);
router.post(
    "/upload-students",
    upload.single("file"),
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    uploadStudentsForMatching
);
router.post(
    "/process-education",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    processStudentEducation
);

// Course instances routes
router.get("/course-instances", isAuthenticated, getCourseInstances);
router.post(
    "/course-instances",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    createCourseInstance
);

// Bulk delete all course instances
router.delete(
    "/course-instances/all",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    deleteAllCourseInstances
);
// Delete a course instance
router.delete(
    "/course-instances/:instanceId",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    deleteCourseInstance
);

// Student enrollment routes
router.get(
    "/students/:studentId/enrollments",
    isAuthenticated,
    getStudentEnrollments
);

// Course instance enrollment routes
router.get(
    "/course-instances/:instanceId/enrollments",
    isAuthenticated,
    getCourseInstanceEnrollments
);
router.put(
    "/enrollments/:enrollmentId/status",
    isAuthenticated,
    hasRole(["admin", "systemadmin", "teacher"]),
    updateEnrollmentStatus
);

// Statistics routes
router.get(
    "/course-statistics",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    getCourseStatistics
);

export default router;
