import mongoose from "mongoose";
import ResourceVisit from "../models/ResourceVisit.js";
import Student from "../models/Student.js";
import logger from "../utils/logger.js";
import { studentScopeFilter } from "../utils/tenantScope.js";

export const RESOURCE_TYPES = [
    "course_card",
    "lesson",
    "document",
    "support_resource",
];

const buildIdempotencyKey = (studentId, resourceType, resourceId, visitedAt) =>
    `${visitedAt.toISOString().slice(0, 10)}:${studentId}:${resourceType}:${resourceId}`;

/**
 * Records a visit once per student/resource/calendar day. Never throws: visit
 * logging must not break the page that triggered it.
 *
 * @returns {Promise<object|null>} the saved or already-recorded visit
 */
export const recordResourceVisit = async ({
    studentId,
    resourceType,
    resourceId = "",
    resourceName = "",
    courseInstanceId = null,
    visitedAt = new Date(),
}) => {
    if (!studentId || !RESOURCE_TYPES.includes(resourceType)) return null;
    if (!mongoose.isValidObjectId(studentId)) return null;

    try {
        const student = await Student.findById(studentId)
            .select("name municipality.type")
            .lean();
        if (!student) return null;

        const idempotencyKey = buildIdempotencyKey(
            studentId,
            resourceType,
            resourceId || resourceName || "all",
            visitedAt
        );

        return await ResourceVisit.findOneAndUpdate(
            { idempotencyKey },
            {
                $setOnInsert: {
                    idempotencyKey,
                    studentId,
                    studentName: student.name || "",
                    resourceType,
                    resourceId,
                    resourceName,
                    courseInstanceId,
                    visitedAt,
                    municipality: student.municipality?.type || "",
                },
            },
            { upsert: true, returnDocument: "after", runValidators: true }
        ).lean();
    } catch (error) {
        logger.warn({ err: error, studentId, resourceType }, "Failed to record resource visit (non-fatal)");
        return null;
    }
};

/**
 * Builds a filtered, paginated visit report scoped to the caller's municipalities.
 */
export const getResourceVisitReport = async ({
    user,
    studentId,
    resourceType,
    from,
    to,
    page = 1,
    limit = 20,
} = {}) => {
    const studentQuery = studentScopeFilter(user);
    if (studentId && mongoose.isValidObjectId(studentId)) {
        studentQuery._id = studentId;
    }

    const students = await Student.find(studentQuery)
        .select("name municipality.type")
        .lean();
    const studentIds = students.map((student) => student._id);
    const namesById = new Map(
        students.map((student) => [String(student._id), student.name || ""])
    );

    const query = { studentId: { $in: studentIds } };
    if (RESOURCE_TYPES.includes(resourceType)) query.resourceType = resourceType;
    if (from || to) {
        query.visitedAt = {};
        if (from && !Number.isNaN(new Date(from).getTime())) {
            query.visitedAt.$gte = new Date(from);
        }
        if (to && !Number.isNaN(new Date(to).getTime())) {
            const end = new Date(to);
            if (!String(to).includes("T")) end.setUTCHours(23, 59, 59, 999);
            query.visitedAt.$lte = end;
        }
    }

    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const perPage = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

    const [visits, total, uniqueStudents, byResource] = await Promise.all([
        ResourceVisit.find(query)
            .sort({ visitedAt: -1 })
            .skip((currentPage - 1) * perPage)
            .limit(perPage)
            .lean(),
        ResourceVisit.countDocuments(query),
        ResourceVisit.distinct("studentId", query),
        ResourceVisit.aggregate([
            { $match: query },
            {
                $group: {
                    _id: { $ifNull: ["$resourceName", "$resourceType"] },
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
        ]),
    ]);

    return {
        generatedAt: new Date(),
        total,
        page: currentPage,
        limit: perPage,
        summary: {
            totalVisits: total,
            uniqueStudents: uniqueStudents.length,
            byResource: Object.fromEntries(
                byResource.map((row) => [row._id || "Okänd", row.count])
            ),
        },
        visits: visits.map((visit) => ({
            ...visit,
            studentName: namesById.get(String(visit.studentId)) || visit.studentName || "",
        })),
    };
};
