import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        bulkWrite: vi.fn(),
        findOne: vi.fn(),
    },
}));
vi.mock("../../src/models/Program.js", () => ({
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
vi.mock("../../src/models/Course.js", () => ({
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
vi.mock("../../src/utils/parseStudentExcel.js", () => ({
    __esModule: true,
    parseStudentExcel: vi.fn(),
    normalizeCodeForMatching: vi.fn(),
}));

import {
    uploadXlsx,
    normalizeMunicipalityName,
} from "../../src/controllers/studentController.js";
import Student from "../../src/models/Student.js";
import Program from "../../src/models/Program.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Course from "../../src/models/Course.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import {
    parseStudentExcel,
    normalizeCodeForMatching,
} from "../../src/utils/parseStudentExcel.js";

const createRes = () => {
    const res = {
        status: vi.fn(function () {
            return this;
        }),
        json: vi.fn(function () {
            return this;
        }),
    };
    return res;
};

const createLeanMock = (result) => ({
    lean: vi.fn().mockResolvedValue(result),
});

const originalCreateOrFindTeacher = globalThis.createOrFindTeacher;
let createOrFindTeacherMock;

beforeEach(() => {
    vi.clearAllMocks();
    Student.find.mockResolvedValue([]);
    Student.bulkWrite.mockResolvedValue({});
    Student.findOne.mockResolvedValue({ education: [] });
    Program.find.mockReturnValue(createLeanMock([]));
    CoursePackage.find.mockReturnValue(createLeanMock([]));
    Course.find.mockReturnValue(createLeanMock([]));
    User.findOne.mockResolvedValue(null);
    Teacher.findOne.mockResolvedValue(null);
    parseStudentExcel.mockResolvedValue([]);
    normalizeCodeForMatching.mockImplementation((value) =>
        value ? value.trim().toUpperCase() : ""
    );
    createOrFindTeacherMock = vi
        .fn()
        .mockResolvedValue({ teacher: { _id: "teacher-gen" } });
    globalThis.createOrFindTeacher = createOrFindTeacherMock;
});

afterEach(() => {
    globalThis.createOrFindTeacher = originalCreateOrFindTeacher;
});

describe("normalizeMunicipalityName", () => {
    it("returns alias when provided variant matches alias map", () => {
        expect(normalizeMunicipalityName("Uppl. Väsby")).toBe("Upplands Väsby");
    });

    it("uses fallback when both keywords are present", () => {
        expect(normalizeMunicipalityName("uppL väsby extra")).toBe(
            "Upplands Väsby"
        );
    });

    it("returns original value when no normalization is required", () => {
        const original = "Solna";
        expect(normalizeMunicipalityName(original)).toBe(original);
    });
});

describe("uploadXlsx", () => {
    it("rejects upload when parser returns no rows", async () => {
        const req = {
            file: {
                buffer: Buffer.from("empty"),
                originalname: "empty.xlsx",
            },
        };
        const res = createRes();

        parseStudentExcel.mockResolvedValue([]);

        await uploadXlsx(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "No valid data to save.",
        });
    });

    it("fails with 422 when a course entry cannot be matched", async () => {
        const req = {
            file: {
                buffer: Buffer.from("match"),
                originalname: "students.xlsx",
            },
        };
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "nomatch@example.com",
                name: "Unmatched Student",
                municipality: "Solna",
                education: [
                    {
                        name: "Unknown Course nivå 1",
                        startDate: new Date("2022-01-01"),
                        endDate: new Date("2022-06-01"),
                    },
                ],
            },
        ]);

        await uploadXlsx(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        const payload = res.json.mock.calls[0][0];
        expect(payload).toMatchObject({
            error: "Unmatched courses found; upload aborted.",
        });
        expect(payload.reasons[0]).toMatchObject({
            type: "no_match",
            courseName: "Unknown Course nivå 1",
        });
    });

    it("fails when municipality cannot be matched", async () => {
        const req = {
            file: {
                buffer: Buffer.from("muni"),
                originalname: "students.xlsx",
            },
        };
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "muni@example.com",
                name: "Local Student",
                municipality: "FarAwayCity",
                education: [
                    {
                        name: "Course 1 nivå 4",
                        startDate: new Date("2021-01-01"),
                        endDate: new Date("2021-06-01"),
                    },
                ],
            },
        ]);

        Course.find.mockReturnValue(
            createLeanMock([
                { courseCode: "Course 1 nivå 4", _id: "course-1" },
            ])
        );

        await uploadXlsx(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            error: "Failed to process file",
            details: expect.stringContaining(
                '❌ Could not match municipality: "FarAwayCity"'
            ),
        });
        expect(Student.bulkWrite).not.toHaveBeenCalled();
    });

    it("uses fallback teacher creation when no existing teacher is found", async () => {
        const req = {
            file: {
                buffer: Buffer.from("teacher"),
                originalname: "students.xlsx",
            },
        };
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "teacher@example.com",
                name: "Teacher Student",
                municipality: "Solna",
                teacher: "  Doe, Jane  ",
                education: [
                    {
                        name: "Course 1 nivå 4",
                        startDate: new Date("2018-01-01"),
                        endDate: new Date("2018-06-01"),
                    },
                ],
            },
        ]);

        Program.find.mockReturnValue(createLeanMock([]));
        CoursePackage.find.mockReturnValue(
            createLeanMock([{ coursePackageCode: "Package A" }])
        );
        Course.find.mockReturnValue(
            createLeanMock([
                { courseCode: "Course 1 nivå 4", _id: "course-1" },
            ])
        );

        await uploadXlsx(req, res);

        expect(createOrFindTeacherMock).toHaveBeenCalledWith(
            "Doe, Jane",
            null,
            "Övrigt"
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Upload successful",
            students: expect.any(Array),
            warnings: expect.any(Array),
        });
    });
    it("rejects missing file uploads", async () => {
        const req = {};
        const res = createRes();

        await uploadXlsx(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "No file uploaded" });
    });

    it("processes a basic payload and returns success summary", async () => {
        const fileBuffer = Buffer.from("dummy");
        const req = {
            file: {
                buffer: fileBuffer,
                originalname: "students.xlsx",
            },
        };
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "test@example.com",
                name: "First Student",
                municipality: "Solna",
                education: [
                    {
                        name: "Course 1 nivå 4",
                        startDate: new Date("2020-01-01"),
                        endDate: new Date("2020-06-01"),
                    },
                    {
                        name: "Package Only",
                        startDate: new Date("2020-02-01"),
                        endDate: new Date("2020-03-01"),
                    },
                ],
            },
        ]);
        normalizeCodeForMatching.mockImplementation((value) =>
            value ? value.trim().toUpperCase() : ""
        );
        Course.find.mockReturnValue(
            createLeanMock([
                { courseCode: "Course 1 nivå 4", _id: "course-1" },
            ])
        );

        await uploadXlsx(req, res);

        expect(parseStudentExcel).toHaveBeenCalledWith(fileBuffer, "");
        expect(Student.find).toHaveBeenCalledWith({
            email: { $in: ["test@example.com"] },
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Upload successful",
            students: expect.any(Array),
            warnings: [],
        });
    });

    it("handles multiple education entries including programs and courses", async () => {
        const fileBuffer = Buffer.from("multi");
        const req = {
            file: {
                buffer: fileBuffer,
                originalname: "students.xlsx",
            },
        };
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "multi@example.com",
                name: "Multi Student",
                municipality: "Solna",
                education: [
                    {
                        name: "Program Legendary",
                        startDate: new Date("2019-01-01"),
                        endDate: new Date("2019-06-01"),
                    },
                    {
                        name: "Course 1 nivå 4",
                        startDate: new Date("2020-01-01"),
                        endDate: new Date("2020-06-01"),
                    },
                    {
                        name: "Package without match",
                        startDate: new Date("2021-01-01"),
                        endDate: new Date("2021-06-01"),
                    },
                ],
            },
        ]);
        normalizeCodeForMatching.mockImplementation((value) =>
            value ? value.trim().toUpperCase() : ""
        );
        Program.find.mockReturnValue(
            createLeanMock([
                { programName: "Program Legendary", _id: "prog-1" },
            ])
        );
        Course.find.mockReturnValue(
            createLeanMock([
                { courseCode: "Course 1 nivå 4", _id: "course-1" },
            ])
        );

        await uploadXlsx(req, res);

        expect(parseStudentExcel).toHaveBeenCalledWith(fileBuffer, "");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Upload successful",
            students: expect.any(Array),
            warnings: expect.any(Array),
        });
    });
});
