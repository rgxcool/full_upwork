import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    vi,
} from "vitest";
import request from "supertest";
import express from "express";
import ExcelJS from "exceljs";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

// Request identity used by the upload path; a real ObjectId because ids the
// placement path records (e.g. addedBy / changedBy) are cast to ObjectId.
const mockAuthenticateUser = vi.hoisted(() => (req, _res, next) => {
    req.user = {
        role: "admin",
        roles: ["admin"],
        userId: "64b7f9f9f9f9f9f9f9f9f9f9",
    };
    req.userId = req.user.userId;
    next();
});

vi.mock("../../src/controllers/authController.js", () => ({
    authenticateUser: mockAuthenticateUser,
}));
vi.mock("../../src/controllers/notificationController.js", () => ({
    sendDropoutNotification: vi.fn(),
    sendStudyplanChangedNotification: vi.fn(),
}));
vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let app;
let coursePackage;
let course;

const START_DATE = "2026-08-17";
const END_DATE = "2026-12-18";

const buildStudentWorkbook = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Elever");
    sheet.addRow([
        "NAMN",
        "PERSONNUMMER",
        "KURS/PAKET",
        "START",
        "SLUT",
        "KOMMUN/PRIVAT",
        "MAIL",
        "Lärare",
    ]);
    sheet.addRow([
        "Excel Elev",
        "19900101-3333",
        "PKG1",
        new Date(`${START_DATE}T00:00:00.000Z`),
        new Date(`${END_DATE}T00:00:00.000Z`),
        "Solna",
        "excel@elev.se",
        "",
    ]);
    return workbook.xlsx.writeBuffer();
};

const findPackageEducation = (student) =>
    (student.education || []).find(
        (entry) =>
            entry.type === "CoursePackage" &&
            String(entry.refId?._id || entry.refId) ===
                String(coursePackage._id)
    );

describe("Student upload parity — manual vs Excel file", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        const { default: studentRoutes } = await import(
            "../../src/router/studentRoutes.js"
        );
        const { default: uploadRoutes } = await import(
            "../../src/router/uploadRoutes.js"
        );
        app = express();
        app.use(express.json());
        app.use("/api", studentRoutes);
        app.use("/api/uploads", uploadRoutes);
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            CourseInstance.deleteMany({}),
            StudentEnrollment.deleteMany({}),
        ]);
        course = await Course.create({
            courseName: "Testkurs",
            courseCode: "TEST100",
            courseExtent: "5",
            coursePoints: 100,
            isActive: true,
        });
        coursePackage = await CoursePackage.create({
            coursePackageName: "Testpaket",
            coursePackageCode: "PKG1",
            coursePackagePoints: "100",
            coursePackageExtent: "Termin",
            coursePackageCourses: [course._id],
        });
    });

    it("lands manual and file-uploaded package students in the same APL-visible place", async () => {
        const manualResponse = await request(app)
            .post("/api/student")
            .send({
                name: "Manual Elev",
                personalNumber: "19900101-1111",
                email: "manual@elev.se",
                municipality: { type: "Solna" },
                startDate: START_DATE,
                endDate: END_DATE,
                pace: 100,
                education: [
                    {
                        type: "CoursePackage",
                        refId: coursePackage._id.toString(),
                        name: "PKG1",
                        startDate: START_DATE,
                        endDate: END_DATE,
                    },
                ],
            })
            .expect(201);

        const workbookBuffer = await buildStudentWorkbook();
        const excelResponse = await request(app)
            .post("/api/uploads/upload/xlsxupload")
            .attach("file", workbookBuffer, "elever.xlsx")
            .expect(200);

        expect(excelResponse.body).toMatchObject({
            message: "Upload successful",
        });

        // Both upload methods must expose the package through GET /students,
        // which is the data source for the APL board.
        const listResponse = await request(app)
            .get("/api/students")
            .expect(200);
        const manualStudent = listResponse.body.find(
            (student) => student.email === "manual@elev.se"
        );
        const fileStudent = listResponse.body.find(
            (student) => student.email === "excel@elev.se"
        );

        expect(manualStudent).toBeTruthy();
        expect(fileStudent).toBeTruthy();

        const manualPackage = findPackageEducation(manualStudent);
        const filePackage = findPackageEducation(fileStudent);

        expect(manualPackage).toBeTruthy();
        expect(filePackage).toBeTruthy();

        // Same package, same APL period → same place on the APL board. Since #103
        // the package period comes from the enrollments, which are stored at local
        // midnight, so compare the calendar day the board shows (Stockholm time).
        const stockholmDay = (value) =>
            new Date(value).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
        // The period is the span of the package's course enrollments: here one
        // 5-week course, so it ends before the END_DATE typed at placement.
        const [firstEnrollment] = await StudentEnrollment.find({
            studentId: manualStudent._id,
            coursePackageId: coursePackage._id,
        }).sort({ endDate: -1 });
        for (const pkgEntry of [manualPackage, filePackage]) {
            expect(stockholmDay(pkgEntry.startDate)).toBe(START_DATE);
            expect(stockholmDay(pkgEntry.endDate)).toBe(stockholmDay(firstEnrollment.endDate));
        }
        expect(new Date(manualStudent.aplStartDate).toISOString()).toBe(
            new Date(fileStudent.aplStartDate).toISOString()
        );
        expect(new Date(manualStudent.aplEndDate).toISOString()).toBe(
            new Date(fileStudent.aplEndDate).toISOString()
        );

        // And both must have real package enrollments (not just a stored
        // education snapshot) so grading/study-plan flows behave identically.
        const manualEnrollments = await StudentEnrollment.countDocuments({
            studentId: manualResponse.body._id,
            coursePackageId: coursePackage._id,
        });
        const fileEnrollments = await StudentEnrollment.countDocuments({
            studentId: fileStudent._id,
            coursePackageId: coursePackage._id,
        });
        expect(manualEnrollments).toBeGreaterThan(0);
        expect(fileEnrollments).toBe(manualEnrollments);

    });
});
