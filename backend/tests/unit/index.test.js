import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { dbOptimizer } from "../../src/utils/performance.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";

const stubModels = new Map();
let app;

beforeAll(async () => {
    mongoose.connection.readyState = 1;
    mongoose.connection.host = "localhost";
    mongoose.connection.name = "mindful-test";
    mongoose.connection.close = vi.fn();

    vi.spyOn(dbOptimizer, "configurePool");

    vi.spyOn(mongoose, "model").mockImplementation((name) => {
        if (!stubModels.has(name)) {
            stubModels.set(name, {
                find: vi.fn().mockResolvedValue([]),
                findOne: vi.fn().mockResolvedValue(null),
                findById: vi.fn().mockResolvedValue(null),
                deleteMany: vi.fn().mockResolvedValue({}),
                create: vi.fn().mockResolvedValue({}),
                populate: vi.fn().mockReturnThis(),
                lean: vi.fn().mockReturnThis(),
                exec: vi.fn().mockResolvedValue([]),
            });
        }
        return stubModels.get(name);
    });

    const imported = await import("../../index.js");
    app = imported.default;
});

afterEach(() => {
    vi.clearAllMocks();
});

afterAll(() => {
    vi.restoreAllMocks();
});

describe("backend index", () => {
    it("calls dbOptimizer.configurePool during boot", () => {
        expect(dbOptimizer.configurePool).toHaveBeenCalledOnce();
    });

    it("exposes a health endpoint", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("status", "OK");
        expect(res.body).toHaveProperty("environment", "test");
        expect(res.body.performance).toBeDefined();
    });

    it("exposes metrics that reference mongoose state", async () => {
        const res = await request(app).get("/metrics");
        expect(res.status).toBe(200);
        expect(res.body.errors).toBeDefined();
        expect(res.body.database.readyState).toBe(1);
        expect(res.body.system.nodeVersion).toBe(process.version);
    });
});
