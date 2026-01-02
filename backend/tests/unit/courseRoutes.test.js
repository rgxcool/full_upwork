import { describe, it, expect, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import Course from "../../src/models/Course.js";
import router from "../../src/router/courseRoutes.js";

const buildRes = () => {
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
    return res;
};

const getRouteHandler = (path) => {
    const layer = router.stack.find((item) => item.route?.path === path);
    if (!layer) {
        throw new Error(`Route ${path} not found`);
    }
    return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe("courseRoutes handlers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /courses/id handler", () => {
        it("returns course id for a course name", async () => {
            const courseId = new mongoose.Types.ObjectId();
            vi.spyOn(Course, "findOne").mockResolvedValueOnce({
                _id: courseId,
            });

            const handler = getRouteHandler("/courses/id");
            const req = { query: { name: "Alpha Course" } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ courseId });
        });

        it("returns 404 when course name is not found", async () => {
            vi.spyOn(Course, "findOne").mockResolvedValueOnce(null);

            const handler = getRouteHandler("/courses/id");
            const req = { query: { name: "Missing Course" } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Course not found." });
        });

        it("returns 500 when lookup fails", async () => {
            vi.spyOn(Course, "findOne").mockRejectedValueOnce(
                new Error("findOne failure")
            );

            const handler = getRouteHandler("/courses/id");
            const req = { query: { name: "Any" } };
            const res = buildRes();

            await handler(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Internal Server Error" });
        });
    });
});
