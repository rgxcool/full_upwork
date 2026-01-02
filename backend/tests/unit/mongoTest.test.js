import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import {
    getTestMongoUri,
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

describe("mongoTest helpers", () => {
    const originalMongoUri = process.env.MONGO_URI;

    beforeEach(() => {
        delete process.env.MONGO_URI;
    });

    afterEach(() => {
        if (typeof originalMongoUri === "undefined") {
            delete process.env.MONGO_URI;
        } else {
            process.env.MONGO_URI = originalMongoUri;
        }
        vi.restoreAllMocks();
        mongoose.connection.readyState = 0;
    });

    it("builds a uri for the default Mongo host", () => {
        const uri = getTestMongoUri();
        expect(uri).toMatch(/^mongodb:\/\/127\.0\.0\.1:27017\//);
        expect(uri).toContain("mindful_test_");
    });

    it("respects a custom MONGO_URI base when provided", () => {
        process.env.MONGO_URI = "mongodb://custom-host:12345/mybase";
        const uri = getTestMongoUri();
        expect(uri).toMatch(/^mongodb:\/\/custom-host:12345\//);
        expect(uri.split("/").pop()).toMatch(/^mindful_test_/);
    });

    it("connectTestDatabase calls mongoose.connect and returns the uri", async () => {
        const connectSpy = vi
            .spyOn(mongoose, "connect")
            .mockResolvedValueOnce();

        const uri = await connectTestDatabase();

        expect(connectSpy).toHaveBeenCalledOnce();
        expect(uri).toBe(connectSpy.mock.calls[0][0]);
        expect(uri).toContain("mindful_test_");
    });

    it("disconnectTestDatabase drops and disconnects when connected", async () => {
        mongoose.connection.readyState = 1;
        const dropSpy = vi
            .spyOn(mongoose.connection, "dropDatabase")
            .mockResolvedValueOnce();
        const disconnectSpy = vi
            .spyOn(mongoose, "disconnect")
            .mockResolvedValueOnce();

        await disconnectTestDatabase();

        expect(dropSpy).toHaveBeenCalledOnce();
        expect(disconnectSpy).toHaveBeenCalledOnce();
    });

    it("disconnectTestDatabase no-ops when already disconnected", async () => {
        mongoose.connection.readyState = 0;
        const dropSpy = vi.spyOn(mongoose.connection, "dropDatabase");
        const disconnectSpy = vi.spyOn(mongoose, "disconnect");

        await disconnectTestDatabase();

        expect(dropSpy).not.toHaveBeenCalled();
        expect(disconnectSpy).not.toHaveBeenCalled();
    });
});
