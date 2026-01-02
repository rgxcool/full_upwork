import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
    },
}));

vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: {
        findById: vi.fn(),
    },
}));

vi.mock("../../src/controllers/notificationController.js", () => ({
    sendDropoutNotification: vi.fn(),
}));

const TeacherMock = {
    findOne: vi.fn(),
};

let StudentEnrollmentQuery;
var StudentEnrollmentMock;

vi.mock("mongoose", () => {
    const types = {
        ObjectId: vi.fn((value) => value),
    };
    const schema = vi.fn(function (definition, options) {
        return {
            definition,
            options,
            Types: types,
            pre: vi.fn(),
            methods: {},
            statics: {},
            index: vi.fn(),
        };
    });
    schema.Types = types;
    StudentEnrollmentMock = {
        find: vi.fn(),
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


import Student from "../../src/models/Student.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import { sendDropoutNotification } from "../../src/controllers/notificationController.js";
import router from "../../src/router/studentRoutes.js";

const findRouteHandler = (path, method, stackIndex = 0) => {
    const layer = router.stack.find((layer) => layer.route?.path === path);
    if (!layer) {
        throw new Error(`Route ${path} not found`);
    }
    const stackEntry = layer.route.stack[stackIndex];
    if (!stackEntry || stackEntry.method !== method.toLowerCase()) {
        throw new Error(
            `Method ${method} not found for ${path} at stack position ${stackIndex}`
        );
    }
    return stackEntry.handle;
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

beforeEach(() => {
    Student.find.mockReset();
    Student.findById.mockReset();
    sendDropoutNotification.mockReset();
    TeacherMock.findOne.mockReset();
    StudentEnrollmentQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
    };
    StudentEnrollmentMock.find.mockReset();
    StudentEnrollmentMock.find.mockImplementation(() => StudentEnrollmentQuery);
    CoursePackage.findById.mockReset();
    CoursePackage.findById.mockResolvedValue(null);
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
            const handler = findRouteHandler("/students", "GET", 1);
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
            const handler = findRouteHandler("/students", "GET", 1);
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
            const handler = findRouteHandler("/students", "GET", 1);
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

afterAll(() => {
    vi.resetModules();
});
