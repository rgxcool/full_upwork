import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import logger from "../utils/logger.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import {
    CertificateRecord,
    CertificateTemplate,
} from "../models/certificateModel.js";
import {
    buildSnapshotData,
    getSettingsSnapshot,
    nextCertificateNumber,
} from "./certificateService.js";
import {
    buildCertificateHtml,
    htmlToPdfBuffer,
    readPdfBuffer,
    storePdfBuffer,
} from "./certificatePdf.js";
import { sendDiplomaEmail } from "./emailService.js";
import { checkPackageCompletion } from "./courseCompletionService.js";

const sameId = (left, right) => String(left || "") === String(right || "");

async function hasConfiguredSignature(signatureFileId) {
    if (!mongoose.Types.ObjectId.isValid(signatureFileId)) return false;
    const file = await mongoose.connection.db.collection("fs.files").findOne({
        _id: new mongoose.Types.ObjectId(signatureFileId),
    });
    return file?.contentType === "image/png";
}

async function enrollmentPackageHasEnded(studentId, coursePackageId, now) {
    const enrollments = await StudentEnrollment.find({
        studentId,
        coursePackageId,
        status: "completed",
    })
        .select("endDate")
        .lean();

    return enrollments.length > 0 &&
        enrollments.every((enrollment) => enrollment.endDate && new Date(enrollment.endDate) <= now);
}

async function buildSignedDiplomaPdf(snapshot, settings, issuedDate) {
    const template = await CertificateTemplate.findOne({ key: "diplom" }).lean();
    const html = await buildCertificateHtml({
        type: "diplom",
        snapshot,
        ...settings,
        issuedDate,
    });

    if (!html.includes("data:image/png;base64,")) {
        throw new Error("Diplomets mall innehåller inte den konfigurerade signaturbilden.");
    }

    return htmlToPdfBuffer(html, {
        orientation: template?.orientation || "landscape",
    });
}

async function generateForEnrollment(enrollment, { now, settings }) {
    const snapshot = await buildSnapshotData(enrollment._id);
    if (!snapshot?.courseId) {
        throw new Error(`Diplomunderlag saknas för antagning ${enrollment._id}.`);
    }

    let record = await CertificateRecord.findOne({
        enrollmentId: enrollment._id,
        type: "diplom",
    });
    if (record?.status === "revoked") {
        return { status: "skipped", reason: "certificate_revoked" };
    }

    const sameSignature =
        sameId(record?.configSnapshot?.signatureFileId, settings.signatureFileId);
    if (
        record?.status === "generated" &&
        record.pdfFileId &&
        sameSignature &&
        record.emailStatus === "sent"
    ) {
        return { status: "already_complete" };
    }

    let pdf;
    if (record?.status === "generated" && record.pdfFileId && sameSignature) {
        try {
            pdf = await readPdfBuffer(record.pdfFileId);
        } catch (error) {
            logger.warn(
                { err: error, certificateRecordId: record._id },
                "Stored diploma PDF unavailable; regenerating"
            );
        }
    }

    if (!pdf?.length) {
        const certificateNumber = record?.certificateNumber || await nextCertificateNumber();
        pdf = await buildSignedDiplomaPdf(
            { ...snapshot, certificateNumber },
            settings,
            now
        );
        const filename = `diplom-${enrollment._id}-${certificateNumber}.pdf`;
        const oldFileId = record?.pdfFileId;
        const fileId = await storePdfBuffer(pdf, {
            filename,
            recordId: record?._id,
        });

        if (oldFileId) {
            try {
                await new GridFSBucket(mongoose.connection.db, { bucketName: "fs" }).delete(oldFileId);
            } catch (error) {
                logger.warn({ err: error, oldFileId }, "Could not remove replaced diploma PDF");
            }
        }

        if (!record) {
            record = new CertificateRecord({
                type: "diplom",
                status: "draft",
                ...snapshot,
                history: [],
            });
        }
        record.certificateNumber = certificateNumber;
        record.pdfFileId = fileId;
        record.configVersion = settings.configVersion;
        record.configSnapshot = {
            signerName: settings.signerName,
            signerTitle: settings.signerTitle,
            signerDepartment: settings.signerDepartment,
            signerContact: settings.signerContact,
            schoolName: settings.schoolName,
            organizationName: settings.organizationName,
            organizationNumber: settings.organizationNumber,
            address: settings.address,
            phone: settings.phone,
            email: settings.email,
            website: settings.website,
            secondSignerEnabled: settings.secondSignerEnabled,
            secondSignerName: settings.secondSignerName,
            secondSignerTitle: settings.secondSignerTitle,
            secondSignatureFileId: settings.secondSignatureFileId,
            logoFileId: settings.logoFileId,
            signatureFileId: settings.signatureFileId,
        };
        record.status = "generated";
        record.generatedBy = null;
        record.generatedAt = now;
        record.history.push({
            action: "generated",
            by: null,
            at: now,
            note: `Automatiskt genererat med skolans signaturbild (${certificateNumber})`,
        });
        await record.save();
    }

    if (!snapshot.studentName || !snapshot.studentId) {
        throw new Error(`Elevuppgifter saknas för diplom ${enrollment._id}.`);
    }
    if (!snapshot.email) {
        record.emailStatus = "no_email";
        await record.save();
        return { status: "generated_no_email", record };
    }
    const delivery = await sendDiplomaEmail({
        studentName: snapshot.studentName,
        email: snapshot.email,
        pdf,
        filename: `diplom-${enrollment._id}.pdf`,
    });
    record.emailStatus = delivery.deliveredForReal ? "sent" : "not_delivered";
    record.deliveryTransportMode = delivery.transportMode || "";
    if (delivery.deliveredForReal) {
        record.deliveredAt = now;
        record.history.push({
            action: "delivered",
            by: null,
            at: now,
            note: "Diplom skickat automatiskt till elevens e-post.",
        });
    }
    await record.save();

    return {
        status: delivery.deliveredForReal ? "generated_and_sent" : "generated_not_delivered",
        record,
    };
}

/**
 * Generate and email one signed-image diploma per eligible student/package.
 * The scan is safe to retry: generated records are reused and delivered
 * records are not sent twice.
 */
export async function runAutomaticDiplomaScan({ now = new Date() } = {}) {
    const summary = {
        checked: 0,
        generated: 0,
        emailed: 0,
        alreadyComplete: 0,
        skipped: 0,
        skippedNoSignature: 0,
        failed: 0,
    };

    try {
        const pairs = await StudentEnrollment.aggregate([
            {
                $match: {
                    coursePackageId: { $exists: true, $ne: null },
                    status: "completed",
                },
            },
            {
                $group: {
                    _id: { studentId: "$studentId", coursePackageId: "$coursePackageId" },
                },
            },
        ]);
        summary.checked = pairs.length;
        if (pairs.length === 0) return summary;

        const settings = await getSettingsSnapshot();
        if (!(await hasConfiguredSignature(settings.signatureFileId))) {
            summary.skippedNoSignature = pairs.length;
            logger.warn(
                { checked: pairs.length },
                "Automatic diploma generation skipped — a valid PNG signature must be configured"
            );
            return summary;
        }

        for (const pair of pairs) {
            const { studentId, coursePackageId } = pair._id;
            try {
                const completion = await checkPackageCompletion(studentId, coursePackageId);
                if (!completion.completed || !completion.enrollment) {
                    summary.skipped++;
                    continue;
                }
                if (!(await enrollmentPackageHasEnded(studentId, coursePackageId, now))) {
                    summary.skipped++;
                    continue;
                }

                const result = await generateForEnrollment(completion.enrollment, {
                    now,
                    settings,
                });
                if (result.status === "already_complete") {
                    summary.alreadyComplete++;
                } else if (result.status === "generated_and_sent") {
                    summary.generated++;
                    summary.emailed++;
                } else if (result.status === "generated_not_delivered") {
                    summary.generated++;
                    logger.warn(
                        {
                            studentId,
                            coursePackageId,
                            transportMode: result.record.deliveryTransportMode,
                        },
                        "Diploma generated but email was not delivered; the next scan will retry"
                    );
                } else if (result.status === "generated_no_email") {
                    summary.generated++;
                    logger.warn({ studentId, coursePackageId }, "Diploma generated without student email");
                } else {
                    summary.skipped++;
                }
            } catch (error) {
                summary.failed++;
                logger.error(
                    { err: error, studentId, coursePackageId },
                    "Automatic diploma generation failed"
                );
            }
        }
    } catch (error) {
        summary.failed++;
        logger.error({ err: error }, "Automatic diploma scan failed");
    }

    return summary;
}
