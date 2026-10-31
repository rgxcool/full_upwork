import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/services/emailService.js", () => ({
    sendEmail: sendEmailMock,
}));

import {
    ABSENCE_EMAIL_SUBJECT,
    buildAbsenceEmailBody,
    notifyAbsentStudents,
} from "../../src/services/examAbsenceNotificationService.js";

describe("examAbsenceNotificationService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sendEmailMock.mockResolvedValue({ success: true });
    });

    it("builds a Swedish information email with the exam details", () => {
        const body = buildAbsenceEmailBody({
            studentName: "Anna Elev",
            courseName: "Svenska 1",
            examDate: "2026-02-20",
            examTime: "09:00",
            examMunicipality: "Solna",
            examLocation: "Solna gymnasium",
        });

        expect(body).toContain("Hej Anna Elev");
        expect(body).toContain("frånvarande vid slutprovet i Svenska 1");
        expect(body).toContain("Tid: 09:00");
        expect(body).toContain("Kommun: Solna");
        expect(body).toContain("Plats: Solna gymnasium");
        expect(body).toContain("nästa steg");
    });

    it("only emails absent students and deduplicates the same exam", async () => {
        const result = await notifyAbsentStudents({
            dryRun: false,
            records: [
                {
                    studentId: "s1",
                    attendanceRecordId: "a1",
                    studentEmail: "anna@example.com",
                    studentName: "Anna",
                    examDate: "2026-02-20",
                    attended: false,
                },
                {
                    studentId: "s1",
                    attendanceRecordId: "a1",
                    studentEmail: "anna@example.com",
                    studentName: "Anna",
                    examDate: "2026-02-20",
                    attended: false,
                },
                {
                    studentId: "s2",
                    attendanceRecordId: "a2",
                    studentEmail: "present@example.com",
                    examDate: "2026-02-20",
                    attended: true,
                },
                {
                    studentId: "s3",
                    attendanceRecordId: "a3",
                    studentEmail: "",
                    examDate: "2026-02-20",
                    attended: false,
                },
            ],
        });

        expect(sendEmailMock).toHaveBeenCalledTimes(1);
        expect(sendEmailMock).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "anna@example.com",
                subject: ABSENCE_EMAIL_SUBJECT,
            })
        );
        expect(result).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ status: "sent", attendanceRecordId: "a1" }),
                expect.objectContaining({ status: "duplicate-skipped" }),
                expect.objectContaining({ status: "skipped-no-email" }),
            ])
        );
    });

    it("reports a failed delivery when the mail service rejects the send", async () => {
        sendEmailMock.mockResolvedValue({ success: false, error: "smtp down" });

        const result = await notifyAbsentStudents({
            dryRun: false,
            records: [
                {
                    studentId: "s1",
                    attendanceRecordId: "a1",
                    studentEmail: "anna@example.com",
                    examDate: "2026-02-20",
                    attended: false,
                },
            ],
        });

        expect(result).toEqual([
            { studentId: "s1", attendanceRecordId: "a1", status: "failed" },
        ]);
    });
});
