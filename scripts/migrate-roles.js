import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../src/models/User.js';

// Load environment variables
let envFile = ".env.development";
if (process.env.NODE_ENV === "production") {
    envFile = ".env.production";
} else if (process.env.NODE_ENV === "test") {
    envFile = ".env.test";
}
dotenv.config({ path: path.resolve(process.cwd(), envFile) });


const migrateUsers = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not found in environment variables. Make sure your .env file is set up correctly.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    const usersToMigrate = await User.find({ role: { $exists: true } });
    
    if (usersToMigrate.length === 0) {
        console.log("No users to migrate.");
        return;
    }

    console.log(`Found ${usersToMigrate.length} users to migrate.`);

    let migratedCount = 0;
    for (const user of usersToMigrate) {
      const oldRole = user.role;
      const result = await User.updateOne(
        { _id: user._id },
        {
          $set: {
            roles: [oldRole],
            permissions: user.permissions || [], // Ensure permissions field exists
          },
          $unset: { role: 1 },
        }
      );
      if(result.modifiedCount > 0){
          migratedCount++;
      }
    }
    console.log(`Migrated ${migratedCount} of ${usersToMigrate.length} users.`);
  } catch (err) {
      console.error("Migration failed:", err);
  } finally {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
  }
};

migrateUsers();
