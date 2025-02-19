import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import router from "./src/router/router.js"; // Ensure this path is correct

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware setup
app.use(cookieParser());
app.use(
    cors({
        origin: process.env.CLIENT_URL, // ✅ Allows frontend requests
        credentials: true, // Allows sending cookies
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log("Attempting to mount router...");
app.use("/", router);
console.log("Router successfully mounted!");

// MongoDB Connection
mongoose
    .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

// Start the server
app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
);
