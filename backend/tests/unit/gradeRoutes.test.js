import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/controllers/authController.js", () => ({
  authenticateUser: (req, res, next) => {
    const role = req.headers["x-user-role"] || "teacher";
    req.user = { role, userId: "user123", name: "TestUser" };
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
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(result).catch(fn),
  };
  return chain;
};

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
  },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
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

const app = express();
app.use(express.json());
app.use("/grades", gradeRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /grades/students/ungraded", () => {
  it("returns enriched student list with course meta", async () => {
    Student.find.mockReturnValueOnce(
      createLeanResult([
        {
          _id: "stu1",
          name: "Student",
          email: "a@b",
          personalNumber: "123",
          education: [
            { refId: "course1", type: "Course", grade: null, locked: false, removedAt: null },
            { refId: "course2", type: "Course", grade: "F", locked: true, removedAt: null },
          ],
        },
      ])
    );
    Notification.findOne.mockResolvedValue({ _id: "not1" });
    Course.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ courseName: "Math" }) });
    Course.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ courseName: "Science" }) });
    const res = await request(app).get("/grades/students/ungraded");

    expect(NotificationController.evaluateGradingStatusAndNotify).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body[0].ungradedEducation).toHaveLength(2);
    expect(res.body[0].ungradedEducation[0].displayName).toBe("Math");
  });
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

  it("unlocks grade and creates notification", async () => {
    Student.updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "s", courseId: "c" });

    expect(Student.updateOne).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.text).toContain("Betyg upplåst");
  });
});

describe("GET /grades/students-to-grade", () => {
  it("returns combined enrollments and education results", async () => {
    const now = new Date();
    const enrollmentData = [
      {
        _id: "en1",
        studentId: { _id: "stu1" },
        courseInstanceId: { _id: "ci1" },
        endDate: new Date(now.getTime() - 86400000),
        grade: null,
      },
    ];
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain(enrollmentData));
    Student.find.mockReturnValueOnce(
      createLeanResult([
        {
          _id: "stu2",
          name: "Student2",
          email: "b@b",
          education: [
            { _id: "ed1", name: "Logik", endDate: new Date(now.getTime() - 86400000), grade: null, removedAt: null },
          ],
        },
      ])
    );

    const res = await request(app).get("/grades/students-to-grade");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});
