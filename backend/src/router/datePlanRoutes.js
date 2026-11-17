import express from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import {
    previewDatePlanHandler,
    applyDatePlanHandler,
} from "../controllers/datePlanController.js";
import { PLAN_LENGTHS } from "../utils/datePlan.js";

const router = express.Router();

const ADMIN_ROLES = ["systemadmin", "admin"];
const PREVIEW_ROLES = [...ADMIN_ROLES, "teacher"];

const lengthRule = {
    type: "number",
    custom: (value) =>
        PLAN_LENGTHS.includes(value) ? null : "måste vara 5, 10 eller 20",
};

const sectionOffsetsRule = {
    custom: (value) => {
        if (value === undefined || value === null) return null;
        if (!Array.isArray(value)) return "måste vara en lista med 5 tal";
        if (value.length !== 5) return "måste ha exakt 5 värden (en per modul)";
        if (value.some((n) => typeof n !== "number" || Number.isNaN(n) || n < 0)) {
            return "måste vara icke-negativa tal";
        }
        return null;
    },
};

const planSchema = {
    instanceId: { type: "string", required: true, objectId: true },
    lengthWeeks: lengthRule,
    endDate: { type: "string" },
    sectionOffsets: sectionOffsetsRule,
};

// Dry run: calculate a 5/10/20 week plan without saving anything.
router.post(
    "/date-plan/preview",
    isAuthenticated,
    hasRole(PREVIEW_ROLES),
    validate(planSchema),
    previewDatePlanHandler
);

// Apply and persist a plan on an existing course instance.
router.put(
    "/date-plan/apply",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validate(planSchema),
    applyDatePlanHandler
);

export default router;
