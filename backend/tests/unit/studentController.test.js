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
// #103: imported course rows become enrollments through the placement service;
// they are never stored on the student.
vi.mock("../../src/utils/courseMatchingService.js", () => ({
  __esModule: true,
  default: {
    processStudentEducation: vi.fn(() => Promise.resolve({ enrollments: [], errors: [] })),
  },
}));
vi.mock("../../src/utils/teacherService.js", () => ({
  createOrFindTeacher: vi.fn(() =>
    Promise.resolve({ teacher: { _id: "created-teacher" } })
  ),
}));

vi.mock("../../src/utils/parseStudentExcel.js", async () => {
  const actual = await vi.importActual(
    "../../src/utils/parseStudentExcel.js"
  );
  return {
    ...actual,
    parseStudentExcel: vi.fn(),
  };
});

vi.mock("../../src/services/emailService.js", () => ({
  __esModule: true,
  maybeSendLarteametEmail: vi.fn(),
  SOLLENTUNA_MUNICIPALITY: "Sollentuna",
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../../src/utils/logger.js", () => ({
  __esModule: true,
  default: loggerMock,
}));

import Student from "../../src/models/Student.js";
import Program from "../../src/models/Program.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import User from "../../src/models/User.js";
import {
  uploadXlsx,
  normalizeMunicipalityName,
} from "../../src/controllers/studentController.js";
import * as parseModule from "../../src/utils/parseStudentExcel.js";
import { maybeSendLarteametEmail } from "../../src/services/emailService.js";
import { createOrFindTeacher } from "../../src/utils/teacherService.js";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";

/** Entries the import passed to placement for the n-th student. */
const placedEntries = (n = 0) => CourseMatchingService.processStudentEducation.mock.calls[n][1];
/** The student document the import wrote (bulkWrite $set) for the n-th student. */
const writtenStudent = (n = 0) => Student.bulkWrite.mock.calls[0][0][n].updateOne.update.$set;

const createOrFindTeacherMock = vi.mocked(createOrFindTeacher);

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
  // Awaited directly: existing students (none). Via .select().lean(): the
  // students saved by the bulk write, one per uploaded e-mail.
  Student.find.mockImplementation((query) =>
    Object.assign(Promise.resolve([]), {
      select: () => ({
        lean: () =>
          Promise.resolve(
            (query?.email?.$in || []).map((email, i) => ({ _id: `saved-${i}`, email, pace: 100 }))
          ),
      }),
    })
  );
  Student.findOne.mockResolvedValue({ education: [] });
  Student.bulkWrite.mockResolvedValue({});
  Program.find.mockReturnValue(createLeanResult([]));
  CoursePackage.find.mockReturnValue(createLeanResult([]));
  Course.find.mockReturnValue(createLeanResult([]));
  User.findOne.mockResolvedValue(null);
  createOrFindTeacherMock.mockClear();
  parseModule.parseStudentExcel.mockResolvedValue([]);
  maybeSendLarteametEmail.mockReset();
  maybeSendLarteametEmail.mockResolvedValue({ sent: true });
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
    // #102: the matched User is the teacher when it has a teacher profile.
    User.findOne.mockResolvedValue({ _id: "user-1", username: "teacheruser", teacherProfile: { subject: "Övrigt" } });
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "valid.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(Student.bulkWrite).toHaveBeenCalledTimes(1);
    expect(writtenStudent().education).toBeUndefined();
    expect(CourseMatchingService.processStudentEducation).toHaveBeenCalled();
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

  it("places entries with the spreadsheet dates and an ObjectId addedBy", async () => {
    const uploaderId = "64b7f9f9f9f9f9f9f9f9f9f9";
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "dated@example.com",
        name: "Dated Student",
        municipality: "Solna",
        teacher: "Teacher, First",
        education: [
          {
            name: "PKG-001",
            startDate: "2026-08-17T00:00:00.000Z",
            endDate: "2026-12-18T00:00:00.000Z",
          },
        ],
      },
    ]);
    CoursePackage.find.mockReturnValue(
      createLeanResult([{ coursePackageCode: "PKG-001", _id: "pkg-1" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "dated.xlsx" },
      user: { userId: uploaderId },
    };

    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(writtenStudent().education).toBeUndefined();
    const educationEntry = placedEntries()[0];
    expect(educationEntry).toMatchObject({
      type: "CoursePackage",
      refId: "pkg-1",
    });
    expect(educationEntry.startDate).toEqual(
      new Date("2026-08-17T00:00:00.000Z")
    );
    expect(educationEntry.endDate).toEqual(
      new Date("2026-12-18T00:00:00.000Z")
    );
    // Must be ObjectId-shaped, never the teacher's display name.
    expect(educationEntry.addedBy).toBe(uploaderId);
    expect(String(educationEntry.addedBy)).toMatch(/^[a-f0-9]{24}$/);
  });

  it("matches a course code even when it does not end with NIVÅ N", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "course@example.com",
        name: "Course Student",
        municipality: "Solna",
        teacher: "Teacher, First",
        education: [
          {
            name: "MATMAT01",
            startDate: "2026-08-17T00:00:00.000Z",
            endDate: "2026-12-18T00:00:00.000Z",
          },
        ],
      },
    ]);
    CoursePackage.find.mockReturnValue(createLeanResult([]));
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "MATMAT01", _id: "course-9" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "course.xlsx" },
    };

    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(writtenStudent().education).toBeUndefined();
    const educationEntry = placedEntries()[0];
    expect(educationEntry).toMatchObject({
      type: "Course",
      refId: "course-9",
    });
    expect(res.json.mock.calls[0][0].warnings).toEqual([]);
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

  it("fires the Lärteamet email exactly once for a newly created Sollentuna student", async () => {
    const parsedStudents = [
      {
        email: "sollentuna@example.com",
        name: "Sollentuna Student",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "sollentuna.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).toHaveBeenCalledTimes(1);
    expect(maybeSendLarteametEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        student: expect.objectContaining({
          email: "sollentuna@example.com",
          name: "Sollentuna Student",
          municipality: "Sollentuna",
        }),
        studentName: "Sollentuna Student",
        email: "sollentuna@example.com",
      })
    );
  });

  it("fires the Lärteamet email per-student for new Sollentuna students in a bulk upload", async () => {
    const parsedStudents = [
      {
        email: "sollentuna-a@example.com",
        name: "Student A",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
      {
        email: "sollentuna-b@example.com",
        name: "Student B",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "bulk-sollentuna.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).toHaveBeenCalledTimes(2);
    const sentTo = maybeSendLarteametEmail.mock.calls.map(
      (call) => call[0].email
    );
    expect(sentTo.sort()).toEqual([
      "sollentuna-a@example.com",
      "sollentuna-b@example.com",
    ]);
  });

  it("does NOT re-fire the Lärteamet email for an existing re-uploaded Sollentuna student", async () => {
    const parsedStudents = [
      {
        email: "sollentuna-existing@example.com",
        name: "Returning Sollentuna",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    Student.find.mockResolvedValue([
      { email: "sollentuna-existing@example.com", education: [] },
    ]);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "existing.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).not.toHaveBeenCalled();
  });

  it("does NOT fire the Lärteamet email for non-Sollentuna students", async () => {
    const parsedStudents = [
      {
        email: "solna@example.com",
        name: "Solna Student",
        municipality: "Solna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "solna.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).not.toHaveBeenCalled();
  });

  it("does not abort the upload when the Lärteamet email send fails", async () => {
    const parsedStudents = [
      {
        email: "sollentuna-fail@example.com",
        name: "Failed Email",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    maybeSendLarteametEmail.mockRejectedValue(new Error("SMTP down"));
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "sollentuna-fail.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.anything(),
      "Lärteamet email trigger failed (non-fatal)"
    );
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
      const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "teacher.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(createOrFindTeacherMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("skips education entries with empty normalized names", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "skip@example.com",
        name: "Skipping Student",
        municipality: "Solna",
        teacher: "Teacher, Skip",
        education: [{ name: "()" }],
      },
    ]);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "skip.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(loggerMock.debug).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: "()" }),
      "Skipping entry with empty normalized name"
    );
    expect(Student.bulkWrite).toHaveBeenCalledTimes(1);
  });

  it("provides suggestions when unmatched courses are prevalidated", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "suggest@example.com",
        name: "Suggest Student",
        municipality: "Solna",
        education: [{ name: "SOMECOURSE NIVÅ 1" }],
      },
    ]);
    CoursePackage.find.mockReturnValue(
      createLeanResult([{ coursePackageCode: "OTHERPKG", _id: "pkg-1" }])
    );
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "SOMECOURSE NIVÅ 2", _id: "course-1" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "suggest.xlsx" },
    };

    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.reasons[0].message).toContain("closest course");
  });

  it("matches program entries and creates teachers when missing", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "program@example.com",
        name: "Program Student",
        municipality: "Solna",
        teacher: "New Teacher, Lead",
        subject: "Mathematics",
        education: [{ name: "Test Program" }],
      },
    ]);
    Program.find.mockReturnValue(
      createLeanResult([{ programName: "Test Program", _id: "prog-1" }])
    );
    CoursePackage.find.mockReturnValue(createLeanResult([]));
    Course.find.mockReturnValue(createLeanResult([]));
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "program.xlsx" },
    };
    const normalizeSpy = vi
      .spyOn(parseModule, "normalizeCodeForMatching")
      .mockReturnValue("testprogram");

    try {
      await uploadXlsx(req, res);
    } finally {
      normalizeSpy.mockRestore();
    }

    expect(createOrFindTeacherMock).toHaveBeenCalledWith(
      "New Teacher, Lead",
      null,
      "Mathematics"
    );
    const studentUpdate = writtenStudent();
    expect(studentUpdate.teacherId).toBe("created-teacher");
    expect(studentUpdate.education).toBeUndefined();
    expect(placedEntries()[0]).toMatchObject({
      type: "Program",
      refId: "prog-1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
