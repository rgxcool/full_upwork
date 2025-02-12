import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables

/**
 * Middleware to authenticate JWT tokens from headers or cookies.
 */
const authenticate = (req, res, next) => {
    let token = req.cookies?.token; // Check for cookie token

    if (!token) {
        // If no cookie, check Authorization header
        const authHeader = req.headers.authorization;
        console.log("🔍 Received Authorization Header:", authHeader);

        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1]; // Extract token
        }
    }

    if (!token) {
        return res.status(401).json({ message: "Ingen giltig token angiven." });
    }

    try {
        if (!process.env.JWT_SECRET) {
            throw new Error(
                "JWT_SECRET is not defined in environment variables."
            );
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
        return res.status(401).json({ message: "Ogiltig token." });
    }
};

export default authenticate;
