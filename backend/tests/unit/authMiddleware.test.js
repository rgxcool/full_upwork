import { describe, it, expect, vi, afterEach } from "vitest";
import { isAuthenticated, hasRole } from "../../src/middleware/auth.js";
import * as authController from "../../src/controllers/authController.js";

describe("auth middleware", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("isAuthenticated delegates to authenticateUser", () => {
        const authSpy = vi
            .spyOn(authController, "authenticateUser")
            .mockImplementation(() => {});
        const req = {};
        const res = {};
        const next = vi.fn();

        isAuthenticated(req, res, next);

        expect(authSpy).toHaveBeenCalledWith(req, res, next);
    });

    it("hasRole returns 401 when user or role missing", () => {
        const middleware = hasRole(["admin"]);
        const req = {};
        const json = vi.fn();
        const res = {
            status(code) {
                this.statusCode = code;
                return this;
            },
            json,
        };
        const next = vi.fn();

        middleware(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(json).toHaveBeenCalledWith({ error: "Unauthorized" });
        expect(next).not.toHaveBeenCalled();
    });

    it("hasRole returns 403 when role not allowed", () => {
        const middleware = hasRole(["admin"]);
        const req = { user: { role: "student" } };
        const json = vi.fn();
        const res = {
            status(code) {
                this.statusCode = code;
                return this;
            },
            json,
        };
        const next = vi.fn();

        middleware(req, res, next);

        expect(res.statusCode).toBe(403);
        expect(json).toHaveBeenCalledWith({ error: "Forbidden" });
        expect(next).not.toHaveBeenCalled();
    });

    it("hasRole calls next for allowed roles", () => {
        const middleware = hasRole(["teacher", "admin"]);
        const req = { user: { role: "teacher" } };
        const res = {};
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
    });
});
