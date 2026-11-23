import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import bcrypt from "bcrypt";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { createTeacher, DEFAULT_TEACHER } from "../../scripts/createTeacher.js";

describe("scripts/createTeacher", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    afterEach(async () => {
        await User.deleteMany({});
        await Teacher.deleteMany({});
    });

    it("creates a teacher user and Teacher profile that can log in", async () => {
        const result = await createTeacher();

        expect(result.action).toBe("created");
        const user = await User.findOne({ email: DEFAULT_TEACHER.email });
        expect(user.roles).toEqual(["teacher"]);
        expect(user.mustChangePassword).toBe(false);
        expect(await bcrypt.compare(DEFAULT_TEACHER.password, user.password)).toBe(true);

        const teacher = await Teacher.findOne({ userId: user._id });
        expect(teacher.subject).toBe(DEFAULT_TEACHER.subject);
        expect(teacher.colorCode).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it("is safe to re-run: no duplicates, password reset to the given one", async () => {
        await createTeacher({ password: "Forsta123!" });
        const second = await createTeacher({ password: "Andra123!" });

        expect(second.action).toBe("updated");
        expect(await User.countDocuments({ email: DEFAULT_TEACHER.email })).toBe(1);
        expect(await Teacher.countDocuments({})).toBe(1);
        const user = await User.findOne({ email: DEFAULT_TEACHER.email });
        expect(await bcrypt.compare("Andra123!", user.password)).toBe(true);
    });

    it("repairs an existing non-teacher account without dropping its roles", async () => {
        await User.create({
            name: "Test Admin",
            email: "test.admin@example.se",
            password: "x".repeat(20),
            roles: ["admin"],
            active: false,
        });

        const result = await createTeacher({ email: "Test.Admin@example.se" });

        expect(result.changes).toEqual(
            expect.arrayContaining(["add teacher role", "reactivate account", "create Teacher profile"])
        );
        const user = await User.findOne({ email: "test.admin@example.se" });
        expect(user.roles).toEqual(["admin", "teacher"]);
        expect(user.active).toBe(true);
        expect(await Teacher.countDocuments({ userId: user._id })).toBe(1);
    });

    it("writes nothing in dry-run mode", async () => {
        const result = await createTeacher({}, { dryRun: true });

        expect(result.action).toBe("would-create");
        expect(await User.countDocuments({})).toBe(0);
        expect(await Teacher.countDocuments({})).toBe(0);
    });
});
