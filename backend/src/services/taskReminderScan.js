/**
 * Task reminder notifications (Att göra-påminnelser).
 *
 * For every user with at least one undone task that has a due date, a
 * `task_reminder` Notification is kept in sync: the message summarises how
 * many remaining tasks the user has and which one is due next (with its
 * remaining time), and `meta.tasks` carries the individual task details so the
 * frontend can render the full list with live countdowns.
 *
 * Notifications are scoped to one user via `meta.userId`; the GET
 * /notifications handler filters them in JS so they never leak across roles.
 */
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import Teacher from "../models/Teacher.js";
import mongoose from "mongoose";
import logger from "../utils/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

export function remainingLabel(dueDate, dueTime, now = new Date()) {
    if (!dueDate) return "";
    const due = new Date(`${dueDate}T${dueTime || "23:59"}:00`);
    if (Number.isNaN(due.getTime())) return "";

    const diffMs = due.getTime() - now.getTime();
    const overdue = diffMs < 0;
    const abs = Math.abs(diffMs);
    const days = Math.floor(abs / DAY_MS);
    const hours = Math.floor((abs % DAY_MS) / HOUR_MS);
    const mins = Math.floor((abs % HOUR_MS) / MIN_MS);

    const prefix = overdue ? "Försenad" : "Om";
    if (days > 0) return `${prefix} ${days} d ${hours} h`;
    if (hours > 0) return `${prefix} ${hours} h ${mins} min`;
    return `${prefix} ${Math.max(mins, 1)} min`;
}

const dueTimestamp = (task) => {
    const due = new Date(`${task.dueDate}T${task.dueTime || "23:59"}:00`);
    return Number.isNaN(due.getTime()) ? 0 : due.getTime();
};

const deleteReminderForUser = async (userId) => {
    try {
        await Notification.deleteMany({ type: "task_reminder", "meta.userId": String(userId) });
    } catch (err) {
        logger.error({ err, userId: String(userId) }, "Error deleting task reminder notification");
    }
};

/**
 * Recompute the `task_reminder` notification for a single user.
 * Creates/updates it when the user has undone scheduled tasks, or removes it
 * when there are none left. Never touches `resolvedByUsers`, so per-user
 * resolution survives refreshes.
 */
export async function syncTaskReminderForUser(userId) {
    const userIdStr = String(userId);

    try {
        const pending = await Task.find({
            userId: userIdStr,
            isDone: false,
            dueDate: { $ne: null },
        }).lean();

        if (pending.length === 0) {
            await deleteReminderForUser(userIdStr);
            return null;
        }

        const sorted = pending
            .map((t) => ({
                description: t.description,
                dueDate: t.dueDate,
                dueTime: t.dueTime,
                due: dueTimestamp(t),
            }))
            .sort((a, b) => a.due - b.due);

        const next = sorted[0];
        const remaining = remainingLabel(next.dueDate, next.dueTime);
        const count = pending.length;
        const message = `Att göra: ${count} uppgift${count === 1 ? "" : "er"} kvar — nästa: ${next.description} (${remaining})`;

        const tasks = sorted.slice(0, 5).map(({ description, dueDate, dueTime }) => ({
            description,
            dueDate,
            dueTime,
        }));

        const filter = { type: "task_reminder", "meta.userId": userIdStr };
        const update = {
            $set: {
                type: "task_reminder",
                message,
                "meta.userId": userIdStr,
                "meta.taskCount": count,
                "meta.tasks": tasks,
            },
        };

        let doc = await Notification.findOneAndUpdate(filter, update, {
            new: true,
            upsert: true,
        });

        // Let students see it via the student query and teachers via query.teacher.
        const targetUser = mongoose.Types.ObjectId.isValid(userIdStr)
            ? await Teacher.findOne({ userId: userIdStr }).lean()
            : null;
        const extra = {};
        if (mongoose.Types.ObjectId.isValid(userIdStr)) {
            extra["meta.studentUserId"] = userIdStr;
        }
        if (targetUser) extra.teacher = targetUser._id;

        // If meta.studentUserId / teacher changed, keep the doc in sync.
        if (
            (userIdStr && String(doc.meta?.studentUserId || "") !== userIdStr) ||
            (targetUser && String(doc.teacher || "") !== String(targetUser._id))
        ) {
            const again = await Notification.findOneAndUpdate(
                { _id: doc._id },
                {
                    $set: {
                        ...extra,
                        teacher: targetUser ? targetUser._id : null,
                    },
                },
                { new: true }
            );
            doc = again || doc;
        }

        return doc;
    } catch (err) {
        logger.error({ err, userId: userIdStr }, "Error syncing task reminder notification");
        return null;
    }
}

/**
 * Periodic scan: refresh task reminders for every user with undone scheduled
 * tasks and clean up stale reminders for users who finished everything.
 */
export async function runTaskReminderScan() {
    const userIds = await Task.distinct("userId", {
        isDone: false,
        dueDate: { $ne: null },
    });

    for (const id of userIds) {
        await syncTaskReminderForUser(id);
    }

    const reminderUsers = await Notification.distinct("meta.userId", {
        type: "task_reminder",
    });
    const activeSet = new Set(userIds.map(String));
    for (const id of reminderUsers) {
        if (!activeSet.has(String(id))) {
            await deleteReminderForUser(id);
        }
    }
}