import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.development") });
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGODB_URI);
const Program = (await import("../src/models/Program.js")).default;
const p = await Program.findOne({ programName: "FÖRSÄLJNING OCH SERVICE" }).lean();
console.log(JSON.stringify(p, null, 2).slice(0, 2000));
await mongoose.disconnect();