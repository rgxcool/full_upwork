import { ALL_MUNICIPALITIES } from "../config/municipalities.js";

/**
 * Tenant (kommun) scope helpers.
 *
 * Every authenticated staff user may be granted a `municipalities` data scope
 * on their User document. An empty/missing `municipalities` array means the
 * user has GLOBAL access (no scoping) — the safest default for existing
 * system/admin accounts until a scope is assigned.
 *
 * Enforcement lives here (backend) and is applied to the tenant-sensitive
 * student data path (list/detail/search/stats/analytics/grade reports and
 * writes). Never rely on the frontend for tenant security.
 */

const STUDENT_MUNICIPALITY_PATH = "municipality.type";

/**
 * Normalize a user's municipality scope to a plain array of strings.
 * @returns {string[]}
 */
export function getUserMunicipalities(user) {
    const m = user?.municipalities;
    if (Array.isArray(m)) {
        return m.filter((x) => typeof x === "string" && x.trim() !== "");
    }
    return [];
}

/**
 * A user with no restricted municipalities can see all data (global/system).
 * @param {object} user
 * @returns {boolean}
 */
export function hasGlobalScope(user) {
    return getUserMunicipalities(user).length === 0;
}

/**
 * Validate a municipality value against the canonical list (exact match).
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function isValidMunicipality(value) {
    return typeof value === "string" && ALL_MUNICIPALITIES.includes(value);
}

/**
 * Mongo filter restricting a Student query to the user's tenant scope.
 * Returns `{}` for global users.
 * @param {object} user
 * @returns {object}
 */
export function studentScopeFilter(user) {
    if (hasGlobalScope(user)) return {};
    const muns = getUserMunicipalities(user);
    if (muns.length === 0) return { _id: { $exists: false } }; // no access
    return { [STUDENT_MUNICIPALITY_PATH]: { $in: muns } };
}

/**
 * True if the user may operate on data belonging to `municipality`.
 * Global users may operate on anything; scoped users only on allowed kommunes.
 * @param {object} user
 * @param {string|null|undefined} municipality  e.g. the Student.municipality.type
 * @returns {boolean}
 */
export function municipalityInScope(user, municipality) {
    if (hasGlobalScope(user)) return true;
    if (municipality === null || municipality === undefined) return false;
    return getUserMunicipalities(user).includes(municipality);
}
