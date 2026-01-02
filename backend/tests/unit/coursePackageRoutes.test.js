import { describe, it, expect, afterEach, vi } from "vitest";
import CoursePackage from "../../src/models/CoursePackage.js";
import router from "../../src/router/coursePackageRoutes.js";

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

describe("coursePackageRoutes handlers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /coursepackages", () => {
        it("returns all populated course packages", async () => {
            const mockData = [
                { coursePackageName: "Alpha" },
                { coursePackageName: "Beta" },
            ];
            const leanMock = vi.fn().mockResolvedValue(mockData);
            const populateMock = vi.fn().mockReturnValue({ lean: leanMock });
            vi.spyOn(CoursePackage, "find").mockReturnValue({
                populate: populateMock,
            });

            const handler = getRouteHandler("/coursepackages");
            const res = buildRes();

            await handler({}, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toBe(mockData);
            expect(populateMock).toHaveBeenCalledWith("coursePackageCourses");
            expect(leanMock).toHaveBeenCalled();
        });

        it("returns 500 when find fails", async () => {
            const leanMock = vi
                .fn()
                .mockRejectedValue(new Error("find failure"));
            vi.spyOn(CoursePackage, "find").mockReturnValue({
                populate: () => ({ lean: leanMock }),
            });

            const handler = getRouteHandler("/coursepackages");
            const res = buildRes();

            await handler({}, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Internal Server Error" });
        });
    });

    describe("GET /coursepackages/:id", () => {
        const params = { id: "abc123" };

        it("returns a populated course package", async () => {
            const expected = { _id: params.id };
            const leanMock = vi.fn().mockResolvedValue(expected);
            const populateMock = vi.fn().mockReturnValue({ lean: leanMock });
            vi.spyOn(CoursePackage, "findById").mockReturnValue({
                populate: populateMock,
            });

            const handler = getRouteHandler("/coursepackages/:id");
            const res = buildRes();

            await handler({ params }, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(expected);
        });

        it("returns 404 when the id is missing", async () => {
            const leanMock = vi.fn().mockResolvedValue(null);
            vi.spyOn(CoursePackage, "findById").mockReturnValue({
                populate: () => ({ lean: leanMock }),
            });

            const handler = getRouteHandler("/coursepackages/:id");
            const res = buildRes();

            await handler({ params }, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Course Package not found" });
        });

        it("returns 500 on unexpected errors", async () => {
            const leanMock = vi
                .fn()
                .mockRejectedValue(new Error("fail"));
            vi.spyOn(CoursePackage, "findById").mockReturnValue({
                populate: () => ({ lean: leanMock }),
            });

            const handler = getRouteHandler("/coursepackages/:id");
            const res = buildRes();

            await handler({ params }, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Internal Server Error" });
        });
    });

    describe("GET /coursepackages/:id/courses", () => {
        const params = { id: "collectionId" };

        it("returns courses for a package", async () => {
            const packagePayload = {
                coursePackageCourses: ["course1", "course2"],
            };
            const leanMock = vi.fn().mockResolvedValue(packagePayload);
            vi.spyOn(CoursePackage, "findById").mockReturnValue({
                populate: () => ({ lean: leanMock }),
            });

            const handler = getRouteHandler("/coursepackages/:id/courses");
            const res = buildRes();

            await handler({ params }, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(packagePayload.coursePackageCourses);
        });

        it("returns 404 when package missing", async () => {
            const leanMock = vi.fn().mockResolvedValue(null);
            vi.spyOn(CoursePackage, "findById").mockReturnValue({
                populate: () => ({ lean: leanMock }),
            });

            const handler = getRouteHandler("/coursepackages/:id/courses");
            const res = buildRes();

            await handler({ params }, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Course Package not found" });
        });

        it("returns 500 when fetching courses fails", async () => {
            const leanMock = vi
                .fn()
                .mockRejectedValue(new Error("courses fail"));
            vi.spyOn(CoursePackage, "findById").mockReturnValue({
                populate: () => ({ lean: leanMock }),
            });

            const handler = getRouteHandler("/coursepackages/:id/courses");
            const res = buildRes();

            await handler({ params }, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Internal Server Error" });
        });
    });
});
