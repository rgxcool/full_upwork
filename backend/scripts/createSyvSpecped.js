import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js"; // Justera sökväg om det behövs

// Fix __dirname in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ladda .env-fil
dotenv.config({ path: path.resolve(__dirname, "../.env.production") });

async function createUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Ansluten till MongoDB");

    const usersToCreate = [
      {
        username: "SYV Användare",
        email: "syv@mindful.com",
        role: "syv",
        password: "syv1234",
      },
      {
        username: "Specped Användare",
        email: "specped@mindful.com",
        role: "specped",
        password: "specped1234",
      },
    ];

    for (const user of usersToCreate) {
      const exists = await User.findOne({ email: user.email });
      if (exists) {
        console.log(`⚠️ Användare med e-post ${user.email} finns redan`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(user.password, 12);

      const newUser = new User({
        username: user.username,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await newUser.save();
      console.log(`🎉 Konto skapat: ${user.role} (${user.email})`);
      console.log(`   🔑 Lösenord: ${user.password}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Fel vid skapande av användare:", error);
    process.exit(1);
  }
}

createUsers();
