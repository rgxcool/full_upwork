import mongoose from "mongoose";

const kursPaketSchema = new mongoose.Schema({
    kursnamn: { type: String, required: true },
    kurskod: { type: String, required: true },
    poang: { type: String, required: true },
    omfattning: { type: String, required: true },
});

export default mongoose.model("KursPaket", kursPaketSchema, "kurspaket");
