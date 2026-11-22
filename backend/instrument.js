/**
 * Sentry for LOCAL DEVELOPMENT ONLY. Never used in production.
 *
 * Loaded before the app by the `dev` script (`pnpm --filter backend dev`) and the
 * Docker `dev` stage (`make dev`):  node --import ./instrument.js index.js
 * pm2 / ecosystem.config.cjs and the Docker `production` stage do NOT load it.
 *
 * Even if loaded, it does nothing unless SENTRY_DSN is set AND NODE_ENV is not
 * production/test — @sentry/node is not even imported in that case.
 * Org mindful-9h (EU region) · project mindful-backend · environment "development".
 */
import path from "node:path";
import dotenv from "dotenv";
import { shouldEnableMonitoring, registerMonitoring } from "./src/utils/monitoring.js";
import { scrubEvent, scrubBreadcrumb } from "./src/utils/sentryScrub.js";

// index.js loads its env file after imports run, so load it here too (same rules).
const envFile =
    process.env.NODE_ENV === "production"
        ? ".env.production"
        : process.env.NODE_ENV === "test"
          ? ".env.test"
          : ".env.development";
dotenv.config({ path: path.resolve(process.cwd(), envFile), quiet: true });

if (shouldEnableMonitoring(process.env)) {
    const Sentry = await import("@sentry/node");

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT || "development",
        tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "1.0"),

        // Even the local DB may hold copies of real student data: send as little as possible.
        sendDefaultPii: false,
        dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
            stackFrameVariables: false,
        },

        integrations: [
            // 5xx are captured in globalErrorHandler and via logger.error (monitoring.js),
            // so the automatic Express capture is off to avoid duplicates.
            Sentry.expressIntegration({ shouldHandleError: () => false }),
        ],

        beforeSend: (event) => scrubEvent(event),
        beforeSendTransaction: (event) => scrubEvent(event),
        beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
        ignoreTransactions: [/\/health\//],
    });

    registerMonitoring(Sentry);
    // eslint-disable-next-line no-console
    console.info("[sentry] development error monitoring enabled (mindful-backend)");
}
