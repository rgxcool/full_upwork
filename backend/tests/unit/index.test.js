import request from "supertest";
import { describe, it, expect, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.MONGO_URI = "mongodb://mock-host/mindful-test";

vi.mock("dotenv", () => ({
  default: {
    config: vi.fn(),
  },
}));
vi.mock("../../src/middleware/security.js", () => {
  const securityHeaders = vi.fn((req, res, next) => next());
  const requestLogger = vi.fn((req, res, next) => next());
  const securityAudit = vi.fn((req, res, next) => next());
  const rateLimiter = vi.fn((req, res, next) => next());
  const apiRateLimiter = vi.fn((req, res, next) => next());
  return {
    securityHeaders,
    corsConfig: { origin: ["*"], methods: ["GET"] },
    requestLogger,
    securityAudit,
    rateLimiter,
    apiRateLimiter,
  };
});
vi.mock("../../src/utils/errorHandler.js", () => {
  const performanceMonitor = vi.fn((req, res, next) => next());
  const globalErrorHandler = vi.fn((err, req, res, next) => next());
  const errorMonitor = {
    getErrorStats: vi.fn(() => ({ total: 0 })),
    recordError: vi.fn(),
  };
  return {
    performanceMonitor,
    globalErrorHandler,
    errorMonitor,
  };
});
vi.mock("../../src/utils/performance.js", () => {
  const configurePool = vi.fn();
  const createIndexes = vi.fn();
  const optimizeQuery = vi.fn((req, res, next) => next());
  return {
    dbOptimizer: {
      configurePool,
      createIndexes,
    },
    requestOptimizer: {
      optimizeQuery,
    },
  };
});
vi.mock("../../src/router/router.js", async () => {
  const express = await vi.importActual("express");
  const router = express.Router();
  router.get("/mock", (req, res) => res.json({ ok: true }));
  return { default: router };
});
vi.mock("mongoose", () => ({
  default: {
    connection: {
      readyState: 0,
      host: "mockhost",
      name: "mockdb",
      close: vi.fn((cb) => cb && cb()),
    },
    connect: vi.fn(() => Promise.resolve()),
  },
}));

import { apiRateLimiter } from "../../src/middleware/security.js";
import { dbOptimizer } from "../../src/utils/performance.js";
import app from "../../index.js";

describe("index server setup", () => {
  it("calls the database pool configuration", () => {
    expect(dbOptimizer.configurePool).toHaveBeenCalled();
  });

  it("responds to health check", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
    expect(res.body.environment).toBe("test");
    expect(res.body.database).toBe("disconnected");
    expect(res.body.performance).toEqual({ total: 0 });
  });

  it("responds to metrics", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.body.database.readyState).toBe(0);
    expect(res.body.database.host).toBe("mockhost");
    expect(res.body.system.nodeVersion).toBe(process.version);
    expect(res.body.errors).toEqual({ total: 0 });
  });

  it("applies the limited api rate limiter for students when in test mode", async () => {
    apiRateLimiter.mockClear();
    await request(app).get("/api/students");
    expect(apiRateLimiter).toHaveBeenCalled();
  });
});
