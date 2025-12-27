import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["backend/tests/**/*.test.js"],
        exclude: ["frontend/**", "node_modules/**", "dist/**"],
    },
});
