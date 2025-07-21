// middleware/auth.js

import { authenticateUser } from "../controllers/authController.js";

// Middleware to ensure user is authenticated
export function isAuthenticated(req, res, next) {
    authenticateUser(req, res, next);
}

// Middleware to check user role (expects req.user.role from authenticateUser)
export function hasRole(allowedRoles = []) {
    return (req, res, next) => {
        console.log("🔍 hasRole middleware called");
        console.log("🔍 req.user:", req.user);
        console.log("🔍 allowedRoles:", allowedRoles);
        console.log("🔍 user role:", req.user?.role);

        if (!req.user || !req.user.role) {
            console.log("❌ No user or role found");
            return res.status(401).json({ error: "Unauthorized" });
        }
        if (!allowedRoles.includes(req.user.role)) {
            console.log(
                "❌ Role not allowed:",
                req.user.role,
                "not in",
                allowedRoles
            );
            return res.status(403).json({ error: "Forbidden" });
        }
        console.log("✅ Role check passed");
        next();
    };
}
