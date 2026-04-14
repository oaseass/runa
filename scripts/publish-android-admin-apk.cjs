const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "android", "app", "build", "outputs", "apk", "admin", "debug", "app-admin-debug.apk");
const targetDir = path.join(root, "public", "downloads");
const targetPath = path.join(targetDir, "luna-admin-android-latest.apk");

if (!fs.existsSync(sourcePath)) {
  throw new Error(`APK not found at ${sourcePath}`);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);
console.log(`published admin APK to ${targetPath}`);