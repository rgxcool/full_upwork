import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import Teacher from "../src/models/Teacher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.production") });

// 🎨 10 distinct, colorblind-friendly hex colors
const distinctColors = [
  "#1F77B4", // blue
  "#FF7F0E", // orange
  "#2CA02C", // green
  "#D62728", // red
  "#9467BD", // purple
  "#8C564B", // brown
  "#E377C2", // pink
  "#7F7F7F", // gray
  "#BCBD22", // yellow-green
  "#17BECF", // cyan
];

function getNextDistinctColor(index) {
  return distinctColors[index % distinctColors.length];
}

// 🧑‍🏫 Teachers list with subject
const teachers = [
  { name: "Eva Nahi", email: "eva.nahi@mindful.se", subject: "Matematik" },
  {
    name: "Adelina Angel",
    email: "adelina.angel@mindful.se",
    subject: "Försäljning och service",
  },
  {
    name: "Anes Music",
    email: "anes.music@mindful.se",
    subject: "Försäljning och service",
  },
  {
    name: "Mirsada Hodzic",
    email: "mirsada.hodzic@mindful.se",
    subject: "Barn och fritid",
  },
  {
    name: "Hanna Finnbogason",
    email: "hanna.finnbogason@mindful.se",
    subject: "Barn och fritid",
  },
  {
    name: "Elham Pourmand",
    email: "elham.pourmand@mindful.se",
    subject: "Vård och omsorg",
  },
  {
    name: "Ulrika Ivemyr",
    email: "ulrika.ivemyr@mindful.se",
    subject: "Vård och omsorg",
  },
  {
    name: "Jonathan Mattsson",
    email: "jonathan.mattsson@mindful.se",
    subject: "Samhällskunskap",
  },
  {
    name: "Iman Renno",
    email: "iman.renno@mindful.se",
    subject: "Svenska som andraspråk",
  },
  {
    name: "Allan Barhemat",
    email: "allan.barhemat@mindful.se",
    subject: "Svenska och Svenska som andraspråk",
  },
  {
    name: "Angelina Karlsson",
    email: "angelina.karlsson@mindful.se",
    subject: "Engelska",
  },
];

async function createTeachersFromList() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    const plainPassword = "mindful"; // 🔐 Change in production

    for (let i = 0; i < teachers.length; i++) {
      const t = teachers[i];
      const existingUser = await User.findOne({ email: t.email });
      if (existingUser) {
        console.log(
          `⚠️ Teacher with email ${t.email} already exists. Skipping.`
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
        subject: t.subject,
        colorCode: getNextDistinctColor(i),
      });

      await teacher.save();

      console.log(
        `✅ Created teacher: ${t.name} (${t.email}) - ${t.subject} - ${teacher.colorCode}`
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
