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
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import { reactivateStudent } from "../../src/services/dropoutService.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

describe("dropoutService.reactivateStudent", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Student.deleteMany({});
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("returns null when no student document is given", async () => {
        const result = await reactivateStudent({ studentDoc: null, userId: "u1", role: "admin" });
        expect(result).toBeNull();
    });

    it("clears the dropout flag and records a re_registration entry", async () => {
        const student = await Student.create({
            name: "S",
            personalNumber: "19900101-1234",
            email: "s@example.com",
            dropout: true,
        });
        const userId = new mongoose.Types.ObjectId().toString();
        const result = await reactivateStudent({ studentDoc: student, userId, role: "admin" });
        expect(result.dropout).toBe(false);
        const reloaded = await Student.findById(student._id);
        expect(reloaded.dropout).toBe(false);
        const entry = reloaded.changeHistory.find((h) => h.changes.includes("re_registration"));
        expect(entry).toBeDefined();
        expect(entry.changedBy.toString()).toBe(userId);
        expect(entry.changedByRole).toBe("admin");
        expect(entry.previousValues.dropout).toBe(true);
    });

    it("removes inactivity warning markers and uses default actor values", async () => {
        const student = await Student.create({
            name: "S",
            personalNumber: "19900101-1234",
            email: "s@example.com",
            changeHistory: [
                { timestamp: new Date(), changedBy: new mongoose.Types.ObjectId(), changes: ["inactivity_warning_email"] },
            ],
        });
        const result = await reactivateStudent({ studentDoc: student });
        const reloaded = await Student.findById(student._id);
        expect(result.changeHistory.some((h) => h.changes.includes("inactivity_warning_email"))).toBe(false);
        const entry = reloaded.changeHistory.find((h) => h.changes.includes("re_registration"));
        expect(entry.changedByRole).toBe("system");
        expect(entry.changedBy).toBeNull();
    });

    it("does not touch the document when it is neither dropout nor marked", async () => {
        const student = await Student.create({
            name: "S",
            personalNumber: "19900101-1234",
            email: "s@example.com",
        });
        const result = await reactivateStudent({ studentDoc: student, userId: new mongoose.Types.ObjectId().toString(), role: "admin" });
        const reloaded = await Student.findById(student._id);
        expect(reloaded.changeHistory || []).toHaveLength(0);
        expect(result.changeHistory || []).toEqual([]);
    });
});