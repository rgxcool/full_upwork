import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/courseMatchingService.js", () => ({
    __esModule: true,
    default: {
        processStudentEducation: vi.fn(),
        findBestCourseMatch: vi.fn(),
    },
}));
vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: {
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndDelete: vi.fn(),
        countDocuments: vi.fn(),
        find: vi.fn(),
    },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
    },
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        countDocuments: vi.fn(),
        findOne: vi.fn(),
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
} from "../../src/controllers/courseMatchingController.js";

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
    CourseMatchingService.processStudentEducation.mockResolvedValue({
        enrollments: [],
        warnings: [],
        errors: [],
    });
    CourseMatchingService.findBestCourseMatch.mockResolvedValue(null);
    Student.findOne.mockResolvedValue(null);
    Student.findById.mockResolvedValue({ _id: "stu1", education: [] });
    Student.findByIdAndDelete.mockResolvedValue(undefined);
    Student.countDocuments.mockResolvedValue(0);
    Student.find.mockResolvedValue([]);
    CoursePackage.find.mockResolvedValue({ lean: vi.fn().mockResolvedValue([]) });
    Course.find.mockResolvedValue({ lean: vi.fn().mockResolvedValue([]) });
    StudentEnrollment.countDocuments.mockResolvedValue(0);
    StudentEnrollment.findOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({
            slutprovDate: new Date("2025-01-01"),
        }),
    });
    StudentEnrollment.find.mockReturnValue(
        createPopulateChain([{ _id: "enrollment1" }])
    );
    CourseInstance.find.mockReturnValue(
        createPopulateChain([
            {
                _id: "inst1",
                courseName: "Math",
                toObject: () => ({ _id: "inst1", courseName: "Math" }),
            },
        ])
    );
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
