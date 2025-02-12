import { Router } from "express";
import taskRoutes from "./taskRoutes.js"; // ✅ Ensure all imports are correct
import authRoutes from "./authRoutes.js";
import studentRoutes from "./studentRoutes.js";
import userRoutes from "./userRoutes.js";
import teacherRoutes from "./teacherRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import programRoutes from "./programRoutes.js";

const router = Router();

console.log("✅ Registering API routes...");

// ✅ Log before mounting each route
router.use("/api", taskRoutes);
router.use("/api", authRoutes);
router.use("/api", studentRoutes);
router.use("/api", userRoutes);
router.use("/api", teacherRoutes);
router.use("/api", uploadRoutes);
router.use("/api", programRoutes);

export default router;
