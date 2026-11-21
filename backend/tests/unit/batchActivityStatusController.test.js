import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/activityStatusService.js", () => ({
    calculateBatchActivityStatus: vi.fn(),
}));

import { getBatchActivityStatus } from "../../src/controllers/learningController.js";
import { calculateBatchActivityStatus } from "../../src/services/activityStatusService.js";

describe("getBatchActivityStatus", () => {
    let req;
    let res;

    beforeEach(() => {
        vi.clearAllMocks();
        req = {
            params: { instanceId: "inst-1" },
            body: { studentIds: ["stu-1"] },
        };
        res = {
            json: vi.fn(),
            status: vi.fn(function () {
                return this;
            }),
        };
    });

    it("maps route params and body into the service and sends the result", async () => {
        const payload = {
            success: true,
            courseInstanceId: "inst-1",
            totalStudents: 0,
            activityResults: [],
        };
        calculateBatchActivityStatus.mockResolvedValue(payload);

        await getBatchActivityStatus(req, res);

        expect(calculateBatchActivityStatus).toHaveBeenCalledWith({
            courseInstanceId: "inst-1",
            studentIds: ["stu-1"],
        });
        expect(res.json).toHaveBeenCalledWith(payload);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("accepts a request without a body", async () => {
        req.body = undefined;
        calculateBatchActivityStatus.mockResolvedValue({ success: true, activityResults: [] });

        await getBatchActivityStatus(req, res);

        expect(calculateBatchActivityStatus).toHaveBeenCalledWith({
            courseInstanceId: "inst-1",
            studentIds: undefined,
        });
    });

    it("returns 400 for a validation error from the service", async () => {
        calculateBatchActivityStatus.mockResolvedValue({ error: "Invalid course instance ID" });

        await getBatchActivityStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid course instance ID" });
    });

    it("returns 500 for an internal service error", async () => {
        calculateBatchActivityStatus.mockResolvedValue({ error: "Internal server error" });

        await getBatchActivityStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});
