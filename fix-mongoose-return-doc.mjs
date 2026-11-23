import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const TARGET_DIRS = ["backend/src", "backend/tests"];
const EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts"]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(fullPath, files);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function replaceNewOption(source) {
  let count = 0;

  // Matches `new: true` or `new: false` as a property key (not preceded by `.` or identifier chars)
  const updated = source.replace(
    /(?<![A-Za-z0-9_$.])\bnew\s*:\s*(true|false)\b/g,
    (_match, boolVal) => {
      count += 1;
      const docMode = boolVal === "true" ? "'after'" : "'before'";
      return `returnDocument: ${docMode}`;
    }
  );

  return { updated, count };
}

let totalFiles = 0;
let totalReplacements = 0;

for (const dir of TARGET_DIRS) {
  for (const filePath of walk(dir)) {
    const original = fs.readFileSync(filePath, "utf8");
    const { updated, count } = replaceNewOption(original);
    if (count > 0) {
      totalFiles += 1;
      totalReplacements += count;
      console.log(
        `${DRY_RUN ? "[dry-run] " : ""}${filePath}: ${count} replacement(s)`
      );
      if (!DRY_RUN) {
        fs.writeFileSync(filePath, updated, "utf8");
      }
    }
  }
}

console.log(
  `\n${DRY_RUN ? "Would update" : "Updated"} ${totalReplacements} occurrence(s) across ${totalFiles} file(s).`
);
