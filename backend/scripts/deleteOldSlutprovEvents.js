// Usage: node backend/scripts/deleteOldSlutprovEvents.js
import mongoose from "mongoose";
import CalendarEvent from "../src/models/Event.js";

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);
  // Delete events where title contains 'Slutprov' (case-insensitive) or extendedProps.type is 'slutprov'
  const result = await CalendarEvent.deleteMany({
    $or: [
      { title: { $regex: /slutprov/i } },
      { 'extendedProps.type': 'slutprov' }
    ]
  });
  console.log(`Deleted ${result.deletedCount} old 'Slutprov' events.`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); }); 
