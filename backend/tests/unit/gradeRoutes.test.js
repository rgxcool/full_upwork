import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/controllers/authController.js", () => ({
  authenticateUser: (req, res, next) => {
    const role = req.headers["x-user-role"] || "teacher";
    req.user = { role, userId: "64b000000000000000000123", name: "TestUser" };
    next();
  },
}));

const createLeanResult = (value) => ({
  lean: vi.fn().mockResolvedValue(value),
});

const createQueryChain = (result) => {
  const chain = {
    populate: vi.fn(() => chain),
    sort: vi.fn(() => chain),
    select: vi.fn(() => chain),
    lean: vi.fn(() => chain),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(result).catch(fn),
  };
  return chain;
};

const createEnrollmentRecord = (overrides = {}) => ({
  _id: "enroll-1",
  studentId: { _id: "stu1", name: "Student", email: "s@a", personalNumber: "123" },
  courseInstanceId: { _id: "ci1", courseName: "Math", courseCode: "MATH101" },
  mainCourseId: { _id: "course-1", courseName: "Math" },
  grade: null,
  endDate: new Date(Date.now() - 86400000),
  status: "completed",
  isGradeLocked: false,
  save: vi.fn().mockResolvedValue(true),
  ...overrides,
});

vi.mock("../../src/controllers/notificationController.js", () => ({
  createNotification: vi.fn(),
  resolveNotification: vi.fn(),
  evaluateGradingStatusAndNotify: vi.fn(),
  evaluateActionPlanStatusAndNotify: vi.fn(),
  checkPendingGradesAndNotify: vi.fn(),
}));

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    updateOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));
vi.mock("../../src/models/Notification.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("../../src/models/Course.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));
vi.mock("../../src/models/Program.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));
// The caller is a teacher User with a teacher profile; its id is the teacher id (#102).
vi.mock("../../src/models/User.js", () => {
  const teacherUser = { _id: "64b000000000000000000123", username: "TestUser" };
  const chain = () => ({ select: () => ({ lean: () => Promise.resolve(teacherUser) }), lean: () => Promise.resolve(teacherUser) });
  return {
    __esModule: true,
    default: { findOne: vi.fn(chain), findById: vi.fn(chain) },
  };
});
vi.mock("../../src/models/AuditLog.js", () => ({
  __esModule: true,
  default: {
    create: vi.fn(),
  },
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findById: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
  },
}));
vi.mock("../../src/models/GradingScale.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    distinct: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));

import gradeRoutes from "../../src/router/gradeRoutes.js";
import * as NotificationController from "../../src/controllers/notificationController.js";
import Notification from "../../src/models/Notification.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import Program from "../../src/models/Program.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import GradingScale from "../../src/models/GradingScale.js";

const app = express();
app.use(express.json());
app.use("/grades", gradeRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  StudentEnrollment.find.mockReturnValue(createQueryChain([]));
  Notification.findOne.mockResolvedValue(null);
  Notification.create.mockResolvedValue({ _id: "note" });
  Course.findById.mockResolvedValue({ lean: vi.fn().mockResolvedValue(null) });
  Program.findById.mockResolvedValue({ lean: vi.fn().mockResolvedValue(null) });
  CoursePackage.findById.mockResolvedValue({ lean: vi.fn().mockResolvedValue(null) });
});

// #103: grades live on enrollments only. Real ObjectIds so the shared lookup runs.
const STUDENT_ID = "6b0257e81f7384e36f6f23d8";
const COURSE_ID = "6b0257e81f7384e36f6f23e1";
const TEACHER_USER_ID = "64b000000000000000000123";
const gradeEnrollment = (extra = {}) => ({
  _id: "en-1",
  isGradeLocked: false,
  teacherId: TEACHER_USER_ID,
  save: vi.fn().mockResolvedValue(true),
  ...extra,
});
/** StudentEnrollment.findById(...).populate(...).populate(...).lean() for names. */
const namesLookup = (studentName, courseName) => ({
  populate: () => ({
    populate: () => ({
      lean: () => Promise.resolve({ studentId: { name: studentName }, mainCourseId: { courseName } }),
    }),
  }),
});

describe("PUT /grades/admin/unlock-grade", () => {
  it("returns 403 if user not admin", async () => {
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "teacher")
      .send({ studentId: "s", courseId: "c" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Endast admin");
  });

  it("unlocks the student's enrollment in the course and creates a notification", async () => {
    const enrollment = gradeEnrollment({ isGradeLocked: true });
    StudentEnrollment.findOne.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID });

    expect(res.status).toBe(200);
    expect(res.text).toContain("Betyg upplåst");
    expect(enrollment.isGradeLocked).toBe(false);
    expect(enrollment.save).toHaveBeenCalled();
    expect(Student.updateOne).not.toHaveBeenCalled();
  });
});



describe("GET /grades/students-to-grade", () => {
  it("lists enrollment rows only, never legacy Student.education rows", async () => {
    const now = new Date();
    const enrollmentData = [
      {
        _id: "en1",
        studentId: { _id: "stu1" },
        courseInstanceId: { _id: "ci1" },
        endDate: new Date(now.getTime() - 86400000),
        grade: null,
        motivation: "",
        comments: "",
        isGradeLocked: false,
        nationalTestPoints: 87,
      },
    ];
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain(enrollmentData));

    const res = await request(app)
      .get("/grades/students-to-grade")
      .set("x-user-role", "admin");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source).toBe("enrollment");
    expect(res.body[0].npScore).toBe(87);
    expect(res.body.some((row) => row.source === "student_education")).toBe(false);
  });

  it("maps batch fields (status, startDate, courseInstanceMeta) onto enrollment rows", async () => {
    const now = new Date();
    const enrollmentData = [
      {
        _id: "en-batch",
        studentId: { _id: "stu1" },
        courseInstanceId: {
          _id: "ci-batch",
          isActive: false,
          startDate: new Date(now.getTime() - 1209600000),
          endDate: new Date(now.getTime() - 86400000),
          mainCourseId: { _id: "course-batch", courseName: "Engelska", courseCode: "ENX" },
        },
        mainCourseId: { _id: "course-batch" },
        endDate: new Date(now.getTime() - 86400000),
        startDate: new Date(now.getTime() - 1209600000),
        status: "completed",
        grade: "C",
        motivation: "ok",
        comments: "",
        isGradeLocked: false,
        nationalTestPoints: null,
      },
    ];
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain(enrollmentData));

    const res = await request(app)
      .get("/grades/students-to-grade")
      .query({ includeGraded: "true" })
      .set("x-user-role", "admin");

    expect(res.status).toBe(200);
    const row = res.body.find((r) => r.source === "enrollment");
    expect(row.status).toBe("completed");
    expect(row.startDate).toBeTruthy();
    expect(row.courseInstanceMeta).toEqual({
      isActive: false,
      instanceStartDate: enrollmentData[0].courseInstanceId.startDate.toISOString(),
      instanceEndDate: enrollmentData[0].courseInstanceId.endDate.toISOString(),
    });
  });

  it("returns 500 when enrollment query fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/grades/students-to-grade");
    expect(res.status).toBe(500);
  });
});

describe("POST /grades/teacher/save-grade", () => {
  it("creates action plan notification when grade is F", async () => {
    StudentEnrollment.findOne.mockResolvedValueOnce(gradeEnrollment());
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID, grade: "F", reason: "fail" });
    expect(NotificationController.createNotification).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.text).toContain("Betyg sparat");
  });

  it("resolves notification when grade is good", async () => {
    StudentEnrollment.findOne.mockResolvedValueOnce(gradeEnrollment());
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID, grade: "A", reason: "utförligt" });
    expect(NotificationController.resolveNotification).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("returns 500 when saving the grade fails", async () => {
    StudentEnrollment.findOne.mockResolvedValueOnce(
      gradeEnrollment({ save: vi.fn().mockRejectedValue(new Error("boom")) })
    );
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID, grade: "B", reason: "motivering" });
    expect(res.status).toBe(500);
  });

  const validStudentId = "6b0257e81f7384e36f6f23d8";
  const validCourseId = "6b0257e81f7384e36f6f23e1";

  it("refuses to change a grade on a locked enrollment (no lock bypass)", async () => {
    const save = vi.fn();
    StudentEnrollment.findOne.mockResolvedValueOnce({ _id: "en1", isGradeLocked: true, save });
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .set("x-user-role", "admin")
      .send({ studentId: validStudentId, courseId: validCourseId, grade: "B", reason: "ändrat" });
    expect(res.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
    expect(Student.updateOne).not.toHaveBeenCalled();
  });

  it("persists the grade on the student's enrollment when one exists", async () => {
    const enrollment = { _id: "en1", isGradeLocked: false, courseInstanceId: "ci1", save: vi.fn().mockResolvedValue(true) };
    StudentEnrollment.findOne.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .set("x-user-role", "admin")
      .send({ studentId: validStudentId, courseId: validCourseId, grade: "C", reason: "motivering", npScore: 42 });
    expect(res.status).toBe(200);
    expect(enrollment.save).toHaveBeenCalled();
    expect(enrollment.grade).toBe("C");
    expect(enrollment.motivation).toBe("motivering");
    expect(enrollment.nationalTestPoints).toBe(42);
    expect(Student.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 instead of a false 200 when the student has no enrollment in the course", async () => {
    StudentEnrollment.findOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .set("x-user-role", "admin")
      .send({ studentId: validStudentId, courseId: validCourseId, grade: "A", reason: "bra" });
    expect(res.status).toBe(404);
    expect(NotificationController.createNotification).not.toHaveBeenCalled();
    expect(NotificationController.resolveNotification).not.toHaveBeenCalled();
  });

  it("requires a justification for every grade, not just F", async () => {
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .send({ studentId: "s", courseId: "c", grade: "C", reason: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Motivering krävs");
  });
});

describe("POST /grades/teacher/lock-grade", () => {
  it("locks the student's enrollment in the course", async () => {
    const enrollment = gradeEnrollment();
    StudentEnrollment.findOne.mockResolvedValueOnce(enrollment);
    StudentEnrollment.findById.mockReturnValueOnce(namesLookup("Test Elev", "Matematik"));
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Grade locked");
    expect(enrollment.isGradeLocked).toBe(true);
    expect(enrollment.save).toHaveBeenCalled();
    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "grade_locked",
        message: expect.stringContaining("Matematik"),
      })
    );
  });

  it("returns 404 when the student has no enrollment in the course", async () => {
    StudentEnrollment.findOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(res.status).toBe(404);
    expect(Notification.create).not.toHaveBeenCalled();
  });

  it("handles errors when locking a grade", async () => {
    StudentEnrollment.findOne.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID });

    expect(res.status).toBe(500);
  });

  it("rejects roles outside the grading scope", async () => {
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "student")
      .send({ studentId: "stu1", courseId: "course1" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Endast behörig personal");
    expect(Notification.create).not.toHaveBeenCalled();
  });
});

describe("PUT /grades/admin/unlock-grade by student and course", () => {
  it("returns 404 when the student has no enrollment in the course", async () => {
    StudentEnrollment.findOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(res.status).toBe(404);
  });

  it("handles unexpected errors", async () => {
    StudentEnrollment.findOne.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: STUDENT_ID, courseId: COURSE_ID });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /grades/enrollments/:id", () => {
  it("deletes enrollment", async () => {
    StudentEnrollment.findByIdAndDelete.mockResolvedValue({ _id: "en1" });
    const res = await request(app)
      .delete("/grades/enrollments/en1")
      .set("x-user-role", "admin");
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    StudentEnrollment.findByIdAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete("/grades/enrollments/en1")
      .set("x-user-role", "admin");
    expect(res.status).toBe(404);
  });

  it("handles errors when deleting enrollment", async () => {
    StudentEnrollment.findByIdAndDelete.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .delete("/grades/enrollments/en1")
      .set("x-user-role", "admin");
    expect(res.status).toBe(500);
  });
});

describe("GET /grades/locked-grades", () => {
  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .get("/grades/locked-grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(403);
  });

  it("returns locked grades for admin", async () => {
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain([{ _id: "en1" }]));
    const res = await request(app)
      .get("/grades/locked-grades")
      .set("x-user-role", "admin");
    expect(res.status).toBe(200);
    expect(res.body.lockedGrades).toHaveLength(1);
  });

  it("returns 500 when locked grade lookup fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/grades/locked-grades")
      .set("x-user-role", "admin");
    expect(res.status).toBe(500);
  });
});

describe("GET /grades/student/:studentId/grades", () => {
  it("returns student grades", async () => {
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain([{ _id: "en1" }]));
    const res = await request(app)
      .get("/grades/student/stu1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(res.body.grades).toHaveLength(1);
  });

  it("returns 500 when the student grade lookup fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/grades/student/stu1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(500);
  });
});

describe("GET /grades/course-instance/:courseInstanceId/grades", () => {
  it("returns course instance grades", async () => {
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain([{ _id: "en2" }]));
    const res = await request(app)
      .get("/grades/course-instance/ci1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("returns 500 when the course instance grade lookup fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/grades/course-instance/ci1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(500);
  });
});

describe("PUT /grades/update-grade/:enrollmentId", () => {
  it("updates grade when unlocked", async () => {
    const enrollment = createEnrollmentRecord();
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B", motivation: "progress", comments: "ok", nationalTestPoints: 92 });
    expect(enrollment.save).toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(enrollment.nationalTestPoints).toBe(92);
  });

  it("returns 404 when enrollment missing", async () => {
    StudentEnrollment.findById.mockResolvedValueOnce(null);
    const res = await request(app)
      .put("/grades/update-grade/missing")
      .set("x-user-role", "teacher")
      .send({ grade: "B", motivation: "motivering" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when grade locked", async () => {
    const enrollment = createEnrollmentRecord({ isGradeLocked: true });
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B", motivation: "motivering" });
    expect(res.status).toBe(403);
  });

  it("returns 500 when updating grade fails", async () => {
    StudentEnrollment.findById.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B", motivation: "motivering" });
    expect(res.status).toBe(500);
  });

  it("saves nationalTestPoints = 0 (not falsy-skipped)", async () => {
    const enrollment = createEnrollmentRecord();
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "E", motivation: "motivering", nationalTestPoints: 0 });
    expect(enrollment.save).toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(enrollment.nationalTestPoints).toBe(0);
  });

  it("returns 403 when teacher is not authorized for the course instance", async () => {
    const enrollment = createEnrollmentRecord({
      courseInstanceId: {
        _id: "ci1",
        responsibleTeacher: "other-teacher-id",
      },
    });
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "C", motivation: "motivering" });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("inte behörig");
  });

  it("allows authorized teacher when responsibleTeacher matches", async () => {
    const enrollment = createEnrollmentRecord({
      courseInstanceId: {
        _id: "ci1",
        responsibleTeacher: "64b000000000000000000123",
      },
    });
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B", motivation: "motivering" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("saves custom assessment resultType (e.g. speaking)", async () => {
    const enrollment = createEnrollmentRecord({
      assessmentResults: new Map(),
    });
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ resultType: "speaking", value: "B" });
    expect(res.status).toBe(200);
    expect(enrollment.assessmentResults.get("speaking")).toBe("B");
  });

  it("requires motivation for grade F", async () => {
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "F", motivation: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Motivering krävs");
  });

  it("requires motivation for every grade, not just F", async () => {
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B", motivation: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Motivering krävs");
  });
});

describe("Grading scales (/grades/grading-scale)", () => {
  const scalePayload = {
    term: "HT24",
    subject: "Matematik",
    scale: [
      { min: 90, grade: "A" },
      { min: 75, grade: "B" },
      { min: 60, grade: "C" },
      { min: 45, grade: "D" },
      { min: 30, grade: "E" },
    ],
  };

  beforeEach(() => {
    GradingScale.find.mockReset();
    GradingScale.distinct.mockReset();
    GradingScale.findOne.mockReset();
    GradingScale.create.mockReset();
    GradingScale.findById.mockReset();
    GradingScale.findByIdAndDelete.mockReset();
  });

  describe("GET /grades/grading-scale", () => {
    it("returns 403 for unauthenticated staff role", async () => {
      const res = await request(app)
        .get("/grades/grading-scale")
        .set("x-user-role", "student");
      expect(res.status).toBe(403);
    });

    it("lists scales, filtered by term and subject", async () => {
      GradingScale.find.mockReturnValueOnce(
        createQueryChain([{ _id: "scale-1", term: "HT24", subject: "Matematik" }])
      );
      const res = await request(app)
        .get("/grades/grading-scale?term=HT24&subject=Matematik")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(GradingScale.find).toHaveBeenCalledWith({ term: "HT24", subject: "Matematik" });
    });
  });

  describe("GET /grades/grading-scale/terms", () => {
    it("returns distinct terms sorted", async () => {
      GradingScale.distinct.mockResolvedValue(["VT25", "HT24"]);
      const res = await request(app)
        .get("/grades/grading-scale/terms")
        .set("x-user-role", "admin");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(["HT24", "VT25"]);
    });
  });

  describe("GET /grades/grading-scale/suggest", () => {
    it("returns the suggested grade for a score", async () => {
      GradingScale.findOne.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ _id: "scale-1", term: "HT24", subject: "Matematik", scale: scalePayload.scale }),
      });
      const res = await request(app)
        .get("/grades/grading-scale/suggest?term=HT24&subject=Matematik&points=82")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grade: "B", hasScale: true });
    });

    it("returns hasScale false when no scale exists", async () => {
      GradingScale.findOne.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      });
      const res = await request(app)
        .get("/grades/grading-scale/suggest?term=HT24&subject=Engelska&points=82")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grade: null, hasScale: false });
    });

    it("returns 400 when points are missing", async () => {
      const res = await request(app)
        .get("/grades/grading-scale/suggest?term=HT24&subject=Matematik")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /grades/grading-scale", () => {
    it("creates a scale as admin", async () => {
      GradingScale.findOne.mockResolvedValue(null);
      GradingScale.create.mockResolvedValue({ _id: "scale-1", ...scalePayload });
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(201);
      expect(res.body._id).toBe("scale-1");
    });

    it("rejects non-admin users", async () => {
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "teacher")
        .send(scalePayload);
      expect(res.status).toBe(403);
    });

    it("returns 409 when the term+subject already exists", async () => {
      GradingScale.findOne.mockResolvedValue({ _id: "scale-1" });
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(409);
    });

    it("returns 400 for an invalid term", async () => {
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "admin")
        .send({ ...scalePayload, term: "2024" });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /grades/grading-scale/:id", () => {
    it("updates a scale as admin", async () => {
      const existing = { _id: "scale-1", ...scalePayload, save: vi.fn().mockResolvedValue(true) };
      GradingScale.findById.mockResolvedValue(existing);
      GradingScale.findOne.mockResolvedValue(null);
      const res = await request(app)
        .put("/grades/grading-scale/scale-1")
        .set("x-user-role", "systemadmin")
        .send({ ...scalePayload, term: "VT25" });
      expect(res.status).toBe(200);
      expect(existing.term).toBe("VT25");
      expect(existing.save).toHaveBeenCalled();
    });

    it("returns 404 when the scale is missing", async () => {
      GradingScale.findById.mockResolvedValue(null);
      const res = await request(app)
        .put("/grades/grading-scale/missing")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(404);
    });

    it("returns 409 on duplicate term+subject", async () => {
      GradingScale.findById.mockResolvedValue({ _id: "scale-1" });
      GradingScale.findOne.mockResolvedValue({ _id: "scale-2" });
      const res = await request(app)
        .put("/grades/grading-scale/scale-1")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /grades/grading-scale/:id", () => {
    it("deletes a scale as admin", async () => {
      GradingScale.findByIdAndDelete.mockResolvedValue({ _id: "scale-1" });
      const res = await request(app)
        .delete("/grades/grading-scale/scale-1")
        .set("x-user-role", "admin");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 404 when the scale is missing", async () => {
      GradingScale.findByIdAndDelete.mockResolvedValue(null);
      const res = await request(app)
        .delete("/grades/grading-scale/missing")
        .set("x-user-role", "admin");
      expect(res.status).toBe(404);
    });

    it("rejects non-admin users", async () => {
      const res = await request(app)
        .delete("/grades/grading-scale/scale-1")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(403);
    });
  });

  describe("POST /grades/teacher/lock-grade & PUT /grades/admin/unlock-grade", () => {
    const mockEnrollment = () => ({
      populate: vi.fn(() => ({
        populate: vi.fn(() => ({
          _id: "en-1",
          isGradeLocked: false,
          studentId: { _id: "s-1", name: "Kalle Elev" },
          courseInstanceId: { courseName: "Svenska 1" },
          save: vi.fn().mockResolvedValue(true),
        })),
      })),
    });

    it("allows teachers to lock a grade and creates exactly one admin notification", async () => {
      StudentEnrollment.findById.mockReturnValueOnce(mockEnrollment());

      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "teacher")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(200);
      expect(res.body.locked).toBe(true);
      expect(Notification.create).toHaveBeenCalledTimes(1);
      const [notification] = Notification.create.mock.calls[0];
      expect(notification.type).toBe("grade_locked");
      expect(notification.message).toContain("Kalle Elev");
      expect(notification.message).toContain("Svenska 1");
      expect(notification.message).toContain("lärare TestUser");
      expect(notification.meta).toEqual(
        expect.objectContaining({
          studentId: "s-1",
          enrollmentId: "en-1",
          teacherId: "64b000000000000000000123",
          routedTo: "admin/systemadmin",
        })
      );
    });

    it("allows systemadmin to lock and still notifies admins", async () => {
      StudentEnrollment.findById.mockReturnValueOnce(mockEnrollment());

      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "systemadmin")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(200);
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(Notification.create.mock.calls[0][0].message).toContain("admin TestUser");
    });

    it("lets the enrollment's teacher lock by student and course and notifies with course context", async () => {
      const enrollment = gradeEnrollment();
      StudentEnrollment.findOne.mockResolvedValueOnce(enrollment);
      StudentEnrollment.findById.mockReturnValueOnce(namesLookup("Test Elev", "Engelska 5"));

      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "teacher")
        .send({ studentId: STUDENT_ID, courseId: COURSE_ID });

      expect(res.status).toBe(200);
      expect(enrollment.isGradeLocked).toBe(true);
      expect(Notification.create).toHaveBeenCalledTimes(1);
      const [notification] = Notification.create.mock.calls[0];
      expect(notification.type).toBe("grade_locked");
      expect(notification.message).toContain("Test Elev");
      expect(notification.message).toContain("Engelska 5");
      expect(notification.meta).toEqual(
        expect.objectContaining({ studentId: STUDENT_ID, courseId: COURSE_ID })
      );
    });

    it("refuses a teacher who is not on the enrollment", async () => {
      const enrollment = gradeEnrollment({ teacherId: "64b0000000000000000009ff" });
      StudentEnrollment.findOne.mockResolvedValueOnce(enrollment);

      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "teacher")
        .send({ studentId: STUDENT_ID, courseId: COURSE_ID });

      expect(res.status).toBe(403);
      expect(enrollment.save).not.toHaveBeenCalled();
      expect(Notification.create).not.toHaveBeenCalled();
    });

    it("returns 400 and does not notify when neither student nor enrollment is provided", async () => {
      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "teacher")
        .send({});

      expect(res.status).toBe(400);
      expect(Notification.create).not.toHaveBeenCalled();
    });

    it("allows admin to unlock a grade and creates an unlock notification", async () => {
      StudentEnrollment.findById.mockReturnValueOnce({
        populate: vi.fn(() => ({
          populate: vi.fn(() => ({
            _id: "en-1",
            isGradeLocked: true,
            studentId: { _id: "s-1", name: "Kalle Elev" },
            courseInstanceId: { courseName: "Svenska 1" },
            save: vi.fn().mockResolvedValue(true),
          })),
        })),
      });

      const res = await request(app)
        .put("/grades/admin/unlock-grade")
        .set("x-user-role", "admin")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(200);
      expect(res.text).toContain("Betyg upplåst");
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "grade_unlocked",
          message: expect.stringContaining("Kalle Elev"),
        })
      );
    });

    it("rejects non-admin users attempting to unlock", async () => {
      const res = await request(app)
        .put("/grades/admin/unlock-grade")
        .set("x-user-role", "teacher")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(403);
      expect(Notification.create).not.toHaveBeenCalled();
    });
  });
});
