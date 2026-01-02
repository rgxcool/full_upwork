import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCourseFind = vi.fn();
const mockCourseFindById = vi.fn();
vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: {
        find: mockCourseFind,
        findById: mockCourseFindById,
    },
}));

const mockCourseInstanceFindOne = vi.fn();
const mockCoursePackageFind = vi.fn();
vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: {
        find: (...args) => mockCoursePackageFind(...args),
        findById: vi.fn().mockResolvedValue(null),
    },
}));
class CourseInstanceMock {
    constructor(data) {
        Object.assign(this, data);
        this._id = data._id || "ci-" + Math.random().toString(36).slice(2);
        this.save = vi.fn().mockResolvedValue(this);
        this.toObject = () => ({ ...this });
    }
    static findOne(...args) {
        return mockCourseInstanceFindOne(...args);
    }
}
vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: CourseInstanceMock,
}));

const mockStudentEnrollmentFindOne = vi.fn();
const createdEnrollments = [];
class StudentEnrollmentMock {
    constructor(data) {
        Object.assign(this, data);
        this.save = vi.fn().mockResolvedValue(this);
        createdEnrollments.push(this);
    }
    toObject() {
        return { ...this };
    }
    static findOne(...args) {
        return mockStudentEnrollmentFindOne(...args);
    }
}
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: StudentEnrollmentMock,
}));

const StudentModelMock = {
    findById: vi.fn(),
};
vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: StudentModelMock,
}));

const loadService = async () => {
    vi.resetModules();
    global._StudentModel = undefined;
    const module = await import("../../src/utils/courseMatchingService.js");
    return module.default;
};

beforeEach(() => {
    vi.clearAllMocks();
    mockCourseFind.mockResolvedValue([]);
    mockCourseFindById.mockResolvedValue(null);
    mockCourseInstanceFindOne.mockResolvedValue(null);
    mockStudentEnrollmentFindOne.mockResolvedValue(null);
    mockCoursePackageFind.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
    });
    createdEnrollments.length = 0;
    StudentModelMock.findById.mockResolvedValue({
        _id: "student1",
        name: "Test Student",
        email: "student@example.com",
        education: [],
        save: vi.fn().mockResolvedValue(undefined),
    });
});

describe("CourseMatchingService utilities", () => {
    it("calculates calendar helpers", async () => {
        const CourseMatchingService = await loadService();
        const monday = CourseMatchingService.getNextMonday("2024-09-22");
        expect(monday.getDay()).toBe(1);
        const added = CourseMatchingService.addWeeks("2024-08-01", 3);
        expect(added.getDate()).toBe(new Date("2024-08-01").getDate() + 21);
        const wednesday = CourseMatchingService.getWednesdayOfWeek(
            "2024-08-01",
            2
        );
        expect(wednesday.getDay()).toBe(3);
        expect(CourseMatchingService.cleanCourseName("abc (rev) mot extra")).toBe(
            "ABC EXTRA"
        );
    });
});

describe("findBestCourseMatch", () => {
    it("returns null when no match", async () => {
        const CourseMatchingService = await loadService();
        const result = await CourseMatchingService.findBestCourseMatch("missing");
        expect(result).toBeNull();
    });

    it("returns course when exact match exists", async () => {
        const CourseMatchingService = await loadService();
        const course = {
            _id: "course1",
            courseCode: "SVEA1000X",
            courseName: "Swedish",
        };
        mockCourseFind.mockResolvedValueOnce([course]);
        const result = await CourseMatchingService.findBestCourseMatch("svea1000x");
        expect(result).toEqual({
            course,
            score: 1.0,
        });
    });
});

describe("findOrCreateCourseInstance", () => {
    it("updates existing instance", async () => {
        const CourseMatchingService = await loadService();
        const instance = new CourseInstanceMock({
            _id: "ci1",
            courseName: "Test",
            startDate: new Date("2024-08-01"),
            endDate: new Date("2024-09-01"),
            responsibleTeacher: null,
        });
        mockCourseInstanceFindOne.mockResolvedValueOnce(instance);

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            "course123",
            new Date("2024-08-01"),
            new Date("2024-09-01"),
            "user1",
            null,
            new Date("2024-09-15")
        );

        expect(result.wasCreated).toBe(false);
        expect(instance.slutprovDate).toEqual(new Date("2024-09-15"));
        expect(instance.save).toHaveBeenCalled();
    });

    it("creates new instance when missing", async () => {
        const CourseMatchingService = await loadService();
        const mainCourse = {
            _id: "main1",
            courseName: "Main course",
            courseCode: "MAIN100",
            coursePoints: 10,
            courseExtent: 5,
        };
        mockCourseInstanceFindOne.mockResolvedValue(null);
        mockCourseFindById.mockResolvedValueOnce(mainCourse);

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            mainCourse._id,
            new Date("2024-08-01"),
            new Date("2024-09-01"),
            "user1",
            "teacher1",
            null
        );

        expect(result.wasCreated).toBe(true);
        expect(result.instance).toBeInstanceOf(CourseInstanceMock);
        expect(result.instance.courseName).toBe(mainCourse.courseName);
    });
});

describe("processStudentEducation", () => {
    it("handles program entries", async () => {
        const CourseMatchingService = await loadService();
        const studentId = "stu1";
        const entry = {
            type: "Program",
            refId: "prog1",
            name: "Program Test",
            notes: "Notes",
        };
        const results = await CourseMatchingService.processStudentEducation(
            studentId,
            [entry],
            "user1"
        );

        expect(results.enrollments).toHaveLength(0); // filtered because courseInstanceId is unset for programs
        expect(results.errors).toHaveLength(0);
        expect(results.warnings).toHaveLength(0);
        expect(createdEnrollments[0]).toBeDefined();
        const studentDoc = await StudentModelMock.findById();
        expect(studentDoc.education.some((e) => e.type === "Program")).toBe(
            true
        );
    });
});
