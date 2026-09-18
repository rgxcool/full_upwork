import { Router } from "express";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errorHandler.js";
import {
    listAplRecords,
    getAplRecord,
    patchAplStatus,
    putAplRecord,
    postAutoCreate,
    postAutoTransition,
    getEligibleStudents,
    getStatistics,
    patchOwnAplRecord,
} from "../controllers/aplController.js";

const router = Router();
const APL_ROLES = ["admin", "systemadmin", "teacher", "coordinator"];

// Resolve the caller's own Student profile by email (student self-access).
const findSelfStudent = async (req) => {
    const roles = req.user?.roles || (req.user?.role ? [req.user.role] : []);
    if (!roles.includes("student")) return null;
    const Student = (await import("../models/Student.js")).default;
    return Student.findOne({ email: req.user.email }).lean();
};

router.get("/apl/records", isAuthenticated, hasRole(APL_ROLES), asyncHandler(listAplRecords));
router.get(
    "/apl/records/:studentId",
    isAuthenticated,
    // A student may read their own record (email linkage); everyone else goes
    // through the usual staff role check.
    async (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        const self = await findSelfStudent(req);
        if (self && String(self._id) === String(req.params.studentId)) {
            return next();
        }
        return hasRole(APL_ROLES)(req, res, next);
    },
    asyncHandler(getAplRecord)
);
router.patch("/apl/records/:studentId/status", isAuthenticated, hasRole(APL_ROLES), asyncHandler(patchAplStatus));
router.put("/apl/records/:studentId", isAuthenticated, hasRole(APL_ROLES), asyncHandler(putAplRecord));
router.post("/apl/auto-create", isAuthenticated, hasRole(["admin", "systemadmin"]), asyncHandler(postAutoCreate));
router.post("/apl/auto-transition", isAuthenticated, hasRole(["admin", "systemadmin"]), asyncHandler(postAutoTransition));
router.get("/apl/eligible", isAuthenticated, hasRole(APL_ROLES), asyncHandler(getEligibleStudents));
router.get("/apl/statistics", isAuthenticated, hasRole(APL_ROLES), asyncHandler(getStatistics));

// Student can view their own APL record
router.get("/apl/my", isAuthenticated, async (req, res) => {
    try {
        const Student = (await import("../models/Student.js")).default;
        const student = await Student.findOne({ email: req.user.email }).lean();
        if (!student) return res.status(404).json({ error: "Ingen elevprofil hittad." });
        const AplRecord = (await import("../models/AplRecord.js")).default;
        const record = await AplRecord.findOne({ studentId: student._id }).lean();
        // Use the actual schema fields (status, placement, dates, doc ids) and
        // the student-level aplStatus that drives the staff board. Previously
        // this read non-existent fields (color/period/workplace/supervisor/
        // logbook/cvUrl) and returned dummy data.
        res.json({
            status: record?.status || student.aplStatus || "GRAY",
            aplStatus: student.aplStatus || null,
            isSeeking: Boolean(record?.isSeeking),
            placementCompany: record?.placementCompany || null,
            placementContact: record?.placementContact || null,
            placementAddress: record?.placementAddress || null,
            internshipStartDate: record?.internshipStartDate || null,
            internshipEndDate: record?.internshipEndDate || null,
            requirements: record?.requirements || null,
            hasCv: Boolean(record?.cvDocId),
            hasContract: Boolean(record?.contractDocId),
            hasLogbook: Boolean(student.logbook && student.logbook.length > 0),
        });
    } catch (err) {
        res.status(500).json({ error: "Kunde inte hämta APL-status." });
    }
});

// Student can self-declare seeking status / attach their own CV
router.patch("/apl/my", isAuthenticated, asyncHandler(patchOwnAplRecord));

export default router;
