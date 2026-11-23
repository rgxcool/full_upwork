/**
 * GET /api/teachers/:id/profile: a teacher can open their OWN staff profile
 * (Filarkiv, Kurser, Elever) but not a colleague's; admins can open any.
 * `:id` is a Teacher id, so ownership goes through Teacher.userId.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";

const authFor = (user) => ({
    Authorization: `Bearer ${jwt.sign({ userId: String(user._id), role: user.roles[0], roles: user.roles }, process.env.JWT_SECRET)}`,
});

const makeUser = (name, roles) =>
    User.create({ name, username: name, email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.se`, password: "x".repeat(20), roles });

describe("GET /api/teachers/:id/profile — who may read a staff profile", () => {
    let ownUser;
    let ownTeacher;
    let colleagueTeacher;
    let admin;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        for (const name of Object.keys(mongoose.connection.collections)) {
            await mongoose.connection.collections[name].deleteMany({});
        }
        ownUser = await makeUser("Test Lärare", ["teacher"]);
        ownTeacher = await Teacher.create({ userId: ownUser._id, subject: "Svenska" });
        const colleagueUser = await makeUser("Test Kollega", ["teacher"]);
        colleagueTeacher = await Teacher.create({ userId: colleagueUser._id, subject: "Engelska" });
        admin = await makeUser("Test Admin", ["admin"]);
    });

    it("lets a teacher open their own profile", async () => {
        const res = await request(app).get(`/api/teachers/${ownTeacher._id}/profile`).set(authFor(ownUser));
        expect(res.status).toBe(200);
    });

    it("does not let a teacher open a colleague's profile", async () => {
        const res = await request(app).get(`/api/teachers/${colleagueTeacher._id}/profile`).set(authFor(ownUser));
        expect(res.status).toBe(403);
    });

    it("does not treat the teacher's User id as their Teacher id", async () => {
        const res = await request(app).get(`/api/teachers/${ownUser._id}/profile`).set(authFor(ownUser));
        expect(res.status).toBe(403);
    });

    it("lets an admin open any profile", async () => {
        const res = await request(app).get(`/api/teachers/${colleagueTeacher._id}/profile`).set(authFor(admin));
        expect(res.status).toBe(200);
    });
});

describe("GET /api/me/teacher — own Teacher id (used by \"Mitt filarkiv\")", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    it("works for a user whose roles include teacher even when the primary role is admin", async () => {
        for (const name of Object.keys(mongoose.connection.collections)) {
            await mongoose.connection.collections[name].deleteMany({});
        }
        const user = await makeUser("Test Adminlärare", ["admin", "teacher"]);
        const teacher = await Teacher.create({ userId: user._id, subject: "Svenska" });

        const res = await request(app).get("/api/me/teacher").set(authFor(user));

        expect(res.status).toBe(200);
        expect(String(res.body._id)).toBe(String(teacher._id));
    });
});
