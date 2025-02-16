import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getSession } from "../controllers/authController.js";

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

// Login User
router.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res
                .status(401)
                .json({ message: "Fel email eller lösenord!" });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
            expiresIn: "1h",
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax", // Ensures cross-origin authentication works
            maxAge: 3600000, // 1 hour
        });

        return res.json({ message: "Login lyckades!", token });
    } catch (error) {
        console.error("❌ Login error:", error);
        return res.status(500).json({ message: "Server error." });
    }
});

// Logout User
router.post("/auth/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
    });
    return res.status(200).json({ message: "Logged out successfully!" });
});

// Check Authentication
router.get("/auth/me", (req, res) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ message: "Not authenticated" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return res.json({ userId: decoded.userId });
    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
});

router.get("/auth/session", getSession); // ✅ Fetch user session from cookie

export default router;
