const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const directTargets = [
  path.join(root, "node_modules", "@capacitor", "android", "capacitor", "build.gradle"),
  path.join(root, "android", "app", "capacitor.build.gradle"),
  path.join(root, "android", "capacitor-cordova-android-plugins", "build.gradle"),
];

const capacitorPluginsDir = path.join(root, "node_modules", "@capacitor");
const pluginTargets = fs.existsSync(capacitorPluginsDir)
  ? fs
      .readdirSync(capacitorPluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(capacitorPluginsDir, entry.name, "android", "build.gradle"))
  : [];

const targets = Array.from(new Set([...directTargets, ...pluginTargets]));

for (const filePath of targets) {
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const patched = original.replaceAll("JavaVersion.VERSION_21", "JavaVersion.VERSION_17");

  if (patched !== original) {
    fs.writeFileSync(filePath, patched, "utf8");
    console.log(`patched ${path.relative(root, filePath)}`);
  }
}