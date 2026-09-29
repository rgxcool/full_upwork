import { describe, it, expect, beforeEach, vi } from "vitest";

const { mongooseMock, students, teachers, filesCollection } = vi.hoisted(() => {
    const students = {
        findById: vi.fn(),
        findOne: vi.fn(),
    };
    const teachers = { findOne: vi.fn() };
    const filesCollection = { findOne: vi.fn() };
    const mongooseMock = {
        connection: { db: { collection: vi.fn(() => filesCollection) } },
        model: vi.fn((name) => (name === "Student" ? students : name === "Teacher" ? teachers : {})),
        Types: { ObjectId: class { constructor(v) { this.value = v; } } },
    };
    return { mongooseMock, students, teachers, filesCollection };
});

vi.mock("mongoose", () => ({ __esModule: true, default: mongooseMock }));
vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// uploadRoutes pulls these in for unrelated routes; stub them so the real
// Mongoose model graph (and its Schema.Types usage) never loads here.
vi.mock("../../src/controllers/studentController.js", () => ({
    __esModule: true,
    uploadXlsx: vi.fn(),
}));
vi.mock("../../src/controllers/authController.js", () => ({
    __esModule: true,
    authenticateUser: (_req, _res, next) => next(),
}));
vi.mock("../../src/middleware/auth.js", () => ({
    __esModule: true,
    hasRole: () => (_req, _res, next) => next(),
}));
vi.mock("../../src/middleware/security.js", () => ({
    __esModule: true,
    uploadRateLimiter: (_req, _res, next) => next(),
}));

import { checkFileAccess } from "../../src/router/uploadRoutes.js";

const FILE_ID = "507f1f77bcf86cd799439011";
const STUDENT_ID = "507f1f77bcf86cd799439099";

// `checkFileAccess` reaches the GridFS bucket through
// mongoose.connection.db.collection("fs.files") and the owning student through
// mongoose.model("Student").
const buildRes = () => ({
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
});

const buildReq = (user, method = "GET") => ({
    params: { fileId: FILE_ID },
    method,
    user,
});

// lean() is chained onto the findById() result.
const withStudent = (student) => ({
    select: () => ({ lean: async () => student }),
});

const scopedStaff = (municipalities) => ({
    userId: "staff-1",
    roles: ["coordinator"],
    role: "coordinator",
    municipalities,
});

describe("checkFileAccess — GridFS tenant boundary (AV-10)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mongooseMock.Types.ObjectId.isValid = () => true;
        filesCollection.findOne.mockResolvedValue({
            _id: FILE_ID,
            filename: "doris-extra.png",
            metadata: { studentId: STUDENT_ID },
        });
        students.findById.mockReturnValue(withStudent({ municipality: { type: "Upplands Bro" } }));
    });

    it.each(["coordinator", "syv", "specped"])(
        "403 for a municipality-scoped %s reading another municipality's file",
        async (role) => {
            const user = { userId: "s", roles: [role], role, municipalities: ["Stockholm"] };
            const res = buildRes();
            const next = vi.fn();

            await checkFileAccess(buildReq(user), res, next);

            expect(res.statusCode).toBe(403);
            expect(next).not.toHaveBeenCalled();
        }
    );

    it("allows a scoped staffer whose municipality matches the student", async () => {
        const user = scopedStaff(["Upplands Bro"]);
        const res = buildRes();
        const next = vi.fn();
        const req = buildReq(user);

        await checkFileAccess(req, res, next);

        expect(res.statusCode).toBe(200);
        expect(next).toHaveBeenCalledWith();
        expect(req.fileRecord).toMatchObject({ filename: "doris-extra.png" });
    });

    it("still allows a global (unscoped) staffer", async () => {
        const user = { userId: "s", roles: ["coordinator"], role: "coordinator", municipalities: [] };
        const res = buildRes();
        const next = vi.fn();

        await checkFileAccess(buildReq(user), res, next);

        expect(res.statusCode).toBe(200);
        expect(next).toHaveBeenCalled();
    });

    it("fails closed for scoped staff when the owning student no longer exists", async () => {
        students.findById.mockReturnValue(withStudent(null));
        const res = buildRes();
        const next = vi.fn();

        await checkFileAccess(buildReq(scopedStaff(["Stockholm"])), res, next);

        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("403 on DELETE for a scoped staffer from another municipality", async () => {
        const res = buildRes();
        const next = vi.fn();

        await checkFileAccess(buildReq(scopedStaff(["Stockholm"]), "DELETE"), res, next);

        expect(res.statusCode).toBe(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("still returns 404 for a missing file before any tenant check", async () => {
        filesCollection.findOne.mockResolvedValue(null);
        const res = buildRes();
        const next = vi.fn();

        await checkFileAccess(buildReq(scopedStaff(["Stockholm"])), res, next);

        expect(res.statusCode).toBe(404);
        expect(next).not.toHaveBeenCalled();
    });
});
