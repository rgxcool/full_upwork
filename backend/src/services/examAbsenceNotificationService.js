import logger from "../utils/logger.js";
import { sendEmail } from "./emailService.js";

export const ABSENCE_EMAIL_SUBJECT = "Informationsmeddelande: frånvaro vid slutprov";

export const buildAbsenceEmailBody = ({ studentName, courseName, examDate, examTime, examMunicipality, examLocation }) => {
    const lines = [];
    lines.push(`Hej ${studentName || "elev"},`);
    lines.push("");
    lines.push(`Du har registrerats som frånvarande vid slutprovet${courseName ? ` i ${courseName}` : ""}.`);
    if (examDate) lines.push(`Examensdatum: ${new Date(examDate).toLocaleDateString("sv-SE")}`);
    if (examTime) lines.push(`Tid: ${examTime}`);
    if (examMunicipality) lines.push(`Kommun: ${examMunicipality}`);
    if (examLocation) lines.push(`Plats: ${examLocation}`);
    lines.push("");
    lines.push("Kontakta din lärare eller studievägledare för information om nästa steg.");
    lines.push("");
    lines.push("Med vänlig hälsning,");
    lines.push("Mindful Learning");
    return lines.join("\n");
};

export const notifyAbsentStudents = async ({ records = [], dryRun = true } = {}) => {
    const results = [];
    const seen = new Set();
    for (const r of records) {
        if (r.attended !== false) continue;
        if (!r.studentEmail) {
            results.push({ studentId: r.studentId, attendanceRecordId: r.attendanceRecordId, status: "skipped-no-email" });
            continue;
        }
        const key = `${r.studentId}:${r.examDate}`;
        if (seen.has(key)) {
            results.push({ studentId: r.studentId, attendanceRecordId: r.attendanceRecordId, status: "duplicate-skipped" });
            continue;
        }
        seen.add(key);
        const body = buildAbsenceEmailBody(r);
        if (dryRun) {
            results.push({ studentId: r.studentId, attendanceRecordId: r.attendanceRecordId, status: "dry-run", subject: ABSENCE_EMAIL_SUBJECT });
            continue;
        }
        try {
            const sendResult = await sendEmail({ to: r.studentEmail, subject: ABSENCE_EMAIL_SUBJECT, text: body });
            if (sendResult && sendResult.success === false) {
                results.push({ studentId: r.studentId, attendanceRecordId: r.attendanceRecordId, status: "failed" });
            } else {
                results.push({ studentId: r.studentId, attendanceRecordId: r.attendanceRecordId, status: "sent" });
            }
        } catch (err) {
            logger.error({ err }, "Failed to send absence email");
            results.push({ studentId: r.studentId, attendanceRecordId: r.attendanceRecordId, status: "failed" });
        }
    }
    return results;
};
