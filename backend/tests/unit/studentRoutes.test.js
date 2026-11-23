import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const CourseMatchingServiceMock = {
    __esModule: true,
    default: {
        processStudentEducation: vi.fn(),
        findOrCreateCourseInstance: vi.fn(),
    },
};

vi.mock("../../src/utils/courseMatchingService.js", () => CourseMatchingServiceMock);

const calendarEventSyncMock = {
    syncCalendarEventsForStudent: vi.fn(),
};

vi.mock("../../src/utils/calendarEventSync.js", () => calendarEventSyncMock);

vi.mock("../../src/models/Student.js", () => {
    const StudentMock = vi.fn(function (doc) {
        Object.assign(this, doc);
        if (!this._id) this._id = "mock-id-" + Math.random().toString(36).slice(2, 8);
        this.save = vi.fn().mockResolvedValue(this);
    });
    Object.assign(StudentMock, {
        find: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn(),
        deleteMany: vi.fn(),
        countDocuments: vi.fn(),
        findOne: vi.fn(),
    });

    return {
        __esModule: true,
        default: StudentMock,
    };
});

const { AplRecordMock } = vi.hoisted(() => ({
    AplRecordMock: {
        deleteMany: vi.fn(),
    },
}));
vi.mock("../../src/models/AplRecord.js", () => ({
    default: AplRecordMock,
}));

vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
    },
}));

vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
    },
}));

vi.mock("../../src/models/Program.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
    },
}));

vi.mock("../../src/controllers/notificationController.js", () => ({
    sendDropoutNotification: vi.fn(),
}));

vi.mock("../../src/controllers/authController.js", () => {
    const authenticateUser = vi.fn((req, res, next) => {
        req.headers = req.headers || {};
        req.user = req.user || {
            userId: "auth-user",
            role: "teacher",
            name: "Auth Mock",
        };
        next();
    });

    return {
        authenticateUser,
    };
});

vi.mock("../../src/services/emailService.js", () => ({
    __esModule: true,
    maybeSendLarteametEmail: vi.fn(),
    getStudentMunicipality: vi.fn((municipality) =>
        typeof municipality === "string"
            ? municipality
            : municipality?.type || null
    ),
    SOLLENTUNA_MUNICIPALITY: "Sollentuna",
}));

const { getRevenueReportMock } = vi.hoisted(() => ({
    getRevenueReportMock: vi.fn(),
}));
vi.mock("../../src/services/analyticsService.js", () => ({
    getRevenueReport: getRevenueReportMock,
}));

const { updateAplStatusMock } = vi.hoisted(() => ({
    updateAplStatusMock: vi.fn(),
}));
vi.mock("../../src/services/aplService.js", () => ({
    APL_STATUSES: ["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"],
    updateAplStatus: updateAplStatusMock,
}));

const loggerMock = vi.hoisted(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));
vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: loggerMock,
}));

// #102: a teacher is a User with teacherProfile; Student.teacherId holds that User id.
const { UserMock, userLookup, TEACHER_USER_ID } = vi.hoisted(() => ({
    UserMock: {
        findOne: vi.fn(),
    },
    // User.findOne(...).select(...).lean()
    userLookup: (value) => ({ select: () => ({ lean: () => Promise.resolve(value) }) }),
    TEACHER_USER_ID: "64b0000000000000000000aa",
}));

vi.mock("../../src/models/User.js", () => ({
    __esModule: true,
    default: UserMock,
}));

let StudentEnrollmentQuery;
var StudentEnrollmentMock;

vi.mock("mongoose", () => {
    function ObjectIdFactory(value) {
        if (!(this instanceof ObjectIdFactory)) {
            return new ObjectIdFactory(value);
        }
        this._value = value;
    }
    ObjectIdFactory.prototype.equals = function (other) {
        if (other === null || other === undefined) {
            return false;
        }
        return (
            other === this._value ||
            other._value === this._value ||
            (typeof other === "string" && String(other) === String(this._value))
        );
    };
    const objectIdMock = vi.fn(function (value) {
        return ObjectIdFactory.call(this, value);
    });
    objectIdMock.prototype = ObjectIdFactory.prototype;
    const types = {
        ObjectId: objectIdMock,
    };
    const schema = vi.fn(function (definition, options) {
        const schemaObj = {
            definition,
            options,
            Types: types,
                        pre: vi.fn(),
            post: vi.fn(),
            methods: {},
            statics: {},
            index: vi.fn(),
        };
        const virtualChain = {
            get: vi.fn(() => virtualChain),
            set: vi.fn(() => virtualChain),
        };
        schemaObj.virtual = vi.fn(() => virtualChain);
        return schemaObj;
    });
    schema.Types = types;
    StudentEnrollmentMock = {
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndDelete: vi.fn(),
        exists: vi.fn(),
    };
    const model = vi.fn((name) => {
        if (name === "StudentEnrollment") return StudentEnrollmentMock;
        return undefined;
    });
    return {
        __esModule: true,
        default: {
            Schema: schema,
            model,
            Types: types,
            isValidObjectId: (value) => /^[0-9a-f]{24}$/i.test(String(value)),
        },
    };
});


import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import AplRecord from "../../src/models/AplRecord.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import Program from "../../src/models/Program.js";
import { sendDropoutNotification } from "../../src/controllers/notificationController.js";
import { authenticateUser } from "../../src/controllers/authController.js";
import { maybeSendLarteametEmail } from "../../src/services/emailService.js";
import router from "../../src/router/studentRoutes.js";

const findRouteHandler = (path, method) => {
    const lowerMethod = method.toLowerCase();
    for (const layer of router.stack) {
        if (layer.route?.path !== path) continue;
        const entries = layer.route.stack.filter(
            (stackEntry) => stackEntry.method === lowerMethod
        );
        if (entries.length > 0) {
            return entries[entries.length - 1].handle;
        }
    }
    throw new Error(`Route ${path} with method ${method} not found`);
};

const createRes = () => {
    const res = {
        status: vi.fn(function () {
            return this;
        }),
        json: vi.fn(function () {
            return this;
        }),
    };
    return res;
};

const createSelectChain = (value) => ({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
});

const createPopulateChain = (value) => ({
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
});

beforeEach(() => {
    authenticateUser.mockReset();
    Student.mockClear();
    Student.find.mockReset();
    Student.findById.mockReset();
    Student.findByIdAndUpdate.mockReset();
    Student.findByIdAndDelete.mockReset();
    Student.deleteMany.mockReset();
    Student.countDocuments.mockReset();
    Student.countDocuments.mockResolvedValue(0);
    Student.findOne.mockReset();
    Student.findOne.mockResolvedValue(null);
    AplRecord.deleteMany.mockReset();
    AplRecord.deleteMany.mockResolvedValue({ deletedCount: 0 });
    sendDropoutNotification.mockReset();
    CourseMatchingServiceMock.default.processStudentEducation.mockReset();
    CourseMatchingServiceMock.default.findOrCreateCourseInstance.mockReset();
    calendarEventSyncMock.syncCalendarEventsForStudent.mockReset();
    maybeSendLarteametEmail.mockReset();
    maybeSendLarteametEmail.mockResolvedValue({ sent: true });
    updateAplStatusMock.mockReset();
    UserMock.findOne.mockReset();
    StudentEnrollmentQuery = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
    };
    StudentEnrollmentMock.find.mockReset();
    StudentEnrollmentMock.find.mockImplementation(() => StudentEnrollmentQuery);
    StudentEnrollmentMock.findOne.mockReset();
    StudentEnrollmentMock.findById.mockReset();
    StudentEnrollmentMock.findByIdAndDelete.mockReset();
    StudentEnrollmentMock.exists.mockReset();
    getRevenueReportMock.mockReset();
    CoursePackage.find.mockReset();
    CoursePackage.findById.mockReset();
    CoursePackage.findById.mockResolvedValue(null);
    Course.find.mockReset();
    Course.findById.mockReset();
    Program.find.mockReset();
});

describe("studentRoutes router", () => {
    it("GET /students/by-teacher/:teacherId returns filtered students", async () => {
        const handler = findRouteHandler(
            "/students/by-teacher/:teacherId",
            "GET"
        );
        Student.find.mockResolvedValue([
            {
                _id: "student-1",
                name: "Ida",
                personalNumber: "19900101-1234",
                attendedExam: true,
                additionalInfo: "notes",
            },
        ]);
        const req = { params: { teacherId: "teacher-1" }, user: { role: "teacher", userId: "teacher-1" } };
        const res = createRes();

        sendDropoutNotification.mockResolvedValue({ id: "notif" });

        await handler(req, res);

        expect(Student.find).toHaveBeenCalledWith({
            teacherId: "teacher-1",
            dropout: { $ne: true },
        });
        expect(res.json).toHaveBeenCalledWith([
            {
                _id: "student-1",
                name: "Ida",
                personalNumber: "19900101-1234",
                attended: true,
                additionalInfo: "notes",
            },
        ]);
    });

    it("GET /students/by-teacher/:teacherId handles failures", async () => {
        const handler = findRouteHandler(
            "/students/by-teacher/:teacherId",
            "GET"
        );
        Student.find.mockRejectedValue(new Error("boom"));
        const req = { params: { teacherId: "teacher-1" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
    });

    it("GET /students/dropouts returns inactive students with teacher populated", async () => {
        const handler = findRouteHandler("/students/dropouts", "GET");
        Student.find.mockReturnValue(
            createPopulateChain([
                {
                    _id: "student-1",
                    name: "Avbruten Elev",
                    dropout: true,
                    teacherId: { _id: "teacher-1", name: "Läraren", email: "t@x.se" },
                },
            ])
        );
        const req = {};
        const res = createRes();

        await handler(req, res);

        expect(Student.find).toHaveBeenCalledWith({ dropout: true });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([
            {
                _id: "student-1",
                name: "Avbruten Elev",
                dropout: true,
                teacherId: { _id: "teacher-1", name: "Läraren", email: "t@x.se" },
                previousEnrollments: [],
                dropoutReason: null,
                dropoutDate: undefined,
            },
        ]);
    });

    it("GET /students/dropouts handles failures", async () => {
        const handler = findRouteHandler("/students/dropouts", "GET");
        Student.find.mockReturnValue(
            createPopulateChain({ __rejected: true })
        );
        Student.find.mockImplementationOnce(() => {
            const chain = createPopulateChain([]);
            chain.lean.mockRejectedValue(new Error("boom"));
            return chain;
        });
        const req = {};
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Failed to fetch inactive students",
        });
    });

    // #103: the status is stored on the student's enrollment in the course.
    const STATUS_COURSE_ID = "64b0000000000000000000c1";
    const statusEnrollment = (status = "active") => ({
        _id: "enr-1",
        mainCourseId: STATUS_COURSE_ID,
        status,
        save: vi.fn().mockResolvedValue(undefined),
    });
    const mockStatusLookups = (enrollment) => {
        StudentEnrollmentMock.findOne.mockReturnValue({ sort: () => Promise.resolve(enrollment) });
        Course.findById.mockReturnValue({
            select: () => ({ lean: () => Promise.resolve({ courseName: "Svenska 1" }) }),
        });
    };

    it("PUT /students/:studentId/education/:educationId/status sends notification when status is Avbrott", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        const studentDoc = { _id: "student-1", dropout: false, save: vi.fn().mockResolvedValue(undefined) };
        Student.findById.mockResolvedValue(studentDoc);
        const enrollment = statusEnrollment();
        mockStatusLookups(enrollment);

        const req = {
            params: { studentId: "student-1", educationId: STATUS_COURSE_ID },
            body: { status: "Avbrott" },
        };
        const res = createRes();

        await handler(req, res);

        expect(enrollment.status).toBe("dropped");
        expect(enrollment.save).toHaveBeenCalled();
        expect(studentDoc.dropout).toBe(true);
        expect(sendDropoutNotification).toHaveBeenCalledWith({
            student: studentDoc,
            education: expect.objectContaining({ _id: "enr-1", name: "Svenska 1" }),
        });
        expect(studentDoc.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Status updated and notification sent",
            notification: undefined,
        });
    });

    it("PUT /students/:studentId/education/:educationId/status updates status without notification when needed", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        const studentDoc = { _id: "student-2", dropout: true, save: vi.fn().mockResolvedValue(undefined) };
        Student.findById.mockResolvedValue(studentDoc);
        const enrollment = statusEnrollment("enrolled");
        mockStatusLookups(enrollment);

        const req = {
            params: { studentId: "student-2", educationId: STATUS_COURSE_ID },
            body: { status: "Pågående" },
        };
        const res = createRes();

        await handler(req, res);

        expect(enrollment.status).toBe("active");
        expect(studentDoc.dropout).toBe(false);
        expect(sendDropoutNotification).not.toHaveBeenCalled();
        expect(studentDoc.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Status updated successfully",
        });
    });

    it("PUT /students/:studentId/education/:educationId/status returns 404 when education entry missing", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        Student.findById.mockResolvedValue({ _id: "stu-empty" });
        mockStatusLookups(null);
        const req = {
            params: { studentId: "stu-empty", educationId: STATUS_COURSE_ID },
            body: { status: "Pågående" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            message: "Education not found for student",
        });
    });

    it("PUT /students/:studentId/education/:educationId/status rejects an unknown status", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        Student.findById.mockResolvedValue({ _id: "stu-x" });
        const req = {
            params: { studentId: "stu-x", educationId: STATUS_COURSE_ID },
            body: { status: "Okänd" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it("PUT /students/:studentId/education/:educationId/status handles failures", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        Student.findById.mockRejectedValueOnce(new Error("boom status"));
        const req = {
            params: { studentId: "stu-error", educationId: "edu-err" },
            body: { status: "Pågående" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Server error" });
    });

    describe("GET /students", () => {
        it("returns 403 when teacher profile is missing", async () => {
            const handler = findRouteHandler("/students", "GET");
            UserMock.findOne.mockReturnValue(userLookup(null));

            const req = { user: { role: "teacher", userId: TEACHER_USER_ID } };
            const res = createRes();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: "Teacher profile not found",
            });
        });

        it("returns enriched students and merges course/package entries", async () => {
            const handler = findRouteHandler("/students", "GET");
            UserMock.findOne.mockReturnValue(userLookup({ _id: TEACHER_USER_ID }));
            const studentDoc = {
                _id: "student-1",
                education: [
                    {
                        _id: "pkg-edu",
                        type: "CoursePackage",
                        refId: "pkg-1",
                        name: "Existing Package",
                        startDate: new Date("2025-04-01"),
                        endDate: new Date("2025-06-01"),
                        finalExamDate: new Date("2025-06-01"),
                        status: "active",
                        grade: "A",
                        comments: "notes",
                    },
                ],
            };
            const studentFindQuery = {
                lean: vi.fn().mockResolvedValue([studentDoc]),
            };
            Student.find.mockReturnValue(studentFindQuery);

            const enrollment = {
                _id: "enroll-1",
                studentId: studentDoc._id,
                mainCourseId: { _id: "course-1", courseName: "Demo Course" },
                startDate: new Date("2025-04-01"),
                endDate: new Date("2025-05-01"),
                slutprovDate: new Date("2025-05-01"),
                status: "active",
                grade: "C",
                notes: "note",
                courseInstanceId: "ci-1",
                teacherId: TEACHER_USER_ID,
                createdAt: new Date("2025-03-01"),
            };
            const packageEnrollment = {
                _id: "enroll-2",
                studentId: studentDoc._id,
                coursePackageId: { _id: "pkg-1", coursePackageName: "Full Package" },
                startDate: new Date("2025-04-01"),
                endDate: new Date("2025-06-30"),
                status: "active",
                grade: "B",
                notes: null,
                courseInstanceId: null,
                teacherId: TEACHER_USER_ID,
                createdAt: new Date("2025-03-03"),
            };
            const programEnrollment = {
                _id: "enroll-3",
                studentId: studentDoc._id,
                programId: { _id: "prog-1", programName: "Demo Program" },
                startDate: new Date("2025-01-01"),
                endDate: new Date("2025-02-01"),
                status: "active",
                grade: "A",
                notes: null,
                courseInstanceId: null,
                teacherId: TEACHER_USER_ID,
                createdAt: new Date("2025-01-05"),
            };
            StudentEnrollmentQuery.lean.mockResolvedValue([
                enrollment,
                packageEnrollment,
                programEnrollment,
            ]);
            CoursePackage.findById.mockResolvedValue({
                _id: "pkg-1",
                coursePackageName: "Full Package",
            });

            const req = { user: { role: "teacher", userId: TEACHER_USER_ID } };
        const res = createRes();

        await handler(req, res);

        expect(UserMock.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ _id: TEACHER_USER_ID })
        );
            expect(Student.find).toHaveBeenCalledWith({
                teacherId: TEACHER_USER_ID,
            });
            expect(StudentEnrollmentMock.find).toHaveBeenCalledWith({
                studentId: studentDoc._id,
            });
            expect(res.status).toHaveBeenCalledWith(200);
            const responseStudents = res.json.mock.calls[0][0];
            expect(responseStudents).toHaveLength(1);
            const educationEntries = responseStudents[0].education;
            expect(educationEntries.some((entry) => entry.type === "Course"))
                .toBe(true);
            expect(
                educationEntries.some((entry) => entry.type === "CoursePackage")
            ).toBe(true);
            expect(
                educationEntries.some((entry) => entry.type === "Program")
            ).toBe(true);
        });

        it("filters out enrollments without recognized education references", async () => {
            const handler = findRouteHandler("/students", "GET");
            UserMock.findOne.mockReturnValue(userLookup({ _id: TEACHER_USER_ID }));
            const studentDoc = { _id: "student-null", education: [] };
            Student.find.mockReturnValue({
                lean: vi.fn().mockResolvedValue([studentDoc]),
            });

            StudentEnrollmentQuery.lean.mockResolvedValue([
                {
                    _id: "enroll-course",
                    studentId: studentDoc._id,
                    mainCourseId: {
                        _id: "course-1",
                        courseName: "Demo Course",
                    },
                    startDate: new Date("2025-04-01"),
                    endDate: new Date("2025-05-01"),
                    status: "active",
                    grade: "C",
                    courseInstanceId: "ci-1",
                    teacherId: TEACHER_USER_ID,
                    createdAt: new Date("2025-03-01"),
                },
                {
                    _id: "enroll-unknown",
                    studentId: studentDoc._id,
                    startDate: new Date("2025-04-01"),
                    endDate: new Date("2025-05-01"),
                    status: "active",
                    createdAt: new Date("2025-03-01"),
                },
            ]);

            const res = createRes();
            await handler({ user: { role: "teacher", userId: TEACHER_USER_ID } }, res);

            const responseStudents = res.json.mock.calls[0][0];
            expect(responseStudents).toHaveLength(1);
            expect(responseStudents[0].education.every(Boolean)).toBe(true);
            expect(
                responseStudents[0].education.some(
                    (entry) => entry._id === "enroll-unknown"
                )
            ).toBe(false);
        });

        it("handles Student.find errors gracefully", async () => {
            const handler = findRouteHandler("/students", "GET");
            UserMock.findOne.mockReturnValue(userLookup({ _id: TEACHER_USER_ID }));
            Student.find.mockReturnValue({
                lean: vi.fn().mockRejectedValue(new Error("boom")),
            });

            const req = { user: { role: "teacher", userId: TEACHER_USER_ID } };
            const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });

        it("synthesizes a course package when enrollments reference packages but no package entries exist yet", async () => {
        const handler = findRouteHandler("/students", "GET");
        UserMock.findOne.mockReturnValue(userLookup({ _id: TEACHER_USER_ID }));
        const studentDoc = { _id: "student-synth", education: [] };
        const studentFindQuery = {
            lean: vi.fn().mockResolvedValue([studentDoc]),
        };
        Student.find.mockReturnValue(studentFindQuery);
        const enrollmentWithPackage = {
            _id: "enroll-package",
            studentId: studentDoc._id,
            mainCourseId: { _id: "course-new", courseName: "New Course" },
            coursePackageId: { _id: "pkg-synth", coursePackageName: "Synth Package" },
            startDate: new Date("2025-05-01"),
            endDate: new Date("2025-06-01"),
            status: "active",
            grade: "B",
            notes: "package notes",
            courseInstanceId: null,
            teacherId: TEACHER_USER_ID,
            createdAt: new Date("2025-04-01"),
        };
        StudentEnrollmentQuery.lean.mockResolvedValue([enrollmentWithPackage]);
        CoursePackage.findById.mockImplementation(() => ({
            lean: vi.fn().mockResolvedValue({
                _id: "pkg-synth",
                coursePackageName: "Synth Package",
            }),
        }));

        const res = createRes();
        await handler({ user: { role: "teacher", userId: TEACHER_USER_ID } }, res);

        expect(CoursePackage.findById).toHaveBeenCalledWith("pkg-synth");
        const responseStudents = res.json.mock.calls[0][0];
        const packageEntries = responseStudents[0].education.filter(
            (entry) => entry.type === "CoursePackage"
        );
        expect(packageEntries).toHaveLength(1);
        expect(packageEntries[0].name).toBe("Synth Package");
    });

    it("dedupes CoursePackage entries by refId so APL dates follow enrollment dates", async () => {
        const handler = findRouteHandler("/students", "GET");
        UserMock.findOne.mockReturnValue(userLookup({ _id: TEACHER_USER_ID }));
        const studentDoc = {
            _id: "student-apl",
            education: [
                {
                    _id: "pkg-edu-stale",
                    type: "CoursePackage",
                    refId: "pkg-apl",
                    name: "APL Package",
                    startDate: new Date("2025-04-01"),
                    endDate: new Date("2025-06-01"),
                    finalExamDate: new Date("2025-06-01"),
                    status: "active",
                },
            ],
        };
        Student.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([studentDoc]),
        });
        const packageEnrollment = {
            _id: "enroll-apl",
            studentId: studentDoc._id,
            coursePackageId: { _id: "pkg-apl", coursePackageName: "APL Package" },
            startDate: new Date("2025-04-01"),
            endDate: new Date("2025-07-15"),
            status: "active",
            grade: null,
            notes: null,
            courseInstanceId: null,
            teacherId: TEACHER_USER_ID,
            createdAt: new Date("2025-03-01"),
        };
        StudentEnrollmentQuery.lean.mockResolvedValue([packageEnrollment]);

        const res = createRes();
        await handler({ user: { role: "teacher", userId: TEACHER_USER_ID } }, res);

        const responseStudents = res.json.mock.calls[0][0];
        const packageEntries = responseStudents[0].education.filter(
            (entry) => entry.type === "CoursePackage"
        );
        expect(packageEntries).toHaveLength(1);
        expect(new Date(packageEntries[0].endDate).toISOString()).toBe(
            new Date("2025-07-15").toISOString()
        );
    });

    it("auto-sets APL status to RED when the APL period ends within 3 weeks", async () => {
        const handler = findRouteHandler("/students", "GET");
        UserMock.findOne.mockReturnValue(userLookup({ _id: TEACHER_USER_ID }));
        const soon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const studentDoc = {
            _id: "student-auto-red",
            aplStatus: "GRAY",
        };
        Student.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([studentDoc]),
        });
        // #103: the APL period is the span of the package's course enrollments.
        StudentEnrollmentQuery.lean.mockResolvedValue([
            {
                _id: "enr-pkg-soon",
                studentId: "student-auto-red",
                mainCourseId: { _id: "course-pkg-soon", courseName: "APL-kurs" },
                coursePackageId: "pkg-soon",
                startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate: soon,
                status: "active",
            },
        ]);

        const res = createRes();
        await handler({ user: { role: "teacher", userId: TEACHER_USER_ID } }, res);

        const responseStudents = res.json.mock.calls[0][0];
        expect(responseStudents[0].aplStatus).toBe("RED");
        expect(responseStudents[0].aplStatusStored).toBe("GRAY");
        expect(responseStudents[0].aplStatusAuto).toBe(true);
        expect(responseStudents[0].aplWeeksRemaining).toBe(2);
        expect(new Date(responseStudents[0].aplEndDate).getTime()).toBe(
            soon.getTime()
        );
    });

    it("keeps the stored APL status when the APL period is far in the future", async () => {
        const handler = findRouteHandler("/students", "GET");
        UserMock.findOne.mockReturnValue(userLookup({ _id: TEACHER_USER_ID }));
        const studentDoc = {
            _id: "student-not-red",
            aplStatus: "YELLOW",
        };
        Student.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([studentDoc]),
        });
        // #103: the APL period is the span of the package's course enrollments.
        StudentEnrollmentQuery.lean.mockResolvedValue([
            {
                _id: "enr-pkg-far",
                studentId: "student-not-red",
                mainCourseId: { _id: "course-pkg-far", courseName: "APL-kurs" },
                coursePackageId: "pkg-far",
                startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                endDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
                status: "active",
            },
        ]);

        const res = createRes();
        await handler({ user: { role: "teacher", userId: TEACHER_USER_ID } }, res);

        const responseStudents = res.json.mock.calls[0][0];
        expect(responseStudents[0].aplStatus).toBe("YELLOW");
        expect(responseStudents[0].aplStatusStored).toBe("YELLOW");
        expect(responseStudents[0].aplStatusAuto).toBe(false);
    });

});

});
describe("POST /student", () => {
    it("returns 400 when required fields missing", async () => {
        const handler = findRouteHandler("/student", "POST");
        const req = { body: { name: "Test" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Missing required fields",
        });
        expect(Student).not.toHaveBeenCalled();
    });

    it("fires the Lärteamet email exactly once for a new Sollentuna student", async () => {
        const handler = findRouteHandler("/student", "POST");
        const req = {
            body: {
                name: "Sollentuna Student",
                email: "sollentuna@example.com",
                personalNumber: "20010101-1111",
                municipality: "Sollentuna",
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(maybeSendLarteametEmail).toHaveBeenCalledTimes(1);
        expect(maybeSendLarteametEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                student: expect.objectContaining({
                    name: "Sollentuna Student",
                    email: "sollentuna@example.com",
                    municipality: { type: "Sollentuna" },
                }),
            })
        );
    });

    it("does not fire the Lärteamet email for a non-Sollentuna student", async () => {
        const handler = findRouteHandler("/student", "POST");
        const req = {
            body: {
                name: "Solna Student",
                email: "solna@example.com",
                personalNumber: "20010101-2222",
                municipality: "Solna",
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(maybeSendLarteametEmail).not.toHaveBeenCalled();
    });

    it("does not re-fire the Lärteamet email when an existing student is re-registered", async () => {
        const handler = findRouteHandler("/student", "POST");
        const existing = {
            _id: "existing-larteamet",
            name: "Returning",
            email: "returning@example.com",
            personalNumber: "19990101-1111",
            save: vi.fn().mockImplementation(function () {
                return Promise.resolve(this);
            }),
            toObject: vi.fn().mockImplementation(function () {
                return { ...this };
            }),
        };
        Student.findOne.mockResolvedValue(existing);

        const req = {
            body: {
                name: "Returning",
                email: "returning@example.com",
                personalNumber: "19990101-1111",
                municipality: "Sollentuna",
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ alreadyExists: true })
        );
        expect(maybeSendLarteametEmail).not.toHaveBeenCalled();
    });

    it("creates a student and processes education when provided", async () => {
        const handler = findRouteHandler("/student", "POST");
        const req = {
            body: {
                _id: "student-123",
                name: "New Student",
                email: "test@example.com",
                personalNumber: "20000101-0000",
                education: [{ type: "Course", refId: "course-1" }],
                createdBy: "creator-1",
            },
        };
        const res = createRes();

        CourseMatchingServiceMock.default.processStudentEducation.mockResolvedValue(
            { enrollments: [] }
        );

        await handler(req, res);

        expect(Student).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "New Student",
                email: "test@example.com",
                personalNumber: "20000101-0000",
                createdBy: "creator-1",
            })
        );
        // #103: the request's education is placement input, never stored.
        expect(Student.mock.calls[0][0].education).toBeUndefined();
        expect(CourseMatchingServiceMock.default.processStudentEducation).toHaveBeenCalledWith(
            expect.any(String),
            req.body.education,
            "creator-1",
            { needsSupport: undefined, examMode: undefined, pace: 100 }
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "New Student",
            })
        );
    });

    it("attempts calendar sync when finalExamDate is set and ignores sync failures", async () => {
        const handler = findRouteHandler("/student", "POST");
        const req = {
            body: {
                _id: "student-789",
                name: "Calendar Student",
                email: "calendar@example.com",
                personalNumber: "20000101-0003",
                finalExamDate: "2025-06-01",
            },
        };
        const res = createRes();

        calendarEventSyncMock.syncCalendarEventsForStudent.mockRejectedValueOnce(
            new Error("sync failed")
        );

        await handler(req, res);

        expect(calendarEventSyncMock.syncCalendarEventsForStudent).toHaveBeenCalledWith(
            expect.any(String)
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Calendar Student" })
        );
    });

    it("ignores course creation failures and still returns student", async () => {
        const handler = findRouteHandler("/student", "POST");
        const req = {
            body: {
                _id: "student-456",
                name: "Another Student",
                email: "ignore@example.com",
                personalNumber: "19990101-0000",
                education: [{ type: "Course", refId: "course-2" }],
            },
        };
        const res = createRes();

        CourseMatchingServiceMock.default.processStudentEducation.mockRejectedValue(
            new Error("Enrollment failed")
        );

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Another Student",
            })
        );
        expect(CourseMatchingServiceMock.default.processStudentEducation).toHaveBeenCalled();
    });

    it("returns 500 when student creation fails unexpectedly", async () => {
        const handler = findRouteHandler("/student", "POST");
        const failingSave = vi.fn().mockRejectedValue(new Error("boom save"));
        Student.mockImplementationOnce(function (doc) {
            Object.assign(this, doc);
            this.save = failingSave;
        });
        const req = {
            body: {
                name: "Failed",
                email: "fail@example.com",
                personalNumber: "20000101-0002",
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to add student" });
    });

    it("auto-fills an existing student by personalNumber and returns alreadyExists", async () => {
        const handler = findRouteHandler("/student", "POST");
        const existing = {
            _id: "existing-1",
            name: "Old Name",
            email: "old@example.com",
            personalNumber: "20000101-0000",
            dropout: true,
            save: vi.fn().mockImplementation(function () {
                return Promise.resolve(this);
            }),
            toObject: vi.fn().mockImplementation(function () {
                return { ...this };
            }),
        };
        Student.findOne.mockResolvedValue(existing);

        const req = {
            body: {
                name: "New Name",
                email: "new@example.com",
                personalNumber: "20000101-0000",
                dropout: false,
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(Student).not.toHaveBeenCalled();
        expect(existing.name).toBe("New Name");
        expect(existing.email).toBe("new@example.com");
        expect(existing.dropout).toBe(false);
        expect(existing.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                alreadyExists: true,
                name: "New Name",
                email: "new@example.com",
            })
        );
    });

    it("matches an existing student by email when personalNumber differs", async () => {
        const handler = findRouteHandler("/student", "POST");
        const existing = {
            _id: "existing-3",
            name: "Same Email",
            email: "same@example.com",
            personalNumber: "19880101-0000",
            save: vi.fn().mockImplementation(function () {
                return Promise.resolve(this);
            }),
            toObject: vi.fn().mockImplementation(function () {
                return { ...this };
            }),
        };
        Student.findOne.mockResolvedValue(existing);

        const req = {
            body: {
                name: "Same Email",
                email: "same@example.com",
                personalNumber: "20000101-0000",
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(Student).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ alreadyExists: true })
        );
    });

    it("registers new courses on the existing student via education entries", async () => {
        const handler = findRouteHandler("/student", "POST");
        const existing = {
            _id: "existing-2",
            name: "Returning Student",
            email: "ret@example.com",
            personalNumber: "19900101-0000",
            save: vi.fn().mockImplementation(function () {
                return Promise.resolve(this);
            }),
            toObject: vi.fn().mockImplementation(function () {
                return { ...this };
            }),
        };
        Student.findOne.mockResolvedValue(existing);
        CourseMatchingServiceMock.default.processStudentEducation.mockResolvedValue(
            { enrollments: [] }
        );

        const req = {
            body: {
                name: "Returning Student",
                email: "ret@example.com",
                personalNumber: "19900101-0000",
                education: [{ type: "Course", refId: "course-1" }],
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(CourseMatchingServiceMock.default.processStudentEducation).toHaveBeenCalledWith(
            "existing-2",
            req.body.education,
            null,
            { needsSupport: undefined, examMode: undefined, pace: 100 }
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ alreadyExists: true })
        );
    });
});

describe("POST /student/:studentId/addcourse", () => {
    it("returns 404 when student does not exist", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/addcourse",
            "POST"
        );
        Student.findById.mockResolvedValue(null);
        const req = { params: { studentId: "stu-1" }, body: { courseId: "course-1" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("returns 404 when course missing", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/addcourse",
            "POST"
        );
        const studentDoc = {
            _id: "stu-2",
            education: [],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        Course.findById.mockResolvedValue(null);

        const req = {
            params: { studentId: "stu-2" },
            body: { courseId: "course-12" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course not found" });
    });

    it("returns 400 when the student is already enrolled in the course", async () => {
        const handler = findRouteHandler("/student/:studentId/addcourse", "POST");
        Student.findById.mockResolvedValue({ _id: "stu-3", pace: 100 });
        Course.findById.mockResolvedValue({ _id: "course-1", courseCode: "SVESVE01", courseExtent: "10" });
        StudentEnrollmentMock.exists.mockResolvedValue({ _id: "enr-existing" });

        const res = createRes();
        await handler({ params: { studentId: "stu-3" }, body: { courseId: "course-1" } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Course already exists" });
        expect(CourseMatchingServiceMock.default.processStudentEducation).not.toHaveBeenCalled();
    });

    it("returns server error while adding course", async () => {
        const handler = findRouteHandler("/student/:studentId/addcourse", "POST");
        Student.findById.mockResolvedValue({ _id: "stu-4", pace: 100 });
        Course.findById.mockResolvedValue({ _id: "course-5", courseCode: "EXTRA01", courseExtent: "5" });
        StudentEnrollmentMock.exists.mockResolvedValue(null);
        CourseMatchingServiceMock.default.processStudentEducation.mockRejectedValueOnce(new Error("boom"));

        const res = createRes();
        await handler({ params: { studentId: "stu-4" }, body: { courseId: "course-5" } }, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });

    it("places the student on the course through the placement path (#103)", async () => {
        const handler = findRouteHandler("/student/:studentId/addcourse", "POST");
        Student.findById.mockResolvedValue({ _id: "stu-5", pace: 50 });
        Course.findById.mockResolvedValue({ _id: "course-5", courseCode: "FILL01", courseExtent: "10" });
        StudentEnrollmentMock.exists.mockResolvedValue(null);
        CourseMatchingServiceMock.default.processStudentEducation.mockResolvedValueOnce({
            enrollments: [{ _id: "enr-new" }],
            errors: [],
        });

        const res = createRes();
        await handler(
            { params: { studentId: "stu-5" }, body: { courseId: "course-5", startDate: "2026-01-12" }, user: { userId: "admin-1" } },
            res
        );

        const [studentId, entries, userId, options] =
            CourseMatchingServiceMock.default.processStudentEducation.mock.calls[0];
        expect(studentId).toBe("stu-5");
        expect(entries).toEqual([
            expect.objectContaining({ type: "Course", refId: "course-5", startDate: new Date("2026-01-12") }),
        ]);
        // 10 weeks from the start date.
        expect(entries[0].endDate.getTime() - entries[0].startDate.getTime()).toBe(70 * 24 * 60 * 60 * 1000);
        expect(userId).toBe("admin-1");
        expect(options).toEqual({ pace: 50 });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ _id: "stu-5", enrollments: [{ _id: "enr-new" }] });
    });

    it("returns 422 when the course could not be placed", async () => {
        const handler = findRouteHandler("/student/:studentId/addcourse", "POST");
        Student.findById.mockResolvedValue({ _id: "stu-6", pace: 100 });
        Course.findById.mockResolvedValue({ _id: "course-6", courseCode: "NOPE01", courseExtent: "5" });
        StudentEnrollmentMock.exists.mockResolvedValue(null);
        CourseMatchingServiceMock.default.processStudentEducation.mockResolvedValueOnce({ enrollments: [], errors: [{ type: "no_course" }] });

        const res = createRes();
        await handler({ params: { studentId: "stu-6" }, body: { courseId: "course-6" } }, res);

        expect(res.status).toHaveBeenCalledWith(422);
    });
});

describe("POST /student/:studentId/setprogram", () => {
    it("returns 404 if student missing", async () => {
        const handler = findRouteHandler("/student/:studentId/setprogram", "POST");
        Student.findById.mockResolvedValue(null);
        const req = { params: { studentId: "stu-5" }, body: { programId: "prog-1" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("sets program and returns student", async () => {
        const handler = findRouteHandler("/student/:studentId/setprogram", "POST");
        const studentDoc = {
            _id: "stu-6",
            program: null,
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = {
            params: { studentId: "stu-6" },
            body: { programId: "prog-2" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.program).toEqual({ programId: "prog-2", grade: null });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });

    it("returns 500 when setprogram lookup fails", async () => {
        const handler = findRouteHandler("/student/:studentId/setprogram", "POST");
        Student.findById.mockRejectedValueOnce(new Error("boom setprogram"));
        const req = { params: { studentId: "stu-500" }, body: { programId: "prog-err" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });
});

describe("POST /student/:studentId/addcoursepackage", () => {
    it("returns 404 when student not found", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/addcoursepackage",
            "POST"
        );
        Student.findById.mockResolvedValue(null);
        const req = { params: { studentId: "stu-7" }, body: { coursePackageId: "pkg-1" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("appends package and persists student", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/addcoursepackage",
            "POST"
        );
        const studentDoc = {
            _id: "stu-8",
            coursePackages: [],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = {
            params: { studentId: "stu-8" },
            body: { coursePackageId: "pkg-2" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.coursePackages).toEqual([{ coursePackageId: "pkg-2", grade: null }]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });

    it("returns 500 if saving the package fails", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/addcoursepackage",
            "POST"
        );
        const studentDoc = {
            _id: "stu-8",
            coursePackages: [],
            save: vi.fn().mockRejectedValueOnce(new Error("boom package")),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = {
            params: { studentId: "stu-8" },
            body: { coursePackageId: "pkg-3" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });
});

describe("DELETE /student/:id/courses/:courseId", () => {
    it("returns 404 when student missing", async () => {
        const handler = findRouteHandler(
            "/student/:id/courses/:courseId",
            "DELETE"
        );
        Student.findById.mockResolvedValue(null);
        const req = { params: { id: "stu-x", courseId: "course-x" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("removes course and returns success message", async () => {
        const handler = findRouteHandler(
            "/student/:id/courses/:courseId",
            "DELETE"
        );
        const studentDoc = {
            _id: "stu-9",
            courses: [{ courseId: "course-55" }, { courseId: "course-66" }],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = { params: { id: "stu-9", courseId: "course-55" } };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.courses).toEqual([{ courseId: "course-66" }]);
        expect(res.json).toHaveBeenCalledWith({
            message: "Course removed successfully",
        });
    });

    it("returns 500 when saving after course removal fails", async () => {
        const handler = findRouteHandler(
            "/student/:id/courses/:courseId",
            "DELETE"
        );
        const studentDoc = {
            _id: "stu-error",
            courses: [{ courseId: "course-99" }],
            save: vi.fn().mockRejectedValueOnce(new Error("boom save")),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = { params: { id: "stu-error", courseId: "course-99" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to remove course." });
    });
});

describe("GET /student/:id", () => {
    it("returns 404 when student missing", async () => {
        const handler = findRouteHandler("/student/:id", "GET");
        const selectChain = createSelectChain(null);
        Student.findById.mockReturnValue(selectChain);

        const req = { params: { id: "student-missing" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("fetches student with details", async () => {
        const handler = findRouteHandler("/student/:id", "GET");
        const studentDoc = { _id: "stu-11", name: "Detail" };
        const selectChain = createSelectChain(studentDoc);
        Student.findById.mockReturnValue(selectChain);

        const req = { params: { id: "stu-11" }, user: { role: "admin" } };
        const res = createRes();

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });

    it("returns 500 when fetching student throws", async () => {
        const handler = findRouteHandler("/student/:id", "GET");
        Student.findById.mockRejectedValueOnce(new Error("boom fetch"));

        const req = { params: { id: "stu-error" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch student details" });
    });
});

describe("GET /student/:id/basic", () => {
    it("returns the basic student data", async () => {
        const handler = findRouteHandler("/student/:id/basic", "GET");
        const studentDoc = { _id: "basic-1", personalNumber: "20010101-0001" };
        const selectChain = createSelectChain(studentDoc);
        Student.findById.mockReturnValue(selectChain);

        const req = { params: { id: "basic-1" }, user: { role: "admin" } };
        const res = createRes();

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });
});

describe("DELETE /student/:id", () => {
    it("returns 404 if student not found", async () => {
        const handler = findRouteHandler("/student/:id", "DELETE");
        Student.findByIdAndDelete.mockResolvedValue(null);
        const req = { params: { id: "delete-1" }, user: { role: "admin" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("deletes student successfully", async () => {
        const handler = findRouteHandler("/student/:id", "DELETE");
        Student.findByIdAndDelete.mockResolvedValue({ _id: "delete-2" });
        const req = { params: { id: "delete-2" }, user: { role: "admin" } };
        const res = createRes();

        await handler(req, res);

        expect(AplRecord.deleteMany).toHaveBeenCalledWith({ studentId: "delete-2" });
        expect(res.json).toHaveBeenCalledWith({
            message: "Student deleted successfully",
            deletedFilesCount: 0,
        });
    });

    it("returns 500 when deletion fails unexpectedly", async () => {
        const handler = findRouteHandler("/student/:id", "DELETE");
        Student.findByIdAndDelete.mockRejectedValueOnce(new Error("boom delete"));
        const req = { params: { id: "delete-3" }, user: { role: "admin" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to delete student" });
    });
});

describe("DELETE /students", () => {
    it("requires an explicit confirmation token before clearing all students", async () => {
        const handler = findRouteHandler("/students", "DELETE");
        Student.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        const res = createRes();

        await handler({ params: {}, body: {}, user: { role: "admin" } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(Student.deleteMany).not.toHaveBeenCalled();
    });

    it("clears all students when confirmation token is supplied", async () => {
        const handler = findRouteHandler("/students", "DELETE");
        Student.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        const res = createRes();

        await handler(
            { params: {}, body: { confirm: "DELETE ALL STUDENTS" }, user: { role: "admin" } },
            res
        );

        expect(Student.deleteMany).toHaveBeenCalled();
        expect(AplRecord.deleteMany).toHaveBeenCalledWith({});
        expect(res.json).toHaveBeenCalledWith({
            message: "All students deleted successfully",
            deletedStudents: 0,
            deletedFilesCount: 0,
            deletedAplRecords: 0,
        });
    });
    it("handles delete all failures", async () => {
        const handler = findRouteHandler("/students", "DELETE");
        Student.deleteMany.mockRejectedValueOnce(new Error("boom all"));
        const res = createRes();

        await handler(
            { params: {}, body: { confirm: "DELETE ALL STUDENTS" }, user: { role: "admin" } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Failed to delete all students",
        });
    });
});

describe("GET /student/:id/basic", () => {
    it("returns 404 when student missing", async () => {
        const handler = findRouteHandler("/student/:id/basic", "GET");
        const selectChain = createSelectChain(null);
        Student.findById.mockReturnValueOnce(selectChain);
        const res = createRes();

        await handler({ params: { id: "basic-1" } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("returns 500 when findById throws", async () => {
        const handler = findRouteHandler("/student/:id/basic", "GET");
        const selectChain = {
            select: vi.fn(),
            lean: vi.fn().mockRejectedValueOnce(new Error("boom basic")),
        };
        selectChain.select.mockReturnValue(selectChain);
        Student.findById.mockReturnValueOnce(selectChain);
        const res = createRes();

        await handler({ params: { id: "basic-2" } }, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Failed to fetch basic student details",
        });
    });
});

describe("PATCH /students/:id", () => {
    it("returns 404 when student missing", async () => {
        const handler = findRouteHandler("/students/:id", "PATCH");
        Student.findById.mockResolvedValue(null);
        const req = { params: { id: "patch-1" }, body: {} };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("rejects invalid aplStatus updates", async () => {
        const handler = findRouteHandler("/students/:id", "PATCH");
        const studentDoc = {
            _id: "patch-2",
            aplStatusHistory: [],
            save: vi.fn(),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const req = { params: { id: "patch-2" }, body: { aplStatus: null } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid APL status update" });
    });

    it("rejects an invalid aplStatus", async () => {
        const handler = findRouteHandler("/students/:id", "PATCH");
        const studentDoc = {
            _id: "patch-3",
            aplStatusHistory: [],
        };
        Student.findById.mockResolvedValue(studentDoc);
        updateAplStatusMock.mockRejectedValueOnce(
            Object.assign(new Error("Invalid APL status"), { statusCode: 400 })
        );
        const req = {
            params: { id: "patch-3" },
            body: { aplStatus: "INVALID" },
            user: { userId: "user-patch" },
        };
        const res = createRes();

        await handler(req, res);

        expect(updateAplStatusMock).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid APL status" });
    });

    it("updates aplStatus when valid data provided", async () => {
        const handler = findRouteHandler("/students/:id", "PATCH");
        const studentDoc = {
            _id: "patch-ok",
            aplStatusHistory: [],
            save: vi.fn().mockResolvedValue(true),
        };
        Student.findById.mockResolvedValue(studentDoc);
        updateAplStatusMock.mockImplementationOnce(async ({ studentDocument, status }) => {
            studentDocument.aplStatus = status;
            studentDocument.aplStatusHistory.push({ status });
            return { student: studentDocument };
        });
        const res = createRes();

        await handler(
            {
                params: { id: "patch-ok" },
                body: { aplStatus: "BLUE" },
                user: { userId: "user-ok" },
            },
            res
        );

        expect(studentDoc.aplStatus).toBe("BLUE");
        expect(studentDoc.aplStatusHistory).toHaveLength(1);
        expect(updateAplStatusMock).toHaveBeenCalledWith({
            studentId: "patch-ok",
            status: "BLUE",
            userId: "user-ok",
            studentDocument: studentDoc,
            manualOverride: true,
        });
        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });

});

describe("POST /students/:id/comment", () => {
    it("returns 403 if user lacks permissions", async () => {
        const handler = findRouteHandler("/students/:id/comment", "POST");
        const req = { params: { id: "cmt-1" }, body: { comment: "Hi" }, user: { role: "student" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "Insufficient permissions to comment.",
        });
    });

    it("adds a comment when permitted", async () => {
        const handler = findRouteHandler("/students/:id/comment", "POST");
        const studentDoc = {
            _id: "cmt-2",
            commentHistory: [],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const req = {
            params: { id: "cmt-2" },
            body: { comment: "Hello" },
            user: { role: "teacher", userId: "user-3", name: "Teacher A" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.commentHistory).toHaveLength(1);
        expect(studentDoc.commentHistory[0].author).toBe("Teacher A");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            commentHistory: studentDoc.commentHistory,
        });
    });

    it("returns 404 when student is missing while adding comment", async () => {
        const handler = findRouteHandler("/students/:id/comment", "POST");
        Student.findById.mockResolvedValue(null);
        const req = {
            params: { id: "cmt-missing" },
            body: { comment: "Hello" },
            user: { role: "teacher", userId: "user-3", name: "Teacher A" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("returns 500 when fetching student for comment fails", async () => {
        const handler = findRouteHandler("/students/:id/comment", "POST");
        Student.findById.mockRejectedValueOnce(new Error("boom comment"));
        const req = {
            params: { id: "cmt-error" },
            body: { comment: "Oops" },
            user: { role: "teacher", userId: "user-4", name: "Teacher B" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to add comment" });
    });
});

describe("PUT /students/:id/comment", () => {
    it("denies non-admin roles", async () => {
        const handler = findRouteHandler("/students/:id/comment", "PUT");
        const req = {
            params: { id: "comm-1" },
            body: { index: 0, updatedEntry: {} },
            user: { role: "teacher" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "You don't have permission to edit comments.",
        });
    });

    it("returns 404 when comment entry is missing for edit", async () => {
        const handler = findRouteHandler("/students/:id/comment", "PUT");
        Student.findById.mockResolvedValue({ commentHistory: [] });
        const req = {
            params: { id: "comm-missing" },
            body: { index: 0, updatedEntry: { text: "new" } },
            user: { role: "admin" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Comment not found." });
    });

    it("updates comment history for admin", async () => {
        const handler = findRouteHandler("/students/:id/comment", "PUT");
        const studentDoc = {
            _id: "comm-2",
            commentHistory: [{ text: "old" }],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const req = {
            params: { id: "comm-2" },
            body: { index: 0, updatedEntry: { text: "new" } },
            user: { role: "admin" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.commentHistory[0]).toEqual({ text: "new" });
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });
});

describe("DELETE /students/:id/comment", () => {
    it("denies delete for unauthorized users", async () => {
        const handler = findRouteHandler("/students/:id/comment", "DELETE");
        const req = {
            params: { id: "comm-3" },
            body: { index: 0 },
            user: { role: "teacher" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: "You don't have permission to delete comments.",
        });
    });

    it("removes comment when permitted", async () => {
        const handler = findRouteHandler("/students/:id/comment", "DELETE");
        const studentDoc = {
            _id: "comm-4",
            commentHistory: [{ text: "keep" }, { text: "remove" }],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const req = {
            params: { id: "comm-4" },
            body: { index: 1 },
            user: { role: "systemadmin" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.commentHistory).toHaveLength(1);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("returns 404 when the comment index does not exist", async () => {
        const handler = findRouteHandler("/students/:id/comment", "DELETE");
        Student.findById.mockResolvedValue({ commentHistory: [] });
        const req = {
            params: { id: "comm-miss" },
            body: { index: 5 },
            user: { role: "admin" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Comment not found." });
    });
});

describe("PUT /student/:id", () => {
    it("syncs a staff-selected APL status to the shared status service", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const student = {
            _id: "put-apl",
            aplStatus: "GRAY",
            teacherId: "teacher-1",
            education: [],
        };
        const updatedStudent = {
            ...student,
            toObject: () => ({ ...updatedStudent }),
        };
        Student.findById.mockResolvedValue(student);
        Student.findByIdAndUpdate.mockResolvedValue(updatedStudent);
        StudentEnrollmentQuery.sort.mockResolvedValueOnce([]);
        updateAplStatusMock.mockImplementationOnce(async ({ studentDocument, status }) => {
            studentDocument.aplStatus = status;
            return { student: studentDocument };
        });

        const res = createRes();
        await handler(
            {
                params: { id: "put-apl" },
                body: { aplStatus: "BLUE" },
                user: { userId: "staff-user" },
            },
            res
        );

        expect(updateAplStatusMock).toHaveBeenCalledWith({
            studentId: "put-apl",
            status: "BLUE",
            userId: "staff-user",
            studentDocument: updatedStudent,
            manualOverride: true,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ aplStatus: "BLUE" })
        );
    });

    it("returns 404 when student missing", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        Student.findById.mockResolvedValue(null);
        const req = { params: { id: "put-1" }, body: {} };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("logs and returns server error when updating student", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-2",
            teacher: "New Teacher",
            teacherId: null,
            education: [],
        };
        Student.findById.mockResolvedValue(studentDoc);
        UserMock.findOne.mockReturnValue(userLookup({ _id: "teacher-new" }));
        const existingEnrollment = {
            _id: "en-1",
            grade: "F",
            status: "inactive",
            startDate: null,
            endDate: null,
            notes: null,
            slutprovDate: null,
            save: vi.fn().mockResolvedValue(undefined),
        };
        StudentEnrollmentMock.findOne.mockResolvedValue(existingEnrollment);
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        StudentEnrollmentQuery.lean.mockResolvedValue([]);
        const req = {
            params: { id: "put-2" },
            body: {
                name: "Updated Name",
                municipality: { type: "city2" },
                education: [
                    {
                        type: "Course",
                        refId: { _id: "course-7" },
                        name: "Course 7",
                        grade: "A",
                        status: "active",
                        startDate: "2023-07-01",
                        endDate: "2023-08-01",
                        comments: "notes",
                        finalExamDate: "2023-08-01",
                    },
                ],
            },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update student" });
    });

    it("links a teacher when only a teacher name is provided", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-teacher",
            teacher: "Linked Teacher",
            teacherId: null,
            education: [],
        };
        Student.findById.mockResolvedValue(studentDoc);
        UserMock.findOne.mockReturnValue(userLookup({ _id: "teacher-linked" }));
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        StudentEnrollmentQuery.lean.mockResolvedValue([]);

        const res = createRes();
        await handler(
            { params: { id: "put-teacher" }, body: { name: "Updated Student" } },
            res
        );

        expect(UserMock.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                $or: [{ name: "Linked Teacher" }, { username: "Linked Teacher" }],
            })
        );
        expect(Student.findByIdAndUpdate).toHaveBeenCalledWith(
            "put-teacher",
            expect.objectContaining({
                $set: expect.objectContaining({
                    teacherId: "teacher-linked",
                }),
            }),
            { returnDocument: 'after' }
        );
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update student" });
    });

    it("returns 404 when the updated student cannot be found", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-404",
            education: [],
        };
        Student.findById.mockResolvedValue(studentDoc);
        Student.findByIdAndUpdate.mockResolvedValue(null);
        StudentEnrollmentQuery.lean.mockResolvedValue([]);

        const res = createRes();
        await handler(
            { params: { id: "put-404" }, body: { name: "Ghost" } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("deletes enrollments when education entry is flagged removed", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-remove",
            teacher: "Teacher Rem",
            teacherId: null,
            education: [],
            toObject() {
                return { _id: this._id };
            },
        };
        Student.findById.mockResolvedValue(studentDoc);
        const enrollment = { _id: "enroll-remove", mainCourseId: "course-rem" };
        StudentEnrollmentMock.find
            .mockReturnValueOnce([enrollment])
            .mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockResolvedValue([]),
            });
        StudentEnrollmentMock.findByIdAndDelete.mockResolvedValue(enrollment);
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        UserMock.findOne.mockReturnValue(userLookup(null));

        const res = createRes();
        await handler(
            {
                params: { id: "put-remove" },
                body: {
                    education: [
                        {
                            type: "Course",
                            refId: "course-rem",
                            name: "Course Rem",
                            removedAt: new Date(),
                        },
                    ],
                },
            },
            res
        );

        expect(StudentEnrollmentMock.findByIdAndDelete).toHaveBeenCalledWith("enroll-remove");
        expect(CourseMatchingServiceMock.default.processStudentEducation).not.toHaveBeenCalled();
    });

    it.each([
        {
            scenario: "the course dates change",
            existingInstanceId: "instance-old",
            currentStartDate: "2024-01-01",
            currentEndDate: "2024-01-31",
            startDate: "2024-02-01",
            endDate: "2024-02-29",
        },
        {
            scenario: "the enrollment has no instance",
            existingInstanceId: null,
            currentStartDate: "2024-02-01",
            currentEndDate: "2024-02-29",
            startDate: "2024-02-01",
            endDate: "2024-02-29",
        },
    ])("uses a matching course instance when $scenario", async ({
        existingInstanceId,
        currentStartDate,
        currentEndDate,
        startDate,
        endDate,
    }) => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-edit-dates",
            teacherId: "teacher-1",
            education: [],
            toObject() {
                return { _id: this._id };
            },
        };
        const enrollment = {
            _id: "enrollment-1",
            mainCourseId: "course-1",
            courseInstanceId: existingInstanceId,
            startDate: new Date(currentStartDate),
            endDate: new Date(currentEndDate),
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        StudentEnrollmentMock.find
            .mockReturnValueOnce([enrollment])
            .mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockResolvedValue([]),
            });
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        CourseMatchingServiceMock.default.findOrCreateCourseInstance.mockResolvedValue({
            instance: { _id: "instance-new" },
        });

        const res = createRes();
        await handler(
            {
                params: { id: "put-edit-dates" },
                body: {
                    education: [
                        {
                            type: "Course",
                            refId: "course-1",
                            enrollmentId: "enrollment-1",
                            courseInstanceId: existingInstanceId,
                            startDate,
                            endDate,
                        },
                    ],
                },
                user: { userId: "admin-1" },
            },
            res
        );

        expect(CourseMatchingServiceMock.default.findOrCreateCourseInstance).toHaveBeenCalledWith(
            "course-1",
            new Date(startDate),
            new Date(endDate),
            "admin-1",
            "teacher-1",
            null
        );
        expect(enrollment.courseInstanceId).toBe("instance-new");
        expect(enrollment.startDate).toEqual(new Date(startDate));
        expect(enrollment.endDate).toEqual(new Date(endDate));
        expect(enrollment.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it("ignores creation when removed education lacks enrollment", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-ignore",
            teacher: "Teacher Ignore",
            teacherId: null,
            education: [],
            toObject() {
                return { _id: this._id };
            },
        };
        Student.findById.mockResolvedValue(studentDoc);
        StudentEnrollmentMock.find
            .mockReturnValueOnce([])
            .mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockResolvedValue([]),
            });
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        UserMock.findOne.mockReturnValue(userLookup(null));

        const res = createRes();
        await handler(
            {
                params: { id: "put-ignore" },
                body: {
                    education: [
                        {
                            type: "Course",
                            refId: "course-missing",
                            name: "Missing Course",
                            removedAt: new Date(),
                        },
                    ],
                },
            },
            res
        );

        expect(CourseMatchingServiceMock.default.processStudentEducation).not.toHaveBeenCalled();
    });

    it("creates enrollments when missing course data is provided", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-new",
            teacher: "Teacher New",
            teacherId: null,
            education: [],
            toObject() {
                return { _id: this._id };
            },
        };
        Student.findById.mockResolvedValue(studentDoc);
        StudentEnrollmentMock.find
            .mockReturnValueOnce([])
            .mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockResolvedValue([]),
            });
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        UserMock.findOne.mockReturnValue(userLookup(null));
        CourseMatchingServiceMock.default.processStudentEducation.mockResolvedValue({ enrollments: [] });

        const req = {
            params: { id: "put-new" },
            body: {
                education: [
                    {
                        type: "Course",
                        refId: "course-new",
                        name: "New Course",
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                    },
                ],
            },
            user: { userId: "creator-user" },
        };
        const res = createRes();

        await handler(req, res);

        expect(CourseMatchingServiceMock.default.processStudentEducation).toHaveBeenCalledWith(
            "put-new",
            [
                expect.objectContaining({
                    refId: "course-new",
                    startDate: "2024-01-01",
                    endDate: "2024-02-01",
                }),
            ],
            "creator-user"
        );
    });

    it("logs errors when enrollment creation fails", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-fail",
            teacher: "Teacher Fail",
            teacherId: null,
            education: [],
            toObject() {
                return { _id: this._id };
            },
        };
        Student.findById.mockResolvedValue(studentDoc);
        StudentEnrollmentMock.find
            .mockReturnValueOnce([])
            .mockReturnValue({
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockResolvedValue([]),
            });
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        UserMock.findOne.mockReturnValue(userLookup(null));
        CourseMatchingServiceMock.default.processStudentEducation.mockRejectedValueOnce(
            new Error("enroll-fail")
        );
        const res = createRes();

        await handler(
            {
                params: { id: "put-fail" },
                body: {
                    education: [
                        {
                            type: "Course",
                            refId: "course-fail",
                            name: "Fail Course",
                        },
                    ],
                },
                user: { userId: "creator-user" },
            },
            res
        );

        expect(loggerMock.error).toHaveBeenCalled();
    });

    it("warns when teacher link lookup returns nothing", async () => {
        const handler = findRouteHandler("/student/:id", "PUT");
        const studentDoc = {
            _id: "put-warn",
            teacher: "Linked Teacher",
            teacherId: null,
            education: [],
            toObject() {
                return { _id: this._id };
            },
        };
        Student.findById.mockResolvedValue(studentDoc);
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        StudentEnrollmentMock.find.mockReturnValue({
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockResolvedValue([]),
        });
        UserMock.findOne.mockReturnValue(userLookup(null));
        const res = createRes();

        await handler({ params: { id: "put-warn" }, body: {} }, res);

        expect(loggerMock.warn).toHaveBeenCalled();
    });
});

describe("POST /students/:id/mark-comments-seen", () => {
    it("adds the user id to unseen entries", async () => {
        const handler = findRouteHandler(
            "/students/:id/mark-comments-seen",
            "POST",
            1
        );
        const studentDoc = {
            _id: "seen-1",
            commentHistory: [
                { seenBy: [], text: "note" },
                { seenBy: [new mongoose.Types.ObjectId("user-already")], text: "old" },
            ],
            markModified: vi.fn(),
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const req = { params: { id: "seen-1" }, userId: "user-new" };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.markModified).toHaveBeenCalledWith("commentHistory");
        expect(studentDoc.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            message: "Marked as seen",
            updatedStudent: studentDoc,
        });
    });

    it("returns 500 when marking comments seen fails", async () => {
        const handler = findRouteHandler(
            "/students/:id/mark-comments-seen",
            "POST",
            1
        );
        Student.findById.mockRejectedValueOnce(new Error("boom seen"));
        const req = { params: { id: "seen-err" }, userId: "auth-user" };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Failed to mark comments as seen.",
        });
    });
});

describe("GET /all-programs", () => {
    it("returns programs with selected fields", async () => {
        const handler = findRouteHandler("/all-programs", "GET");
        const selectChain = {
            select: vi.fn().mockResolvedValue([{ programName: "Prog1" }]),
        };
        Program.find.mockReturnValue(selectChain);
        const res = createRes();

        await handler({}, res);

        expect(selectChain.select).toHaveBeenCalledWith("programName");
        expect(res.json).toHaveBeenCalledWith([{ programName: "Prog1" }]);
    });
});

describe("GET /all-course-packages", () => {
    it("returns package documents", async () => {
        const handler = findRouteHandler("/all-course-packages", "GET");
        const selectChain = {
            select: vi.fn().mockResolvedValue([{ coursePackageName: "Pkg" }]),
        };
        CoursePackage.find.mockReturnValue(selectChain);
        const res = createRes();

        await handler({}, res);

        expect(selectChain.select).toHaveBeenCalledWith("coursePackageName");
        expect(res.json).toHaveBeenCalledWith([{ coursePackageName: "Pkg" }]);
    });
});

describe("GET /all-courses", () => {
    it("returns course documents", async () => {
        const handler = findRouteHandler("/all-courses", "GET");
        const selectChain = {
            select: vi.fn().mockResolvedValue([{ courseName: "Course", courseCode: "C1" }]),
        };
        Course.find.mockReturnValue(selectChain);
        const res = createRes();

        await handler({}, res);

        expect(selectChain.select).toHaveBeenCalledWith("courseName courseCode");
        expect(res.json).toHaveBeenCalledWith([{ courseName: "Course", courseCode: "C1" }]);
    });
});

describe("GET /students/earnings", () => {
    it("returns the revenue report from the analytics service", async () => {
        const handler = findRouteHandler("/students/earnings", "GET");
        getRevenueReportMock.mockResolvedValue({
            totalRevenue: 12300,
            totalRealized: 8200,
            totalForecasted: 4100,
            byMunicipality: [
                {
                    municipality: "Botkyrka",
                    revenue: 8200,
                    realized: 8200,
                    forecasted: 0,
                },
            ],
            byCourse: [],
        });
        const res = createRes();
        const req = { query: { municipality: "Botkyrka" } };

        await handler(req, res);

        expect(getRevenueReportMock).toHaveBeenCalledWith({
            startDate: undefined,
            endDate: undefined,
            municipality: "Botkyrka",
        });
        expect(res.status).not.toHaveBeenCalledWith(500);
        const payload = res.json.mock.calls[0][0];
        expect(payload.totalEarnings).toBe(8200);
        expect(payload.totalForecasted).toBe(4100);
        expect(payload.totalRevenue).toBe(12300);
        expect(payload.byMunicipality[0].municipality).toBe("Botkyrka");
    });

    it("returns 500 when the earnings report fails", async () => {
        const handler = findRouteHandler("/students/earnings", "GET");
        getRevenueReportMock.mockRejectedValueOnce(new Error("boom"));
        const res = createRes();
        const req = { query: {} };

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });
});

afterAll(() => {
    vi.resetModules();
});
