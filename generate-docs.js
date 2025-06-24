// generate-docs.js
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import { glob } from "glob";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const model = "gpt-3.5-turbo-1106";
const sourceDir = "./backend/src";
const outputDir = "./annotated-docs";

async function annotateFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");

  const prompt = `Add full JSDoc docstrings to all functions, exports, and route handlers in the following JavaScript file. Keep code unchanged other than the comments. Return the complete annotated file:\n\n${content}`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are an expert at writing clean JSDoc comments.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
  });

  const annotated = completion.choices[0].message.content;

  const outFilePath = path.join(
    outputDir,
    path.basename(filePath).replace(/\.js$/, ".annotated.js")
  );
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outFilePath, annotated);

  console.log(`✅ Annotated: ${filePath} → ${outFilePath}`);
}

async function run() {
  const files = await glob(`${sourceDir}/**/*.js`, { absolute: true });
  console.log(`📁 Found ${files.length} JS files.`);

  for (const file of files) {
    try {
      await annotateFile(file);
    } catch (err) {
      console.error(`❌ Failed to annotate ${file}:`, err.message);
    }
  }
}

run();
