import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAiEnabled, providerName, generateAiAnswer } from "../../src/services/aiAnswerService.js";

describe("aiAnswerService", () => {
    beforeEach(() => {
        delete process.env.OPENAI_API_KEY;
        vi.restoreAllMocks();
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
        global.fetch = undefined;
    });

    describe("isAiEnabled", () => {
        it("returns false when no API key is configured", () => {
            expect(isAiEnabled()).toBe(false);
        });

        it("returns false when the API key is blank", () => {
            process.env.OPENAI_API_KEY = "   ";
            expect(isAiEnabled()).toBe(false);
        });

        it("returns true when a real API key is configured", () => {
            process.env.OPENAI_API_KEY = "sk-live-key";
            expect(isAiEnabled()).toBe(true);
        });
    });

    describe("providerName", () => {
        it("reports openai when enabled", () => {
            process.env.OPENAI_API_KEY = "sk-live-key";
            expect(providerName()).toBe("openai");
        });

        it("reports knowledge-base-only when disabled", () => {
            expect(providerName()).toBe("knowledge-base-only");
        });
    });

    describe("generateAiAnswer", () => {
        it("returns null when AI is not configured", async () => {
            expect(await generateAiAnswer("hej", [])).toBeNull();
        });

        it("returns the trimmed content from a successful response", async () => {
            process.env.OPENAI_API_KEY = "sk-live-key";
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: "  Svar på svenska.  " } }],
                }),
            });

            const answer = await generateAiAnswer("När börjar kursen?", [
                { content: "Kursen börjar vecka 35.", source: "Vanliga frågor" },
            ]);

            expect(answer).toBe("Svar på svenska.");
            expect(global.fetch).toHaveBeenCalledTimes(1);

            const [url, options] = global.fetch.mock.calls[0];
            expect(String(url)).toContain("api.openai.com");
            expect(options.headers.Authorization).toBe("Bearer sk-live-key");
            expect(options.body).toContain("Kursen börjar vecka 35.");
            expect(options.body).toContain("När börjar kursen?");
        });

        it("returns null when the provider responds with an error", async () => {
            process.env.OPENAI_API_KEY = "sk-live-key";
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 429,
                text: async () => "rate limited",
            });

            expect(await generateAiAnswer("hej?", [])).toBeNull();
        });

        it("returns null when the payload has no usable message content", async () => {
            process.env.OPENAI_API_KEY = "sk-live-key";
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ choices: [] }),
            });

            expect(await generateAiAnswer("hej?", [])).toBeNull();
        });

        it("returns null when the network call fails", async () => {
            process.env.OPENAI_API_KEY = "sk-live-key";
            global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

            expect(await generateAiAnswer("hej?", [])).toBeNull();
        });
    });
});