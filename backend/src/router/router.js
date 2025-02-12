import { Router } from "express";
import taskRoutes from "./taskRoutes.js"; // ✅ Ensure all imports are correct
import authRoutes from "./authRoutes.js";
import studentRoutes from "./studentRoutes.js";
import userRoutes from "./userRoutes.js";
import teacherRoutes from "./teacherRoutes.js";

const router = Router();

console.log("✅ Registering API routes...");

// ✅ Log before mounting each route
console.log("✅ Mounting `/api/tasks`...");
router.use("/api/tasks", taskRoutes);

console.log("✅ Mounting `/api/auth`...");
router.use("/api/auth", authRoutes);

console.log("✅ Mounting `/api/students`...");
router.use("/api/students", studentRoutes);

console.log("✅ Mounting `/api/users`...");
router.use("/api/users", userRoutes);

console.log("✅ Mounting `/api/teachers`...");
router.use("/api/teachers", teacherRoutes);

console.log("✅ All routes should now be registered!");

export default router;
