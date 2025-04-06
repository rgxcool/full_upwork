import { Router } from "express";
import taskRoutes from "./taskRoutes.js"; //  Ensure all imports are correct
import authRoutes from "./authRoutes.js";
import studentRoutes from "./studentRoutes.js";
import userRoutes from "./userRoutes.js";
import teacherRoutes from "./teacherRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import programRoutes from "./programRoutes.js";
import gradeRoutes from "./gradeRoutes.js";
import courseRoutes from "./courseRoutes.js";
import coursePackageRoutes from "./coursePackageRoutes.js";
import searchRoutes from "./searchRoutes.js"; 
import examRoutes from "./examRoutes.js"
import meetingroutes from "./meetingroutes.js"; //  Ensure all imports are correct

const router = Router();

console.log(" Registering API routes...");

//  Log before mounting each route
router.use("/api", examRoutes);
router.use("/api", taskRoutes);
router.use("/api", authRoutes);
router.use("/api", studentRoutes);
router.use("/api", userRoutes);
router.use("/api", teacherRoutes);
router.use("/api", uploadRoutes);
router.use("/api", programRoutes);
router.use("/api", gradeRoutes);
router.use("/api", courseRoutes);
router.use("/api", coursePackageRoutes);
router.use("/api", searchRoutes);
router.use("/api", meetingroutes);

export default router;
