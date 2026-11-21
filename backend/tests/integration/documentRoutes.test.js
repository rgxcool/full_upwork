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
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import Document from "../../src/models/Document.js";
import Student from "../../src/models/Student.js";
import Teacher from "../../src/models/Teacher.js";
import User from "../../src/models/User.js";
import documentRoutes from "../../src/router/documentRoutes.js";
import { AUTH_COOKIE_NAME } from "../../src/config/cookies.js";
import {
  connectTestDatabase,
  disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let app;
const userId = new mongoose.Types.ObjectId().toString();
const uploadsDir = path.join(process.cwd(), "public", "uploads");
const createdFiles = new Set();
let authHeader;
let authCookie;

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET || "test-secret");

const authFor = (token) => ({
  Authorization: `Bearer ${token}`,
  Cookie: `${AUTH_COOKIE_NAME}=${token}`,
});

const makeUser = async (roles, extra = {}) => {
  const email =
    extra.email || `${roles[0]}-${new mongoose.Types.ObjectId()}@example.com`;
  const user = await User.create({
    name: extra.name || `Syntetisk ${roles.join("+")}`,
    email,
    password: "not-a-real-hash",
    roles,
    municipalities: [],
  });
  const token = signToken({
    userId: user._id.toString(),
    role: roles[0],
    roles,
    email: user.email,
    name: user.name,
  });
  return { user, token };
};

const makeStudent = async (overrides = {}) =>
  Student.create({
    name: overrides.name || "Syntetisk Elev",
    personalNumber:
      overrides.personalNumber ||
      `19${Date.now()}${Math.floor(Math.random() * 1000)}`,
    email:
      overrides.email || `elev-${new mongoose.Types.ObjectId()}@example.com`,
    ...overrides,
  });

const makeTeacher = async (user, overrides = {}) =>
  Teacher.create({
    userId: user._id,
    subject: "Syntetiskt ämne",
    ...overrides,
  });

const writeUploadFile = (name, content = "synthetic document content") => {
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${name}`;
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, content);
  createdFiles.add(filePath);
  return { filename, filePath };
};

describe("Document Routes", () => {
  beforeAll(async () => {
    await connectTestDatabase();
    fs.mkdirSync(uploadsDir, { recursive: true });
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api", documentRoutes);
    const token = jwt.sign(
      { userId, role: "admin", roles: ["admin"], name: "Tester" },
      process.env.JWT_SECRET || "test-secret",
    );
    authHeader = `Bearer ${token}`;
    authCookie = `${AUTH_COOKIE_NAME}=${token}`;
  }, 60000);

  afterAll(async () => {
    await disconnectTestDatabase();
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
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
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
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .field("studentId", new mongoose.Types.ObjectId().toString())
      .expect(400);

    expect(response.body).toMatchObject({
      message: "File is missing in the request",
    });
  });

  it("rejects dangerous file extensions", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-upload-"));
    const tempFile = path.join(tempDir, "payload.exe");
    fs.writeFileSync(tempFile, "MZ fake executable");

    const response = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .field("studentId", new mongoose.Types.ObjectId().toString())
      .attach("file", tempFile)
      .expect(400);

    expect(response.body).toMatchObject({
      message:
        "Ogiltigt filformat. Denna filtyp är inte tillåten av säkerhetsskäl.",
    });

    const remainingFiles = await Document.find({});
    expect(remainingFiles).toHaveLength(0);
    fs.unlinkSync(tempFile);
    fs.rmdirSync(tempDir);
  });

  it("rejects html content-types", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-upload-"));
    const tempFile = path.join(tempDir, "payload.png");
    fs.writeFileSync(tempFile, "<script>alert(1)</script>");

    const response = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .field("studentId", new mongoose.Types.ObjectId().toString())
      .attach("file", tempFile, {
        filename: "payload.png",
        contentType: "text/html",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      message:
        "Ogiltigt filformat. Denna filtyp är inte tillåten av säkerhetsskäl.",
    });
    fs.unlinkSync(tempFile);
    fs.rmdirSync(tempDir);
  });

  it("defaults document type when not provided", async () => {
    const studentId = new mongoose.Types.ObjectId();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-upload-"));
    const tempFile = path.join(tempDir, "general.txt");
    fs.writeFileSync(tempFile, "default type document");

    const response = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
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
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .expect(200);

    expect(response.body).toHaveLength(2);
    const filenames = response.body.map((doc) => doc.filename).sort();
    expect(filenames).toEqual(["file-one.pdf", "file-two.pdf"]);
  });

  it("supports filtering documents by type and enrollmentId", async () => {
    const studentId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();

    await Document.create([
      {
        student: studentId,
        filename: "general.pdf",
        originalName: "general.pdf",
        type: "GENERAL",
        enrollmentId,
      },
      {
        student: studentId,
        filename: "report.pdf",
        originalName: "report.pdf",
        type: "REPORT",
        enrollmentId,
      },
      {
        student: studentId,
        filename: "report-other-enrollment.pdf",
        originalName: "report-other-enrollment.pdf",
        type: "REPORT",
        enrollmentId: new mongoose.Types.ObjectId(),
      },
    ]);

    const response = await request(app)
      .get(`/api/documents/${studentId.toString()}`)
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .query({ type: "REPORT", enrollmentId: enrollmentId.toString() })
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].filename).toBe("report.pdf");
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
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .expect(200);

    expect(response.body).toEqual({ message: "Raderad" });
    const deleted = await Document.findById(doc._id);
    expect(deleted).toBeNull();
  });

  it("stores file metadata on upload", async () => {
    const studentId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .field("studentId", studentId.toString())
      .attach("file", Buffer.from("%PDF-1.4 synthetic"), {
        filename: "intyg.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      originalName: "intyg.pdf",
      fileType: "pdf",
      mimeType: "application/pdf",
    });
    expect(response.body.size).toBeGreaterThan(0);

    createdFiles.add(path.join(uploadsDir, response.body.filename));
  });

  it("returns uploader details when listing documents", async () => {
    const { user: uploader } = await makeUser(["admin"], {
      name: "Lärare Lisa",
    });
    const student = await makeStudent();

    await Document.create({
      student: student._id,
      uploadedBy: uploader._id,
      filename: "uploader-check.pdf",
      originalName: "uploader-check.pdf",
      type: "GENERAL",
    });

    const response = await request(app)
      .get(`/api/documents/${student._id.toString()}`)
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].uploadedBy).toBe(uploader._id.toString());
    expect(response.body[0].uploader).toMatchObject({
      _id: uploader._id.toString(),
      name: "Lärare Lisa",
    });
    expect(response.body[0].fileType).toBe("pdf");
  });

  it("returns 400 for an invalid student id when listing documents", async () => {
    await request(app)
      .get("/api/documents/not-an-object-id")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .expect(400);
  });

  it("downloads a document through the protected endpoint", async () => {
    const student = await makeStudent();
    const { filename } = writeUploadFile("download-me.txt");
    const doc = await Document.create({
      student: student._id,
      filename,
      originalName: "download-me.txt",
      type: "GENERAL",
      mimeType: "text/plain",
    });

    const response = await request(app)
      .get(`/api/documents/download/${doc._id.toString()}`)
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .expect(200);

    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(response.headers["content-disposition"]).toContain(
      "download-me.txt",
    );
    expect(response.text).toBe("synthetic document content");
  });

  it("requires authentication to download a document", async () => {
    const student = await makeStudent();
    const { filename } = writeUploadFile("private.txt");
    const doc = await Document.create({
      student: student._id,
      filename,
      originalName: "private.txt",
      type: "GENERAL",
    });

    await request(app)
      .get(`/api/documents/download/${doc._id.toString()}`)
      .expect(401);
  });

  it("returns 404 for invalid or unknown document ids on download", async () => {
    await request(app)
      .get("/api/documents/download/not-an-object-id")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .expect(404);

    await request(app)
      .get(
        `/api/documents/download/${new mongoose.Types.ObjectId().toString()}`,
      )
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .expect(404);
  });

  it("shares a single document and only exposes it to the selected user", async () => {
    const owner = await makeUser(["teacher"]);
    const colleague = await makeUser(["teacher"]);
    const outsider = await makeUser(["teacher"]);
    await makeTeacher(owner.user);
    await makeTeacher(colleague.user);
    await makeTeacher(outsider.user);

    const { filename } = writeUploadFile("grading-support.txt");
    const doc = await Document.create({
      teacher: owner.user._id,
      uploadedBy: owner.user._id,
      filename,
      originalName: "grading-support.txt",
      type: "TEACHER_DOCUMENT",
      mimeType: "text/plain",
    });

    const shared = await request(app)
      .put(`/api/documents/${doc._id}/share`)
      .set(authFor(owner.token))
      .send({ userIds: [colleague.user._id.toString()] })
      .expect(200);

    expect(shared.body.sharedWith).toContain(colleague.user._id.toString());

    const colleagueList = await request(app)
      .get("/api/documents/shared")
      .set(authFor(colleague.token))
      .expect(200);
    expect(colleagueList.body.map((item) => item._id)).toContain(
      doc._id.toString(),
    );

    const outsiderList = await request(app)
      .get("/api/documents/shared")
      .set(authFor(outsider.token))
      .expect(200);
    expect(outsiderList.body.map((item) => item._id)).not.toContain(
      doc._id.toString(),
    );

    await request(app)
      .get(`/api/documents/download/${doc._id}`)
      .set(authFor(colleague.token))
      .expect(200);
    await request(app)
      .get(`/api/documents/download/${doc._id}`)
      .set(authFor(outsider.token))
      .expect(403);
  });

  it("shares a document by email and can unshare it again", async () => {
    const owner = await makeUser(["teacher"]);
    const colleague = await makeUser(["teacher"]);
    await makeTeacher(owner.user);

    const { filename } = writeUploadFile("shared-by-email.txt");
    const doc = await Document.create({
      teacher: owner.user._id,
      uploadedBy: owner.user._id,
      filename,
      originalName: "shared-by-email.txt",
      type: "TEACHER_DOCUMENT",
    });

    const shared = await request(app)
      .put(`/api/documents/${doc._id}/share`)
      .set(authFor(owner.token))
      .send({ email: colleague.user.email })
      .expect(200);
    expect(shared.body.sharedWith).toContain(colleague.user._id.toString());

    await request(app)
      .put(`/api/documents/${doc._id}/share`)
      .set(authFor(owner.token))
      .send({ userIds: [] })
      .expect(200);

    const list = await request(app)
      .get("/api/documents/shared")
      .set(authFor(colleague.token))
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it("only lets the uploader or an admin change document shares", async () => {
    const owner = await makeUser(["teacher"]);
    const stranger = await makeUser(["teacher"]);
    await makeTeacher(owner.user);
    await makeTeacher(stranger.user);

    const { filename } = writeUploadFile("private-share.txt");
    const doc = await Document.create({
      teacher: owner.user._id,
      uploadedBy: owner.user._id,
      filename,
      originalName: "private-share.txt",
      type: "TEACHER_DOCUMENT",
    });

    await request(app)
      .put(`/api/documents/${doc._id}/share`)
      .set(authFor(stranger.token))
      .send({ userIds: [stranger.user._id.toString()] })
      .expect(403);
  });

  it("lets a student list, upload and download only their own documents", async () => {
    const email = `student-${new mongoose.Types.ObjectId()}@example.com`;
    const student = await makeStudent({ email });
    const otherStudent = await makeStudent();
    const { token } = await makeUser(["student"], { email });

    const ownFile = writeUploadFile("own.txt");
    const ownDoc = await Document.create({
      student: student._id,
      filename: ownFile.filename,
      originalName: "own.txt",
      type: "GENERAL",
    });

    const otherFile = writeUploadFile("other.txt");
    const otherDoc = await Document.create({
      student: otherStudent._id,
      filename: otherFile.filename,
      originalName: "other.txt",
      type: "GENERAL",
    });

    await request(app)
      .get(`/api/documents/${student._id.toString()}`)
      .set(authFor(token))
      .expect(200);

    await request(app)
      .get(`/api/documents/${otherStudent._id.toString()}`)
      .set(authFor(token))
      .expect(403);

    await request(app)
      .get(`/api/documents/download/${ownDoc._id.toString()}`)
      .set(authFor(token))
      .expect(200);

    await request(app)
      .get(`/api/documents/download/${otherDoc._id.toString()}`)
      .set(authFor(token))
      .expect(403);

    const upload = await request(app)
      .post("/api/documents/upload")
      .set(authFor(token))
      .field("studentId", student._id.toString())
      .attach("file", Buffer.from("student upload"), "student-upload.txt")
      .expect(201);
    createdFiles.add(path.join(uploadsDir, upload.body.filename));

    await request(app)
      .post("/api/documents/upload")
      .set(authFor(token))
      .field("studentId", otherStudent._id.toString())
      .attach("file", Buffer.from("forbidden upload"), "forbidden.txt")
      .expect(403);
  });

  it("lets only the assigned teacher list, upload and download a student's documents", async () => {
    const { user: assignedUser, token: assignedToken } = await makeUser([
      "teacher",
    ]);
    const assignedTeacher = await makeTeacher(assignedUser);
    const { user: otherUser, token: otherToken } = await makeUser(["teacher"]);
    await makeTeacher(otherUser);

    const student = await makeStudent({ teacherId: assignedTeacher._id });
    const { filename } = writeUploadFile("assigned.txt");
    const doc = await Document.create({
      student: student._id,
      filename,
      originalName: "assigned.txt",
      type: "GENERAL",
    });

    await request(app)
      .get(`/api/documents/${student._id.toString()}`)
      .set(authFor(assignedToken))
      .expect(200);

    await request(app)
      .get(`/api/documents/download/${doc._id.toString()}`)
      .set(authFor(assignedToken))
      .expect(200);

    const upload = await request(app)
      .post("/api/documents/upload")
      .set(authFor(assignedToken))
      .field("studentId", student._id.toString())
      .attach("file", Buffer.from("assigned upload"), "assigned-upload.txt")
      .expect(201);
    createdFiles.add(path.join(uploadsDir, upload.body.filename));

    await request(app)
      .get(`/api/documents/${student._id.toString()}`)
      .set(authFor(otherToken))
      .expect(403);

    await request(app)
      .get(`/api/documents/download/${doc._id.toString()}`)
      .set(authFor(otherToken))
      .expect(403);

    await request(app)
      .post("/api/documents/upload")
      .set(authFor(otherToken))
      .field("studentId", student._id.toString())
      .attach("file", Buffer.from("forbidden upload"), "forbidden.txt")
      .expect(403);
  });

  it("rejects file types outside the allowlist", async () => {
    const response = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .field("studentId", new mongoose.Types.ObjectId().toString())
      .attach("file", Buffer.from("<svg></svg>"), {
        filename: "vector.svg",
        contentType: "image/svg+xml",
      })
      .expect(400);

    expect(response.body).toMatchObject({
      message:
        "Ogiltigt filformat. Denna filtyp är inte tillåten av säkerhetsskäl.",
    });
    expect(await Document.countDocuments({})).toBe(0);
  });

  it("rejects files larger than 3 GB", async () => {
    const boundary = "oversized-document-test";
    const studentId = new mongoose.Types.ObjectId().toString();
    const multipartBody = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="studentId"',
        "",
        studentId,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="too-big.pdf"',
        "Content-Type: application/pdf",
        "",
        "small test body",
        `--${boundary}--`,
        "",
      ].join("\r\n"),
    );

    const response = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .set("Content-Length", String(3 * 1024 * 1024 * 1024 + 1))
      .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
      .send(multipartBody)
      .expect(400);

    expect(response.body.message).toContain("för stor");
    expect(await Document.countDocuments({})).toBe(0);
  });

  it("rejects empty files", async () => {
    const response = await request(app)
      .post("/api/documents/upload")
      .set("Authorization", authHeader)
      .set("Cookie", authCookie)
      .field("studentId", new mongoose.Types.ObjectId().toString())
      .attach("file", Buffer.alloc(0), {
        filename: "empty.pdf",
        contentType: "application/pdf",
      })
      .expect(400);

    expect(response.body.message).toContain("tom");
    expect(await Document.countDocuments({})).toBe(0);
  });
});
