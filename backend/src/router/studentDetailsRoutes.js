import express from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import {
    getStudentDetails,
    updateStudentInfo,
    addComment,
    editComment,
    deleteComment,
    markCommentSeen,
    getChangeHistory,
} from "../controllers/studentDetailsController.js";

const router = express.Router();

// Get student details with populated references
router.get("/student-details/:id", isAuthenticated, getStudentDetails);

// Update student information (admin+ only)
router.put(
    "/student-details/:id",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    updateStudentInfo
);

// Comment management routes
router.post(
    "/student-details/:id/comments",
    isAuthenticated,
    hasRole(["teacher", "admin", "systemadmin"]),
    addComment
);
router.put(
    "/student-details/:id/comments/:commentId",
    isAuthenticated,
    editComment
);
router.delete(
    "/student-details/:id/comments/:commentId",
    isAuthenticated,
    deleteComment
);
router.put(
    "/student-details/:id/comments/:commentId/seen",
    isAuthenticated,
    markCommentSeen
);

// Change history (admin+ only)
router.get(
    "/student-details/:id/history",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    getChangeHistory
);

export default router;
