import mongoose from "mongoose";
import Notification from "../src/models/Notification.js";

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("🔌 Ansluten till databasen");

    const notifications = await Notification.find({});
    console.log("🔍 Hämtade notifikationer:", notifications.length);

    const cleaned = removeDuplicateNotifications(notifications);
    console.log("✅ Unika notifikationer:", cleaned.length);

    // Om du vill spara eller ta bort dubletter kan du göra det här

    // Exempel: skriva ut ID:n som ska tas bort
    const cleanedIds = new Set(cleaned.map(n => n._id.toString()));
    const duplicates = notifications.filter(n => !cleanedIds.has(n._id.toString()));
    console.log("🗑️ Dubletter att ta bort:", duplicates.map(n => n._id));

    // Alternativt: ta bort dubletter från databasen
    await Notification.deleteMany({ _id: { $in: duplicates.map(n => n._id) } });
    
  } catch (error) {
    console.error("❌ Fel:", error);
  } finally {
    mongoose.disconnect();
  }
}

function removeDuplicateNotifications(notifications) {
  const seen = new Set();
  const uniqueNotifications = [];

  for (const notification of notifications) {
    const studentId = notification.meta?.studentId?.toString();
    const type = notification.type;
    const key = `${type}-${studentId}`;

    if (!seen.has(key)) {
      seen.add(key);
      uniqueNotifications.push(notification);
    }
  }

  return uniqueNotifications;
}

main();
