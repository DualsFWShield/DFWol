# DFWol — JW.org × WOL.jw.org (FR & EN • PWA & Capacitor Android)

**DFWol** combine **JW.org** et la **Bibliothèque en ligne (WOL)** dans une interface fidèle à l'apparence officielle de `jw.org` (`#4a6da7`, `#f1f1f1`, `#ffffff`, `#292929`, `Noto Sans`), utilisable sur **PC, Tablette et Mobile** en **PWA** et en application **Android Capacitor** avec **Widget Texte du jour**.

---

## ✨ Fonctionnalités Principales

- **🎨 Apparence JW.org authentique** : bandeau blanc supérieur avec carré bleu `#4a6da7`, barre de navigation `#292929`, mode clair par défaut et mode sombre officiel JW.org.
- **🔍 Recherche Totale** : API JW.org (`videos`, `publications`, `bible`, `audio`, `indexes`, `all`) + opérateurs booléens WOL (`&`, `|`, `!`, `"..."`, `*`, `#`).
- **📖 Bible Intégrée & Guide de Recherche en Lot** : lecture des 66 livres (FR, EN ou Parallèle FR/EN), audio officiel MP3, extraction automatique du *Guide de recherche* par verset ou en lot avec Playlist Audio et compilation de dossier.
- **🎬 Vidéos & Extracteur de Sous-titres** : lecture MP4 intégrée avec sous-titres synchronisés FR/EN, recherche dans les dialogues, export `.VTT` / `.SRT` / `.TXT` et extraction des versets cités.
- **📚 Lecteur de Publications Intégré** : lecture complète avec MP3 officiel ou TTS, bascule FR ↔ EN et aperçu *Scripture Peek* sur tout verset cliqué.
- **🗓️ Texte du Jour Multi-Niveaux & Widgets** : résumés en **1 Mot**, **1 Phrase**, **Petit Paragraphe** et **Texte complet** synchronisés avec le Widget Android natif et le Widget PWA.

---

## 🚀 Lancement Local (Windows — Proxy WOL inclus)

Double-cliquez sur **`Lancer-DFWol.bat`** (ou exécutez `powershell -ExecutionPolicy Bypass -File start-dfwol.ps1`).  
L'application s'ouvre sur `http://localhost:8080` avec le proxy WOL sécurisé intégré.

---

## 🤖 GitHub Actions : APK, AAB & GitHub Pages

### 1. Déploiement automatique GitHub Pages (`.github/workflows/deploy-pages.yml`)
1. Poussez ce dépôt sur GitHub (branche `main` ou `master`).
2. Allez dans **Settings → Pages → Build and deployment → Source** et sélectionnez **GitHub Actions**.
3. À chaque `push` (ou lancement manuel `workflow_dispatch`), le dossier `www/` (avec `.nojekyll`) est déployé automatiquement.

### 2. Génération automatique APK & AAB Android (`.github/workflows/build-android.yml`)
À chaque `push` sur `main`/`master`, tag `v*` ou lancement manuel, le workflow :
- installe Capacitor (`npm install`), génère le projet Android (`npx cap add android`), injecte automatiquement le widget natif depuis `native/android/` (`scripts/apply-android-widget.js`) et compile :
  - `DFWol-debug.apk`
  - `DFWol-release.apk`
  - `DFWol-release.aab` (Android App Bundle pour Google Play)
- publie les 3 fichiers dans l'artefact `dfwol-android-apk-aab` (et en **GitHub Release** si vous poussez un tag `v3.0.0`).

#### Secrets GitHub optionnels (pour signer avec votre propre Keystore Play Store)
Sans secrets, le workflow génère un keystore CI afin que l'APK/AAB Release soit toujours signé et installable. Pour utiliser votre propre keystore de production, ajoutez dans **Settings → Secrets and variables → Actions** :
- `ANDROID_KEYSTORE_BASE64` (contenu du `.jks`/`.keystore` encodé en Base64)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
