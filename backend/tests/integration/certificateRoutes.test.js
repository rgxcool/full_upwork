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
import { CertificateSettings, CertificateTemplate } from "../../src/models/certificateModel.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        name: "Test User",
        email: "test@example.com",
        ...overrides,
    };
    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

describe("Certificate Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await CertificateSettings.deleteMany({});
        await CertificateTemplate.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await CertificateSettings.deleteMany({});
        await CertificateTemplate.deleteMany({});
    });

    const admin = signToken();

    describe("GET /api/certificates/settings", () => {
        it("returns defaults when no settings exist", async () => {
            const res = await request(app)
                .get("/api/certificates/settings")
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);

            expect(res.body.schoolName).toBe("Mindful Learning");
            expect(res.body.signerTitle).toBe("Rektor");
            expect(res.body.logoUrl).toBe(null);
            expect(res.body.signatureUrl).toBe(null);
        });

        it("denies teachers", async () => {
            const teacher = signToken({ role: "teacher", roles: ["teacher"] });
            await request(app)
                .get("/api/certificates/settings")
                .set("Authorization", `Bearer ${teacher}`)
                .expect(403);
        });
    });

    describe("PUT /api/certificates/settings", () => {
        it("updates signer and school fields", async () => {
            const res = await request(app)
                .put("/api/certificates/settings")
                .set("Authorization", `Bearer ${admin}`)
                .send({ signerName: "Rektor Anna", signerTitle: "Rektor", schoolName: "Mindful" })
                .expect(200);

            expect(res.body.signerName).toBe("Rektor Anna");
            expect(res.body.schoolName).toBe("Mindful");
        });
    });

    describe("GET /api/certificates/templates", () => {
        it("seeds and returns both templates", async () => {
            const res = await request(app)
                .get("/api/certificates/templates")
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);

            const keys = res.body.map((t) => t.key);
            expect(keys).toContain("diplom");
            expect(keys).toContain("studieintyg");
        });
    });

    describe("PUT /api/certificates/templates/:key", () => {
        it("updates editable fields on a template", async () => {
            await CertificateTemplate.create({
                key: "diplom",
                name: "Diplom",
                html: "<h1>{{title}}</h1>",
                orientation: "landscape",
            });

            const res = await request(app)
                .put("/api/certificates/templates/diplom")
                .set("Authorization", `Bearer ${admin}`)
                .send({ title: "STORT DIPLOM", showGrade: false })
                .expect(200);

            expect(res.body.title).toBe("STORT DIPLOM");
            expect(res.body.showGrade).toBe(false);
        });

        it("returns 404 for an unknown template key", async () => {
            const res = await request(app)
                .put("/api/certificates/templates/oops")
                .set("Authorization", `Bearer ${admin}`)
                .send({ title: "X" })
                .expect(404);

            expect(res.body.message).toBe("Mall hittades inte");
        });
    });

    describe("POST /api/certificates/settings/signature", () => {
        it("rejects a non-PNG upload", async () => {
            // Seed settings so the endpoint has a doc to update
            await CertificateSettings.create({});

            const res = await request(app)
                .post("/api/certificates/settings/signature")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", Buffer.from("not an image"), {
                    filename: "sig.txt",
                    contentType: "text/plain",
                })
                .expect(400);

            expect(res.body.message).toBeDefined();
        });

        it("rejects an oversized file", async () => {
            const res = await request(app)
                .post("/api/certificates/settings/signature")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", Buffer.alloc(2 * 1024 * 1024), {
                    filename: "sig.png",
                    contentType: "image/png",
                })
                .expect(400);

            expect(res.body.message).toContain("för stor");
        });
    });

    describe("GET /api/certificates/media/:fileId", () => {
        it("returns 404 for a missing file", async () => {
            const res = await request(app)
                .get(`/api/certificates/media/${new mongoose.Types.ObjectId()}`)
                .set("Authorization", `Bearer ${admin}`)
                .expect(404);

            expect(res.body.message).toBe("Filen hittades inte");
        });
    });
});
