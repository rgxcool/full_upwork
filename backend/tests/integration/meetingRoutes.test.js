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
import Meeting from "../../src/models/Meeting.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const signToken = (overrides = {}) => {
    const payload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "admin",
        personalNumber: "200001010101",
        ...overrides,
    };

    return jwt.sign(payload, process.env.JWT_SECRET || "test-secret");
};

describe("Meeting Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Meeting.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Meeting.deleteMany({});
    });

    describe("GET /api/meetings", () => {
        it("returns all meetings for non-student users", async () => {
            await Meeting.create([
                {
                    title: "Meeting A",
                    start: new Date("2024-01-10T10:00:00.000Z"),
                    location: "Room A",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student A",
                        personalNumber: "200001010101",
                    },
                    bookedBy: "admin",
                },
                {
                    title: "Meeting B",
                    start: new Date("2024-01-11T10:00:00.000Z"),
                    location: "Room B",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student B",
                        personalNumber: "199901010101",
                    },
                    bookedBy: "syv",
                },
            ]);

            const token = signToken({ role: "admin" });
            const response = await request(app)
                .get("/api/meetings")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data).toHaveLength(2);
        });

        it("allows admins to filter meetings by bookedBy", async () => {
            await Meeting.create([
                {
                    title: "Meeting A",
                    start: new Date("2024-01-10T10:00:00.000Z"),
                    location: "Room A",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student A",
                        personalNumber: "200001010101",
                    },
                    bookedBy: "admin",
                },
                {
                    title: "Meeting B",
                    start: new Date("2024-01-11T10:00:00.000Z"),
                    location: "Room B",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student B",
                        personalNumber: "199901010101",
                    },
                    bookedBy: "syv",
                },
            ]);

            const token = signToken({ role: "admin" });
            const response = await request(app)
                .get("/api/meetings")
                .query({ bookedBy: "syv" })
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0]).toHaveProperty("title", "Meeting B");
        });

        it("filters meetings by student name when provided", async () => {
            await Meeting.create([
                {
                    title: "Meeting A",
                    start: new Date("2024-01-10T10:00:00.000Z"),
                    location: "Room A",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student A",
                        personalNumber: "200001010101",
                    },
                    bookedBy: "admin",
                },
                {
                    title: "Meeting B",
                    start: new Date("2024-01-11T10:00:00.000Z"),
                    location: "Room B",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student B",
                        personalNumber: "199901010101",
                    },
                    bookedBy: "syv",
                },
            ]);

            const token = signToken({ role: "admin" });
            const response = await request(app)
                .get("/api/meetings")
                .query({ studentName: "student b" })
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0]).toHaveProperty("title", "Meeting B");
        });

        it("filters meetings for syv users", async () => {
            await Meeting.create([
                {
                    title: "Meeting A",
                    start: new Date("2024-01-10T10:00:00.000Z"),
                    location: "Room A",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student A",
                        personalNumber: "200001010101",
                    },
                    bookedBy: "admin",
                },
                {
                    title: "Meeting B",
                    start: new Date("2024-01-11T10:00:00.000Z"),
                    location: "Room B",
                    student: {
                        id: new mongoose.Types.ObjectId(),
                        name: "Student B",
                        personalNumber: "199901010101",
                    },
                    bookedBy: "syv",
                },
            ]);

            const token = signToken({
                role: "syv",
            });
            const response = await request(app)
                .get("/api/meetings")
                .set("Authorization", `Bearer ${token}`)
                .expect(200);

            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0]).toHaveProperty("title", "Meeting B");
        });

        it("returns 500 when the query fails", async () => {
            vi.spyOn(Meeting, "find").mockImplementationOnce(() => {
                throw new Error("DB failure");
            });

            const token = signToken();
            const response = await request(app)
                .get("/api/meetings")
                .set("Authorization", `Bearer ${token}`)
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid hämtning av möten",
            });
        });
    });

    describe("POST /api/meetings", () => {
        it("creates a meeting when required fields are present", async () => {
            const token = signToken();
            const payload = {
                title: "New Meeting",
                start: "2024-02-01T12:00:00.000Z",
                location: "Room C",
                studentId: new mongoose.Types.ObjectId().toString(),
                studentName: "Student C",
                personalNumber: "200001010101",
                bookedBy: "admin",
            };

            const response = await request(app)
                .post("/api/meetings")
                .set("Authorization", `Bearer ${token}`)
                .send(payload)
                .expect(201);

            expect(response.body).toHaveProperty("title", "New Meeting");
            expect(response.body).toHaveProperty("bookedBy", "admin");
        });

        it("returns 400 when required fields are missing", async () => {
            const token = signToken();
            const response = await request(app)
                .post("/api/meetings")
                .set("Authorization", `Bearer ${token}`)
                .send({ title: "Incomplete meeting" })
                .expect(400);

            expect(response.body).toEqual({
                error: "Obligatoriska fält saknas",
            });
        });

        it("returns 500 when saving fails", async () => {
            vi.spyOn(Meeting.prototype, "save").mockRejectedValueOnce(
                new Error("Save failed")
            );

            const token = signToken();
            const response = await request(app)
                .post("/api/meetings")
                .set("Authorization", `Bearer ${token}`)
                .send({
                    title: "New Meeting",
                    start: "2024-02-01T12:00:00.000Z",
                    location: "Room C",
                    studentId: new mongoose.Types.ObjectId().toString(),
                    studentName: "Student C",
                    personalNumber: "200001010101",
                    bookedBy: "admin",
                })
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid sparande av möte",
            });
        });
    });

    describe("PUT /api/meetings/:id", () => {
        it("updates meeting start time", async () => {
            const meeting = await Meeting.create({
                title: "Meeting A",
                start: new Date("2024-01-10T10:00:00.000Z"),
                location: "Room A",
                student: {
                    id: new mongoose.Types.ObjectId(),
                    name: "Student A",
                    personalNumber: "200001010101",
                },
                bookedBy: "admin",
            });

            const token = signToken();
            const response = await request(app)
                .put(`/api/meetings/${meeting._id}`)
                .set("Authorization", `Bearer ${token}`)
                .send({ start: "2024-01-12T08:00:00.000Z" })
                .expect(200);

            expect(response.body).toHaveProperty("start");
        });

        it("returns 404 when meeting does not exist", async () => {
            const token = signToken();
            const response = await request(app)
                .put(`/api/meetings/${new mongoose.Types.ObjectId()}`)
                .set("Authorization", `Bearer ${token}`)
                .send({ start: "2024-01-12T08:00:00.000Z" })
                .expect(404);

            expect(response.body).toEqual({ error: "Möte hittades inte" });
        });

        it("returns 500 for invalid ids", async () => {
            const token = signToken();
            const response = await request(app)
                .put("/api/meetings/not-a-valid-id")
                .set("Authorization", `Bearer ${token}`)
                .send({ start: "2024-01-12T08:00:00.000Z" })
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid uppdatering av möte",
            });
        });
    });

    describe("DELETE /api/meetings/:id", () => {
        it("allows admins to delete a meeting", async () => {
            const meeting = await Meeting.create({
                title: "Meeting A",
                start: new Date("2024-01-10T10:00:00.000Z"),
                location: "Room A",
                student: {
                    id: new mongoose.Types.ObjectId(),
                    name: "Student A",
                    personalNumber: "200001010101",
                },
                bookedBy: "admin",
                createdBy: new mongoose.Types.ObjectId().toString(),
            });

            const token = signToken({ role: "admin" });
            await request(app)
                .delete(`/api/meetings/${meeting._id.toString()}`)
                .set("Authorization", `Bearer ${token}`)
                .expect(204);

            const deleted = await Meeting.findById(meeting._id);
            expect(deleted).toBeNull();
        });

        it("returns 403 when a non-admin is not the creator", async () => {
            const meeting = await Meeting.create({
                title: "Meeting A",
                start: new Date("2024-01-10T10:00:00.000Z"),
                location: "Room A",
                student: {
                    id: new mongoose.Types.ObjectId(),
                    name: "Student A",
                    personalNumber: "200001010101",
                },
                bookedBy: "syv",
                createdBy: new mongoose.Types.ObjectId().toString(),
            });

            const token = signToken({ role: "syv" });
            const response = await request(app)
                .delete(`/api/meetings/${meeting._id.toString()}`)
                .set("Authorization", `Bearer ${token}`)
                .expect(403);

            expect(response.body).toEqual({
                error: "Behörighet saknas för att radera detta möte",
            });
        });

        it("returns 404 when meeting does not exist", async () => {
            const token = signToken({ role: "admin" });
            const response = await request(app)
                .delete(`/api/meetings/${new mongoose.Types.ObjectId()}`)
                .set("Authorization", `Bearer ${token}`)
                .expect(404);

            expect(response.body).toEqual({ error: "Möte hittades inte" });
        });

        it("returns 500 for invalid ids", async () => {
            const token = signToken({ role: "admin" });
            const response = await request(app)
                .delete("/api/meetings/not-a-valid-id")
                .set("Authorization", `Bearer ${token}`)
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid radering av möte",
            });
        });
    });
});
