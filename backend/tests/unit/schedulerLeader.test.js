import { describe, it, expect, afterEach } from "vitest";
import { isSchedulerLeader } from "../../src/services/scheduler.js";

describe("isSchedulerLeader (pm2 cluster guard)", () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it("runs jobs in a plain node process (no pm2)", () => {
        delete process.env.NODE_APP_INSTANCE;
        delete process.env.SCHEDULER_ENABLED;
        expect(isSchedulerLeader()).toBe(true);
    });

    it("runs jobs only on pm2 worker 0", () => {
        process.env.NODE_APP_INSTANCE = "0";
        expect(isSchedulerLeader()).toBe(true);
        process.env.NODE_APP_INSTANCE = "1";
        expect(isSchedulerLeader()).toBe(false);
        process.env.NODE_APP_INSTANCE = "7";
        expect(isSchedulerLeader()).toBe(false);
    });

    it("SCHEDULER_ENABLED=false disables jobs even on worker 0", () => {
        process.env.NODE_APP_INSTANCE = "0";
        process.env.SCHEDULER_ENABLED = "false";
        expect(isSchedulerLeader()).toBe(false);
    });
});
