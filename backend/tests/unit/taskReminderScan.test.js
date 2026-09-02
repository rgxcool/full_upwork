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
import mongoose from "mongoose";
import Task from "../../src/models/Task.js";
import Notification from "../../src/models/Notification.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";
import {
    syncTaskReminderForUser,
    runTaskReminderScan,
    remainingLabel,
} from "../../src/services/taskReminderScan.js";

describe("Task reminder scan", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Task.deleteMany({});
        await Notification.deleteMany({ type: "task_reminder" });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Task.deleteMany({});
        await Notification.deleteMany({ type: "task_reminder" });
    });

    it("remainingLabel formats future and overdue times", () => {
        const now = new Date(2026, 8, 1, 10, 0, 0);
        expect(remainingLabel("2026-09-01", "14:30", now)).toBe("Om 4 h 30 min");
        expect(remainingLabel("2026-09-03", "10:00", now)).toBe("Om 2 d 0 h");
        expect(remainingLabel("2026-08-30", "10:00", now)).toContain("Försenad");
        expect(remainingLabel(null, null, now)).toBe("");
    });

    it("creates a task_reminder notification for undone scheduled tasks", async () => {
        await Task.create({
            description: "Inlämning",
            dueDate: "2026-09-05",
            dueTime: "09:00",
            isDone: false,
            userId: "user-123",
        });

        const doc = await syncTaskReminderForUser("user-123");

        expect(doc).not.toBeNull();
        expect(doc.type).toBe("task_reminder");
        expect(doc.meta.userId).toBe("user-123");
        expect(doc.meta.taskCount).toBe(1);
        expect(doc.meta.tasks[0]).toMatchObject({
            description: "Inlämning",
            dueDate: "2026-09-05",
            dueTime: "09:00",
        });
        expect(doc.message).toContain("Inlämning");
    });

    it("ignores done tasks and clears reminder when none remain", async () => {
        await Task.create({
            description: "Klar",
            dueDate: "2026-09-05",
            isDone: true,
            userId: "user-123",
        });

        let doc = await syncTaskReminderForUser("user-123");
        expect(doc).toBeNull();

        await Task.create({
            description: "Pågående",
            dueDate: "2026-09-05",
            isDone: false,
            userId: "user-123",
        });
        doc = await syncTaskReminderForUser("user-123");
        expect(doc).not.toBeNull();

        await Task.updateOne({ description: "Pågående" }, { isDone: true });
        doc = await syncTaskReminderForUser("user-123");
        expect(doc).toBeNull();
    });

    it("keeps only the next task first and limits detail list to five", async () => {
        for (let i = 1; i <= 7; i++) {
            await Task.create({
                description: `Uppgift ${i}`,
                dueDate: `2026-09-${String(i + 1).padStart(2, "0")}`,
                isDone: false,
                userId: "user-123",
            });
        }

        const doc = await syncTaskReminderForUser("user-123");

        expect(doc.meta.taskCount).toBe(7);
        expect(doc.meta.tasks.length).toBe(5);
        expect(doc.meta.tasks[0].description).toBe("Uppgift 1");
    });

    it("runTaskReminderScan syncs all users and cleans stale reminders", async () => {
        await Task.create({
            description: "A",
            dueDate: "2026-09-10",
            isDone: false,
            userId: "user-aaa",
        });
        await Task.create({
            description: "B",
            dueDate: "2026-09-11",
            isDone: false,
            userId: "user-bbb",
        });
        // stale reminder with no pending scheduled task
        await Notification.create({
            type: "task_reminder",
            message: "stale",
            "meta.userId": "user-ccc",
            meta: { userId: "user-ccc" },
        });

        await runTaskReminderScan();

        const a = await Notification.findOne({ "meta.userId": "user-aaa" });
        const b = await Notification.findOne({ "meta.userId": "user-bbb" });
        const c = await Notification.findOne({ "meta.userId": "user-ccc" });

        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        expect(c).toBeNull();
    });

    it("survives db errors gracefully", async () => {
        vi.spyOn(Task, "find").mockRejectedValueOnce(new Error("boom"));
        const doc = await syncTaskReminderForUser("user-123");
        expect(doc).toBeNull();
    });
});
