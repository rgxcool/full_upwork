import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";
import { authenticateUser } from "../controllers/authController.js";
import { hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import { CertificateSettings, CertificateTemplate } from "../models/certificateModel.js";

const router = express.Router();

const ALLOWED_ADMIN_ROLES = ["systemadmin", "admin"];
const PNG_MAX_SIZE = 1 * 1024 * 1024;
const IMAGE_MAX_SIZE = 2 * 1024 * 1024;

const signatureUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PNG_MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === "image/png") return cb(null, true);
        cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE"), file.fieldname);
    },
}).single("file");

const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: IMAGE_MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
        cb(ok ? null : new multer.MulterError("LIMIT_UNEXPECTED_FILE"), file.fieldname);
    },
}).single("file");

// Normalize Multer errors (wrong type, too large) into clean JSON responses.
const handleMulterError = (err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: "Filen är för stor (max 1 MB)." });
        }
        return res.status(400).json({ message: "Ogiltigt filformat. Endast PNG med transparens (max 1 MB)." });
    }
    if (err) return res.status(400).json({ message: "Ogiltig uppladdning." });
    next();
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getSettings = async () => {
    let s = await CertificateSettings.findOne({}).lean();
    if (!s) {
        s = await CertificateSettings.create({});
        s = s.toObject();
    }
    return s;
};

const toMediaUrl = (fileId) => (fileId ? `/api/certificates/media/${fileId}` : null);

const SETTINGS_FIELDS = ["signerName", "signerTitle", "schoolName"];

const DEFAULTS = {
    diplom: {
        key: "diplom",
        name: "Diplom",
        title: "Diplom",
        subtitle: "För framgångsrikt genomförd utbildning",
        bodyPrefix: "Detta diplom tilldelas",
        footerText: "Mindful Learning",
        orientation: "landscape",
        showGrade: true,
        showApl: true,
        showPackage: true,
    },
    studieintyg: {
        key: "studieintyg",
        name: "Studieintyg",
        title: "Studieintyg",
        subtitle: "Bevis på genomförd kurs",
        bodyPrefix: "Detta intyg utfärdas",
        footerText: "Mindful Learning",
        orientation: "portrait",
        showGrade: false,
        showApl: false,
        showPackage: false,
    },
};

// Placeholder HTML used when seeding templates; placeholders are replaced at
// render-time client-side by substituting `{{placeholders}}`.  This keeps the
// admin editing tools unaware of the rendering pipeline – they edit fields,
// and the preview does string-replace client-side.

const DIPLOM_HTML = `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <title>Diplom – {{studentName}}</title>
  <style>
    @page{size:A4 landscape;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#0b3a45;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;color:#1a2b3c}
    .diploma{width:297mm;height:210mm;background:radial-gradient(ellipse 80% 60% at 10% 0%,rgba(0,174,239,.08),transparent 55%),radial-gradient(ellipse 70% 50% at 100% 100%,rgba(15,76,92,.07),transparent 50%),linear-gradient(180deg,#fff 0%,#f7fbfd 100%);position:relative;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);padding:12mm 18mm;display:flex;flex-direction:column}
    .frame-outer{position:absolute;inset:6mm;border:2px solid #0f4c5c;pointer-events:none;z-index:2}
    .frame-inner{position:absolute;inset:8mm;border:1px solid #00aeef;opacity:.55;pointer-events:none;z-index:2}
    .frame-gold{position:absolute;inset:9.5mm;border:1px solid #c9a227;opacity:.7;pointer-events:none;z-index:2}
    .corner{position:absolute;width:22px;height:22px;border:2px solid #c9a227;z-index:3}
    .corner.tl{top:7.5mm;left:7.5mm;border-right:0;border-bottom:0}
    .corner.tr{top:7.5mm;right:7.5mm;border-left:0;border-bottom:0}
    .corner.bl{bottom:7.5mm;left:7.5mm;border-right:0;border-top:0}
    .corner.br{bottom:7.5mm;right:7.5mm;border-left:0;border-top:0}
    .content{position:relative;z-index:4;flex:1;display:flex;flex-direction:column;align-items:center;text-align:center}
    .logo-wrap{margin-top:2mm;margin-bottom:2mm}.logo-wrap img{height:48px;width:auto;display:block}
    .tagline{font-family:Helvetica Neue,sans-serif;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#5a7a8a;margin-top:4px}
    .title{font-size:42px;font-weight:400;letter-spacing:.28em;text-transform:uppercase;color:#0f4c5c;margin:8px 0 2px}
    .title-line{width:120px;height:2px;background:linear-gradient(90deg,transparent,#00aeef,#c9a227,#00aeef,transparent);margin:6px auto 10px}
    .subtitle{font-style:italic;font-size:14px;color:#3d6b7a;margin-bottom:10px}
    .awarded{font-family:Helvetica Neue,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6a7a8a;margin-bottom:4px}
    .student-name{font-size:30px;font-weight:600;color:#0f4c5c;padding:0 12px 6px;border-bottom:2px solid #00aeef;display:inline-block;margin-bottom:4px}
    .personal-number{font-family:Helvetica Neue,sans-serif;font-size:12px;color:#6a7a8a;margin-bottom:12px}
    .for-label{font-size:13px;color:#4a5a6a;margin-bottom:4px}
    .course-name{font-size:20px;font-weight:600;color:#0f4c5c;margin-bottom:2px}
    .course-meta{font-family:Helvetica Neue,sans-serif;font-size:12px;color:#5a6a7a;line-height:1.55}
    .course-meta strong{color:#0f4c5c;font-weight:600}
    .pills{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px}
    .pill{font-family:Helvetica Neue,sans-serif;font-size:11px;letter-spacing:.06em;padding:5px 14px;border-radius:999px;border:1px solid #00aeef;color:#0f4c5c;background:rgba(0,174,239,.06)}
    .pill.gold{border-color:#c9a227;background:rgba(201,162,39,.08)}
    .signatures{display:flex;justify-content:space-between;width:100%;max-width:620px;margin-top:auto;padding-top:14px;font-family:Helvetica Neue,sans-serif}
    .sign-block{width:200px;text-align:center}
    .sign-image-wrap{height:56px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:4px}
    .sign-image-wrap img{max-height:52px;max-width:180px;width:auto;height:auto;object-fit:contain;background:transparent !important;mix-blend-mode:multiply}
    .sign-line{border-top:1px solid #0f4c5c;margin-bottom:4px}
    .sign-role{font-size:10px;color:#6a7a8a;letter-spacing:.04em;text-transform:uppercase}
    .sign-name{font-size:12px;color:#0f4c5c;font-weight:600;margin-top:2px}
    .footer-bar{margin-top:10px;font-family:Helvetica Neue,sans-serif;font-size:10px;color:#8a9aaa;letter-spacing:.04em}
    .footer-bar span + span::before{content:" · ";margin:0 4px;color:#c9a227}
    @media print{body{background:#fff;padding:0}.diploma{box-shadow:none}}
  </style>
</head>
<body>
  <article class="diploma">
    <div class="frame-outer"></div><div class="frame-inner"></div><div class="frame-gold"></div>
    <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
    <div class="content">
      <div class="logo-wrap"><img src="{{logoUrl}}" alt="Logotyp" /></div>
      <h1 class="title">{{title}}</h1>
      <div class="title-line"></div>
      <p class="subtitle">{{subtitle}}</p>
      <p class="awarded">{{bodyPrefix}}</p>
      <div class="student-name">{{studentName}}</div>
      <p class="personal-number">Personnummer: {{personalNumber}}</p>
      <p class="for-label">för genomförd kurs / utbildning</p>
      <p class="course-name">{{courseName}}</p>
      <p class="course-meta">
        <strong>Kurskod:</strong> {{courseCode}}<br v-if="packageName" /><span v-if="packageName"><strong>Kurspaket:</strong> {{packageName}}</span><br />
        <strong>Studieperiod:</strong> {{periodStart}} – {{periodEnd}}<br />
        <strong>Slutförd:</strong> {{completedAt}} · <strong>Lärare:</strong> {{teacherName}}
      </p>
      <div class="pills">
        {{#showGrade}}<span class="pill">Betyg: {{grade}}</span>{{/showGrade}}
        {{#showApl}}<span class="pill gold">APL godkänd</span>{{/showApl}}
        {{#showPackage}}<span class="pill">{{schoolName}}</span>{{/showPackage}}
      </div>
      <div class="signatures">
        <div class="sign-block">
          <div class="sign-image-wrap"><img src="{{signatureUrl}}" alt="Underskrift" /></div>
          <div class="sign-line"></div>
          <div class="sign-role">{{signerTitle}}</div>
          <div class="sign-name">{{signerName}}</div>
        </div>
        <div class="sign-block">
          <div class="sign-image-wrap"></div>
          <div class="sign-line"></div>
          <div class="sign-role">Datum</div>
          <div class="sign-name">{{issuedDate}}</div>
        </div>
      </div>
      <p class="footer-bar"><span>Intygsnummer: {{certificateNumber}}</span><span>{{schoolName}}</span><span>{{issuedDate}}</span></p>
    </div>
  </article>
</body>
</html>`;

const STUDIEINTYG_HTML = `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <title>Studieintyg – {{studentName}}</title>
  <style>
    @page{size:A4 portrait;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#0b3a45;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;color:#1a2b3c}
    .certificate{width:210mm;height:297mm;background:linear-gradient(180deg,#fff 0%,#f7fbfd 100%);position:relative;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);padding:18mm 22mm;display:flex;flex-direction:column}
    .frame-outer{position:absolute;inset:6mm;border:2px solid #0f4c5c;pointer-events:none;z-index:2}
    .frame-inner{position:absolute;inset:8mm;border:1px solid #00aeef;opacity:.55;pointer-events:none;z-index:2}
    .corner{position:absolute;width:22px;height:22px;border:2px solid #c9a227;z-index:3}
    .corner.tl{top:7.5mm;left:7.5mm;border-right:0;border-bottom:0}
    .corner.tr{top:7.5mm;right:7.5mm;border-left:0;border-bottom:0}
    .corner.bl{bottom:7.5mm;left:7.5mm;border-right:0;border-top:0}
    .corner.br{bottom:7.5mm;right:7.5mm;border-left:0;border-top:0}
    .content{position:relative;z-index:4;flex:1;display:flex;flex-direction:column;align-items:center;text-align:center}
    .logo-wrap{margin-bottom:2mm}.logo-wrap img{height:48px;width:auto}
    .title{font-size:36px;font-weight:400;letter-spacing:.28em;text-transform:uppercase;color:#0f4c5c;margin:8px 0 2px}
    .title-line{width:100px;height:2px;background:linear-gradient(90deg,transparent,#00aeef,#c9a227,#00aeef,transparent);margin:6px auto 10px}
    .subtitle{font-style:italic;font-size:13px;color:#3d6b7a;margin-bottom:10px}
    .awarded{font-family:Helvetica Neue,sans-serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6a7a8a;margin-bottom:4px}
    .student-name{font-size:26px;font-weight:600;color:#0f4c5c;padding:0 12px 6px;border-bottom:2px solid #00aeef;display:inline-block;margin-bottom:4px}
    .personal-number{font-family:Helvetica Neue,sans-serif;font-size:12px;color:#6a7a8a;margin-bottom:14px}
    .detail-group{width:100%;max-width:480px;text-align:left;margin:16px 0;font-family:Helvetica Neue,sans-serif}
    .detail-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:13px}
    .detail-label{color:#6a7a8a;font-weight:500}
    .detail-value{color:#0f4c5c;font-weight:600}
    .note{margin-top:auto;padding-top:20px;font-size:13px;color:#3d6b7a;font-style:italic}
    .signatures{display:flex;justify-content:space-between;width:100%;max-width:480px;margin-top:24px;font-family:Helvetica Neue,sans-serif}
    .sign-block{width:200px;text-align:center}
    .sign-image-wrap{height:56px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:4px}
    .sign-image-wrap img{max-height:52px;max-width:180px;object-fit:contain;background:transparent !important;mix-blend-mode:multiply}
    .sign-line{border-top:1px solid #0f4c5c;margin-bottom:4px}
    .sign-role{font-size:10px;color:#6a7a8a;letter-spacing:.04em;text-transform:uppercase}
    .sign-name{font-size:12px;color:#0f4c5c;font-weight:600;margin-top:2px}
    .footer-bar{margin-top:14px;font-family:Helvetica Neue,sans-serif;font-size:10px;color:#8a9aaa;letter-spacing:.04em}
    .footer-bar span + span::before{content:" · ";margin:0 4px;color:#c9a227}
    @media print{body{background:#fff;padding:0}.certificate{box-shadow:none}}
  </style>
</head>
<body>
  <article class="certificate">
    <div class="frame-outer"></div><div class="frame-inner"></div>
    <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
    <div class="content">
      <div class="logo-wrap"><img src="{{logoUrl}}" alt="Logotyp" /></div>
      <h1 class="title">{{title}}</h1>
      <div class="title-line"></div>
      <p class="subtitle">{{subtitle}}</p>
      <p class="awarded">{{bodyPrefix}}</p>
      <div class="student-name">{{studentName}}</div>
      <p class="personal-number">Personnummer: {{personalNumber}}</p>
      <div class="detail-group">
        <div class="detail-row"><span class="detail-label">Kurs</span><span class="detail-value">{{courseName}}</span></div>
        <div class="detail-row"><span class="detail-label">Kurskod</span><span class="detail-value">{{courseCode}}</span></div>
        <div class="detail-row"><span class="detail-label">Studieperiod</span><span class="detail-value">{{periodStart}} – {{periodEnd}}</span></div>
        <div class="detail-row"><span class="detail-label">Slutförd</span><span class="detail-value">{{completedAt}}</span></div>
        <div class="detail-row"><span class="detail-label">Lärare</span><span class="detail-value">{{teacherName}}</span></div>
      </div>
      <div class="signatures">
        <div class="sign-block">
          <div class="sign-image-wrap"><img src="{{signatureUrl}}" alt="Underskrift" /></div>
          <div class="sign-line"></div>
          <div class="sign-role">{{signerTitle}}</div>
          <div class="sign-name">{{signerName}}</div>
        </div>
        <div class="sign-block"><div class="sign-image-wrap"></div><div class="sign-line"></div><div class="sign-role">Datum</div><div class="sign-name">{{issuedDate}}</div></div>
      </div>
      <p class="footer-bar"><span>{{footerText}}</span><span>{{issuedDate}}</span></p>
    </div>
  </article>
</body>
</html>`;

const seedTemplates = async () => {
    for (const [key, defaults] of Object.entries(DEFAULTS)) {
        const exists = await CertificateTemplate.findOne({ key }).lean();
        if (exists) continue;
        const html = key === "diplom" ? DIPLOM_HTML : STUDIEINTYG_HTML;
        await CertificateTemplate.create({ ...defaults, html });
    }
};

const ensureDefaults = async () => {
    await CertificateSettings.findOneAndUpdate({}, { $setOnInsert: {} }, { upsert: true, new: true });
    await seedTemplates();
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

router.get(
    "/certificates/settings",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (_req, res) => {
        const s = await getSettings();
        res.json({
            ...s,
            logoUrl: toMediaUrl(s.logoFileId),
            signatureUrl: toMediaUrl(s.signatureFileId),
        });
    })
);

router.put(
    "/certificates/settings",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const updates = {};
        for (const f of SETTINGS_FIELDS) {
            if (req.body[f] !== undefined) updates[f] = req.body[f];
        }
        updates.updatedBy = req.user.userId;
        const s = await CertificateSettings.findOneAndUpdate({}, { $set: updates }, { new: true, upsert: true }).lean();
        res.json({ ...s, logoUrl: toMediaUrl(s.logoFileId), signatureUrl: toMediaUrl(s.signatureFileId) });
    })
);

// Signature upload (PNG only)
router.post(
    "/certificates/settings/signature",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    (req, res, next) => signatureUpload(req, res, (err) => handleMulterError(err, req, res, next)),
    asyncHandler(async (req, res) => {
        if (!req.file) return res.status(400).json({ message: "Ingen fil" });
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        const s = await getSettings();
        // Remove previous file
        if (s.signatureFileId) {
            try { await bucket.delete(s.signatureFileId); } catch { /* ignore */ }
        }
        const stream = Readable.from(req.file.buffer);
        const upload = bucket.openUploadStream(req.file.originalname, {
            contentType: "image/png",
            metadata: { purpose: "certificate-signature", uploadedBy: req.user.userId },
        });
        await new Promise((resolve, reject) => {
            stream.pipe(upload).on("error", reject).on("finish", resolve);
        });
        const updated = await CertificateSettings.findOneAndUpdate(
            {},
            { $set: { signatureFileId: upload.id, updatedBy: req.user.userId } },
            { new: true, upsert: true }
        ).lean();
        res.json({ signatureUrl: toMediaUrl(updated.signatureFileId) });
    })
);

// Logo upload
router.post(
    "/certificates/settings/logo",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    (req, res, next) => logoUpload(req, res, (err) => handleMulterError(err, req, res, next)),
    asyncHandler(async (req, res) => {
        if (!req.file) return res.status(400).json({ message: "Ingen fil" });
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        const s = await getSettings();
        if (s.logoFileId) {
            try { await bucket.delete(s.logoFileId); } catch { /* ignore */ }
        }
        const stream = Readable.from(req.file.buffer);
        const upload = bucket.openUploadStream(req.file.originalname, {
            contentType: req.file.mimetype,
            metadata: { purpose: "certificate-logo", uploadedBy: req.user.userId },
        });
        await new Promise((resolve, reject) => {
            stream.pipe(upload).on("error", reject).on("finish", resolve);
        });
        const updated = await CertificateSettings.findOneAndUpdate(
            {},
            { $set: { logoFileId: upload.id, updatedBy: req.user.userId } },
            { new: true, upsert: true }
        ).lean();
        res.json({ logoUrl: toMediaUrl(updated.logoFileId) });
    })
);

// Delete signature
router.delete(
    "/certificates/settings/signature",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (_req, res) => {
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        const s = await getSettings();
        if (s.signatureFileId) {
            try { await bucket.delete(s.signatureFileId); } catch { /* ignore */ }
            await CertificateSettings.findOneAndUpdate({}, { $set: { signatureFileId: null } });
        }
        res.json({ signatureUrl: null });
    })
);

// Delete logo
router.delete(
    "/certificates/settings/logo",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (_req, res) => {
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        const s = await getSettings();
        if (s.logoFileId) {
            try { await bucket.delete(s.logoFileId); } catch { /* ignore */ }
            await CertificateSettings.findOneAndUpdate({}, { $set: { logoFileId: null } });
        }
        res.json({ logoUrl: null });
    })
);

// Stream media inline (for <img> tags in admin preview)
router.get(
    "/certificates/media/:fileId",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const { fileId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(fileId)) return res.status(400).json({ message: "Ogiltig fil-ID" });
        const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
        const file = await mongoose.connection.db.collection("fs.files").findOne({ _id: new mongoose.Types.ObjectId(fileId) });
        if (!file) return res.status(404).json({ message: "Filen hittades inte" });
        res.setHeader("Content-Type", file.contentType || "application/octet-stream");
        res.setHeader("Cache-Control", "private, max-age=86400");
        bucket.openDownloadStream(file._id).pipe(res);
    })
);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

router.get(
    "/certificates/templates",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (_req, res) => {
        await ensureDefaults();
        const templates = await CertificateTemplate.find({}).sort({ key: 1 }).lean();
        res.json(templates);
    })
);

router.get(
    "/certificates/templates/:key",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        await ensureDefaults();
        const t = await CertificateTemplate.findOne({ key: req.params.key }).lean();
        if (!t) return res.status(404).json({ message: "Mall hittades inte" });
        res.json(t);
    })
);

router.put(
    "/certificates/templates/:key",
    authenticateUser,
    hasRole(ALLOWED_ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const { key } = req.params;
        const updates = {};
        const ALLOWED = ["title", "subtitle", "bodyPrefix", "footerText", "html", "showGrade", "showApl", "showPackage", "isActive"];
        for (const f of ALLOWED) {
            if (req.body[f] !== undefined) updates[f] = req.body[f];
        }
        updates.updatedBy = req.user.userId;
        const t = await CertificateTemplate.findOneAndUpdate({ key }, { $set: updates }, { new: true }).lean();
        if (!t) return res.status(404).json({ message: "Mall hittades inte" });
        res.json(t);
    })
);

export default router;