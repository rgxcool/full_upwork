import { webcrypto } from "node:crypto";
import { defineConfig } from "vitest/config";

if (
    !globalThis.crypto ||
    typeof globalThis.crypto.getRandomValues !== "function"
) {
    globalThis.crypto = webcrypto;
}

if (!process.env.MONGOMS_VERSION) {
    process.env.MONGOMS_VERSION = "7.0.12";
}

if (!process.env.MONGOMS_DISTRO) {
    process.env.MONGOMS_DISTRO = "ubuntu-20.04";
}

export default defineConfig({
    test: {
        include: ["backend/tests/**/*.test.js"],
        exclude: ["frontend/**", "node_modules/**", "dist/**"],
        maxWorkers: 8,
        silent: true,
    },
});
