import { describe, it, expect } from "vitest";
import {
    getUserMunicipalities,
    hasGlobalScope,
    isValidMunicipality,
    studentScopeFilter,
    municipalityInScope,
    userScopeFilter,
    sharesTenant,
} from "../../src/utils/tenantScope.js";

describe("tenantScope utilities", () => {
    describe("getUserMunicipalities", () => {
        it("returns empty array for missing scope", () => {
            expect(getUserMunicipalities({})).toEqual([]);
            expect(getUserMunicipalities(undefined)).toEqual([]);
        });

        it("filters out non-string / blank values", () => {
            expect(getUserMunicipalities({ municipalities: ["Sollentuna", "", 5, null] })).toEqual([
                "Sollentuna",
            ]);
        });
    });

    describe("hasGlobalScope", () => {
        it("is true when scope is missing/empty", () => {
            expect(hasGlobalScope({})).toBe(true);
            expect(hasGlobalScope({ municipalities: [] })).toBe(true);
        });

        it("is false when a scope is assigned", () => {
            expect(hasGlobalScope({ municipalities: ["Sollentuna"] })).toBe(false);
        });
    });

    describe("isValidMunicipality", () => {
        it("accepts known municipalities", () => {
            expect(isValidMunicipality("Sollentuna")).toBe(true);
            expect(isValidMunicipality("Privat kunder")).toBe(true);
        });

        it("rejects unknown / non-string values", () => {
            expect(isValidMunicipality("Narnia")).toBe(false);
            expect(isValidMunicipality("")).toBe(false);
            expect(isValidMunicipality(undefined)).toBe(false);
        });
    });

    describe("studentScopeFilter", () => {
        it("returns an empty filter for global users", () => {
            expect(studentScopeFilter({})).toEqual({});
            expect(studentScopeFilter({ municipalities: [] })).toEqual({});
        });

        it("scopes to the user's municipalities", () => {
            expect(studentScopeFilter({ municipalities: ["Sollentuna", "Solna"] })).toEqual({
                "municipality.type": { $in: ["Sollentuna", "Solna"] },
            });
        });
    });

    describe("municipalityInScope", () => {
        it("allows everything for global users", () => {
            expect(municipalityInScope({}, "Sollentuna")).toBe(true);
        });

        it("restricts scoped users to their municipalities", () => {
            const user = { municipalities: ["Sollentuna"] };
            expect(municipalityInScope(user, "Sollentuna")).toBe(true);
            expect(municipalityInScope(user, "Stockholm")).toBe(false);
        });

        it("denies scoped users operating on null municipality", () => {
            expect(municipalityInScope({ municipalities: ["Sollentuna"] }, null)).toBe(false);
        });
    });

    describe("userScopeFilter", () => {
        it("returns an empty filter for global users", () => {
            expect(userScopeFilter({})).toEqual({});
        });

        it("restricts the User query to the user's municipalities", () => {
            expect(userScopeFilter({ municipalities: ["Sollentuna", "Solna"] })).toEqual({
                municipalities: { $in: ["Sollentuna", "Solna"] },
            });
        });

        it("ignores blank municipality entries", () => {
            expect(userScopeFilter({ municipalities: ["Sollentuna", ""] })).toEqual({
                municipalities: { $in: ["Sollentuna"] },
            });
        });
    });

    describe("sharesTenant", () => {
        it("is true when a global account is involved", () => {
            expect(sharesTenant({}, { municipalities: ["Sollentuna"] })).toBe(true);
            expect(sharesTenant({ municipalities: ["Sollentuna"] }, {})).toBe(true);
            expect(sharesTenant({}, {})).toBe(true);
        });

        it("is true when the accounts share at least one municipality", () => {
            expect(
                sharesTenant(
                    { municipalities: ["Sollentuna", "Solna"] },
                    { municipalities: ["Solna", "Nacka"] }
                )
            ).toBe(true);
        });

        it("is false when the accounts are in different municipalities", () => {
            expect(
                sharesTenant({ municipalities: ["Sollentuna"] }, { municipalities: ["Nacka"] })
            ).toBe(false);
        });
    });
});
