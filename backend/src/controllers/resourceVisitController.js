import Student from "../models/Student.js";
import {
    RESOURCE_TYPES,
    getResourceVisitReport,
    recordResourceVisit,
} from "../services/resourceVisitService.js";

export const STAFF_ROLES = [
    "systemadmin",
    "admin",
    "teacher",
    "coordinator",
    "syv",
    "specped",
];

const rolesOf = (user) => user?.roles || (user?.role ? [user.role] : []);

const findSelfStudent = (user) =>
    user?.email ? Student.findOne({ email: user.email }).select("_id").lean() : null;

/** Records a visit. Students may only record visits for themselves. */
export const recordVisit = async (req, res) => {
    const roles = rolesOf(req.user);
    const {
        studentId,
        resourceType,
        resourceId = "",
        resourceName = "",
        courseInstanceId = null,
    } = req.body || {};

    if (!RESOURCE_TYPES.includes(resourceType)) {
        return res.status(400).json({ error: "Invalid resourceType" });
    }

    let resolvedStudentId = studentId;
    if (roles.includes("student")) {
        const self = await findSelfStudent(req.user);
        if (!self) return res.status(404).json({ error: "Ingen elevprofil hittad." });
        if (studentId && String(studentId) !== String(self._id)) {
            return res.status(403).json({ error: "Access denied" });
        }
        resolvedStudentId = self._id;
    } else if (!STAFF_ROLES.some((role) => roles.includes(role))) {
        return res.status(403).json({ error: "Access denied" });
    }

    if (!resolvedStudentId) {
        return res.status(400).json({ error: "studentId is required" });
    }

    const visit = await recordResourceVisit({
        studentId: resolvedStudentId,
        resourceType,
        resourceId,
        resourceName,
        courseInstanceId,
    });
    if (!visit) return res.status(404).json({ error: "Student not found" });

    return res.status(201).json({ success: true, visit });
};

/** Staff report with tenant scoping, filters and pagination. */
export const getReport = async (req, res) => {
    const report = await getResourceVisitReport({ user: req.user, ...req.query });
    return res.json(report);
};

/** A student's own visits. */
export const getMine = async (req, res) => {
    const self = await findSelfStudent(req.user);
    if (!self) return res.status(404).json({ error: "Ingen elevprofil hittad." });

    const report = await getResourceVisitReport({
        user: { municipalities: [] },
        studentId: self._id,
        ...req.query,
    });
    return res.json(report);
};
