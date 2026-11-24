/**
 * Script Node.js utilitaire pour synchroniser les fichiers Web vers le dossier www/
 * utilisé par Capacitor et GitHub Pages.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WWW = path.join(ROOT, "www");

const ITEMS_TO_COPY = [
  "index.html",
  "manifest.json",
  "sw.js",
  "css",
  "js",
  "assets"
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(WWW)) {
  fs.rmSync(WWW, { recursive: true, force: true });
}
fs.mkdirSync(WWW, { recursive: true });

ITEMS_TO_COPY.forEach((item) => {
  copyRecursiveSync(path.join(ROOT, item), path.join(WWW, item));
});

// Garantit le service brut sur GitHub Pages
fs.writeFileSync(path.join(WWW, ".nojekyll"), "", "utf8");

console.log("[DFWol] Dossier www/ nettoyé et synchronisé avec succès (.nojekyll inclus).");
