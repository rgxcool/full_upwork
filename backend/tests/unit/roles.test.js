import { describe, it, expect } from "vitest";
import { roleRank, hasCommentPermission, getPrimaryRole } from "../../src/utils/roles.js";

describe("roles utilities", () => {
    it("exposes the expected role ranking", () => {
        expect(roleRank.coordinator).toBe(3);
        expect(roleRank.teacher).toBeGreaterThan(roleRank.student);
    });

    it("allows comments from coordinator or higher roles", () => {
        expect(hasCommentPermission("coordinator"))
            .toBeTruthy();
        expect(hasCommentPermission("teacher"))
            .toBeTruthy();
        expect(hasCommentPermission("admin")).toBe(true);
    });

    it("rejects users below the coordinator level", () => {
        expect(hasCommentPermission("student")).toBe(false);
        expect(hasCommentPermission("guest")).toBe(false);
    });

    it("gracefully handles unknown roles", () => {
        expect(hasCommentPermission("mystery"))
            .toBe(false);
    });

    it("getPrimaryRole picks the highest role in the array", () => {
        expect(getPrimaryRole({ roles: ["user", "systemadmin"] })).toBe("systemadmin");
        expect(getPrimaryRole({ roles: ["teacher", "admin"] })).toBe("admin");
        expect(getPrimaryRole({ roles: ["systemadmin"] })).toBe("systemadmin");
    });

    it("getPrimaryRole falls back to singular role or guest", () => {
        expect(getPrimaryRole({ role: "admin", roles: [] })).toBe("admin");
        expect(getPrimaryRole({ roles: [] })).toBe("guest");
    });
});
