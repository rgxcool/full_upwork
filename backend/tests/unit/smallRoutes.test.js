import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const queryChain = (result) => {
    const chain = {
        select: vi.fn(() => chain),
        sort: vi.fn(() => chain),
        skip: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        lean: vi.fn(() => chain),
        then: undefined,
    };
    chain.then = (resolve, reject) => {
        const value = typeof result === "function" ? result() : result;
        return Promise.resolve(value).then(resolve, reject);
    };
    return chain;
};

const h = vi.hoisted(() => ({
    courseModel: { find: vi.fn() },
    auditModel: { find: vi.fn(), countDocuments: vi.fn() },
    chatbotService: { ask: vi.fn() },
}));

vi.mock("../../src/models/Course.js", () => ({ default: h.courseModel }));
vi.mock("../../src/models/FileAuditLog.js", () => ({ default: h.auditModel }));
vi.mock("../../src/services/chatbotService.impl.js", () => ({ default: h.chatbotService }));

let currentUser = { userId: "user-1", role: "admin" };

vi.mock("../../src/middleware/auth.js", () => ({
    isAuthenticated: (req, _res, next) => {
        if (currentUser) req.user = currentUser;
        next();
    },
    hasRole: () => (_req, _res, next) => next(),
}));

vi.mock("../../src/middleware/validation.js", () => ({
    validateId: () => (_req, _res, next) => next(),
}));

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import courseBankRouter from "../../src/router/courseBankRoutes.js";
import chatbotRouter from "../../src/router/chatbotRoutes.js";
import auditRouter from "../../src/router/auditRoutes.js";

const app = express();
app.use(express.json());
app.use(courseBankRouter);
app.use(chatbotRouter);
app.use(auditRouter);

describe("courseBankRoutes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists active courses for the course bank", async () => {
        h.courseModel.find.mockReturnValue(queryChain([{ courseName: "Matte 1", courseCode: "MA1" }]));
        const res = await request(app).get("/courses");
        expect(res.status).toBe(200);
        expect(res.body.courses).toHaveLength(1);
        expect(res.body.courses[0].courseName).toBe("Matte 1");
    });

    it("returns 500 when the query fails", async () => {
        h.courseModel.find.mockReturnValue(queryChain(() => Promise.reject(new Error("boom"))));
        const res = await request(app).get("/courses");
        expect(res.status).toBe(500);
    });
});

describe("chatbotRoutes", () => {
    beforeEach(() => {
        currentUser = { userId: "user-1", role: "admin" };
        vi.clearAllMocks();
    });

    it("returns 400 for an empty question", async () => {
        const res = await request(app).post("/ask").send({ question: "   " });
        expect(res.status).toBe(400);
    });

    it("returns 401 when no authenticated user is present", async () => {
        currentUser = null;
        h.chatbotService.ask.mockResolvedValue({});
        const res = await request(app).post("/ask").send({ question: "Hej!" });
        expect(res.status).toBe(401);
    });

    it("returns the chatbot answer", async () => {
        h.chatbotService.ask.mockResolvedValue({
            answer: "Svar",
            sources: ["src"],
            confidence: 0.9,
            approved: true,
            sessionId: "sess-1",
        });
        const res = await request(app)
            .post("/ask")
            .send({ question: "Vad är en kurs?" });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.answer).toBe("Svar");
        expect(res.body.sessionId).toBe("sess-1");
        expect(h.chatbotService.ask).toHaveBeenCalledWith("user-1", "Vad är en kurs?", undefined);
    });

    it("returns 500 when the service fails", async () => {
        h.chatbotService.ask.mockRejectedValue(new Error("boom"));
        const res = await request(app)
            .post("/ask")
            .send({ question: "Vad är en kurs?" });
        expect(res.status).toBe(500);
    });

    it("serves the /status endpoint", async () => {
        const res = await request(app).get("/status");
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe("available");
    });
});

describe("auditRoutes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns audit logs without an action filter", async () => {
        h.auditModel.countDocuments.mockResolvedValue(2);
        h.auditModel.find.mockReturnValue(queryChain([{ action: "upload" }, { action: "delete" }]));
        const res = await request(app).get("/st123");
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.logs).toHaveLength(2);
        expect(res.body.page).toBe(1);
        expect(h.auditModel.find).toHaveBeenCalledWith({ studentId: "st123" });
    });

    it("applies the action filter when valid", async () => {
        h.auditModel.countDocuments.mockResolvedValue(1);
        h.auditModel.find.mockReturnValue(queryChain([{ action: "upload" }]));
        const res = await request(app).get("/st123?action=upload&page=2&limit=5");
        expect(res.status).toBe(200);
        expect(res.body.page).toBe(2);
        expect(res.body.limit).toBe(5);
        expect(h.auditModel.find).toHaveBeenCalledWith({ studentId: "st123", action: "upload" });
    });

    it("ignores an unsupported action filter", async () => {
        h.auditModel.countDocuments.mockResolvedValue(0);
        h.auditModel.find.mockReturnValue(queryChain([]));
        const res = await request(app).get("/st123?action=bogus");
        expect(res.status).toBe(200);
        expect(h.auditModel.find).toHaveBeenCalledWith({ studentId: "st123" });
    });

    it("returns 500 when the query fails", async () => {
        h.auditModel.countDocuments.mockRejectedValue(new Error("boom"));
        const res = await request(app).get("/st123");
        expect(res.status).toBe(500);
    });
});