import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.development" });

console.log(
  "\ud83d\udd0d JWT_SECRET in authController:",
  process.env.JWT_SECRET
);

if (!process.env.JWT_SECRET) {
  throw new Error(
    "\ud83d\udea8 Missing `JWT_SECRET` in environment variables!"
  );
}

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const allowedRoles = ["admin", "user", "moderator"];
    const userRole = role && allowedRoles.includes(role) ? role : "user";

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: userRole,
    });

    console.log(
      `\u2705 User Registered: ${newUser.email} - Role: ${newUser.role}`
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
    console.error("\u274c Error registering user:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`\ud83d\udd39 Backend: Attempting login with email: ${email}`);

    const user = await User.findOne({ email });
    if (!user) {
      console.log("\u274c User not found:", email);
      return res.status(401).json({ error: "Fel email eller l\u00f6senord!" });
    }

    console.log(`\u2705 User found: ${user.email} (Role: ${user.role})`);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log(
      isMatch ? "\u2705 Passwords match!" : "\u274c Passwords do NOT match!"
    );

    if (!isMatch) {
      return res.status(401).json({ error: "Fel email eller l\u00f6senord!" });
    }

    console.log("\u2705 Password match! Generating token...");

    const token = jwt.sign(
      { userId: user._id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("\ud83d\udd39 Backend: Setting token cookie...");

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log(
      "\ud83d\udd0d Set-Cookie Header:",
      res.getHeaders()["set-cookie"]
    );

    res.json({
      message: "Login successful",
      user: { id: user._id, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error("\u274c Error logging in:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const authenticateUser = (req, res, next) => {
  let token = req.cookies?.token;

  if (!token) {
    console.log("Didn't find cookie, checking Authorization header...");
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: "Ingen giltig token angiven." });
  }

  try {
    console.log("Verifying token");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.userId = decoded.userId || decoded.id;

    if (!req.userId) {
      return res
        .status(401)
        .json({ error: "Autentisering saknas (No userId in token)." });
    }

    console.log("\u2705 Token verified, userId:", req.userId);
    next();
  } catch (error) {
    console.error("\u274c JWT verification error:", error.message);
    return res.status(401).json({ error: "Ogiltig token." });
  }
};

export const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });

  res.json({ message: "Logged out successfully" });
};

export const getSession = async (req, res) => {
  console.log("\ud83d\udd39 Incoming Session Request...");
  console.log("\ud83d\udd0d Cookies Received:", req.cookies);

  const token = req.cookies.token || req.cookies.authToken;

  if (!token) {
    console.log("\u274c No valid token found.");
    return res.status(401).json({ error: "No active session" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("\u2705 Decoded JWT:", decoded);

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      console.log("\u274c User not found in DB");
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: { id: user._id, name: user.name, role: user.role } });
  } catch (error) {
    console.error("\u274c Invalid session:", error);
    res.status(403).json({ error: "Invalid session" });
  }
};
