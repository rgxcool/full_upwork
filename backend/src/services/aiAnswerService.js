import logger from "../utils/logger.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.CHATBOT_OPENAI_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 15000;

/**
 * Whether a real AI provider is configured. The heuristic/knowledge-base
 * answer is only used when no provider is available or the call fails.
 */
export function isAiEnabled() {
    const key = process.env.OPENAI_API_KEY;
    return typeof key === "string" && key.trim().length > 0;
}

/**
 * Name of the effective provider used for the chatbot status endpoint.
 */
export function providerName() {
    return isAiEnabled() ? "openai" : "knowledge-base-only";
}

/**
 * Generate an answer from the retrieved course sources using the OpenAI
 * Chat Completions API. Returns null when no API key is configured or the
 * call fails, so the caller can fall back to the built-in heuristic answer.
 * Uses global fetch (Node 20+) and never blocks on a slow upstream (timeout).
 *
 * @param {string} question - The student's question
 * @param {Array<{content: string, source: string}>} sources - Retrieved sources
 * @returns {Promise<string|null>} The generated answer, or null on fallback
 */
export async function generateAiAnswer(question, sources) {
    if (!isAiEnabled()) return null;

    const context = (sources || [])
        .map((s, i) => `${i + 1}. ${s.content}`)
        .join("\n\n");

    const system =
        "Du är en hjälpsam chatbot för en gymnasieskola. Svara på svenska, " +
        "kortfattat och sakligt, enbart utifrån informationen i kontexten. " +
        "Om kontexten inte besvarar frågan, säg att eleven bör kontakta sin " +
        "lärare. Du får inte hitta på fakta utöver kontexten.";

    const user = `Fråga: ${question}\n\nKontext:\n${context}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
            },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                temperature: 0.2,
                max_tokens: 600,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            logger.warn(
                { status: response.status, body: body.slice(0, 300) },
                "OpenAI API returned an error"
            );
            return null;
        }

        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content?.trim();
        return content || null;
    } catch (error) {
        logger.warn({ err: error }, "OpenAI API call failed, using fallback answer");
        return null;
    } finally {
        clearTimeout(timer);
    }
}