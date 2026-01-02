import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createQueryChain = (value) => {
  const chain = {
    lean: vi.fn(() => chain),
    populate: vi.fn(() => chain),
    sort: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(value).catch(fn),
  };
  return chain;
};

const createSessionQuery = (value) => {
  const chain = {
    session: vi.fn(() => chain),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(value).catch(fn),
  };
  return chain;
};

let studentFindResult = [];
let enrollmentFindResult = [];
let examAttendanceFindResult = [];

vi.mock("../../src/controllers/authController.js", () => ({
  authenticateUser: (req, res, next) => {
    const role = req.headers["x-user-role"] || "teacher";
    req.user = {
      role,
      userId: req.headers["x-user-id"] || "user-id",
      _id: req.headers["x-user-objectid"] || "user-obj-id",
    };
    next();
  },
}));

vi.mock("../../src/controllers/notificationController.js", () => ({
  createGlobalNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../src/models/ExamAttendance.js", () => {
  const findOne = vi.fn();
  const find = vi.fn();
  const save = vi.fn().mockResolvedValue({ _id: "attendance-1" });
  const constructor = vi.fn(function (data) {
    return { ...data, save };
  });
  constructor.find = find;
  constructor.findOne = findOne;
  return {
    __esModule: true,
    default: constructor,
    find,
    findOne,
  };
});

vi.mock("../../src/models/CourseInstance.js", () => ({
  __esModule: true,
  default: {
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  },
}));

vi.mock("../../src/models/Notification.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../src/models/Teacher.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock("../../src/models/Event.js", () => {
  const constructor = vi.fn(function (data) {
    return {
      ...data,
      save: vi.fn().mockResolvedValue({ ...data, _id: "calendar-event" }),
    };
  });
  constructor.find = vi.fn();
  constructor.findById = vi.fn();
  constructor.findByIdAndUpdate = vi.fn();
  return {
    __esModule: true,
    default: constructor,
  };
});

vi.mock("../../src/models/Provning.js", () => {
  const find = vi.fn();
  const findById = vi.fn();
  const findByIdAndDelete = vi.fn();
  const findByIdAndUpdate = vi.fn();
  const constructor = vi.fn(function (data) {
    return {
      ...data,
      save: vi.fn().mockResolvedValue({ ...data, _id: "exam-1" }),
    };
  });
  constructor.find = find;
  constructor.findById = findById;
  constructor.findByIdAndDelete = findByIdAndDelete;
  constructor.findByIdAndUpdate = findByIdAndUpdate;
  return {
    __esModule: true,
    default: constructor,
  };
});

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    populate: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("../../src/models/StudentEnrollment.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("mongoose", () => ({
  startSession: vi.fn(() => ({
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    abortTransaction: vi.fn(),
    endSession: vi.fn(),
  })),
}));

import examRoutes from "../../src/router/examRoutes.js";
import ExamAttendance, {
  find as mockExamAttendanceFind,
  findOne as mockExamAttendanceFindOne,
} from "../../src/models/ExamAttendance.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Notification from "../../src/models/Notification.js";
import Teacher from "../../src/models/Teacher.js";
import CalendarEvent from "../../src/models/Event.js";
import Exam from "../../src/models/Provning.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import { createGlobalNotification } from "../../src/controllers/notificationController.js";

const teacherDoc = {
  _id: "teacher-1",
  userId: { username: "tutor" },
  colorCode: "#abc",
};

const createStudent = () => ({
  _id: "student-1",
  name: "Student One",
  personalNumber: "1234567890",
  teacherId: teacherDoc,
  finalExamDate: new Date("2025-04-15T00:00:00.000Z"),
  examTime: "08:00",
  examMunicipality: "Stockholm",
  examLocation: "Room 1",
  education: [
    {
      type: "Course",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      refId: { courseName: "Physics" },
    },
  ],
  attendedExam: true,
  paidExamFee: true,
  dropout: false,
  examHistory: [],
  additionalInfo: "info",
});

const createEnrollment = () => ({
  ...{ _id: "enroll-1" },
  studentId: createStudent(),
  mainCourseId: { courseName: "Physics", courseCode: "PHY101" },
  courseInstanceId: { _id: "ci-1" },
  teacherId: teacherDoc,
  slutprovDate: new Date("2025-04-15T00:00:00.000Z"),
  status: "active",
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api", examRoutes);
  return app;
};

let app;

beforeEach(() => {
  app = buildApp();
  vi.clearAllMocks();
  studentFindResult = [];
  enrollmentFindResult = [];
  examAttendanceFindResult = [];
  mockExamAttendanceFind.mockImplementation(() =>
    createQueryChain(examAttendanceFindResult)
  );
  mockExamAttendanceFindOne.mockResolvedValue(null);
  Exam.find.mockReturnValue(createQueryChain([]));
  Exam.findById.mockResolvedValue(null);
  Exam.findByIdAndDelete.mockResolvedValue(null);
  Exam.findByIdAndUpdate.mockResolvedValue(null);
  Teacher.findOne.mockReturnValue(createSessionQuery(teacherDoc));
  CalendarEvent.find.mockResolvedValue([]);
  CalendarEvent.findById.mockResolvedValue(null);
  CalendarEvent.findByIdAndUpdate.mockResolvedValue(null);
  Notification.findOne.mockResolvedValue(null);
  Notification.create.mockResolvedValue({ _id: "note-1" });
  Student.find.mockImplementation(() => createQueryChain(studentFindResult));
  Student.populate.mockResolvedValue(studentFindResult);
  Student.findOne.mockResolvedValue(null);
  Student.findById.mockResolvedValue(null);
  Student.findOneAndUpdate.mockResolvedValue(null);
  Student.updateMany.mockResolvedValue({ modifiedCount: 0 });
  StudentEnrollment.find.mockImplementation(() =>
    createQueryChain(enrollmentFindResult)
  );
  StudentEnrollment.findOne.mockResolvedValue(null);
  StudentEnrollment.updateMany.mockResolvedValue({ modifiedCount: 0 });
  CourseInstance.updateMany.mockResolvedValue({ modifiedCount: 0 });
});

describe("examRoutes", () => {
  it("creates exams and removes empty fields", async () => {
    const res = await request(app)
      .post("/api/exams")
      .send({ name: "Exam", course: "Physics", teacherId: "", paymentDate: "" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Exam");
    expect(Exam).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Exam", course: "Physics" })
    );
    expect(createGlobalNotification).toHaveBeenCalled();
  });

  it("returns teacher exams and triggers notification logic", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-05T00:00:00.000Z"));
    const examDoc = {
      _id: "exam-1",
      name: "Sample Exam",
      course: "Physics",
      teacherId: teacherDoc,
      requestedMonth: "Juni",
      status: "intresse",
      personalNumber: "123",
    };
    Exam.find.mockReturnValue(createQueryChain([examDoc]));
    Notification.findOne.mockResolvedValue(null);
    examAttendanceFindResult = [
      {
        examTime: "10:00",
        examMunicipality: "Town",
        examLocation: "Hall",
        teacherId: teacherDoc,
        _id: "attendance-1",
      },
    ];
    const res = await request(app)
      .get("/api/exams")
      .set("x-user-role", "teacher");
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: "Sample Exam" })]);
    expect(Notification.create).toHaveBeenCalled();
  });

  it("builds syncable calendar events for students and enrollments", async () => {
    const student = createStudent();
    studentFindResult = [student];
    enrollmentFindResult = [
      {
        ...createEnrollment(),
        studentId: student,
      },
    ];
    StudentEnrollment.findOne.mockResolvedValue({
      mainCourseId: { courseName: "Manual Course" },
    });
    Notification.findOne.mockResolvedValue(null);
    examAttendanceFindResult = [
      {
        examTime: "10:00",
        examMunicipality: "City",
        examLocation: "Hall",
        teacherId: teacherDoc,
      },
    ];
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].extendedProps.students).toHaveLength(1);
  });

  it("updates attendance records via batch mark-attendance", async () => {
    const attendanceStudent = {
      _id: "batch-student",
      name: "Batch Student",
      personalNumber: "200",
      examHistory: [],
      save: vi.fn().mockResolvedValue(true),
      attendedExam: false,
      paidExamFee: false,
    };
    Student.findById.mockResolvedValue(attendanceStudent);
    mockExamAttendanceFindOne.mockResolvedValue(null);
    examAttendanceFindResult = [];
    const res = await request(app)
      .post("/api/calendar-events/mark-attendance")
      .send({
        date: "2025-04-15",
        teacherId: "teacher-1",
        courseName: "Physics",
        students: [{ _id: "batch-student", attended: true }],
      });
    expect(res.status).toBe(200);
    expect(res.body.successCount).toBe(1);
  });

  it("handles exam decisions (accept branch)", async () => {
    const examDoc = {
      _id: "decision-exam",
      name: "Decision Exam",
      requestedMonth: "Maj",
      personalNumber: "999",
      teacherId: teacherDoc,
    };
    Exam.findById.mockReturnValue(createQueryChain(examDoc));
    Student.findOneAndUpdate.mockResolvedValue({ _id: "student-for-decision" });
    Exam.findByIdAndUpdate.mockResolvedValue({ ...examDoc, status: "scheduled" });
    const res = await request(app)
      .put("/api/exams/decision-exam/decision")
      .send({ decision: "accept", comment: "Go" });
    expect(res.status).toBe(200);
    expect(Student.findOneAndUpdate).toHaveBeenCalled();
  });

  it("lists exam history for a student", async () => {
    examAttendanceFindResult = [
      {
        _id: "attendance-history",
        examDate: new Date(),
        courseName: "Physics",
        attended: true,
        examTime: "09:00",
        examMunicipality: "City",
        examLocation: "Hall",
        teacherId: { userId: { username: "tutor" } },
      },
    ];
    const res = await request(app).get("/api/exams/student/student-1");
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty("teacher");
  });

  it("fetches attendance data for a teacher on a date", async () => {
    examAttendanceFindResult = [
      {
        studentId: "student-1",
        attended: true,
        paidExamFee: true,
        examTime: "08:00",
        examMunicipality: "City",
        examLocation: "Hall",
      },
    ];
    const res = await request(app).get(
      "/api/calendar-events/attendance/2025-04-15/teacher-1"
    );
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty("attended");
  });
});
