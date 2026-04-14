const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "..", "src", "config", "android-update.json");
const current = JSON.parse(fs.readFileSync(filePath, "utf8"));

const versionCode = Number(current.versionCode || 1) + 1;
const [majorRaw = "1", minorRaw = "0", patchRaw = "0"] = String(current.versionName || "1.0.0").split(".");
const major = Number(majorRaw) || 1;
const minor = Number(minorRaw) || 0;
const patch = (Number(patchRaw) || 0) + 1;

const next = {
  ...current,
  enabled: true,
  versionCode,
  versionName: `${major}.${minor}.${patch}`,
  publishedAt: new Date().toISOString(),
};

fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`android update bumped to ${next.versionName} (${next.versionCode})`);