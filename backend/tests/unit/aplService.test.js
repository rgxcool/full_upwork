import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock dependencies before importing the module under test ──────────────
const { AplRecordMock } = vi.hoisted(() => {
    const Mock = vi.fn(function (doc) {
        Object.assign(this, doc);
        this._id = (doc && doc._id) || "mock-apl-id";
        this.save = vi.fn().mockResolvedValue(this);
    });
    Mock.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
    });
    Mock.findOne = vi.fn().mockResolvedValue(null);
    Mock.create = vi.fn().mockImplementation((doc) => Promise.resolve(new Mock(doc)));
    return { AplRecordMock: Mock };
});

vi.mock("../../src/models/AplRecord.js", () => ({
    default: AplRecordMock,
}));
vi.mock("../../src/models/Student.js", () => ({
    default: {
        find: vi.fn().mockReturnValue({ populate: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) }),
        findById: vi.fn().mockResolvedValue(null),
    },
}));
vi.mock("../../src/models/Notification.js", () => ({
    default: { create: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../src/controllers/notificationTypes.js", () => ({
    default: { APL_WARNING: "apl_warning", APL_COMPLETE: "apl_complete" },
}));
vi.mock("../../src/services/emailService.js", () => ({
    sendEmail: vi.fn().mockResolvedValue({}),
    getEmailSignature: vi.fn().mockResolvedValue("Test School"),
}));
vi.mock("../../src/models/User.js", () => ({
    default: {
        findById: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ name: "Lärare", email: "teacher@x.se" }),
        }),
    },
}));
vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../src/utils/aplAutoStatus.js", () => ({
    computeAplPeriod: vi.fn().mockReturnValue({ aplStartDate: null, aplEndDate: null }),
    computeAplEffectiveStatus: vi.fn().mockImplementation((status) => ({
        aplStatus: status,
        aplStatusStored: status,
        aplAutoRed: false,
        aplWeeksRemaining: null,
    })),
    APL_AUTO_RED_WEEKS: 3,
}));

import {
    APL_STATUSES,
    updateAplStatus,
    autoTransitionStatuses,
    findEligibleStudents,
    autoCreateRecords,
    getAplRecords,
    getAplRecordByStudent,
    updateAplRecordDetails,
    getAplStatistics,
} from "../../src/services/aplService.js";
import AplRecord from "../../src/models/AplRecord.js";
import Student from "../../src/models/Student.js";
import User from "../../src/models/User.js";
import Notification from "../../src/models/Notification.js";
import { sendEmail } from "../../src/services/emailService.js";
import {
    computeAplPeriod,
    computeAplEffectiveStatus,
} from "../../src/utils/aplAutoStatus.js";

describe("APL Status Transitions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("APL_STATUSES constant", () => {
        it("defines all 6 statuses", () => {
            expect(APL_STATUSES).toEqual(["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"]);
            expect(APL_STATUSES.length).toBe(6);
        });
    });

    describe("updateAplStatus", () => {
        it("rejects invalid status", async () => {
            await expect(
                updateAplStatus({ studentId: "id", status: "INVALID", userId: "uid" })
            ).rejects.toThrow("Invalid APL status");
        });

        it("creates AplRecord when none exists", async () => {
            const mockStudent = {
                _id: "student-1",
                aplStatus: "GRAY",
                education: [],
                aplStatusHistory: [],
                save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(null);

            const result = await updateAplStatus({
                studentId: "student-1",
                status: "BLUE",
                reason: "Test",
                userId: "user-1",
            });

            expect(result.previousStatus).toBe("GRAY");
            expect(result.student.aplStatus).toBe("BLUE");
            expect(mockStudent.save).toHaveBeenCalled();
        });

        it("transitions GRAY → BLUE", async () => {
            const mockStudent = {
                _id: "s1", aplStatus: "GRAY", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r1", status: "GRAY", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s1", status: "BLUE", userId: "u1",
            });

            expect(result.previousStatus).toBe("GRAY");
            expect(result.student.aplStatus).toBe("BLUE");
            expect(mockRecord.status).toBe("BLUE");
            expect(mockRecord.save).toHaveBeenCalled();
        });

        it("transitions BLUE → YELLOW", async () => {
            const mockStudent = {
                _id: "s2", aplStatus: "BLUE", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r2", status: "BLUE", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s2", status: "YELLOW", userId: "u1",
            });

            expect(result.previousStatus).toBe("BLUE");
            expect(result.student.aplStatus).toBe("YELLOW");
        });

        it("transitions YELLOW → PURPLE", async () => {
            const mockStudent = {
                _id: "s3", aplStatus: "YELLOW", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r3", status: "YELLOW", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s3", status: "PURPLE", userId: "u1",
            });

            expect(result.previousStatus).toBe("YELLOW");
            expect(result.student.aplStatus).toBe("PURPLE");
        });

        it("transitions PURPLE → RED", async () => {
            const mockStudent = {
                _id: "s4", aplStatus: "PURPLE", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r4", status: "PURPLE", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s4", status: "RED", userId: "u1",
            });

            expect(result.previousStatus).toBe("PURPLE");
            expect(result.student.aplStatus).toBe("RED");
        });

        it("transitions RED → GREEN and marks completed", async () => {
            const mockStudent = {
                _id: "s5", aplStatus: "RED", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r5", status: "RED", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s5", status: "GREEN", userId: "u1",
            });

            expect(result.previousStatus).toBe("RED");
            expect(result.student.aplStatus).toBe("GREEN");
            expect(mockRecord.completedAt).toBeInstanceOf(Date);
            expect(mockRecord.completedBy).toBe("u1");
        });

        it("throws 404 for missing student", async () => {
            Student.findById.mockResolvedValue(null);

            await expect(
                updateAplStatus({ studentId: "nonexistent", status: "BLUE", userId: "u1" })
            ).rejects.toThrow("Student not found");
        });
    });

    describe("autoTransitionStatuses", () => {
        it("returns empty when no records to process", async () => {
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockResolvedValue([]),
            });

            const result = await autoTransitionStatuses();
            expect(result).toEqual([]);
        });

        it("skips records with missing or dropped-out students", async () => {
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockResolvedValue([
                    { _id: "r1", status: "GRAY", studentId: null },
                ]),
            });

            const result = await autoTransitionStatuses();
            expect(result).toEqual([]);
        });

        it("auto-transitions to RED when the APL period is near its end", async () => {
            const student = {
                _id: "s1",
                name: "Anna",
                dropout: false,
                aplStatus: "GRAY",
                education: [],
                aplStatusHistory: [],
                save: vi.fn(),
            };
            const record = {
                _id: "r1",
                status: "GRAY",
                statusHistory: [],
                studentId: student,
                save: vi.fn(),
            };
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockResolvedValue([record]),
            });
            computeAplPeriod.mockReturnValueOnce({
                aplStartDate: null,
                aplEndDate: new Date(Date.now() + 10 * 86400000),
            });
            Student.findById.mockResolvedValue(student);
            AplRecord.findOne.mockResolvedValue(record);

            const result = await autoTransitionStatuses();

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({ to: "RED", reason: "auto-red" });
            expect(record.status).toBe("RED");
        });

        it("auto-transitions to GREEN when the APL period has ended", async () => {
            const student = {
                _id: "s2",
                name: "Bertil",
                dropout: false,
                aplStatus: "GRAY",
                education: [],
                aplStatusHistory: [],
                save: vi.fn(),
            };
            const record = {
                _id: "r2",
                status: "GRAY",
                statusHistory: [],
                studentId: student,
                save: vi.fn(),
            };
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockResolvedValue([record]),
            });
            computeAplPeriod.mockReturnValueOnce({
                aplStartDate: null,
                aplEndDate: new Date(Date.now() - 3 * 86400000),
            });
            Student.findById.mockResolvedValue(student);
            AplRecord.findOne.mockResolvedValue(record);

            const result = await autoTransitionStatuses();

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({ to: "GREEN", reason: "auto-green" });
            expect(record.status).toBe("GREEN");
        });

        it("leaves RED status untouched when already RED", async () => {
            const student = {
                _id: "s3",
                name: "Cecilia",
                dropout: false,
                aplStatus: "RED",
                education: [],
                aplStatusHistory: [],
                save: vi.fn(),
            };
            const record = {
                _id: "r3",
                status: "RED",
                statusHistory: [],
                studentId: student,
                save: vi.fn(),
            };
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockResolvedValue([record]),
            });
            computeAplPeriod.mockReturnValueOnce({
                aplStartDate: null,
                aplEndDate: new Date(Date.now() + 10 * 86400000),
            });

            const result = await autoTransitionStatuses();
            expect(result).toEqual([]);
        });
    });

    describe("findEligibleStudents", () => {
        it("returns students with an active CoursePackage education", async () => {
            Student.find.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    {
                        _id: "s1",
                        name: "Anna",
                        dropout: false,
                        education: [{ type: "CoursePackage", startDate: new Date() }],
                        aplStatus: "BLUE",
                        teacherId: { _id: "t1", name: "Lärare", email: "t@x.se" },
                    },
                    {
                        _id: "s2",
                        name: "Bertil",
                        dropout: false,
                        education: [{ type: "SingleCourse", startDate: new Date() }],
                    },
                    {
                        _id: "s3",
                        name: "Cecilia",
                        dropout: false,
                        education: [
                            { type: "CoursePackage", startDate: new Date(), removedAt: new Date() },
                        ],
                    },
                ]),
            });
            computeAplEffectiveStatus.mockImplementation((status) => ({
                aplStatus: status,
                aplStatusStored: status,
                aplAutoRed: false,
                aplWeeksRemaining: 12,
            }));

            const result = await findEligibleStudents();

            expect(result).toHaveLength(1);
            expect(result[0]._id).toBe("s1");
            expect(result[0].aplWeeksRemaining).toBe(12);
        });
    });

    describe("autoCreateRecords", () => {
        it("creates records only for students without an existing one", async () => {
            Student.find.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    { _id: "s1", education: [{ type: "CoursePackage" }], aplStatus: "GRAY" },
                    { _id: "s2", education: [{ type: "CoursePackage" }], aplStatus: "BLUE" },
                ]),
            });
            AplRecord.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ _id: "existing" });

            const result = await autoCreateRecords("user-1");

            expect(result).toHaveLength(1);
            expect(result[0].status).toBe("GRAY");
            expect(result[0].statusHistory[0].changedBy).toBe("user-1");
        });
    });

    describe("getAplRecords", () => {
        beforeEach(() => {
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([]),
            });
        });

        it("excludes completed records by default", async () => {
            await getAplRecords({});
            expect(AplRecord.find).toHaveBeenCalledWith({
                status: { $ne: "GREEN" },
            });
        });

        it("filters by status and includes completed when requested", async () => {
            await getAplRecords({ status: "RED", includeCompleted: true });
            expect(AplRecord.find).toHaveBeenCalledWith({ status: "RED" });
        });

        it("filters by search term against student name and email", async () => {
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    { status: "BLUE", studentId: { name: "Anna Andersson", email: "anna@x.se" } },
                    { status: "BLUE", studentId: { name: "Bertil", email: "BETA@x.se" } },
                ]),
            });

            const records = await getAplRecords({ search: "beta" });

            expect(records).toHaveLength(1);
            expect(records[0].studentId.name).toBe("Bertil");
        });

        it("enriches records with computed APL fields", async () => {
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue([
                    { status: "BLUE", studentId: { name: "Anna" }, education: [] },
                ]),
            });
            computeAplEffectiveStatus.mockReturnValue({
                aplWeeksRemaining: 4,
                aplAutoRed: true,
            });

            const records = await getAplRecords({ search: "anna" });

            expect(records[0].aplWeeksRemaining).toBe(4);
            expect(records[0].aplStatusAuto).toBe(true);
        });
    });

    describe("getAplRecordByStudent", () => {
        beforeEach(() => {
            AplRecord.findOne.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue(null),
            });
        });

        it("returns null when no record exists", async () => {
            expect(await getAplRecordByStudent("s1")).toBeNull();
        });

        it("enriches the found record with computed fields", async () => {
            AplRecord.findOne.mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue({
                    status: "YELLOW",
                    studentId: { name: "Anna", education: [] },
                }),
            });
            computeAplEffectiveStatus.mockReturnValue({
                aplWeeksRemaining: 2,
                aplAutoRed: true,
            });

            const record = await getAplRecordByStudent("s1");
            expect(record.status).toBe("YELLOW");
            expect(record.aplWeeksRemaining).toBe(2);
            expect(record.aplStatusAuto).toBe(true);
        });
    });

    describe("updateAplRecordDetails", () => {
        it("updates allowed fields on an existing record", async () => {
            const record = { placementCompany: "Old", save: vi.fn().mockResolvedValue({}) };
            AplRecord.findOne.mockResolvedValue(record);

            const result = await updateAplRecordDetails({
                studentId: "s1",
                updates: {
                    placementCompany: "Acme AB",
                    notes: "Ny anteckning",
                    bogusField: "x",
                },
                userId: "u1",
            });

            expect(result.placementCompany).toBe("Acme AB");
            expect(result.notes).toBe("Ny anteckning");
            expect(result.bogusField).toBeUndefined();
            expect(record.save).toHaveBeenCalled();
        });

        it("auto-creates a record when none exists", async () => {
            AplRecord.findOne.mockResolvedValue(null);
            Student.findById.mockResolvedValue({
                _id: "s1",
                aplStatus: "BLUE",
                education: [],
            });
            computeAplPeriod.mockReturnValue({
                aplStartDate: new Date("2026-01-15"),
                aplEndDate: new Date("2026-06-15"),
            });

            const result = await updateAplRecordDetails({
                studentId: "s1",
                updates: { notes: "Hej" },
                userId: "u1",
            });

            expect(result.status).toBe("BLUE");
            expect(result.notes).toBe("Hej");
            expect(result.internshipStartDate).toBeInstanceOf(Date);
        });

        it("throws 404 when neither record nor student exists", async () => {
            AplRecord.findOne.mockResolvedValue(null);
            Student.findById.mockResolvedValue(null);

            await expect(
                updateAplRecordDetails({ studentId: "s1", updates: {}, userId: "u1" })
            ).rejects.toThrow("Student not found");
        });
    });

    describe("updateAplStatus notification paths", () => {
        it("emails the student's teacher on status change", async () => {
            const mockStudent = {
                _id: "s1",
                name: "Anna",
                aplStatus: "GRAY",
                teacherId: "t1",
                education: [],
                aplStatusHistory: [],
                save: vi.fn(),
            };
            const mockRecord = {
                _id: "r1",
                status: "GRAY",
                statusHistory: [],
                save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            await updateAplStatus({
                studentId: "s1",
                status: "RED",
                reason: "Manuell",
                userId: "u1",
            });

            expect(Notification.create).toHaveBeenCalledWith(
                expect.objectContaining({ type: "apl_warning", teacher: "t1" })
            );
            expect(User.findById).toHaveBeenCalledWith("t1");
            expect(sendEmail).toHaveBeenCalledWith(
                expect.objectContaining({ subject: expect.stringContaining("APL-status ändrad") })
            );
        });

        it("logs non-fatal errors from the status email path", async () => {
            const mockStudent = {
                _id: "s1",
                name: "Anna",
                aplStatus: "GRAY",
                teacherId: "t1",
                education: [],
                aplStatusHistory: [],
                save: vi.fn(),
            };
            const mockRecord = {
                _id: "r1",
                status: "GRAY",
                statusHistory: [],
                save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);
            User.findById.mockReturnValue({
                select: vi.fn().mockRejectedValue(new Error("email down")),
            });

            await expect(
                updateAplStatus({ studentId: "s1", status: "BLUE", userId: "u1" })
            ).resolves.toBeDefined();
        });
    });

    describe("getAplStatistics", () => {
        it("counts records by status", async () => {
            AplRecord.find.mockReturnValue({
                lean: vi.fn().mockResolvedValue([
                    { status: "GRAY" },
                    { status: "GRAY" },
                    { status: "RED" },
                ]),
            });

            const stats = await getAplStatistics();

            expect(stats.total).toBe(3);
            expect(stats.counts.GRAY).toBe(2);
            expect(stats.counts.RED).toBe(1);
            expect(stats.counts.GREEN).toBe(0);
        });
    });
});
