import express from "express";

import { hasRole } from '../middleware/auth';
import { getGradeReport } from '../controllers/gradeReportController.js';

const router = express.Router();

router.get(
  '/reports/grades',
  hasRole(['admin', 'systemadmin']),
  getGradeReport
);


export default router;
