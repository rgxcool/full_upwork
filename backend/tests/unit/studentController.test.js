import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    bulkWrite: vi.fn(),
  },
}));
vi.mock("../../src/models/Program.js", () => ({
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
vi.mock("../../src/models/CoursePackage.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
  },
}));
vi.mock("../../src/models/User.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
  },
}));
vi.mock("../../src/models/Teacher.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
  },
}));
const createOrFindTeacherMock = vi.fn(() =>
  Promise.resolve({ teacher: { _id: "created-teacher" } })
);
globalThis.createOrFindTeacher = createOrFindTeacherMock;

vi.mock("../../src/utils/parseStudentExcel.js", async () => {
  const actual = await vi.importActual(
    "../../src/utils/parseStudentExcel.js"
  );
  return {
    ...actual,
    parseStudentExcel: vi.fn(),
  };
});

import Student from "../../src/models/Student.js";
import Program from "../../src/models/Program.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import {
  uploadXlsx,
  normalizeMunicipalityName,
} from "../../src/controllers/studentController.js";
import * as parseModule from "../../src/utils/parseStudentExcel.js";

const createLeanResult = (value) => ({
  lean: vi.fn().mockResolvedValue(value),
});

const createMockRes = () => {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
  };
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  Student.find.mockResolvedValue([]);
  Student.findOne.mockResolvedValue({ education: [] });
  Student.bulkWrite.mockResolvedValue({});
  Program.find.mockReturnValue(createLeanResult([]));
  CoursePackage.find.mockReturnValue(createLeanResult([]));
  Course.find.mockReturnValue(createLeanResult([]));
  User.findOne.mockResolvedValue(null);
  Teacher.findOne.mockResolvedValue(null);
  createOrFindTeacherMock.mockClear();
  parseModule.parseStudentExcel.mockResolvedValue([]);
});

describe("normalizeMunicipalityName", () => {
  it("handles aliases and normalization", () => {
    expect(normalizeMunicipalityName("uppl. väsby")).toBe("Upplands Väsby");
    expect(normalizeMunicipalityName(" Uppl väsby ")).toBe("Upplands Väsby");
    expect(normalizeMunicipalityName(null)).toBeNull();
    expect(normalizeMunicipalityName("uppl foo väsby")).toBe("Upplands Väsby");
  });
});

describe("uploadXlsx", () => {
  it("returns 400 when no file is provided", async () => {
    const res = createMockRes();
    await uploadXlsx({}, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "No file uploaded" });
  });

  it("returns 400 when parsing yields no students", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([]);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "test.xlsx" },
    };
    await uploadXlsx(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "No valid data to save." });
  });

  it("returns 422 when pre-validation fails for unmatched courses", async () => {
    const parsedStudents = [
      {
        email: "nomatch@example.com",
        name: "Nomatch",
        municipality: "Solna",
        education: [{ name: "UNKNOWN COURSE NIVÅ 2" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "nomatch.xlsx" },
    };
    await uploadXlsx(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Unmatched courses found; upload aborted.",
        reasons: expect.any(Array),
      })
    );
  });

  it("processes valid student uploads", async () => {
    const parsedStudents = [
      {
        email: "merge@example.com",
        name: "Merge Student",
        municipality: "uppl. väsby",
        teacher: "Teacher, First",
        education: [{ name: "PKG-001" }],
      },
      {
        email: "merge@example.com",
        name: "Merge Student",
        municipality: "uppl. väsby",
        teacher: "Teacher, First",
        education: [{ name: "CRS-999 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Program.find.mockReturnValue(
      createLeanResult([{ programName: "Test Program", _id: "prog-1" }])
    );
    CoursePackage.find.mockReturnValue(
      createLeanResult([
        { coursePackageCode: "PKG-001", _id: "pkg-1" },
        { coursePackageCode: "CRS-999 NIVÅ 1", _id: "pkg-2" },
      ])
    );
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-ABC", _id: "course-1" }])
    );
    User.findOne.mockResolvedValue({ _id: "user-1", username: "teacheruser" });
    Teacher.findOne.mockResolvedValue({ _id: "teacher-1" });
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "valid.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(Student.bulkWrite).toHaveBeenCalledTimes(1);
    expect(Student.findOne).toHaveBeenCalledWith({
      email: "merge@example.com",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Upload successful",
        students: expect.any(Array),
        warnings: expect.any(Array),
      })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.students).toHaveLength(1);
    expect(payload.warnings).toEqual([]);
  });

  it("skips blank education rows and still accepts valid entries", async () => {
    const parsedStudents = [
      {
        email: "blank@example.com",
        name: "Blank Student",
        municipality: "Solna",
        teacher: "Teacher, First",
        education: [
          { name: "" },
          { name: "CRS-202 NIVÅ 2" },
        ],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-202 NIVÅ 2", _id: "course-2" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "blank.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Student.bulkWrite).toHaveBeenCalled();
  });

  it("returns 500 when the municipality cannot be matched", async () => {
    const parsedStudents = [
      {
        email: "fail@example.com",
        name: "No City",
        municipality: "Atlantis",
        teacher: "Teacher, First",
        education: [{ name: "CRS-404 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-404 NIVÅ 1", _id: "course-404" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "nomatch.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Failed to process file",
        details: expect.stringContaining("Could not match municipality"),
      })
    );
  });

  it("calls createOrFindTeacher when the user lookup returns nothing", async () => {
    const parsedStudents = [
      {
        email: "create@example.com",
        name: "Teacherless",
        municipality: "Solna",
        teacher: "Unknown, Teacher",
        subject: "Matte",
        education: [{ name: "CRS-777 NIVÅ 2" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-777 NIVÅ 2", _id: "course-7" }])
    );
    User.findOne.mockResolvedValue(null);
    Teacher.findOne.mockResolvedValue(null);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "teacher.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(createOrFindTeacherMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
