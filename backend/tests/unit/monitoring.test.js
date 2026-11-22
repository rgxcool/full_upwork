import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    shouldEnableMonitoring,
    registerMonitoring,
    isMonitoringEnabled,
    withJobMonitor,
    captureException,
} from "../../src/utils/monitoring.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, "../../src");

const fakeSentry = () => ({
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((cb) => cb({ setUser: vi.fn(), setTag: vi.fn() })),
    withMonitor: vi.fn((_slug, cb) => cb()),
    flush: vi.fn(async () => true),
});

describe("monitoring is development-only", () => {
    const savedEnv = { ...process.env };
    afterEach(() => {
        process.env = { ...savedEnv };
    });

    it("never enables in production or test, even with a DSN", () => {
        expect(shouldEnableMonitoring({ SENTRY_DSN: "x", NODE_ENV: "production" })).toBe(false);
        expect(shouldEnableMonitoring({ SENTRY_DSN: "x", NODE_ENV: "test" })).toBe(false);
    });

    it("needs a DSN", () => {
        expect(shouldEnableMonitoring({ NODE_ENV: "development" })).toBe(false);
        expect(shouldEnableMonitoring({ SENTRY_DSN: "x", NODE_ENV: "development" })).toBe(true);
    });

    it("refuses to register in production", () => {
        process.env.NODE_ENV = "production";
        expect(() => registerMonitoring(fakeSentry())).toThrow(/production/);
    });

    it("is a no-op until registered (production behaviour)", async () => {
        expect(isMonitoringEnabled()).toBe(false);
        expect(() => captureException(new Error("x"))).not.toThrow();
        await expect(withJobMonitor("job", async () => 7)).resolves.toBe(7);
    });

    it("no application module imports @sentry/* (keeps it out of production)", () => {
        const files = [];
        const walk = (dir) => {
            for (const name of readdirSync(dir)) {
                const full = path.join(dir, name);
                if (statSync(full).isDirectory()) walk(full);
                else if (full.endsWith(".js")) files.push(full);
            }
        };
        walk(srcDir);
        walk(path.join(here, "../../../frontend/src"));
        const offenders = files.filter((f) => {
            const code = readFileSync(f, "utf8");
            const isFrontendMain = f.endsWith(path.join("frontend", "src", "main.js"));
            // main.js may only import Sentry dynamically inside an import.meta.env.DEV branch.
            if (isFrontendMain) return /^\s*import\s[^(]*from\s+['"]@sentry\//m.test(code);
            return /from\s+['"]@sentry\/|import\(\s*['"]@sentry\//.test(code);
        });
        expect(offenders).toEqual([]);
    });
});

describe("withJobMonitor once registered (development)", () => {
    const savedEnv = { ...process.env };
    afterEach(() => {
        process.env = { ...savedEnv };
    });

    it("reports a failing job and re-throws to the scheduler's own catch", async () => {
        process.env.NODE_ENV = "development";
        const sentry = fakeSentry();
        registerMonitoring(sentry);
        const boom = new Error("diploma PDF failed");
        await expect(
            withJobMonitor("nightly-automatic-diploma-scan", async () => {
                throw boom;
            })
        ).rejects.toBe(boom);
        expect(sentry.captureException).toHaveBeenCalledWith(boom, {
            tags: { job: "nightly-automatic-diploma-scan" },
        });
        expect(sentry.withMonitor).not.toHaveBeenCalled(); // crons are opt-in
    });

    it("uses a cron monitor only with SENTRY_CRONS=true", async () => {
        process.env.NODE_ENV = "development";
        process.env.SENTRY_CRONS = "true";
        const sentry = fakeSentry();
        registerMonitoring(sentry);
        const cfg = { schedule: { type: "crontab", value: "0 2 * * *" } };
        await expect(withJobMonitor("nightly-x", async () => 1, cfg)).resolves.toBe(1);
        expect(sentry.withMonitor).toHaveBeenCalledWith("nightly-x", expect.any(Function), cfg);
    });
});
