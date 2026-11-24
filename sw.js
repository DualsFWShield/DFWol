/* ==========================================================================
   DFWol Studio v3 — Service Worker PWA (Cache Hors-Ligne & Support Web Widgets)
   ========================================================================== */

const CACHE_NAME = "dfwol-studio-cache-v10";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/net-client.js",
  "./js/bible-data.js",
  "./js/search-engine.js",
  "./js/audio-player.js",
  "./js/reader-engine.js",
  "./js/video-studio.js",
  "./js/media-export.js",
  "./js/ai-assistant.js",
  "./js/library-hub.js",
  "./js/daily-text-widget.js",
  "./js/app.js",
  "./assets/icon.svg",
  "./assets/favicon-32.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/daily-text-widget-template.json",
  "./assets/daily-text-widget-data.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Ne jamais mettre en cache l'endpoint proxy/tts local ou les flux vidéo/audio volumineux
  if (url.pathname.startsWith("/api/proxy") || url.pathname.startsWith("/api/tts") || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes.clone()));
        }
        return networkRes;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener("widgetinstall", (event) => {
  event.waitUntil(updatePwaWidget(event.widget));
});

self.addEventListener("widgetresume", (event) => {
  event.waitUntil(updatePwaWidget(event.widget));
});

self.addEventListener("widgetclick", (event) => {
  event.waitUntil(clients.openWindow("./index.html?open=daily-text"));
});

async function updatePwaWidget(widget) {
  if (!self.widgets) return;
  try {
    const templateRes = await caches.match("./assets/daily-text-widget-template.json");
    const dataRes = await caches.match("./assets/daily-text-widget-data.json");
    if (!templateRes || !dataRes) return;
    const template = await templateRes.text();
    const data = await dataRes.text();
    await self.widgets.updateByTag(widget.definition.tag, { template, data });
  } catch (_) {}
}
