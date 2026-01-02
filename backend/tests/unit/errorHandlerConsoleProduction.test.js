import { describe, it, expect, vi } from "vitest";

const createWinstonMock = () => {
    const mockLogger = {
        add: vi.fn(),
        error: vi.fn(),
    };

    const FakeTransport = class {};

    const format = {
        combine: (...args) => args,
        timestamp: vi.fn(() => () => "timestamp"),
        errors: vi.fn(() => (input) => input),
        json: vi.fn(() => (input) => input),
        colorize: vi.fn(() => (input) => input),
        simple: vi.fn(() => (input) => input),
    };

    const transports = {
        File: FakeTransport,
        Console: FakeTransport,
    };

    const mockModule = {
        __esModule: true,
        default: {
            format,
            transports,
            createLogger: vi.fn(() => mockLogger),
        },
    };

    return { mockModule, mockLogger };
};

describe("errorHandler console transport in production", () => {
    it("does not register console logging when NODE_ENV=production", async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        vi.resetModules();
        const { mockModule, mockLogger } = createWinstonMock();
        vi.doMock("winston", () => mockModule);

        try {
            const { logger } = await import("../../src/utils/errorHandler.js");

            expect(logger).toBe(mockLogger);
            expect(logger.add).not.toHaveBeenCalled();
        } finally {
            process.env.NODE_ENV = originalEnv;
            vi.resetModules();
        }
    });
});
