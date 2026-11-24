/**
 * Injecte de manière idempotente le widget natif "Texte du Jour", le MainActivity personnalisé
 * et la configuration de signature/versioning dans le projet Android généré par Capacitor.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NATIVE_ANDROID = path.join(ROOT, "native", "android");
const ANDROID_MAIN = path.join(ROOT, "android", "app", "src", "main");
const BUILD_GRADLE = path.join(ROOT, "android", "app", "build.gradle");
const PKG_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((entry) => {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(ANDROID_MAIN)) {
  console.error("[DFWol] Erreur : le dossier android/app/src/main est introuvable. Lancez d'abord 'npx cap add android'.");
  process.exit(1);
}

// 1. Copier les sources Java et ressources XML/Drawable
copyRecursiveSync(path.join(NATIVE_ANDROID, "java"), path.join(ANDROID_MAIN, "java"));
copyRecursiveSync(path.join(NATIVE_ANDROID, "res"), path.join(ANDROID_MAIN, "res"));
console.log("[DFWol] Sources Java et ressources du Widget copiées dans android/app/src/main.");

// 2. Injecter le <receiver> du widget dans AndroidManifest.xml
const manifestPath = path.join(ANDROID_MAIN, "AndroidManifest.xml");
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, "utf8");
  if (!manifest.includes("DailyTextWidgetProvider")) {
    const receiverBlock = `
        <receiver
            android:name=".DailyTextWidgetProvider"
            android:exported="true"
            android:label="DFWol — Texte du Jour">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="org.dfwol.app.ACTION_REFRESH_DAILY_TEXT_WIDGET" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/daily_text_widget_info" />
        </receiver>
    </application>`;
    manifest = manifest.replace("</application>", receiverBlock);
    fs.writeFileSync(manifestPath, manifest, "utf8");
    console.log("[DFWol] Receiver DailyTextWidgetProvider injecté dans AndroidManifest.xml.");
  }
}

// 3. Configurer versionCode, versionName et signature release dans android/app/build.gradle
if (fs.existsSync(BUILD_GRADLE)) {
  let gradle = fs.readFileSync(BUILD_GRADLE, "utf8");
  const versionCode = process.env.ANDROID_VERSION_CODE || "1";
  const versionName = process.env.ANDROID_VERSION_NAME || PKG_JSON.version || "3.0.0";

  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);

  if (!gradle.includes("DFWOL_SIGNING_CONFIG")) {
    const signingBlock = `
    // DFWOL_SIGNING_CONFIG
    signingConfigs {
        release {
            if (System.getenv("KEYSTORE_FILE")) {
                storeFile file(System.getenv("KEYSTORE_FILE"))
                storePassword System.getenv("KEYSTORE_PASSWORD")
                keyAlias System.getenv("KEY_ALIAS")
                keyPassword System.getenv("KEY_PASSWORD")
            }
        }
    }
    buildTypes {`;
    gradle = gradle.replace(/buildTypes\s*\{/, signingBlock);

    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{)/,
      `$1\n            if (System.getenv("KEYSTORE_FILE")) { signingConfig signingConfigs.release }`
    );
  }

  fs.writeFileSync(BUILD_GRADLE, gradle, "utf8");
  console.log(`[DFWol] build.gradle mis à jour (versionCode=${versionCode}, versionName=${versionName}).`);
}
