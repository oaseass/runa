// Simple patcher: replaces from START_MARKER to END_MARKER in calendar/page.tsx
const fs   = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "../src/app/calendar/page.tsx");
const src  = fs.readFileSync(FILE, "utf8");

const START_MARKER = "type DayScore = {";
// End marker is the Transit section comment
const END_SEARCH = "// \u2500\u2500 Transit \u2192 Category derivation";

const si = src.indexOf(START_MARKER);
const ei = src.indexOf(END_SEARCH);

if (si === -1 || ei === -1) {
  console.error("markers not found", { si, ei });
  process.exit(1);
}

// Read the replacement block from the companion file
const BLOCK_FILE = path.join(__dirname, "calendar-copy-block.txt");
const block = fs.readFileSync(BLOCK_FILE, "utf8");

const result = src.slice(0, si) + block + src.slice(ei);
fs.writeFileSync(FILE, result, "utf8");
console.log("OK – replaced", ei - si, "chars");
