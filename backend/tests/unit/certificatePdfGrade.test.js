import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CertificateSettings,
    CertificateTemplate,
} from "../../src/models/certificateModel.js";
import { buildCertificateHtml } from "../../src/services/certificatePdf.js";

const templateHtml =
    '<h1>{{title}}</h1><span class="pill">Kurs: {{courseName}}</span>{{#showGrade}}<span class="pill">Betyg: {{grade}}</span>{{/showGrade}}';

const mockLookup = (value) => ({ lean: vi.fn().mockResolvedValue(value) });

const build = async (grade, templateOverrides = {}) =>
    buildCertificateHtml({
        type: "diplom",
        snapshot: {
            studentName: "Anna Elev",
            courseName: "Svenska 1",
            grade,
            completedAt: "2026-03-16",
        },
        signerName: "Rektor",
        issuedDate: "2026-03-20",
        ...templateOverrides,
    });

describe("buildCertificateHtml grade rendering", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("omits the grade field entirely when the grade is empty", async () => {
        vi.spyOn(CertificateTemplate, "findOne").mockReturnValue(
            mockLookup({ key: "diplom", html: templateHtml, showGrade: true })
        );
        vi.spyOn(CertificateSettings, "findOne").mockReturnValue(mockLookup({}));

        const html = await build("");

        expect(html).not.toContain("Betyg:");
        expect(html).not.toContain("pill\">Betyg");
        expect(html).toContain("Kurs: Svenska 1");
    });

    it("omits whitespace-only grades", async () => {
        vi.spyOn(CertificateTemplate, "findOne").mockReturnValue(
            mockLookup({ key: "diplom", html: templateHtml, showGrade: true })
        );
        vi.spyOn(CertificateSettings, "findOne").mockReturnValue(mockLookup({}));

        const html = await build("   ");

        expect(html).not.toContain("Betyg:");
    });

    it("renders the grade when one is set", async () => {
        vi.spyOn(CertificateTemplate, "findOne").mockReturnValue(
            mockLookup({ key: "diplom", html: templateHtml, showGrade: true })
        );
        vi.spyOn(CertificateSettings, "findOne").mockReturnValue(mockLookup({}));

        const html = await build("B");

        expect(html).toContain("Betyg: B");
    });

    it("still honors a template with showGrade disabled", async () => {
        vi.spyOn(CertificateTemplate, "findOne").mockReturnValue(
            mockLookup({ key: "diplom", html: templateHtml, showGrade: false })
        );
        vi.spyOn(CertificateSettings, "findOne").mockReturnValue(mockLookup({}));

        const html = await build("A");

        expect(html).not.toContain("Betyg:");
    });
});
