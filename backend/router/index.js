import express from "express";
import studentRoutes from "./studentRoutes.js"; // Ensure .js extension
import authRoutes from "./authRoutes.js";
import teacherRoutes from "./teacherRoutes.js";
import userRoutes from "./userRoutes.js";
import educationRoutes from "./educationRoutes.js";

const router = express.Router();

// Register routes
router.use("/api/students", studentRoutes);
router.use("/api/auth", authRoutes);
router.use("/api/teachers", teacherRoutes);
router.use("/api/users", userRoutes);
router.use("/api/education", educationRoutes);

export default router;
