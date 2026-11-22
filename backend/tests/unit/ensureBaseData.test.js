import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../../src/models/User.js";
import Program from "../../src/models/Program.js";
import Faq from "../../src/models/Faq.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import { BASE_ACCOUNTS, ensureBaseAccounts, isEmpty } from "../../scripts/ensureBaseData.js";

describe("scripts/ensureBaseData", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    afterEach(async () => {
        await User.deleteMany({});
        await Program.deleteMany({});
        await Faq.deleteMany({});
    });

    it("creates admin, systemadmin, syv and specped accounts on an empty database", async () => {
        const results = await ensureBaseAccounts();

        expect(results.map((r) => r.status)).toEqual(["created", "created", "created", "created"]);
        for (const account of BASE_ACCOUNTS) {
            const user = await User.findOne({ email: account.email });
            expect(user.roles).toEqual([account.role]);
            expect(await bcrypt.compare(account.password, user.password)).toBe(true);
        }
        expect(await User.countDocuments({ roles: { $in: ["teacher", "student"] } })).toBe(0);
    });

    it("leaves roles that already have an account untouched, and is safe to re-run", async () => {
        const realAdmin = await User.create({
            name: "Test Befintlig",
            email: "befintlig@example.se",
            password: "unchanged-hash",
            roles: ["admin"],
        });
        // Legacy shape: only the old `role` string.
        await mongoose.connection.db.collection("users").insertOne({ email: "legacy@example.se", role: "syv" });

        const first = await ensureBaseAccounts();
        const second = await ensureBaseAccounts();

        const status = Object.fromEntries(first.map((r) => [r.role, r.status]));
        expect(status).toEqual({ systemadmin: "created", admin: "exists", syv: "exists", specped: "created" });
        expect(second.every((r) => r.status === "exists")).toBe(true);
        expect(await User.countDocuments({})).toBe(4);
        expect((await User.findById(realAdmin._id)).password).toBe("unchanged-hash");
    });

    it("writes nothing in dry-run mode", async () => {
        const results = await ensureBaseAccounts({ dryRun: true });
        expect(results.every((r) => r.status === "would-create")).toBe(true);
        expect(await User.countDocuments({})).toBe(0);
    });

    it("reports whether the catalog and FAQ are empty", async () => {
        const db = mongoose.connection.db;
        expect(await isEmpty(db, "catalog")).toBe(true);
        expect(await isEmpty(db, "faq")).toBe(true);

        await Program.create({ programName: "Testprogram" });
        expect(await isEmpty(db, "catalog")).toBe(false);
        expect(await isEmpty(db, "faq")).toBe(true);

        await expect(isEmpty(db, "students")).rejects.toThrow(/Unknown set/);
    });
});
