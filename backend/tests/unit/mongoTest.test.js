import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    connectTestDatabase,
    disconnectTestDatabase,
    getTestMongoUri,
} from "../helpers/mongoTest.js";

describe("mongoTest helpers", () => {
    const defaultUri = "mongodb://127.0.0.1:27017/mindfullearning";
    const originalMongoUri = process.env.MONGO_URI;

    beforeEach(() => {
        process.env.MONGO_URI = defaultUri;
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

    it("builds a uri for the configured Mongo host", () => {
        const uri = getTestMongoUri();
        expect(uri).toMatch(/^mongodb:\/\/127\.0\.0\.1:27017\//);
        expect(uri).toContain("mindful_test_");
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
