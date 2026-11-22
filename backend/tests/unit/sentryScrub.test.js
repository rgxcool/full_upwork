import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    scrubString,
    scrubValue,
    scrubEvent,
    scrubUrl,
    scrubBreadcrumb,
} from "../../src/utils/sentryScrub.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("sentryScrub", () => {
    it.each([
        ["19900101-1234", "[personnummer]"],
        ["900101-1234", "[personnummer]"],
        ["199001011234", "[personnummer]"],
        ["900101+1234", "[personnummer]"],
        ["900161-1234", "[personnummer]"], // samordningsnummer
    ])("masks personnummer %s", (input, expected) => {
        expect(scrubString(`Elev ${input} saknas`)).toBe(`Elev ${expected} saknas`);
    });

    it("does not mask ordinary numbers, ObjectIds or epoch timestamps", () => {
        const s = "id 65a1f0c2e4b0a1b2c3d4e5f6 took 1732262400 ms, count 42, year 2026";
        expect(scrubString(s)).toBe(s);
    });

    it("masks e-mail addresses and Swedish phone numbers", () => {
        expect(scrubString("Mail anna.svensson@example.se nu")).toBe("Mail [email] nu");
        expect(scrubString("Ring 070-123 45 67")).toBe("Ring [phone]");
        expect(scrubString("Ring +46 70 123 45 67")).toBe("Ring [phone]");
    });

    it("replaces values under sensitive keys, case-insensitively and deeply", () => {
        const out = scrubValue({
            student: { name: "Test", personalNumber: "x", nested: { SpecialNeeds: "y" } },
            examAccommodations: { extraTime: true },
            count: 3,
        });
        expect(out.student.personalNumber).toBe("[Filtered]");
        expect(out.student.nested.SpecialNeeds).toBe("[Filtered]");
        expect(out.examAccommodations).toBe("[Filtered]");
        expect(out.count).toBe(3);
    });

    it("handles circular references and depth", () => {
        const a = { b: {} };
        a.b.a = a;
        expect(() => scrubValue(a)).not.toThrow();
    });

    it("strips query strings from URLs", () => {
        expect(scrubUrl("/api/search?q=19900101-1234")).toBe("/api/search");
        expect(scrubUrl("/api/student/19900101-1234")).toBe("/api/student/[personnummer]");
    });

    it("scrubs a full event: request, user, exception, breadcrumbs", () => {
        const out = scrubEvent({
            message: "Failed for anna@example.se",
            exception: { values: [{ type: "Error", value: "Student 900101-1234 not found" }] },
            request: {
                url: "https://x.se/api/students?personalNumber=900101-1234",
                data: { personalNumber: "900101-1234" },
                cookies: { token: "abc" },
                query_string: "personalNumber=900101-1234",
                headers: { authorization: "Bearer x", "user-agent": "UA" },
            },
            user: { id: "u1", email: "a@b.se", ip_address: "1.2.3.4", segment: "teacher" },
            breadcrumbs: [{ message: "GET /api/x?q=1", data: { url: "/api/x?q=900101-1234" } }],
            extra: { body: { email: "a@b.se" } },
        });
        expect(out.message).toBe("Failed for [email]");
        expect(out.exception.values[0].value).toBe("Student [personnummer] not found");
        expect(out.request.url).toBe("https://x.se/api/students");
        expect(out.request.data).toBeUndefined();
        expect(out.request.cookies).toBeUndefined();
        expect(out.request.query_string).toBeUndefined();
        expect(out.request.headers).toEqual({ "user-agent": "UA" });
        expect(out.user).toEqual({ id: "u1", segment: "teacher" });
        expect(out.breadcrumbs[0].data.url).toBe("/api/x");
        expect(out.extra.body.email).toBe("[Filtered]");
    });

    it("scrubBreadcrumb leaves non-sensitive crumbs intact", () => {
        const c = { category: "navigation", data: { from: "/a", to: "/b" } };
        expect(scrubBreadcrumb(c)).toEqual(c);
    });

    it("frontend copy is identical to the backend module", () => {
        const backend = readFileSync(path.join(here, "../../src/utils/sentryScrub.js"), "utf8");
        const frontend = readFileSync(
            path.join(here, "../../../frontend/src/utils/sentryScrub.js"),
            "utf8"
        );
        expect(frontend).toBe(backend);
    });
});
