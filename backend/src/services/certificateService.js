import mongoose from "mongoose";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CoursePackage from "../models/CoursePackage.js";
import { CertificateRecord } from "../models/certificateModel.js";

/**
 * Resolve the set of roles for a user, honoring the `roles[]` array while
 * falling back to the legacy singular `role` (multi-role support).
 */
export function getUserRoles(user) {
    return user?.roles || (user?.role ? [user.role] : []);
}

/**
 * Load a populated snapshot from an enrollment for creating/generating a
 * certificate. Returns a plain object of denormalized snapshot fields.
 */
export async function buildSnapshotData(enrollmentId) {
    const enrollment = await StudentEnrollment.findById(enrollmentId)
        .populate("mainCourseId", "courseName courseCode")
        .populate("coursePackageId", "coursePackageName coursePackageCode")
        .populate({
            path: "teacherId",
            populate: { path: "userId", select: "username name" },
        })
        .populate("studentId", "name personalNumber")
        .lean();

    if (!enrollment) return null;

    const studentName =
        enrollment.studentId?.name || enrollment.studentName || "";
    const userId = enrollment.teacherId?.userId;
    const teacherName =
        userId?.name || userId?.username || "";

    return {
        studentId: enrollment.studentId?._id,
        enrollmentId: enrollment._id,
        courseInstanceId: enrollment.courseInstanceId || null,
        courseId: enrollment.mainCourseId?._id || null,
        coursePackageId: enrollment.coursePackageId?._id || null,
        studentName,
        personalNumber: enrollment.studentId?.personalNumber || "",
        courseName: enrollment.mainCourseId?.courseName || "",
        courseCode: enrollment.mainCourseId?.courseCode || "",
        packageName: enrollment.coursePackageId?.coursePackageName || "",
        packageCode: enrollment.coursePackageId?.coursePackageCode || "",
        grade: enrollment.grade || "",
        periodStart: enrollment.startDate || null,
        periodEnd: enrollment.endDate || null,
        completedAt: enrollment.completedAt || null,
        teacherName,
        certificateNumber: enrollment.completionCertificate || "",
    };
}

/**
 * Diagnostic eligibility check for a single enrollment + requested type.
 * Returns { eligible, reason } where reason is a Swedish human-readable message
 * when not eligible (or null when eligible).
 */
export async function getEligibility(enrollment, type) {
    if (enrollment.status !== "completed") {
        return { eligible: false, reason: "Utbildningen är inte slutförd." };
    }

    if (type === "diplom") {
        if (!enrollment.coursePackageId) {
            return { eligible: false, reason: "Diplom kräver att eleven är kopplad till ett kurspaket." };
        }

        const coursePackage = await CoursePackage.findById(enrollment.coursePackageId).lean();
        if (!coursePackage) {
            return { eligible: false, reason: "Kurspaketet hittades inte." };
        }

        const mainCourseId = enrollment.mainCourseId?._id?.toString();
        if (mainCourseId) {
            const courseInPackage = (coursePackage.coursePackageCourses || []).some(
                (c) => c.toString() === mainCourseId
            );
            if (!courseInPackage) {
                return { eligible: false, reason: "Kursen ingår inte i detta kurspaket." };
            }
        }

        // All of this student's enrollments in the package must be completed.
        const packageEnrollments = await StudentEnrollment.find({
            coursePackageId: coursePackage._id,
            studentId: enrollment.studentId,
        })
            .select("_id status")
            .lean();

        const allCompleted =
            packageEnrollments.length > 0 &&
            packageEnrollments.every((e) => e.status === "completed");

        if (!allCompleted) {
            return { eligible: false, reason: "Inte alla kurser i kurspaketet är godkända ännu." };
        }

        // APL must be GREEN.
        const Student = mongoose.model("Student");
        const studentDoc = await Student.findById(enrollment.studentId).select("aplStatus").lean();
        if (!studentDoc || studentDoc.aplStatus !== "GREEN") {
            return { eligible: false, reason: "APL måste vara godkänd (status: GREEN) för att diplom ska kunna utfärdas." };
        }

        // End date must have passed.
        if (enrollment.endDate && new Date(enrollment.endDate) > new Date()) {
            return { eligible: false, reason: "Diplom kan utfärdas först efter kursens slutdatum." };
        }
    }

    return { eligible: true, reason: null };
}

/**
 * Fetch the paged list of candidate enrollments eligible for a certificate
 * type, along with the count. Joins against existing CertificateRecords so the
 * frontend can surface "already created / generated" state per row.
 *
 * Scalability (1500+ users): this uses server-side pagination, a single
 * aggregation pipeline for the candidate query, and a single lookup of existing
 * records — no N+1 queries.
 */
export async function getCertificateCandidates({
    type = "studieintyg",
    courseId,
    courseInstanceId,
    status,
    search,
    page = 1,
    limit = 20,
}) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    // Base: completed enrollments. For diplomas the package check is done in
    // JS because it requires per-package aggregation; for performance we filter
    // by completed status + optional course/instance filters here, then evaluate
    // eligibility for the page of results only (candidates are usually a small
    // fraction of 1500+ users).
    const match = { status: "completed" };
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
        match.mainCourseId = new mongoose.Types.ObjectId(courseId);
    }
    if (courseInstanceId && mongoose.Types.ObjectId.isValid(courseInstanceId)) {
        match.courseInstanceId = new mongoose.Types.ObjectId(courseInstanceId);
    }

    const facet = await StudentEnrollment.aggregate([
        { $match: match },
        {
            $lookup: {
                from: "students",
                localField: "studentId",
                foreignField: "_id",
                as: "student",
            },
        },
        {
            $lookup: {
                from: "courses",
                localField: "mainCourseId",
                foreignField: "_id",
                as: "course",
            },
        },
        {
            $lookup: {
                from: "coursepackages",
                localField: "coursePackageId",
                foreignField: "_id",
                as: "pkg",
            },
        },
        { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$pkg", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 1,
                studentId: "$student._id",
                studentName: "$student.name",
                personalNumber: "$student.personalNumber",
                courseInstanceId: 1,
                courseId: "$course._id",
                courseName: "$course.courseName",
                courseCode: "$course.courseCode",
                coursePackageId: "$pkg._id",
                packageName: "$pkg.coursePackageName",
                packageCode: "$pkg.coursePackageCode",
                startDate: 1,
                endDate: 1,
                completedAt: 1,
                grade: 1,
                completionCertificate: 1,
            },
        },
        {
            $facet: {
                total: [{ $count: "n" }],
                data: [{ $skip: skip }, { $limit: l }],
            },
        },
    ]);

    const totalForType = facet?.[0]?.total?.[0]?.n || 0;

    // Build a map of existing records for these enrollments in one query.
    const pageIds = (facet?.[0]?.data || []).map((r) => r._id);
    const existing = await CertificateRecord.find({
        enrollmentId: { $in: pageIds },
        type,
    })
        .select("_id enrollmentId status certificateNumber pdfFileId")
        .lean();
    const existingByEnrollment = new Map();
    for (const rec of existing) {
        existingByEnrollment.set(rec.enrollmentId.toString(), rec);
    }

    // Walk this page and compute eligibility (only for the visible page).
    const candidateRows = [];
    for (const row of facet?.[0]?.data || []) {
        if (search) {
            const q = search.toString().toLowerCase();
            const hay = `${row.studentName || ""} ${row.courseName || ""} ${row.personalNumber || ""}`.toLowerCase();
            if (!hay.includes(q)) continue;
        }

        const enrollment = {
            ...row,
            mainCourseId: row.courseId,
            coursePackageId: row.coursePackageId,
            status: "completed",
        };
        const { eligible, reason } = await getEligibility(enrollment, type);

        if (status === "eligible" && !eligible) continue;
        if (status === "ineligible" && eligible) continue;

        const rec = existingByEnrollment.get(row._id.toString());
        candidateRows.push({
            enrollmentId: row._id,
            studentId: row.studentId,
            studentName: row.studentName || "",
            personalNumber: row.personalNumber || "",
            courseInstanceId: row.courseInstanceId,
            courseId: row.courseId,
            courseName: row.courseName || "",
            courseCode: row.courseCode || "",
            coursePackageId: row.coursePackageId,
            packageName: row.packageName || "",
            startDate: row.startDate,
            endDate: row.endDate,
            completedAt: row.completedAt,
            grade: row.grade || "",
            eligible,
            ineligibleReason: reason,
            record: rec
                ? { _id: rec._id, status: rec.status, certificateNumber: rec.certificateNumber }
                : null,
            certificateNumber: rec?.certificateNumber || row.completionCertificate || "",
        });
    }

    const offsetWithinPage = skip;
    return {
        candidates: candidateRows,
        total: candidateRows.length,
        rawTotal: totalForType,
        page: p,
        limit: l,
        totalPages: Math.max(1, Math.ceil(Math.max(totalForType, 1) / l)),
        offset: offsetWithinPage,
    };
}

/**
 * Generate a unique certificate number, e.g. ML-2026-00042. Uses the global
 * counter collection so numbers stay sequential and unique at scale.
 */
export async function nextCertificateNumber(prefix = "ML") {
    const Counters = mongoose.models.Counters || mongoose.model(
        "Counters",
        new mongoose.Schema({
            _id: { type: String, required: true },
            seq: { type: Number, default: 0 },
        }),
        "counters"
    );
    const year = new Date().getFullYear();
    const counter = await Counters.findByIdAndUpdate(
        `certificate-${year}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    const seq = String(counter.seq).padStart(5, "0");
    return `${prefix}-${year}-${seq}`;
}

/**
 * Compute which grade/APL/package pills should appear, reflecting whether the
 * noted template toggles are on for the given type.
 */
export function applyTemplateFlags(template, data) {
    return {
        ...data,
        grade: template.showGrade ? data.grade : "",
        showApl: template.showApl,
        showPackage: template.showPackage,
    };
}
