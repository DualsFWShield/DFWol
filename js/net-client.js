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

  function isLocalhost() {
    return (
      typeof window !== "undefined" &&
      (window.location.protocol === "http:" || window.location.protocol === "https:") &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    );
  }

  function isLocalServerProxyAvailable() {
    return isLocalhost();
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
   */
  function isValidWolHtml(html) {
    if (!html || typeof html !== "string" || html.length < 300) return false;
    if (/Just a moment\.\.\.|Attention Required! \| Cloudflare|Too Many Requests|Error 1015|Access Denied/i.test(html.slice(0, 2000))) {
      return false;
    }
    return /id=["']article["']|class=["'][^"']*(?:bodyTxt|themeScrp|scalableui|ref-rsg|results)|wol\.jw\.org/i.test(html);
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
            "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"
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
        const sep = customBase.includes("?") ? "&" : "?";
        const proxyUrl = customBase.includes("{url}")
          ? customBase.replace("{url}", encodeURIComponent(cleanUrl))
          : `${customBase}${sep}url=${encodeURIComponent(cleanUrl)}`;
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
        "Limite temporaire des proxies publics sur le Web. Cliquez sur Réessayer ou configurez un mini-proxy Cloudflare Worker gratuit (30s) dans Widget & Atelier."
      );
      err.isProxyRateLimit = true;
      throw err;
    }

    setLruCache(cleanUrl, result);
    return result;
  }

  function clearHtmlCache() {
    htmlMemoryCache.clear();
    proxyCooldowns.clear();
  }

  return {
    getLangLetter,
    getCustomProxyBase,
    setCustomProxyBase,
    isLocalServerProxyAvailable,
    getJwSearchToken,
    jwSearch,
    mediatorGet,
    pubMediaGet,
    getBibleAudio,
    getArticleAudioByDocId,
    fetchTextDirect,
    extractDocIdFromUrlOrHtml,
    fetchWolHtml,
    clearHtmlCache
  };
})();
