// #102: a teacher is a User with `teacherProfile`; its User id is the teacher id
// stored in CourseInstance.responsibleTeacher, Student.teacherId, …
import mongoose from "mongoose";
import User from "../../src/models/User.js";

const fakeEmail = (name) =>
    `${String(name || "test.larare").toLowerCase().replace(/[^a-z0-9]+/g, ".")}.${new mongoose.Types.ObjectId()}@example.se`;

/**
 * Give a user (document or id) a teacher profile; returns the hydrated User.
 * When no user has that id yet, a fake teacher account is created with it
 * (the old tests made a Teacher for a random userId). Extra fields such as
 * `name` / `email` are used only for that new account.
 */
export async function giveTeacherProfile(
    user,
    { subject = "Övrigt", colorCode = "#3cb44b", phoneNumbers = [], ...userFields } = {}
) {
    const id = user?._id ?? user ?? new mongoose.Types.ObjectId();
    const name = userFields.name || userFields.username || "Test Lärare";
    return User.findByIdAndUpdate(
        id,
        {
            $set: { teacherProfile: { subject, colorCode, phoneNumbers, createdAt: new Date() } },
            $setOnInsert: {
                username: userFields.username || name,
                name,
                email: userFields.email || fakeEmail(name),
                password: "x",
                roles: userFields.roles || ["teacher"],
            },
        },
        { returnDocument: "after", upsert: true }
    );
}

/** Create a teacher User (fake data) with a teacher profile. */
export async function createTeacherUser({ subject, colorCode, phoneNumbers, ...userFields } = {}) {
    return giveTeacherProfile(new mongoose.Types.ObjectId(), { subject, colorCode, phoneNumbers, ...userFields });
}
