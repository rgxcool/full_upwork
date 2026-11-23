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
import bcrypt from "bcrypt";
import User from "../../src/models/User.js";
import { createOrFindTeacher } from "../../src/utils/teacherService.js";
import { giveTeacherProfile } from "../helpers/teacherFixture.js";
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

import logger from "../../src/utils/logger.js";

const TEACHER_COLORS = [
    "#e6194b",
    "#3cb44b",
    "#ffe119",
    "#4363d8",
    "#f58231",
    "#911eb4",
    "#46f0f0",
    "#f032e6",
    "#bcf60c",
    "#fabebe",
    "#008080",
    "#e6beff",
    "#9a6324",
    "#fffac8",
    "#800000",
    "#aaffc3",
    "#808000",
    "#ffd8b1",
    "#000075",
    "#808080",
    "#ffffff",
    "#000000",
];

const buildUser = (overrides = {}) => {
    const { role, ...restOverrides } = overrides;
    const defaultRole = role || "teacher";
    const roles = overrides.roles || [defaultRole];

    return {
        username: "Teacher One",
        email: "teacher.one@example.com",
        password: "hashed-password",
        roles,
        ...restOverrides,
    };
};

describe("teacherService", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        logger.error.mockClear();
        logger.info.mockClear();
        logger.warn.mockClear();
        await User.deleteMany({});
    });

    afterEach(async () => {
        await User.deleteMany({});
        vi.restoreAllMocks();
    });

    const teacherCount = () => User.countDocuments({ teacherProfile: { $type: "object" } });

    it("returns an existing teacher when the username matches (case-insensitive)", async () => {
        const user = await User.create(
            buildUser({ username: "Alice Teacher", email: "alice.teacher@example.com" })
        );
        await giveTeacherProfile(user, { colorCode: "#123456", subject: "Math" });

        const result = await createOrFindTeacher("alice teacher");

        expect(result.wasCreated).toBe(false);
        expect(result.password).toBeNull();
        // One id per person (#102): the teacher is the User.
        expect(result.teacher._id.toString()).toBe(user._id.toString());
        expect(await User.countDocuments()).toBe(1);
    });

    it("treats regex characters in the name literally", async () => {
        const user = await User.create(buildUser({ username: "A.B (vik)", email: "ab@example.com" }));
        await giveTeacherProfile(user);
        vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-value");

        const found = await createOrFindTeacher("a.b (vik)");
        const other = await createOrFindTeacher("AxB (vik)");

        expect(found.wasCreated).toBe(false);
        expect(other.wasCreated).toBe(true);
    });

    it("deduplicates concurrent lookups for the same new teacher", async () => {
        const [first, second] = await Promise.all([
            createOrFindTeacher("Concurrent Teacher"),
            createOrFindTeacher("Concurrent Teacher"),
        ]);

        expect(first.teacher._id.toString()).toBe(second.teacher._id.toString());
        expect(await User.countDocuments({ username: "Concurrent Teacher" })).toBe(1);
        expect(await teacherCount()).toBe(1);
    });

    it("creates a teacher with a strong password and the next available color", async () => {
        const existingUser = await User.create(
            buildUser({ username: "Existing Teacher", email: "existing.teacher@example.com" })
        );
        await giveTeacherProfile(existingUser, { colorCode: TEACHER_COLORS[0], subject: "History" });

        const hashSpy = vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-value");

        const result = await createOrFindTeacher("  New Teacher  ", null, "");

        expect(result.wasCreated).toBe(true);
        expect(result.password).toHaveLength(12);
        expect(result.password).toMatch(/[A-Z]/);
        expect(result.password).toMatch(/[a-z]/);
        expect(result.password).toMatch(/[0-9]/);
        expect(result.password).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
        expect(hashSpy).toHaveBeenCalledWith(result.password, 12);

        const newUser = await User.findOne({ username: "New Teacher" });
        expect(newUser.email).toBe("new.teacher@mindful.se");
        expect(newUser.role).toBe("teacher");
        expect(newUser.teacherProfile.colorCode).toBe(TEACHER_COLORS[1]);
        expect(newUser.teacherProfile.subject).toBe("Övrigt");
        expect(String(result.teacher._id)).toBe(String(newUser._id));
    });

    it("does not treat a same-named user without a teacher profile as the teacher", async () => {
        await User.create(buildUser({ username: "Fresh Teacher", email: "fresh.other@example.com", roles: ["admin"] }));
        vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-value");

        const result = await createOrFindTeacher("Fresh Teacher", null, "Science");

        expect(result.wasCreated).toBe(true);
        const created = await User.findById(result.teacher._id);
        expect(created.teacherProfile.subject).toBe("Science");
        expect(created.email).toBe("fresh.teacher@mindful.se");
    });

    it("cycles colors when all are already used", async () => {
        for (let index = 0; index < TEACHER_COLORS.length; index += 1) {
            const user = await User.create(
                buildUser({ username: `Teacher ${index}`, email: `teacher.${index}@example.com` })
            );
            await giveTeacherProfile(user, { colorCode: TEACHER_COLORS[index], subject: "Subject" });
        }

        vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-value");

        const result = await createOrFindTeacher("Extra Teacher");

        expect(result.wasCreated).toBe(true);
        expect(result.teacher.teacherProfile.colorCode).toBe(TEACHER_COLORS[0]);
    });

    it("falls back to the first color when color lookup fails", async () => {
        const findSpy = vi.spyOn(User, "find").mockImplementationOnce(() => {
            throw new Error("Color lookup failed");
        });
        vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-value");

        const result = await createOrFindTeacher("Fallback Teacher");

        expect(findSpy).toHaveBeenCalled();
        expect(result.wasCreated).toBe(true);
        expect(result.teacher.teacherProfile.colorCode).toBe(TEACHER_COLORS[0]);
    });

    it("rethrows errors during teacher creation", async () => {
        vi.spyOn(bcrypt, "hash").mockResolvedValue("hashed-value");
        const error = new Error("User save failed");
        vi.spyOn(User, "create").mockRejectedValueOnce(error);

        await expect(createOrFindTeacher("Broken Teacher", null, "Math")).rejects.toThrow("User save failed");

        expect(logger.error).toHaveBeenCalledWith({ err: error }, "Error creating or finding teacher");
    });
});
