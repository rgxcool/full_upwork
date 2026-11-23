import User from "../models/User.js";
import bcrypt from "bcrypt";
import logger from "./logger.js";
import {
    generateStrongPassword,
    getNextAvailableColor,
    teacherUserFilter,
} from "./teacherProfile.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Create or find teacher by name
 * @param {string} teacherName - The teacher's name
 * @param {string} createdByUserId - ID of the user who created this teacher
 * @param {string} subject - The subject for the teacher (optional)
 * @returns {Object} - { teacher, wasCreated, password }
 */
const inFlightTeacherLookups = new Map();

/**
 * Create or find a teacher, deduplicating concurrent lookups by name.
 *
 * Bulk student imports resolve many rows in parallel and often contain
 * several students for the same teacher. Without deduplication those rows
 * race between the lookup and insert and hit the unique user email index.
 */
export function createOrFindTeacher(
    teacherName,
    createdByUserId = null,
    subject = "Övrigt"
) {
    const key = teacherName.trim().toLowerCase();
    if (inFlightTeacherLookups.has(key)) {
        return inFlightTeacherLookups.get(key);
    }

    const pending = findOrCreateTeacher(
        teacherName,
        createdByUserId,
        subject
    ).finally(() => {
        inFlightTeacherLookups.delete(key);
    });

    inFlightTeacherLookups.set(key, pending);
    return pending;
}

async function findOrCreateTeacher(
    teacherName,
    _createdByUserId = null,
    subject = "Övrigt"
) {
    try {
        // Existing teacher (a User with a teacher profile) by username, case-insensitive.
        const name = teacherName.trim();
        const existingTeacher = await User.findOne(
            teacherUserFilter({ username: { $regex: `^${escapeRegex(name)}$`, $options: "i" } })
        );

        if (existingTeacher) {
            return {
                teacher: existingTeacher,
                wasCreated: false,
                password: null,
            };
        }

        // Create the user account with its teacher profile; the User id is the teacher id.
        const username = name;
        const email = `${username
            .toLowerCase()
            .replace(/\s+/g, ".")}@mindful.se`;

        const plainPassword = generateStrongPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        const savedTeacher = await User.create({
            username,
            email,
            password: hashedPassword,
            roles: ["teacher"],
            teacherProfile: {
                colorCode: await getNextAvailableColor(),
                subject: subject || "Övrigt",
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Log the creation
        logger.info({ username, email }, "Auto-created teacher");

        return {
            teacher: savedTeacher,
            wasCreated: true,
            password: plainPassword,
        };
    } catch (error) {
        logger.error({ err: error }, "Error creating or finding teacher");
        throw error;
    }
}
