import express from "express";
const app = express();

import cors from "cors";
app.use(
    cors({
        origin: "https://mindfullearning.se",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        allowedHeaders:
            "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        credentials: true, // If using cookies/auth headers
    })
);

import dotenv from "dotenv";
import "dotenv/config";

// Determine the correct environment file
const envFile =
    process.env.NODE_ENV === "production"
        ? ".env.production"
        : ".env.development";
dotenv.config({ path: envFile });

console.log("Loaded environment:", envFile);
console.log("JWT_SECRET:", process.env.JWT_SECRET);

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
app.listen(PORT, () =>
    console.log(`🚀 Server running on ${process.env.NODE_ENV}:${PORT}`)
);
