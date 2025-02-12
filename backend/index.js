import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import router from "./src/router/router.js"; // ✅ Ensure this path is correct

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

console.log("✅ Attempting to mount router...");
app.use("/", router);
console.log("✅ Router successfully mounted!");

console.log("✅ Printing raw Express router stack...");
console.log(app._router.stack);

// ✅ Debugging route registration
console.log("✅ Printing all registered routes...");
console.log(
    app._router.stack
        .map((layer) => {
            if (layer.route) {
                return `✅ ${Object.keys(layer.route.methods)
                    .join(", ")
                    .toUpperCase()} ${layer.route.path}`;
            } else if (layer.name === "router") {
                return layer.handle.stack.map((nested) => {
                    if (nested.route) {
                        return `✅ ${Object.keys(nested.route.methods)
                            .join(", ")
                            .toUpperCase()} ${nested.route.path}`;
                    }
                });
            }
        })
        .flat()
        .filter(Boolean)
        .join("\n")
);

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => console.error("❌ MongoDB connection error:", err));

app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
);
