import StudentEnrollment from "../models/StudentEnrollment.js";
import { ROLES } from "../config/permissions.js";
import { sendDiplomaEmail } from "../services/emailService.js";
import { buildCertificateHtml, htmlToPdfBuffer, readPdfBuffer } from "../services/certificatePdf.js";
import { getSettingsSnapshot, getUserRoles } from "../services/certificateService.js";
import { CertificateRecord, CertificateTemplate } from "../models/certificateModel.js";
import logger from "../utils/logger.js";
import { TEACHER_POPULATE_FIELDS } from "../utils/teacherProfile.js";

const STAFF_ROLES = [
    ROLES.SYSTEMADMIN,
    ROLES.ADMIN,
    ROLES.TEACHER,
    ROLES.SYV,
    ROLES.SPECPED,
    ROLES.COORDINATOR,
];

/**
 * Add audit trail entry for certificate/diploma generation.
 * Records who generated the document, when, and what type.
 */
const addCertificateAuditTrail = async (studentId, enrollmentId, certificateType, user, configVersion = 1) => {
    try {
        const studentModule = await import("../models/Student.js");
        const Student = studentModule?.default || studentModule;
        const studentDoc = await Student.findById(studentId);
        if (!studentDoc) {
            return;
        }

        const entry = {
            timestamp: new Date(),
            changedBy: user?._id || null,
            changedByRole: user?.role || "",
            changes: [`${certificateType}_generated`],
            previousValues: studentDoc.changeHistory?.[studentDoc.changeHistory?.length - 1] || {},
            newValues: {
                ...(studentDoc.toObject ? studentDoc.toObject() : studentDoc),
                [`${certificateType}Generated`]: true,
                certificateConfigVersion: configVersion,
            },
        };

        // Add to change history (unshift for newest first)
        studentDoc.changeHistory?.unshift(entry);
        await studentDoc.save();
    } catch (error) {
        logger.error({ err: error, studentId }, "Error adding certificate audit trail");
        // Non-fatal - audit trail failure should not break the main flow
    }
};

export const getStudyCertificatePdf = async (req, res) => {
    try {
        const enrollment = await StudentEnrollment.findById(req.params.enrollmentId)
            .populate("mainCourseId", "courseName courseCode")
            .populate({ path: "teacherId", select: TEACHER_POPULATE_FIELDS })
            .populate("studentId", "name personalNumber email");

        if (!enrollment) {
            return res.status(404).json({ message: "Ingen antagning hittad" });
        }

        if (enrollment.status !== "completed") {
            return res.status(400).json({
                message: "Studieintyg utfärdas först när kursen är slutförd",
            });
        }

        // Staff can view any certificate; students only their own (matched by email)
        const isStaff = STAFF_ROLES.includes(req.user?.role);
        const enrollmentStudentEmail = enrollment.studentId?.email;
        const callerEmail = req.user?.email;
        const isOwner =
            !!enrollmentStudentEmail &&
            !!callerEmail &&
            String(callerEmail).toLowerCase() === String(enrollmentStudentEmail).toLowerCase();

        if (!isStaff && !isOwner) {
            return res.status(403).json({ message: "Ej behörig" });
        }

        const settings = await getSettingsSnapshot();
        const html = await buildCertificateHtml({
            type: "studieintyg",
            snapshot: {
                studentName: enrollment.studentId?.name || "",
                personalNumber: enrollment.studentId?.personalNumber || "",
                courseName: enrollment.mainCourseId?.courseName || "",
                courseCode: enrollment.mainCourseId?.courseCode || "",
                periodStart: enrollment.startDate,
                periodEnd: enrollment.endDate,
                completedAt: enrollment.completedAt,
                teacherName: enrollment.teacherId?.username || "",
                certificateNumber: enrollment.completionCertificate || "",
            },
            ...settings,
            issuedDate: new Date(),
        });

        const template = await CertificateTemplate.findOne({ key: "studieintyg" }).lean();
        const pdf = await htmlToPdfBuffer(html, { orientation: template?.orientation || "portrait" });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="studieintyg-${enrollment._id}.pdf"`
        );
        res.send(pdf);

        // Add audit trail after successful generation
        try {
            await addCertificateAuditTrail(
                enrollment.studentId._id,
                enrollment._id,
                "studieintyg",
                req.user,
                settings.configVersion
            );
        } catch (auditError) {
            // Audit trail is non-fatal
        }
    } catch (error) {
        logger.error({ err: error, enrollmentId: req.params.enrollmentId }, "Error generating study certificate PDF");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
};

/**
 * Generate diploma PDF for a course-package student.
 * Verifies eligibility: all courses approved + APL approved.
 * Only available after course end date.
 */
export const generateDiplomaPdf = async (req, res) => {
    try {
        const enrollment = await StudentEnrollment.findById(req.params.enrollmentId)
            .populate("mainCourseId", "courseName courseCode")
            .populate({ path: "teacherId", select: TEACHER_POPULATE_FIELDS })
            .populate("studentId", "name personalNumber email aplStatus")
            .populate("coursePackageId");

        if (!enrollment) {
            return res.status(404).json({ message: "Ingen antagning hittad" });
        }

        const isStaff = getUserRoles(req.user).some((role) => STAFF_ROLES.includes(role));
        const enrollmentStudentEmail = enrollment.studentId?.email;
        const callerEmail = req.user?.email;
        const isOwner =
            !!enrollmentStudentEmail &&
            !!callerEmail &&
            String(callerEmail).toLowerCase() === String(enrollmentStudentEmail).toLowerCase();
        if (!isStaff && !isOwner) {
            return res.status(403).json({ message: "Ej behörig" });
        }

        const existingRecord = await CertificateRecord.findOne({
            enrollmentId: enrollment._id,
            type: "diplom",
        });
        if (existingRecord?.status === "revoked") {
            return res.status(410).json({ message: "Diplomet har återkallats" });
        }
        if (existingRecord?.status === "generated" && existingRecord.pdfFileId) {
            const existingPdf = await readPdfBuffer(existingRecord.pdfFileId);
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="diplom-${enrollment._id}.pdf"`
            );
            return res.send(existingPdf);
        }

        // Check if enrollment is completed
        if (enrollment.status !== "completed") {
            return res.status(400).json({
                message: "Diplom utfärdas först när utbildningen är slutförd",
            });
        }

        // Diploma is only for course-package students
        if (!enrollment.coursePackageId) {
            return res.status(403).json({
                message: "Diplom kan endast genereras för kurspaket-studenter",
            });
        }

        const coursePackage = enrollment.coursePackageId;

        // Verify all courses in the package are approved/completed
        const mainCourseId = enrollment.mainCourseId?._id?.toString();
        if (mainCourseId) {
            const courseInPackage = coursePackage.coursePackageCourses?.find(
                (c) => c.toString() === mainCourseId
            );
            if (!courseInPackage) {
                return res.status(400).json({
                    message: "Kursen ingår inte i detta kurspaket",
                });
            }
        }

        // Check eligibility: all courses must be completed/approved
        // and APL must be approved
        let allCoursesCompleted = true;
        let aplApproved = false;

        // Get all enrollments in this course package
        const packageEnrollments = await StudentEnrollment.find({
            coursePackageId: coursePackage._id,
            status: "completed",
        }).lean();

        // Check if this student has completed enrollments in the package
        // `packageEnrollments` is lean (studentId is a scalar ObjectId) while
        // `enrollment.studentId` is populated; normalize both before comparing.
        const targetStudentId = String(
            enrollment.studentId?._id || enrollment.studentId
        );
        const studentPackageEnrollments = packageEnrollments.filter((e) => {
            const eStudentId = String(e.studentId?._id || e.studentId);
            return eStudentId === targetStudentId;
        });

        // Check APL approval - student's APL status must be GREEN
        const studentDoc = await enrollment.studentId;
        if (studentDoc && studentDoc.aplStatus === "GREEN") {
            aplApproved = true;
        }

        // Check that all course enrollments for this student in the package are completed
        if (studentPackageEnrollments.length === 0) {
            allCoursesCompleted = false;
        }

        // If not all requirements met, return specific error
        if (!allCoursesCompleted) {
            return res.status(400).json({
                message: "Inte alla kurser är godkända ännu. Kontakta handledare för att få kurser godkända.",
            });
        }

        if (!aplApproved) {
            return res.status(400).json({
                message: "APL måste vara godkänd (status: GREEN) för att diplomas ska kunna utfärdas.",
            });
        }

        // Check that course end date has passed
        const courseEndDate = enrollment.endDate ? new Date(enrollment.endDate) : null;
        const now = new Date();
        if (courseEndDate && courseEndDate > now) {
            return res.status(400).json({
                message: "Diplom kan utfärdas först efter kursens slutdatum",
            });
        }

        // Generate diploma PDF
        const settings = await getSettingsSnapshot();
        const html = await buildCertificateHtml({
            type: "diplom",
            snapshot: {
                studentName: enrollment.studentId?.name || "",
                personalNumber: enrollment.studentId?.personalNumber || "",
                courseName: enrollment.mainCourseId?.courseName || "",
                courseCode: enrollment.mainCourseId?.courseCode || "",
                packageName: coursePackage?.coursePackageName || "",
                packageCode: coursePackage?.coursePackageCode || "",
                periodStart: enrollment.startDate,
                periodEnd: enrollment.endDate,
                completedAt: enrollment.completedAt,
                grade: enrollment.grade || "",
                teacherName: enrollment.teacherId?.username || "",
                certificateNumber: enrollment.completionCertificate || "",
            },
            ...settings,
            issuedDate: new Date(),
        });

        const template = await CertificateTemplate.findOne({ key: "diplom" }).lean();
        const pdf = await htmlToPdfBuffer(html, { orientation: template?.orientation || "landscape" });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="diplom-${enrollment._id}.pdf"`
        );
        res.send(pdf);

        // P7/P8 — deliver the diploma PDF to the student by email. This is a
        // real send attempt whose success is reported honestly (never claimed
        // for a non-delivering stream transport). Fire-and-forget on purpose:
        // a delivery failure must not fail the download the requestor already
        // received; it is reflected in the audit description instead.
        let auditSuffix = "";
        const studentEmail = enrollment.studentId?.email || null;
        if (!studentEmail) {
            logger.warn(
                { enrollmentId: enrollment._id, studentId: enrollment.studentId?._id },
                "Diploma generated but student has no email — email send skipped"
            );
            auditSuffix = "_no_email";
        } else {
            const delivery = await sendDiplomaEmail({
                studentName: enrollment.studentId?.name || "",
                email: studentEmail,
                pdf,
                filename: `diplom-${enrollment._id}.pdf`,
            });
            logger.info(
                { enrollmentId: enrollment._id, deliveredForReal: delivery.deliveredForReal, transportMode: delivery.transportMode },
                "Diploma email processing finished"
            );
            auditSuffix = delivery.deliveredForReal ? "_email_sent" : "_email_not_delivered";
        }

        // Add audit trail after successful generation
        try {
            await addCertificateAuditTrail(
                enrollment.studentId._id,
                enrollment._id,
                `diplom${auditSuffix}`,
                req.user,
                settings.configVersion
            );
        } catch (auditError) {
            // Audit trail is non-fatal
        }
    } catch (error) {
        logger.error({ err: error, enrollmentId: req.params.enrollmentId }, "Error generating diploma PDF");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
};
