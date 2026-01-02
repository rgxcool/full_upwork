import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/courseMatchingService.js", () => ({
    __esModule: true,
    default: {
        processStudentEducation: vi.fn(),
        findBestCourseMatch: vi.fn(),
        updateCourseInstanceStats: vi.fn(),
        getCourseStatistics: vi.fn(),
        findOrCreateCourseInstance: vi.fn(),
    },
}));
vi.mock("../../src/models/Student.js", () => {
    function Student(data = {}) {
        Object.assign(this, data);
        this._id = data._id || "mock-student-id";
    }

    return {
        __esModule: true,
        default: Student,
    };
});
vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn(),
        deleteMany: vi.fn(),
    },
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        countDocuments: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndDelete: vi.fn(),
        deleteMany: vi.fn(),
    },
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
    },
}));
vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
    },
}));
vi.mock("../../src/utils/parseStudentExcel.js", () => ({
    __esModule: true,
    parseStudentExcel: vi.fn(),
    normalizeCodeForMatching: vi.fn((value) => value || ""),
}));
vi.mock("../../src/utils/teacherService.js", () => ({
    __esModule: true,
    createOrFindTeacher: vi.fn().mockResolvedValue({ teacher: { _id: "teacher1" }, user: {}, password: "pass" }),
}));
vi.mock("../../src/controllers/notificationController.js", () => ({
    __esModule: true,
    createGlobalNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/controllers/studentController.js", () => ({
    __esModule: true,
    normalizeMunicipalityName: vi.fn((value) => value),
    getClosestMunicipality: vi.fn(() => null),
}));

import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import Student from "../../src/models/Student.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import { parseStudentExcel } from "../../src/utils/parseStudentExcel.js";
import {
    uploadStudentsForMatching,
    processStudentEducation,
    findCourseMatch,
    getCourseInstances,
    getStudentEnrollments,
    getCourseInstanceEnrollments,
    updateEnrollmentStatus,
    updateEnrollmentDates,
    getCourseStatistics,
    createCourseInstance,
    updateCourseInstance,
    deleteCourseInstance,
    deleteAllCourseInstances,
} from "../../src/controllers/courseMatchingController.js";
import { createOrFindTeacher } from "../../src/utils/teacherService.js";
import { createGlobalNotification } from "../../src/controllers/notificationController.js";

const createRes = () => {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res;
};

const createReq = (overrides = {}) => ({
    file: {
        buffer: Buffer.from("ok"),
        originalname: "students.xlsx",
    },
    user: { userId: "user1" },
    userId: "user1",
    cookies: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
});

const createPopulateChain = (result) => {
    const chain = {
        populate: vi.fn(() => chain),
        sort: vi.fn(() => Promise.resolve(result)),
    };
    return chain;
};

beforeEach(() => {
    vi.clearAllMocks();
    Student.prototype.save = vi.fn().mockImplementation(function () {
        return Promise.resolve(this);
    });
    Student.findOne = vi.fn();
    Student.findById = vi.fn();
    Student.findByIdAndDelete = vi.fn();
    Student.countDocuments = vi.fn();
    Student.find = vi.fn();
    CourseMatchingService.processStudentEducation.mockResolvedValue({
        enrollments: [],
        warnings: [],
        errors: [],
    });
    CourseMatchingService.findBestCourseMatch.mockResolvedValue(null);
    Student.findOne.mockResolvedValue(null);
    Student.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: "stu1", education: [] }),
    });
    Student.findByIdAndDelete.mockResolvedValue(undefined);
    Student.countDocuments.mockResolvedValue(0);
    Student.find.mockResolvedValue([]);
    CoursePackage.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    Course.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    StudentEnrollment.countDocuments.mockResolvedValue(0);
    StudentEnrollment.findOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({
            slutprovDate: new Date("2025-01-01"),
        }),
    });
    StudentEnrollment.find.mockReturnValue(
        createPopulateChain([{ _id: "enrollment1" }])
    );
    StudentEnrollment.findById.mockResolvedValue(null);
    StudentEnrollment.findByIdAndDelete.mockResolvedValue(null);
    StudentEnrollment.deleteMany.mockResolvedValue({ deletedCount: 0 });
    CourseInstance.find.mockReturnValue(
        createPopulateChain([
            {
                _id: "inst1",
                courseName: "Math",
                toObject: () => ({ _id: "inst1", courseName: "Math" }),
            },
        ])
    );
    CourseInstance.findById.mockResolvedValue(null);
    CourseInstance.findByIdAndUpdate.mockResolvedValue(null);
    CourseInstance.findByIdAndDelete.mockResolvedValue(null);
    CourseInstance.deleteMany.mockResolvedValue({ deletedCount: 0 });
    createOrFindTeacher.mockResolvedValue({
        teacher: { _id: "teacher1" },
        user: {},
        password: "pass",
    });
    createGlobalNotification.mockResolvedValue(undefined);
});

describe("uploadStudentsForMatching", () => {
    it("returns 400 when file missing", async () => {
        const req = createReq({ file: undefined });
        const res = createRes();

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "No file uploaded" });
    });

    it("returns 422 when sanitize fails because of invalid additionalInfo", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "student@example.com",
                name: "Student",
                additionalInfo: { foo: "bar" },
                education: [{ name: "MATEMATIK NIVÅ 1", startDate: "2024-01-01", endDate: "2024-06-01" }],
            },
        ]);

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                reasons: expect.any(Array),
                error: expect.stringContaining("Validering misslyckades"),
            })
        );
    });

    it("processes parsed students, creates teacher, and enrolls course/package data", async () => {
        const req = createReq();
        const res = createRes();
        const coursePackage = {
            _id: "pkg-1",
            coursePackageCode: "MATHPKG",
            coursePackageName: "Mathematik paket",
        };
        const course = {
            _id: "course-1",
            courseCode: "ENGCOURSE",
            courseName: "Engelska",
        };

        parseStudentExcel.mockResolvedValue([
            {
                email: "student@example.com",
                name: "Student",
                additionalInfo: "Notes",
                teacher: "Teacher One",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MATHPKG",
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                        slutprovDate: "2024-03-01",
                    },
                    {
                        name: "ENGCOURSE",
                        startDate: "2024-01-15",
                        endDate: "2024-02-15",
                        slutprovDate: "2024-03-15",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([coursePackage]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([course]),
        });

        const teacherResult = {
            wasCreated: true,
            teacher: { _id: "teacher-id" },
            user: { username: "Teacher One", email: "teacher@example.com" },
            password: "secure",
        };
        createOrFindTeacher.mockResolvedValue(teacherResult);
        CourseMatchingService.processStudentEducation.mockImplementation(
            async (_studentId, entries) => ({
                enrollments: entries.map((entry) => ({
                    type: entry.type,
                    name: entry.name || entry.packageName,
                })),
                warnings: [],
                errors: [],
            })
        );

        await uploadStudentsForMatching(req, res);

        expect(createGlobalNotification).toHaveBeenCalledWith(
            "teacher_auto_created",
            expect.stringContaining("Teacher One")
        );
        expect(CourseMatchingService.processStudentEducation).toHaveBeenCalledTimes(2);
        expect(CourseMatchingService.processStudentEducation).toHaveBeenNthCalledWith(
            1,
            expect.any(String),
            [
                expect.objectContaining({
                    type: "CoursePackage",
                    refId: coursePackage._id,
                    name: coursePackage.coursePackageName,
                }),
            ]
        );
        expect(CourseMatchingService.processStudentEducation).toHaveBeenNthCalledWith(
            2,
            expect.any(String),
            [
                expect.objectContaining({
                    type: "Course",
                    name: "ENGCOURSE",
                }),
            ]
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: expect.stringContaining("created 1 new teacher account"),
                results: expect.objectContaining({
                    students: expect.any(Array),
                    enrollments: expect.arrayContaining([
                        expect.objectContaining({ type: "CoursePackage" }),
                        expect.objectContaining({ type: "Course" }),
                    ]),
                    createdTeachers: expect.arrayContaining([
                        expect.objectContaining({ name: "Teacher One" }),
                    ]),
                }),
            })
        );
    });
});

describe("processStudentEducation controller", () => {
    it("processes education entries successfully", async () => {
        const req = {
            body: {
                studentId: "stu123",
                educationEntries: [{ type: "Course", name: "MAT101" }],
            },
            user: { userId: "u1" },
        };
        const res = createRes();
        Student.findById.mockResolvedValue({ _id: "stu123" });
        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ id: "enr1" }],
            warnings: [],
            errors: [],
        });

        await processStudentEducation(req, res);

        expect(CourseMatchingService.processStudentEducation).toHaveBeenCalledWith(
            "stu123",
            [{ type: "Course", name: "MAT101" }],
            "u1"
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                results: expect.any(Object),
            })
        );
    });
});

describe("findCourseMatch", () => {
    it("returns 400 when missing courseName", async () => {
        const req = { query: {} };
        const res = createRes();

        await findCourseMatch(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Course name is required" });
    });

    it("returns match when found", async () => {
        const req = { query: { courseName: "MAT101" } };
        const res = createRes();
        CourseMatchingService.findBestCourseMatch.mockResolvedValue({
            course: { _id: "c1", courseCode: "MAT101" },
            score: 1,
        });

        await findCourseMatch(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                match: {
                    course: expect.objectContaining({ courseCode: "MAT101" }),
                    score: 1,
                },
            })
        );
    });
});

describe("getCourseInstances", () => {
    it("builds query and returns instances", async () => {
        const req = {
            query: {
                courseId: "c1",
                startDate: "2024-01-01",
                endDate: "2024-12-31",
                isActive: "true",
            },
        };
        const res = createRes();

        await getCourseInstances(req, res);

        expect(CourseInstance.find).toHaveBeenCalled();
        expect(StudentEnrollment.countDocuments).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                instances: expect.any(Array),
            })
        );
    });
});

describe("getStudentEnrollments", () => {
    it("returns enrollments for student", async () => {
        const req = {
            params: { studentId: "stu1" },
            query: { status: "enrolled" },
        };
        const res = createRes();

        await getStudentEnrollments(req, res);

        expect(StudentEnrollment.find).toHaveBeenCalledWith(
            expect.objectContaining({ studentId: "stu1", status: "enrolled" })
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, enrollments: expect.any(Array) })
        );
    });
});

describe("getCourseInstanceEnrollments", () => {
    it("returns enrollments for course instance", async () => {
        const req = {
            params: { instanceId: "inst1" },
            query: { status: "enrolled" },
        };
        const res = createRes();

        await getCourseInstanceEnrollments(req, res);

        expect(StudentEnrollment.find).toHaveBeenCalledWith(
            expect.objectContaining({ courseInstanceId: "inst1", status: "enrolled" })
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, enrollments: expect.any(Array) })
        );
    });
});

describe("updateEnrollmentStatus", () => {
    it("updates status and stats when enrollment exists", async () => {
        const changeStatus = vi.fn().mockResolvedValue(undefined);
        StudentEnrollment.findById.mockResolvedValue({
            changeStatus,
            courseInstanceId: "ci-1",
        });
        const req = {
            params: { enrollmentId: "enroll-1" },
            body: { status: "completed", reason: "done", notes: "ok" },
            user: { userId: "user1" },
        };
        const res = createRes();

        await updateEnrollmentStatus(req, res);

        expect(changeStatus).toHaveBeenCalledWith("completed", "done", "ok", "user1");
        expect(CourseMatchingService.updateCourseInstanceStats).toHaveBeenCalledWith("ci-1");
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                enrollment: expect.any(Object),
            })
        );
    });

    it("returns 404 when enrollment not found", async () => {
        StudentEnrollment.findById.mockResolvedValue(null);
        const req = {
            params: { enrollmentId: "missing" },
            body: {},
        };
        const res = createRes();

        await updateEnrollmentStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Enrollment not found" });
    });
});

describe("updateEnrollmentDates", () => {
    it("updates dates when enrollment exists", async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        StudentEnrollment.findById.mockResolvedValue({
            startDate: new Date(),
            endDate: new Date(),
            save,
        });
        const req = {
            params: { enrollmentId: "enroll-2" },
            body: { startDate: "2025-01-01", endDate: "2025-02-01" },
        };
        const res = createRes();

        await updateEnrollmentDates(req, res);

        expect(save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Enrollment dates updated successfully",
            enrollment: expect.any(Object),
        });
    });

    it("returns 404 when enrollment missing", async () => {
        StudentEnrollment.findById.mockResolvedValue(null);
        const req = { params: { enrollmentId: "absent" }, body: {} };
        const res = createRes();

        await updateEnrollmentDates(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Enrollment not found" });
    });
});

describe("getCourseStatistics", () => {
    it("returns 400 when dates missing", async () => {
        const req = { query: { startDate: "2025-01-01" } };
        const res = createRes();

        await getCourseStatistics(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Start date and end date are required" });
    });

    it("delegates to service when dates present", async () => {
        CourseMatchingService.getCourseStatistics.mockResolvedValue({ total: 3 });
        const req = {
            query: { startDate: "2025-01-01", endDate: "2025-12-31", courseId: "course" },
        };
        const res = createRes();

        await getCourseStatistics(req, res);

        expect(CourseMatchingService.getCourseStatistics).toHaveBeenCalledWith(
            new Date("2025-01-01"),
            new Date("2025-12-31"),
            "course"
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, statistics: { total: 3 } })
        );
    });
});

describe("createCourseInstance", () => {
    it("returns 400 when required fields missing", async () => {
        const req = { body: { startDate: "2025-01-01" } };
        const res = createRes();

        await createCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Main course ID, start date, and end date are required",
        });
    });

    it("creates course instance via service", async () => {
        CourseMatchingService.findOrCreateCourseInstance.mockResolvedValue({
            instance: { _id: "ci1" },
            wasCreated: true,
        });
        const req = {
            body: {
                mainCourseId: "course1",
                startDate: "2025-01-01",
                endDate: "2025-02-01",
            },
            user: { userId: "user1" },
        };
        const res = createRes();

        await createCourseInstance(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: "Course instance created successfully",
                instance: { _id: "ci1" },
                wasCreated: true,
            })
        );
    });
});

describe("updateCourseInstance", () => {
    it("returns 404 when instance missing", async () => {
        CourseInstance.findById.mockResolvedValue(null);
        const req = { params: { instanceId: "missing" }, body: {} };
        const res = createRes();

        await updateCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course instance not found" });
    });

    it("updates instance when found", async () => {
        CourseInstance.findById.mockResolvedValue({
            _id: "inst-2",
            courseName: "Demo",
            save: vi.fn().mockResolvedValue(true),
        });
        CourseInstance.findByIdAndUpdate.mockResolvedValue({ _id: "inst-2", courseName: "Demo" });
        const req = {
            params: { instanceId: "inst-2" },
            body: { notes: "updated" },
        };
        const res = createRes();

        await updateCourseInstance(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: "Course instance updated successfully",
                instance: expect.objectContaining({ courseName: "Demo" }),
            })
        );
    });
});

describe("deleteCourseInstance", () => {
    it("returns 404 when instance not found", async () => {
        CourseInstance.findByIdAndDelete.mockResolvedValue(null);
        const req = { params: { instanceId: "missing" } };
        const res = createRes();

        await deleteCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course instance not found" });
    });

    it("deletes instance and enrollments", async () => {
        CourseInstance.findByIdAndDelete.mockResolvedValue({ _id: "inst-3" });
        StudentEnrollment.deleteMany.mockResolvedValue({ deletedCount: 1 });
        const req = { params: { instanceId: "inst-3" } };
        const res = createRes();

        await deleteCourseInstance(req, res);

        expect(StudentEnrollment.deleteMany).toHaveBeenCalledWith({ courseInstanceId: "inst-3" });
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Course instance and related enrollments deleted",
        });
    });
});

describe("deleteAllCourseInstances", () => {
    it("clears all instances and enrollments", async () => {
        CourseInstance.deleteMany.mockResolvedValue({ deletedCount: 2 });
        StudentEnrollment.deleteMany.mockResolvedValue({ deletedCount: 3 });
        const req = {};
        const res = createRes();

        await deleteAllCourseInstances(req, res);

        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "All course instances (2) and related enrollments (3) deleted",
        });
    });
});
