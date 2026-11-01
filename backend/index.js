import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "node:fs";
import { authenticateUser } from "./src/controllers/authController.js";
import { canAccessDocument } from "./src/utils/documentAuthorization.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
let envFile = ".env.development";
if (process.env.NODE_ENV === "production") {
    envFile = ".env.production";
} else if (process.env.NODE_ENV === "test") {
    envFile = ".env.test";
}
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import logger from "./src/utils/logger.js";

logger.info({ env: process.env.NODE_ENV }, "Running in environment mode");
logger.info({ envFile }, "Loaded environment file");

// --- Environment validation (non-test only) ---
if (process.env.NODE_ENV !== "test") {
    const required = ["MONGODB_URI", "JWT_SECRET"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
        logger.fatal(
            { missing },
            "Required environment variables are not set. " +
                "Copy .env.example to .env.development and fill in values."
        );
        process.exit(1);
    }

    const weakSecrets = ["test-secret", "jwt_mindful", "secret", "changeme", "password", "default"];
    if (process.env.JWT_SECRET.length < 32) {
        logger.fatal(
            "JWT_SECRET must be at least 32 characters long."
        );
        process.exit(1);
    }
    if (weakSecrets.includes(process.env.JWT_SECRET)) {
        logger.fatal(
            `JWT_SECRET is a known weak value ("${process.env.JWT_SECRET}"). Replace it with a strong random secret.`
        );
        process.exit(1);
    }
}
logger.info({ loaded: !!process.env.JWT_SECRET }, "JWT secret status");

import express from "express";
const app = express();

// Import security and performance utilities
import {
    securityHeaders,
    corsConfig,
    requestLogger,
    securityAudit,
    mongoSanitize,
    rateLimiter,
    apiRateLimiter,
    requestTimeout,
} from "./src/middleware/security.js";

import {
    globalErrorHandler,
    performanceMonitor,
    errorMonitor,
} from "./src/utils/errorHandler.js";

import { cacheManager, dbOptimizer, requestOptimizer } from "./src/utils/performance.js";
import { startInactivityScheduler, stopInactivityScheduler, startTaskReminderScheduler, stopTaskReminderScheduler } from "./src/services/scheduler.js";

// Apply security headers
app.use(securityHeaders);

// Apply request timeout (30 seconds)
app.use(requestTimeout(30));

// Apply CORS with enhanced configuration.
// Infrastructure probes (health/metrics) are GET-only, never read auth
// cookies and are called by orchestrators that do not send an Origin header.
// They must bypass the strict production no-Origin rule, otherwise container
// and load-balancer health checks fail with 403.
//
// Safe methods must bypass it as well: browsers never attach an Origin header
// to same-origin GET/HEAD requests, so enforcing the no-Origin rule on reads
// blocks every request the SPA makes and takes the whole app down. CSRF
// protection only needs to cover state-changing methods, which browsers do
// send an Origin for (and which stay blocked when the header is absent).
import cors from "cors";
const isCorsExemptPath = (path) =>
    path === "/health" || path.startsWith("/health/") || path === "/metrics";
const isReadOnlyMethod = (method) =>
    method === "GET" || method === "HEAD" || method === "OPTIONS";
const corsOptionsDelegate = (req, callback) => {
    if (!req.headers.origin && (isCorsExemptPath(req.path) || isReadOnlyMethod(req.method))) {
        return callback(null, { ...corsConfig, origin: true });
    }
    return callback(null, corsConfig);
};
app.use(cors(corsOptionsDelegate));

// Cookie parsing must run BEFORE the rate limiters: their skip logic
// (admin/systemadmin exemption) inspects req.cookies[token] via isAdminUser.
// Mounted here, the admin-skip works; mounted later it silently never fires
// and admins are rate limited like everyone else.
app.use(cookieParser());

// Rate limiting
if (process.env.NODE_ENV !== "test") {
    app.use(rateLimiter);
    app.use("/api/", apiRateLimiter);
} else {
    // In tests, only rate limit the students endpoint to validate rate limiting behavior
    app.use("/api/students", apiRateLimiter);
}

// Apply performance monitoring
app.use(performanceMonitor);

// Apply request logging
app.use(requestLogger);

// Apply security audit
app.use(securityAudit);

import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import router from "./src/router/router.js";

const PORT = process.env.PORT || 5010;

const serveUpload = async (req, res, next) => {
    try {
        const filename = req.params.filename;
        const uploadsRoot = path.resolve(__dirname, "public/uploads");
        const filePath = path.resolve(uploadsRoot, filename || "");

        if (
            typeof filename !== "string" ||
            filename.length === 0 ||
            path.basename(filename) !== filename ||
            path.dirname(filePath) !== uploadsRoot
        ) {
            return res.status(404).json({ error: "File not found" });
        }

        const Document = mongoose.model("Document");
        const document = await Document.findOne({ filename });
        if (!document) {
            return res.status(404).json({ error: "File not found" });
        }

        const allowed = await canAccessDocument(req.user, document);
        if (!allowed) {
            return res.status(403).json({ error: "Forbidden" });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "File not found" });
        }

        if (typeof res.sendFile === "function") {
            return res.sendFile(filePath, (error) => {
                if (error && !res.headersSent) {
                    next(error);
                }
            });
        }

        return res.end(fs.readFileSync(filePath));
    } catch (error) {
        return next(error);
    }
};

// Middleware setup
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || "10mb" }));
app.use(
    express.urlencoded({
        extended: true,
        limit: process.env.MAX_FILE_SIZE || "10mb",
    })
);

// Strip Mongo operator keys ($gt, $where, etc.) from body/query/params to
// prevent NoSQL injection
app.use(mongoSanitize);

// Apply query optimization
app.use(requestOptimizer.optimizeQuery);

// Enhanced request logging
app.use((req, res, next) => {
    logger.debug({ method: req.method, url: req.url }, "Incoming request");
    next();
});

// --- Health check endpoints (before router) ---

// Liveness: is the process alive?
app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

// Readiness: can the process serve traffic? (DB must be connected)
app.get("/health/ready", (_req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    if (dbReady) {
        res.status(200).json({
            status: "ok",
            database: "connected",
            uptime: process.uptime(),
        });
    } else {
        res.status(503).json({
            status: "not ready",
            database: mongoose.connection.readyState === 2 ? "connecting" : "disconnected",
            uptime: process.uptime(),
        });
    }
});

// Combined health (backward-compatible)
app.get("/health", (_req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    res.status(dbReady ? 200 : 503).json({
        status: dbReady ? "OK" : "DEGRADED",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        database: dbReady ? "connected" : "disconnected",
        memory: process.memoryUsage(),
        performance: errorMonitor.getErrorStats(),
    });
});

// Metrics endpoint for monitoring (before router)
app.get("/metrics", (_req, res) => {
    res.status(200).json({
        errors: errorMonitor.getErrorStats(),
        cache: cacheManager.getStats(),
        database: {
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            name: mongoose.connection.name,
            maxPoolSize:
                parseInt(process.env.MONGODB_POOL_SIZE, 10) ||
                parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) ||
                50,
        },
        system: {
            nodeVersion: process.version,
            platform: process.platform,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
        },
    });
});

logger.info("Mounting router");
app.use("/", router);
logger.info("Router mounted");

// Ensure preflight (OPTIONS) requests are handled
app.options(/.*/, cors());

app.get("/uploads/:filename", authenticateUser, serveUpload);

// 404 handler — any request that reaches here has no matching route
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { message: "Route not found" },
    });
});

// Configure database connection with optimization
dbOptimizer.configurePool();

// MongoDB Connection with enhanced error handling (skip during tests)
if (process.env.NODE_ENV !== "test") {
    const mongoUri = process.env.MONGODB_URI;
    const maxPoolSize =
        parseInt(process.env.MONGODB_POOL_SIZE, 10) ||
        parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) ||
        50;
    mongoose
        .connect(mongoUri, {
            maxPoolSize,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        })
        .then(async () => {
            logger.info("Connected to MongoDB");

            // Create database indexes for performance
            try {
                await dbOptimizer.createIndexes();
            } catch (error) {
                logger.warn({ err: error }, "Database index creation failed");
            }
        })
        .catch((err) => {
            logger.error({ err }, "MongoDB connection error");
            errorMonitor.recordError(err);
        });
}

// Apply global error handler (must be last)
app.use(globalErrorHandler);

// Graceful shutdown
let server;
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal) {
    logger.info({ signal }, "Received signal, shutting down gracefully");

    const forceExit = setTimeout(() => {
        logger.fatal("Shutdown timed out, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
        if (server) {
            await new Promise((resolve, reject) =>
                server.close((err) => (err ? reject(err) : resolve()))
            );
            logger.info("HTTP server closed");
        }
    } catch (err) {
        logger.error({ err }, "Error closing HTTP server");
    }

    try {
        await dbOptimizer.shutdown();
        logger.info("Database connection closed");
    } catch (err) {
        logger.error({ err }, "Error closing database connection");
    }

    try {
        stopInactivityScheduler();
        stopTaskReminderScheduler();
        logger.info("Background scheduler stopped");
    } catch (err) {
        logger.error({ err }, "Error stopping background scheduler");
    }

    logger.info({ metrics: errorMonitor.getErrorStats() }, "Final metrics");
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    errorMonitor.recordError(err);
    mongoose.connection.close(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
    logger.fatal({ err }, "Unhandled rejection");
    errorMonitor.recordError(err);
    mongoose.connection.close(() => process.exit(1));
});

// Start the server unless running tests
if (process.env.NODE_ENV !== "test") {
        server = app.listen(PORT, () => {
            logger.info(
                { port: PORT },
                `API listening on http://localhost:${PORT} (resolved PORT=${PORT})`
            );
            logger.info("Security features active: rate limiting, CORS, helmet, input validation");
            logger.info("Performance features active: caching, lazy loading, query optimization");
            logger.info("Monitoring active: error tracking, performance metrics, health checks");

            // Daily inactivity automation (skipped in test mode / when disabled).
            startInactivityScheduler();
            // Task-reminder refresh (skipped in test mode).
            startTaskReminderScheduler();
        });
}

export default app;
