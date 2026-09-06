import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

const h = vi.hoisted(() => {
    const studentFindOne = vi.fn();
    const aplFindOne = vi.fn();
    return { studentFindOne, aplFindOne };
});

vi.mock("../../src/models/Student.js", () => ({
    default: { findOne: h.studentFindOne },
}));
vi.mock("../../src/models/AplRecord.js", () => ({
    default: { findOne: h.aplFindOne },
}));

import router from "../../src/router/aplRoutes.js";

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
    if (!layer) throw new Error(`Route ${path} not found`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};

describe("GET /apl/my", () => {
    beforeEach(() => {
        h.studentFindOne.mockReset();
        h.aplFindOne.mockReset();
    });

    const studentQuery = (value) => ({ lean: vi.fn().mockResolvedValue(value) });
    const aplQuery = (value) => ({ lean: vi.fn().mockResolvedValue(value) });

    it("returns real APL record fields (not non-existent dummy fields)", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const cvId = new mongoose.Types.ObjectId();
        const contractId = new mongoose.Types.ObjectId();

        h.studentFindOne.mockReturnValue(
            studentQuery({
                _id: studentId,
                email: "elev@example.com",
                aplStatus: "GREEN",
                logbook: [{ entry: "x" }],
            })
        );
        h.aplFindOne.mockReturnValue(
            aplQuery({
                studentId,
                status: "BLUE",
                placementCompany: "Acme AB",
                placementContact: "Kalle",
                placementAddress: "Storgatan 1",
                internshipStartDate: new Date("2026-01-15"),
                internshipEndDate: new Date("2026-06-15"),
                requirements: "Krav",
                cvDocId: cvId,
                contractDocId: contractId,
            })
        );

        const handler = getRouteHandler("/apl/my");
        const req = { user: { email: "elev@example.com" } };
        const res = buildRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            status: "BLUE",
            aplStatus: "GREEN",
            placementCompany: "Acme AB",
            placementContact: "Kalle",
            placementAddress: "Storgatan 1",
            internshipStartDate: expect.any(Date),
            internshipEndDate: expect.any(Date),
            requirements: "Krav",
            hasCv: true,
            hasContract: true,
            hasLogbook: true,
        });
    });

    it("falls back to student aplStatus when no AplRecord exists", async () => {
        const studentId = new mongoose.Types.ObjectId();
        h.studentFindOne.mockReturnValue(
            studentQuery({
                _id: studentId,
                email: "elev2@example.com",
                aplStatus: "YELLOW",
                logbook: [],
            })
        );
        h.aplFindOne.mockReturnValue(aplQuery(null));

        const handler = getRouteHandler("/apl/my");
        const req = { user: { email: "elev2@example.com" } };
        const res = buildRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("YELLOW");
        expect(res.body.hasCv).toBe(false);
        expect(res.body.hasLogbook).toBe(false);
    });

    it("returns 404 when no student profile matches", async () => {
        h.studentFindOne.mockReturnValue(studentQuery(null));

        const handler = getRouteHandler("/apl/my");
        const req = { user: { email: "nosuch@example.com" } };
        const res = buildRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
    });
});
