import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { recordStudentLearningActivity } from "../../src/utils/learningActivity.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";

describe("recordStudentLearningActivity", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        await Student.deleteMany({});
    });

    it("records the timestamp on the student (non-fatal)", async () => {
        const student = await Student.create({
            name: "Aktiv Elev",
            personalNumber: "19920101-1234",
            email: "aktiv@elev.se",
        });
        expect(student.lastLearningActivityAt).toBeNull();

        const ok = await recordStudentLearningActivity(student._id);

        expect(ok).toBe(true);
        const reloaded = await Student.findById(student._id).lean();
        expect(reloaded.lastLearningActivityAt).toBeInstanceOf(Date);
    });

    it("returns false for an unknown student without throwing", async () => {
        const ok = await recordStudentLearningActivity(new mongoose.Types.ObjectId());
        expect(ok).toBe(false);
    });

    it("returns false without throwing on an invalid id", async () => {
        const ok = await recordStudentLearningActivity("not-an-object-id");
        expect(ok).toBe(false);
    });
});