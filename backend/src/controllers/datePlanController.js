import logger from "../utils/logger.js";
import { recordAudit } from "../utils/auditLog.js";
import { applyDatePlan, previewDatePlan } from "../services/datePlanService.js";

const handleError = (res, error, context) => {
    if (error.isOperational) {
        return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error({ err: error }, context);
    return res.status(500).json({ error: "Internal server error" });
};

export const previewDatePlanHandler = async (req, res) => {
    try {
        const result = await previewDatePlan(req.body.instanceId, req.body);
        return res.json(result);
    } catch (error) {
        return handleError(res, error, "Error previewing date plan");
    }
};

export const applyDatePlanHandler = async (req, res) => {
    try {
        const result = await applyDatePlan(req.body.instanceId, req.body);
        await recordAudit(req, {
            entityType: "CourseInstance",
            entityId: req.body.instanceId,
            action: "update",
            description: `Applied ${result.datePlan.lengthWeeks}-week date plan (${result.datePlan.source} offsets)`,
        });
        return res.json(result);
    } catch (error) {
        return handleError(res, error, "Error applying date plan");
    }
};
