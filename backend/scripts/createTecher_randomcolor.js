import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { distance } from "fastest-levenshtein";
import User from "../src/models/User.js";
import Teacher from "../src/models/Teacher.js";
import Program from "../src/models/Program.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.production") });

function getRandomHexColor(existingColors = new Set()) {
  let color;
  do {
    color =
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
  } while (existingColors.has(color));
  existingColors.add(color);
  return color;
}

function normalize(str) {
  return str
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-zA-Z0-9]/g, "") // remove special characters
    .toLowerCase();
}

function getBestFuzzyMatch(input, candidates, maxRatio = 0.4) {
  const inputNorm = normalize(input);
  let bestMatch = null;
  let minDistance = Infinity;

  for (const candidate of candidates) {
    const candidateNorm = normalize(candidate.programName);
    const d = distance(inputNorm, candidateNorm);
    if (d < minDistance) {
      minDistance = d;
      bestMatch = candidate;
    }
  }

  const maxAllowed = Math.floor(inputNorm.length * maxRatio);
  return minDistance <= maxAllowed ? bestMatch : null;
}

const teachers = [
  { name: "Eva Nahi", email: "eva.nahi@mindful.se", programName: "Matematik" },
  {
    name: "Adelina Angel",
    email: "adelina.angel@mindful.se",
    programName: "Försäljning och service",
  },
  {
    name: "Anes Music",
    email: "anes.music@mindful.se",
    programName: "Försäljning och service",
  },
  {
    name: "Mirsada Hodzic",
    email: "mirsada.hodzic@mindful.se",
    programName: "Barn och fritid",
  },
  {
    name: "Hanna Finnbogason",
    email: "hanna.finnbogason@mindful.se",
    programName: "Barn och fritid",
  },
  {
    name: "Elham Pourmand",
    email: "elham.pourmand@mindful.se",
    programName: "Vård och omsorg",
  },
  {
    name: "Ulrika Ivemyr",
    email: "ulrika.ivemyr@mindful.se",
    programName: "Vård och omsorg",
  },
  {
    name: "Jonathan Mattsson",
    email: "jonathan.mattsson@mindful.se",
    programName: "Samhällskunskap",
  },
  {
    name: "Iman Renno",
    email: "iman.renno@mindful.se",
    programName: "Svenska som andraspråk",
  },
  {
    name: "Allan Barhemat",
    email: "allan.barhemat@mindful.se",
    programName: "Svenska och Svenska som andraspråk",
  },
  {
    name: "Angelina Karlsson",
    email: "angelina.karlsson@mindful.se",
    programName: "Engelska",
  },
];

async function createTeachersFromList() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    const allPrograms = await Program.find().lean();
    const plainPassword = "mindful"; // 🔐 Change in production
    const existingColors = new Set();

    for (const t of teachers) {
      const existingUser = await User.findOne({ email: t.email });
      if (existingUser) {
        console.log(
          `⚠️ Teacher with email ${t.email} already exists. Skipping.`
        );
        continue;
      }

      const matchedProgram = getBestFuzzyMatch(t.programName, allPrograms);
      if (!matchedProgram) {
        console.warn(
          `❌ No program matched for "${t.programName}". Skipping ${t.name}.`
        );
        continue;
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 12);

      const user = new User({
        username: t.name,
        email: t.email,
        password: hashedPassword,
        role: "teacher",
      });

      await user.save();

      const teacher = new Teacher({
        userId: user._id,
        programId: matchedProgram._id,
        colorCode: getRandomHexColor(existingColors),
      });

      await teacher.save();

      console.log(
        `✅ Created teacher: ${t.name} → Program: ${matchedProgram.programName}`
      );
    }
  } catch (err) {
    console.error("❌ Error creating teachers:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  }
}

createTeachersFromList();
