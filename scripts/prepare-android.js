/**
 * Prépare la plateforme Android complète de façon idempotente :
 * 1) npx cap add android (si android/gradlew absent)
 * 2) injecte le widget natif (apply-android-widget.js)
 * 3) npx cap sync android
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GRADLEW = path.join(ROOT, "android", "gradlew");

function run(cmd) {
  console.log(`[DFWol] > ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

if (!fs.existsSync(GRADLEW)) {
  run("npx cap add android");
}

run("node scripts/apply-android-widget.js");
run("npx cap sync android");
