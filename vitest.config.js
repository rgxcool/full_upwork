import { webcrypto } from "node:crypto";
import { defineConfig } from "vitest/config";

if (
        !globalThis.crypto ||
        typeof globalThis.crypto.getRandomValues !== "function"
) {
        globalThis.crypto = webcrypto;
}
export default defineConfig({
        test: {
                environment: 'node',
                exclude: ["node_modules/**", "dist/**"],
                include: ["backend/tests/**/*.test.js"],
                maxWorkers: 12,
                silent: true,
        },
});
