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
        if (process.env.MONGODB_URI) {
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

const updateUserRole = async () => {
    const mongoUri = process.env.MONGODB_URI;

    const email = process.argv[2];
    const newRole = process.argv[3];

    if (!email || !newRole) {
        console.error("Usage: node scripts/update-user-role.js <email> <role>");
        console.error("Example: node scripts/update-user-role.js cyrus.malekani@mindful.se admin");
        process.exit(1);
    }

    const allowedRoles = [
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

    if (!allowedRoles.includes(newRole)) {
        console.error(`❌ Invalid role: ${newRole}`);
        console.error(`   Allowed roles: ${allowedRoles.join(", ")}`);
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        const user = await User.findOne({ email });

        if (!user) {
            console.log(`❌ User with email ${email} not found.`);
            return;
        }

        console.log(`\n📋 Updating user: ${user.email}`);
        console.log(`   Old roles: ${JSON.stringify(user.roles)}`);

        const result = await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    roles: [newRole],
                },
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`   ✅ Updated roles to: [${newRole}]`);
            console.log(`   The user will need to log out and log back in for changes to take effect.`);
        } else {
            console.log(`   ⚠️  No changes made (role may already be ${newRole})`);
        }
    } catch (err) {
        console.error("❌ Error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("\n✅ Disconnected from MongoDB.");
    }
};

updateUserRole();
