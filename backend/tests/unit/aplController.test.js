import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../../src/middleware/auth.js", () => ({
    isAuthenticated: (req, _res, next) => {
        req.user = { userId: "user-1", role: "admin" };
        next();
    },
    hasRole: () => (_req, _res, next) => next(),
}));

const h = vi.hoisted(() => ({
    findEligibleStudents: vi.fn(),
    autoCreateRecords: vi.fn(),
    updateAplStatus: vi.fn(),
    autoTransitionStatuses: vi.fn(),
    getAplRecords: vi.fn(),
    getAplRecordByStudent: vi.fn(),
    updateAplRecordDetails: vi.fn(),
    getAplStatistics: vi.fn(),
}));

vi.mock("../../src/services/aplService.js", () => h);

import router from "../../src/router/aplRoutes.js";
import {
    findEligibleStudents,
    autoCreateRecords,
    updateAplStatus,
    autoTransitionStatuses,
    getAplRecords,
    getAplRecordByStudent,
    updateAplRecordDetails,
    getAplStatistics,
} from "../../src/services/aplService.js";

const app = express();
app.use(express.json());
app.use(router);

describe("aplController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("GET /apl/records", () => {
        it("lists records with query passthrough", async () => {
            getAplRecords.mockResolvedValue([{ status: "BLUE" }]);
            const res = await request(app).get("/apl/records").query({
                status: "BLUE",
                includeCompleted: "true",
                search: "anna",
            });
            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ status: "BLUE" }]);
            expect(getAplRecords).toHaveBeenCalledWith({
                status: "BLUE",
                includeCompleted: true,
                search: "anna",
            });
        });

        it("returns 500 on failure", async () => {
            getAplRecords.mockRejectedValue(new Error("boom"));
            const res = await request(app).get("/apl/records");
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: "Failed to list APL records" });
        });
    });

    describe("GET /apl/records/:studentId", () => {
        it("returns the record for a student", async () => {
            getAplRecordByStudent.mockResolvedValue({ status: "GRAY" });
            const res = await request(app).get("/apl/records/s1");
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ status: "GRAY" });
        });

        it("returns 404 when no record exists", async () => {
            getAplRecordByStudent.mockResolvedValue(null);
            const res = await request(app).get("/apl/records/s1");
            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: "APL record not found" });
        });

        it("returns 500 on failure", async () => {
            getAplRecordByStudent.mockRejectedValue(new Error("boom"));
            const res = await request(app).get("/apl/records/s1");
            expect(res.status).toBe(500);
        });
    });

    describe("PATCH /apl/records/:studentId/status", () => {
        it("updates a status", async () => {
            updateAplStatus.mockResolvedValue({
                student: { _id: "s1" },
                record: { status: "RED" },
            });
            const res = await request(app)
                .patch("/apl/records/s1/status")
                .send({ status: "RED", reason: "Närmar sig slut" });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(updateAplStatus).toHaveBeenCalledWith({
                studentId: "s1",
                status: "RED",
                reason: "Närmar sig slut",
                userId: "user-1",
            });
        });

        it("returns 400 for validation errors", async () => {
            updateAplStatus.mockRejectedValue(Object.assign(new Error("Invalid APL status"), { statusCode: 400 }));
            const res = await request(app).patch("/apl/records/s1/status").send({});
            expect(res.status).toBe(400);
        });

        it("returns 404 for missing students", async () => {
            updateAplStatus.mockRejectedValue(Object.assign(new Error("Student not found"), { statusCode: 404 }));
            const res = await request(app).patch("/apl/records/s1/status").send({ status: "RED" });
            expect(res.status).toBe(404);
        });

        it("returns 500 on other failures", async () => {
            updateAplStatus.mockRejectedValue(new Error("boom"));
            const res = await request(app).patch("/apl/records/s1/status").send({ status: "RED" });
            expect(res.status).toBe(500);
        });
    });

    describe("PUT /apl/records/:studentId", () => {
        it("updates record details", async () => {
            updateAplRecordDetails.mockResolvedValue({ placementCompany: "Acme" });
            const res = await request(app)
                .put("/apl/records/s1")
                .send({ placementCompany: "Acme" });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, record: { placementCompany: "Acme" } });
        });

        it("returns 404 when the student is missing", async () => {
            updateAplRecordDetails.mockRejectedValue(Object.assign(new Error("Student not found"), { statusCode: 404 }));
            const res = await request(app).put("/apl/records/s1").send({});
            expect(res.status).toBe(404);
        });

        it("returns 500 on failure", async () => {
            updateAplRecordDetails.mockRejectedValue(new Error("boom"));
            const res = await request(app).put("/apl/records/s1").send({});
            expect(res.status).toBe(500);
        });
    });

    describe("POST /apl/auto-create", () => {
        it("creates records and reports the count", async () => {
            autoCreateRecords.mockResolvedValue([{ _id: "a" }, { _id: "b" }]);
            const res = await request(app).post("/apl/auto-create");
            expect(res.status).toBe(200);
            expect(res.body.message).toContain("2 new APL record(s)");
            expect(autoCreateRecords).toHaveBeenCalledWith("user-1");
        });

        it("returns 500 on failure", async () => {
            autoCreateRecords.mockRejectedValue(new Error("boom"));
            const res = await request(app).post("/apl/auto-create");
            expect(res.status).toBe(500);
        });
    });

    describe("POST /apl/auto-transition", () => {
        it("runs transitions and reports the count", async () => {
            autoTransitionStatuses.mockResolvedValue([{ to: "RED" }]);
            const res = await request(app).post("/apl/auto-transition");
            expect(res.status).toBe(200);
            expect(res.body.transitions).toEqual([{ to: "RED" }]);
        });

        it("returns 500 on failure", async () => {
            autoTransitionStatuses.mockRejectedValue(new Error("boom"));
            const res = await request(app).post("/apl/auto-transition");
            expect(res.status).toBe(500);
        });
    });

    describe("GET /apl/eligible", () => {
        it("returns eligible students", async () => {
            findEligibleStudents.mockResolvedValue([{ _id: "s1" }]);
            const res = await request(app).get("/apl/eligible");
            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ _id: "s1" }]);
        });

        it("returns 500 on failure", async () => {
            findEligibleStudents.mockRejectedValue(new Error("boom"));
            const res = await request(app).get("/apl/eligible");
            expect(res.status).toBe(500);
        });
    });

    describe("GET /apl/statistics", () => {
        it("returns statistics", async () => {
            getAplStatistics.mockResolvedValue({ counts: { GRAY: 1 }, total: 1 });
            const res = await request(app).get("/apl/statistics");
            expect(res.status).toBe(200);
            expect(res.body.total).toBe(1);
        });

        it("returns 500 on failure", async () => {
            getAplStatistics.mockRejectedValue(new Error("boom"));
            const res = await request(app).get("/apl/statistics");
            expect(res.status).toBe(500);
        });
    });
});