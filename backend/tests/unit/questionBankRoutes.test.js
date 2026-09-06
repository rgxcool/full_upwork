import express from "express";
import request from "supertest";
import { Readable, PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const makeChain = (result) => {
    const chain = {
        populate: vi.fn(() => chain),
        sort: vi.fn(() => chain),
        skip: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        lean: vi.fn(() => chain),
        select: vi.fn(() => chain),
        then: undefined,
    };
    chain.then = (resolve, reject) => {
        const value = typeof result === "function" ? result() : result;
        return Promise.resolve(value).then(resolve, reject);
    };
    return chain;
};

let currentUser = { role: "admin", userId: "admin-1", roles: ["admin"] };

vi.mock("../../src/middleware/auth.js", () => ({
    isAuthenticated: (req, _res, next) => {
        req.user = currentUser;
        next();
    },
    hasRole: () => (_req, _res, next) => next(),
}));

vi.mock("../../src/models/Question.js", () => {
    const ctor = vi.fn(function (data = {}) {
        Object.assign(this, data);
        this._id = data._id || "question-1";
        this.save = vi.fn().mockResolvedValue(this);
        return this;
    });
    ctor.find = vi.fn();
    ctor.findById = vi.fn();
    ctor.findByIdAndUpdate = vi.fn();
    ctor.countDocuments = vi.fn();
    return { __esModule: true, default: ctor };
});

vi.mock("../../src/models/ExamAttempt.js", () => {
    const ctor = vi.fn(function (data = {}) {
        Object.assign(this, data);
        this._id = data._id || "attempt-1";
        this.save = vi.fn().mockResolvedValue(this);
        return this;
    });
    ctor.find = vi.fn();
    ctor.findByIdAndUpdate = vi.fn();
    return { __esModule: true, default: ctor };
});

vi.mock("../../src/models/QuestionBankPdf.js", () => {
    const ctor = vi.fn(function (data = {}) {
        Object.assign(this, data);
        this._id = data._id || "pdf-record-1";
        this.save = vi.fn().mockResolvedValue(this);
        return this;
    });
    ctor.find = vi.fn();
    ctor.findOne = vi.fn();
    ctor.deleteOne = vi.fn();
    return { __esModule: true, default: ctor };
});

vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
    },
}));

vi.mock("mongodb", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, GridFSBucket: vi.fn() };
});

import Question from "../../src/models/Question.js";
import ExamAttempt from "../../src/models/ExamAttempt.js";
import QuestionBankPdf from "../../src/models/QuestionBankPdf.js";
import { GridFSBucket } from "mongodb";
import questionBankRoutes from "../../src/router/questionBankRoutes.js";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use("/api/question-bank", questionBankRoutes);
    return app;
};

const gridFS = {
    openUploadStream: vi.fn(),
    openDownloadStream: vi.fn(),
    delete: vi.fn(),
};

const validObjectId = "507f1f77bcf86cd799439011";

const mockDb = {
    collection: vi.fn(() => ({ findOne: vi.fn() })),
};

describe("questionBankRoutes", () => {
    let app;

    beforeEach(() => {
        app = buildApp();
        currentUser = { role: "admin", userId: "admin-1", roles: ["admin"] };
        vi.clearAllMocks();
        GridFSBucket.mockClear();
        GridFSBucket.mockImplementation(function () {
            return gridFS;
        });
        gridFS.openDownloadStream.mockReturnValue(Readable.from([Buffer.from("pdf")]));
        gridFS.delete.mockResolvedValue(undefined);
        mockDb.collection.mockReturnValue({
            findOne: vi.fn().mockResolvedValue({ _id: "file-1", contentType: "application/pdf" }),
        });
        mongoose.connection.db = mockDb;
        Question.findById.mockReturnValue({ populate: vi.fn() });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        Question._idCounter = 0;
    });

    describe("GET /", () => {
        it("returns filtered questions with pagination metadata", async () => {
            Question.find.mockReturnValue(makeChain([{ questionText: "Q1" }]));
            Question.countDocuments.mockResolvedValue(3);

            const res = await request(app)
                .get(
                    "/api/question-bank?subject=Matematik&questionType=essay&course=" +
                        validObjectId +
                        "&active=true&search=algebra&page=2&limit=10"
                )
                .expect(200);

            expect(Question.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: "Matematik",
                    questionType: "essay",
                    course: validObjectId,
                    active: true,
                    questionText: { $regex: "algebra", $options: "i" },
                })
            );
            expect(res.body.success).toBe(true);
            expect(res.body.total).toBe(3);
            expect(res.body.pages).toBe(1);
        });

        it("returns 400 for an invalid course id", async () => {
            const res = await request(app)
                .get("/api/question-bank?course=not-an-id")
                .expect(400);
            expect(res.body.message).toBe("Ogiltigt kurs-ID");
        });

        it("returns 500 when the query fails", async () => {
            Question.find.mockReturnValue(
                makeChain(() => Promise.reject(new Error("boom")))
            );

            const res = await request(app).get("/api/question-bank").expect(500);
            expect(res.body.message).toBe("Intern servererror");
        });
    });

    describe("GET /categories and /types", () => {
        it("returns the subject list", async () => {
            const res = await request(app)
                .get("/api/question-bank/categories")
                .expect(200);
            expect(res.body.success).toBe(true);
            expect(res.body.subjects).toContain("Matematik");
        });

        it("returns the question types list", async () => {
            const res = await request(app)
                .get("/api/question-bank/types")
                .expect(200);
            expect(res.body.success).toBe(true);
            expect(res.body.types).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ value: "multipleChoice" }),
                ])
            );
        });
    });

    describe("POST /generate-exam", () => {
        it("returns 400 when courseId is missing", async () => {
            const res = await request(app)
                .post("/api/question-bank/generate-exam")
                .send({ numberOfQuestions: 5 })
                .expect(400);
            expect(res.body.message).toBe("Kurs-ID är obligatorisk");
        });

        it("returns 400 for an invalid courseId", async () => {
            const res = await request(app)
                .post("/api/question-bank/generate-exam")
                .send({ courseId: "nope" })
                .expect(400);
            expect(res.body.message).toBe("Ogiltigt kurs-ID");
        });

        it("returns 400 when no questions match the filter", async () => {
            Question.find.mockReturnValue(makeChain([]));

            const res = await request(app)
                .post("/api/question-bank/generate-exam")
                .send({ courseId: validObjectId })
                .expect(400);
            expect(res.body.message).toBe("Inga frågor hittades med angivna filter");
        });

        it("generates an exam attempt from available questions", async () => {
            Question.find.mockReturnValue(
                makeChain([{ _id: "q1" }, { _id: "q2" }, { _id: "q3" }])
            );

            const res = await request(app)
                .post("/api/question-bank/generate-exam")
                .send({
                    courseId: validObjectId,
                    subject: "Matematik",
                    questionType: "multipleChoice",
                    numberOfQuestions: 2,
                    includeInactive: true,
                })
                .expect(200);

            expect(Question.find).toHaveBeenCalledWith(
                expect.objectContaining({ course: validObjectId })
            );
            expect(res.body.success).toBe(true);
            expect(res.body.examAttemptId).toBe("attempt-1");
            expect(res.body.selectedCount).toBe(2);
        });
    });

    describe("GET /exam-attempts", () => {
        it("returns recent exam attempts", async () => {
            ExamAttempt.find.mockReturnValue(
                makeChain([{ _id: "attempt-1", title: "Exam" }])
            );

            const res = await request(app)
                .get("/api/question-bank/exam-attempts")
                .expect(200);

            expect(ExamAttempt.find).toHaveBeenCalled();
            expect(res.body.examAttempts).toEqual(
                expect.arrayContaining([expect.objectContaining({ _id: "attempt-1" })])
            );
        });
    });

    describe("PUT /exam-attempts/:id/questions", () => {
        it("returns 400 for an invalid id", async () => {
            const res = await request(app)
                .put("/api/question-bank/exam-attempts/bad/questions")
                .send({ questionIds: [] })
                .expect(400);
            expect(res.body.message).toBe("Ogiltigt exam-ID");
        });

        it("returns 400 when questionIds is not an array", async () => {
            const res = await request(app)
                .put(`/api/question-bank/exam-attempts/${validObjectId}/questions`)
                .send({ questionIds: "q1" })
                .expect(400);
            expect(res.body.message).toBe("questionIds måste vara en array");
        });

        it("returns 404 when the exam attempt does not exist", async () => {
            ExamAttempt.findByIdAndUpdate.mockResolvedValue(null);

            const res = await request(app)
                .put(`/api/question-bank/exam-attempts/${validObjectId}/questions`)
                .send({ questionIds: [validObjectId] })
                .expect(404);
            expect(res.body.message).toBe("Exam hittades inte");
        });

        it("updates the attempt with only valid question ids", async () => {
            ExamAttempt.findByIdAndUpdate.mockResolvedValue({ _id: "attempt-1" });

            const res = await request(app)
                .put(`/api/question-bank/exam-attempts/${validObjectId}/questions`)
                .send({ questionIds: [validObjectId, "invalid-id"] })
                .expect(200);

            expect(ExamAttempt.findByIdAndUpdate).toHaveBeenCalledWith(
                validObjectId,
                {
                    selectedQuestions: [validObjectId],
                    selectedCount: 1,
                },
                { new: true }
            );
            expect(res.body.success).toBe(true);
        });
    });

    describe("GET /by-course/:courseId", () => {
        it("returns 400 for an invalid course id", async () => {
            const res = await request(app)
                .get("/api/question-bank/by-course/bad")
                .expect(400);
            expect(res.body.message).toBe("Ogiltigt kurs-ID");
        });

        it("filters questions by subject and question type", async () => {
            Question.find.mockReturnValue(makeChain([{ _id: "q1" }]));

            const res = await request(app)
                .get(
                    `/api/question-bank/by-course/${validObjectId}?subject=Matematik&questionType=essay`
                )
                .expect(200);

            expect(Question.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    course: validObjectId,
                    active: true,
                    subject: "Matematik",
                    questionType: "essay",
                })
            );
            expect(res.body.questions).toHaveLength(1);
        });
    });

    describe("POST /", () => {
        it("returns 400 when questionText is missing", async () => {
            const res = await request(app)
                .post("/api/question-bank")
                .send({ questionType: "essay", course: validObjectId })
                .expect(400);
            expect(res.body.message).toBe("Frågetext är obligatorisk");
        });

        it("returns 400 when questionType is missing", async () => {
            const res = await request(app)
                .post("/api/question-bank")
                .send({ questionText: "Vad?", course: validObjectId })
                .expect(400);
            expect(res.body.message).toBe("Frågetyp är obligatorisk");
        });

        it("returns 400 when course is missing or invalid", async () => {
            const missing = await request(app)
                .post("/api/question-bank")
                .send({ questionText: "Vad?", questionType: "essay" })
                .expect(400);
            expect(missing.body.message).toBe("Kurs är obligatorisk");

            const invalid = await request(app)
                .post("/api/question-bank")
                .send({ questionText: "Vad?", questionType: "essay", course: "xx" })
                .expect(400);
            expect(invalid.body.message).toBe("Ogiltigt kurs-ID");
        });

        it("creates a multiple choice question with options and answer", async () => {
            const res = await request(app)
                .post("/api/question-bank")
                .send({
                    questionText: "Vad är 2+2?",
                    course: validObjectId,
                    subject: "Matematik",
                    questionType: "multipleChoice",
                    options: ["3", "4"],
                    correctAnswer: "4",
                    answerGuidelines: "Guidelines",
                    moduleNumber: 2,
                    difficulty: 2,
                })
                .expect(201);

            const question = Question.mock.instances.at(-1);
            expect(question.questionText).toBe("Vad är 2+2?");
            expect(question.subject).toBe("Matematik");
            expect(question.options).toEqual(["3", "4"]);
            expect(question.correctAnswer).toBe("4");
            expect(question.createdBy).toBe("admin-1");
            expect(res.body.message).toBe("Fråga skapad");
        });

        it("does not attach options for essay questions", async () => {
            await request(app)
                .post("/api/question-bank")
                .send({
                    questionText: "Skriv en uppsats",
                    course: validObjectId,
                    questionType: "essay",
                    options: ["oops"],
                })
                .expect(201);

            const question = Question.mock.instances.at(-1);
            expect(question.options).toBeUndefined();
            expect(question.subject).toBe("Övrig");
        });
    });

    describe("PDF upload", () => {
        it("returns 400 when no files are uploaded", async () => {
            const res = await request(app)
                .post("/api/question-bank/pdfs")
                .field("course", validObjectId)
                .expect(400);
            expect(res.body.message).toBe("Inga filer uppladdade");
        });

        it("returns 400 for a non-PDF upload", async () => {
            const res = await request(app)
                .post("/api/question-bank/pdfs")
                .field("course", validObjectId)
                .attach("questionPdf", Buffer.from("x"), {
                    filename: "q.txt",
                    contentType: "text/plain",
                })
                .expect(400);
            expect(res.body.message).toBe("Endast PDF-filer är tillåtna");
        });

        it("rejects files larger than 10MB", async () => {
            const big = Buffer.alloc(11 * 1024 * 1024);
            const res = await request(app)
                .post("/api/question-bank/pdfs")
                .field("course", validObjectId)
                .attach("questionPdf", big, {
                    filename: "big.pdf",
                    contentType: "application/pdf",
                })
                .expect(413);
            expect(res.body.message).toMatch(/Maxstorlek är 10 MB/);
        });

        it("uploads question and answer pdfs to GridFS and persists the record", async () => {
            let idCounter = 0;
            gridFS.openUploadStream.mockImplementation(() =>
                Object.assign(new PassThrough(), { id: "gridfs-" + ++idCounter })
            );
            const oldRecord = null;
            QuestionBankPdf.findOne.mockResolvedValue(oldRecord);

            const res = await request(app)
                .post("/api/question-bank/pdfs")
                .field("course", validObjectId)
                .attach("questionPdf", Buffer.from("q"), {
                    filename: "fragor.pdf",
                    contentType: "application/pdf",
                })
                .attach("answerPdf", Buffer.from("a"), {
                    filename: "svar.pdf",
                    contentType: "application/pdf",
                })
                .expect(200);

            expect(GridFSBucket).toHaveBeenCalled();
            expect(res.body.questionPdfName).toBe("fragor.pdf");
            expect(res.body.answerPdfName).toBe("svar.pdf");
            const record = QuestionBankPdf.mock.instances.at(-1);
            expect(record.questionPdfFileId).toBe("gridfs-1");
            expect(record.save).toHaveBeenCalled();
        });

        it("replaces an existing pdf and deletes the old gridfs file", async () => {
            gridFS.openUploadStream.mockImplementation(() =>
                Object.assign(new PassThrough(), { id: "gridfs-answer" })
            );
            gridFS.delete.mockResolvedValue(undefined);
            const existingRecord = {
                _id: "record-1",
                questionPdfFileId: "old-file",
                answerPdfFileId: null,
                save: vi.fn().mockResolvedValue(true),
            };
            QuestionBankPdf.findOne.mockResolvedValue(existingRecord);

            await request(app)
                .post("/api/question-bank/pdfs")
                .field("course", validObjectId)
                .attach("questionPdf", Buffer.from("q"), {
                    filename: "ny.pdf",
                    contentType: "application/pdf",
                })
                .expect(200);

            expect(gridFS.delete).toHaveBeenCalledWith("old-file");
            expect(existingRecord.questionPdfFileId).toBe("gridfs-answer");
            expect(existingRecord.questionPdfName).toBe("ny.pdf");
            expect(existingRecord.save).toHaveBeenCalled();
        });

        it("returns 400 when course is missing or invalid", async () => {
            const noCourse = await request(app)
                .post("/api/question-bank/pdf test".replace(" test", "s"))
                .attach("questionPdf", Buffer.from("q"), {
                    filename: "q.pdf",
                    contentType: "application/pdf",
                })
                .expect(400);
            expect(noCourse.body.message).toBe("Kurs krävs");
        });
    });

    describe("GET /pdfs", () => {
        it("returns 400 when course is missing", async () => {
            const res = await request(app).get("/api/question-bank/pdfs").expect(400);
            expect(res.body.message).toBe("Kurs krävs");
        });

        it("returns metadata record", async () => {
            QuestionBankPdf.findOne.mockResolvedValue({
                questionPdfName: "f.pdf",
                answerPdfName: null,
                questionPdfFileId: "507f1f77bcf86cd799439011",
                answerPdfFileId: "507f1f77bcf86cd799439012",
                updatedAt: new Date("2026-01-01"),
            });

            const res = await request(app)
                .get(`/api/question-bank/pdfs?course=${validObjectId}`)
                .expect(200);

            expect(res.body.questionPdfName).toBe("f.pdf");
            expect(res.body.answerPdfName).toBeNull();
        });

        it("returns nulls when no record exists", async () => {
            QuestionBankPdf.findOne.mockResolvedValue(null);

            const res = await request(app)
                .get(`/api/question-bank/pdfs?course=${validObjectId}`)
                .expect(200);

            expect(res.body.questionPdfName).toBeNull();
            expect(res.body.answerPdfFileId).toBeNull();
        });
    });

    describe("GET /pdfs/:type/download", () => {
        it("returns 400 for an invalid type or missing course", async () => {
            const badType = await request(app)
                .get(`/api/question-bank/pdfs/notes/download?course=${validObjectId}`)
                .expect(400);
            expect(badType.body.message).toBe("Ogiltig filtyp");

            const noCourse = await request(app)
                .get("/api/question-bank/pdfs/question/download")
                .expect(400);
            expect(noCourse.body.message).toBe("Kurs krävs");
        });

        it("returns 404 when no record exists", async () => {
            QuestionBankPdf.findOne.mockResolvedValue(null);

            const res = await request(app)
                .get(`/api/question-bank/pdfs/question/download?course=${validObjectId}`)
                .expect(404);
            expect(res.body.message).toBe("Inga PDF-filer uppladdade");
        });

        it("returns 404 when the requested file id is missing", async () => {
            QuestionBankPdf.findOne.mockResolvedValue({
                questionPdfFileId: null,
                answerPdfFileId: "507f1f77bcf86cd799439012",
                questionPdfName: null,
                answerPdfName: "svar.pdf",
            });

            const res = await request(app)
                .get(`/api/question-bank/pdfs/question/download?course=${validObjectId}`)
                .expect(404);
            expect(res.body.message).toBe("Filen hittades inte");
        });

        it("streams the pdf file", async () => {
            QuestionBankPdf.findOne.mockResolvedValue({
                questionPdfFileId: "507f1f77bcf86cd799439011",
                questionPdfName: "fragor.pdf",
                answerPdfFileId: null,
                answerPdfName: null,
            });

            const res = await request(app)
                .get(`/api/question-bank/pdfs/question/download?course=${validObjectId}`)
                .expect(200);

            expect(GridFSBucket).toHaveBeenCalled();
            expect(res.headers["content-type"]).toBe("application/pdf");
            expect(res.body.toString()).toBe("pdf");
        });

        it("returns 404 when the gridfs file is gone", async () => {
            QuestionBankPdf.findOne.mockResolvedValue({
                questionPdfFileId: "507f1f77bcf86cd799439011",
                questionPdfName: "fragor.pdf",
                answerPdfFileId: null,
                answerPdfName: null,
            });
            mockDb.collection.mockReturnValue({
                findOne: vi.fn().mockResolvedValue(null),
            });

            const res = await request(app)
                .get(`/api/question-bank/pdfs/question/download?course=${validObjectId}`)
                .expect(404);
            expect(res.body.message).toBe("Filen hittades inte i databasen");
        });
    });

    describe("DELETE /pdfs/:type", () => {
        it("returns 400 when course is missing or invalid", async () => {
            const res = await request(app)
                .delete("/api/question-bank/pdfs/question")
                .expect(400);
            expect(res.body.message).toBe("Kurs krävs");
        });

        it("returns 404 when no record exists", async () => {
            QuestionBankPdf.findOne.mockResolvedValue(null);

            const res = await request(app)
                .delete(`/api/question-bank/pdfs/question?course=${validObjectId}`)
                .expect(404);
            expect(res.body.message).toBe("Inga PDF-filer hittades");
        });

        it("deletes both files and removes the record", async () => {
            QuestionBankPdf.findOne.mockResolvedValue({
                _id: "record-1",
                questionPdfFileId: "507f1f77bcf86cd799439011",
                answerPdfFileId: "507f1f77bcf86cd799439012",
            });
            QuestionBankPdf.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const res = await request(app)
                .delete(`/api/question-bank/pdfs/both?course=${validObjectId}`)
                .expect(200);

            expect(gridFS.delete).toHaveBeenCalledTimes(2);
            expect(QuestionBankPdf.deleteOne).toHaveBeenCalledWith({
                _id: "record-1",
            });
            expect(res.body.success).toBe(true);
        });

        it("keeps the record when only one file type is removed", async () => {
            const record = {
                _id: "record-1",
                questionPdfFileId: "507f1f77bcf86cd799439011",
                answerPdfFileId: "507f1f77bcf86cd799439012",
                save: vi.fn().mockResolvedValue(true),
            };
            QuestionBankPdf.findOne.mockResolvedValue(record);

            const res = await request(app)
                .delete(`/api/question-bank/pdfs/answer?course=${validObjectId}`)
                .expect(200);

            expect(record.answerPdfFileId).toBeUndefined();
            expect(record.save).toHaveBeenCalled();
            expect(QuestionBankPdf.deleteOne).not.toHaveBeenCalled();
            expect(res.body.success).toBe(true);
        });
    });

    describe("GET /student/courses", () => {
        it("returns 403 for non-student users", async () => {
            const res = await request(app)
                .get("/api/question-bank/student/courses")
                .expect(403);
            expect(res.body.message).toBe("Åtkast nekad");
        });

        it("returns 404 when no student record matches the email", async () => {
            currentUser = { role: "student", userId: "admin-1", roles: ["student"] };
            const student = vi.fn();
            student.findOne = vi.fn().mockResolvedValue(null);
            vi.spyOn(mongoose, "model").mockReturnValueOnce(student);

            const res = await request(app)
                .get("/api/question-bank/student/courses")
                .expect(404);
            expect(res.body.message).toBe("Elev hittades inte");
        });

        it("groups questions and pdfs per enrolled course", async () => {
            currentUser = { role: "student", userId: "student-1", roles: ["student"] };
            const student = vi.fn();
            student.findOne = vi.fn().mockResolvedValue({ _id: "student-1" });
            vi.spyOn(mongoose, "model").mockReturnValueOnce(student);

            const enrollment = {
                _id: "e1",
                mainCourseId: { _id: "course-1", courseName: "Matte", courseCode: "MAT1" },
                status: "enrolled",
                startDate: new Date(),
                endDate: new Date(),
            };
            const StudentEnrollment = await import("../../src/models/StudentEnrollment.js");
            StudentEnrollment.default.find.mockReturnValue(
                makeChain([enrollment])
                    .populate()
                    .lean()
            );
            Question.find.mockReturnValue(
                makeChain([
                    { _id: "q1", course: { toString: () => "course-1" } },
                    { _id: "q2", course: { toString: () => "other" } },
                ]).sort()
            );
            QuestionBankPdf.find.mockReturnValue(
                makeChain([
                    {
                        course: { toString: () => "course-1" },
                        questionPdfName: "q.pdf",
                        answerPdfName: "a.pdf",
                        questionPdfFileId: "f1",
                        answerPdfFileId: "f2",
                    },
                ])
            );

            const res = await request(app)
                .get("/api/question-bank/student/courses")
                .expect(200);

            expect(res.body.courses).toHaveLength(1);
            expect(res.body.courses[0].questions).toHaveLength(1);
            expect(res.body.courses[0].pdfs.questionPdfName).toBe("q.pdf");
        });
    });

    describe("GET /:id", () => {
        it("returns 400 for an invalid id", async () => {
            const res = await request(app)
                .get("/api/question-bank/bad-id")
                .expect(400);
            expect(res.body.message).toBe("Ogiltigt fråge-ID");
        });

        it("returns 404 when the question does not exist", async () => {
            Question.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue(null),
            });

            const res = await request(app)
                .get(`/api/question-bank/${validObjectId}`)
                .expect(404);
            expect(res.body.message).toBe("Fråga hittades inte");
        });

        it("returns the question", async () => {
            Question.findById.mockReturnValue({
                populate: vi.fn().mockResolvedValue({ _id: validObjectId, questionText: "Vad?" }),
            });

            const res = await request(app)
                .get(`/api/question-bank/${validObjectId}`)
                .expect(200);
            expect(res.body.question.questionText).toBe("Vad?");
        });
    });

    describe("PUT /:id", () => {
        it("returns 400 for an invalid id", async () => {
            const res = await request(app)
                .put("/api/question-bank/bad-id")
                .send({ questionText: "x" })
                .expect(400);
            expect(res.body.message).toBe("Ogiltigt fråge-ID");
        });

        it("returns 404 when the question does not exist", async () => {
            Question.findByIdAndUpdate.mockResolvedValue(null);

            const res = await request(app)
                .put(`/api/question-bank/${validObjectId}`)
                .send({ questionText: "Nytt" })
                .expect(404);
            expect(res.body.message).toBe("Fråga hittades inte");
        });

        it("updates supported fields only", async () => {
            Question.findByIdAndUpdate.mockResolvedValue({ _id: validObjectId });

            await request(app)
                .put(`/api/question-bank/${validObjectId}`)
                .send({
                    questionText: "Ny text",
                    subject: "Svenska",
                    questionType: "trueFalse",
                    options: ["Sant", "Falskt"],
                    correctAnswer: "Sant",
                    answerGuidelines: "G",
                    moduleNumber: 3,
                    difficulty: 1,
                    active: true,
                })
                .expect(200);

            expect(Question.findByIdAndUpdate).toHaveBeenCalledWith(
                validObjectId,
                expect.objectContaining({
                    questionText: "Ny text",
                    subject: "Svenska",
                    questionType: "trueFalse",
                    options: ["Sant", "Falskt"],
                    correctAnswer: "Sant",
                    moduleNumber: 3,
                    active: true,
                }),
                expect.objectContaining({ new: true, runValidators: true })
            );
        });
    });

    describe("DELETE /:id", () => {
        it("returns 400 for an invalid id", async () => {
            const res = await request(app)
                .delete("/api/question-bank/bad-id")
                .expect(400);
            expect(res.body.message).toBe("Ogiltigt fråge-ID");
        });

        it("returns 404 when the question does not exist", async () => {
            Question.findByIdAndUpdate.mockResolvedValue(null);

            const res = await request(app)
                .delete(`/api/question-bank/${validObjectId}`)
                .expect(404);
            expect(res.body.message).toBe("Fråga hittades inte");
        });

        it("soft-deletes the question", async () => {
            Question.findByIdAndUpdate.mockResolvedValue({ _id: validObjectId });

            const res = await request(app)
                .delete(`/api/question-bank/${validObjectId}`)
                .expect(200);

            expect(Question.findByIdAndUpdate).toHaveBeenCalledWith(
                validObjectId,
                { active: false },
                { new: true }
            );
            expect(res.body.message).toMatch(/tagits bort/);
        });
    });
});