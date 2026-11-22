/**
 * Error-monitoring facade. DEVELOPMENT ONLY.
 *
 * Application code calls these functions; by default they do nothing. The real
 * Sentry SDK is plugged in only by backend/instrument.js, which is loaded with
 * `node --import ./instrument.js` from the `dev` script and the Docker `dev`
 * stage — never from pm2 / production. This module must therefore NOT import
 * @sentry/node: in production that package is never loaded, and it is a
 * devDependency.
 */

let impl = null;

/**
 * Sentry may only run when explicitly configured, outside production and tests.
 * Exported for tests and for instrument.js.
 */
export function shouldEnableMonitoring(env = process.env) {
    if (!env.SENTRY_DSN) return false;
    if (env.NODE_ENV === "production" || env.NODE_ENV === "test") return false;
    return true;
}

/** Called once by instrument.js after Sentry.init(). */
export function registerMonitoring(sentry) {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Error monitoring must not be registered in production");
    }
    impl = sentry;
}

export const isMonitoringEnabled = () => impl !== null;

export function captureException(err, context) {
    if (!impl) return;
    try {
        impl.captureException(err, context);
    } catch {
        // monitoring must never break the app
    }
}

export function captureMessage(message, level = "error") {
    if (!impl) return;
    try {
        impl.captureMessage(message, level);
    } catch {
        // ignore
    }
}

/** Report a 5xx with only an opaque user id + role attached. */
export function captureRequestError(err, req) {
    if (!impl) return;
    try {
        impl.withScope((scope) => {
            if (req?.user) {
                const roles = req.user.roles || (req.user.role ? [req.user.role] : []);
                scope.setUser({
                    id: String(req.user.userId ?? req.user._id ?? ""),
                    segment: roles.join(","),
                });
            }
            scope.setTag("route", req?.route?.path ?? req?.baseUrl ?? "unknown");
            scope.setTag("method", req?.method ?? "unknown");
            impl.captureException(err);
        });
    } catch {
        // ignore
    }
}

/**
 * Run a scheduled job. With SENTRY_CRONS=true (dev, opt-in) it is wrapped in a
 * Sentry cron monitor; otherwise it just runs. Errors are reported and then
 * re-thrown to the caller, which keeps its own try/catch behaviour.
 */
export async function withJobMonitor(slug, fn, monitorConfig) {
    if (!impl) return fn();
    const run = async () => {
        try {
            return await fn();
        } catch (err) {
            impl.captureException(err, { tags: { job: slug } });
            throw err;
        }
    };
    if (process.env.SENTRY_CRONS === "true" && monitorConfig) {
        return impl.withMonitor(slug, run, monitorConfig);
    }
    return run();
}

export async function flushMonitoring(timeoutMs = 2000) {
    if (!impl) return;
    try {
        await impl.flush(timeoutMs);
    } catch {
        // ignore
    }
}
