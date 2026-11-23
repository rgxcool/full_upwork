import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { assertDevEnvironment } from "../../scripts/lib/dbReset.js";

const originalEnv = process.env.NODE_ENV;
let dir;

afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("assertDevEnvironment (dev-only scripts with fixed passwords)", () => {
    it("refuses NODE_ENV=production even when a dev env file exists", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "devenv-"));
        fs.writeFileSync(path.join(dir, ".env.development"), "");
        process.env.NODE_ENV = "production";
        expect(() => assertDevEnvironment(dir)).toThrow(/NODE_ENV=production/);
    });

    it("refuses a machine without .env.development (the production host)", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "devenv-"));
        process.env.NODE_ENV = "development";
        expect(() => assertDevEnvironment(dir)).toThrow(/not found/);
    });

    it("returns the dev env file on a development machine", () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "devenv-"));
        fs.writeFileSync(path.join(dir, ".env.development"), "");
        process.env.NODE_ENV = "development";
        expect(assertDevEnvironment(dir)).toBe(path.join(dir, ".env.development"));
    });
});
