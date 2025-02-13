import { Router } from "express";
import { uploadXlsx } from "../controllers/studentController.js";
import multer from "multer";

const storage = multer.memoryStorage(); // Store file in memory
const upload = multer({ storage });

const router = Router();

router.post("/upload/xlsxupload", upload.single("file"), uploadXlsx);

export default router;
