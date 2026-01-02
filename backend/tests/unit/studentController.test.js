import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

const parseStudentExcelMock = vi.fn();

const mockStudent = {
    find: vi.fn(),
    bulkWrite: vi.fn(),
    findOne: vi.fn(),
};

const programData = [];
const packageData = [];
const courseData = [];
const mockProgram = {
    find: vi.fn(() => ({
        lean: () => Promise.resolve(programData),
    })),
};
const mockCoursePackage = {
    find: vi.fn(() => ({
        lean: () => Promise.resolve(packageData),
    })),
};
const mockCourse = {
    find: vi.fn(() => ({
        lean: () => Promise.resolve(courseData),
    })),
};

const mockUser = {
    findOne: vi.fn(),
};
const mockTeacher = {
    findOne: vi.fn(),
};

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: mockStudent,
}));

vi.mock("../../src/models/Program.js", () => ({
    __esModule: true,
    default: mockProgram,
}));

vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: mockCoursePackage,
}));

vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: mockCourse,
}));

vi.mock("../../src/models/User.js", () => ({
    __esModule: true,
    default: mockUser,
}));

vi.mock("../../src/models/Teacher.js", () => ({
    __esModule: true,
    default: mockTeacher,
}));

vi.mock("../../src/utils/parseStudentExcel.js", async () => {
    const actual = await vi.importActual("../../src/utils/parseStudentExcel.js");
    return {
        __esModule: true,
        parseStudentExcel: (...args) => parseStudentExcelMock(...args),
        normalizeCodeForMatching: actual.normalizeCodeForMatching,
    };
});

let uploadXlsx;
let normalizeMunicipalityName;

beforeAll(async () => {
    const controller = await import("../../src/controllers/studentController.js");
    uploadXlsx = controller.uploadXlsx;
    normalizeMunicipalityName = controller.normalizeMunicipalityName;
});

afterAll(() => {
    vi.restoreAllMocks();
});

const createReq = (overrides = {}) => ({
    file: overrides.file,
    headers: {},
    body: {},
    params: {},
    cookies: {},
    ip: "127.0.0.1",
    get(key) {
        return this.headers[key] || "";
    },
    ...overrides,
});

const createRes = () => {
    const res = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        },
    };
    return res;
};

beforeEach(() => {
    parseStudentExcelMock.mockReset();
    mockStudent.find.mockReset();
    mockStudent.bulkWrite.mockReset();
    mockStudent.findOne.mockReset();
    mockProgram.find.mockClear();
    mockCoursePackage.find.mockClear();
    mockCourse.find.mockClear();
    mockUser.findOne.mockReset();
    mockTeacher.findOne.mockReset();
    programData.length = 0;
    packageData.length = 0;
    courseData.length = 0;
});

describe("studentController.uploadXlsx", () => {
    it("returns 400 when no file is provided", async () => {
        const req = createReq();
        const res = createRes();
        await uploadXlsx(req, res);
        expect(res.statusCode).toBe(400);
        expect(res.payload).toEqual({ error: "No file uploaded" });
    });

    it("successfully uploads and persists parsed students", async () => {
        parseStudentExcelMock.mockResolvedValue([
            {
                email: "student@example.com",
                education: [
                    {
                        name: "PKG1000",
                        startDate: "2025-01-01T00:00:00.000Z",
                        endDate: "2025-02-01T00:00:00.000Z",
                    },
                ],
                municipality: { type: "Sollentuna" },
                teacher: "Teacher, Test",
            },
        ]);

        programData.push({ programName: "Program X", _id: "prog" });
        packageData.push({ coursePackageCode: "PKG1000", _id: "pkg" });
        courseData.push({ courseCode: "COURSE1000", _id: "course" });

        mockStudent.find.mockResolvedValue([]);
        mockStudent.bulkWrite.mockResolvedValue([]);
        mockStudent.findOne.mockResolvedValue({ education: [] });
        mockUser.findOne.mockResolvedValue({ _id: "user1", username: "Teacher" });
        mockTeacher.findOne.mockResolvedValue({ _id: "teacher1" });

        const req = createReq({
            file: { buffer: Buffer.from("xlsx"), originalname: "students.xlsx" },
        });
        const res = createRes();

        await uploadXlsx(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.payload).toHaveProperty("message", "Upload successful");
        expect(res.payload.students).toHaveLength(1);
        expect(mockStudent.bulkWrite).toHaveBeenCalled();
    });

    it("returns 422 when a course cannot be matched", async () => {
        parseStudentExcelMock.mockResolvedValue([
            {
                email: "student@example.com",
                education: [
                    {
                        name: "Unknown NIVÅ 1",
                        startDate: "2025-01-01T00:00:00.000Z",
                        endDate: "2025-02-01T00:00:00.000Z",
                    },
                ],
                municipality: { type: "Sollentuna" },
                teacher: "Teacher, Test",
            },
        ]);

        programData.push({ programName: "Program X", _id: "prog" });
        packageData.push({ coursePackageCode: "PKG1000", _id: "pkg" });
        courseData.push({ courseCode: "COURSE1000", _id: "course" });

        mockStudent.find.mockResolvedValue([]);
        mockUser.findOne.mockResolvedValue({ _id: "user1", username: "Teacher" });
        mockTeacher.findOne.mockResolvedValue({ _id: "teacher1" });

        const req = createReq({
            file: { buffer: Buffer.from("xlsx"), originalname: "students.xlsx" },
        });
        const res = createRes();

        await uploadXlsx(req, res);

        expect(res.statusCode).toBe(422);
        expect(res.payload).toHaveProperty(
            "error",
            "Unmatched courses found; upload aborted."
        );
        expect(res.payload.reasons).toHaveLength(1);
    });
});

describe("studentController.normalizeMunicipalityName", () => {
    it("normalizes known aliases and keeps unknown values intact", () => {
        expect(normalizeMunicipalityName("Uppl. Väsby")).toBe("Upplands Väsby");
        expect(normalizeMunicipalityName("  Uppl väsby ")).toBe(
            "Upplands Väsby"
        );
        expect(normalizeMunicipalityName("Sollentuna")).toBe("Sollentuna");
    });
});
