import { Router } from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { requireFeature } from "../middleware/featureGate.js";
import { can } from "../middleware/authorization.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { validate } from "../middleware/validation.js";
import {
    getInactivityReport,
    sendInactivityWarning,
    resendInactivityWarning,
    getInactivitySettings,
    updateInactivitySettings,
    runInactivityScanHandler,
    getInactivityScanStatus,
    performInactivityNotificationAction,
} from "../controllers/inactivityController.js";

const router = Router();
const ADMIN_ROLES = ["admin", "systemadmin"];

router.use(requireFeature("INACTIVITY"));

router.get(
    "/report",
    isAuthenticated,
    can("inactivity:read"),
    asyncHandler(getInactivityReport)
);

router.post(
    "/scan",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(runInactivityScanHandler)
);

router.get(
    "/scan-status",
    isAuthenticated,
    can("inactivity:read"),
    asyncHandler(getInactivityScanStatus)
);

// Org-level automation settings. New endpoints only; the existing report,
// scan, warning and notification contracts are untouched.
const positiveDays = (value) =>
    Number.isInteger(value) && value >= 1 && value <= 365
        ? null
        : "måste vara ett heltal mellan 1 och 365";

const settingsSchema = {
    withdrawDays: { type: "number", custom: positiveDays },
    warningDays: { type: "number", custom: positiveDays },
    autoWarningEnabled: { type: "boolean" },
    autoWithdrawEnabled: { type: "boolean" },
    scanHourUtc: {
        type: "number",
        custom: (value) =>
            Number.isInteger(value) && value >= 0 && value <= 23
                ? null
                : "måste vara ett heltal mellan 0 och 23",
    },
};

router.get(
    "/settings",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    asyncHandler(getInactivitySettings)
);

router.put(
    "/settings",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    validate(settingsSchema),
    asyncHandler(updateInactivitySettings)
);

router.post(
    "/:studentId/warning-email",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    asyncHandler(sendInactivityWarning)
);

router.post(
    "/:studentId/warning-email/resend",
    isAuthenticated,
    hasRole(ADMIN_ROLES),
    asyncHandler(resendInactivityWarning)
);

// Admin acts on an inactivity notification directly: warning email or avbrott.
router.post(
    "/notifications/:notificationId/action",
    isAuthenticated,
    hasRole(["admin", "systemadmin"]),
    asyncHandler(performInactivityNotificationAction)
);

export default router;
