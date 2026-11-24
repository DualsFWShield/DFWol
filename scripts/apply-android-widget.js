/**
 * Injecte de manière idempotente le widget natif "Texte du Jour", le MainActivity personnalisé
 * et la configuration de signature/versioning dans le projet Android généré par Capacitor.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NATIVE_ANDROID = path.join(ROOT, "native", "android");
const NATIVE_JAVA = path.join(NATIVE_ANDROID, "java");
const NATIVE_RES_XML = path.join(NATIVE_ANDROID, "res", "xml", "daily_text_widget_info.xml");
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

if (!fs.existsSync(NATIVE_JAVA) || !fs.existsSync(NATIVE_RES_XML)) {
  console.error("[DFWol] Erreur critique : les sources du widget dans native/android/ sont manquantes !");
  console.error("  Attendu :", NATIVE_JAVA);
  console.error("  Attendu :", NATIVE_RES_XML);
  process.exit(1);
}

if (!fs.existsSync(ANDROID_MAIN)) {
  console.error("[DFWol] Erreur : le dossier android/app/src/main est introuvable. Lancez d'abord 'npx cap add android'.");
  process.exit(1);
}

// 1. Nettoyer d'abord les icônes par défaut de Capacitor (ic_launcher*) pour éviter tout conflit AAPT2 (.webp/.png)
const androidResDir = path.join(ANDROID_MAIN, "res");
if (fs.existsSync(androidResDir)) {
  fs.readdirSync(androidResDir).forEach((sub) => {
    if (sub.startsWith("mipmap-") || sub.startsWith("drawable")) {
      const subPath = path.join(androidResDir, sub);
      if (fs.statSync(subPath).isDirectory()) {
        fs.readdirSync(subPath).forEach((file) => {
          if (file.startsWith("ic_launcher")) {
            fs.rmSync(path.join(subPath, file), { force: true });
          }
        });
      }
    }
  });
}

// 2. Copier les sources Java et ressources XML/Drawable/Mipmap
copyRecursiveSync(NATIVE_JAVA, path.join(ANDROID_MAIN, "java"));
copyRecursiveSync(path.join(NATIVE_ANDROID, "res"), androidResDir);

const requiredPaths = [
  path.join(ANDROID_MAIN, "res", "xml", "daily_text_widget_info.xml"),
  path.join(ANDROID_MAIN, "res", "drawable", "ic_launcher_monochrome.xml"),
  path.join(ANDROID_MAIN, "res", "drawable", "ic_stat_dfwol.xml"),
  path.join(ANDROID_MAIN, "res", "mipmap-anydpi-v26", "ic_launcher.xml"),
  path.join(ANDROID_MAIN, "res", "mipmap-xxxhdpi", "ic_launcher.png"),
  path.join(ANDROID_MAIN, "res", "mipmap-xxxhdpi", "ic_launcher_foreground.png"),
  path.join(ANDROID_MAIN, "java", "org", "dfwol", "app", "NeuralTtsPlugin.java")
];
for (const reqPath of requiredPaths) {
  if (!fs.existsSync(reqPath)) {
    console.error("[DFWol] Erreur : ressource/source critique introuvable après copie ->", reqPath);
    process.exit(1);
  }
}
console.log("[DFWol] Sources Java (Widget + NeuralTTS) et icônes/ressources copiées et vérifiées.");

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
