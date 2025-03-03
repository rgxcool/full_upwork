import dotenv from "dotenv";
import path from "path";

const envFile =
    process.env.NODE_ENV === "production"
        ? ".env.production"
        : ".env.development";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

console.log(`🚀 Running in ${process.env.NODE_ENV} mode`);
console.log(`📌 Loaded environment file: ${envFile}`);
console.log(`🔑 JWT_SECRET Loaded: ${process.env.JWT_SECRET ? "Yes" : "No"}`);

import express from "express";
const app = express();

import cors from "cors";
app.use(
    cors({
        origin: process.env.CLIENT_URL,
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        allowedHeaders:
            "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        credentials: true, // If using cookies/auth headers
    })
);

import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import router from "./src/router/router.js"; // Ensure this path is correct

const PORT = process.env.PORT || 5001;

// Middleware setup
app.use(cookieParser());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log("Attempting to mount router...");
app.use("/", router);
console.log("Router successfully mounted!");

// Ensure preflight (OPTIONS) requests are handled
app.options("*", cors());

// MongoDB Connection
mongoose
    .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

// Start the server
app.listen(PORT, () => console.log(`🚀 Server running on localhost:${PORT}`));
