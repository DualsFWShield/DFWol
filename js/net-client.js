/* ==========================================================================
   DFWol Studio — Couche Réseau Universelle (JW.org APIs + Proxy Cascade Anti-Blocage)
   Circuit-Breaker par proxy, validation HTML WOL stricte, cache LRU 30 pages
   ========================================================================== */

window.DFWolNet = (function () {
  "use strict";

  const CUSTOM_PROXY_KEY = "dfwol_custom_proxy_url";
  const JW_TOKEN_URL = "https://b.jw-cdn.org/tokens/jworg.jwt";
  const MEDIATOR_BASE = "https://b.jw-cdn.org/apis/mediator/v1";
  const PUBMEDIA_BASE = "https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS";

  let cachedJwt = null;
  let cachedJwtTime = 0;
  const JWT_TTL_MS = 10 * 60 * 1000;

  // Cache LRU en mémoire (max 30 pages valides)
  const MAX_LRU_ENTRIES = 30;
  const htmlMemoryCache = new Map();

  // Circuit-breaker : map proxyName -> timestamp d'expiration du cooldown
  const proxyCooldowns = new Map();

  function getLangLetter(langCode) {
    return langCode === "en" ? "E" : "F";
  }

  function getCustomProxyBase() {
    try {
      return (localStorage.getItem(CUSTOM_PROXY_KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function setCustomProxyBase(url) {
    try {
      const clean = (url || "").trim();
      if (clean) localStorage.setItem(CUSTOM_PROXY_KEY, clean);
      else localStorage.removeItem(CUSTOM_PROXY_KEY);
    } catch (_) {}
  }

  const ALLOWED_WOL_HOSTS = new Set([
    "wol.jw.org",
    "www.jw.org",
    "jw.org",
    "b.jw-cdn.org",
    "cfp.jw-cdn.org",
    "cfp2.jw-cdn.org",
    "cms-imgp.jw-cdn.org",
    "pubmedia.jw-cdn.org",
    "download-a.akamaihd.net",
    "d34ji3l0qn3w2t.cloudfront.net",
    "assetsnffrgf-a.akamaihd.net"
  ]);

  function isNativeCapacitor() {
    return Boolean(
      typeof window !== "undefined" &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === "function" &&
        window.Capacitor.isNativePlatform()
    );
  }

  function isLocalhost() {
    return (
      typeof window !== "undefined" &&
      (window.location.protocol === "http:" || window.location.protocol === "https:") &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    );
  }

  function isLocalServerProxyAvailable() {
    // Dans l'app Capacitor Android, window.location est https://localhost mais il n'y a pas de serveur /api/proxy !
    return !isNativeCapacitor() && isLocalhost();
  }

  function isAllowedUpstreamUrl(url) {
    try {
      const u = new URL(String(url || "").trim());
      return u.protocol === "https:" && ALLOWED_WOL_HOSTS.has(u.hostname.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  function isProxyInCooldown(name) {
    const until = proxyCooldowns.get(name);
    if (!until) return false;
    if (Date.now() > until) {
      proxyCooldowns.delete(name);
      return false;
    }
    return true;
  }

  function markProxyCooldown(name, durationMs = 180000) {
    proxyCooldowns.set(name, Date.now() + durationMs);
  }

  /**
   * Valide qu'une réponse HTML provient bien de WOL.jw.org et non d'une page 429/401/Cloudflare
   * ni de l'application DFWol elle-même (anti auto-emboîtement).
   */
  function isValidWolHtml(html) {
    if (!html || typeof html !== "string" || html.length < 250) return false;
    if (/id=["']app-shell["']|id=["']omnibar-form["']|js\/reader-engine\.js|DFWol — JW\.org/i.test(html.slice(0, 8000))) {
      return false;
    }
    if (/Just a moment\.\.\.|Attention Required! \| Cloudflare|Too Many Requests|Error 1015|Access Denied/i.test(html.slice(0, 2500))) {
      return false;
    }
    return /<article[^>]+id=["']article["']|class=["'][^"']*(?:scalableui|bodyTxt|themeScrp|ref-rsg|todayItems|navCard|results)|id=["']materialNav["']|span[^>]+id=["']v\d+-\d+-/i.test(
      html
    );
  }

  function setLruCache(key, value) {
    if (htmlMemoryCache.has(key)) htmlMemoryCache.delete(key);
    htmlMemoryCache.set(key, value);
    if (htmlMemoryCache.size > MAX_LRU_ENTRIES) {
      const oldestKey = htmlMemoryCache.keys().next().value;
      htmlMemoryCache.delete(oldestKey);
    }
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJwSearchToken(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedJwt && now - cachedJwtTime < JWT_TTL_MS) {
      return cachedJwt;
    }
    const resp = await fetchWithTimeout(JW_TOKEN_URL, {}, 8000);
    if (!resp.ok) {
      throw new Error(`Impossible d'obtenir le jeton JW.org (${resp.status})`);
    }
    const token = (await resp.text()).trim();
    if (!token) throw new Error("Jeton JW.org vide");
    cachedJwt = token;
    cachedJwtTime = now;
    return token;
  }

  async function jwSearch(slug = "all", query = "", lang = "fr", limit = 24, offset = 0) {
    const q = (query || "").trim();
    if (!q) return { results: [], total: null };
    const langLetter = getLangLetter(lang);
    const safeSlug = slug || "all";
    const endpoint = `https://b.jw-cdn.org/apis/search/results/${langLetter}/${encodeURIComponent(safeSlug)}?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`;

    let token = await getJwSearchToken(false);
    let resp = await fetchWithTimeout(endpoint, { headers: { Authorization: `Bearer ${token}` } }, 10000);

    if (resp.status === 401) {
      token = await getJwSearchToken(true);
      resp = await fetchWithTimeout(endpoint, { headers: { Authorization: `Bearer ${token}` } }, 10000);
    }

    if (!resp.ok) {
      throw new Error(`Erreur recherche JW.org (${resp.status})`);
    }
    return await resp.json();
  }

  async function mediatorGet(path) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    const url = `${MEDIATOR_BASE}/${cleanPath}`;
    const resp = await fetchWithTimeout(url, {}, 10000);
    if (!resp.ok) throw new Error(`Erreur Mediator (${resp.status})`);
    return await resp.json();
  }

  async function pubMediaGet(paramsObj = {}) {
    const params = new URLSearchParams(Object.assign({ output: "json", alllangs: "0" }, paramsObj));
    const url = `${PUBMEDIA_BASE}?${params.toString()}`;
    const resp = await fetchWithTimeout(url, {}, 10000);
    if (!resp.ok) throw new Error(`Erreur PubMedia (${resp.status})`);
    return await resp.json();
  }

  async function getBibleAudio(bookNum, lang = "fr") {
    const langLetter = getLangLetter(lang);
    try {
      const data = await pubMediaGet({
        pub: "nwt",
        fileformat: "MP3",
        langwritten: langLetter,
        booknum: String(bookNum),
        txtCMSLang: langLetter
      });
      return (data && data.files && data.files[langLetter] && data.files[langLetter].MP3) || [];
    } catch (_) {
      return [];
    }
  }

  async function getArticleAudioByDocId(docId, lang = "fr") {
    if (!docId) return null;
    const langLetter = getLangLetter(lang);
    try {
      const data = await pubMediaGet({
        docid: String(docId),
        fileformat: "MP3",
        langwritten: langLetter,
        txtCMSLang: langLetter
      });
      const tracks = (data && data.files && data.files[langLetter] && data.files[langLetter].MP3) || [];
      if (!tracks.length) return null;
      const exact = tracks.find((t) => String(t.docid) === String(docId));
      return exact || tracks[0];
    } catch (_) {
      return null;
    }
  }

  async function fetchTextDirect(url) {
    try {
      const resp = await fetchWithTimeout(url, {}, 10000);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        return new TextDecoder("utf-8").decode(buf);
      }
    } catch (_) {}

    const res = await fetchWolHtml(url, { skipCache: true, skipValidation: true });
    return res.html;
  }

  function extractDocIdFromUrlOrHtml(url, html = "") {
    if (url) {
      const mPath = String(url).match(/\/wol\/d\/r\d+\/lp-[a-z]+\/(\d+)/i);
      if (mPath) return mPath[1];
      const mParam = String(url).match(/[?&]docid=(\d+)/i);
      if (mParam) return mParam[1];
    }
    if (html) {
      const mInput = html.match(/id=["']docId["'][^>]*value=["'](\d+)["']/i) || html.match(/data-docid=["'](\d+)["']/i);
      if (mInput) return mInput[1];
      const mCanon = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'][^"']*\/(\d+)(?:[#?"']|$)/i);
      if (mCanon) return mCanon[1];
    }
    return null;
  }

  function decodeResponseBuffer(buf) {
    return new TextDecoder("utf-8").decode(buf);
  }

  function getPublicProxyPool() {
    const pool = [
      {
        name: "allorigins-raw",
        build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        parse: async (resp, origUrl) => {
          const buf = await resp.arrayBuffer();
          return { html: decodeResponseBuffer(buf), finalUrl: resp.headers.get("X-Final-Url") || origUrl };
        }
      },
      {
        name: "codetabs",
        build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        parse: async (resp, origUrl) => {
          const buf = await resp.arrayBuffer();
          return { html: decodeResponseBuffer(buf), finalUrl: origUrl };
        }
      },
      {
        name: "allorigins-get",
        build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
        parse: async (resp, origUrl) => {
          const json = await resp.json();
          return {
            html: json.contents || "",
            finalUrl: (json.status && json.status.url) || origUrl
          };
        }
      },
      {
        name: "cors.lol",
        build: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
        parse: async (resp, origUrl) => {
          const buf = await resp.arrayBuffer();
          return { html: decodeResponseBuffer(buf), finalUrl: origUrl };
        }
      }
    ];

    if (isLocalhost()) {
      pool.push({
        name: "corsproxy.io",
        build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
        parse: async (resp, origUrl) => {
          const buf = await resp.arrayBuffer();
          return { html: decodeResponseBuffer(buf), finalUrl: origUrl };
        }
      });
    }

    return pool;
  }

  async function tryPublicProxy(proxyDef, targetUrl, skipValidation = false) {
    const resp = await fetchWithTimeout(proxyDef.build(targetUrl), {}, 7500);
    if (resp.status === 401 || resp.status === 403 || resp.status === 429) {
      markProxyCooldown(proxyDef.name, resp.status === 429 ? 120000 : 300000);
      throw new Error(`${proxyDef.name}: HTTP ${resp.status}`);
    }
    if (!resp.ok) {
      markProxyCooldown(proxyDef.name, 60000);
      throw new Error(`${proxyDef.name}: HTTP ${resp.status}`);
    }
    const parsed = await proxyDef.parse(resp, targetUrl);
    if (!parsed.html || (!skipValidation && !isValidWolHtml(parsed.html))) {
      throw new Error(`${proxyDef.name}: réponse non-WOL`);
    }
    return {
      html: parsed.html,
      finalUrl: parsed.finalUrl || targetUrl,
      docId: extractDocIdFromUrlOrHtml(parsed.finalUrl || targetUrl, parsed.html),
      source: proxyDef.name
    };
  }

  /**
   * Récupère le HTML d'une URL WOL.jw.org sans jamais bloquer après 1-2 articles :
   * 1) CapacitorHttp natif
   * 2) Proxy local intégré (/api/proxy?url=...)
   * 3) Proxy personnalisé utilisateur (Cloudflare Worker)
   * 4) Course parallèle contrôlée avec Circuit-Breaker sur les proxies publics + 2ème vague
   */
  async function fetchWolHtml(targetUrl, options = {}) {
    const cleanUrl = String(targetUrl || "").trim();
    if (!cleanUrl) throw new Error("URL cible manquante");
    if (!isAllowedUpstreamUrl(cleanUrl)) {
      throw new Error("URL non autorisée pour le lecteur interne (hôte externe ou local).");
    }

    if (!options.skipCache && htmlMemoryCache.has(cleanUrl)) {
      const cached = htmlMemoryCache.get(cleanUrl);
      // Rafraîchit l'ordre LRU
      setLruCache(cleanUrl, cached);
      return cached;
    }

    let result = null;

    // 1. CapacitorHttp Natif (Android / iOS)
    try {
      const capHttp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
      if (capHttp && typeof capHttp.get === "function") {
        const res = await capHttp.get({
          url: cleanUrl,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DFWolStudio/3.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
          }
        });
        if (res && res.status >= 200 && res.status < 400 && res.data) {
          const html = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
          if (options.skipValidation || isValidWolHtml(html)) {
            const finalUrl = res.url || cleanUrl;
            result = {
              html,
              finalUrl,
              docId: extractDocIdFromUrlOrHtml(finalUrl, html),
              source: "capacitor-http"
            };
          }
        }
      }
    } catch (_) {}

    // 2. Proxy local intégré (/api/proxy?url=...)
    if (!result && isLocalServerProxyAvailable()) {
      try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(cleanUrl)}`;
        const resp = await fetchWithTimeout(proxyUrl, {}, 12000);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const html = decodeResponseBuffer(buf);
          if (html && (options.skipValidation || isValidWolHtml(html))) {
            const finalUrl = resp.headers.get("X-Final-Url") || cleanUrl;
            result = {
              html,
              finalUrl,
              docId: extractDocIdFromUrlOrHtml(finalUrl, html),
              source: "local-proxy"
            };
          }
        }
      } catch (_) {}
    }

    // 3. Proxy personnalisé configuré par l'utilisateur (ex: Cloudflare Worker)
    const customBase = getCustomProxyBase();
    if (!result && customBase) {
      try {
        const proxyUrl = buildCustomProxyUrl(customBase, cleanUrl);
        const resp = await fetchWithTimeout(proxyUrl, {}, 12000);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const html = decodeResponseBuffer(buf);
          if (html && (options.skipValidation || isValidWolHtml(html))) {
            const finalUrl = resp.headers.get("X-Final-Url") || cleanUrl;
            result = {
              html,
              finalUrl,
              docId: extractDocIdFromUrlOrHtml(finalUrl, html),
              source: "custom-proxy"
            };
          }
        }
      } catch (_) {}
    }

    // 4. Course parallèle contrôlée sur le pool public (avec Circuit-Breaker)
    if (!result) {
      const pool = getPublicProxyPool();
      const activePool = pool.filter((p) => !isProxyInCooldown(p.name));
      const candidates = activePool.length > 0 ? activePool : pool;

      // Vague 1 : course parallèle sur les 2 premiers proxies disponibles
      const wave1 = candidates.slice(0, 2);
      try {
        result = await Promise.any(wave1.map((p) => tryPublicProxy(p, cleanUrl, options.skipValidation)));
      } catch (_) {}

      // Vague 2 : si la vague 1 échoue, tester les proxies restants
      if (!result && candidates.length > 2) {
        const wave2 = candidates.slice(2);
        try {
          result = await Promise.any(wave2.map((p) => tryPublicProxy(p, cleanUrl, options.skipValidation)));
        } catch (_) {}
      }
    }

    if (!result) {
      const err = new Error(
        "Limite temporaire des proxies publics sur le Web. Cliquez sur Réessayer ou configurez un mini-proxy Cloudflare Worker gratuit (30s) dans Étude individuelle → Paramètres."
      );
      err.isProxyRateLimit = true;
      throw err;
    }

    setLruCache(cleanUrl, result);
    return result;
  }

  async function fetchBlobWithProxyFallback(targetUrl, onProgress = null) {
    const cleanUrl = String(targetUrl || "").trim();
    if (!cleanUrl) throw new Error("URL manquante");

    const readStream = async (resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const contentLength = Number(resp.headers.get("Content-Length") || 0);
      if (!resp.body || typeof resp.body.getReader !== "function") {
        const blob = await resp.blob();
        if (onProgress) onProgress(100, blob.size, blob.size);
        return blob;
      }
      const reader = resp.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          if (onProgress) {
            const pct = contentLength > 0 ? Math.min(99, Math.round((loaded / contentLength) * 100)) : null;
            onProgress(pct, loaded, contentLength);
          }
        }
      }
      const mime = resp.headers.get("Content-Type") || "application/octet-stream";
      const blob = new Blob(chunks, { type: mime });
      if (onProgress) onProgress(100, loaded, contentLength || loaded);
      return blob;
    };

    try {
      const directResp = await fetch(cleanUrl, { mode: "cors" });
      return await readStream(directResp);
    } catch (_) {}

    if (isAllowedUpstreamUrl(cleanUrl)) {
      if (isLocalServerProxyAvailable()) {
        try {
          const resp = await fetch(`/api/proxy?url=${encodeURIComponent(cleanUrl)}`);
          return await readStream(resp);
        } catch (_) {}
      }
      const customBase = getCustomProxyBase();
      if (customBase) {
        const proxyUrl = buildCustomProxyUrl(customBase, cleanUrl);
        const resp = await fetch(proxyUrl);
        return await readStream(resp);
      }
    }

    throw new Error("Téléchargement CORS direct bloqué sur cet origine.");
  }

  function buildCustomProxyUrl(customBase, targetUrl) {
    const trimmed = String(customBase || "").trim();
    if (!trimmed) return "";
    if (trimmed.includes("{url}")) return trimmed.replace("{url}", encodeURIComponent(targetUrl));
    if (/[?&]url=$/i.test(trimmed)) return `${trimmed}${encodeURIComponent(targetUrl)}`;
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}url=${encodeURIComponent(targetUrl)}`;
  }

  function proxyImageUrl(rawUrl) {
    let cleanUrl = String(rawUrl || "").trim();
    if (!cleanUrl || cleanUrl.startsWith("data:") || cleanUrl.startsWith("blob:") || cleanUrl.startsWith("/api/proxy")) {
      return cleanUrl;
    }
    if (/^\/(?:[a-z]{2,4}\/)?wol\//i.test(cleanUrl)) {
      cleanUrl = `https://wol.jw.org${cleanUrl}`;
    }
    if (/^https?:\/\/wol\.jw\.org\//i.test(cleanUrl)) {
      if (isLocalServerProxyAvailable()) {
        return `/api/proxy?url=${encodeURIComponent(cleanUrl)}`;
      }
      const customBase = getCustomProxyBase();
      if (customBase) {
        return buildCustomProxyUrl(customBase, cleanUrl);
      }
    }
    return cleanUrl;
  }

  async function fetchRssFeed(rssUrl) {
    const res = await fetchWolHtml(rssUrl, { skipValidation: true });
    const parser = new DOMParser();
    let doc = parser.parseFromString(res.html, "application/xml");
    if (doc.querySelector("parsererror")) {
      doc = parser.parseFromString(res.html, "text/html");
    }
    const items = Array.from(doc.querySelectorAll("item"));
    return items.map((item) => {
      const title = (item.querySelector("title")?.textContent || "").trim();
      const linkEl = item.querySelector("link");
      const link = ((linkEl && (linkEl.textContent || linkEl.getAttribute("href"))) || "").trim();
      const pubDate = (item.querySelector("pubDate")?.textContent || "").trim();
      const rawDesc = (item.querySelector("description")?.textContent || "").trim();
      const tmp = document.createElement("div");
      tmp.innerHTML = rawDesc;
      const encUrl = item.querySelector("enclosure")?.getAttribute("url") || "";
      const mediaThumb = item.getElementsByTagName("media:thumbnail")[0]?.getAttribute("url") || "";
      const inlineImg = tmp.querySelector("img")?.getAttribute("src") || "";
      const image = proxyImageUrl(encUrl || mediaThumb || inlineImg || "");
      const description = (tmp.textContent || "").replace(/\s+/g, " ").trim();
      return { title, link, pubDate, description, image };
    });
  }

  const bibleCompareCache = new Map();

  async function fetchBibleComparison(bookNum, chapter, versesInput, lang = "fr") {
    const vList = Array.isArray(versesInput) ? versesInput : [Number(versesInput) || 1];
    const cacheKey = `${lang}:${bookNum}:${chapter}:${vList.join(",")}`;
    if (bibleCompareCache.has(cacheKey)) {
      return bibleCompareCache.get(cacheKey);
    }

    const bNum = Number(bookNum);
    const ch = Number(chapter);
    const editions =
      lang === "en"
        ? [
            { code: "nwtsty", label: "NWT (Study Edition)", url: `https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/${bNum}/${ch}`, lang: "en" },
            { code: "Rbi8", label: "NWT (1984 Reference)", url: `https://wol.jw.org/en/wol/b/r1/lp-e/Rbi8/${bNum}/${ch}`, lang: "en" },
            { code: "bi10", label: "King James Version (KJV)", url: `https://wol.jw.org/en/wol/b/r1/lp-e/bi10/${bNum}/${ch}`, lang: "en" },
            { code: "by", label: "American Standard (ASV)", url: `https://wol.jw.org/en/wol/b/r1/lp-e/by/${bNum}/${ch}`, lang: "en" },
            { code: "nwtsty-fr", label: "TMN d'étude (Français)", url: `https://wol.jw.org/fr/wol/b/r30/lp-f/nwtsty/${bNum}/${ch}`, lang: "fr" }
          ]
        : [
            { code: "nwtsty", label: "TMN (Édition d'étude)", url: `https://wol.jw.org/fr/wol/b/r30/lp-f/nwtsty/${bNum}/${ch}`, lang: "fr" },
            { code: "Rbi8", label: "TMN (1995 avec notes)", url: `https://wol.jw.org/fr/wol/b/r30/lp-f/Rbi8/${bNum}/${ch}`, lang: "fr" },
            { code: "nwtsty-en", label: "NWT Study (English)", url: `https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/${bNum}/${ch}`, lang: "en" },
            { code: "bi10", label: "King James Version (EN)", url: `https://wol.jw.org/en/wol/b/r1/lp-e/bi10/${bNum}/${ch}`, lang: "en" }
          ];

    if (bNum >= 40) {
      editions.push({
        code: "int",
        label: lang === "en" ? "Kingdom Interlinear (Greek-EN)" : "Interlinéaire du Royaume (Grec-EN)",
        url: `https://wol.jw.org/en/wol/b/r1/lp-e/int/${bNum}/${ch}`,
        lang: "en"
      });
    }

    const extractVersesFromDoc = (htmlStr) => {
      const doc = new DOMParser().parseFromString(htmlStr, "text/html");
      const out = {};
      vList.forEach((vn) => {
        const spans = doc.querySelectorAll(`span[id^="v${bNum}-${ch}-${vn}-"]`);
        const parts = [];
        spans.forEach((sp) => {
          const c = sp.cloneNode(true);
          c.querySelectorAll(".vl, .cl, a.b, a.fn").forEach((n) => n.remove());
          const t = String(c.textContent || "").replace(/[\u00a0\u202f\u200b]/g, " ").replace(/\s+/g, " ").trim();
          if (t) parts.push(t);
        });
        if (parts.length) {
          out[vn] = parts.join(" ");
        } else {
          // Fallback pour Rbi8 / KJV / ASV / Interlinéaire (format id différent possible)
          const altSpan = doc.querySelector(`[data-verse="${vn}"], #v${bNum}-${ch}-${vn}, .v-${vn}`);
          if (altSpan) {
            const c = altSpan.cloneNode(true);
            c.querySelectorAll(".vl, .cl, a.b, a.fn").forEach((n) => n.remove());
            out[vn] = String(c.textContent || "").replace(/^\s*\d+\s*/, "").replace(/\s+/g, " ").trim();
          }
        }
      });
      return out;
    };

    const rows = await Promise.all(
      editions.map(async (ed) => {
        try {
          const res = await fetchWolHtml(ed.url);
          const versesMap = extractVersesFromDoc(res.html);
          const text = vList.map((vn) => (versesMap[vn] ? (vList.length > 1 ? `${vn} ${versesMap[vn]}` : versesMap[vn]) : "")).filter(Boolean).join(" ");
          return { code: ed.code, label: ed.label, lang: ed.lang, url: ed.url, text: text || null };
        } catch (_) {
          return { code: ed.code, label: ed.label, lang: ed.lang, url: ed.url, text: null };
        }
      })
    );

    const valid = rows.filter((r) => r.text);
    if (valid.length) bibleCompareCache.set(cacheKey, valid);
    return valid;
  }

  function clearHtmlCache() {
    htmlMemoryCache.clear();
    bibleCompareCache.clear();
    proxyCooldowns.clear();
  }

  return {
    getLangLetter,
    getCustomProxyBase,
    setCustomProxyBase,
    buildCustomProxyUrl,
    isNativeCapacitor,
    isLocalServerProxyAvailable,
    isAllowedUpstreamUrl,
    getJwSearchToken,
    jwSearch,
    mediatorGet,
    pubMediaGet,
    getBibleAudio,
    getArticleAudioByDocId,
    fetchTextDirect,
    fetchBlobWithProxyFallback,
    proxyImageUrl,
    fetchRssFeed,
    fetchBibleComparison,
    extractDocIdFromUrlOrHtml,
    fetchWolHtml,
    clearHtmlCache
  };
})();
