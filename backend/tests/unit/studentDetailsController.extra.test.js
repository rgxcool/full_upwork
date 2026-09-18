import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Program from "../../src/models/Program.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Deviation from "../../src/models/Deviation.js";
import Notification from "../../src/models/Notification.js";
import {
    setStudentDropout,
    removeStudentDropout,
    reactivateStudentWithCourses,
    getSupportInfo,
    updateSupportInfo,
    getDeviations,
    createDeviation,
    updateDeviation,
    getRevisionReasons,
    reviseStudyPlan,
    getStudyplanRevisionHistory,
} from "../../src/controllers/studentDetailsController.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock("../../src/services/dropoutService.js", () => {
    const performStudentDropout = vi.fn();
    const removeStudentDropoutRecord = vi.fn();
    const reactivateStudent = vi.fn();
    return {
        performStudentDropout,
        removeStudentDropoutRecord,
        reactivateStudent,
        default: { performStudentDropout, removeStudentDropoutRecord, reactivateStudent },
    };
});

vi.mock("../../src/services/revisionService.js", () => {
    const performStudyplanRevision = vi.fn();
    const getRevisionHistory = vi.fn();
    return {
        performStudyplanRevision,
        getRevisionHistory,
        REVISION_REASONS: [
            "pace_change",
            "course_added",
            "course_removed",
            "date_adjustment",
            "package_swap",
            "other",
        ],
        default: { performStudyplanRevision, getRevisionHistory },
    };
});

vi.mock("../../src/utils/courseMatchingService.js", () => ({
    default: {
        findOrCreateCourseInstance: vi.fn(),
    },
}));

import dropoutService from "../../src/services/dropoutService.js";
import revisionService from "../../src/services/revisionService.js";
import courseMatchingService from "../../src/utils/courseMatchingService.js";

const buildRes = () => {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
};

const buildReq = ({ params = {}, body = {}, user = {}, query = {} } = {}) => ({
    params,
    body,
    user,
    query,
});

const createStudent = async (overrides = {}) => {
    const id = new mongoose.Types.ObjectId().toString();
    return Student.create({
        name: overrides.name || "Student",
        personalNumber: overrides.personalNumber || "19900101-1234",
        email: overrides.email || `student_${id}@example.com`,
        dropout: overrides.dropout,
        tempoWeeks: overrides.tempoWeeks,
        teacherId: overrides.teacherId,
        municipality: overrides.municipality,
        supportInfo: overrides.supportInfo,
        changeHistory: overrides.changeHistory,
    });
};

const ADMIN = {
    role: "admin",
    userId: new mongoose.Types.ObjectId().toString(),
    name: "Admin User",
};

describe("studentDetailsController — remaining handlers", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            Program.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            CourseInstance.deleteMany({}),
            Deviation.deleteMany({}),
            Notification.deleteMany({}),
        ]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("setStudentDropout", () => {
        it("returns 403 for non-admin roles", async () => {
            const res = buildRes();
            await setStudentDropout(
                buildReq({ params: { id: "abc" }, user: { role: "teacher", userId: "1" } }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns 404 when the service reports a missing student", async () => {
            dropoutService.performStudentDropout.mockRejectedValue({ statusCode: 404 });
            const res = buildRes();
            await setStudentDropout(buildReq({ params: { id: "abc" }, user: ADMIN }), res);
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toBe("Student not found");
        });

        it("returns 500 on unexpected service failure", async () => {
            dropoutService.performStudentDropout.mockRejectedValue(new Error("boom"));
            const res = buildRes();
            await setStudentDropout(buildReq({ params: { id: "abc" }, user: ADMIN }), res);
            expect(res.statusCode).toBe(500);
        });
    });

    describe("removeStudentDropout", () => {
        it("returns 403 for non-admin roles", async () => {
            const res = buildRes();
            await removeStudentDropout(
                buildReq({ params: { id: "abc" }, user: { role: "teacher", userId: "1" } }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns 404 when the service reports a missing student", async () => {
            dropoutService.removeStudentDropoutRecord.mockRejectedValue({ statusCode: 404 });
            const res = buildRes();
            await removeStudentDropout(buildReq({ params: { id: "abc" }, user: ADMIN }), res);
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toBe("Student not found");
        });

        it("returns 500 on unexpected service failure", async () => {
            dropoutService.removeStudentDropoutRecord.mockRejectedValue(new Error("boom"));
            const res = buildRes();
            await removeStudentDropout(buildReq({ params: { id: "abc" }, user: ADMIN }), res);
            expect(res.statusCode).toBe(500);
        });

        it("returns success when the student was a dropout", async () => {
            dropoutService.removeStudentDropoutRecord.mockResolvedValue({
                success: true,
                wasDropout: true,
                student: { _id: "s1" },
                resolvedNotifications: 2,
                reSyncedEnrollments: 3,
            });
            const res = buildRes();
            await removeStudentDropout(buildReq({ params: { id: "abc" }, user: ADMIN }), res);
            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe("Dropout status removed successfully");
            expect(res.body.reSyncedEnrollments).toBe(3);
        });

        it("returns success with the not-dropout message", async () => {
            dropoutService.removeStudentDropoutRecord.mockResolvedValue({
                success: true,
                wasDropout: false,
                student: { _id: "s1" },
                resolvedNotifications: 0,
                reSyncedEnrollments: 0,
            });
            const res = buildRes();
            await removeStudentDropout(buildReq({ params: { id: "abc" }, user: ADMIN }), res);
            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe("Student is not marked as dropout");
        });
    });

    describe("reactivateStudentWithCourses", () => {
        it("returns 403 for non-admin roles", async () => {
            const res = buildRes();
            await reactivateStudentWithCourses(
                buildReq({ params: { id: "abc" }, user: { role: "teacher", userId: "1" } }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns 404 when the student does not exist", async () => {
            const res = buildRes();
            await reactivateStudentWithCourses(
                buildReq({ params: { id: new mongoose.Types.ObjectId().toString() }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(404);
        });

        it("returns 400 when the student is not currently inactive", async () => {
            const student = await createStudent({ dropout: false });
            const res = buildRes();
            await reactivateStudentWithCourses(
                buildReq({ params: { id: student._id.toString() }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toBe("Student is not currently inactive");
        });

        it("reactivates a dropout student without re-enrollment", async () => {
            const student = await createStudent({ dropout: true });
            dropoutService.reactivateStudent.mockImplementation(({ studentDoc }) => {
                studentDoc.dropout = false;
                return Promise.resolve(studentDoc);
            });
            const res = buildRes();
            await reactivateStudentWithCourses(
                buildReq({ params: { id: student._id.toString() }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.student.dropout).toBe(false);
            expect(res.body.newEnrollments).toEqual([]);
            const updated = await Student.findById(student._id);
            expect(updated.dropout).toBe(false);
            expect(updated.changeHistory.some((h) => h.changes.includes("reactivation"))).toBe(true);
        });

        it("reactivates, resolves dropout notifications, and re-enrolls in courses", async () => {
            const student = await createStudent({ dropout: true });
            await Notification.create({
                type: "dropout",
                message: "Avbrott",
                studentId: student._id,
                meta: { studentId: student._id.toString() },
                resolved: false,
            });
            dropoutService.reactivateStudent.mockImplementation(({ studentDoc }) => {
                studentDoc.dropout = false;
                return Promise.resolve(studentDoc);
            });
            const instanceId = new mongoose.Types.ObjectId();
            courseMatchingService.findOrCreateCourseInstance.mockResolvedValue({
                instance: { _id: instanceId },
            });
            const courseId = new mongoose.Types.ObjectId().toString();
            const res = buildRes();
            await reactivateStudentWithCourses(
                buildReq({
                    params: { id: student._id.toString() },
                    body: { reEnrollCourseIds: [courseId] },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.newEnrollments).toHaveLength(1);
            expect(res.body.newEnrollments[0].courseInstanceId.toString()).toBe(instanceId.toString());
            expect(courseMatchingService.findOrCreateCourseInstance).toHaveBeenCalled();
            const unresolved = await Notification.countDocuments({
                type: "dropout",
                "meta.studentId": student._id.toString(),
                resolved: false,
            });
            expect(unresolved).toBe(0);
        });

        it("starts re-enrollment from today when the last previous enrollment is past", async () => {
            const student = await createStudent({ dropout: true, tempoWeeks: 10 });
            const pastEnd = new Date("2020-01-01");
            await StudentEnrollment.create({
                studentId: student._id,
                courseInstanceId: new mongoose.Types.ObjectId(),
                mainCourseId: new mongoose.Types.ObjectId(),
                coursePackageId: new mongoose.Types.ObjectId(),
                startDate: new Date("2019-01-01"),
                endDate: pastEnd,
                status: "completed",
            });
            dropoutService.reactivateStudent.mockImplementation(({ studentDoc }) => {
                studentDoc.dropout = false;
                return Promise.resolve(studentDoc);
            });
            courseMatchingService.findOrCreateCourseInstance.mockResolvedValue({
                instance: { _id: new mongoose.Types.ObjectId() },
            });
            const res = buildRes();
            await reactivateStudentWithCourses(
                buildReq({
                    params: { id: student._id.toString() },
                    body: { reEnrollCourseIds: [new mongoose.Types.ObjectId().toString()] },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            const startDate = courseMatchingService.findOrCreateCourseInstance.mock.calls[0][1];
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            expect(startDate.getTime()).toBeGreaterThanOrEqual(today.getTime());
        });

        it("returns 500 on unexpected failure", async () => {
            const student = await createStudent({ dropout: true });
            dropoutService.reactivateStudent.mockRejectedValue(new Error("boom"));
            const res = buildRes();
            await reactivateStudentWithCourses(
                buildReq({ params: { id: student._id.toString() }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(500);
        });
    });

    describe("getSupportInfo", () => {
        it("returns 404 when the student does not exist", async () => {
            const res = buildRes();
            await getSupportInfo(
                buildReq({
                    params: { id: new mongoose.Types.ObjectId().toString() },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(404);
        });

        it("returns 403 when the user has a restricted municipality scope", async () => {
            const student = await createStudent({ municipality: { type: "Sollentuna" } });
            const res = buildRes();
            await getSupportInfo(
                buildReq({
                    params: { id: student._id.toString() },
                    user: { ...ADMIN, municipalities: ["Sollentuna"] },
                }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns support info for a global admin", async () => {
            const supportInfo = [
                { contactName: "Anna", contactPhone: "070-123", supportType: "Studiecoach" },
            ];
            const student = await createStudent({
                municipality: { type: "Sollentuna" },
                supportInfo,
            });
            const res = buildRes();
            await getSupportInfo(
                buildReq({
                    params: { id: student._id.toString() },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.supportInfo).toHaveLength(1);
            expect(res.body.studentName).toBe(student.name);
        });

        it("returns an empty array when no supportInfo is stored", async () => {
            const student = await createStudent({});
            const res = buildRes();
            await getSupportInfo(buildReq({ params: { id: student._id.toString() }, user: ADMIN }), res);
            expect(res.statusCode).toBe(200);
            expect(res.body.supportInfo).toEqual([]);
        });
    });

    describe("updateSupportInfo", () => {
        it("returns 403 for non-admin roles", async () => {
            const res = buildRes();
            await updateSupportInfo(
                buildReq({
                    params: { id: "abc" },
                    body: { supportInfo: [] },
                    user: { role: "teacher", userId: "1" },
                }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns 400 when supportInfo is not an array", async () => {
            const res = buildRes();
            await updateSupportInfo(
                buildReq({ params: { id: "abc" }, body: { supportInfo: "nope" }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(400);
        });

        it("returns 404 when the student does not exist", async () => {
            const res = buildRes();
            await updateSupportInfo(
                buildReq({
                    params: { id: new mongoose.Types.ObjectId().toString() },
                    body: { supportInfo: [] },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(404);
        });

        it("persists mapped contact fields", async () => {
            const student = await createStudent({});
            const res = buildRes();
            await updateSupportInfo(
                buildReq({
                    params: { id: student._id.toString() },
                    body: {
                        supportInfo: [
                            {
                                contactName: "Anna",
                                contactRole: "Coach",
                                contactPhone: "070-123",
                                contactEmail: "anna@example.com",
                                supportType: "Studiecoach",
                                notes: "Bra kontakt",
                            },
                        ],
                    },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.supportInfo[0].contactName).toBe("Anna");
            expect(res.body.supportInfo[0].addedBy.toString()).toBe(ADMIN.userId);
            const saved = await Student.findById(student._id);
            expect(saved.supportInfo[0].supportType).toBe("Studiecoach");
        });
    });

    describe("getDeviations", () => {
        it("returns 404 when the student does not exist", async () => {
            const res = buildRes();
            await getDeviations(
                buildReq({ params: { id: new mongoose.Types.ObjectId().toString() }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(404);
        });

        it("returns 403 when the student is outside the user's municipality scope", async () => {
            const student = await createStudent({ municipality: { type: "Sollentuna" } });
            const res = buildRes();
            await getDeviations(
                buildReq({
                    params: { id: student._id.toString() },
                    user: { ...ADMIN, municipalities: ["Falköping"] },
                }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns all deviations for a student", async () => {
            const student = await createStudent({});
            const enrollmentId = new mongoose.Types.ObjectId();
            await Deviation.create([
                { studentId: student._id, enrollmentId, type: "deviation", title: "A" },
                { studentId: student._id, enrollmentId, type: "exception", title: "B" },
            ]);
            const res = buildRes();
            await getDeviations(buildReq({ params: { id: student._id.toString() }, user: ADMIN }), res);
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(2);
        });

        it("filters deviations by enrollmentId", async () => {
            const student = await createStudent({});
            const enrollmentA = new mongoose.Types.ObjectId();
            const enrollmentB = new mongoose.Types.ObjectId();
            await Deviation.create([
                { studentId: student._id, enrollmentId: enrollmentA, type: "deviation", title: "A" },
                { studentId: student._id, enrollmentId: enrollmentB, type: "deviation", title: "B" },
            ]);
            const res = buildRes();
            await getDeviations(
                buildReq({
                    params: { id: student._id.toString() },
                    query: { enrollmentId: enrollmentA.toString() },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].title).toBe("A");
        });
    });

    describe("createDeviation", () => {
        it("returns 403 for unauthorized roles", async () => {
            const res = buildRes();
            await createDeviation(
                buildReq({ params: { id: "abc" }, body: {}, user: { role: "student", userId: "1" } }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns 400 when required fields are missing", async () => {
            const res = buildRes();
            await createDeviation(
                buildReq({
                    params: { id: "abc" },
                    body: { title: "No enrollment/type" },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(400);
        });

        it("returns 404 when the student does not exist", async () => {
            const res = buildRes();
            await createDeviation(
                buildReq({
                    params: { id: new mongoose.Types.ObjectId().toString() },
                    body: { enrollmentId: "x", type: "exception", title: "A" },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(404);
        });

        it("creates a deviation as an admin", async () => {
            const student = await createStudent({});
            const enrollmentId = new mongoose.Types.ObjectId().toString();
            const res = buildRes();
            await createDeviation(
                buildReq({
                    params: { id: student._id.toString() },
                    body: {
                        enrollmentId,
                        type: "exception",
                        title: "Extra tid",
                        description: "Behöver mer tid",
                        reason: "Särskilda skäl",
                    },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.deviation.status).toBe("pending");
            expect(res.body.deviation.requestedByName).toBe(ADMIN.name);
            const saved = await Deviation.findById(res.body.deviation._id);
            expect(saved.description).toBe("Behöver mer tid");
        });
    });

    describe("updateDeviation", () => {
        it("returns 403 for non-admin roles", async () => {
            const res = buildRes();
            await updateDeviation(
                buildReq({
                    params: { id: "abc", deviationId: "abc" },
                    body: { status: "approved" },
                    user: { role: "teacher", userId: "1" },
                }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns 404 when the deviation does not exist", async () => {
            const res = buildRes();
            await updateDeviation(
                buildReq({
                    params: {
                        id: new mongoose.Types.ObjectId().toString(),
                        deviationId: new mongoose.Types.ObjectId().toString(),
                    },
                    body: { status: "approved" },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(404);
        });

        it("marks an approved deviation as resolved", async () => {
            const student = await createStudent({});
            const deviation = await Deviation.create({
                studentId: student._id,
                enrollmentId: new mongoose.Types.ObjectId(),
                type: "deviation",
                title: "A",
                status: "pending",
            });
            const res = buildRes();
            await updateDeviation(
                buildReq({
                    params: { id: student._id.toString(), deviationId: deviation._id.toString() },
                    body: { status: "approved", resolution: "Godkänt" },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.deviation.status).toBe("approved");
            expect(res.body.deviation.resolvedByName).toBe(ADMIN.name);
            expect(res.body.deviation.resolvedAt).toBeTruthy();
        });

        it("updates only the resolution when no status is supplied", async () => {
            const student = await createStudent({});
            const deviation = await Deviation.create({
                studentId: student._id,
                enrollmentId: new mongoose.Types.ObjectId(),
                type: "deviation",
                title: "A",
            });
            const res = buildRes();
            await updateDeviation(
                buildReq({
                    params: { id: student._id.toString(), deviationId: deviation._id.toString() },
                    body: { resolution: "Endast anteckning" },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.deviation.resolution).toBe("Endast anteckning");
            expect(res.body.deviation.resolvedBy).toBeUndefined();
        });
    });

    describe("getRevisionReasons", () => {
        it("returns the supported revision reasons", async () => {
            const res = buildRes();
            await getRevisionReasons(buildReq({ user: ADMIN }), res);
            expect(res.statusCode).toBe(200);
            expect(res.body.reasons).toContain("pace_change");
        });
    });

    describe("reviseStudyPlan", () => {
        it("returns 403 for non-admin roles", async () => {
            const res = buildRes();
            await reviseStudyPlan(
                buildReq({ params: { id: "abc" }, user: { role: "teacher", userId: "1" } }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns 400 when revisionReason or changes are missing", async () => {
            const res = buildRes();
            await reviseStudyPlan(
                buildReq({ params: { id: "abc" }, body: { revisionReason: "other" }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(400);
        });

        it("performs a study-plan revision successfully", async () => {
            revisionService.performStudyplanRevision.mockResolvedValue({
                success: true,
                message: "Study plan revision applied",
                studentId: "abc",
            });
            const res = buildRes();
            await reviseStudyPlan(
                buildReq({
                    params: { id: "abc" },
                    body: { revisionReason: "pace_change", changes: { tempoWeeks: 8 } },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(revisionService.performStudyplanRevision).toHaveBeenCalledWith(
                expect.objectContaining({ userId: ADMIN.userId, userRole: "admin" })
            );
        });

        it("returns 404 when the service reports a missing student", async () => {
            revisionService.performStudyplanRevision.mockRejectedValue({
                statusCode: 404,
                message: "Student not found",
            });
            const res = buildRes();
            await reviseStudyPlan(
                buildReq({
                    params: { id: "abc" },
                    body: { revisionReason: "other", changes: {} },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(404);
        });

        it("returns 400 when the service rejects the request", async () => {
            revisionService.performStudyplanRevision.mockRejectedValue({
                statusCode: 400,
                message: "Invalid revision reason",
            });
            const res = buildRes();
            await reviseStudyPlan(
                buildReq({
                    params: { id: "abc" },
                    body: { revisionReason: "bad", changes: {} },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(400);
        });

        it("returns 500 on unexpected failure", async () => {
            revisionService.performStudyplanRevision.mockRejectedValue(new Error("boom"));
            const res = buildRes();
            await reviseStudyPlan(
                buildReq({
                    params: { id: "abc" },
                    body: { revisionReason: "other", changes: {} },
                    user: ADMIN,
                }),
                res
            );
            expect(res.statusCode).toBe(500);
        });
    });

    describe("getStudyplanRevisionHistory", () => {
        it("returns 403 for unauthorized roles", async () => {
            const res = buildRes();
            await getStudyplanRevisionHistory(
                buildReq({ params: { id: "abc" }, user: { role: "student", userId: "1" } }),
                res
            );
            expect(res.statusCode).toBe(403);
        });

        it("returns the revision history", async () => {
            revisionService.getRevisionHistory.mockResolvedValue([
                { timestamp: new Date(), reason: "pace_change" },
            ]);
            const res = buildRes();
            await getStudyplanRevisionHistory(
                buildReq({ params: { id: "abc" }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(200);
            expect(res.body.history).toHaveLength(1);
        });

        it("returns 404 when the service reports a missing student", async () => {
            revisionService.getRevisionHistory.mockRejectedValue({
                statusCode: 404,
                message: "Student not found",
            });
            const res = buildRes();
            await getStudyplanRevisionHistory(
                buildReq({ params: { id: "abc" }, user: ADMIN }),
                res
            );
            expect(res.statusCode).toBe(404);
        });
    });
});