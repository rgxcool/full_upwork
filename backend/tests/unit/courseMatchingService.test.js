import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const baseCourse = {
  _id: "course-ref",
  courseName: "Course Ref",
  courseCode: "COURSE-CODE",
  coursePoints: 10,
  courseExtent: "5",
};

const CourseMock = {
  find: vi.fn(),
  findById: vi.fn(),
};

const CourseInstanceMock = vi.fn(function (data) {
  Object.assign(this, data);
  this._id = data._id || "ci-" + Math.random().toString(36).slice(2, 8);
  this.save = vi.fn().mockResolvedValue(this);
  this.toObject = vi.fn(() => ({ ...this }));
});
CourseInstanceMock.findOne = vi.fn();

const StudentEnrollmentConstructor = vi.fn(function (data) {
  Object.assign(this, data);
  this._id = data._id || "enroll-" + Math.random().toString(36).slice(2, 8);
  this.save = vi.fn().mockResolvedValue(this);
  this.toObject = vi.fn(() => ({ ...this }));
});
StudentEnrollmentConstructor.findOne = vi.fn();

const StudentModelMock = {
  findById: vi.fn(),
};

const CoursePackageMock = {
  find: vi.fn(),
  findById: vi.fn(),
};

vi.mock("../../src/models/Course.js", () => ({
  __esModule: true,
  default: CourseMock,
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
  __esModule: true,
  default: CourseInstanceMock,
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
  __esModule: true,
  default: StudentEnrollmentConstructor,
}));
vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: StudentModelMock,
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
  __esModule: true,
  default: CoursePackageMock,
}));

const studentDoc = {
  _id: "student-1",
  name: "Test Student",
  email: "student@example.com",
  education: [],
  teacherId: "teacher-1",
  save: vi.fn().mockResolvedValue(true),
};

beforeEach(() => {
  vi.clearAllMocks();
  studentDoc.education = [];
  StudentModelMock.findById.mockResolvedValue(studentDoc);
  global._StudentModel = StudentModelMock;

  CoursePackageMock.find.mockReturnValue({
    lean: async () => [],
  });
  CoursePackageMock.findById.mockReturnValue({
    populate: async () => null,
  });
  CourseMock.findById.mockResolvedValue({ ...baseCourse });
  CourseInstanceMock.findOne.mockResolvedValue(null);
  StudentEnrollmentConstructor.findOne.mockResolvedValue(null);
});

afterEach(() => {
  delete global._StudentModel;
  vi.restoreAllMocks();
});

describe("CourseMatchingService helpers", () => {
  it("normalizes dates and names correctly", () => {
    expect(
      CourseMatchingService.getNextMonday(new Date("2025-06-05"))
        .getDay()
    ).toBe(1);
    expect(
      CourseMatchingService.addWeeks(new Date("2025-06-01"), 2).getTime()
    ).toBe(new Date("2025-06-15").getTime());
    expect(
      CourseMatchingService.getWednesdayOfWeek("2025-06-01", 2)
        .getDay()
    ).toBe(3);
    expect(
      CourseMatchingService.cleanCourseName("Intro to (something) mot, info|extra")
    ).toBe("INTRO TO INFOEXTRA");
  });
});

describe("findBestCourseMatch", () => {
  it("returns the exact match when codes normalize to same value", async () => {
    CourseMock.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { courseCode: "  ABC123 ", courseName: "Demo", _id: "course-1" },
      ]);

    const result = await CourseMatchingService.findBestCourseMatch("abc123");
    expect(result).toEqual({
      course: expect.objectContaining({ _id: "course-1" }),
      score: 1,
    });
  });

  it("returns null when there are no normalized matches", async () => {
    CourseMock.find
      .mockResolvedValueOnce([{ courseCode: "XXX", _id: "course-2" }])
      .mockResolvedValueOnce([{ courseCode: "YYY", _id: "course-3" }]);
    const result = await CourseMatchingService.findBestCourseMatch("nope");
    expect(result).toBeNull();
  });
});

describe("findOrCreateCourseInstance", () => {
  it("returns existing instance when found and updates metadata", async () => {
    const existing = {
      _id: "ci-existing",
      courseName: "Existing",
      startDate: new Date("2025-03-01"),
      endDate: new Date("2025-06-01"),
      responsibleTeacher: {
        toString: () => "teacher-old",
      },
      save: vi.fn().mockResolvedValue(true),
      courseNameRef: "Existing",
      toObject: function () {
        return { ...this };
      },
    };
    CourseInstanceMock.findOne.mockResolvedValue(existing);
    await CourseMatchingService.findOrCreateCourseInstance(
      "main-course",
      new Date("2025-03-01"),
      new Date("2025-06-01"),
      "user-id",
      "teacher-new",
      undefined
    );
    expect(existing.save).toHaveBeenCalled();
  });

  it("creates a new instance when none exists", async () => {
    CourseInstanceMock.findOne.mockResolvedValue(null);
    CourseMock.findById.mockResolvedValue({
      _id: "main-course",
      courseName: "Main",
      courseCode: "MCODE",
      coursePoints: 10,
      courseExtent: 5,
    });
    const result = await CourseMatchingService.findOrCreateCourseInstance(
      "main-course",
      new Date("2025-07-01"),
      new Date("2025-10-01"),
      "user-id",
      null,
      new Date("2025-09-01")
    );
    expect(result.wasCreated).toBe(true);
    expect(result.instance).toBeInstanceOf(CourseInstanceMock);
  });
});

describe("processStudentEducation", () => {
  it("processes a course entry and creates enrollment", async () => {
    const findBestSpy = vi
      .spyOn(CourseMatchingService, "findBestCourseMatch")
      .mockResolvedValue({ course: { ...baseCourse } });
    CourseInstanceMock.findOne.mockResolvedValue(null);
    StudentEnrollmentConstructor.findOne.mockResolvedValue(null);
    CoursePackageMock.find.mockReturnValue({
      lean: async () => [],
    });

    const results = await CourseMatchingService.processStudentEducation(
      "student-1",
      [
        {
          type: "Course",
          name: "Course Code",
          startDate: "2025-07-01",
          endDate: "2025-08-01",
          notes: "note",
        },
      ],
      "admin"
    );

    expect(results.errors).toHaveLength(0);
    expect(StudentEnrollmentConstructor).toHaveBeenCalled();
    expect(
      results.warnings.some((warning) => warning.type === "instance_created")
    ).toBe(true);
    expect(studentDoc.education).toHaveLength(1);
    expect(studentDoc.education[0]).toMatchObject({
      type: "Course",
      refId: baseCourse._id,
    });
    findBestSpy.mockRestore();
  });

  it("processes a program entry and adds education entry", async () => {
    StudentEnrollmentConstructor.findOne.mockResolvedValue(null);
    CoursePackageMock.find.mockReturnValue({
      lean: async () => [],
    });

    const programEntry = {
      type: "Program",
      name: "Test Program",
      refId: "program-1",
      startDate: "2025-09-01",
      endDate: "2025-09-30",
      teacherId: "teacher-2",
    };

    const results = await CourseMatchingService.processStudentEducation(
      "student-1",
      [programEntry],
      "admin"
    );

    expect(StudentEnrollmentConstructor).toHaveBeenCalled();
    expect(StudentEnrollmentConstructor.mock.calls[0][0]).toMatchObject({
      programId: "program-1",
    });
    expect(studentDoc.education).toHaveLength(1);
    expect(studentDoc.education[0]).toMatchObject({
      type: "Program",
      refId: "program-1",
    });
    expect(results.enrollments).toHaveLength(0);
  });

  it("processes a course package entry and schedules included courses", async () => {
    const packageCourse = {
      _id: "package-course-1",
      courseName: "Package Course 1",
      courseCode: "PACKAGE-COURSE-1",
      courseExtent: "5",
      coursePoints: 8,
    };
    const packageDoc = {
      _id: "package-1",
      coursePackageName: "Test Package",
      coursePackageCode: "PKG1",
      coursePackageCourses: [packageCourse],
    };
    CoursePackageMock.find.mockReturnValue({
      lean: async () => [packageDoc],
    });
    CoursePackageMock.findById.mockReturnValue({
      ...packageDoc,
      populate: async () => packageDoc,
    });
    StudentEnrollmentConstructor.findOne.mockResolvedValue(null);
    CourseInstanceMock.findOne.mockResolvedValue(null);

    const results = await CourseMatchingService.processStudentEducation(
      "student-1",
      [
        {
          type: "CoursePackage",
          name: "Test Package",
          refId: "package-1",
          startDate: "2025-09-01",
          endDate: "2025-10-31",
        },
      ],
      "admin"
    );

    expect(StudentEnrollmentConstructor).toHaveBeenCalled();
    expect(results.warnings.some((warning) => warning.type === "package_added")).toBe(true);
    expect(studentDoc.education.some((entry) => entry.type === "CoursePackage")).toBe(true);
  });
});
