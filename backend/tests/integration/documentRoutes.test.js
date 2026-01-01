import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Document from "../../src/models/Document.js";
import documentRoutes from "../../src/router/documentRoutes.js";

let mongoServer;
let app;
const uploadsDir = path.join(process.cwd(), "public", "uploads");
const createdFiles = new Set();

describe("Document Routes", () => {
    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        await mongoose.connect(mongoServer.getUri());
        fs.mkdirSync(uploadsDir, { recursive: true });
        app = express();
        app.use(express.json());
        app.use("/api", documentRoutes);
    }, 60000);

    afterAll(async () => {
        await mongoose.disconnect();
        if (mongoServer) {
            await mongoServer.stop();
        }
    }, 60000);

    beforeEach(async () => {
        await Document.deleteMany({});
    });

    afterEach(() => {
        for (const filePath of createdFiles) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        createdFiles.clear();
    });

    it("uploads a document and stores metadata", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-upload-"));
        const tempFile = path.join(tempDir, "report.txt");
        fs.writeFileSync(tempFile, "sample document");

        const response = await request(app)
            .post("/api/documents/upload")
            .field("studentId", studentId.toString())
            .field("type", "REPORT")
            .attach("file", tempFile)
            .expect(201);

        expect(response.body).toMatchObject({
            student: studentId.toString(),
            originalName: "report.txt",
            type: "REPORT",
        });
        expect(response.body.filename).toBeTruthy();

        const savedPath = path.join(uploadsDir, response.body.filename);
        createdFiles.add(savedPath);
        expect(fs.existsSync(savedPath)).toBe(true);
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
    });

    it("returns 500 when no file is provided", async () => {
        const response = await request(app)
            .post("/api/documents/upload")
            .field("studentId", new mongoose.Types.ObjectId().toString())
            .expect(500);

        expect(response.body).toMatchObject({
            message: "Kunde inte ladda upp dokumentet",
        });
    });

    it("defaults document type when not provided", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-upload-"));
        const tempFile = path.join(tempDir, "general.txt");
        fs.writeFileSync(tempFile, "default type document");

        const response = await request(app)
            .post("/api/documents/upload")
            .field("studentId", studentId.toString())
            .attach("file", tempFile)
            .expect(201);

        expect(response.body).toMatchObject({
            student: studentId.toString(),
            originalName: "general.txt",
            type: "GENERAL",
        });

        const savedPath = path.join(uploadsDir, response.body.filename);
        createdFiles.add(savedPath);
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
    });

    it("returns documents for a student", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const otherStudentId = new mongoose.Types.ObjectId();

        await Document.create([
            {
                student: studentId,
                filename: "file-one.pdf",
                originalName: "file-one.pdf",
                type: "GENERAL",
            },
            {
                student: studentId,
                filename: "file-two.pdf",
                originalName: "file-two.pdf",
                type: "REPORT",
            },
            {
                student: otherStudentId,
                filename: "file-three.pdf",
                originalName: "file-three.pdf",
                type: "GENERAL",
            },
        ]);

        const response = await request(app)
            .get(`/api/documents/${studentId.toString()}`)
            .expect(200);

        expect(response.body).toHaveLength(2);
        const filenames = response.body.map((doc) => doc.filename).sort();
        expect(filenames).toEqual(["file-one.pdf", "file-two.pdf"]);
    });

    it("deletes a document by id", async () => {
        const doc = await Document.create({
            student: new mongoose.Types.ObjectId(),
            filename: "to-delete.pdf",
            originalName: "to-delete.pdf",
            type: "GENERAL",
        });

        const response = await request(app)
            .delete(`/api/documents/${doc._id.toString()}`)
            .expect(200);

        expect(response.body).toEqual({ message: "Raderad" });
        const deleted = await Document.findById(doc._id);
        expect(deleted).toBeNull();
    });
});
