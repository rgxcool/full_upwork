import express from "express";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import { authenticateUser } from "../controllers/authController.js";
import { hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { CertificateRecord } from "../models/certificateModel.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import {
    getUserRoles,
    buildSnapshotData,
    getEligibility,
    getCertificateCandidates,
    nextCertificateNumber,
} from "../services/certificateService.js";
import {
    buildCertificateHtml,
    htmlToPdfBuffer,
    storePdfBuffer,
} from "../services/certificatePdf.js";
import { CertificateSettings, CertificateTemplate } from "../models/certificateModel.js";

const router = express.Router();

const ADMIN_ROLES = ["systemadmin", "admin"];
const STAFF_ROLES = [
    "systemadmin",
    "admin",
    "teacher",
    "syv",
    "specped",
    "coordinator",
    "tester",
];

const pushHistory = (doc, action, userId, note = "") => {
    doc.history.push({ action, by: userId, at: new Date(), note });
};

const getSettingsSnapshot = async () => {
    const s = await CertificateSettings.findOne({}).lean();
    return {
        signerName: s?.signerName || "",
        signerTitle: s?.signerTitle || "Rektor",
        schoolName: s?.schoolName || "Mindful Learning",
    };
};

// ---------------------------------------------------------------------------
// Candidates (approval queue) – admin only
// ---------------------------------------------------------------------------
router.get(
    "/certificates/candidates",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const result = await getCertificateCandidates({
            type: (req.query.type || "studieintyg").toString(),
            courseId: req.query.courseId,
            courseInstanceId: req.query.courseInstanceId,
            status: req.query.status,
            search: req.query.search,
            page: req.query.page,
            limit: req.query.limit,
        });
        res.json(result);
    })
);

// ---------------------------------------------------------------------------
// Student self-service: list the authenticated student's own generated records
// ---------------------------------------------------------------------------
router.get(
    "/certificates/mine",
    authenticateUser,
    asyncHandler(async (req, res) => {
        const roles = getUserRoles(req.user);
        if (roles.some((r) => STAFF_ROLES.includes(r))) {
            return res.status(400).json({ message: "Använd kandidat-/historik-vyn för personal." });
        }
        const Student = mongoose.model("Student");
        const student = await Student.findOne({ email: req.user.email }).lean();
        if (!student) return res.json({ records: [] });

        const records = await CertificateRecord.find({
            studentId: student._id,
            status: "generated",
        })
            .sort({ generatedAt: -1 })
            .select(
                "_id type courseName courseCode packageName packageCode certificateNumber generatedAt pdfFileId studentName"
            )
            .lean();
        res.json({ records });
    })
);

// ---------------------------------------------------------------------------
// Records – list / get (admin full; students limited to their own later)
// ---------------------------------------------------------------------------
router.get(
    "/certificates",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const { type, status, courseId, studentId, search } = req.query;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const query = {};
        if (type) query.type = type;
        if (status) query.status = status;
        if (courseId && mongoose.Types.ObjectId.isValid(courseId)) query.courseId = courseId;
        if (studentId && mongoose.Types.ObjectId.isValid(studentId)) query.studentId = studentId;

        if (search && search.trim()) {
            const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            query.$or = [{ studentName: rx }, { courseName: rx }, { certificateNumber: rx }];
        }

        const countPromise = CertificateRecord.countDocuments(query);

        const findPromise = CertificateRecord.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const [total, records] = await Promise.all([countPromise, findPromise]);
        res.json({
            records,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 0,
        });
    })
);

router.get(
    "/certificates/:id",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const record = await CertificateRecord.findById(req.params.id).lean();
        if (!record) return res.status(404).json({ message: "Intyg hittades inte" });
        res.json(record);
    })
);

// ---------------------------------------------------------------------------
// Create a draft record from an eligible enrollment (admin)
// ---------------------------------------------------------------------------
router.post(
    "/certificates",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const { enrollmentId, type = "studieintyg" } = req.body || {};
        if (!enrollmentId) return res.status(400).json({ message: "enrollmentId krävs" });
        if (!["diplom", "studieintyg"].includes(type)) {
            return res.status(400).json({ message: "Ogiltig typ" });
        }

        const snapshot = await buildSnapshotData(enrollmentId);
        if (!snapshot) return res.status(404).json({ message: "Antagning hittades inte" });

        const enrollment = await StudentEnrollment.findById(enrollmentId).lean();
        const { eligible, reason } = await getEligibility(enrollment, type);
        if (!eligible) return res.status(400).json({ message: reason });

        // Avoid duplicate draft/active records for the same enrollment+type.
        const existing = await CertificateRecord.findOne({ enrollmentId, type });
        if (existing) return res.json(existing);

        const record = await CertificateRecord.create({
            type,
            status: "draft",
            ...snapshot,
            history: [],
        });
        pushHistory(record, "created", req.user.userId, "Skapad som utkast");
        await record.save();

        res.status(201).json(record);
    })
);

// ---------------------------------------------------------------------------
// Edit snapshot fields while still a draft (admin)
// ---------------------------------------------------------------------------
router.put(
    "/certificates/:id",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const record = await CertificateRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: "Intyg hittades inte" });
        if (record.status === "generated" || record.status === "revoked") {
            return res.status(400).json({ message: "Kan inte redigera ett genererat/återkallat intyg" });
        }

        const ALLOWED = [
            "studentName",
            "personalNumber",
            "courseName",
            "courseCode",
            "packageName",
            "packageCode",
            "grade",
            "periodStart",
            "periodEnd",
            "completedAt",
            "teacherName",
        ];
        const changes = [];
        for (const f of ALLOWED) {
            if (req.body[f] !== undefined) {
                record[f] = req.body[f];
                changes.push(f);
            }
        }
        pushHistory(record, "edited", req.user.userId, `Redigerad: ${changes.join(", ")}`);
        await record.save();
        res.json(record);
    })
);

// ---------------------------------------------------------------------------
// Approve (admin)
// ---------------------------------------------------------------------------
router.post(
    "/certificates/:id/approve",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const record = await CertificateRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: "Intyg hittades inte" });
        if (record.status === "generated") {
            return res.status(400).json({ message: "Intyget är redan genererat" });
        }
        record.status = "approved";
        record.approvedBy = req.user.userId;
        record.approvedAt = new Date();
        pushHistory(record, "approved", req.user.userId, "Godkänd");
        await record.save();
        res.json(record);
    })
);

// ---------------------------------------------------------------------------
// Generate PDF (admin) – renders template and stores PDF in GridFS
// ---------------------------------------------------------------------------
router.post(
    "/certificates/:id/generate",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const record = await CertificateRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: "Intyg hittades inte" });

        const settings = await getSettingsSnapshot();
        const template = await CertificateTemplate.findOne({ key: record.type }).lean();

        // Assign a certificate number if missing (once, kept stable on regen).
        let certNumber = record.certificateNumber;
        if (!certNumber) {
            certNumber = await nextCertificateNumber();
            record.certificateNumber = certNumber;
        }

        const html = await buildCertificateHtml({
            type: record.type,
            snapshot: {
                studentName: record.studentName,
                personalNumber: record.personalNumber,
                courseName: record.courseName,
                courseCode: record.courseCode,
                packageName: record.packageName,
                grade: record.grade,
                periodStart: record.periodStart,
                periodEnd: record.periodEnd,
                completedAt: record.completedAt,
                teacherName: record.teacherName,
                certificateNumber: certNumber,
            },
            ...settings,
            issuedDate: new Date(),
        });

        const orientation = template?.orientation || (record.type === "diplom" ? "landscape" : "portrait");
        const pdf = await htmlToPdfBuffer(html, { orientation });

        // Store the PDF in GridFS; replace any previously generated file.
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        if (record.pdfFileId) {
            try { await bucket.delete(record.pdfFileId); } catch { /* ignore */ }
        }
        const filename = `${record.type}-${record.studentName || "cert"}-${certNumber}.pdf`
            .replace(/[^a-zA-Z0-9-_.äöåÄÖÅ ]/g, "_")
            .replace(/\s+/g, "-");
        record.pdfFileId = await storePdfBuffer(pdf, { filename, recordId: record._id });

        record.status = "generated";
        record.generatedBy = req.user.userId;
        record.generatedAt = new Date();
        pushHistory(record, "generated", req.user.userId, `PDF genererad (${certNumber})`);
        await record.save();

        res.json(record);
    })
);

// ---------------------------------------------------------------------------
// Download (staff any; student only own generated records)
// ---------------------------------------------------------------------------
router.get(
    "/certificates/:id/download",
    authenticateUser,
    asyncHandler(async (req, res) => {
        const record = await CertificateRecord.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ message: "Intyg hittades inte" });
        }
        if (!record.pdfFileId || record.status !== "generated") {
            return res.status(400).json({ message: "Intyget har inte genererats ännu" });
        }

        const roles = getUserRoles(req.user);
        const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
        if (!isStaff) {
            // Students may only download their own generated certificate.
            const Student = mongoose.model("Student");
            const student = await Student.findById(record.studentId).lean();
            const isOwner =
                !!student?.email &&
                !!req.user?.email &&
                String(student.email).toLowerCase() === String(req.user.email).toLowerCase();
            if (!isOwner) {
                return res.status(403).json({ message: "Ej behörig" });
            }
            pushHistory(record, "downloaded", req.user.userId, "Nedladdad av elev");
            await record.save();
        } else {
            pushHistory(record, "downloaded", req.user.userId, "Nedladdad");
            await record.save();
        }

        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        const file = await mongoose.connection.db
            .collection("fs.files")
            .findOne({ _id: record.pdfFileId });
        if (!file) {
            return res.status(404).json({ message: "PDF-filen hittades inte" });
        }

        const safeName = (record.studentName || "cert").replace(/[^a-zA-Z0-9-_]/g, "_");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${record.type}-${safeName}.pdf"; filename*=UTF-8''${encodeURIComponent(`${record.type}-${safeName}.pdf`)}`
        );
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
        bucket.openDownloadStream(file._id).pipe(res);
    })
);

// ---------------------------------------------------------------------------
// Revoke (admin)
// ---------------------------------------------------------------------------
router.post(
    "/certificates/:id/revoke",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const record = await CertificateRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ message: "Intyg hittades inte" });
        if (record.status === "revoked") return res.json(record);

        const reason = (req.body?.reason || "").toString();
        record.status = "revoked";
        record.revokedBy = req.user.userId;
        record.revokedAt = new Date();
        record.revokeReason = reason;
        pushHistory(record, "revoked", req.user.userId, reason ? `Återkallad: ${reason}` : "Återkallad");
        await record.save();
        res.json(record);
    })
);

// ---------------------------------------------------------------------------
// History (admin)
// ---------------------------------------------------------------------------
router.get(
    "/certificates/:id/history",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const record = await CertificateRecord.findById(req.params.id).select("history").lean();
        if (!record) return res.status(404).json({ message: "Intyg hittades inte" });
        res.json(record.history || []);
    })
);

export default router;
