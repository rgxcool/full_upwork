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
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import {
    CertificateSettings,
    CertificateTemplate,
    CertificateRecord,
} from "../../src/models/certificateModel.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

// Avoid launching a real Chrome browser in tests; the HTML→PDF layer is
// exercised end-to-end separately (see certificatePdf tests / manual).
vi.mock("../../src/services/certificatePdf.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        buildCertificateHtml: vi.fn(async ({ snapshot }) =>
            `<html><body>${snapshot.studentName || "ELEV"}</body></html>`
        ),
        htmlToPdfBuffer: vi.fn(async () => Buffer.from("%PDF-1.4 mock")),
    };
});

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        roles: ["systemadmin"],
        name: "Test User",
        email: "test@example.com",
        ...overrides,
    };
    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

const createEligibleStudent = async () => {
    const Student = mongoose.model("Student");
    const student = await Student.create({
        name: "Anna Testsson",
        personalNumber: "199001011234",
        email: "anna@example.com",
        aplStatus: "GREEN",
    });
    return student;
};

const createCompletedEnrollment = async (studentId, { course, coursePackage } = {}) => {
    const c = course || (await Course.create({ courseName: "Svenska 1", courseCode: "SVE1" }));
    const enrollment = await StudentEnrollment.create({
        studentId,
        courseInstanceId: c._id,
        mainCourseId: c._id,
        coursePackageId: coursePackage?._id,
        status: "completed",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-30"),
        completedAt: new Date("2025-06-30"),
        grade: "VG",
    });
    return enrollment;
};

describe("Certificate Record Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await CertificateSettings.deleteMany({});
        await CertificateTemplate.deleteMany({});
        await CertificateRecord.deleteMany({});
        await StudentEnrollment.deleteMany({});
        await mongoose.model("Student").deleteMany({});
        await Course.deleteMany({});
        await CoursePackage.deleteMany({});
        // ensure the template exists for generation in the preview pass
        const studietyp = { key: "studieintyg", name: "Studieintyg", html: "<h1>{{title}}</h1>", orientation: "portrait" };
        await CertificateTemplate.findOneAndUpdate({ key: "studieintyg" }, studietyp, { upsert: true });
        await CertificateTemplate.findOneAndUpdate(
            { key: "diplom" },
            { key: "diplom", name: "Diplom", html: "<h1>{{title}}</h1>", orientation: "landscape" },
            { upsert: true }
        );
        await CertificateSettings.create({ schoolName: "Mindful", signerName: "Rektor", signerTitle: "Rektor" });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await CertificateSettings.deleteMany({});
        await CertificateTemplate.deleteMany({});
        await CertificateRecord.deleteMany({});
        await StudentEnrollment.deleteMany({});
        await mongoose.model("Student").deleteMany({});
        await Course.deleteMany({});
        await CoursePackage.deleteMany({});
    });

    const admin = signToken();

    describe("GET /api/certificates/candidates", () => {
        it("lists an eligible studyintyg candidate", async () => {
            const student = await createEligibleStudent();
            await createCompletedEnrollment(student._id);

            const res = await request(app)
                .get("/api/certificates/candidates")
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);

            expect(res.body.candidates.length).toBeGreaterThan(0);
            expect(res.body.candidates[0].studentName).toBe("Anna Testsson");
            expect(res.body.candidates[0].eligible).toBe(true);
        });

        it("denies teachers", async () => {
            const teacher = signToken({ role: "teacher", roles: ["teacher"] });
            await request(app)
                .get("/api/certificates/candidates")
                .set("Authorization", `Bearer ${teacher}`)
                .expect(403);
        });
    });

    describe("POST /api/certificates (create draft)", () => {
        it("creates a draft for an eligible enrollment", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);

            const res = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" })
                .expect(201);

            expect(res.body.status).toBe("draft");
            expect(res.body.studentName).toBe("Anna Testsson");
            expect(res.body.type).toBe("studieintyg");
        });

        it("rejects creation for an unknown enrollment", async () => {
            const res = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: new mongoose.Types.ObjectId().toString(), type: "studieintyg" })
                .expect(404);
        });
    });

    describe("approve + generate lifecycle", () => {
        it("approves then generates a pdf and stores a file id", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);

            const created = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });

            const id = created.body._id;
            expect(created.body.certificateNumber).toBeFalsy();

            const approved = await request(app)
                .post(`/api/certificates/${id}/approve`)
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);
            expect(approved.body.status).toBe("approved");

            const generated = await request(app)
                .post(`/api/certificates/${id}/generate`)
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);
            expect(generated.body.status).toBe("generated");
            expect(generated.body.certificateNumber).toMatch(/^ML-\d{4}-\d{5}$/);
            expect(generated.body.pdfFileId).toBeTruthy();
            expect(generated.body.generatedBy).toBeDefined();
        });

        it("blocks editing a generated certificate", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);
            const created = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });
            const id = created.body._id;
            await request(app).post(`/api/certificates/${id}/approve`).set("Authorization", `Bearer ${admin}`);
            await request(app).post(`/api/certificates/${id}/generate`).set("Authorization", `Bearer ${admin}`);

            const res = await request(app)
                .put(`/api/certificates/${id}`)
                .set("Authorization", `Bearer ${admin}`)
                .send({ grade: "MVG" })
                .expect(400);
            expect(res.body.message).toContain("Kan inte redigera");
        });
    });

    describe("GET /api/certificates (history list)", () => {
        it("returns paginated records with filters", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);
            await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });

            const res = await request(app)
                .get("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .query({ type: "studieintyg", status: "draft" })
                .expect(200);

            expect(res.body.records.length).toBe(1);
            expect(res.body.total).toBe(1);
            expect(res.body.records[0].studentName).toBe("Anna Testsson");
        });
    });

    describe("download gating", () => {
        it("lets the owning student download their generated certificate", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);
            const created = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });
            const id = created.body._id;
            await request(app).post(`/api/certificates/${id}/approve`).set("Authorization", `Bearer ${admin}`);
            const generated = await request(app)
                .post(`/api/certificates/${id}/generate`)
                .set("Authorization", `Bearer ${admin}`);

            // stub the stored file so download has something to stream
            await CertificateRecord.updateOne({ _id: id }, { pdfFileId: new mongoose.Types.ObjectId() });
            const fakeFileId = generated.body.pdfFileId || new mongoose.Types.ObjectId();
            await mongoose.connection.db.collection("fs.files").insertOne({
                _id: fakeFileId,
                filename: "pdf.pdf",
                contentType: "application/pdf",
                length: 4,
                chunkSize: 255,
                uploadDate: new Date(),
                metadata: { purpose: "certificate-pdf" },
            });
            await CertificateRecord.updateOne({ _id: id }, { pdfFileId: fakeFileId });

            const studentTok = signToken({ role: "student", roles: ["student"], email: "anna@example.com" });
            const res = await request(app)
                .get(`/api/certificates/${id}/download`)
                .set("Authorization", `Bearer ${studentTok}`)
                .expect(200);
            expect(res.headers["content-type"]).toContain("application/pdf");
        });

        it("denies a student downloading someone else's certificate", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);
            const created = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });
            const id = created.body._id;
            await request(app).post(`/api/certificates/${id}/approve`).set("Authorization", `Bearer ${admin}`);
            await request(app).post(`/api/certificates/${id}/generate`).set("Authorization", `Bearer ${admin}`);

            const otherStudent = signToken({ role: "student", roles: ["student"], email: "someone-else@example.com" });
            await request(app)
                .get(`/api/certificates/${id}/download`)
                .set("Authorization", `Bearer ${otherStudent}`)
                .expect(403);
        });
    });

    describe("GET /api/certificates/mine", () => {
        it("returns only the owning student's generated records", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);
            const created = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });
            await request(app).post(`/api/certificates/${created.body._id}/approve`).set("Authorization", `Bearer ${admin}`);
            await request(app).post(`/api/certificates/${created.body._id}/generate`).set("Authorization", `Bearer ${admin}`);

            const studentTok = signToken({ role: "student", roles: ["student"], email: "anna@example.com" });
            const res = await request(app)
                .get("/api/certificates/mine")
                .set("Authorization", `Bearer ${studentTok}`)
                .expect(200);

            expect(res.body.records.length).toBe(1);
            expect(res.body.records[0].type).toBe("studieintyg");
            expect(res.body.records[0].certificateNumber).toBeTruthy();
        });

        it("returns empty for a student with no certificates", async () => {
            await createEligibleStudent();
            const studentTok = signToken({ role: "student", roles: ["student"], email: "anna@example.com" });
            const res = await request(app)
                .get("/api/certificates/mine")
                .set("Authorization", `Bearer ${studentTok}`)
                .expect(200);
            expect(res.body.records).toEqual([]);
        });

        it("redirects staff to the candidates/history view", async () => {
            await request(app)
                .get("/api/certificates/mine")
                .set("Authorization", `Bearer ${admin}`)
                .expect(400);
        });
    });

    describe("revoke", () => {
        it("revokes a record with a reason", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);
            const created = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });

            const res = await request(app)
                .post(`/api/certificates/${created.body._id}/revoke`)
                .set("Authorization", `Bearer ${admin}`)
                .send({ reason: "Felaktiga uppgifter" })
                .expect(200);

            expect(res.body.status).toBe("revoked");
            expect(res.body.revokeReason).toBe("Felaktiga uppgifter");
        });
    });

    describe("GET /api/certificates/:id/history", () => {
        it("returns the action trail", async () => {
            const student = await createEligibleStudent();
            const enrollment = await createCompletedEnrollment(student._id);
            const created = await request(app)
                .post("/api/certificates")
                .set("Authorization", `Bearer ${admin}`)
                .send({ enrollmentId: enrollment._id.toString(), type: "studieintyg" });
            await request(app).post(`/api/certificates/${created.body._id}/approve`).set("Authorization", `Bearer ${admin}`);

            const res = await request(app)
                .get(`/api/certificates/${created.body._id}/history`)
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);

            const actions = res.body.map((h) => h.action);
            expect(actions).toEqual(expect.arrayContaining(["created", "approved"]));
        });
    });
});
