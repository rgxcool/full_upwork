import { describe, it, expect, vi } from "vitest";

vi.mock("winston", () => {
    const logger = {
        add: vi.fn(),
        error: vi.fn(),
    };

    const format = {
        combine: (...args) => args,
        timestamp: vi.fn(() => () => "timestamp"),
        errors: vi.fn(() => (input) => input),
        json: vi.fn(() => (input) => input),
        colorize: vi.fn(() => (input) => input),
        simple: vi.fn(() => (input) => input),
    };

    class FakeTransport {}
    const transports = {
        File: FakeTransport,
        Console: FakeTransport,
    };

    const mockWinston = {
        format,
        transports,
        createLogger: vi.fn(() => logger),
    };

    return {
        __esModule: true,
        default: mockWinston,
    };
});

describe("errorHandler logger initialization", () => {
    it("adds console transport when not in production", async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";
        vi.resetModules();

        const { logger } = await import("../../src/utils/errorHandler.js");

        expect(logger.add).toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
    });
});
