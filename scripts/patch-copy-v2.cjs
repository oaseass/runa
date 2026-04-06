// Patch: replace CAT_COPY block only (start inclusive, end exclusive)
const fs   = require("fs");
const path = require("path");

const FILE   = path.join(__dirname, "../src/app/calendar/page.tsx");
const BLOCK  = path.join(__dirname, "calendar-copy-v2.txt");

const src    = fs.readFileSync(FILE, "utf8");
const block  = fs.readFileSync(BLOCK, "utf8");

const START  = "const CAT_COPY: Record<Category, CopyVariants> = {";
const END    = "// \u2500\u2500 Aspect context classifier";

const si = src.indexOf(START);
const ei = src.indexOf(END);

if (si === -1 || ei === -1) {
  console.error("markers not found", { si, ei });
  process.exit(1);
}

const result = src.slice(0, si) + block + src.slice(ei);
fs.writeFileSync(FILE, result, "utf8");
console.log("OK \u2013 replaced", ei - si, "chars");
