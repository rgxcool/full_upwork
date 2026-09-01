import mongoose from "mongoose";
import puppeteer from "puppeteer";
import { GridFSBucket } from "mongodb";
import { Readable } from "stream";
import { CertificateSettings, CertificateTemplate } from "../models/certificateModel.js";

/**
 * Renders a certificate template (HTML) to a PDF buffer using Puppeteer.
 * The template is rendered server-side with string substitution so the stored
 * PDF is self-contained and offline-safe (images are inlined as data URLs).
 */

// Minimal Mustache-free substitution for {{placeholder}} and
// {{#flag}}...{{/flag}} / {{^flag}}...{{/flag}} sections. Shared client-side
// too, but kept here so the server storage path is self-contained.
function renderTemplate(template, data = {}, sections = {}) {
    let html = template || "";

    html = html.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
        const value = data[key];
        const truthy = value === true || value === "true" || (typeof value === "string" && value.length > 0);
        if (sections[key] !== undefined) return sections[key] ? body : "";
        return truthy ? body : "";
    });

    html = html.replace(/\{\{\^([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, body) => {
        const value = data[key];
        const truthy = value === true || value === "true" || (typeof value === "string" && value.length > 0);
        return truthy ? "" : body;
    });

    html = html.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
        const value = data[key];
        if (value === undefined || value === null) return "";
        return String(value);
    });

    html = html.replace(/\s*v-if="[^"]*"/g, "");
    return html;
}

async function fetchFileAsDataUrl(fileId, accept = null) {
    if (!fileId) return null;
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
    const file = await mongoose.connection.db
        .collection("fs.files")
        .findOne({ _id: new mongoose.Types.ObjectId(fileId) });
    if (!file) return null;
    const contentType = file.contentType || "application/octet-stream";
    if (accept && !accept.includes(contentType)) return null;

    const chunks = [];
    const stream = bucket.openDownloadStream(file._id);
    await new Promise((resolve, reject) => {
        stream.on("data", (c) => chunks.push(c));
        stream.on("end", resolve);
        stream.on("error", reject);
    });
    const base64 = Buffer.concat(chunks).toString("base64");
    return `data:${contentType};base64,${base64}`;
}

const fmtDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
};

/**
 * Build the fully-rendered, self-contained HTML document for a certificate
 * record snapshot, pulling the current signature/logo images and template.
 */
export async function buildCertificateHtml({
    type,
    snapshot, // fields: studentName, personalNumber, courseName, courseCode, packageName, grade, periodStart, periodEnd, completedAt, teacherName, certificateNumber
    schoolName,
    signerName,
    signerTitle,
    issuedDate,
}) {
    const templateDoc = await CertificateTemplate.findOne({ key: type }).lean();
    const template = templateDoc || {};
    const settings = await CertificateSettings.findOne({}).lean();

    const [logoDataUrl, signatureDataUrl] = await Promise.all([
        fetchFileAsDataUrl(settings?.logoFileId, ["image/png", "image/jpeg", "image/webp"]),
        fetchFileAsDataUrl(settings?.signatureFileId, ["image/png"]),
    ]);

    const data = {
        title: template.title || (type === "diplom" ? "Diplom" : "Studieintyg"),
        subtitle: template.subtitle || "",
        bodyPrefix: template.bodyPrefix || "",
        footerText: template.footerText || "",
        studentName: snapshot.studentName || "",
        personalNumber: snapshot.personalNumber || "",
        courseName: snapshot.courseName || "",
        courseCode: snapshot.courseCode || "",
        packageName: snapshot.packageName || "",
        periodStart: fmtDate(snapshot.periodStart),
        periodEnd: fmtDate(snapshot.periodEnd),
        completedAt: fmtDate(snapshot.completedAt),
        teacherName: snapshot.teacherName || "",
        grade: template.showGrade !== false ? snapshot.grade || "" : "",
        schoolName: schoolName || settings?.schoolName || "Mindful Learning",
        certificateNumber: snapshot.certificateNumber || "",
        issuedDate: fmtDate(issuedDate) || new Date().toISOString().slice(0, 10),
        signerName: signerName || settings?.signerName || "",
        signerTitle: signerTitle || settings?.signerTitle || "Rektor",
        logoUrl: logoDataUrl || "",
        signatureUrl: signatureDataUrl || "",
    };

    return renderTemplate(template.html || "<h1>{{title}}</h1>", data, {
        showGrade: template.showGrade !== false && !!snapshot.grade,
        showApl: template.showApl === true,
        showPackage: template.showPackage === true && !!snapshot.packageName,
    });
}

/**
 * Render the built HTML document to a PDF buffer.
 * orientation: "landscape" | "portrait" (defaults to template, fallback by type).
 */
export async function htmlToPdfBuffer(html, { orientation } = {}) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        await page.emulateMediaType("screen");
        return await page.pdf({
            printBackground: true,
            format: "A4",
            landscape: orientation === "landscape",
            preferCSSPageSize: true,
        });
    } finally {
        await browser.close();
    }
}

/**
 * Store a PDF buffer in GridFS and return its file id.
 */
export async function storePdfBuffer(buffer, { filename, recordId, contentType = "application/pdf" }) {
    const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "fs" });
    const stream = Readable.from(buffer);
    const upload = bucket.openUploadStream(filename, {
        contentType,
        metadata: {
            purpose: "certificate-pdf",
            recordId: recordId ? String(recordId) : null,
            uploadedAt: new Date().toISOString(),
        },
    });
    await new Promise((resolve, reject) => {
        stream.pipe(upload).on("error", reject).on("finish", resolve);
    });
    return upload.id;
}

/**
 * Convenience: generate and store a certificate PDF for a record snapshot,
 * returning the stored GridFS file id.
 */
export async function generateAndStoreCertificate({
    type,
    snapshot,
    orientation,
    filename,
    recordId,
    ...meta
}) {
    const html = await buildCertificateHtml({ type, snapshot, ...meta });
    const pdf = await htmlToPdfBuffer(html, { orientation });
    return storePdfBuffer(pdf, { filename, recordId });
}

export { renderTemplate };
