import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { logger } from "../utils/errorHandler.js";
import { AppError, AuthorizationError } from "../utils/errorHandler.js";

// Security configuration
const securityConfig = {
    // Rate limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
        message: "Too many requests from this IP, please try again later.",
        standardHeaders: true,
        legacyHeaders: false,
    },

    // Role hierarchy
    roles: {
        guest: 0,
        user: 1,
        student: 2,
        coordinator: 3,
        specped: 4,
        syv: 5,
        teacher: 6,
        admin: 7,
        systemadmin: 8,
    },

    // Permission matrix
    permissions: {
        // Student permissions
        student: {
            read: ["own_profile", "own_courses", "own_grades"],
            write: ["own_profile"],
            delete: [],
        },

        // Teacher permissions
        teacher: {
            read: [
                "own_profile",
                "assigned_students",
                "assigned_courses",
                "grades",
            ],
            write: ["own_profile", "grades", "comments"],
            delete: ["own_comments"],
        },

        // Admin permissions
        admin: {
            read: [
                "all_students",
                "all_teachers",
                "all_courses",
                "all_grades",
                "reports",
            ],
            write: [
                "all_students",
                "all_teachers",
                "all_courses",
                "all_grades",
                "comments",
            ],
            delete: ["all_students", "all_teachers", "all_courses", "comments"],
        },

        // System admin permissions
        systemadmin: {
            read: ["*"],
            write: ["*"],
            delete: ["*"],
        },
    },
};

// Enhanced role-based access control
export const enhancedRBAC = {
    // Check if user has required role
    hasRole(userRole, requiredRole) {
        const userLevel = securityConfig.roles[userRole] || 0;
        const requiredLevel = securityConfig.roles[requiredRole] || 0;
        return userLevel >= requiredLevel;
    },

    // Check if user has specific permission
    hasPermission(userRole, action, resource) {
        const rolePermissions = securityConfig.permissions[userRole];
        if (!rolePermissions) return false;

        // System admin has all permissions
        if (userRole === "systemadmin") return true;

        // Check if action is allowed
        const allowedActions = rolePermissions[action] || [];
        return (
            allowedActions.includes(resource) || allowedActions.includes("*")
        );
    },

    // Check resource ownership
    isOwner(userId, resourceUserId) {
        return userId === resourceUserId;
    },

    // Check if user can access resource
    canAccess(user, action, resource, resourceUserId = null) {
        if (!user || !user.role) return false;

        // Check ownership first
        if (resourceUserId && this.isOwner(user.userId, resourceUserId)) {
            return true;
        }

        // Check role-based permissions
        return this.hasPermission(user.role, action, resource);
    },
};

// Rate limiting middleware
export const rateLimiter = rateLimit(securityConfig.rateLimit);

// Enhanced rate limiting for specific endpoints
export const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: { error: message },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
            res.status(429).json({
                success: false,
                error: {
                    message:
                        message || "Too many requests, please try again later.",
                    retryAfter: Math.ceil(windowMs / 1000),
                },
            });
        },
    });
};

// Specific rate limiters
export const authRateLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 attempts
    "Too many login attempts, please try again later."
);

export const uploadRateLimiter = createRateLimiter(
    60 * 60 * 1000, // 1 hour
    10, // 10 uploads
    "Too many file uploads, please try again later."
);

export const apiRateLimiter = createRateLimiter(
    60 * 1000, // 1 minute
    60, // 60 requests
    "Too many API requests, please try again later."
);

// Security headers middleware
export const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

// Input validation middleware
export const inputValidator = {
    // Validate email format
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Validate password strength
    validatePassword(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        return {
            isValid:
                password.length >= minLength &&
                hasUpperCase &&
                hasLowerCase &&
                hasNumbers &&
                hasSpecialChar,
            errors: {
                length:
                    password.length < minLength
                        ? `Password must be at least ${minLength} characters`
                        : null,
                uppercase: !hasUpperCase
                    ? "Password must contain at least one uppercase letter"
                    : null,
                lowercase: !hasLowerCase
                    ? "Password must contain at least one lowercase letter"
                    : null,
                numbers: !hasNumbers
                    ? "Password must contain at least one number"
                    : null,
                special: !hasSpecialChar
                    ? "Password must contain at least one special character"
                    : null,
            },
        };
    },

    // Sanitize input
    sanitizeInput(input) {
        if (typeof input !== "string") return input;

        return input
            .trim()
            .replace(/[<>]/g, "") // Remove potential HTML tags
            .replace(/javascript:/gi, "") // Remove javascript: protocol
            .replace(/on\w+=/gi, ""); // Remove event handlers
    },

    // Validate MongoDB ObjectId
    validateObjectId(id) {
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        return objectIdRegex.test(id);
    },
};

// Enhanced authentication middleware
export const enhancedAuth = {
    // Verify JWT token with enhanced security
    verifyToken(token) {
        try {
            if (!token) {
                throw new AppError("No token provided", 401);
            }

            // Additional token validation could go here
            // For example, checking token blacklist, expiration, etc.

            return true;
        } catch (error) {
            logger.error("Token verification failed:", error);
            throw new AppError("Invalid token", 401);
        }
    },

    // Check if user is authenticated
    isAuthenticated(req, res, next) {
        try {
            if (!req.user || !req.user.userId) {
                throw new AuthorizationError("Authentication required");
            }
            next();
        } catch (error) {
            next(error);
        }
    },

    // Check if user has required role
    hasRole(requiredRole) {
        return (req, res, next) => {
            try {
                if (!req.user || !req.user.role) {
                    throw new AuthorizationError("Authentication required");
                }

                if (!enhancedRBAC.hasRole(req.user.role, requiredRole)) {
                    logger.warn(
                        `Access denied: User ${req.user.userId} (${req.user.role}) tried to access ${req.path}`
                    );
                    throw new AuthorizationError(
                        `Access denied. Required role: ${requiredRole}`
                    );
                }

                next();
            } catch (error) {
                next(error);
            }
        };
    },

    // Check if user has specific permission
    hasPermission(action, resource) {
        return (req, res, next) => {
            try {
                if (!req.user || !req.user.role) {
                    throw new AuthorizationError("Authentication required");
                }

                const resourceUserId = req.params.userId || req.body.userId;

                if (
                    !enhancedRBAC.canAccess(
                        req.user,
                        action,
                        resource,
                        resourceUserId
                    )
                ) {
                    logger.warn(
                        `Permission denied: User ${req.user.userId} (${req.user.role}) tried to ${action} ${resource}`
                    );
                    throw new AuthorizationError(
                        `Permission denied. Required: ${action} ${resource}`
                    );
                }

                next();
            } catch (error) {
                next(error);
            }
        };
    },
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get("User-Agent"),
            userId: req.user?.userId,
            userRole: req.user?.role,
        };

        if (res.statusCode >= 400) {
            logger.warn("Request completed with error", logData);
        } else {
            logger.info("Request completed successfully", logData);
        }
    });

    next();
};

// CORS configuration
export const corsConfig = {
    origin: function (origin, callback) {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
            "http://localhost:5173",
            "http://localhost:3000",
        ];

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn(`CORS blocked request from origin: ${origin}`);
            callback(new AppError("Not allowed by CORS", 403));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
        "Cache-Control",
    ],
    exposedHeaders: ["Content-Length", "X-Total-Count"],
};

// Security audit middleware
export const securityAudit = (req, res, next) => {
    const auditData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        userId: req.user?.userId,
        userRole: req.user?.role,
        headers: {
            "content-type": req.get("Content-Type"),
            authorization: req.get("Authorization") ? "present" : "missing",
            "user-agent": req.get("User-Agent"),
        },
    };

    // Log suspicious activities
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+=/i,
        /union\s+select/i,
        /drop\s+table/i,
        /delete\s+from/i,
    ];

    // Safely handle request body and URL
    const requestBody = req.body ? JSON.stringify(req.body).toLowerCase() : "";
    const requestUrl = req.url ? req.url.toLowerCase() : "";

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(requestBody) || pattern.test(requestUrl)) {
            logger.error("Suspicious activity detected", auditData);
            return res.status(400).json({
                success: false,
                error: { message: "Invalid request detected" },
            });
        }
    }

    next();
};

// Export all security utilities
export default {
    enhancedRBAC,
    rateLimiter,
    authRateLimiter,
    uploadRateLimiter,
    apiRateLimiter,
    securityHeaders,
    inputValidator,
    enhancedAuth,
    requestLogger,
    corsConfig,
    securityAudit,
};
