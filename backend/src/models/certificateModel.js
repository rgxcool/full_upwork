import mongoose from "mongoose";

// --- CertificateSettings ----------------------------------------------------
// Singleton document holding org-level certificate configuration: which
// transparent signature/logo image to use, and the default signer identity.
const certificateSettingsSchema = new mongoose.Schema(
    {
        logoFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
        signatureFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
        signerName: { type: String, default: "" },
        signerTitle: { type: String, default: "Rektor" },
        signerDepartment: { type: String, default: "" },
        signerContact: { type: String, default: "" },
        schoolName: { type: String, default: "Mindful Learning" },
        organizationName: { type: String, default: "" },
        address: { type: String, default: "" },
        phone: { type: String, default: "" },
        email: { type: String, default: "" },
        website: { type: String, default: "" },
        organizationNumber: { type: String, default: "" },
        secondSignerEnabled: { type: Boolean, default: false },
        secondSignerName: { type: String, default: "" },
        secondSignerTitle: { type: String, default: "" },
        secondSignerDepartment: { type: String, default: "" },
        secondSignerContact: { type: String, default: "" },
        secondSignatureFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
        configVersion: { type: Number, default: 1 },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

export const CertificateSettings = mongoose.model(
    "CertificateSettings",
    certificateSettingsSchema,
    "certificatesettings"
);

// --- CertificateTemplate ----------------------------------------------------
// A single editable HTML body used to render a certificate (diploma or
// studicintyg). Rendered client-side for the print-quality preview.
const certificateTemplateSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            enum: ["diplom", "studieintyg"],
        },
        name: { type: String, required: true }, // "Diplom" / "Studieintyg"
        title: { type: String, default: "Diplom" },
        subtitle: { type: String, default: "" },
        bodyPrefix: { type: String, default: "" },
        footerText: { type: String, default: "" },
        html: { type: String, required: true },
        orientation: { type: String, enum: ["landscape", "portrait"], default: "landscape" },
        showGrade: { type: Boolean, default: true },
        showApl: { type: Boolean, default: true },
        showPackage: { type: Boolean, default: true },
        isActive: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

export const CertificateTemplate = mongoose.model(
    "CertificateTemplate",
    certificateTemplateSchema,
    "certificatetemplates"
);

// --- CertificateRecord ------------------------------------------------------
// A single certificate for a student + course (or course package), tracking
// its lifecycle from creation → approval → generated (with a stored PDF) and
// optionally revoke. All mutations append to `history` for a full audit trail.
const certificateRecordSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["diplom", "studieintyg"], required: true },
        status: {
            type: String,
            enum: ["draft", "approved", "generated", "revoked"],
            default: "draft",
        },
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
        enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentEnrollment", required: true },
        courseInstanceId: { type: mongoose.Schema.Types.ObjectId, ref: "CourseInstance" },
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
        coursePackageId: { type: mongoose.Schema.Types.ObjectId, ref: "CoursePackage", default: null },

        // Snapshot fields (denormalized so history stays stable across edits)
        studentName: { type: String },
        personalNumber: { type: String },
        courseName: { type: String },
        courseCode: { type: String },
        packageName: { type: String, default: "" },
        packageCode: { type: String, default: "" },
        grade: { type: String, default: "" },
        periodStart: { type: Date },
        periodEnd: { type: Date },
        completedAt: { type: Date },
        teacherName: { type: String, default: "" },

        certificateNumber: { type: String, default: "" },
        pdfFileId: { type: mongoose.Schema.Types.ObjectId, default: null },

        // Config versioning (P4): the identity values that were in effect when
        // this record was generated are snapshotted so the record is traceable
        // even after admin configuration changes.
        configVersion: { type: Number, default: 1 },
        configSnapshot: {
            type: new mongoose.Schema(
                {
                    signerName: { type: String, default: "" },
                    signerTitle: { type: String, default: "Rektor" },
                    signerDepartment: { type: String, default: "" },
                    signerContact: { type: String, default: "" },
                    schoolName: { type: String, default: "Mindful Learning" },
                    organizationName: { type: String, default: "" },
                    organizationNumber: { type: String, default: "" },
                    address: { type: String, default: "" },
                    phone: { type: String, default: "" },
                    email: { type: String, default: "" },
                    website: { type: String, default: "" },
                    secondSignerEnabled: { type: Boolean, default: false },
                    secondSignerName: { type: String, default: "" },
                    secondSignerTitle: { type: String, default: "" },
                    secondSignatureFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    logoFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
                    signatureFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
                },
                { _id: false }
            ),
            default: () => ({}),
        },

        deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        deliveredAt: { type: Date, default: null },
        emailStatus: {
            type: String,
            enum: ["not_applicable", "sent", "not_delivered", "no_email"],
            default: "not_applicable",
        },
        deliveryTransportMode: { type: String, default: "" },

        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        approvedAt: { type: Date, default: null },
        generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        generatedAt: { type: Date, default: null },
        revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        revokedAt: { type: Date, default: null },
        revokeReason: { type: String, default: "" },

        history: [
            {
                action: String, // created|edited|approved|generated|downloaded|revoked
                by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
                at: { type: Date, default: Date.now },
                note: String,
            },
        ],
    },
    {
        timestamps: true,
        indexes: [
            { studentId: 1, type: 1 },
            { status: 1, createdAt: -1 },
            { type: 1, status: 1 },
            { courseId: 1, status: 1 },
            { enrollmentId: 1 },
        ],
    }
);

export const CertificateRecord = mongoose.model(
    "CertificateRecord",
    certificateRecordSchema,
    "certificaterecords"
);