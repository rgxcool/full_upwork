import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import User from "../../src/models/User.js";
import { can, canFeature } from "../../src/middleware/authorization.js";
import { hasRole } from "../../src/middleware/auth.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

/**
 * P1 — RBAC revocation: a long-lived JWT must not grant roles/permissions that
 * have since been revoked in the DB. These tests verify that the DB-backed
 * authorization refresh (refreshUserAuthorization) overrides stale JWT state.
 */
const buildCtx = (user) => {
    const next = vi.fn();
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return { req: { user }, res, next };
};

describe("DB-backed authorization revocation", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await User.deleteMany({});
    });

    afterEach(async () => {
        await User.deleteMany({});
        vi.restoreAllMocks();
    });

    it("still grants access using the user's current DB roles", async () => {
        const dbUser = await User.create({
            name: "Fresh Admin",
            email: "fresh-admin@example.com",
            password: "hash",
            roles: ["admin"],
        });
        // JWT-like user carrying the SAME roles as the DB.
        const req = {
            user: { userId: dbUser._id.toString(), role: "admin", roles: ["admin"] },
            originalUrl: "/api/all",
        };
        const { res, next } = buildCtx(req);
        await can("users:create")(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it("denies a role revoked in DB even when the JWT still claims it", async () => {
        const dbUser = await User.create({
            name: "Demoted Admin",
            email: "demoted-admin@example.com",
            password: "hash",
            roles: ["student"], // admin role REMOVED in DB
        });
        // Stale JWT still claims admin — must be overridden by DB.
        const req = {
            user: { userId: dbUser._id.toString(), role: "admin", roles: ["admin"] },
            originalUrl: "/api/all",
        };
        const { res, next } = buildCtx(req);
        await can("users:create")(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("denies access when a permission was revoked in DB", async () => {
        const dbUser = await User.create({
            name: "Revoked Perm Teacher",
            email: "revoked-teacher@example.com",
            password: "hash",
            roles: ["teacher"],
            permissions: { course_templates: false }, // curriculum feature revoked
        });
        const req = {
            user: {
                userId: dbUser._id.toString(),
                role: "teacher",
                roles: ["teacher"],
                permissions: { course_templates: true }, // stale JWT granted it
            },
            originalUrl: "/api/templates",
        };
        const { res, next } = buildCtx(req);
        await can("courseTemplates:read")(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("hasRole honors DB role changes over JWT role claims", async () => {
        const dbUser = await User.create({
            name: "Downgraded Staff",
            email: "downgraded@example.com",
            password: "hash",
            roles: ["student"],
        });
        const middleware = hasRole(["admin"]);
        const req = {
            user: { userId: dbUser._id.toString(), role: "admin", roles: ["admin"] },
            originalUrl: "/api/students",
        };
        const { res, next } = buildCtx(req);
        await middleware(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("denies a disabled (active:false) account despite a valid JWT", async () => {
        const dbUser = await User.create({
            name: "Disabled User",
            email: "disabled@example.com",
            password: "hash",
            roles: ["systemadmin"],
            active: false,
        });
        const req = {
            user: {
                userId: dbUser._id.toString(),
                role: "systemadmin",
                roles: ["systemadmin"],
            },
            originalUrl: "/api/all",
        };
        const { res, next } = buildCtx(req);
        await canFeature("statistics")(req, res, next);
        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });
});
