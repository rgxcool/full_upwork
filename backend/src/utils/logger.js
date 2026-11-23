import pino from "pino";
import { captureException, captureMessage, isMonitoringEnabled } from "./monitoring.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isTest = process.env.NODE_ENV === "test";
const isDev = process.env.NODE_ENV !== "production";

/**
 * Development only: forward error/fatal logs to Sentry (see monitoring.js).
 * Most controllers answer `res.status(500)` themselves after
 * `logger.error({ err }, "...")`, so this is where those errors become visible.
 * In production and tests monitoring is never registered and this is a no-op.
 */
const PINO_ERROR = 50;
function forwardToMonitoring(args, level) {
    if (level < PINO_ERROR || !isMonitoringEnabled()) return;
    const [first, second] = args;
    const obj = first && typeof first === "object" ? first : null;
    const msg = typeof first === "string" ? first : typeof second === "string" ? second : "";
    const err =
        first instanceof Error
            ? first
            : obj?.err instanceof Error
              ? obj.err
              : obj?.error instanceof Error
                ? obj.error
                : null;
    const sentryLevel = level >= 60 ? "fatal" : "error";
    if (err) captureException(err, { level: sentryLevel, extra: { logMessage: msg } });
    else captureMessage(msg || "logger.error without message", sentryLevel);
}

const baseOpts = {
    hooks: {
        logMethod(inputArgs, method, level) {
            forwardToMonitoring(inputArgs, level);
            return method.apply(this, inputArgs);
        },
    },
    level: process.env.LOG_LEVEL || (isTest ? "silent" : "info"),
    service: "mindful-learning-api",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level(label) {
            return { level: label };
        },
    },
};

let logger;

if (isTest) {
    logger = pino({ ...baseOpts, level: "silent" });
} else if (isDev) {
    logger = pino(baseOpts).child({});
    // Use pino-pretty for dev via transport
    const transport = pino.transport({
        targets: [
            {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    ignore: "pid,hostname,service",
                },
                level: baseOpts.level,
            },
        ],
    });
    logger = pino(baseOpts, transport);
} else {
    // Production: write to files (JSON)
    const logDir = path.join(__dirname, "../../logs");
    const transport = pino.transport({
        targets: [
            {
                target: "pino/file",
                options: { destination: path.join(logDir, "error.log"), mkdir: true },
                level: "error",
            },
            {
                target: "pino/file",
                options: { destination: path.join(logDir, "combined.log"), mkdir: true },
                level: baseOpts.level,
            },
        ],
    });
    logger = pino(baseOpts, transport);
}

export default logger;
