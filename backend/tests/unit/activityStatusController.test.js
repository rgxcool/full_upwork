import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/activityStatusService.js", () => ({
    calculateActivityStatus: vi.fn(),
    calculateBatchActivityStatus: vi.fn(),
}));

import { getActivityStatus } from "../../src/controllers/learningController.js";
import { calculateActivityStatus } from "../../src/services/activityStatusService.js";

describe("getActivityStatus", () => {
    let req;
    let res;

    beforeEach(() => {
        vi.clearAllMocks();
        req = {
            params: {
                instanceId: "inst-1",
                studentId: "stu-1",
            },
        };
        res = {
            json: vi.fn(),
            status: vi.fn(function () {
                return this;
            }),
        };
    });

    it("maps route params into the service and sends the result", async () => {
        const payload = {
            success: true,
            studentId: "stu-1",
            courseInstanceId: "inst-1",
            overallStatus: "on schedule",
        };
        calculateActivityStatus.mockResolvedValue(payload);

        await getActivityStatus(req, res);

        expect(calculateActivityStatus).toHaveBeenCalledWith({
            studentId: "stu-1",
            courseInstanceId: "inst-1",
        });
        expect(res.json).toHaveBeenCalledWith(payload);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("returns 400 for a validation error from the service", async () => {
        calculateActivityStatus.mockResolvedValue({ error: "Invalid IDs" });

        await getActivityStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid IDs" });
    });

    it("returns 500 for an internal service error", async () => {
        calculateActivityStatus.mockResolvedValue({ error: "Internal server error" });

        await getActivityStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});
