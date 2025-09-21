import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
    getSession,
    login,
    logout as controllerLogout,
} from "../controllers/authController.js";

const router = express.Router();

// Register User
router.post("/auth/register", async (req, res) => {
    try {
        const { email, password, username } = req.body;

        if (!email || !password || !username) {
            return res
                .status(400)
                .json({ message: "Alla fält är obligatoriska!" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                message: "Emailadressen finns redan, var vänlig att logga in!",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        return res.status(201).json({ message: "Användare registrerad!" });
    } catch (error) {
        console.error("❌ Registration error:", error);
        return res
            .status(500)
            .json({ message: "Ett fel uppstod vid registreringen." });
    }
});

// ✅ Login User (delegate to controller for consistent behavior)
router.post("/auth/login", login);

// ✅ Logout (controller)
router.post("/auth/logout", controllerLogout);

// ✅ Auth Middleware for extracting user from JWT cookie
function requireUser(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ message: "Not authenticated" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // includes userId, name, role, email
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
}

// ✅ Get session (controller validates token from cookie)
router.get("/auth/session", getSession);

export { requireUser };
export default router;
