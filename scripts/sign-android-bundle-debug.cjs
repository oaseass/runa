const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const target = process.argv[2];

if (!target || !["consumer", "admin"].includes(target)) {
  throw new Error("usage: node scripts/sign-android-bundle-debug.cjs <consumer|admin>");
}

const sourceName = target === "consumer" ? "app-consumer-release.aab" : "app-admin-release.aab";
const sourceDir = target === "consumer" ? "consumerRelease" : "adminRelease";
const sourcePath = path.join(root, "android", "app", "build", "outputs", "bundle", sourceDir, sourceName);
const downloadsDir = path.join(root, "public", "downloads");
const targetPath = path.join(downloadsDir, `luna-${target}-internal-signed.aab`);
const debugKeystore = path.join(os.homedir(), ".android", "debug.keystore");

if (!fs.existsSync(sourcePath)) {
  throw new Error(`AAB not found at ${sourcePath}`);
}

if (!fs.existsSync(debugKeystore)) {
  throw new Error(`debug keystore not found at ${debugKeystore}`);
}

fs.mkdirSync(downloadsDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

const result = spawnSync(
  process.platform === "win32" ? "jarsigner.exe" : "jarsigner",
  [
    "-keystore",
    debugKeystore,
    "-storepass",
    "android",
    "-keypass",
    "android",
    targetPath,
    "androiddebugkey",
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  throw new Error(`jarsigner failed with exit code ${result.status ?? -1}`);
}

console.log(`signed internal AAB written to ${targetPath}`);