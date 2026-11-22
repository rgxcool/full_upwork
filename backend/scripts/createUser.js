import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";

// Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Interactive: asks for name, email, password and roles, then creates the user.
// Usage (from backend/): node scripts/createUser.js
// Loads .env.development unless NODE_ENV=production / test says otherwise.
const envFile =
    process.env.NODE_ENV === "production"
        ? ".env.production"
        : process.env.NODE_ENV === "test"
          ? ".env.test"
          : ".env.development";
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

const ALLOWED_ROLES = [
    "guest",
    "user",
    "student",
    "coordinator",
    "specped",
    "syv",
    "teacher",
    "admin",
    "systemadmin",
];

export async function createUserInteractive() {
    const rl = readline.createInterface({ input, output });

    try {
        console.log("\n========================================");
        console.log("       Interactive User Creator         ");
        console.log("========================================\n");

        const usernameInput = await rl.question("Enter username (default: 'Mindful User'): ");
        const username = usernameInput.trim() || "Mindful User";

        const email = await rl.question("Enter email (required): ");
        if (!email || !email.trim()) {
            throw new Error("Email is required.");
        }

        const passwordInput = await rl.question("Enter password (default: 'mindful'): ");
        const password = passwordInput || "mindful";

        console.log(`\nAllowed roles: ${ALLOWED_ROLES.join(", ")}`);
        const rolesInput = await rl.question("Enter roles comma-separated (default: 'systemadmin'): ");
        
        const rolesStr = rolesInput.trim() || "systemadmin";
        const roles = rolesStr
            .split(",")
            .map((r) => r.trim())
            .filter((r) => r.length > 0);

        // Validate roles against schema enum
        for (const role of roles) {
            if (!ALLOWED_ROLES.includes(role)) {
                throw new Error(`Invalid role '${role}'. Allowed roles are: ${ALLOWED_ROLES.join(", ")}`);
            }
        }

        rl.close();

        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is not defined in environment variables.");
        }

        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri);
        }
        console.log("\n✅ Connected to MongoDB");

        // Check if user with this email already exists
        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            console.log(`⚠️ User with email '${normalizedEmail}' already exists.`);
            throw new Error("User with this email already exists.");
        }

        const usesDefaultPassword = password === "mindful";
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create User matching the schema structure
        const newUser = new User({
            username,
            email: normalizedEmail,
            password: hashedPassword,
            roles,
            mustChangePassword: usesDefaultPassword,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await newUser.save();
        console.log("\n🎉 User created successfully!");
        console.log(`👤 Username : ${newUser.username}`);
        console.log(`📧 Email    : ${newUser.email}`);
        console.log(`🛡️ Roles    : [ ${newUser.roles.join(", ")} ]`);
        
        if (usesDefaultPassword) {
            console.log(`🔑 Password : mindful — MUST be changed on first login (mustChangePassword=true).`);
        } else {
            console.log(`🔑 Password : [Custom password applied]`);
        }
        console.log("========================================\n");

        return newUser;
    } catch (error) {
        rl.close();
        throw error;
    }
}

const isDirectRun =
    process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
    createUserInteractive()
        .then(async () => {
            await mongoose.disconnect();
            process.exit(0);
        })
        .catch(async (error) => {
            console.error("\n❌ Error creating user:", error.message || error);
            if (mongoose.connection.readyState !== 0) {
                await mongoose.disconnect();
            }
            process.exit(1);
        });
}