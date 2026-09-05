import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const h = vi.hoisted(() => ({
    teacherModel: { findById: vi.fn() },
}));

vi.mock("../../src/models/Teacher.js", () => ({ default: h.teacherModel }));

import {
    calculateSlutprovDate,
    hasAutomaticSlutprovRule,
} from "../../src/utils/slutprovDateCalculator.js";

const teacherQuery = (result) => ({
    populate: vi.fn().mockResolvedValue(result),
});

describe("slutprovDateCalculator", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("calculateSlutprovDate", () => {
        it("returns null for missing inputs", async () => {
            expect(await calculateSlutprovDate(null, new Date())).toBeNull();
            expect(await calculateSlutprovDate({ userId: { username: "eva" } }, null)).toBeNull();
        });

        it("returns null when the username cannot be resolved", async () => {
            h.teacherModel.findById.mockReturnValue(teacherQuery(null));
            expect(
                await calculateSlutprovDate({ _id: "t-missing" }, new Date("2026-12-18"))
            ).toBeNull();
            expect(h.teacherModel.findById).toHaveBeenCalledWith("t-missing");
        });

        it("returns null when the teacher has no matching rule", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "per.nilsson" } },
                new Date("2026-12-18")
            );
            expect(result).toBeNull();
        });

        it("resolves username from a populated teacher via model lookup", async () => {
            h.teacherModel.findById.mockReturnValue(
                teacherQuery({ userId: { username: "eva" } })
            );

            const result = await calculateSlutprovDate(
                { _id: "t1" },
                new Date("2026-12-18")
            );
            expect(result).not.toBeNull();
            expect(h.teacherModel.findById).toHaveBeenCalledWith("t1");
        });

        it("resolves username from a raw teacher id string", async () => {
            h.teacherModel.findById.mockReturnValue(
                teacherQuery({ userId: { username: "mirsada" } })
            );

            const result = await calculateSlutprovDate("t1", new Date("2026-12-18"));
            expect(result).not.toBeNull();
        });

        it("applies the Allan rule: Saturday the week before course end", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "Allan Smith" } },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(6);
        });

        it("applies the Maja rule case-insensitively", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "MAJA" } },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(6);
        });

        it("applies the Eva rule: Thursday before course end", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "eva" } },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(4);
            expect(result.getTime()).toBeLessThan(new Date("2026-12-18").getTime());
        });

        it("steps back a full week when the course ends on a Thursday", async () => {
            const thursday = new Date("2026-12-17");
            const result = await calculateSlutprovDate(
                { userId: { username: "eva" } },
                thursday
            );
            expect(result.getDay()).toBe(4);
            expect(result < thursday).toBe(true);
        });

        it("applies the Mirsada rule: Wednesday the week before", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "mirsada" } },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(3);
        });

        it("applies the Elham rule: Sunday the week before", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "elham" } },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(0);
        });

        it("applies the Linnéa rule via the accented variant", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "linnéa" } },
                new Date("2026-12-18")
            );
            expect(result.getDay()).toBe(0);
        });

        it("applies the Angelina rule: Wednesday the week before", async () => {
            const result = await calculateSlutprovDate(
                { userId: { username: "angelina" } },
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