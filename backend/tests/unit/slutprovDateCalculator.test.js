import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import mongoose from "mongoose";
import {
    calculateSlutprovDate,
    hasAutomaticSlutprovRule,
} from "../../src/utils/slutprovDateCalculator.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { createTeacherUser } from "../helpers/teacherFixture.js";

describe("slutprovDateCalculator", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("calculateSlutprovDate", () => {
        it("returns null for missing inputs", async () => {
            expect(await calculateSlutprovDate(null, new Date())).toBeNull();
            expect(await calculateSlutprovDate({ username: "eva" }, null)).toBeNull();
        });

        it("returns null when the username cannot be resolved", async () => {
            // Unknown and invalid ids: no User, no username, no rule.
            expect(
                await calculateSlutprovDate({ _id: new mongoose.Types.ObjectId() }, new Date("2026-12-18"))
            ).toBeNull();
            expect(await calculateSlutprovDate({ _id: "t-missing" }, new Date("2026-12-18"))).toBeNull();
        });

        it("returns null when the teacher has no matching rule", async () => {
            const result = await calculateSlutprovDate(
                { username: "per.nilsson" },
                new Date("2026-12-18")
            );
            expect(result).toBeNull();
        });

        it("resolves the username from the teacher's User id (#102)", async () => {
            const eva = await createTeacherUser({ name: "eva" });

            const result = await calculateSlutprovDate({ _id: eva._id }, new Date("2026-12-18"));
            expect(result).not.toBeNull();
        });

        it("resolves the username from a raw User id string", async () => {
            const mirsada = await createTeacherUser({ name: "mirsada" });

            const result = await calculateSlutprovDate(String(mirsada._id), new Date("2026-12-18"));
            expect(result).not.toBeNull();
        });

        it("applies the Allan rule: Saturday the week before course end", async () => {
            const result = await calculateSlutprovDate(
                { username: "Allan Smith" },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(6);
        });

        it("applies the Maja rule case-insensitively", async () => {
            const result = await calculateSlutprovDate(
                { username: "MAJA" },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(6);
        });

        it("applies the Eva rule: Thursday before course end", async () => {
            const result = await calculateSlutprovDate(
                { username: "eva" },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(4);
            expect(result.getTime()).toBeLessThan(new Date("2026-12-18").getTime());
        });

        it("steps back a full week when the course ends on a Thursday", async () => {
            const thursday = new Date("2026-12-17");
            const result = await calculateSlutprovDate(
                { username: "eva" },
                thursday
            );
            expect(result.getDay()).toBe(4);
            expect(result < thursday).toBe(true);
        });

        it("applies the Mirsada rule: Wednesday the week before", async () => {
            const result = await calculateSlutprovDate(
                { username: "mirsada" },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(3);
        });

        it("applies the Elham rule: Sunday the week before", async () => {
            const result = await calculateSlutprovDate(
                { username: "elham" },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(0);
        });

        it("applies the Linnéa rule via the accented variant", async () => {
            const result = await calculateSlutprovDate(
                { username: "linnéa" },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(0);
        });

        it("applies the Angelina rule: Wednesday the week before", async () => {
            const result = await calculateSlutprovDate(
                { username: "angelina" },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(3);
        });
    });

    describe("hasAutomaticSlutprovRule", () => {
        it("returns false for empty input", () => {
            expect(hasAutomaticSlutprovRule("")).toBe(false);
        });

        it("recognizes known teachers", () => {
            expect(hasAutomaticSlutprovRule("eva")).toBe(true);
            expect(hasAutomaticSlutprovRule("linnéa")).toBe(true);
            expect(hasAutomaticSlutprovRule("allan.karlsson")).toBe(true);
        });

        it("returns false for unknown teachers", () => {
            expect(hasAutomaticSlutprovRule("per.nilsson")).toBe(false);
        });
    });
});