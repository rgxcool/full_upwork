import { Router } from "express";
import studentRoutes from "./studentRoutes.js"; // ✅ Ensure .js extension
import authRoutes from "./authRoutes.js";
import teacherRoutes from "./teacherRoutes.js";
import userRoutes from "./userRoutes.js";
import educationRoutes from "./educationRoutes.js";
import adminRoutes from "./adminRoutes.js";

const router = Router();

// Register routes
router.use("/api/students", studentRoutes);
router.use("/api/auth", authRoutes);
router.use("/api/teachers", teacherRoutes);
router.use("/api/users", userRoutes);
router.use("/api/education", educationRoutes);
router.use("/api/admin", adminRoutes);

export default router;
