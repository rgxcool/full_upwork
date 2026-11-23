/**
 * Teacher profiles live on the User (`User.teacherProfile`) since #102.
 *
 * Every teacher reference (CourseInstance.responsibleTeacher / assistantTeacher,
 * Student.teacherId, StudentEnrollment.teacherId, Grade.teacherId, …) is a
 * **User id**, so it can be compared with `req.user.userId` directly — no
 * Teacher → User translation any more.
 *
 * This module is the one place that knows the profile shape: filters, the API
 * DTO the frontend reads, colour assignment and display names.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import logger from "./logger.js";

/** Mongo filter matching users that have a teacher profile. */
export const HAS_TEACHER_PROFILE = Object.freeze({ teacherProfile: { $type: "object" } });

/** `{ ...extra, teacherProfile exists }` */
export function teacherUserFilter(extra = {}) {
    return { ...extra, ...HAS_TEACHER_PROFILE };
}

/** Fields the teacher DTO needs; use with `.select()`. */
export const TEACHER_USER_FIELDS =
    "username name email roles teacherProfile onVacation vacationStart vacationEnd vacationNote active";

// Predefined colour list for teacher profiles (calendar / course cards).
export const TEACHER_COLORS = [
    "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6",
    "#bcf60c", "#fabebe", "#008080", "#e6beff", "#9a6324", "#fffac8", "#800000", "#aaffc3",
    "#808000", "#ffd8b1", "#000075", "#808080", "#ffffff", "#000000",
];

/**
 * First colour from TEACHER_COLORS no teacher uses yet; cycles when all are taken.
 */
export async function getNextAvailableColor() {
    try {
        const existing = await User.find(HAS_TEACHER_PROFILE, "teacherProfile.colorCode").lean();
        const used = new Set(existing.map((u) => u.teacherProfile?.colorCode).filter(Boolean));
        const free = TEACHER_COLORS.find((c) => !used.has(c));
        return free || TEACHER_COLORS[existing.length % TEACHER_COLORS.length];
    } catch (err) {
        // A colour is cosmetic: never block creating a teacher over it.
        logger.error({ err }, "Error getting next available color");
        return TEACHER_COLORS[0];
    }
}

/** Strong random password with at least one char from each category. */
export function generateStrongPassword(length = 12) {
    const categories = [
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "abcdefghijklmnopqrstuvwxyz",
        "0123456789",
        "!@#$%^&*()_+-=[]{}|;:,.<>?",
    ];
    const charset = categories.join("");
    const chars = categories.map((c) => c[crypto.randomInt(0, c.length)]);
    while (chars.length < length) chars.push(charset[crypto.randomInt(0, charset.length)]);
    // Fisher–Yates shuffle so the category characters are not always first.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
}

/** Trimmed, non-empty phone numbers (undefined when input is not an array). */
export function cleanPhoneNumbers(phoneNumbers) {
    if (!Array.isArray(phoneNumbers)) return undefined;
    return phoneNumbers
        .filter((p) => typeof p === "string" && p.trim() !== "")
        .map((p) => p.trim());
}

/** Display name for a (populated or lean) teacher User. */
export function teacherDisplayName(user) {
    if (!user || typeof user !== "object") return "";
    return user.username || user.name || user.email || "";
}

/**
 * API shape for a teacher, built from a User with a teacher profile.
 *
 * `_id` is the User id. `userId` repeats the account fields for older frontend
 * code that reads `teacher.userId.username`; since both ids are now the same,
 * code that mixed `_id` and `userId._id` is correct either way.
 */
export function toTeacherDTO(user) {
    if (!user) return null;
    const u = typeof user.toObject === "function" ? user.toObject({ virtuals: false }) : user;
    const profile = u.teacherProfile || {};
    const account = {
        _id: u._id,
        username: u.username,
        name: u.name,
        email: u.email,
        roles: u.roles,
        onVacation: u.onVacation,
        vacationStart: u.vacationStart,
        vacationEnd: u.vacationEnd,
        vacationNote: u.vacationNote,
    };
    return {
        ...account,
        subject: profile.subject ?? "Övrigt",
        colorCode: profile.colorCode ?? null,
        phoneNumbers: profile.phoneNumbers ?? [],
        createdAt: profile.createdAt ?? u.createdAt,
        userId: account,
    };
}

/**
 * The User with a teacher profile for `id`, or null (also for invalid ids).
 * @param {string|ObjectId} id - User id
 * @param {{ select?: string, lean?: boolean }} [opts]
 */
export async function findTeacherUser(id, { select = TEACHER_USER_FIELDS, lean = false } = {}) {
    if (!id || !mongoose.isValidObjectId(String(id._id ?? id))) return null;
    const query = User.findOne(teacherUserFilter({ _id: id._id ?? id })).select(select);
    return lean ? query.lean() : query;
}

/** All users with a teacher profile, newest profile first. */
export async function listTeacherUsers(extraFilter = {}, { select = TEACHER_USER_FIELDS } = {}) {
    return User.find(teacherUserFilter(extraFilter))
        .select(select)
        .sort({ "teacherProfile.createdAt": -1 })
        .lean();
}

/**
 * Fields to `.populate()` on a teacher reference (responsibleTeacher,
 * teacherId, …). The populated value is the User; read its name with
 * teacherDisplayName() (backend) or teacherDisplayName in the frontend.
 */
export const TEACHER_POPULATE_FIELDS =
    "username name email teacherProfile.subject teacherProfile.colorCode";

/** Calendar/course colour of a (populated or lean) teacher User. */
export function teacherColor(user, fallback = null) {
    if (!user || typeof user !== "object") return fallback;
    return user.teacherProfile?.colorCode || fallback;
}
