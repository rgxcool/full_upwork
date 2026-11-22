/**
 * Personal-data scrubbing for Sentry events (GDPR).
 *
 * Runs in `beforeSend` / `beforeSendTransaction` / `beforeBreadcrumb` in the
 * DEVELOPMENT-only Sentry setup on backend and frontend (frontend/src/utils/sentryScrub.js is an identical copy —
 * keep them in sync; backend/tests/unit/sentryScrub.test.js covers both).
 *
 * Goals:
 *  - No personnummer / samordningsnummer, e-mail addresses or phone numbers
 *    leave the platform, wherever they appear (messages, exception values,
 *    breadcrumbs, extra, contexts, tags, URLs).
 *  - Values under known-sensitive keys (personalNumber, specialNeeds,
 *    examAccommodations, supportInfo, …) are replaced wholesale.
 *  - Request bodies, cookies, query strings and headers are dropped; only the
 *    user's opaque id and role are kept for grouping.
 */

// YYMMDD-XXXX / YYYYMMDD-XXXX / YYMMDD+XXXX / without separator.
// Day 61–91 = samordningsnummer.
const PERSONNUMMER_RE =
    /\b(?:19|20)?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+]?\d{4}\b/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Swedish mobile/landline: 07x-xxx xx xx, +46 7x…, 08-xxx xx xx
const PHONE_RE = /(?:\+46|0046|\b0)[\s-]?\d{1,3}(?:[\s-]?\d{2,3}){2,4}\b/g;

const SENSITIVE_KEYS = new Set(
    [
        "personalnumber",
        "personnummer",
        "ssn",
        "socialsecuritynumber",
        "specialneeds",
        "needssupport",
        "supportinfo",
        "supportnotes",
        "examaccommodations",
        "accommodations",
        "additionalinfo",
        "address",
        "phone",
        "contactphone",
        "email",
        "password",
        "temppassword",
        "token",
        "authorization",
        "cookie",
        "grade",
        "motivation",
    ].map((k) => k.toLowerCase()),
);

const FILTERED = "[Filtered]";
const MAX_DEPTH = 8;

export function scrubString(value) {
    if (typeof value !== "string" || value.length === 0) return value;
    return value
        .replace(EMAIL_RE, "[email]")
        .replace(PERSONNUMMER_RE, "[personnummer]")
        .replace(PHONE_RE, "[phone]");
}

export function scrubValue(value, depth = 0, seen = new WeakSet()) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return scrubString(value);
    if (typeof value !== "object") return value;
    if (depth >= MAX_DEPTH) return "[Truncated]";
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((v) => scrubValue(v, depth + 1, seen));
    }
    const out = {};
    for (const [key, v] of Object.entries(value)) {
        out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
            ? FILTERED
            : scrubValue(v, depth + 1, seen);
    }
    return out;
}

function scrubRequest(request) {
    if (!request) return request;
    const out = { ...request };
    delete out.data;
    delete out.cookies;
    delete out.query_string;
    delete out.env;
    if (out.headers) {
        const ua = out.headers["user-agent"] ?? out.headers["User-Agent"];
        out.headers = ua ? { "user-agent": ua } : {};
    }
    if (typeof out.url === "string") out.url = scrubUrl(out.url);
    return out;
}

/** Strip query string and mask personal data inside the path. */
export function scrubUrl(url) {
    if (typeof url !== "string") return url;
    const noQuery = url.split("?")[0].split("#")[0];
    return scrubString(noQuery);
}

function scrubUser(user) {
    if (!user) return user;
    const kept = {};
    if (user.id !== null && user.id !== undefined) kept.id = String(user.id);
    if (user.segment) kept.segment = user.segment; // role, e.g. "teacher"
    return kept;
}

/** Scrub one breadcrumb (also usable as beforeBreadcrumb). */
export function scrubBreadcrumb(crumb) {
    if (!crumb) return crumb;
    const out = { ...crumb };
    if (out.message) out.message = scrubString(out.message);
    if (out.data) {
        const data = scrubValue(out.data);
        if (typeof data.url === "string") data.url = scrubUrl(data.url);
        if (typeof data.to === "string") data.to = scrubUrl(data.to);
        if (typeof data.from === "string") data.from = scrubUrl(data.from);
        out.data = data;
    }
    return out;
}

/** Scrub a whole Sentry event (error or transaction). Never throws. */
export function scrubEvent(event) {
    if (!event) return event;
    try {
        const out = { ...event };
        if (out.message) out.message = scrubString(out.message);
        if (out.logentry?.message) {
            out.logentry = {
                ...out.logentry,
                message: scrubString(out.logentry.message),
            };
        }
        if (out.exception?.values) {
            out.exception = {
                ...out.exception,
                values: out.exception.values.map((ex) => ({
                    ...ex,
                    value: scrubString(ex.value),
                })),
            };
        }
        if (out.transaction) out.transaction = scrubUrl(out.transaction);
        if (out.breadcrumbs)
            out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb);
        if (out.extra) out.extra = scrubValue(out.extra);
        if (out.contexts) out.contexts = scrubValue(out.contexts);
        if (out.tags) out.tags = scrubValue(out.tags);
        if (out.request) out.request = scrubRequest(out.request);
        if (out.user) out.user = scrubUser(out.user);
        if (out.spans) {
            out.spans = out.spans.map((s) => ({
                ...s,
                description: scrubUrl(s.description),
                data: s.data ? scrubValue(s.data) : s.data,
            }));
        }
        return out;
    } catch {
        // If scrubbing itself fails, drop the event rather than risk leaking data.
        return null;
    }
}
