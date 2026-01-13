/**
 * Helper script to sync slutprov calendar events.
 *
 * Usage:
 *   # Sync all students with slutprov
 *   node ./backend/scripts/syncCalendarEvents.js
 *
 *   # Sync a specific enrollment by id
 *   node ./backend/scripts/syncCalendarEvents.js --enrollment <ENROLLMENT_ID>
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import {
  syncAllCalendarEvents,
  syncCalendarEventFromEnrollment,
} from "../src/utils/calendarEventSync.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env (prefer NODE_ENV-specific file, fallback to .env)
const envFileBase =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : process.env.NODE_ENV === "test"
    ? ".env.test"
    : ".env.development";
const envPathCandidate = path.resolve(__dirname, "..", envFileBase);
const fallbackEnvPath = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: envPathCandidate });
// Also try fallback if primary not loaded
if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
  dotenv.config({ path: fallbackEnvPath });
}

const args = process.argv.slice(2);
const enrollmentFlagIndex = args.indexOf("--enrollment");
const enrollmentId = enrollmentFlagIndex !== -1 ? args[enrollmentFlagIndex + 1] : null;

async function main() {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/mindfullearning";

  console.log(`🔗 Connecting to MongoDB: ${mongoUri}`);
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  try {
    if (enrollmentId) {
      console.log(`🔄 Syncing calendar event for enrollment ${enrollmentId}...`);
      await syncCalendarEventFromEnrollment(enrollmentId);
      console.log("✅ Done");
    } else {
      console.log("🔄 Syncing calendar events for all students with slutprov...");
      await syncAllCalendarEvents();
      console.log("✅ Done");
    }
    process.exit(0);
  } catch (err) {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
  }
}

main();
