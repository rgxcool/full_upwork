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
const mockCoursePackageFindById = vi.fn();
vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: {
        find: (...args) => mockCoursePackageFind(...args),
        findById: (...args) => mockCoursePackageFindById(...args),
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

vi.mock("../../src/models/Event.js", () => ({
    __esModule: true,
    default: class EventMock {
        constructor() {
            this.save = vi.fn().mockResolvedValue(this);
        }
    },
}));

const createStudentDocument = () => ({
    _id: "student1",
    name: "Test Student",
    email: "student@example.com",
    teacherId: "teacher-main",
    education: [],
    save: vi.fn().mockResolvedValue(undefined),
});

const loadService = async () => {
    vi.resetModules();
    global._StudentModel = undefined;
    const module = await import("../../src/utils/courseMatchingService.js");
    return module.default;
};

beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockCourseFind.mockResolvedValue([]);
    mockCourseFindById.mockResolvedValue(null);
    mockCourseInstanceFindOne.mockResolvedValue(null);
    mockStudentEnrollmentFindOne.mockResolvedValue(null);
    mockCoursePackageFind.mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
    });
    mockCoursePackageFindById.mockResolvedValue({
        populate: vi.fn().mockResolvedValue(null),
    });
    createdEnrollments.length = 0;
    StudentModelMock.findById.mockResolvedValue(createStudentDocument());
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

    it("enrolls individual course entries and updates the education array", async () => {
        const CourseMatchingService = await loadService();
        const studentDoc = createStudentDocument();
        StudentModelMock.findById.mockResolvedValue(studentDoc);

        const course = {
            _id: "course-individual",
            courseCode: "INDV100",
            courseName: "Individual Course",
            courseExtent: "5",
        };

        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue({
                course,
                score: 1,
            });

        const instance = {
            _id: "instance-individual",
            courseName: course.courseName,
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-02-05"),
        };
        const instanceSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({
                instance,
                wasCreated: true,
            });

        const entry = {
            type: "Course",
            name: course.courseCode,
            startDate: "2025-01-01",
            endDate: "2025-02-05",
            notes: "Individual notes",
        };

        const results = await CourseMatchingService.processStudentEducation(
            "student1",
            [entry],
            "user1"
        );

        expect(results.enrollments).toHaveLength(1);
        expect(results.enrollments[0].courseInstanceName).toBe(
            course.courseName
        );
        expect(results.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "instance_created",
                    courseName: entry.name,
                }),
            ])
        );
        expect(studentDoc.education.some((e) => e.type === "Course")).toBe(
            true
        );

        matchSpy.mockRestore();
        instanceSpy.mockRestore();
    });

    it("processes grouped course package entries and records package education", async () => {
        const CourseMatchingService = await loadService();
        const studentDoc = createStudentDocument();
        StudentModelMock.findById.mockResolvedValue(studentDoc);

        const courseA = {
            _id: "course-A",
            courseName: "Course A",
            courseExtent: "2.5",
        };
        const courseB = {
            _id: "course-B",
            courseName: "Course B",
            courseExtent: "2.5",
        };

        const packageDoc = {
            _id: "package1",
            coursePackageName: "Package One",
            coursePackageCourses: [courseA, courseB],
        };

        const populateMock = vi.fn().mockResolvedValue(packageDoc);
        mockCoursePackageFindById.mockImplementation(() => ({
            populate: populateMock,
        }));

        const courseInstanceA = {
            _id: "instance-A",
            courseName: courseA.courseName,
            startDate: new Date("2025-01-06"),
            endDate: new Date("2025-02-10"),
        };
        const courseInstanceB = {
            _id: "instance-B",
            courseName: courseB.courseName,
            startDate: new Date("2025-01-06"),
            endDate: new Date("2025-02-10"),
        };

        const createSequence = [
            { instance: courseInstanceA, wasCreated: true },
            { instance: courseInstanceB, wasCreated: true },
        ];
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockImplementation(() =>
                Promise.resolve(
                    createSequence.shift() || {
                        instance: courseInstanceB,
                        wasCreated: true,
                    }
                )
            );

        const entry = {
            type: "CoursePackage",
            refId: packageDoc._id,
            name: packageDoc.coursePackageName,
            startDate: "2025-01-01",
            endDate: "2025-03-01",
            teacherId: "package-teacher",
        };

        const results = await CourseMatchingService.processStudentEducation(
            "student2",
            [entry],
            "user2"
        );

        if (results.errors.length) {
            throw new Error(
                `processing error: ${results.errors[0].message}`
            );
        }
        expect(results.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: "package_added" }),
            ])
        );
        expect(
            studentDoc.education.filter((e) => e.type === "Course")
        ).toHaveLength(2);
        expect(
            studentDoc.education.some((e) => e.type === "CoursePackage")
        ).toBe(true);

        findOrCreateSpy.mockRestore();
    });

    it("warns when individual course matching fails", async () => {
        const CourseMatchingService = await loadService();
        const entry = {
            type: "Course",
            name: "Unknown Code",
            startDate: "2025-01-01",
            endDate: "2025-04-01",
        };

        const results = await CourseMatchingService.processStudentEducation(
            "studentX",
            [entry],
            "userX"
        );

        expect(results.enrollments).toHaveLength(0);
        expect(results.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "no_match",
                    courseName: entry.name,
                }),
            ])
        );
    });

    it("continues when slutprov date is invalid for an individual course", async () => {
        const CourseMatchingService = await loadService();
        const studentDoc = createStudentDocument();
        StudentModelMock.findById.mockResolvedValue(studentDoc);

        const course = {
            _id: "individual-2",
            courseName: "Individual Fun",
            courseExtent: "4",
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue({
                course,
                score: 1,
            });
        const instance = {
            _id: "instance-invalid",
            courseName: course.courseName,
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const instanceSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({
                instance,
                wasCreated: true,
            });

        const entry = {
            type: "Course",
            name: "Individual Fun",
            startDate: "2025-03-01",
            endDate: "2025-04-01",
            slutprovDate: "not-a-date",
        };

        const results = await CourseMatchingService.processStudentEducation(
            "student3",
            [entry],
            "user3"
        );

        expect(results.enrollments).toHaveLength(1);
        expect(results.errors).toHaveLength(0);
        matchSpy.mockRestore();
        instanceSpy.mockRestore();
    });

    it("records processing errors when a course package lookup fails", async () => {
        const CourseMatchingService = await loadService();
        const populateMock = vi
            .fn()
            .mockRejectedValue(new Error("package load failed"));
        mockCoursePackageFindById.mockImplementation(() => ({
            populate: populateMock,
        }));

        const entry = {
            type: "CoursePackage",
            refId: "pkg-fail",
            name: "Broken Package",
            startDate: "2025-01-01",
            endDate: "2025-02-01",
        };

        const results = await CourseMatchingService.processStudentEducation(
            "studentPkg",
            [entry],
            "userPkg"
        );

        expect(results.enrollments).toHaveLength(0);
        expect(results.errors).toHaveLength(1);
        expect(results.errors[0]).toMatchObject({
            type: "processing_error",
            courseName: entry.name,
            message: "package load failed",
        });
    });
});
