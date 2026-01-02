import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";

const listenSpy = vi
    .spyOn(express.application, "listen")
    .mockImplementation(() => ({
        close: () => {},
    }));

const mockDotenvConfig = vi.fn();
vi.mock("dotenv", () => ({
    __esModule: true,
    default: {
        config: (opts) => mockDotenvConfig(opts),
    },
}));

const mockCors = vi.fn(() => (req, res, next) => next());
vi.mock("cors", () => ({
    __esModule: true,
    default: mockCors,
}));

const mockSecurity = {
    securityHeaders: (req, res, next) => next(),
    corsConfig: { origin: "*" },
    requestLogger: (req, res, next) => next(),
    securityAudit: (req, res, next) => next(),
    rateLimiter: (req, res, next) => next(),
    apiRateLimiter: (req, res, next) => next(),
};
vi.mock("../../src/middleware/security.js", () => ({
    __esModule: true,
    ...mockSecurity,
}));

const errorMonitor = {
    getErrorStats: vi.fn().mockReturnValue({ errors: 0 }),
    recordError: vi.fn(),
};
vi.mock("../../src/utils/errorHandler.js", () => ({
    __esModule: true,
    globalErrorHandler: (err, req, res, next) => next(),
    performanceMonitor: (req, res, next) => next(),
    errorMonitor,
}));

const requestOptimizer = {
    optimizeQuery: (req, res, next) => next(),
};
const dbOptimizer = {
    configurePool: vi.fn(),
    createIndexes: vi.fn().mockResolvedValue(),
};
vi.mock("../../src/utils/performance.js", () => ({
    __esModule: true,
    dbOptimizer,
    requestOptimizer,
}));

const routerMock = (req, res, next) => next();
routerMock.use = () => routerMock;
vi.mock("../../src/router/router.js", () => ({
    __esModule: true,
    default: routerMock,
}));

const mongooseConnect = vi.fn(() => Promise.resolve());
const mongooseConnection = {
    readyState: 1,
    host: "localhost",
    name: "testdb",
    close: (cb) => cb && cb(),
};
vi.mock("mongoose", () => ({
    __esModule: true,
    default: {
        connect: mongooseConnect,
        connection: mongooseConnection,
    },
}));

const mockStudentMiddleware = (req, res, next) => next();
vi.mock("../../src/utils/parseStudentExcel.js", () => ({
    __esModule: true,
    parseStudentExcel: mockStudentMiddleware,
    normalizeCodeForMatching: (input) => input,
}));

const loadApp = async (env) => {
    vi.resetModules();
    process.env.NODE_ENV = env;
    process.env.JWT_SECRET = "test-secret";
    process.env.PORT = "5001";
    return (await import("../../index.js")).default;
};

afterEach(() => {
    listenSpy.mockClear();
    mockDotenvConfig.mockClear();
    errorMonitor.getErrorStats.mockClear();
    mongooseConnect.mockClear();
    dbOptimizer.configurePool.mockClear();
});

describe("backend index setup", () => {
    it("loads test env, sets JWT_SECRET, and exposes health + metrics", async () => {
        const app = await loadApp("test");

        const health = await request(app).get("/health");
        expect(health.status).toBe(200);
        expect(health.body.environment).toBe("test");
        expect(health.body.database).toBe("connected");

        const metrics = await request(app).get("/metrics");
        expect(metrics.status).toBe(200);
        expect(metrics.body.system).toHaveProperty("nodeVersion");

        expect(mockDotenvConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                path: expect.stringContaining(".env.test"),
            })
        );
        expect(dbOptimizer.configurePool).toHaveBeenCalled();
    });

    it("starts mongo connection and listens when not in test env", async () => {
        await loadApp("development");
        expect(mongooseConnect).toHaveBeenCalled();
        expect(listenSpy).toHaveBeenCalled();
    });
});
