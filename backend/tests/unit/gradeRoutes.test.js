import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockStudentFind = vi.fn();
const mockStudentUpdateOne = vi.fn();
const mockStudentFindById = vi.fn();

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    find: mockStudentFind,
    updateOne: mockStudentUpdateOne,
    findById: mockStudentFindById,
  },
}));

const mockNotificationFindOne = vi.fn();
const mockNotificationCreateModel = vi.fn();
vi.mock("../../src/models/Notification.js", () => ({
  __esModule: true,
  default: {
    findOne: mockNotificationFindOne,
    create: mockNotificationCreateModel,
  },
}));

const mockCourseFindById = vi.fn();
vi.mock("../../src/models/Course.js", () => ({
  __esModule: true,
  default: {
    findById: mockCourseFindById,
  },
}));

const mockProgramFindById = vi.fn();
vi.mock("../../src/models/Program.js", () => ({
  __esModule: true,
  default: {
    findById: mockProgramFindById,
  },
}));

const mockCoursePackageFindById = vi.fn();
vi.mock("../../src/models/CoursePackage.js", () => ({
  __esModule: true,
  default: {
    findById: mockCoursePackageFindById,
  },
}));

const mockEnrollmentFind = vi.fn();
const mockEnrollmentFindById = vi.fn();
const mockEnrollmentFindByIdAndDelete = vi.fn();
vi.mock("../../src/models/StudentEnrollment.js", () => ({
  __esModule: true,
  default: {
    find: (...args) => mockEnrollmentFind(...args),
    findById: (...args) => mockEnrollmentFindById(...args),
    findByIdAndDelete: (...args) => mockEnrollmentFindByIdAndDelete(...args),
  },
}));

const mockCreateNotification = vi.fn();
const mockResolveNotification = vi.fn();
const mockEvaluateGradingStatusAndNotify = vi.fn();
const mockEvaluateActionPlanStatusAndNotify = vi.fn();
vi.mock("../../src/controllers/notificationController.js", () => ({
  __esModule: true,
  createNotification: (...args) => mockCreateNotification(...args),
  resolveNotification: (...args) => mockResolveNotification(...args),
  evaluateGradingStatusAndNotify: (...args) =>
    mockEvaluateGradingStatusAndNotify(...args),
  evaluateActionPlanStatusAndNotify: (...args) =>
    mockEvaluateActionPlanStatusAndNotify(...args),
  checkPendingGradesAndNotify: vi.fn(),
}));

const authState = { role: "admin", userId: "admin-id", name: "Admin" };
const setAuthState = (updates) => Object.assign(authState, updates);
vi.mock("../../src/controllers/authController.js", () => ({
  __esModule: true,
  authenticateUser: (req, _res, next) => {
    req.user = { ...authState };
    next();
  },
  setAuthContext: (updates) => setAuthState(updates),
}));

const createQueryable = (result) => {
  const promise = Promise.resolve(result);
  return {
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnValue(promise),
    sort: vi.fn().mockReturnValue(promise),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  };
};

const createLeanQuery = (result) => createQueryable(result);
const createSortQuery = (result) => createQueryable(result);

const createLeanResult = (result) => ({
  lean: vi.fn().mockResolvedValue(result),
});

let gradeRoutes;
let setAuthContext;

beforeAll(async () => {
  const auth = await import("../../src/controllers/authController.js");
  setAuthContext = auth.setAuthContext;
  gradeRoutes = (await import("../../src/router/gradeRoutes.js")).default;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockStudentFind.mockReset();
  mockStudentUpdateOne.mockReset();
  mockStudentFindById.mockReset();
  mockNotificationFindOne.mockReset();
  mockNotificationCreateModel.mockReset();
  mockCourseFindById.mockReset();
  mockProgramFindById.mockReset();
  mockCoursePackageFindById.mockReset();
  mockEnrollmentFind.mockReset();
  mockEnrollmentFindById.mockReset();
  mockEnrollmentFindByIdAndDelete.mockReset();
  mockCreateNotification.mockReset();
  mockResolveNotification.mockReset();
  mockEvaluateGradingStatusAndNotify.mockReset();
  mockEvaluateActionPlanStatusAndNotify.mockReset();

  mockStudentFind.mockImplementation(() => createLeanQuery([]));
  mockNotificationFindOne.mockResolvedValue(null);
  mockCourseFindById.mockImplementation(() => createLeanResult(null));
  mockProgramFindById.mockImplementation(() => createLeanResult(null));
  mockCoursePackageFindById.mockImplementation(() => createLeanResult(null));
  mockEnrollmentFind.mockReturnValue(createLeanQuery([]));
  mockEnrollmentFindById.mockResolvedValue(null);
  mockEnrollmentFindByIdAndDelete.mockResolvedValue(null);

  setAuthContext({ role: "admin", userId: "admin-id", name: "Admin" });
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/grade", gradeRoutes);
  return app;
};

describe("gradeRoutes", () => {
  it("lists ungraded students and enriches education entries", async () => {
    const student = {
      _id: "stu1",
      name: "Student One",
      personalNumber: "123",
      email: "student@test",
      education: [
        {
          _id: "edu1",
          type: "Course",
          refId: "course1",
          grade: "",
          locked: false,
          removedAt: null,
          redId: "red1",
        },
        {
          _id: "edu2",
          type: "Course",
          refId: "course2",
          grade: "F",
          locked: true,
          removedAt: null,
          redId: "red2",
        },
      ],
    };

    mockEvaluateGradingStatusAndNotify.mockResolvedValue();
    mockStudentFind.mockReturnValueOnce(createLeanQuery([student]));
    mockNotificationFindOne.mockResolvedValue(true);
    mockCourseFindById.mockImplementation((id) =>
      createLeanResult({
        courseName: id === "course1" ? "English" : "Science",
      })
    );

    const response = await request(buildApp()).get(
      "/grade/students/ungraded"
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    const [result] = response.body;
    expect(result).toMatchObject({
      studentId: "stu1",
      name: "Student One",
      personalNumber: "123",
      email: "student@test",
    });
    expect(result.ungradedEducation).toHaveLength(2);
    expect(result.ungradedEducation[1]).toMatchObject({
      displayName: "Science",
      requireActionPlan: true,
      isGraded: true,
    });
    expect(mockEvaluateGradingStatusAndNotify).toHaveBeenCalled();
  });

  it("returns 500 when underlying query fails", async () => {
    mockStudentFind.mockRejectedValueOnce(new Error("boom"));
    const response = await request(buildApp()).get(
      "/grade/students/ungraded"
    );
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: "Serverfel vid hämtning av elever",
    });
  });

  it("unlocks grade with admin privileges", async () => {
    mockStudentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    const body = { studentId: "stu1", courseId: "course1" };
    const response = await request(buildApp())
      .put("/grade/admin/unlock-grade")
      .send(body);

    expect(response.status).toBe(200);
    expect(response.text).toBe("Betyg upplåst");
    expect(mockNotificationCreateModel).toHaveBeenCalledWith({
      type: "grade_unlocked",
      message: expect.stringContaining("Admin"),
      meta: { studentId: "stu1", courseId: "course1" },
      resolved: false,
    });
  });

  it("returns 404 when unlock target is missing", async () => {
    mockStudentUpdateOne.mockResolvedValue({ matchedCount: 0 });
    const response = await request(buildApp())
      .put("/grade/admin/unlock-grade")
      .send({ studentId: "missing", courseId: "courseX" });

    expect(response.status).toBe(404);
    expect(response.text).toBe("Kurs hittades inte");
  });

  it("blocks non-admin users from unlock route", async () => {
    setAuthContext({ role: "teacher" });
    const response = await request(buildApp())
      .put("/grade/admin/unlock-grade")
      .send({ studentId: "stu1", courseId: "course1" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Endast admin/systemadmin kan låsa upp.",
    });
  });

  it("combines enrollments and past education in students-to-grade", async () => {
    const enrollmentRow = {
      _id: "enr1",
      studentId: { name: "From Enrollment" },
      courseInstanceId: { courseName: "Instance Course" },
      endDate: new Date(Date.now() - 100000),
      grade: null,
      status: "active",
    };
    const studentRow = {
      _id: "stu-old",
      name: "Old Student",
      email: "old@example.com",
      education: [
        {
          _id: "edu-old",
          removedAt: null,
          endDate: new Date(Date.now() - 200000),
          grade: "",
        },
      ],
    };
    mockEnrollmentFind.mockReturnValueOnce(createLeanQuery([enrollmentRow]));
    mockStudentFind.mockReturnValueOnce(createLeanQuery([studentRow]));

  const response = await request(buildApp()).get(
    "/grade/students-to-grade"
  );

  expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ enrollmentId: "enr1" }),
        expect.objectContaining({ source: "student_education" }),
      ])
    );
  });

  it("saves grade and creates action plan notification for F", async () => {
    mockStudentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockEvaluateGradingStatusAndNotify.mockResolvedValue();
    mockEvaluateActionPlanStatusAndNotify.mockResolvedValue();

    const response = await request(buildApp())
      .post("/grade/teacher/save-grade")
      .send({
        studentId: "stu1",
        courseId: "course1",
        grade: "F",
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe("✅ Betyg sparat!");
    expect(mockCreateNotification).toHaveBeenCalledWith({
      studentId: "stu1",
      courseId: "course1",
      type: "action_plan_required",
      message: expect.any(String),
    });
    expect(mockResolveNotification).not.toHaveBeenCalled();
  });

  it("saves a normal grade and resolves existing notifications", async () => {
    mockStudentUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockEvaluateGradingStatusAndNotify.mockResolvedValue();
    mockEvaluateActionPlanStatusAndNotify.mockResolvedValue();

    const response = await request(buildApp())
      .post("/grade/teacher/save-grade")
      .send({
        studentId: "stu1",
        courseId: "course1",
        grade: "B",
      });

    expect(response.status).toBe(200);
    expect(mockResolveNotification).toHaveBeenCalledWith({
      studentId: "stu1",
      courseId: "course1",
      type: "action_plan_required",
    });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("locks a grade entry when the education exists", async () => {
    const studentRecord = {
      education: [
        { refId: "course1", locked: false },
      ],
      save: vi.fn().mockResolvedValue(),
    };
    mockStudentFindById.mockResolvedValue(studentRecord);

    const response = await request(buildApp())
      .post("/grade/teacher/lock-grade")
      .send({ studentId: "stu1", courseId: "course1" });

    expect(response.status).toBe(200);
    expect(studentRecord.education[0].locked).toBe(true);
    expect(studentRecord.save).toHaveBeenCalled();
  });

  it("returns 404 when student is missing during lock", async () => {
    mockStudentFindById.mockResolvedValue(null);
    const response = await request(buildApp())
      .post("/grade/teacher/lock-grade")
      .send({ studentId: "missing", courseId: "courseX" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Student not found" });
  });

  it("deletes enrollments when found", async () => {
    mockEnrollmentFindByIdAndDelete.mockResolvedValue({ _id: "enr1" });
    const response = await request(buildApp()).delete(
      "/grade/enrollments/enr1"
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Enrollment deleted",
    });
  });

  it("reports 404 if enrollment was already gone", async () => {
    mockEnrollmentFindByIdAndDelete.mockResolvedValue(null);
    const response = await request(buildApp()).delete(
      "/grade/enrollments/missing"
    );
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Enrollment not found" });
  });

  it("debug endpoint lists enrollments and student education", async () => {
    const now = new Date();
    const enrollmentData = [
      {
        _id: "enr-debug",
        studentId: { name: "Debug Student" },
        mainCourseId: { courseName: "Main Course" },
        endDate: new Date(now.getTime() - 1000),
        status: "active",
        grade: "A",
        teacherId: { userId: { username: "teacher1" } },
      },
    ];
    const students = [
      {
        _id: "stu-debug",
        name: "Debug Student",
        teacherId: { userId: { username: "teacher1" } },
        education: [
          {
            _id: "edu-debug",
            name: "Debug Course",
            endDate: new Date(now.getTime() - 1000),
            grade: null,
            locked: false,
          },
        ],
      },
    ];
    mockEnrollmentFind.mockReturnValueOnce(createLeanQuery(enrollmentData));
    mockStudentFind.mockReturnValueOnce(createLeanQuery(students));

  const response = await request(buildApp()).get(
    "/grade/debug/students-past-end-date"
  );

  expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body.debug.enrollments.total).toBe(1);
    expect(response.body.debug.students.total).toBe(1);
  });

  it("protects locked-grades endpoint for non-admin roles", async () => {
    setAuthContext({ role: "teacher" });
    const response = await request(buildApp()).get("/grade/locked-grades");
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Only administrators can view locked grades",
    });
  });

  it("returns locked grades when authorized", async () => {
    const lockedGrades = [
      { _id: "lock1", isGradeLocked: true },
    ];
    mockEnrollmentFind.mockReturnValueOnce(createSortQuery(lockedGrades));
    const response = await request(buildApp()).get("/grade/locked-grades");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      lockedGrades,
      total: lockedGrades.length,
    });
  });

  it("fetches student-specific grades", async () => {
    const grades = [{ _id: "grade1", grade: "A" }];
    mockEnrollmentFind.mockReturnValueOnce(createSortQuery(grades));

    const response = await request(buildApp()).get(
      "/grade/student/stu1/grades"
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      grades,
      total: grades.length,
    });
  });

  it("fetches course-instance grades", async () => {
    const grades = [{ _id: "grade2", grade: "B" }];
    mockEnrollmentFind.mockReturnValueOnce(createSortQuery(grades));

    const response = await request(buildApp()).get(
      "/grade/course-instance/instance1/grades"
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      grades,
      total: grades.length,
    });
  });

  it("updates grade when enrollment exists and is unlocked", async () => {
    const enrollment = {
      isGradeLocked: false,
      save: vi.fn().mockResolvedValue(),
    };
    mockEnrollmentFindById.mockResolvedValue(enrollment);

    const response = await request(buildApp())
      .put("/grade/update-grade/enr1")
      .send({ grade: "A", comments: "done" });

    expect(response.status).toBe(200);
    expect(enrollment.grade).toBe("A");
    expect(enrollment.comments).toBe("done");
    expect(enrollment.gradeBy).toBe("admin-id");
    expect(enrollment.save).toHaveBeenCalled();
  });

  it("prevents updates when grade is locked", async () => {
    mockEnrollmentFindById.mockResolvedValue({ isGradeLocked: true });
    const response = await request(buildApp())
      .put("/grade/update-grade/enr-lock")
      .send({ grade: "C" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Grade is locked and cannot be modified",
    });
  });

  it("returns 404 when enrollment cannot be found for update", async () => {
    mockEnrollmentFindById.mockResolvedValue(null);
    const response = await request(buildApp())
      .put("/grade/update-grade/missing")
      .send({ grade: "C" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Enrollment not found" });
  });
});
