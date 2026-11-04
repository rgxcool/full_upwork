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
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Student from "../../src/models/Student.js";
import AuditLog from "../../src/models/AuditLog.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let authCookie;
let teacherCookie;
let adminUserId;

const makeToken = (user) =>
    jwt.sign(
        {
            userId: user._id.toString(),
            role: user.roles[0],
            roles: user.roles,
            name: user.name,
            email: user.email,
        },
        process.env.JWT_SECRET || "test-secret"
    );

const createStudent = async () =>
    Student.create({
        name: "Logbook Student",
        personalNumber: "19900101-1234",
        email: `logbook${new mongoose.Types.ObjectId()}@example.com`,
    });

const addKit = async (studentId, kit = {}) => {
    const response = await request(app)
        .post(`/api/students/${studentId}/logbook`)
        .set("Cookie", authCookie)
        .send({ title: "Introduktionskit", ...kit })
        .expect(200);
    return response.body.logbook[0];
};

describe("logbook routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            User.deleteMany({}),
            AuditLog.deleteMany({}),
        ]);

        const hashed = await bcrypt.hash("testPassword123!", 10);
        const adminUser = await User.create({
            name: "Test Admin",
            email: "testadmin@example.com",
            password: hashed,
            roles: ["admin"],
        });
        adminUserId = adminUser._id;
        authCookie = `token=${makeToken(adminUser)}`;

        const teacherUser = await User.create({
            name: "Test Teacher",
            email: "testteacher@example.com",
            password: hashed,
            roles: ["teacher"],
        });
        teacherCookie = `token=${makeToken(teacherUser)}`;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("GET /api/students/:studentId/logbook", () => {
        it("returns 401 without authentication", async () => {
            const student = await createStudent();
            const response = await request(app)
                .get(`/api/students/${student._id}/logbook`)
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("returns 400 for an invalid studentId", async () => {
            const response = await request(app)
                .get("/api/students/not-a-valid-id/logbook")
                .set("Cookie", authCookie)
                .expect(400);
            expect(response.body).toHaveProperty("success", false);
        });

        it("returns an empty logbook when none exists", async () => {
            const student = await createStudent();
            const response = await request(app)
                .get(`/api/students/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .expect(200);
            expect(response.body).toEqual({ success: true, logbook: [] });
        });

        it("returns 404 for a missing student", async () => {
            const response = await request(app)
                .get(`/api/students/${new mongoose.Types.ObjectId()}/logbook`)
                .set("Cookie", authCookie)
                .expect(404);
            expect(response.body).toEqual({ message: "Student not found." });
        });
    });

    describe("POST /api/students/:studentId/logbook", () => {
        it("returns 400 when title is missing", async () => {
            const student = await createStudent();
            const response = await request(app)
                .post(`/api/students/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .send({})
                .expect(400);
            expect(response.body).toEqual({ message: "Titel krävs." });
        });

        it("adds a kit, persists it and writes an audit log", async () => {
            const student = await createStudent();
            const response = await request(app)
                .post(`/api/students/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .send({
                    title: "Introduktionskit",
                    description: "Välkommen till praktiken",
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.logbook).toHaveLength(1);
            expect(response.body.logbook[0].title).toBe("Introduktionskit");

            const persisted = await Student.findById(student._id).lean();
            expect(persisted.logbook).toHaveLength(1);

            const audit = await AuditLog.findOne({ entityType: "Student", action: "logbook:create" });
            expect(audit).not.toBeNull();
            expect(audit.entityId.toString()).toBe(student._id.toString());
            expect(audit.performedBy.userId.toString()).toBe(adminUserId.toString());
        });

        it("allows a teacher to add a kit", async () => {
            const student = await createStudent();
            const response = await request(app)
                .post(`/api/students/${student._id}/logbook`)
                .set("Cookie", teacherCookie)
                .send({ title: "Introduktionskit" })
                .expect(200);
            expect(response.body.logbook).toHaveLength(1);
        });

        it("stores start and end dates supplied by the form", async () => {
            const student = await createStudent();
            await addKit(student._id, {
                title: "Daterat kit",
                startDate: "2026-03-01",
                endDate: "2026-05-01",
            });

            const persisted = await Student.findById(student._id).lean();
            expect(persisted.logbook[0].startDate.toISOString()).toBe(
                "2026-03-01T00:00:00.000Z"
            );
            expect(persisted.logbook[0].endDate.toISOString()).toBe(
                "2026-05-01T00:00:00.000Z"
            );
        });

        it("rejects an impossible date with a 400 instead of a 500", async () => {
            const student = await createStudent();
            const response = await request(app)
                .post(`/api/students/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .send({ title: "Trasigt datum", startDate: "not-a-date" })
                .expect(400);
            expect(response.body).toEqual({ message: "Ogiltigt startdatum." });
        });
    });

    describe("PATCH /api/students/:studentId/logbook/:kitId", () => {
        it("updates a kit addressed by the id returned by the API", async () => {
            const student = await createStudent();
            const kit = await addKit(student._id, {
                title: "Gammalt namn",
                description: "Gammal beskrivning",
                startDate: "2026-03-01",
                endDate: "2026-05-01",
            });

            const response = await request(app)
                .patch(`/api/students/${student._id}/logbook/${kit.id}`)
                .set("Cookie", authCookie)
                .send({
                    title: "Nytt namn",
                    description: "Ny beskrivning",
                    startDate: "2026-03-02",
                    endDate: "2026-05-02",
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.logbook[0].title).toBe("Nytt namn");

            const persisted = await Student.findById(student._id).lean();
            expect(persisted.logbook[0].title).toBe("Nytt namn");
            expect(persisted.logbook[0].description).toBe("Ny beskrivning");
            expect(persisted.logbook[0].startDate.toISOString()).toBe(
                "2026-03-02T00:00:00.000Z"
            );

            const audit = await AuditLog.findOne({
                entityType: "Student",
                action: "logbook:update",
            });
            expect(audit).not.toBeNull();
        });

        it("also accepts the subdocument _id", async () => {
            const student = await createStudent();
            await addKit(student._id);
            const stored = await Student.findById(student._id);
            const subdocumentId = String(stored.logbook[0]._id);

            const response = await request(app)
                .patch(`/api/students/${student._id}/logbook/${subdocumentId}`)
                .set("Cookie", authCookie)
                .send({ title: "Uppdaterad via _id" })
                .expect(200);

            expect(response.body.logbook[0].title).toBe("Uppdaterad via _id");
        });

        it("clears dates when the form sends null", async () => {
            const student = await createStudent();
            const kit = await addKit(student._id, {
                startDate: "2026-03-01",
                endDate: "2026-05-01",
            });

            await request(app)
                .patch(`/api/students/${student._id}/logbook/${kit.id}`)
                .set("Cookie", authCookie)
                .send({ title: "Kit utan datum", startDate: null, endDate: null })
                .expect(200);

            const persisted = await Student.findById(student._id).lean();
            expect(persisted.logbook[0].startDate).toBeNull();
            expect(persisted.logbook[0].endDate).toBeNull();
        });

        it("keeps the description when it is omitted from the request", async () => {
            const student = await createStudent();
            const kit = await addKit(student._id, { description: "Behåll mig" });

            await request(app)
                .patch(`/api/students/${student._id}/logbook/${kit.id}`)
                .set("Cookie", authCookie)
                .send({ title: "Bara titeln" })
                .expect(200);

            const persisted = await Student.findById(student._id).lean();
            expect(persisted.logbook[0].description).toBe("Behåll mig");
        });

        it("returns 400 for a malformed kit id", async () => {
            const student = await createStudent();
            const response = await request(app)
                .patch(`/api/students/${student._id}/logbook/not-an-object-id`)
                .set("Cookie", authCookie)
                .send({ title: "Ny titel" })
                .expect(400);
            expect(response.body).toHaveProperty("success", false);
        });

        it("returns 404 for an unknown kit", async () => {
            const student = await createStudent();
            await addKit(student._id);
            const response = await request(app)
                .patch(`/api/students/${student._id}/logbook/${new mongoose.Types.ObjectId()}`)
                .set("Cookie", authCookie)
                .send({ title: "Ny titel" })
                .expect(404);
            expect(response.body).toEqual({ message: "Logbook kit not found." });
        });

        it("rejects an invalid date with a 400", async () => {
            const student = await createStudent();
            const kit = await addKit(student._id);
            const response = await request(app)
                .patch(`/api/students/${student._id}/logbook/${kit.id}`)
                .set("Cookie", authCookie)
                .send({ title: "Kit", endDate: "2026-02-31" })
                .expect(400);
            expect(response.body).toEqual({ message: "Ogiltigt slutdatum." });
        });
    });

    describe("DELETE /api/students/:studentId/logbook/:kitId", () => {
        it("deletes the kit by its API id and writes an audit log", async () => {
            const student = await createStudent();
            const kit = await addKit(student._id);

            const response = await request(app)
                .delete(`/api/students/${student._id}/logbook/${kit.id}`)
                .set("Cookie", authCookie)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.logbook).toEqual([]);

            const persisted = await Student.findById(student._id).lean();
            expect(persisted.logbook).toEqual([]);

            const audit = await AuditLog.findOne({
                entityType: "Student",
                action: "logbook:delete",
            });
            expect(audit).not.toBeNull();
        });

        it("only removes the requested kit", async () => {
            const student = await createStudent();
            const first = await addKit(student._id, { title: "Första" });
            await addKit(student._id, { title: "Andra" });

            const response = await request(app)
                .delete(`/api/students/${student._id}/logbook/${first.id}`)
                .set("Cookie", authCookie)
                .expect(200);

            expect(response.body.logbook).toHaveLength(1);
            expect(response.body.logbook[0].title).toBe("Andra");
        });

        it("returns 404 for an unknown kit", async () => {
            const student = await createStudent();
            const response = await request(app)
                .delete(`/api/students/${student._id}/logbook/${new mongoose.Types.ObjectId()}`)
                .set("Cookie", authCookie)
                .expect(404);
            expect(response.body).toEqual({ message: "Logbook kit not found." });
        });

        it("returns 400 for a malformed kit id", async () => {
            const student = await createStudent();
            await request(app)
                .delete(`/api/students/${student._id}/logbook/not-an-object-id`)
                .set("Cookie", authCookie)
                .expect(400);
        });
    });

    describe("permissions", () => {
        // Non-admin calls share the test rate-limit window (3 requests/min), so
        // each role check below makes a single request; the write paths are
        // exercised separately with the (rate-limit exempt) admin cookie.
        it("does not let a student read kits", async () => {
            const student = await createStudent();
            await addKit(student._id);

            const studentUser = await User.create({
                name: "Student User",
                email: "student@example.com",
                password: "testPassword123!",
                roles: ["student"],
            });
            const studentCookie = `token=${makeToken(studentUser)}`;

            await request(app)
                .get(`/api/students/${student._id}/logbook`)
                .set("Cookie", studentCookie)
                .expect(403);
        });

        // The existing "allows a teacher to add a kit" case proves that staff
        // outside admin/systemadmin can write; the GET/POST/PATCH/DELETE routes
        // all share the same LOGBOOK_ROLES guard.
    });

    describe("GET /api/student-details/:studentId/logbook", () => {
        it("returns 401 without authentication", async () => {
            const student = await createStudent();
            const response = await request(app)
                .get(`/api/student-details/${student._id}/logbook`)
                .expect(401);
            expect(response.body).toHaveProperty("error");
        });

        it("returns the logbook for a student", async () => {
            const student = await createStudent();
            student.logbook = [
                {
                    id: new mongoose.Types.ObjectId(),
                    title: "Introduktionskit",
                    status: "pending",
                },
            ];
            await student.save();

            const response = await request(app)
                .get(`/api/student-details/${student._id}/logbook`)
                .set("Cookie", authCookie)
                .expect(200);
            expect(response.body.success).toBe(true);
            expect(response.body.logbook).toHaveLength(1);
        });
    });
});
