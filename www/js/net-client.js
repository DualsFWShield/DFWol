/* ==========================================================================
   DFWol Studio — Couche Réseau Universelle (JW.org APIs + WOL Proxy Cascade)
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

  const htmlMemoryCache = new Map();

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

  function isLocalServerProxyAvailable() {
    return (
      typeof window !== "undefined" &&
      (window.location.protocol === "http:" || window.location.protocol === "https:") &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    );
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Récupère et met en cache le jeton JWT public de recherche JW.org (CORS: *)
   */
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
    if (!token) {
      throw new Error("Jeton JW.org vide");
    }
    cachedJwt = token;
    cachedJwtTime = now;
    return token;
  }

  /**
   * Recherche directe sur l'API officielle b.jw-cdn.org/apis/search/results/{F|E}/{slug}
   */
  async function jwSearch(slug = "all", query = "", lang = "fr", limit = 24, offset = 0) {
    const q = (query || "").trim();
    if (!q) return { results: [], total: null };
    const langLetter = getLangLetter(lang);
    const safeSlug = slug || "all";
    const endpoint = `https://b.jw-cdn.org/apis/search/results/${langLetter}/${encodeURIComponent(safeSlug)}?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`;

    let token = await getJwSearchToken(false);
    let resp = await fetchWithTimeout(
      endpoint,
      { headers: { Authorization: `Bearer ${token}` } },
      12000
    );

    if (resp.status === 401) {
      token = await getJwSearchToken(true);
      resp = await fetchWithTimeout(
        endpoint,
        { headers: { Authorization: `Bearer ${token}` } },
        12000
      );
    }

    if (!resp.ok) {
      throw new Error(`Erreur recherche JW.org (${resp.status})`);
    }
    return await resp.json();
  }

  /**
   * Requête directe vers l'API Mediator JW.org (Catégories, Vidéos, Audio, Sous-titres)
   */
  async function mediatorGet(path) {
    const cleanPath = String(path || "").replace(/^\/+/, "");
    const url = `${MEDIATOR_BASE}/${cleanPath}`;
    const resp = await fetchWithTimeout(url, {}, 12000);
    if (!resp.ok) {
      throw new Error(`Erreur Mediator (${resp.status})`);
    }
    return await resp.json();
  }

  /**
   * Requête directe vers l'API PubMedia (MP3 officiels Bible & Publications)
   */
  async function pubMediaGet(paramsObj = {}) {
    const params = new URLSearchParams(Object.assign({ output: "json", alllangs: "0" }, paramsObj));
    const url = `${PUBMEDIA_BASE}?${params.toString()}`;
    const resp = await fetchWithTimeout(url, {}, 12000);
    if (!resp.ok) {
      throw new Error(`Erreur PubMedia (${resp.status})`);
    }
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

  /**
   * Télécharge un fichier texte (notamment .vtt) avec décodage UTF-8 strict via ArrayBuffer
   */
  async function fetchTextDirect(url) {
    try {
      const resp = await fetchWithTimeout(url, {}, 12000);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        return new TextDecoder("utf-8").decode(buf);
      }
    } catch (_) {}

    // Fallback via proxy si nécessaire
    const res = await fetchWolHtml(url, { skipCache: true });
    return res.html;
  }

  /**
   * Extrait le docid numérique depuis une URL finale WOL/JW ou depuis le HTML d'un article WOL
   */
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

  function decodeResponseBuffer(buf, contentType = "") {
    return new TextDecoder("utf-8").decode(buf);
  }

  /**
   * Récupère le HTML d'une URL WOL.jw.org en gérant les redirections & CORS :
   * 1) CapacitorHttp natif
   * 2) Proxy local intégré (/api/proxy?url=...)
   * 3) Proxy personnalisé utilisateur (localStorage / Cloudflare Worker)
   * 4) Cascade de proxies CORS publics
   */
  async function fetchWolHtml(targetUrl, options = {}) {
    const cleanUrl = String(targetUrl || "").trim();
    if (!cleanUrl) throw new Error("URL cible manquante");

    if (!options.skipCache && htmlMemoryCache.has(cleanUrl)) {
      return htmlMemoryCache.get(cleanUrl);
    }

    if (!options.skipCache) {
      try {
        const sess = sessionStorage.getItem("dfwol_html_" + cleanUrl);
        if (sess) {
          const parsed = JSON.parse(sess);
          htmlMemoryCache.set(cleanUrl, parsed);
          return parsed;
        }
      } catch (_) {}
    }

    let result = null;

    // 1. CapacitorHttp Natif (iOS / Android)
    try {
      const capHttp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
      if (capHttp && typeof capHttp.get === "function") {
        const res = await capHttp.get({ url: cleanUrl });
        if (res && res.status >= 200 && res.status < 400 && res.data) {
          const html = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
          const finalUrl = res.url || cleanUrl;
          result = {
            html,
            finalUrl,
            docId: extractDocIdFromUrlOrHtml(finalUrl, html),
            source: "capacitor-http"
          };
        }
      }
    } catch (_) {}

    // 2. Proxy local intégré (/api/proxy?url=...)
    if (!result && isLocalServerProxyAvailable()) {
      try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(cleanUrl)}`;
        const resp = await fetchWithTimeout(proxyUrl, {}, 14000);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const html = decodeResponseBuffer(buf, resp.headers.get("content-type") || "");
          if (html && html.length > 100) {
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
        const resp = await fetchWithTimeout(proxyUrl, {}, 14000);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const html = decodeResponseBuffer(buf);
          const finalUrl = resp.headers.get("X-Final-Url") || cleanUrl;
          result = {
            html,
            finalUrl,
            docId: extractDocIdFromUrlOrHtml(finalUrl, html),
            source: "custom-proxy"
          };
        }
      } catch (_) {}
    }

    // 4. Cascade de proxies CORS publics (pour PWA déployée sans backend)
    if (!result) {
      const publicProxies = [
        {
          name: "corsproxy.io",
          build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
          parse: async (resp) => {
            const buf = await resp.arrayBuffer();
            return { html: decodeResponseBuffer(buf), finalUrl: cleanUrl };
          }
        },
        {
          name: "allorigins",
          build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
          parse: async (resp) => {
            const json = await resp.json();
            return {
              html: json.contents || "",
              finalUrl: (json.status && json.status.url) || cleanUrl
            };
          }
        },
        {
          name: "codetabs",
          build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
          parse: async (resp) => {
            const buf = await resp.arrayBuffer();
            return { html: decodeResponseBuffer(buf), finalUrl: cleanUrl };
          }
        }
      ];

      for (const p of publicProxies) {
        try {
          const resp = await fetchWithTimeout(p.build(cleanUrl), {}, 10000);
          if (!resp.ok) continue;
          const parsed = await p.parse(resp);
          if (parsed.html && parsed.html.length > 180) {
            result = {
              html: parsed.html,
              finalUrl: parsed.finalUrl || cleanUrl,
              docId: extractDocIdFromUrlOrHtml(parsed.finalUrl || cleanUrl, parsed.html),
              source: p.name
            };
            break;
          }
        } catch (_) {}
      }
    }

    if (!result) {
      throw new Error("Impossible de charger cette page WOL. Lancez DFWol via Lancer-DFWol.bat (serveur local) ou vérifiez votre connexion.");
    }

    htmlMemoryCache.set(cleanUrl, result);
    try {
      sessionStorage.setItem("dfwol_html_" + cleanUrl, JSON.stringify(result));
    } catch (_) {}

    return result;
  }

  function clearHtmlCache() {
    htmlMemoryCache.clear();
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith("dfwol_html_")) sessionStorage.removeItem(k);
      });
    } catch (_) {}
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
