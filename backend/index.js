import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import router from "./src/router/router.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "./src/models/User.js";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true, // Allow cookies
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import and use all routes
app.use(router);

// Connect to MongoDB
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("MongoDB connection error:", err));

app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
);
