import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const CourseMatchingServiceMock = {
    __esModule: true,
    default: {
        processStudentEducation: vi.fn(),
    },
};

vi.mock("../../src/utils/courseMatchingService.js", () => CourseMatchingServiceMock);

vi.mock("../../src/models/Student.js", () => {
    const StudentMock = vi.fn(function (doc) {
        Object.assign(this, doc);
        this.save = vi.fn().mockResolvedValue(this);
    });
    Object.assign(StudentMock, {
        find: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn(),
        deleteMany: vi.fn(),
    });

    return {
        __esModule: true,
        default: StudentMock,
    };
});

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

const TeacherMock = {
    findOne: vi.fn(),
};

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
        if (other == null) {
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
    };
    const model = vi.fn((name) => {
        if (name === "Teacher") return TeacherMock;
        if (name === "StudentEnrollment") return StudentEnrollmentMock;
        return undefined;
    });
    return {
        __esModule: true,
        default: {
            Schema: schema,
            model,
            Types: types,
        },
    };
});


import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import Program from "../../src/models/Program.js";
import { sendDropoutNotification } from "../../src/controllers/notificationController.js";
import { authenticateUser } from "../../src/controllers/authController.js";
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
    sendDropoutNotification.mockReset();
    CourseMatchingServiceMock.default.processStudentEducation.mockReset();
    TeacherMock.findOne.mockReset();
    StudentEnrollmentQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockResolvedValue([]),
    };
    StudentEnrollmentMock.find.mockReset();
    StudentEnrollmentMock.find.mockImplementation(() => StudentEnrollmentQuery);
    StudentEnrollmentMock.findOne.mockReset();
    StudentEnrollmentMock.findById.mockReset();
    StudentEnrollmentMock.findByIdAndDelete.mockReset();
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
        const req = { params: { teacherId: "teacher-1" } };
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

    it("PUT /students/:studentId/education/:educationId/status sends notification when status is Avbrott", async () => {
        const handler = findRouteHandler(
            "/students/:studentId/education/:educationId/status",
            "PUT"
        );
        const educationId = "edu-1";
        const educationEntry = {
            refId: {
                toString: () => educationId,
            },
            status: "Pågående",
        };
        const studentDoc = {
            _id: "student-1",
            education: [educationEntry],
            dropout: false,
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = {
            params: { studentId: "student-1", educationId },
            body: { status: "Avbrott" },
        };
        const res = createRes();

        await handler(req, res);

        expect(Student.findById).toHaveBeenCalledWith("student-1");
        expect(studentDoc.dropout).toBe(true);
        expect(sendDropoutNotification).toHaveBeenCalledWith({
            student: studentDoc,
            education: educationEntry,
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
        const educationId = "edu-2";
        const educationEntry = {
            refId: {
                toString: () => educationId,
            },
            status: "Pågående",
        };
        const studentDoc = {
            _id: "student-2",
            education: [educationEntry],
            dropout: true,
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);

        const req = {
            params: { studentId: "student-2", educationId },
            body: { status: "Pågående" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.dropout).toBe(false);
        expect(sendDropoutNotification).not.toHaveBeenCalled();
        expect(studentDoc.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Status updated successfully",
        });
    });

    describe("GET /students", () => {
        it("returns 403 when teacher profile is missing", async () => {
            const handler = findRouteHandler("/students", "GET");
            TeacherMock.findOne.mockResolvedValue(null);

            const req = { user: { role: "teacher", userId: "user-1" } };
            const res = createRes();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                error: "Teacher profile not found",
            });
        });

        it("returns enriched students and merges course/package entries", async () => {
            const handler = findRouteHandler("/students", "GET");
            TeacherMock.findOne.mockResolvedValue({ _id: "teacher-123" });
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
                teacherId: "teacher-123",
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
                teacherId: "teacher-123",
                createdAt: new Date("2025-03-03"),
            };
            StudentEnrollmentQuery.lean.mockResolvedValue([
                enrollment,
                packageEnrollment,
            ]);
            CoursePackage.findById.mockResolvedValue({
                _id: "pkg-1",
                coursePackageName: "Full Package",
            });

            const req = { user: { role: "teacher", userId: "user-1" } };
        const res = createRes();

        await handler(req, res);

        expect(TeacherMock.findOne).toHaveBeenCalledWith({
            userId: "user-1",
        });
            expect(Student.find).toHaveBeenCalledWith({
                teacherId: "teacher-123",
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
        });

        it("handles Student.find errors gracefully", async () => {
            const handler = findRouteHandler("/students", "GET");
            TeacherMock.findOne.mockResolvedValue({ _id: "teacher-123" });
            Student.find.mockReturnValue({
                lean: vi.fn().mockRejectedValue(new Error("boom")),
            });

            const req = { user: { role: "teacher", userId: "user-1" } };
            const res = createRes();

            await handler(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
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

        expect(Student).toHaveBeenCalledWith(req.body);
        expect(CourseMatchingServiceMock.default.processStudentEducation).toHaveBeenCalledWith(
            "student-123",
            req.body.education,
            "creator-1"
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "New Student",
            })
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

    it("returns 400 when course already exists in education", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/addcourse",
            "POST"
        );
        const studentDoc = {
            _id: "stu-3",
            education: [
                {
                    type: "Course",
                    refId: { toString: () => "course-1" },
                },
            ],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        Course.findById.mockResolvedValue({ _id: "course-1" });

        const req = {
            params: { studentId: "stu-3" },
            body: { courseId: "course-1" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Course already exists" });
    });

    it("returns server error while adding course", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/addcourse",
            "POST"
        );
        const studentDoc = {
            _id: "stu-4",
            education: [],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById
            .mockResolvedValueOnce(studentDoc)
            .mockResolvedValueOnce(studentDoc);
        Course.findById.mockResolvedValue({ _id: "course-5", courseName: "Extra" });

        const req = {
            params: { studentId: "stu-4" },
            body: { courseId: "course-5" },
        };
        const res = createRes();

        await handler(req, res);

        expect(studentDoc.education).toHaveLength(1);
        expect(studentDoc.education[0].type).toBe("Course");
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
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

        const req = { params: { id: "stu-11" } };
        const res = createRes();

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });
});

describe("GET /student/:id/basic", () => {
    it("returns the basic student data", async () => {
        const handler = findRouteHandler("/student/:id/basic", "GET");
        const studentDoc = { _id: "basic-1", personalNumber: "20010101-0001" };
        const selectChain = createSelectChain(studentDoc);
        Student.findById.mockReturnValue(selectChain);

        const req = { params: { id: "basic-1" } };
        const res = createRes();

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });
});

describe("DELETE /student/:id", () => {
    it("returns 404 if student not found", async () => {
        const handler = findRouteHandler("/student/:id", "DELETE");
        Student.findByIdAndDelete.mockResolvedValue(null);
        const req = { params: { id: "delete-1" } };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("deletes student successfully", async () => {
        const handler = findRouteHandler("/student/:id", "DELETE");
        Student.findByIdAndDelete.mockResolvedValue({ _id: "delete-2" });
        const req = { params: { id: "delete-2" } };
        const res = createRes();

        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith({
            message: "Student deleted successfully",
        });
    });
});

describe("DELETE /students", () => {
    it("clears all students", async () => {
        const handler = findRouteHandler("/students", "DELETE");
        const res = createRes();

        await handler({ params: {} }, res);

        expect(Student.deleteMany).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            message: "All students deleted successfully",
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

    it("logs and returns server error when updating aplStatus", async () => {
        const handler = findRouteHandler("/students/:id", "PATCH");
        const studentDoc = {
            _id: "patch-3",
            teacher: "Link Teacher",
            teacherId: null,
            aplStatusHistory: [],
            education: [],
        };
        Student.findById.mockResolvedValue(studentDoc);
        TeacherMock.findOne.mockResolvedValue({ _id: "teacher-1" });
        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        StudentEnrollmentQuery.lean.mockResolvedValue([]);
        const req = {
            params: { id: "patch-3" },
            body: {
                aplStatus: "UPD",
                education: [{ type: "Course", refId: "course-3", name: "Course A" }],
                municipality: { type: "kombo" },
            },
            user: { userId: "user-patch" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update APL status" });
    });

    it("returns server error when removing enrollment", async () => {
        const handler = findRouteHandler("/students/:id", "PATCH");
        const studentDoc = {
            _id: "patch-4",
            aplStatusHistory: [],
            education: [],
        };
        Student.findById.mockResolvedValue(studentDoc);
        TeacherMock.findOne.mockResolvedValue(null);
        const enrollment = { _id: "enroll-del" };
        StudentEnrollmentMock.findOne.mockResolvedValue(enrollment);
        StudentEnrollmentMock.findByIdAndDelete.mockResolvedValue(enrollment);
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        const req = {
            params: { id: "patch-4" },
            body: {
                education: [
                    {
                        type: "Course",
                        refId: "course-4",
                        name: "Course 4",
                        removedAt: new Date(),
                    },
                ],
                aplStatus: "UPDATED",
            },
            user: { userId: "user" },
        };
        const res = createRes();

        StudentEnrollmentMock.findByIdAndDelete.mockRejectedValue(new Error("delete failed"));
        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update APL status" });
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
});

describe("PUT /student/:id", () => {
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
        TeacherMock.findOne.mockResolvedValue({ _id: "teacher-new" });
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
        TeacherMock.findOne.mockResolvedValue({ _id: "teacher-linked" });
        Student.findByIdAndUpdate.mockResolvedValue(studentDoc);
        StudentEnrollmentQuery.lean.mockResolvedValue([]);

        const res = createRes();
        global.Teacher = TeacherMock;
        try {
            await handler(
                { params: { id: "put-teacher" }, body: { name: "Updated Student" } },
                res
            );
        } finally {
            delete global.Teacher;
        }

        expect(TeacherMock.findOne).toHaveBeenCalledWith({
            name: "Linked Teacher",
        });
        expect(Student.findByIdAndUpdate).toHaveBeenCalledWith(
            "put-teacher",
            expect.objectContaining({
                $set: expect.objectContaining({
                    teacherId: "teacher-linked",
                }),
            }),
            { new: true }
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

describe("PATCH /student/:studentId/education/:educationId/grade", () => {
    it("rejects unsupported grade values", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/education/:educationId/grade",
            "PATCH"
        );
        const req = {
            params: { studentId: "grade-1", educationId: "edu-1" },
            body: { grade: "Z" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Invalid grade." });
    });

    it("returns 404 when the student is missing", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/education/:educationId/grade",
            "PATCH"
        );
        Student.findById.mockResolvedValue(null);
        const req = {
            params: { studentId: "grade-missing", educationId: "edu-missing" },
            body: { grade: "C" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("handles missing education entry", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/education/:educationId/grade",
            "PATCH"
        );
        const studentDoc = {
            _id: "grade-2",
            education: [],
            save: vi.fn(),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const req = {
            params: { studentId: "grade-2", educationId: "edu-2" },
            body: { grade: "A" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Education entry not found",
        });
    });

    it("returns server error when updating grade fails", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/education/:educationId/grade",
            "PATCH"
        );
        Student.findById.mockRejectedValue(new Error("database exploded"));
        const req = {
            params: { studentId: "grade-3", educationId: "edu-3" },
            body: { grade: "B" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });

    it("updates a course grade and returns the refreshed student", async () => {
        const handler = findRouteHandler(
            "/student/:studentId/education/:educationId/grade",
            "PATCH"
        );
        const educationEntry = {
            _id: "edu-grade",
            type: "Course",
            refId: { toString: () => "ref-1" },
            grade: "F",
        };
        const studentDoc = {
            _id: "grade-success",
            education: [educationEntry],
            save: vi.fn().mockResolvedValue(undefined),
        };
        const populatedStudent = { _id: "grade-success", education: [educationEntry] };
        Student.findById
            .mockResolvedValueOnce(studentDoc)
            .mockReturnValueOnce({
                populate: vi.fn().mockResolvedValue(populatedStudent),
            });
        const req = {
            params: { studentId: "grade-success", educationId: "edu-grade" },
            body: { grade: "B" },
        };
        const res = createRes();

        await handler(req, res);

        expect(educationEntry.grade).toBe("B");
        expect(studentDoc.save).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(populatedStudent);
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

describe("PUT /student/:id/education/:courseId/grade", () => {
    it("returns 404 when student missing", async () => {
        const handler = findRouteHandler(
            "/student/:id/education/:courseId/grade",
            "PUT"
        );
        Student.findById.mockResolvedValue(null);
        const res = createRes();

        await handler(
            { params: { id: "st-1", courseId: "course-1" }, body: { grade: "A" } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("returns 404 when course not in education", async () => {
        const handler = findRouteHandler(
            "/student/:id/education/:courseId/grade",
            "PUT"
        );
        const studentDoc = {
            _id: "st-2",
            education: [],
            save: vi.fn(),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const res = createRes();

        await handler(
            { params: { id: "st-2", courseId: "missing-course" }, body: { grade: "C" } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: "Course not found in student's education",
        });
    });

    it("updates grade and persists modified date", async () => {
        const handler = findRouteHandler(
            "/student/:id/education/:courseId/grade",
            "PUT"
        );
        const entry = {
            refId: { toString: () => "course-5" },
            grade: null,
        };
        const studentDoc = {
            _id: "st-3",
            education: [entry],
            save: vi.fn().mockResolvedValue(undefined),
        };
        Student.findById.mockResolvedValue(studentDoc);
        const req = {
            params: { id: "st-3", courseId: "course-5" },
            body: { grade: "A" },
        };
        const res = createRes();

        await handler(req, res);

        expect(entry.grade).toBe("A");
        expect(studentDoc.updatedAt).toBeInstanceOf(Date);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(studentDoc);
    });

    it("returns 500 when updating grade fails unexpectedly", async () => {
        const handler = findRouteHandler(
            "/student/:id/education/:courseId/grade",
            "PUT"
        );
        Student.findById.mockRejectedValueOnce(new Error("boom database"));
        const req = {
            params: { id: "st-500", courseId: "course-500" },
            body: { grade: "A" },
        };
        const res = createRes();

        await handler(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to update grade" });
    });
});

describe("GET /students/earnings", () => {
    it("queries graded students", async () => {
        const handler = findRouteHandler("/students/earnings", "GET");
        Student.find.mockResolvedValue([{ _id: "earn-1" }]);
        const res = createRes();

        await handler({}, res);

        expect(Student.find).toHaveBeenCalledWith(
            { "education.grade": { $ne: null } },
            { municipality: 1, education: 1 }
        );
        expect(res.json).toHaveBeenCalledWith([{ _id: "earn-1" }]);
    });

    it("returns 500 when earnings query fails", async () => {
        const handler = findRouteHandler("/students/earnings", "GET");
        Student.find.mockRejectedValueOnce(new Error("boom"));
        const res = createRes();

        await handler({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Server error" });
    });
});

afterAll(() => {
    vi.resetModules();
});
