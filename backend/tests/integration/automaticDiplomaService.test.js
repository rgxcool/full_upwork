import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    CertificateRecord,
    CertificateSettings,
    CertificateTemplate,
} from "../../src/models/certificateModel.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock("../../src/services/certificatePdf.js", () => ({
    buildCertificateHtml: vi.fn(async () => '<img src="data:image/png;base64,signature">'),
    htmlToPdfBuffer: vi.fn(async () => Buffer.from("signed diploma pdf")),
    readPdfBuffer: vi.fn(async () => Buffer.from("signed diploma pdf")),
    storePdfBuffer: vi.fn(async () => "507f1f77bcf86cd799439011"),
}));

vi.mock("../../src/services/emailService.js", () => ({
    sendDiplomaEmail: vi.fn(async () => ({
        deliveredForReal: true,
        transportMode: "smtp",
    })),
}));

const { runAutomaticDiplomaScan } = await import(
    "../../src/services/automaticDiplomaService.js"
);
const { sendDiplomaEmail } = await import("../../src/services/emailService.js");
const { htmlToPdfBuffer } = await import("../../src/services/certificatePdf.js");
const { registerMonitoring } = await import("../../src/utils/monitoring.js");

describe("Automatic diploma scan", () => {
    let student;
    let course;
    let coursePackage;
    let enrollment;
    let signatureFileId;
    const now = new Date("2026-11-20T12:00:00.000Z");

    beforeAll(async () => {
        await connectTestDatabase();
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.mocked(sendDiplomaEmail).mockReset().mockResolvedValue({
            deliveredForReal: true,
            transportMode: "smtp",
        });
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            CoursePackage.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            CertificateRecord.deleteMany({}),
            CertificateSettings.deleteMany({}),
            CertificateTemplate.deleteMany({}),
            mongoose.connection.db.collection("fs.files").deleteMany({}),
        ]);

        student = await Student.create({
            name: "Test Elev",
            personalNumber: "20000101-1234",
            email: "test.elev@example.se",
            municipality: { type: "Sollentuna" },
            aplStatus: "GREEN",
        });
        course = await Course.create({
            courseName: "Matematik 2",
            courseCode: "MAT200",
        });
        const instance = await CourseInstance.create({
            mainCourseId: course._id,
            courseName: course.courseName,
            courseCode: course.courseCode,
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-01"),
            modules: [],
        });
        coursePackage = await CoursePackage.create({
            coursePackageName: "Teknikpaketet",
            coursePackageCode: "TEK1",
            coursePackagePoints: "1000",
            coursePackageExtent: "Termin",
            coursePackageCourses: [course._id],
        });
        enrollment = await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            coursePackageId: coursePackage._id,
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-06-01"),
            completedAt: new Date("2026-06-01"),
            status: "completed",
            grade: "C",
        });
        signatureFileId = new mongoose.Types.ObjectId();
        await mongoose.connection.db.collection("fs.files").insertOne({
            _id: signatureFileId,
            filename: "school-signature.png",
            contentType: "image/png",
            length: 10,
            chunkSize: 255 * 1024,
            uploadDate: now,
        });
        await CertificateSettings.create({
            signatureFileId,
            signerName: "Rektor",
            schoolName: "Mindful Learning",
        });
        await CertificateTemplate.create({
            key: "diplom",
            name: "Diplom",
            html: "{{studentName}}",
            orientation: "landscape",
        });
    });

    it("generates a signed PDF, stores it, and emails the eligible student's diploma", async () => {
        const summary = await runAutomaticDiplomaScan({ now });

        expect(summary).toMatchObject({
            checked: 1,
            generated: 1,
            emailed: 1,
            failed: 0,
        });
        expect(sendDiplomaEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                studentName: "Test Elev",
                email: "test.elev@example.se",
                pdf: Buffer.from("signed diploma pdf"),
            })
        );
        const record = await CertificateRecord.findOne({
            enrollmentId: enrollment._id,
            type: "diplom",
        }).lean();
        expect(record).toMatchObject({
            status: "generated",
            emailStatus: "sent",
            deliveredAt: now,
            configSnapshot: { signatureFileId },
        });
        expect(record.pdfFileId.toString()).toBe("507f1f77bcf86cd799439011");
    });

    it("reports a failed PDF to monitoring and in the job summary (#83)", async () => {
        // Puppeteer (the PDF renderer) is external: make Chrome fail to start.
        htmlToPdfBuffer.mockRejectedValueOnce(Object.assign(new Error("Failed to launch the browser process"), { name: "TimeoutError" }));
        // A stand-in for the Sentry client that monitoring.js forwards to.
        const sentry = { captureException: vi.fn() };
        registerMonitoring(sentry);
        try {
            const summary = await runAutomaticDiplomaScan({ now });

            expect(summary).toMatchObject({ checked: 1, generated: 0, emailed: 0, failed: 1 });
            expect(summary.failures).toEqual([
                {
                    studentId: String(enrollment.studentId),
                    coursePackageId: String(enrollment.coursePackageId),
                    error: "TimeoutError",
                },
            ]);
            expect(sentry.captureException).toHaveBeenCalledWith(
                expect.objectContaining({ message: "Failed to launch the browser process" }),
                expect.objectContaining({ tags: { job: "nightly-automatic-diploma-scan" } })
            );
            // Ids only: no student name or e-mail reaches the summary.
            expect(JSON.stringify(summary)).not.toContain("Test Elev");
            expect(sendDiplomaEmail).not.toHaveBeenCalled();
        } finally {
            registerMonitoring(null);
        }
    });

    it("does not generate a diploma for an incomplete package", async () => {
        await StudentEnrollment.updateOne({ _id: enrollment._id }, { $set: { grade: "F" } });

        const summary = await runAutomaticDiplomaScan({ now });

        expect(summary.skipped).toBe(1);
        expect(summary.generated).toBe(0);
        expect(await CertificateRecord.countDocuments({})).toBe(0);
        expect(sendDiplomaEmail).not.toHaveBeenCalled();
    });

    it("does not issue a diploma when the school signature is missing", async () => {
        await CertificateSettings.updateOne({}, { $set: { signatureFileId: null } });

        const summary = await runAutomaticDiplomaScan({ now });

        expect(summary.skippedNoSignature).toBe(1);
        expect(summary.generated).toBe(0);
        expect(await CertificateRecord.countDocuments({})).toBe(0);
        expect(sendDiplomaEmail).not.toHaveBeenCalled();
    });

    it("retries email delivery but does not resend a successfully delivered diploma", async () => {
        sendDiplomaEmail
            .mockResolvedValueOnce({ deliveredForReal: false, transportMode: "stream" })
            .mockResolvedValueOnce({ deliveredForReal: true, transportMode: "smtp" });

        const firstRun = await runAutomaticDiplomaScan({ now });
        expect(firstRun.generated).toBe(1);
        expect(firstRun.emailed).toBe(0);
        expect(sendDiplomaEmail).toHaveBeenCalledTimes(1);

        const retryRun = await runAutomaticDiplomaScan({ now });
        expect(retryRun.generated).toBe(1);
        expect(retryRun.emailed).toBe(1);
        expect(sendDiplomaEmail).toHaveBeenCalledTimes(2);

        const finalRun = await runAutomaticDiplomaScan({ now });
        expect(finalRun.alreadyComplete).toBe(1);
        expect(sendDiplomaEmail).toHaveBeenCalledTimes(2);
    });
});
