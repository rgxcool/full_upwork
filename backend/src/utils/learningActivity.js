import Student from "../models/Student.js";
import logger from "../utils/logger.js";

/**
 * Meaningful-learning-activity tracking (Etapp 2, Part 6).
 *
 * The inactivity detection must not rely on login alone when other meaningful
 * learning activity is available. Course-card access and lesson/module views
 * are the two signals that exist today on top of assignment submissions (which
 * are already counted via AssignmentSubmission). Recording them here lets the
 * inactivity scanner/report treat them as fresh activity.
 *
 * A marker-less updateOne is used on purpose: it is cheap, does not fire the
 * document save hooks, and never marks the student as "active" when they
 * merely loaded a page — the timestamp itself is the signal.
 */

/**
 * Record that a student performed meaningful learning activity (viewed their
 * course cards or opened a lesson). Never throws; a failure is logged and the
 * caller continues.
 * @param {string|ObjectId} studentId
 * @returns {Promise<boolean>} true when the timestamp was written.
 */
export const recordStudentLearningActivity = async (studentId) => {
    if (!studentId) return false;
    try {
        const result = await Student.updateOne(
            { _id: studentId },
            { $set: { lastLearningActivityAt: new Date() } }
        );
        return result?.modifiedCount > 0 || result?.matchedCount > 0;
    } catch (error) {
        logger.warn({ err: error, studentId }, "Failed to record learning activity (non-fatal)");
        return false;
    }
};