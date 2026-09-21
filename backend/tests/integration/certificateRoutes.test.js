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
import jwt from "jsonwebtoken";
import certificateRoutes from "../../src/router/certificateRoutes.js";
import { CertificateSettings, CertificateTemplate } from "../../src/models/certificateModel.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

// The certificate router is mounted standalone (no full index.js boot) because
// the repo's baseline `messagingRoutes.js` references controller exports
// removed by a refactor and breaks app-wide import (out of scope).
const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                req.user = jwt.verify(
                    authHeader.split(" ")[1],
                    process.env.JWT_SECRET || "test-secret"
                );
                req.userId = req.user.userId;
            } catch {
                // leave req.user unset → authenticateUser returns 401
            }
        }
        next();
    });
    app.use("/api", certificateRoutes);
    return app;
};

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        roles: ["admin"],
        name: "Test User",
        email: "test@example.com",
        ...overrides,
    };
    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

// Minimal but well-formed PNG (signature + IHDR with real dimensions) so the
// dimension validator accepts it.
const validPng = (width = 200, height = 200) => {
    const buf = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    Buffer.from("IHDR", "latin1").copy(buf, 12);
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
};

describe("Certificate Routes", () => {
    let app;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        app = buildApp();
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

        it("updates the full certificate identity (org, authorized person, second signatory)", async () => {
            const res = await request(app)
                .put("/api/certificates/settings")
                .set("Authorization", `Bearer ${admin}`)
                .send({
                    organizationName: "Mindful Utbildning AB",
                    address: "Skolgatan 1, 191 40 Sollentuna",
                    phone: "08-123 45 00",
                    email: "info@mindful.se",
                    website: "https://mindful.se",
                    organizationNumber: "556677-8899",
                    signerDepartment: "Ledning",
                    signerContact: "anna@mindful.se",
                    signerTitle: "Rektor",
                    signerName: "Anna Berg",
                    secondSignerEnabled: true,
                    secondSignerName: "Beata Nilsson",
                    secondSignerTitle: "Studiecoach",
                })
                .expect(200);

            expect(res.body.organizationName).toBe("Mindful Utbildning AB");
            expect(res.body.address).toBe("Skolgatan 1, 191 40 Sollentuna");
            expect(res.body.organizationNumber).toBe("556677-8899");
            expect(res.body.signerDepartment).toBe("Ledning");
            expect(res.body.signerContact).toBe("anna@mindful.se");
            expect(res.body.secondSignerEnabled).toBe(true);
            expect(res.body.secondSignerName).toBe("Beata Nilsson");
            expect(res.body.secondSignerTitle).toBe("Studiecoach");
            expect(res.body.secondSignatureUrl).toBe(null);
        });

        it("increments configVersion on each identity change", async () => {
            await CertificateSettings.create({ signerName: "Rektor Anna" });

            const first = await request(app)
                .put("/api/certificates/settings")
                .set("Authorization", `Bearer ${admin}`)
                .send({ schoolName: "Mindful A" })
                .expect(200);
            expect(first.body.configVersion).toBe(2);

            const second = await request(app)
                .put("/api/certificates/settings")
                .set("Authorization", `Bearer ${admin}`)
                .send({ schoolName: "Mindful B" })
                .expect(200);
            expect(second.body.configVersion).toBe(3);
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

    describe("POST /api/certificates/settings/logo", () => {
        it("rejects an image exceeding the max dimension", async () => {
            await CertificateSettings.create({});

            // 4000px wide PNG buffer (valid signature, too large for uploads)
            const big = validPng(4096, 50);

            const res = await request(app)
                .post("/api/certificates/settings/logo")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", big, {
                    filename: "logo.png",
                    contentType: "image/png",
                })
                .expect(400);

            expect(res.body.message).toContain("för stor");
        });

        it("uploads a valid PNG logo and returns a media URL", async () => {
            await CertificateSettings.create({});

            const res = await request(app)
                .post("/api/certificates/settings/logo")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", validPng(200, 200), {
                    filename: "logo.png",
                    contentType: "image/png",
                })
                .expect(200);

            expect(res.body.logoUrl).toMatch(/^\/api\/certificates\/media\/[a-f0-9]+$/i);
        });
    });

    describe("POST /api/certificates/settings/second-signature", () => {
        it("uploads a valid PNG second signature and returns a media URL", async () => {
            const res = await request(app)
                .post("/api/certificates/settings/second-signature")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", validPng(300, 300), {
                    filename: "sig2.png",
                    contentType: "image/png",
                })
                .expect(200);

            expect(res.body.secondSignatureUrl).toMatch(/^\/api\/certificates\/media\/[a-f0-9]+$/i);
        });

        it("rejects a non-PNG second-signature upload", async () => {
            await CertificateSettings.create({});

            const res = await request(app)
                .post("/api/certificates/settings/second-signature")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", Buffer.from("gif87a"), {
                    filename: "sig2.gif",
                    contentType: "image/gif",
                })
                .expect(400);

            expect(res.body.message).toBeDefined();
        });

        it("rejects an image exceeding the max dimension", async () => {
            await CertificateSettings.create({});

            const big = validPng(3000, 3000);

            const res = await request(app)
                .post("/api/certificates/settings/second-signature")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", big, {
                    filename: "sig2.png",
                    contentType: "image/png",
                })
                .expect(400);

            expect(res.body.message).toContain("för stor");
        });

        it("delete removes the second signature", async () => {
            const upload = await request(app)
                .post("/api/certificates/settings/second-signature")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", validPng(300, 300), {
                    filename: "sig2.png",
                    contentType: "image/png",
                })
                .expect(200);
            expect(upload.body.secondSignatureUrl).toBeTruthy();

            const del = await request(app)
                .delete("/api/certificates/settings/second-signature")
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);
            expect(del.body.secondSignatureUrl).toBe(null);
        });
    });

    describe("configVersion increments on image changes", () => {
        it("bumps configVersion on signature upload and delete", async () => {
            const up = await request(app)
                .post("/api/certificates/settings/signature")
                .set("Authorization", `Bearer ${admin}`)
                .attach("file", validPng(200, 200), {
                    filename: "sig.png",
                    contentType: "image/png",
                })
                .expect(200);
            expect(up.body.signatureUrl).toBeTruthy();

            const afterUpload = await request(app)
                .get("/api/certificates/settings")
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);
            expect(afterUpload.body.configVersion).toBe(2);

            await request(app)
                .delete("/api/certificates/settings/signature")
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);

            const afterDelete = await request(app)
                .get("/api/certificates/settings")
                .set("Authorization", `Bearer ${admin}`)
                .expect(200);
            expect(afterDelete.body.configVersion).toBe(3);
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
