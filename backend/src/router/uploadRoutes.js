import { Router } from "express";
import upload from "../middleware/uploadMiddleware.js";
import { uploadXlsx } from "../controllers/studentController.js";

const router = Router();

router.post("/upload/xlsxupload", upload.single("file"), uploadXlsx);

export default router;
