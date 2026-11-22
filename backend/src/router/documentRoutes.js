import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import mime from "mime-types";
import Document from "../models/Document.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasGlobalScope, municipalityInScope } from "../utils/tenantScope.js";
import {
  canAccessDocument,
  canAccessStudentDocuments,
  canAccessTeacherDocuments,
  isStaffOnlyDocumentType,
  isStaffUser,
  STAFF_ONLY_DOCUMENT_TYPES,
} from "../utils/documentAuthorization.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../../public/uploads");
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info({ uploadsDir }, "Created uploads directory");
  } else {
    logger.info({ uploadsDir }, "Uploads directory exists");
  }
} catch (err) {
  logger.error({ err: err }, "Error creating uploads directory");
}

const DANGEROUS_EXTENSIONS = [
  ".exe",
  ".dll",
  ".bat",
  ".sh",
  ".js",
  ".py",
  ".html",
  ".htm",
  ".xhtml",
  ".php",
  ".jsp",
  ".asp",
  ".aspx",
  ".vbs",
  ".cmd",
  ".pl",
  ".cgi",
  ".msi",
  ".jar",
  ".scr",
];

// Document, image, and video formats for course cards & materials.
// A blocklist alone is not enough: an unexpected extension could otherwise
// be served back to a browser with an active content type.
const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
  ".csv",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".mp4",
  ".webm",
  ".mov",
  ".ogg",
  ".m4v",
]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".ogg", ".m4v"]);

// Images and PDFs open in a new browser tab/page; other files download.
const INLINE_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  "GENERAL",
  "ACTION_PLAN",
  "REPORT",
  "COURSE_ARCHIVE",
  "DELPROV",
  "SLUTPROV",
  "TEACHER_DOCUMENT",
  "APL_CONTRACT",
  "APL_CV",
  "CV",
]);

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB (supports course videos & documents)

const getFileType = (filename) =>
  path
    .extname(filename || "")
    .replace(".", "")
    .toLowerCase() || null;

const inferMimeType = (filename, fallbackMime) => {
  const ext = path.extname(filename || "").toLowerCase();
  const explicitMap = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogg": "video/ogg",
    ".m4v": "video/x-m4v",
    ".pdf": "application/pdf",
  };
  if (explicitMap[ext]) return explicitMap[ext];
  if (fallbackMime && fallbackMime !== "application/octet-stream")
    return fallbackMime;
  return mime.lookup(filename) || "application/octet-stream";
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const contentType = String(
    file.mimetype ||
      mime.lookup(file.originalname) ||
      "application/octet-stream",
  ).toLowerCase();
  if (
    !ALLOWED_EXTENSIONS.has(ext) ||
    DANGEROUS_EXTENSIONS.includes(ext) ||
    contentType.startsWith("text/html") ||
    contentType.includes("javascript") ||
    contentType.startsWith("application/x-msdownload") ||
    contentType.startsWith("application/x-executable")
  ) {
    req.rejectedFileType = true;
    return cb(null, false);
  }
  cb(null, true);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    } catch (err) {
      logger.error({ err: err }, "Error in multer destination");
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    try {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const safeName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 100);
      const filename = `${unique}-${safeName}`;
      logger.debug({ filename }, "Generated filename");
      cb(null, filename);
    } catch (err) {
      logger.error({ err: err }, "Error in multer filename");
      cb(err);
    }
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
});

const rejectOversizedUpload = (req, res, next) => {
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return res.status(400).json({
      message: "Filen är för stor. Max storlek är 3 GB.",
    });
  }
  return next();
};

const STAFF_UPLOAD_ROLES = new Set([
  "systemadmin",
  "admin",
  "coordinator",
  "tester",
]);
const COURSE_CARD_AUTHOR_ROLES = new Set(["teacher", "admin", "systemadmin"]);

const getUserRoles = (user) => {
  const roles = Array.isArray(user?.roles)
    ? [...user.roles]
    : user?.roles
      ? [user.roles]
      : [];
  if (user?.role) roles.push(user.role);
  return new Set(
    roles
      .filter((role) => typeof role === "string")
      .map((role) => role.toLowerCase()),
  );
};

const getStudentMunicipality = (student) =>
  typeof student?.municipality === "string"
    ? student.municipality
    : student?.municipality?.type;

async function canUploadForStudent(user, studentId) {
  if (!user || !studentId) {
    return false;
  }

  const roles = getUserRoles(user);
  if (
    [...roles].some((role) => STAFF_UPLOAD_ROLES.has(role)) &&
    hasGlobalScope(user)
  ) {
    return true;
  }

  const Student = mongoose.model("Student");
  const student = await Student.findById(studentId).select(
    "municipality teacherId",
  );
  if (!student || !municipalityInScope(user, getStudentMunicipality(student))) {
    return false;
  }

  if ([...roles].some((role) => STAFF_UPLOAD_ROLES.has(role))) {
    return true;
  }

  if (roles.has("student")) {
    const ownStudent = await Student.findOne({ email: user.email }).select(
      "_id",
    );
    if (ownStudent && String(ownStudent._id) === String(studentId)) {
      return true;
    }
  }

  if (roles.has("teacher")) {
    const Teacher = mongoose.model("Teacher");
    const teacher = await Teacher.findOne({ userId: user.userId }).select(
      "_id",
    );
    return Boolean(
      teacher &&
      student.teacherId &&
      String(student.teacherId) === String(teacher._id),
    );
  }

  return false;
}

const serializeDocument = (document) => {
  const raw = document?.toObject ? document.toObject() : { ...document };
  let uploader = null;

  if (
    raw.uploadedBy &&
    typeof raw.uploadedBy === "object" &&
    (raw.uploadedBy.name || raw.uploadedBy.email)
  ) {
    uploader = {
      _id: String(raw.uploadedBy._id),
      name: raw.uploadedBy.name || raw.uploadedBy.email,
      email: raw.uploadedBy.email || null,
    };
    raw.uploadedBy = raw.uploadedBy._id;
  }

  raw.uploader = uploader;
  raw.fileType = raw.fileType || getFileType(raw.originalName);
  raw.mimeType = raw.mimeType || inferMimeType(raw.originalName, null);

  return raw;
};

const buildFileMetadata = (file) => ({
  mimeType: inferMimeType(file.originalname, file.mimetype),
  size: typeof file.size === "number" ? file.size : null,
  fileType: getFileType(file.originalname),
});

const removeUploadedFile = (file) => {
  if (!file?.path) return;
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (err) {
    logger.warn({ err, path: file.path }, "Could not remove rejected upload");
  }
};

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "Filen är för stor. Max storlek är 3 GB." });
    }
    return res.status(400).json({ message: "Filuppladdningsfel" });
  }
  if (err) {
    return res.status(500).json({ message: "Fel vid filuppladdning" });
  }
  next();
};

// Upload course-card material (video, PDF, image, or downloadable file)
router.post(
  "/documents/course-material",
  authenticateUser,
  rejectOversizedUpload,
  upload.single("file"),
  handleMulterError,
  async (req, res) => {
    try {
      if (req.rejectedFileType) {
        return res.status(400).json({
          message:
            "Ogiltigt filformat. Denna filtyp är inte tillåten av säkerhetsskäl.",
        });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ message: "File is missing in the request" });
      }

      if (!req.file.size) {
        removeUploadedFile(req.file);
        return res
          .status(400)
          .json({ message: "Filen är tom. Ladda upp en fil med innehåll." });
      }

      const user = req.user;
      if (!user || !user.userId) {
        removeUploadedFile(req.file);
        return res.status(401).json({ message: "User not authenticated" });
      }

      const roles = getUserRoles(user);
      const canManageCourseCard = [...roles].some((role) =>
        COURSE_CARD_AUTHOR_ROLES.has(role),
      );
      if (!canManageCourseCard) {
        removeUploadedFile(req.file);
        return res.status(403).json({
          message: "Du har inte behörighet att ladda upp kurskortsmaterial",
        });
      }

      const ext = path.extname(req.file.originalname || "").toLowerCase();
      const mimeType = inferMimeType(req.file.originalname, req.file.mimetype);
      const isVideo =
        mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
      const openInNewTab =
        !isVideo &&
        (INLINE_EXTENSIONS.has(ext) ||
          mimeType.startsWith("image/") ||
          mimeType === "application/pdf");

      const encodedName = encodeURIComponent(req.file.filename);
      const url = `/api/documents/course-material/${encodedName}`;
      const downloadUrl = `${url}?download=1`;

      return res.status(201).json({
        fileId: req.file.filename,
        fileName: req.file.originalname,
        mimeType,
        size: req.file.size,
        fileType: getFileType(req.file.originalname),
        isVideo,
        openInNewTab,
        url,
        downloadUrl,
        courseInstanceId: req.body?.courseInstanceId || null,
      });
    } catch (error) {
      logger.error({ err: error }, "Error during course material upload");
      removeUploadedFile(req.file);
      return res.status(500).json({
        message: "Kunde inte ladda upp kurskortsmaterialet",
        ...(process.env.NODE_ENV !== "production" && { error: error.message }),
      });
    }
  },
);

// Serve course-card material: inline in new tab for images/PDFs, attachment for other files
router.get(
  "/documents/course-material/:filename",
  authenticateUser,
  (req, res) => {
    const safeName = path.basename(req.params.filename || "");
    const filePath = path.resolve(uploadsDir, safeName);

    if (
      path.dirname(filePath) !== uploadsDir ||
      path.basename(filePath) !== safeName ||
      !fs.existsSync(filePath)
    ) {
      return res.status(404).json({ message: "Filen hittades inte" });
    }

    const ext = path.extname(safeName).toLowerCase();
    const contentType = inferMimeType(safeName, "");
    const isVideo =
      contentType.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
    const canInline =
      INLINE_EXTENSIONS.has(ext) ||
      contentType.startsWith("image/") ||
      contentType === "application/pdf";
    const forceDownload =
      req.query.download === "1" || (!isVideo && !canInline);

    const safeDownloadName = safeName.replace(/["\r\n]/g, "_");
    const asciiName = safeDownloadName.replace(/[^\x20-\x7E]/g, "_");

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (forceDownload) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeDownloadName)}`,
      );
    } else {
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeDownloadName)}`,
      );
    }

    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        logger.error(
          { err: error, filename: safeName },
          "Error sending course material file",
        );
        res.status(500).json({ message: "Kunde inte hämta filen" });
      }
    });
  },
);

router.post(
  "/documents/upload",
  authenticateUser,
  rejectOversizedUpload,
  upload.single("file"),
  handleMulterError,
  async (req, res) => {
    let documentCreated = false;
    try {
      if (req.rejectedFileType) {
        return res.status(400).json({
          message:
            "Ogiltigt filformat. Denna filtyp är inte tillåten av säkerhetsskäl.",
        });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ message: "File is missing in the request" });
      }

      if (!req.file.size) {
        removeUploadedFile(req.file);
        return res
          .status(400)
          .json({ message: "Filen är tom. Ladda upp en fil med innehåll." });
      }

      logger.info(
        {
          file: req.file,
          bodyKeys: req.body ? Object.keys(req.body) : [],
          user: req.user,
        },
        "File upload details",
      );

      const { studentId, teacherId, type, enrollmentId } = req.body;
      const user = req.user;

      if (!user || !user.userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const normalizedType =
        typeof type === "string" && type.trim()
          ? type.trim()
          : studentId
            ? "GENERAL"
            : "TEACHER_DOCUMENT";

      if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
        removeUploadedFile(req.file);
        return res.status(400).json({ message: "Ogiltig dokumenttyp." });
      }

      if (isStaffOnlyDocumentType(normalizedType) && !isStaffUser(user)) {
        removeUploadedFile(req.file);
        return res.status(403).json({
          message: "Endast personal kan ladda upp provfiler (delprov/slutprov).",
        });
      }

      const userRoles = getUserRoles(user);
      const isAdmin = userRoles.has("admin") || userRoles.has("systemadmin");

      if (studentId) {
        if (!studentId || studentId.trim() === "") {
          return res.status(400).json({ message: "studentId is required" });
        }

        const allowed = await canUploadForStudent(user, studentId);
        if (!allowed) {
          removeUploadedFile(req.file);
          return res.status(403).json({
            message:
              "Du har inte behörighet att ladda upp dokument för denna elev",
          });
        }

        const doc = await Document.create({
          student: studentId,
          uploadedBy: user.userId,
          filename: req.file.filename,
          originalName: req.file.originalname,
          type: normalizedType,
          enrollmentId: enrollmentId || null,
          ...buildFileMetadata(req.file),
        });
        documentCreated = true;
        return res.status(201).json(serializeDocument(doc));
      } else if (teacherId) {
        const userIdStr = String(user.userId);
        const teacherIdStr = String(teacherId);

        logger.debug(
          { userIdStr, teacherIdStr, isAdmin },
          "Permission check for teacher document",
        );

        const teacherAllowed = await canAccessTeacherDocuments(user, teacherId);
        if (!teacherAllowed) {
          removeUploadedFile(req.file);
          return res.status(403).json({
            message:
              "Du har inte behörighet att ladda upp dokument för denna lärare",
          });
        }

        if (!teacherId || teacherId.trim() === "") {
          removeUploadedFile(req.file);
          return res.status(400).json({ message: "teacherId is required" });
        }

        logger.debug(
          {
            teacher: teacherId,
            uploadedBy: user.userId,
            filename: req.file.filename,
            originalName: req.file.originalname,
            type: type || "TEACHER_DOCUMENT",
          },
          "Creating teacher document",
        );

        const doc = await Document.create({
          teacher: teacherId,
          uploadedBy: user.userId,
          filename: req.file.filename,
          originalName: req.file.originalname,
          type: normalizedType,
          enrollmentId: null,
          ...buildFileMetadata(req.file),
        });

        documentCreated = true;
        logger.info({ docId: doc._id }, "Document created successfully");
        return res.status(201).json(serializeDocument(doc));
      } else {
        removeUploadedFile(req.file);
        return res
          .status(400)
          .json({ message: "Either studentId or teacherId must be provided" });
      }
    } catch (error) {
      logger.error({ err: error }, "Error during upload");

      if (!documentCreated) {
        removeUploadedFile(req.file);
      }

      if (
        error.name === "ValidationError" ||
        error instanceof mongoose.Error.ValidationError ||
        error.message?.includes("must be specified")
      ) {
        const errorMessages = error.errors
          ? Object.values(error.errors).map((e) => e.message || e)
          : "";
        return res.status(400).json({
          message: "Valideringsfel",
          ...(errorMessages && { error: errorMessages }),
        });
      }

      if (error.name === "CastError") {
        return res.status(400).json({
          message: "Ogiltigt ID-format",
          error: error.message,
        });
      }

      res.status(500).json({
        message: "Kunde inte ladda upp dokumentet",
        ...(process.env.NODE_ENV !== "production" && { error: error.message }),
      });
    }
  },
);

// Cross-student archive listing used by the APL contract archive
// (APLFileArchive.vue). Restricted to APL document types and filtered per
// document with the same rule as download, so teachers/scoped staff only see
// files they may open.
const ARCHIVE_LISTABLE_TYPES = new Set(["APL_CONTRACT", "APL_CV"]);
router.get("/documents", authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    if (!isStaffUser(user)) {
      return res.status(403).json({ message: "Endast personal kan lista arkivet" });
    }
    const types = String(req.query.type || "APL_CONTRACT")
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (!types.length || types.some((t) => !ARCHIVE_LISTABLE_TYPES.has(t))) {
      return res.status(400).json({ message: "Ogiltig dokumenttyp för arkivet." });
    }

    const docs = await Document.find({ type: { $in: types }, student: { $ne: null } })
      .sort({ createdAt: -1 })
      .populate({ path: "student", select: "name" })
      .populate({ path: "uploadedBy", select: "name email" });

    const visible = [];
    for (const doc of docs) {
      // Orphaned files (student deleted) are hidden, not leaked.
      if (!doc.student) continue;
      const studentId = doc.student._id || doc.student;
      if (await canAccessDocument(user, { ...doc.toObject(), student: studentId })) {
        const serialized = serializeDocument(doc);
        serialized.student = studentId;
        serialized.studentName = doc.student.name || "";
        visible.push(serialized);
      }
    }
    return res.json(visible);
  } catch (error) {
    logger.error({ err: error }, "Error listing archive documents");
    return res.status(500).json({ message: "Kunde inte hämta arkivet" });
  }
});

router.get("/documents/shared", authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const sharedFilter = { sharedWith: userId };
    if (!isStaffUser(req.user)) {
      sharedFilter.type = { $nin: STAFF_ONLY_DOCUMENT_TYPES };
    }
    const docs = await Document.find(sharedFilter)
      .sort({ createdAt: -1 })
      .populate({ path: "uploadedBy", select: "name email" })
      .populate({ path: "teacher", select: "name email" });

    return res.json(docs.map(serializeDocument));
  } catch (error) {
    logger.error({ err: error }, "Error fetching shared documents");
    return res
      .status(500)
      .json({ message: "Kunde inte hämta delade dokument" });
  }
});

router.get("/documents/:id", authenticateUser, async (req, res) => {
  try {
    const { type, enrollmentId, entityType } = req.query;
    const id = req.params.id;
    const user = req.user;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Ogiltigt ID-format" });
    }

    const isTeacherEntity = ["teacher", "lärare"].includes(
      String(entityType || "").toLowerCase(),
    );

    const filter = isTeacherEntity ? { teacher: id } : { student: id };
    const allowed = isTeacherEntity
      ? await canAccessTeacherDocuments(user, id)
      : await canAccessStudentDocuments(user, id);

    if (!allowed) {
      return res.status(403).json({
        message: "Du har inte behörighet att komma åt dokumenten",
      });
    }

    // `type` may be a single type or a comma-separated list (e.g. the
    // Kursarkiv shows COURSE_ARCHIVE,DELPROV,SLUTPROV together).
    const requestedTypes =
      typeof type === "string" && type.trim()
        ? type.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
    const visibleTypes = isStaffUser(user)
      ? requestedTypes
      : requestedTypes.filter((t) => !isStaffOnlyDocumentType(t));

    if (requestedTypes.length > 0) {
      if (visibleTypes.length === 0) return res.json([]);
      filter.type = { $in: visibleTypes };
    } else if (!isStaffUser(user)) {
      filter.type = { $nin: STAFF_ONLY_DOCUMENT_TYPES };
    }
    if (enrollmentId) filter.enrollmentId = enrollmentId;

    const docs = await Document.find(filter)
      .sort({ createdAt: -1 })
      .populate({ path: "uploadedBy", select: "name email" });
    return res.json(docs.map(serializeDocument));
  } catch (error) {
    logger.error({ err: error }, "Error fetching documents");
    res.status(500).json({ message: "Kunde inte hämta dokument" });
  }
});

router.get("/documents/download/:id", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Dokument hittades inte" });
    }

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: "Dokument hittades inte" });
    }

    const allowed = await canAccessDocument(req.user, document);
    if (!allowed) {
      return res
        .status(403)
        .json({ message: "Du har inte behörighet att hämta detta dokument" });
    }

    const filePath = path.resolve(uploadsDir, document.filename || "");
    if (
      path.dirname(filePath) !== uploadsDir ||
      path.basename(filePath) !== document.filename ||
      !fs.existsSync(filePath)
    ) {
      return res.status(404).json({ message: "Filen hittades inte" });
    }

    const safeName = String(document.originalName || "dokument").replace(
      /["\r\n]/g,
      "_",
    );
    const asciiName = safeName.replace(/[^\x20-\x7E]/g, "_");
    const contentType =
      document.mimeType || inferMimeType(document.originalName, null);

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );

    return res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        logger.error(
          { err: error, documentId: id },
          "Error sending document file",
        );
        res.status(500).json({ message: "Kunde inte hämta dokumentet" });
      }
    });
  } catch (error) {
    logger.error({ err: error }, "Error downloading document");
    return res.status(500).json({ message: "Kunde inte hämta dokumentet" });
  }
});

router.put("/documents/:id/share", authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Ogiltigt ID-format" });
    }

    const document = await Document.findById(id);
    if (!document) {
      return res.status(404).json({ message: "Dokument hittades inte" });
    }

    const userRoles = getUserRoles(req.user);
    const isAdmin = userRoles.has("admin") || userRoles.has("systemadmin");
    const isUploader =
      String(document.uploadedBy ?? "") === String(req.user?.userId ?? "");

    if (!isAdmin && !isUploader) {
      return res
        .status(403)
        .json({ message: "Du har inte behörighet att dela detta dokument" });
    }

    const body = req.body || {};
    const requestedIds = Array.isArray(body.userIds) ? [...body.userIds] : [];
    if (body.email) requestedIds.push(body.email);

    const sharedIds = [];
    for (const value of requestedIds) {
      if (mongoose.isValidObjectId(value)) {
        sharedIds.push(String(value));
        continue;
      }

      if (typeof value !== "string" || !value.includes("@")) {
        return res
          .status(400)
          .json({ message: "Ogiltigt användar-ID eller e-postadress" });
      }

      const User = mongoose.model("User");
      const sharedUser = await User.findOne({
        email: value.trim().toLowerCase(),
      })
        .select("_id")
        .lean();
      if (!sharedUser) {
        return res
          .status(404)
          .json({ message: `Ingen användare hittades för ${value}` });
      }
      sharedIds.push(String(sharedUser._id));
    }

    document.sharedWith = [...new Set(sharedIds)];
    await document.save();

    return res.json(serializeDocument(document));
  } catch (error) {
    logger.error({ err: error }, "Error sharing document");
    return res.status(500).json({ message: "Kunde inte dela dokumentet" });
  }
});

router.delete("/documents/:id", authenticateUser, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Dokument hittades inte" });
    }

    const user = req.user;
    const userRoles = getUserRoles(user);
    const isAdmin = userRoles.has("admin") || userRoles.has("systemadmin");
    const allowed = await canAccessDocument(user, doc);

    if (
      !allowed ||
      (!isAdmin && String(doc.uploadedBy ?? "") !== String(user.userId))
    ) {
      return res
        .status(403)
        .json({ message: "Du har inte behörighet att radera detta dokument" });
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: "Raderad" });
  } catch (error) {
    logger.error({ err: error }, "Error deleting document");
    res.status(500).json({ message: "Kunde inte radera dokumentet" });
  }
});

export default router;
