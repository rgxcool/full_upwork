import express from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    recordVisit,
    getReport,
    getMine,
    STAFF_ROLES,
} from "../controllers/resourceVisitController.js";

const router = express.Router();

// Recording is allowed for authenticated users; the controller enforces that
// students can only record visits for themselves.
router.post("/resource-visits", isAuthenticated, asyncHandler(recordVisit));

// Aggregated report is staff-only. No new permission key or feature flag is
// introduced: the existing staff roles are reused.
router.get(
    "/resource-visits/report",
    isAuthenticated,
    hasRole(STAFF_ROLES),
    asyncHandler(getReport)
);

// Students may read their own visit history.
router.get("/resource-visits/mine", isAuthenticated, asyncHandler(getMine));

export default router;
