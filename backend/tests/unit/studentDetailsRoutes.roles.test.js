import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

// The controller is irrelevant here: the point of these tests is the
// `hasRole` guard mounted in front of it. The router imports many handlers, so
// every export resolves to the same 200 stub.
vi.mock("../../src/controllers/studentDetailsController.js", () => {
    const handler = async (_req, res) => res.status(200).json({ ok: true });
    return {
        __esModule: true,
        addComment: handler,
        createDeviation: handler,
        deleteComment: handler,
        editComment: handler,
        getChangeHistory: handler,
        getDeviations: handler,
        getRevisionReasons: handler,
        getStudentDetails: handler,
        getStudyplanRevisionHistory: handler,
        getSupportInfo: handler,
        markCommentSeen: handler,
        reactivateStudentWithCourses: handler,
        removeStudentDropout: handler,
        reviseStudyPlan: handler,
        setStudentDropout: handler,
        updateDeviation: handler,
        updateStudentInfo: handler,
        updateSupportInfo: handler,
    };
});

import router from "../../src/router/studentDetailsRoutes.js";

// `isAuthenticated` short-circuits when req.user is already populated, so the
// app can inject a fully hydrated user and exercise the real role guard.
const buildApp = (user) => {
    const app = express();
    app.use((req, _res, next) => {
        if (user) {
            req.user = user;
            // Pre-hydrated: skip the DB round-trip inside refreshUserAuthorization.
            req.__authorizationRefreshed = true;
        }
        next();
    });
    app.use(router);
    return app;
};

const asUser = (role, municipalities = ["Stockholm"]) => ({
    userId: `user-${role}`,
    roles: [role],
    role,
    permissions: {},
    active: true,
    municipalities,
});

const allowed = ["systemadmin", "admin", "syv", "specped"];
const denied = ["teacher", "coordinator", "student", "tester"];

describe("student details read endpoints — role guard", () => {
    describe("GET /student-details/:id/support", () => {
        it.each(allowed)("allows %s", async (role) => {
            const res = await request(buildApp(asUser(role)))
                .get("/student-details/507f1f77bcf86cd799439011/support");
            expect(res.status).toBe(200);
        });

        // Regression AV-2: teacher/coordinator are stripped of supportInfo by
        // projectStudentForViewer, so this endpoint must not serve it to them.
        it.each(["teacher", "coordinator", "student", "tester"])(
            "denies %s with 403",
            async (role) => {
                const res = await request(buildApp(asUser(role)))
                    .get("/student-details/507f1f77bcf86cd799439011/support");
                expect(res.status).toBe(403);
            }
        );

        it("denies an unauthenticated request with 401", async () => {
            const res = await request(buildApp(null))
                .get("/student-details/507f1f77bcf86cd799439011/support");
            expect(res.status).toBe(401);
        });
    });

    describe("GET /student-details/:id/deviations", () => {
        it.each(allowed)("allows %s", async (role) => {
            const res = await request(buildApp(asUser(role)))
                .get("/student-details/507f1f77bcf86cd799439011/deviations");
            expect(res.status).toBe(200);
        });

        // Regression AV-2: same rule as /support.
        it.each(["teacher", "coordinator", "student", "tester"])(
            "denies %s with 403",
            async (role) => {
                const res = await request(buildApp(asUser(role)))
                    .get("/student-details/507f1f77bcf86cd799439011/deviations");
                expect(res.status).toBe(403);
            }
        );

        it("denies an unauthenticated request with 401", async () => {
            const res = await request(buildApp(null))
                .get("/student-details/507f1f77bcf86cd799439011/deviations");
            expect(res.status).toBe(401);
        });
    });
});
