import express from "express";
import { authenticateUser } from "../controllers/authController.js";
import { hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import CompletionEvent from "../models/CompletionEvent.js";

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

/**
 * GET /completions/overview — admin dashboard completion history.
 *
 * Reads the durable CompletionEvent records (course + course_package) newest
 * first, with server-side pagination. Population mirrors the dashboard panel:
 * student name, completed course/package, completion date, responsible teacher
 * and the tenant (municipality). Records are written once per completion by the
 * idempotent completion scan, so this endpoint is naturally deduped.
 */
router.get(
    "/completions/overview",
    authenticateUser,
    hasRole(ADMIN_ROLES),
    asyncHandler(async (req, res) => {
        const DEFAULT_LIMIT = 25;
        const rawLimit = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(rawLimit, 100)
            : DEFAULT_LIMIT;
        const rawPage = parseInt(req.query.page, 10);
        const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.completionType && ["course", "course_package"].includes(req.query.completionType)) {
            filter.completionType = req.query.completionType;
        }
        if (req.query.municipality) {
            filter.municipality = req.query.municipality;
        }
        if (req.query.search) {
            const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ studentName: rx }, { courseName: rx }, { packageName: rx }];
        }

        const total = await CompletionEvent.countDocuments(filter);
        const events = await CompletionEvent.find(filter)
            .sort({ completionDate: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .populate("studentId", "name personalNumber")
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "name username email" },
            })
            .lean();

        const rows = events.map((e) => ({
            _id: e._id,
            idempotencyKey: e.idempotencyKey,
            studentId: e.studentId?._id || e.studentId || null,
            studentName:
                e.studentName ||
                e.studentId?.name ||
                "Okänd elev",
            personalNumber: e.studentId?.personalNumber || "",
            completionType: e.completionType,
            courseInstanceId: e.courseInstanceId || null,
            courseId: e.courseId || null,
            courseName: e.courseName || "",
            coursePackageId: e.coursePackageId || null,
            packageName: e.packageName || "",
            completionDate: e.completionDate || null,
            teacherId: e.teacherId || null,
            teacherName:
                e.teacherName ||
                e.teacherId?.userId?.name ||
                e.teacherId?.userId?.username ||
                "",
            municipality: e.municipality || "",
            enrollmentIds: e.enrollmentIds || [],
            notifiedAt: {
                admin: e.meta?.adminNotifiedAt || null,
                teacher: e.meta?.teacherNotifiedAt || null,
                student: e.meta?.studentNotifiedAt || null,
            },
        }));

        res.json({
            events: rows,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    })
);

/**
 * GET /completions/stats — lightweight dashboard counters: how many completions
 * happened in the last 30 days, split by type.
 */
router.get(
    "/completions/stats",
    authenticateUser,
    hasRole(STAFF_ROLES),
    asyncHandler(async (req, res) => {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [course, coursePackage, recent] = await Promise.all([
            CompletionEvent.countDocuments({ completionType: "course", completionDate: { $gte: since } }),
            CompletionEvent.countDocuments({ completionType: "course_package", completionDate: { $gte: since } }),
            CompletionEvent.countDocuments({ completionDate: { $gte: since } }),
        ]);
        res.json({
            completedCourses30d: course,
            completedPackages30d: coursePackage,
            totalCompletions30d: recent,
            // Everything recorded so far (cumulative).
            lifetimeTotal: await CompletionEvent.countDocuments({}),
        });
    })
);

export default router;