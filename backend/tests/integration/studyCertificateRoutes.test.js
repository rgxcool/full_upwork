import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import studyCertificateRoutes from "../../src/router/studyCertificateRoutes.js";
import Course from "../../src/models/Course.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";
import CoursePackage from "../../src/models/CoursePackage.js";

vi.mock("../../src/services/emailService.js", () => ({
    sendDiplomaEmail: vi.fn(),
}));

import { sendDiplomaEmail } from "../../src/services/emailService.js";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const role = req.get("x-test-user-role");
        const userId = req.get("x-test-user-id");
        const email = req.get("x-test-user-email");
        if (role) {
            req.user = {
                role,
                _id: userId
                    ? new mongoose.Types.ObjectId(userId)
                    : new mongoose.Types.ObjectId(),
                userId: userId
                    ? new mongoose.Types.ObjectId(userId)
                    : new mongoose.Types.ObjectId(),
                email: email || "staff@mindful.se",
            };
        }
        next();
    });
    app.use("/api", studyCertificateRoutes);
    return app;
};

describe("Study Certificate Routes", () => {
    let app;
    let course;
    let student;
    let teacherUser;
    let teacher;
    let completedEnrollment;
    let activeEnrollment;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        app = buildApp();
        await Promise.all([
            Course.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Teacher.deleteMany({}),
            User.deleteMany({}),
        ]);

        course = await Course.create({
            courseName: "Svenska 1",
            courseCode: "SVESVE01",
        });

        student = await Student.create({
            name: "Anna Andersson",
            personalNumber: "19900101-1234",
            email: "anna@student.se",
        });

        teacherUser = await User.create({
            username: "Läraren Lars",
            email: "lars@mindful.se",
            password: "hashed-placeholder",
        });

        teacher = await Teacher.create({
            userId: teacherUser._id,
            subject: "Svenska",
        });

        completedEnrollment = await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: new mongoose.Types.ObjectId(),
            mainCourseId: course._id,
            teacherId: teacher._id,
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            endDate: new Date("2026-03-15T00:00:00.000Z"),
            status: "completed",
            completedAt: new Date("2026-03-16T00:00:00.000Z"),
            completionCertificate: "CERT-2026-ABC12345",
        });

        activeEnrollment = await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: new mongoose.Types.ObjectId(),
            mainCourseId: course._id,
            teacherId: teacher._id,
            startDate: new Date("2026-04-01T00:00:00.000Z"),
            endDate: new Date("2026-06-01T00:00:00.000Z"),
            status: "active",
        });
    }, 60000);

    afterEach(async () => {
        await Promise.all([
            Course.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Teacher.deleteMany({}),
            User.deleteMany({}),
        ]);
        vi.restoreAllMocks();
    });

    it("downloads a PDF for a completed enrollment as staff", async () => {
        const response = await request(app)
            .get(`/api/study-certificate/${completedEnrollment._id}/pdf`)
            .set("x-test-user-role", "teacher")
            .expect(200)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => callback(null, Buffer.concat(chunks)));
            });

        expect(response.headers["content-type"]).toBe("application/pdf");
        expect(response.headers["content-disposition"]).toContain(
            "studieintyg-"
        );
        const pdf = response.body;
        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
        const content = pdf.toString("latin1");
        expect(content).toContain("Studieintyg");
        expect(content).toContain("Anna Andersson");
        expect(content).toContain("Svenska 1");
        expect(content).toContain("Läraren Lars");
        expect(content).toContain("CERT-2026-ABC12345");
    });

    it("lets a student download their own certificate", async () => {
        await request(app)
            .get(`/api/study-certificate/${completedEnrollment._id}/pdf`)
            .set("x-test-user-role", "student")
            .set("x-test-user-email", "anna@student.se")
            .expect(200);
    });

    it("rejects a student who does not own the enrollment", async () => {
        const response = await request(app)
            .get(`/api/study-certificate/${completedEnrollment._id}/pdf`)
            .set("x-test-user-role", "student")
            .set("x-test-user-email", "someone-else@student.se")
            .expect(403);

        expect(response.body.message).toBe("Ej behörig");
    });

    it("rejects a certificate for an enrollment that is not completed", async () => {
        const response = await request(app)
            .get(`/api/study-certificate/${activeEnrollment._id}/pdf`)
            .set("x-test-user-role", "teacher")
            .expect(400);

        expect(response.body.message).toBe(
            "Studieintyg utfärdas först när kursen är slutförd"
        );
    });

    it("returns 404 when the enrollment does not exist", async () => {
        const response = await request(app)
            .get(
                `/api/study-certificate/${new mongoose.Types.ObjectId()}/pdf`
            )
            .set("x-test-user-role", "teacher")
            .expect(404);

        expect(response.body.message).toBe("Ingen antagning hittad");
    });

    it("returns 401 when unauthenticated", async () => {
        await request(app)
            .get(`/api/study-certificate/${completedEnrollment._id}/pdf`)
            .expect(401);
    });
});

describe("Diploma email delivery (P7/P8)", () => {
    let app;
    let pkg;
    let student;
    let courseB;
    let teacherUser;
    let teacher;
    let diplomaEnrollment;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        app = buildApp();
        await Promise.all([
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Teacher.deleteMany({}),
            User.deleteMany({}),
        ]);
        vi.mocked(sendDiplomaEmail).mockReset();

        courseB = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAMAT01",
        });
        pkg = await CoursePackage.create({
            coursePackageName: "Gymnasiepaket",
            coursePackageCode: "GYM",
            coursePackagePoints: "2500",
            coursePackageExtent: "3 år",
            coursePackageCourses: [courseB._id],
        });

        student = await Student.create({
            name: "Bea Berg",
            personalNumber: "19920202-5678",
            email: "bea@student.se",
            aplStatus: "GREEN",
        });

        teacherUser = await User.create({
            username: "Malin Mellin",
            email: "malin@mindful.se",
            password: "hashed-placeholder",
        });
        teacher = await Teacher.create({
            userId: teacherUser._id,
            subject: "Matematik",
        });

        diplomaEnrollment = await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: new mongoose.Types.ObjectId(),
            mainCourseId: courseB._id,
            teacherId: teacher._id,
            coursePackageId: pkg._id,
            startDate: new Date("2025-01-01T00:00:00.000Z"),
            endDate: new Date("2025-03-15T00:00:00.000Z"),
            status: "completed",
            completedAt: new Date("2025-03-16T00:00:00.000Z"),
            grade: "C",
            completionCertificate: "DIPL-2025-BEA123",
        });
    }, 60000);

    afterEach(async () => {
        await Promise.all([
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Teacher.deleteMany({}),
            User.deleteMany({}),
        ]);
        vi.restoreAllMocks();
    });

    it("downloads a diploma PDF and emails it to the student on real delivery", async () => {
        vi.mocked(sendDiplomaEmail).mockResolvedValue({
            sent: true,
            deliveredForReal: true,
            transportMode: "smtp",
            result: { success: true, transportMode: "smtp" },
        });

        const response = await request(app)
            .get(`/api/diploma/${diplomaEnrollment._id}/pdf`)
            .set("x-test-user-role", "admin")
            .expect(200)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => callback(null, Buffer.concat(chunks)));
            });

        expect(response.headers["content-type"]).toBe("application/pdf");
        expect(sendDiplomaEmail).toHaveBeenCalledTimes(1);
        expect(sendDiplomaEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "bea@student.se",
                filename: `diplom-${diplomaEnrollment._id}.pdf`,
            })
        );
        const attachment = vi.mocked(sendDiplomaEmail).mock.calls[0][0];
        expect(Buffer.isBuffer(attachment.pdf)).toBe(true);

        // The audit trail is written after res.send() — poll until it lands.
        const lastEntry = await waitForFirstChangeHistory(student._id);
        expect(lastEntry.changes).toContain("diplom_email_sent_generated");
    });

    it("records a not-delivered audit marker when transport does not deliver", async () => {
        vi.mocked(sendDiplomaEmail).mockResolvedValue({
            sent: false,
            deliveredForReal: false,
            transportMode: "stream",
            result: { success: true, transportMode: "stream" },
        });

        await request(app)
            .get(`/api/diploma/${diplomaEnrollment._id}/pdf`)
            .set("x-test-user-role", "admin")
            .expect(200)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => callback(null, Buffer.concat(chunks)));
            });

        const lastEntry = await waitForFirstChangeHistory(student._id);
        expect(lastEntry.changes).toContain("diplom_email_not_delivered_generated");
    });

    // addCertificateAuditTrail runs after res.send(pdf), so poll for it.
    async function waitForFirstChangeHistory(studentId) {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
            const doc = await Student.findById(studentId);
            if (doc?.changeHistory?.length) return doc.changeHistory[0];
            await new Promise((r) => setTimeout(r, 25));
        }
        throw new Error("changeHistory never populated");
    }
});
