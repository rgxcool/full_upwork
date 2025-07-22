// Usage: node backend/scripts/deleteOldSlutprovEvents.js
import mongoose from 'mongoose';
import CalendarEvent from '../src/models/Event.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mindfullearning';

async function main() {
  await mongoose.connect(MONGO_URI);
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