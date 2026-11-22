import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import logger from "../utils/logger.js";
import { AUTH_COOKIE_NAME, setAuthCookie, clearAuthCookie } from "../config/cookies.js";
import { refreshUserAuthorization } from "../middleware/authorization.js";
import { collectRoles, getPrimaryRole } from "../utils/roles.js";

async function persistMergedRoles(user) {
    const mergedRoles = collectRoles(user);
    const current = Array.isArray(user.roles) ? user.roles : [];
    const alreadyMerged =
        mergedRoles.length === current.length &&
        mergedRoles.every((role) => current.includes(role));
    const hasStoredRoleField =
        user._doc && Object.prototype.hasOwnProperty.call(user._doc, "role");

    user.roles = mergedRoles.length ? mergedRoles : current;

    if (alreadyMerged && !hasStoredRoleField) {
        return user.roles;
    }

    try {
        await User.updateOne(
            { _id: user._id },
            { $set: { roles: user.roles }, $unset: { role: "" } }
        );
    } catch (error) {
        logger.warn({ err: error, userId: user._id }, "Failed to persist merged roles");
    }

    return user.roles;
}

/**
 * Authentication Controller
 * Handles user registration, login, authentication, session, and logout.
 * Uses JWT for authentication and bcrypt for password hashing.
 */
export const register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const allowedRoles = ["student", "user"];
        const primaryRole = role && allowedRoles.includes(role) ? role : "user";
        const roles = [primaryRole];

        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
            roles,
        });

        logger.info({ email: newUser.email, role: newUser.role }, "User registered");

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                roles: newUser.roles,
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Error registering user");
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * Logs in a user and sets a JWT token cookie.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        logger.info({ email }, "Attempting login");
        
        const user = await User.findOne({ email });
        if (!user) {
            logger.warn({ email }, "User not found for email");
            return res.status(401).json({ error: "Fel email eller lösenord" });
        }

        logger.info({ username: user.username || user.email, userId: user._id }, "User found");
        logger.debug({ hasPassword: !!user.password }, "User has password");
        logger.debug({ roles: user.roles || [] }, "User roles");

        if (!user.password) {
            logger.warn({ email }, "User has no password set");
            return res.status(401).json({ error: "Fel email eller lösenord" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        logger.debug({ isMatch }, "Password match result");
        
        if (!isMatch) {
            logger.warn({ username: user.username || user.email }, "Password mismatch");
            return res.status(401).json({ error: "Fel email eller lösenord" });
        }

        // Record last login time (best-effort; failure must not block login).
        try {
            await User.updateOne(
                { _id: user._id },
                { $set: { lastLoginAt: new Date() } }
            );
        } catch (loginError) {
            logger.error({ err: loginError }, "Failed to record last login time");
        }

        const userPermissions =
            user.permissions && typeof user.permissions === "object" ? user.permissions : {};

        const mergedRoles = await persistMergedRoles(user);
        const primaryRole = getPrimaryRole(user);

        const tokenPayload = {
            userId: user._id,
            roles: mergedRoles,
            role: primaryRole,
            name: user.name,
            email: user.email,
            permissions: userPermissions,
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });

        setAuthCookie(res, token);

        res.json({
            message: "Login successful",
            requiresPasswordChange: !!user.mustChangePassword,
            user: {
                userId: user._id, // ✅ Standard key
                name: user.name || user.username || "",
                username: user.username || "",
                email: user.email,
                role: primaryRole,
                roles: mergedRoles,
                permissions: userPermissions,
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Error logging in");
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * Middleware to authenticate a user using JWT from cookie or Authorization header.
 * Sets req.user and req.userId if valid.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const authenticateUser = async (req, res, next) => {
    if (req.user) {
        req.userId = req.userId || req.user.userId || req.user._id || req.user.id;
        return next();
    }
    let token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        return res.status(401).json({ error: "Ingen giltig token angiven." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const roles = decoded.roles || (decoded.role ? [decoded.role] : []);
        const userWithRoles = {
            ...decoded,
            roles,
            role: decoded.role || (roles[0] ?? null),
        };

        // 🛠 Set full decoded user with fallback `id`
        req.user = userWithRoles;
        req.userId = userWithRoles.userId;

        if (!req.userId) {
            return res
                .status(401)
                .json({ error: "Autentisering saknas (No userId in token)." });
        }

        // The JWT payload carries no `municipalities`, so without this the
        // tenant helpers in utils/tenantScope.js see an empty scope and treat a
        // municipality-restricted staff member as global. Endpoints guarded only
        // by `authenticateUser` (document metadata, uploads) then leaked
        // cross-tenant data. Hydrating here also picks up role revocations.
        await refreshUserAuthorization(req);

        next();
    } catch (error) {
        logger.error({ message: error.message }, "JWT verification error");
        return res.status(401).json({ error: "Ogiltig token." });
    }
};

/**
 * Changes the authenticated user's own password.
 * Requires the current password; on success clears the forced
 * mustChangePassword flag so the user is no longer blocked.
 * @async
 * @param {import('express').Request} req - Express request object (req.userId set by authenticateUser)
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: "Nuvarande och nytt lösenord krävs." });
        }

        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: "Användaren hittades inte." });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            logger.warn({ userId: user._id }, "Password change failed: wrong current password");
            return res.status(401).json({ error: "Nuvarande lösenord är felaktigt." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        user.password = hashedPassword;
        user.mustChangePassword = false;
        await user.save();

        logger.info({ userId: user._id }, "Password changed");

        res.json({
            message: "Lösenordet har ändrats.",
            requiresPasswordChange: false,
        });
    } catch (error) {
        logger.error({ err: error }, "Error changing password");
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * Logs out the user by clearing the token cookie.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const logout = async (req, res) => {
    clearAuthCookie(res);

    res.json({ message: "Logout successful" });
};

/**
 * Gets the current session user if a valid token is present.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const getSession = async (req, res) => {
    logger.info("Incoming session request");
    logger.debug({ cookies: req.cookies }, "Cookies received");

    const token = req.cookies[AUTH_COOKIE_NAME] || req.cookies.authToken;

    if (!token) {
        logger.warn("No valid token found");
        return res.status(401).json({ error: "No active session" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        logger.debug({ decoded }, "Decoded JWT");

        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
            logger.warn("User not found in DB");
            return res.status(404).json({ error: "User not found" });
        }

        const mergedRoles = await persistMergedRoles(user);
        const primaryRole = getPrimaryRole(user);

        res.json({
            requiresPasswordChange: !!user.mustChangePassword,
            user: {
                userId: user._id, // ✅ Match login response
                name: user.name || user.username || "",
                username: user.username || "",
                email: user.email,
                role: primaryRole,
                roles: mergedRoles,
                // Per-user feature overrides, so the UI route guard can honour
                // them the same way canFeature() does (same shape as login).
                permissions:
                    user.permissions && typeof user.permissions === "object" ? user.permissions : {},
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Invalid session");
        res.status(403).json({ error: "Invalid session" });
    }
};
