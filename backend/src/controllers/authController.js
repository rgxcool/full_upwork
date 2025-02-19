import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("🚨 Missing `JWT_SECRET` in environment variables!");
}

/**
 * ✅ Register a New User
 * - Only allows valid roles (`admin`, `user`, `moderator`)
 * - Hashes password before storing in MongoDB
 */
export const register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Hash the password securely
        const hashedPassword = await bcrypt.hash(password, 10);

        // Ensure only valid roles are assigned (Admins should manually set `systemadmin`)
        const allowedRoles = ["admin", "user", "moderator"];
        const userRole = role && allowedRoles.includes(role) ? role : "user";

        // Create new user
        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
            role: userRole,
        });

        console.log(
            `✅ User Registered: ${newUser.email} - Role: ${newUser.role}`
        );

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
            },
        });
    } catch (error) {
        console.error("❌ Error registering user:", error);
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * ✅ User Login
 * - Verifies password using bcrypt
 * - Generates JWT token
 * - Sets `token` in HttpOnly cookie
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log(`🔹 Backend: Attempting login with email: ${email}`);

        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ User not found:", email);
            return res.status(401).json({ error: "Fel email eller lösenord!" });
        }

        console.log(`✅ User found: ${user.email} (Role: ${user.role})`);

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        console.log(
            isMatch ? "✅ Passwords match!" : "❌ Passwords do NOT match!"
        );

        if (!isMatch) {
            return res.status(401).json({ error: "Fel email eller lösenord!" });
        }

        console.log("✅ Password match! Generating token...");

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        console.log("🔹 Backend: Setting token cookie...");

        res.cookie("token", token, {
            // ✅ Rename cookie from `token` to `token`
            httpOnly: true,
            secure: true, // ✅ Required for `SameSite=None`
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        console.log("🔍 Set-Cookie Header:", res.getHeaders()["set-cookie"]); // ✅ Debug if cookie is set

        res.json({
            message: "Login successful",
            user: { id: user._id, name: user.name, role: user.role },
        });
    } catch (error) {
        console.error("❌ Error logging in:", error);
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * ✅ Middleware: Authenticate User
 * - Verifies JWT token from cookies OR headers
 * - Attaches user data to `req.user`
 */
export const authenticateUser = (req, res, next) => {
    let token = req.cookies?.token; // Check cookie first

    if (!token) {
        // If no cookie, check Authorization header
        const authHeader = req.headers.authorization;
        console.log("🔍 Received Authorization Header:", authHeader);

        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1]; // Extract token
        }
    }

    if (!token) {
        return res.status(401).json({ error: "Ingen giltig token angiven." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.userId = decoded.userId || decoded.id; // Support both `userId` and `id`

        if (!req.userId) {
            return res
                .status(401)
                .json({ error: "Autentisering saknas (No userId in token)." });
        }

        console.log("✅ Token verified, userId:", req.userId);
        next();
    } catch (error) {
        console.error("❌ JWT verification error:", error.message);
        return res.status(401).json({ error: "Ogiltig token." });
    }
};

/**
 * ✅ Logout User
 * - Clears the authentication cookie
 */
export const logout = async (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
    });

    res.json({ message: "Logged out successfully" });
};

/**
 * ✅ Fetch Current User Session
 * - Retrieves user from `token` in cookies
 */
export const getSession = async (req, res) => {
    console.log("🔹 Incoming Session Request...");

    console.log("🔍 Cookies Received:", req.cookies); // ✅ Debugging

    const token = req.cookies.token || req.cookies.authToken; // ✅ Support both names

    if (!token) {
        console.log("❌ No valid token found.");
        return res.status(401).json({ error: "No active session" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("✅ Decoded JWT:", decoded);

        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
            console.log("❌ User not found in DB");
            return res.status(404).json({ error: "User not found" });
        }

        res.json({ user: { id: user._id, name: user.name, role: user.role } });
    } catch (error) {
        console.error("❌ Invalid session:", error);
        res.status(403).json({ error: "Invalid session" });
    }
};
