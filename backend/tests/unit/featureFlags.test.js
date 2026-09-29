import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getPublicFeatureFlags,
    isFeatureEnabled,
    requireFeature,
} from "../../src/config/featureFlags.js";

const FEATURE_KEYS = [
    "MESSAGING",
    "CERTIFICATES",
    "FAQ",
    "LMS",
    "APL",
    "PROVNINGAR",
    "INACTIVITY",
    "ANALYTICS",
    "QUESTION_BANK",
    "ACTION_PLANS",
    "APPOINTMENTS",
];

const originalEnvironment = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, process.env[`FEATURE_${key}`]])
);

const clearFeatureEnvironment = () => {
    for (const key of FEATURE_KEYS) {
        delete process.env[`FEATURE_${key}`];
    }
};

describe("feature flags", () => {
    beforeEach(() => {
        clearFeatureEnvironment();
    });

    afterEach(() => {
        clearFeatureEnvironment();
        for (const key of FEATURE_KEYS) {
            const value = originalEnvironment[key];
            if (value === undefined) {
                delete process.env[`FEATURE_${key}`];
            } else {
                process.env[`FEATURE_${key}`] = value;
            }
        }
    });

    it("defaults every feature to enabled", () => {
        expect(getPublicFeatureFlags()).toEqual(
            Object.fromEntries(FEATURE_KEYS.map((key) => [key, true]))
        );
        expect(isFeatureEnabled("MESSAGING")).toBe(true);
    });

    it("parses false-like environment values", () => {
        for (const value of ["false", "0", "no", "off"]) {
            process.env.FEATURE_MESSAGING = value;
            expect(isFeatureEnabled("FEATURE_MESSAGING")).toBe(false);
        }

        process.env.FEATURE_MESSAGING = "true";
        expect(isFeatureEnabled("messaging")).toBe(true);
    });

    it("returns the exact disabled-feature response", () => {
        process.env.FEATURE_MESSAGING = "false";
        const res = { status: vi.fn(), json: vi.fn() };
        res.status.mockReturnValue(res);
        const next = vi.fn();

        requireFeature("MESSAGING")({}, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            error: { message: "Feature not available" },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it("allows unknown features by default", () => {
        expect(isFeatureEnabled("UNKNOWN")).toBe(true);
        expect(() => requireFeature("UNKNOWN")({}, {}, vi.fn())).not.toThrow();
    });
});
