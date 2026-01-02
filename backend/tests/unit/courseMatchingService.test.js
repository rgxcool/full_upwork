import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const courseInstanceSaveMock = vi.fn();

class CourseInstanceMock {
    constructor(data) {
        Object.assign(this, data);
        this._id = data._id || `ci-${Math.random().toString(16).slice(2)}`;
        this.save = vi.fn().mockImplementation(() => {
            courseInstanceSaveMock(this);
            return Promise.resolve(this);
        });
    }

    static findOne = vi.fn();
    static findById = vi.fn();
}

let coursePackages = [];

const CoursePackageMock = {
    find: vi.fn(() => ({ lean: vi.fn(() => Promise.resolve(coursePackages)) })),
    findById: vi.fn(),
};

const CourseMock = {
    find: vi.fn(),
    findById: vi.fn(),
};

class StudentEnrollmentMock {
    constructor(data) {
        Object.assign(this, data);
        this._id = data._id || `enr-${Math.random().toString(16).slice(2)}`;
        this.save = vi.fn().mockResolvedValue(this);
        if (StudentEnrollmentMock.forceMissingCourseInstance) {
            this.courseInstanceId = undefined;
        }
        StudentEnrollmentMock.instances.push(this);
    }

    toObject() {
        return { ...this };
    }

    static findOne = vi.fn();
    static forceMissingCourseInstance = false;
    static instances = [];
}

class StudentMock {
    constructor(data) {
        Object.assign(this, data);
        this.education = data.education || [];
        this.save = vi.fn().mockResolvedValue(this);
    }

    static findById = vi.fn();
}

vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: CourseInstanceMock,
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: CoursePackageMock,
}));
vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: CourseMock,
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: StudentEnrollmentMock,
}));
vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: StudentMock,
}));
vi.mock("../../src/models/Event.js", () => ({
    __esModule: true,
    default: class EventMock {
        static findOne = vi.fn();
        save = vi.fn().mockResolvedValue(this);
    },
}));

import CourseMatchingService from "../../src/utils/courseMatchingService.js";

const resetMocks = () => {
    coursePackages = [];
    CourseInstanceMock.findOne.mockReset();
    CourseInstanceMock.findById.mockReset();
    CoursePackageMock.find.mockClear();
    CoursePackageMock.findById.mockClear();
    CourseMock.find.mockReset();
    CourseMock.findById.mockReset();
    StudentEnrollmentMock.findOne.mockReset();
    StudentMock.findById.mockReset();
    courseInstanceSaveMock.mockReset();
    StudentEnrollmentMock.forceMissingCourseInstance = false;
    StudentEnrollmentMock.instances = [];
    delete global._StudentModel;
};

beforeEach(() => {
    resetMocks();
    CourseInstanceMock.findOne.mockResolvedValue(null);
    StudentEnrollmentMock.findOne.mockResolvedValue(null);
});

afterEach(() => {
    resetMocks();
});

describe("CourseMatchingService helpers", () => {
    it("calculates next Monday, adds weeks, and finds Wednesdays", () => {
        const refDate = new Date("2025-01-01"); // Wednesday
        const nextMonday = CourseMatchingService.getNextMonday(refDate);
        expect(nextMonday.getDay()).toBe(1);
        expect(nextMonday.getDate()).toBe(6);

        const plusTwoWeeks = CourseMatchingService.addWeeks(refDate, 2);
        expect(plusTwoWeeks.getDate()).toBe(15);

        const wednesday = CourseMatchingService.getWednesdayOfWeek(
            "2025-01-01",
            1
        );
        expect(wednesday.getDay()).toBe(3);
    });

    it("cleans course names predictably", () => {
        const dirty = "  MAT101 (mot test); | ";
        expect(CourseMatchingService.cleanCourseName(dirty)).toBe("MAT101");
    });
});

describe("CourseMatchingService.findBestCourseMatch", () => {
    it("returns match when exact code exists", async () => {
        CourseMock.find.mockResolvedValueOnce([
            {
                _id: "course-a",
                courseCode: "MAT101",
                courseName: "Matte",
            },
        ]);

        const match = await CourseMatchingService.findBestCourseMatch("mat101");
        expect(match).toBeTruthy();
        expect(match?.score).toBe(1.0);
    });

    it("returns null when no courses found", async () => {
        CourseMock.find.mockResolvedValueOnce([]);
        CourseMock.find.mockResolvedValueOnce([]);

const match = await CourseMatchingService.findBestCourseMatch("unknown");
        expect(match).toBeNull();
    });

    it("returns null and skips database call when normalization yields no characters", async () => {
        CourseMock.find.mockReset();
        const result = await CourseMatchingService.findBestCourseMatch("   ");
        expect(result).toBeNull();
        expect(CourseMock.find).not.toHaveBeenCalled();
    });
});

describe("CourseMatchingService.findOrCreateCourseInstance", () => {
    it("returns existing instance and updates responsible teacher", async () => {
        const existingInstance = {
            _id: "ci-existing",
            courseName: "Existing",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-03-01"),
            responsibleTeacher: "old",
            slutprovDate: new Date("2025-03-01"),
        };
        existingInstance.save = vi.fn().mockResolvedValue(existingInstance);
        CourseInstanceMock.findOne.mockResolvedValue(existingInstance);

        const result =
            await CourseMatchingService.findOrCreateCourseInstance(
                "course-id",
                new Date("2025-01-01"),
                new Date("2025-03-01"),
                "user",
                "new-teacher"
            );

        expect(result.wasCreated).toBe(false);
        expect(existingInstance.save).toHaveBeenCalled();
        expect(CourseMock.findById).not.toHaveBeenCalled();
    });

    it("patches slutprovDate on existing instance when explicitly provided without teacher", async () => {
        const existingInstance = {
            _id: "ci-patch",
            courseName: "Patch Course",
            startDate: new Date("2025-02-01"),
            endDate: new Date("2025-03-01"),
        };
        existingInstance.save = vi.fn().mockResolvedValue(existingInstance);
        CourseInstanceMock.findOne.mockResolvedValue(existingInstance);

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            "course-patch",
            new Date("2025-02-01"),
            new Date("2025-03-01"),
            "user",
            null,
            new Date("2025-03-05")
        );

        expect(result.wasCreated).toBe(false);
        expect(existingInstance.slutprovDate).toEqual(new Date("2025-03-05"));
        expect(existingInstance.save).toHaveBeenCalled();
    });

    it("clears slutprovDate when teacher overrides and no explicit date provided", async () => {
        const existingInstance = {
            _id: "ci-clear",
            courseName: "Clear Course",
            startDate: new Date("2025-02-01"),
            endDate: new Date("2025-03-01"),
            responsibleTeacher: "other",
            slutprovDate: new Date("2025-03-05"),
        };
        existingInstance.save = vi.fn().mockResolvedValue(existingInstance);
        CourseInstanceMock.findOne.mockResolvedValue(existingInstance);

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            "course-clear",
            new Date("2025-02-01"),
            new Date("2025-03-01"),
            "user",
            "teacher-new"
        );

        expect(result.wasCreated).toBe(false);
        expect(existingInstance.slutprovDate).toBeUndefined();
        expect(existingInstance.save).toHaveBeenCalled();
    });

    it("throws when the referenced main course cannot be found", async () => {
        CourseInstanceMock.findOne.mockResolvedValue(null);
        CourseMock.findById.mockResolvedValue(null);

        await expect(
            CourseMatchingService.findOrCreateCourseInstance(
                "missing-course",
                new Date("2025-05-01"),
                new Date("2025-06-01")
            )
        ).rejects.toThrow("Main course not found: missing-course");
    });
});

describe("CourseMatchingService.processStudentEducation", () => {
    it("processes an individual course entry", async () => {
        CoursePackageMock.find.mockImplementation(() => ({
            lean: vi.fn(() => Promise.resolve([])),
        }));
        CourseMock.findById.mockResolvedValue({
            _id: "course-1",
            courseName: "Matte",
            courseCode: "MAT101",
            coursePoints: 5,
            courseExtent: 5,
        });

        const match = {
            course: {
                _id: "course-1",
                courseName: "Matte",
                courseCode: "MAT101",
                courseExtent: "5",
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const studentDoc = {
            _id: "stu-1",
            education: [],
            teacherId: null,
            email: "student@test.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-1",
            [
                {
                    type: "Course",
                    name: "MAT101",
                    startDate: "2025-01-15",
                    endDate: "2025-02-15",
                },
            ],
            "user1"
        );

        expect(findMatchSpy).toHaveBeenCalled();
        expect(result.enrollments).toHaveLength(1);
        expect(result.enrollments[0].courseInstanceName).toBe("Matte");
        expect(studentDoc.save).toHaveBeenCalled();
        findMatchSpy.mockRestore();
    });

    it("processes a course package entry and updates education", async () => {
        const packageDoc = {
            _id: "pkg-1",
            coursePackageName: "Mattepaket",
            coursePackageCourses: [
                {
                    _id: "course-pack-1",
                    courseName: "Pack Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [];
        CourseInstanceMock.findOne.mockResolvedValue(null);
        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);
        const studentDoc = {
            _id: "stu-pkg",
            education: [],
            teacherId: null,
            email: "pkg@student.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);
        CourseMock.findById.mockResolvedValue({
            _id: "course-pack-1",
            courseName: "Pack Course",
            courseCode: "PACK1",
            courseExtent: 5,
        });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-pkg",
            [
                {
                    type: "CoursePackage",
                    name: "PACK1",
                    refId: "pkg-1",
                    startDate: "2025-02-01",
                    endDate: "2025-04-01",
                },
            ],
            "userPkg"
        );

        expect(CoursePackageMock.findById).toHaveBeenCalledWith("pkg-1");
        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(result.errors).toEqual([]);
        expect(studentDoc.save).toHaveBeenCalled();
    });
});

describe("CourseMatchingService.processStudentEducation additional scenarios", () => {
    it("records an error when a course package cannot be found", async () => {
        const packageQuery = {
            populate: vi.fn().mockResolvedValue(null),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-missing-pkg",
            [
                {
                    type: "CoursePackage",
                    name: "PACK-ERR",
                    refId: "pkg-not-found",
                },
            ],
            "user-missing"
        );

        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(result.errors).toEqual([
            {
                type: "no_package",
                packageId: "pkg-not-found",
                message: expect.stringContaining("pkg-not-found"),
            },
        ]);
    });

    it("warns when an individual course has no match", async () => {
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-match",
            [
                {
                    type: "Course",
                    name: "UNKNOWNCODE",
                },
            ],
            "user-warn"
        );

        expect(findMatchSpy).toHaveBeenCalledWith("UNKNOWNCODE");
        expect(result.warnings).toEqual([
            {
                type: "no_match",
                courseName: "UNKNOWNCODE",
                message: expect.stringContaining("UNKNOWNCODE"),
            },
        ]);

        findMatchSpy.mockRestore();
    });

    it("creates program enrollment and adds it to student education", async () => {
        const studentDoc = new StudentMock({
            _id: "stu-program",
            education: [],
            email: "program@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-program",
            [
                {
                    type: "Program",
                    refId: "prog-1",
                    name: "Program One",
                    startDate: "2025-03-01",
                    endDate: "2025-06-01",
                    teacherId: "teach-prog",
                    notes: "notes",
                },
            ],
            "user-program"
        );

        expect(result.enrollments).toHaveLength(0);
        expect(StudentEnrollmentMock.instances[0].slutprovDate).toBeUndefined();
        expect(StudentEnrollmentMock.instances[0].programId).toBe("prog-1");
        expect(studentDoc.education).toEqual([
            {
                type: "Program",
                refId: "prog-1",
                name: "Program One",
                startDate: new Date("2025-03-01"),
                endDate: new Date("2025-06-01"),
                grade: null,
                addedAt: expect.any(Date),
                addedBy: "user-program",
                removedAt: null,
            },
        ]);
        expect(studentDoc.save).toHaveBeenCalled();
    });

    it("handles grouped course package enrollments with 2.5 week courses", async () => {
        const packageDoc = {
            _id: "pkg-grouped",
            coursePackageName: "Grouped Package",
            coursePackageCourses: [
                {
                    _id: "group-course-1",
                    courseName: "Group Course 1",
                    courseExtent: 2.5,
                },
                {
                    _id: "group-course-2",
                    courseName: "Group Course 2",
                    courseExtent: 2.5,
                },
            ],
        };

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const studentDoc = new StudentMock({
            _id: "stu-grouped",
            education: [],
            teacherId: "teacher-group",
            email: "group@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        StudentEnrollmentMock.findOne.mockResolvedValue(null);

        const firstInstance = {
            _id: "ci-group-1",
            courseName: "Group Course 1 Name",
        };
        const secondInstance = {
            _id: "ci-group-2",
            courseName: "Group Course 2 Name",
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValueOnce({
                instance: firstInstance,
                wasCreated: true,
            })
            .mockResolvedValueOnce({
                instance: secondInstance,
                wasCreated: true,
            });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-grouped",
            [
                {
                    type: "CoursePackage",
                    name: "Grouped Package",
                    refId: "pkg-grouped",
                    startDate: "2025-02-01",
                    endDate: "2025-06-01",
                    teacherId: "teacher-for-package",
                },
            ],
            "user-grouped"
        );

        findOrCreateSpy.mockRestore();

        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(result.errors).toEqual([]);
        expect(result.enrollments).toHaveLength(2);
        expect(result.warnings).toEqual([
            {
                type: "package_added",
                packageName: "Grouped Package",
                studentId: "stu-grouped",
                message: expect.stringContaining("Grouped Package"),
            },
        ]);
        expect(studentDoc.education.filter((entry) => entry.type === "Course"))
            .toHaveLength(2);
        expect(
            studentDoc.education.some(
                (entry) => entry.type === "CoursePackage"
            )
        ).toBe(true);
        expect(studentDoc.save).toHaveBeenCalled();
    });

    it("warns when course entry has start/end but no match", async () => {
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-match-2",
            [
                {
                    type: "Course",
                    name: "UNKNOWN",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                },
            ],
            "user-warn-2"
        );

        expect(findMatchSpy).toHaveBeenCalled();
        expect(result.warnings).toEqual([
            {
                type: "no_match",
                courseName: "UNKNOWN",
                message: expect.stringContaining("UNKNOWN"),
            },
        ]);

        findMatchSpy.mockRestore();
    });

    it("skips duplicate individual course enrollments", async () => {
        const match = {
            course: {
                _id: "course-dup",
                courseName: "Dup Course",
                courseCode: "DUP101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-dup",
            courseName: "Dup Course",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-02-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: false });

        StudentEnrollmentMock.findOne.mockResolvedValue({ _id: "existing" });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dup",
            [
                {
                    type: "Course",
                    name: "DUP101",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                    teacherId: "teacher-dup",
                },
            ],
            "user-dup"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
    });

    it("handles individual course entries without explicit dates by using the next Monday", async () => {
        const match = {
            course: {
                _id: "course-node-date",
                courseName: "No Date Course",
                courseCode: "NDATE101",
                courseExtent: "5",
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const nextMonday = new Date("2025-04-07");
        const getNextMondaySpy = vi
            .spyOn(CourseMatchingService, "getNextMonday")
            .mockReturnValue(nextMonday);

        const courseEnd = new Date("2025-05-12");
        const instance = {
            _id: "ci-no-date",
            courseName: "No Date Course",
            startDate: nextMonday,
            endDate: courseEnd,
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-no-date",
            education: [],
            email: "nodate@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-date",
            [
                {
                    type: "Course",
                    name: "NDATE101",
                },
            ],
            "user-no-date"
        );

        expect(getNextMondaySpy).toHaveBeenCalled();

        findMatchSpy.mockRestore();
        createSpy.mockRestore();
        getNextMondaySpy.mockRestore();
        expect(result.enrollments).toHaveLength(1);
        expect(StudentEnrollmentMock.instances[0].startDate).toEqual(
            nextMonday
        );
        expect(studentDoc.education).toHaveLength(1);
    });

    it("records instance_created warning when a new individual course instance is created", async () => {
        const match = {
            course: {
                _id: "course-new",
                courseName: "New Course",
                courseCode: "NEW101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-new-course",
            courseName: "New Course",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentMock.findById.mockResolvedValue(
            new StudentMock({
                _id: "stu-new-course",
                education: [],
                email: "new@student.com",
            })
        );

        const result = await CourseMatchingService.processStudentEducation(
            "stu-new-course",
            [
                {
                    type: "Course",
                    name: "NEW101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                },
            ],
            "user-new-course"
        );

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "instance_created",
                    courseName: "NEW101",
                }),
            ])
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();
    });

    it("continues when calendar event creation throws", async () => {
        const match = {
            course: {
                _id: "course-err",
                courseName: "Error Course",
                courseCode: "ERR101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-err",
            courseName: "Error Course",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-02-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: false });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentMock.findById.mockResolvedValue(
            new StudentMock({
                _id: "stu-event",
                education: [],
                email: "event@student.com",
            })
        );

        const getWednesdaySpy = vi
            .spyOn(CourseMatchingService, "getWednesdayOfWeek")
            .mockImplementation(() => {
                throw new Error("calendar fail");
            });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-event",
            [
                {
                    type: "Course",
                    name: "ERR101",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                    teacherId: "teacher-event",
                },
            ],
            "user-event"
        );

        expect(getWednesdaySpy).toHaveBeenCalled();

        findMatchSpy.mockRestore();
        createSpy.mockRestore();
        getWednesdaySpy.mockRestore();
        expect(result.errors).toEqual([]);
    });

    it("passes through when student document is missing during education updates", async () => {
        const match = {
            course: {
                _id: "course-no-student",
                courseName: "No Student Course",
                courseCode: "NST101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-no-student",
            courseName: "No Student Course",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: false });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentMock.findById.mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-absent",
            [
                {
                    type: "Course",
                    name: "NST101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                },
            ],
            "user-absent"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(1);
    });

    it("warns and skips when course package course instance cannot be created", async () => {
        const packageDoc = {
            _id: "pkg-skip",
            coursePackageName: "Skip Package",
            coursePackageCourses: [
                {
                    _id: "skip-course-1",
                    courseName: "Skip Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: null, wasCreated: false });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-skip",
            [
                {
                    type: "CoursePackage",
                    name: "Skip Course",
                    refId: "pkg-skip",
                    startDate: "2025-05-01",
                    endDate: "2025-06-01",
                },
            ],
            "user-skip"
        );

        findOrCreateSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
        expect(result.errors).toEqual([]);
    });

    it("deduplicates grouped pack second course when enrollment exists", async () => {
        const packageDoc = {
            _id: "pkg-dedup",
            coursePackageName: "Dedup Package",
            coursePackageCourses: [
                {
                    _id: "dedup-course-1",
                    courseName: "Dedup Course 1",
                    courseExtent: 2.5,
                },
                {
                    _id: "dedup-course-2",
                    courseName: "Dedup Course 2",
                    courseExtent: 2.5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const studentDoc = new StudentMock({
            _id: "stu-dedup",
            education: [],
            teacherId: "teacher-dedup",
            email: "dedup@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        StudentEnrollmentMock.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ _id: "existing-next" });

        const firstInstance = {
            _id: "ci-dedup-1",
            courseName: "Dedup Course 1",
        };
        const secondInstance = {
            _id: "ci-dedup-2",
            courseName: "Dedup Course 2",
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValueOnce({
                instance: firstInstance,
                wasCreated: true,
            })
            .mockResolvedValueOnce({
                instance: secondInstance,
                wasCreated: true,
            });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dedup",
            [
                {
                    type: "CoursePackage",
                    name: "Dedup Package",
                    refId: "pkg-dedup",
                    startDate: "2025-02-01",
                    endDate: "2025-08-01",
                },
            ],
            "user-dedup"
        );

        findOrCreateSpy.mockRestore();

        expect(result.enrollments).toHaveLength(1);
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: "package_added" }),
            ])
        );
    });

    it("skips individual course enrollment when instance is missing", async () => {
        const match = {
            course: {
                _id: "course-no-instance",
                courseName: "No Instance",
                courseCode: "NOI101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: null, wasCreated: false });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-instance",
            [
                {
                    type: "Course",
                    name: "NOI101",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                },
            ],
            "user-no-instance"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
    });

    it("records processing_error when match lookup throws", async () => {
        const error = new Error("match failure");
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockRejectedValue(error);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-error",
            [
                {
                    type: "Course",
                    name: "ERR501",
                },
            ],
            "user-error"
        );

        findMatchSpy.mockRestore();

        expect(result.errors).toEqual([
            {
                type: "processing_error",
                courseName: "ERR501",
                message: error.message,
            },
        ]);
    });

    it("adds CoursePackage entries to education and surfaces package_added warnings", async () => {
        const packageDoc = {
            _id: "pkg-force",
            coursePackageCode: "PKG1",
            coursePackageName: "Forced Package",
            coursePackageCourses: [
                {
                    _id: "pkg-course-1",
                    courseName: "Forced Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const courseInstance = {
            _id: "ci-force-1",
            courseName: "Forced Course",
            startDate: new Date("2025-02-03"),
            endDate: new Date("2025-03-03"),
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });

        const studentDoc = new StudentMock({
            _id: "stu-force",
            education: [],
            email: "force@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);
        StudentEnrollmentMock.findOne.mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-force",
            [
                {
                    type: "CoursePackage",
                    refId: "pkg-force",
                    startDate: "2025-02-01",
                    endDate: "2025-04-01",
                },
            ],
            "user-force"
        );

        findOrCreateSpy.mockRestore();

        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(CoursePackageMock.findById).toHaveBeenCalledWith("pkg-force");
        expect(CoursePackageMock.find).toHaveBeenCalled();
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: "package_added" }),
            ])
        );
        expect(studentDoc.education.some((entry) => entry.type === "CoursePackage")).toBe(
            true
        );
    });

    it("uses explicit slutprov date when provided for individual courses", async () => {
        const match = {
            course: {
                _id: "course-explicit",
                courseName: "Explicit Slutprov",
                courseCode: "EXPL101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-explicit",
            courseName: "Explicit Slutprov",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-explicit",
            education: [],
            email: "explict@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-explicit",
            [
                {
                    type: "Course",
                    name: "EXPL101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                    slutprovDate: "2025-03-29",
                },
            ],
            "user-explicit"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

    expect(result.enrollments).toHaveLength(1);
    expect(StudentEnrollmentMock.instances[0].slutprovDate).toEqual(
        new Date("2025-03-29")
    );
  });

  it("adds an education entry when an individual course is newly created", async () => {
    const match = {
      course: {
        _id: "course-add-ed",
        courseName: "Add Education",
        courseCode: "ADD101",
        courseExtent: 5,
      },
      score: 1,
    };
    const findMatchSpy = vi
      .spyOn(CourseMatchingService, "findBestCourseMatch")
      .mockResolvedValue(match);

    const instance = {
      _id: "ci-add-ed",
      courseName: "Add Education",
      startDate: new Date("2025-05-01"),
      endDate: new Date("2025-06-01"),
    };
    const createSpy = vi
      .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
      .mockResolvedValue({ instance, wasCreated: true });

    StudentEnrollmentMock.findOne.mockResolvedValue(null);
    const studentDoc = new StudentMock({
      _id: "stu-add-ed",
      education: [],
      email: "add@student.com",
    });
    StudentMock.findById.mockResolvedValue(studentDoc);

    const result = await CourseMatchingService.processStudentEducation(
      "stu-add-ed",
      [
        {
          type: "Course",
          name: "ADD101",
          startDate: "2025-05-01",
          endDate: "2025-06-01",
        },
      ],
      "user-add-ed"
    );

    findMatchSpy.mockRestore();
    createSpy.mockRestore();

    expect(studentDoc.education).toHaveLength(1);
    expect(studentDoc.save).toHaveBeenCalled();
    expect(studentDoc.education[0]).toEqual(
      expect.objectContaining({
        type: "Course",
        refId: "course-add-ed",
      })
    );
    expect(result.enrollments).toHaveLength(1);
  });

  it("continues when individual course taxpvt date is invalid", async () => {
        const match = {
            course: {
                _id: "course-bad-date",
                courseName: "Bad Date Course",
                courseCode: "BAD101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-bad-date",
            courseName: "Bad Date Course",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-bad-date",
            education: [],
            email: "baddate@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-bad-date",
            [
                {
                    type: "Course",
                    name: "BAD101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                    slutprovDate: "not-a-date",
                },
            ],
            "user-bad-date"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

    expect(result.enrollments).toHaveLength(1);
    expect(StudentEnrollmentMock.instances[0].slutprovDate).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it("logs and skips when calculating sluttprov date fails", async () => {
    const match = {
      course: {
        _id: "course-guard",
        courseName: "Guard Course",
        courseCode: "GUARD101",
        courseExtent: 5,
      },
      score: 1,
    };
    const findMatchSpy = vi
      .spyOn(CourseMatchingService, "findBestCourseMatch")
      .mockResolvedValue(match);

    const instance = {
      _id: "ci-guard",
      courseName: "Guard Course",
      startDate: new Date("2025-03-01"),
      endDate: new Date("2025-04-01"),
    };
    const createSpy = vi
      .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
      .mockResolvedValue({ instance, wasCreated: true });

    StudentEnrollmentMock.findOne.mockResolvedValue(null);
    const studentDoc = new StudentMock({
      _id: "stu-guard",
      education: [],
      email: "guard@student.com",
    });
    StudentMock.findById.mockResolvedValue(studentDoc);

    const result = await CourseMatchingService.processStudentEducation(
      "stu-guard",
      [
        {
          type: "Course",
          name: "GUARD101",
          startDate: "2025-03-01",
          endDate: "2025-04-01",
          slutprovDate: "not-a-date",
        },
      ],
      "user-guard"
    );

    findMatchSpy.mockRestore();
    createSpy.mockRestore();

    expect(studentDoc.education).toHaveLength(0);
    expect(studentDoc.save).not.toHaveBeenCalled();
    expect(result.enrollments).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it("skips package enrollments when provided slutprov date is invalid", async () => {
        const packageDoc = {
            _id: "pkg-invalid-slutprov",
            coursePackageName: "Invalid Slutprov Package",
            coursePackageCourses: [
                {
                    _id: "inv-course-1",
                    courseName: "Invalid Slutprov Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const instance = {
            _id: "ci-invalid",
            courseName: "Invalid Slutprov Course",
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-invalid",
            education: [],
            email: "invalid@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-invalid",
            [
                {
                    type: "CoursePackage",
                    name: "Invalid Slutprov Package",
                    refId: "pkg-invalid-slutprov",
                    startDate: "2025-05-01",
                    endDate: "2025-06-01",
                    slutprovDate: "not-a-date",
                },
            ],
            "user-invalid"
        );

        findOrCreateSpy.mockRestore();

        expect(result.enrollments).toHaveLength(1);
        expect(StudentEnrollmentMock.instances[0].slutprovDate).toBeUndefined();
    });

    it("filters duplicate education entries before adding a new one", async () => {
        const match = {
            course: {
                _id: "course-dup-ed",
                courseName: "Education Dup",
                courseCode: "EDU101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-dup-ed",
            courseName: "Education Dup",
            startDate: new Date("2025-07-01"),
            endDate: new Date("2025-08-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-dup-ed",
            education: [
                {
                    type: "Course",
                    refId: "course-dup-ed",
                    startDate: new Date("2025-07-01"),
                    endDate: new Date("2025-08-01"),
                },
            ],
            email: "duplicate@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dup-ed",
            [
                {
                    type: "Course",
                    name: "EDU101",
                    startDate: "2025-07-01",
                    endDate: "2025-08-01",
                },
            ],
            "user-dup-ed"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(studentDoc.education).toHaveLength(1);
        expect(result.enrollments).toHaveLength(1);
    });

    it("filters out enrollments that lack courseInstanceId", async () => {
        StudentEnrollmentMock.forceMissingCourseInstance = true;

        const match = {
            course: {
                _id: "course-no-instance-id",
                courseName: "No Instance ID",
                courseCode: "NOID101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-no-id",
            courseName: "No Instance ID",
            startDate: new Date("2025-09-01"),
            endDate: new Date("2025-10-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-no-instance-id",
            education: [],
            email: "noinstance@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        let result;
        try {
            result = await CourseMatchingService.processStudentEducation(
                "stu-no-instance-id",
                [
                    {
                        type: "Course",
                        name: "NOID101",
                        startDate: "2025-09-01",
                        endDate: "2025-10-01",
                    },
                ],
                "user-no-instance"
            );
        } finally {
            StudentEnrollmentMock.forceMissingCourseInstance = false;
        }

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
    });

    it("does not duplicate program education when already present", async () => {
        const studentDoc = {
            _id: "stu-program-existing",
            education: [
                {
                    type: "Program",
                    refId: "prog-dup",
                },
            ],
            save: vi.fn().mockResolvedValue(null),
            email: "existing@prog.com",
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-program-existing",
            [
                {
                    type: "Program",
                    refId: "prog-dup",
                    name: "Program Duplicate",
                },
            ],
            "user-program-existing"
        );

        expect(result.enrollments).toHaveLength(0);
        expect(studentDoc.save).not.toHaveBeenCalled();
    });
});
