import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import {
    createRateLimiter,
    enhancedAuth,
    corsConfig,
    securityAudit,
} from "../../src/middleware/security.js";
import { AppError, AuthorizationError, logger } from "../../src/utils/errorHandler.js";

const buildRateLimitedApp = (setupRequest) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        if (setupRequest) {
            setupRequest(req);
        }
        next();
    });
    app.use(createRateLimiter(60 * 1000, 2, "Too many"));
    app.get("/limited", (req, res) => res.json({ ok: true }));
    return app;
};

describe("security middleware", () => {
    const originalJwtSecret = process.env.JWT_SECRET;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        process.env.JWT_SECRET = originalJwtSecret;
    });

    it("skips rate limiting for admin users", async () => {
        const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
        const app = buildRateLimitedApp((req) => {
            req.user = { role: "admin" };
        });

        const response = await request(app).get("/limited").expect(200);

        expect(response.body).toEqual({ ok: true });
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining("Rate limit SKIPPED: User is admin")
        );
    });

    it("logs when JWT secret is missing for rate limit checks", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        process.env.JWT_SECRET = "";
        const app = buildRateLimitedApp((req) => {
            req.cookies = { token: "token" };
        });

        const response = await request(app).get("/limited").expect(200);

        expect(response.body).toEqual({ ok: true });
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining("JWT_SECRET is not defined!")
        );
    });

    it("logs when JWT verification fails for rate limiting", async () => {
        const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
        process.env.JWT_SECRET = "secret";
        const app = buildRateLimitedApp((req) => {
            req.cookies = { token: "invalid" };
        });

        const response = await request(app).get("/limited").expect(200);

        expect(response.body).toEqual({ ok: true });
        expect(debugSpy).toHaveBeenCalledWith(
            expect.stringContaining("Rate limit applied: JWT verification failed:")
        );
    });

    it("logs when admin status check throws an error", async () => {
        const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => {});
        const app = buildRateLimitedApp((req) => {
            Object.defineProperty(req, "user", {
                get() {
                    throw new Error("boom");
                },
            });
        });

        const response = await request(app).get("/limited").expect(200);

        expect(response.body).toEqual({ ok: true });
        expect(debugSpy).toHaveBeenCalledWith(
            expect.stringContaining("Rate limit applied: Error checking admin status:")
        );
    });

    it("validates tokens through enhancedAuth.verifyToken", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        expect(enhancedAuth.verifyToken("token")).toBe(true);

        expect(() => enhancedAuth.verifyToken("")).toThrow(AppError);
        expect(() => enhancedAuth.verifyToken("")).toThrow("Invalid token");
        expect(errorSpy).toHaveBeenCalledWith(
            "Token verification failed:",
            expect.any(AppError)
        );
    });

    it("checks authentication state", () => {
        const next = vi.fn();
        enhancedAuth.isAuthenticated(
            { user: { userId: "user-1" } },
            {},
            next
        );
        expect(next).toHaveBeenCalledWith();

        const failNext = vi.fn();
        enhancedAuth.isAuthenticated({}, {}, failNext);
        expect(failNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it("enforces role requirements", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const next = vi.fn();

        const missingNext = vi.fn();
        enhancedAuth.hasRole("admin")({}, {}, missingNext);
        expect(missingNext).toHaveBeenCalledWith(
            expect.any(AuthorizationError)
        );

        enhancedAuth.hasRole("admin")(
            { user: { userId: "u1", role: "teacher" }, path: "/admin" },
            {},
            next
        );

        expect(warnSpy).toHaveBeenCalledWith(
            "Access denied: User u1 (teacher) tried to access /admin"
        );
        expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));

        const passNext = vi.fn();
        enhancedAuth.hasRole("admin")(
            { user: { userId: "u2", role: "admin" }, path: "/admin" },
            {},
            passNext
        );
        expect(passNext).toHaveBeenCalledWith();
    });

    it("enforces permissions with ownership override", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const next = vi.fn();

        const missingNext = vi.fn();
        enhancedAuth.hasPermission("read", "own_profile")({}, {}, missingNext);
        expect(missingNext).toHaveBeenCalledWith(
            expect.any(AuthorizationError)
        );

        enhancedAuth.hasPermission("read", "own_profile")(
            {
                user: { userId: "u1", role: "student" },
                params: { userId: "u1" },
            },
            {},
            next
        );
        expect(next).toHaveBeenCalledWith();

        const failNext = vi.fn();
        enhancedAuth.hasPermission("read", "all_students")(
            {
                user: { userId: "u2", role: "student" },
                params: { userId: "u3" },
            },
            {},
            failNext
        );

        expect(warnSpy).toHaveBeenCalledWith(
            "Permission denied: User u2 (student) tried to read all_students"
        );
        expect(failNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it("handles CORS origin checks", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        corsConfig.origin("http://localhost:5173", (err, allowed) => {
            expect(err).toBeNull();
            expect(allowed).toBe(true);
        });

        corsConfig.origin("http://evil.example.com", (err) => {
            expect(err).toBeInstanceOf(AppError);
            expect(err.message).toBe("Not allowed by CORS");
        });

        expect(warnSpy).toHaveBeenCalledWith(
            "CORS blocked request from origin: http://evil.example.com"
        );
    });

    it("blocks suspicious requests in securityAudit", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
        const app = express();
        app.use(express.json());
        app.post("/audit", securityAudit, (req, res) => res.json({ ok: true }));

        const response = await request(app)
            .post("/audit")
            .send({ payload: "<script>alert('x')</script>" })
            .expect(400);

        expect(response.body).toEqual({
            success: false,
            error: { message: "Invalid request detected" },
        });
        expect(errorSpy).toHaveBeenCalledWith(
            "Suspicious activity detected",
            expect.any(Object)
        );
    });

    it("logs when a valid token indicates an admin", async () => {
        const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
        process.env.JWT_SECRET = "secret";
        const token = jwt.sign({ role: "systemadmin" }, process.env.JWT_SECRET);
        const app = buildRateLimitedApp((req) => {
            req.cookies = { token };
        });

        const response = await request(app).get("/limited").expect(200);

        expect(response.body).toEqual({ ok: true });
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                "Rate limit SKIPPED: Token shows user is systemadmin"
            )
        );
    });
});
