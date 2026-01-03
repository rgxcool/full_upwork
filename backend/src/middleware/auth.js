// middleware/auth.js

import { authenticateUser } from "../controllers/authController.js";

// Middleware to ensure user is authenticated
export function isAuthenticated(req, res, next) {
    authenticateUser(req, res, next);
}

// Middleware to check user role (expects req.user.role from authenticateUser)
export function hasRole(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        next();
    };
}
