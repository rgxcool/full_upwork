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
import Task from "../../src/models/Task.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const userId = "user-123";
const otherUserId = "user-456";

const buildAuthHeader = (id) => ({
    Authorization: `Bearer ${jwt.sign(
        { userId: id },
        process.env.JWT_SECRET || "test-secret"
    )}`,
});

describe("Task Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Task.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Task.deleteMany({});
    });

    describe("GET /api/task/", () => {
        it("returns tasks for the authenticated user", async () => {
            await Task.create([
                { description: "User task", userId },
                { description: "Other task", userId: otherUserId },
            ]);

            const response = await request(app)
                .get("/api/task/")
                .set(buildAuthHeader(userId))
                .expect(200);

            expect(response.body).toHaveLength(1);
            expect(response.body[0]).toMatchObject({
                description: "User task",
                userId,
                isDone: false,
            });
        });

        it("returns 500 when the database query fails", async () => {
            vi.spyOn(Task, "find").mockImplementationOnce(() => {
                throw new Error("Query failed");
            });

            const response = await request(app)
                .get("/api/task/")
                .set(buildAuthHeader(userId))
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid hämtning av uppgifter.",
            });
        });
    });

    describe("POST /api/task/", () => {
        it("rejects missing descriptions", async () => {
            const response = await request(app)
                .post("/api/task/")
                .set(buildAuthHeader(userId))
                .send({})
                .expect(400);

            expect(response.body).toEqual({ error: "Beskrivning krävs" });
        });

        it("rejects non-string descriptions", async () => {
            const response = await request(app)
                .post("/api/task/")
                .set(buildAuthHeader(userId))
                .send({ description: 123 })
                .expect(400);

            expect(response.body).toEqual({ error: "Beskrivning krävs" });
        });

        it("rejects blank descriptions", async () => {
            const response = await request(app)
                .post("/api/task/")
                .set(buildAuthHeader(userId))
                .send({ description: "   " })
                .expect(400);

            expect(response.body).toEqual({ error: "Beskrivning krävs" });
        });

        it("creates a new task for the user", async () => {
            const response = await request(app)
                .post("/api/task/")
                .set(buildAuthHeader(userId))
                .send({ description: "  New task  " })
                .expect(201);

            expect(response.body).toMatchObject({
                description: "New task",
                isDone: false,
                userId,
            });
        });

        it("returns 500 when task creation fails", async () => {
            vi.spyOn(Task, "create").mockRejectedValueOnce(
                new Error("Create failed")
            );

            const response = await request(app)
                .post("/api/task/")
                .set(buildAuthHeader(userId))
                .send({ description: "New task" })
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid skapande av uppgift.",
            });
        });
    });

    describe("PUT /api/task/:id", () => {
        it("rejects non-boolean isDone values", async () => {
            const task = await Task.create({
                description: "Task",
                userId,
            });

            const response = await request(app)
                .put(`/api/task/${task._id}`)
                .set(buildAuthHeader(userId))
                .send({ isDone: "yes" })
                .expect(400);

            expect(response.body).toEqual({
                error: "Ogiltigt värde för isDone.",
            });
        });

        it("updates a task when it belongs to the user", async () => {
            const task = await Task.create({
                description: "Task",
                userId,
            });

            const response = await request(app)
                .put(`/api/task/${task._id}`)
                .set(buildAuthHeader(userId))
                .send({ isDone: true })
                .expect(200);

            expect(response.body).toMatchObject({
                _id: task._id.toString(),
                isDone: true,
                userId,
            });
        });

        it("returns 404 when the task does not belong to the user", async () => {
            const task = await Task.create({
                description: "Other task",
                userId: otherUserId,
            });

            const response = await request(app)
                .put(`/api/task/${task._id}`)
                .set(buildAuthHeader(userId))
                .send({ isDone: true })
                .expect(404);

            expect(response.body).toEqual({
                error:
                    "Uppgift hittades inte eller du har inte behörighet.",
            });
        });

        it("returns 500 when task update fails", async () => {
            vi.spyOn(Task, "findOneAndUpdate").mockRejectedValueOnce(
                new Error("Update failed")
            );

            const response = await request(app)
                .put(`/api/task/${new mongoose.Types.ObjectId()}`)
                .set(buildAuthHeader(userId))
                .send({ isDone: true })
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid uppdatering av uppgift.",
            });
        });
    });

    describe("DELETE /api/task/:id", () => {
        it("deletes a task when it belongs to the user", async () => {
            const task = await Task.create({
                description: "Task to delete",
                userId,
            });

            const response = await request(app)
                .delete(`/api/task/${task._id}`)
                .set(buildAuthHeader(userId))
                .expect(200);

            expect(response.body).toEqual({
                message: "Uppgift borttagen",
                taskId: task._id.toString(),
            });
        });

        it("returns 404 when the task does not belong to the user", async () => {
            const task = await Task.create({
                description: "Other task",
                userId: otherUserId,
            });

            const response = await request(app)
                .delete(`/api/task/${task._id}`)
                .set(buildAuthHeader(userId))
                .expect(404);

            expect(response.body).toEqual({
                error:
                    "Uppgift hittades inte eller du har inte behörighet att radera den.",
            });
        });

        it("returns 500 when task deletion fails", async () => {
            vi.spyOn(Task, "findOneAndDelete").mockRejectedValueOnce(
                new Error("Delete failed")
            );

            const response = await request(app)
                .delete(`/api/task/${new mongoose.Types.ObjectId()}`)
                .set(buildAuthHeader(userId))
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid borttagning av uppgift.",
            });
        });
    });

    describe("DELETE /api/delalltasks", () => {
        it("deletes all tasks for the authenticated user", async () => {
            await Task.create([
                { description: "User task 1", userId },
                { description: "User task 2", userId },
                { description: "Other task", userId: otherUserId },
            ]);

            const response = await request(app)
                .delete("/api/delalltasks")
                .set(buildAuthHeader(userId))
                .expect(200);

            expect(response.body).toEqual({
                message: "Alla uppgifter borttagna",
                deletedCount: 2,
            });
        });

        it("returns 500 when deleting all tasks fails", async () => {
            vi.spyOn(Task, "deleteMany").mockRejectedValueOnce(
                new Error("Delete all failed")
            );

            const response = await request(app)
                .delete("/api/delalltasks")
                .set(buildAuthHeader(userId))
                .expect(500);

            expect(response.body).toEqual({
                error: "Serverfel vid borttagning av uppgifter.",
            });
        });
    });
});
