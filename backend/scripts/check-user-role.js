import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import User from "../src/models/User.js";

// Load environment variables
// Try multiple possible locations for .env file
const possibleEnvFiles = [
    path.resolve(process.cwd(), "../.env.development"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), ".env.development"),
    path.resolve(process.cwd(), ".env"),
];

let envLoaded = false;
for (const envFile of possibleEnvFiles) {
    try {
        dotenv.config({ path: envFile });
        if (process.env.MONGO_URI) {
            envLoaded = true;
            break;
        }
    } catch (err) {
        // Continue to next file
    }
}

if (!envLoaded) {
    // Try default location
    dotenv.config({ path: path.resolve(process.cwd(), "../.env.development") });
}

const checkUserRole = async () => {
    if (!process.env.MONGO_URI) {
        console.error(
            "MONGO_URI not found in environment variables. Make sure your .env file is set up correctly."
        );
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        const email = process.argv[2] || "cyrus.malekani@mindful.se";
        const user = await User.findOne({ email });

        if (!user) {
            console.log(`❌ User with email ${email} not found.`);
            return;
        }

        console.log(`\n📋 User: ${user.email}`);
        console.log(`   Current roles: ${JSON.stringify(user.roles)}`);
        console.log(`   Virtual role: ${user.role}`);
        console.log(`   Permissions: ${JSON.stringify(user.permissions || [])}`);

        // Check if user needs role update
        if (user.roles && user.roles.length > 0 && user.roles[0] === "user") {
            console.log(`\n⚠️  User has role "user" which is too low for navigation access.`);
            console.log(`   To update to admin, run:`);
            console.log(`   node scripts/update-user-role.js ${email} admin`);
        }
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("\n✅ Disconnected from MongoDB.");
    }
};

checkUserRole();

