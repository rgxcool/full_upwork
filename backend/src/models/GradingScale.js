// models/GradingScale.js
import mongoose from "mongoose";

const GradingScaleSchema = new mongoose.Schema({
  term: { type: String, required: true }, // t.ex. HT24
  subject: { type: String, required: true }, // Matematik, Engelska etc.
  scale: [
    {
      min: Number,   // poäng
      grade: String, // t.ex. A
    },
  ],
});

export default mongoose.model("GradingScale", GradingScaleSchema);
