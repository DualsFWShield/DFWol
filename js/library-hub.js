/* ==========================================================================
   DFWol Studio — Bibliothèque 1:1 JW Library (Publications, Vidéos, Audio,
   Téléchargé + Stockage Hors-Ligne IndexedDB)
   ========================================================================== */

window.DFWolLibrary = (function () {
  "use strict";

  const DB_NAME = "dfwol_offline_db";
  const DB_STORE = "articles";
  const LS_OFFLINE_KEY = "dfwol_offline_articles_fallback_v1";

  let activeSubtab = "publications";
  let loadedLangPubs = null;
  let loadedLangAudio = null;
  let wolCategoryUrls = { fr: {}, en: {} };
  let currentPubDrill = null;
  let currentAudioDrill = null;
  let uiBound = false;

  function esc(str) {
    return window.DFWolSearch ? window.DFWolSearch.escapeHtml(str) : String(str || "");
  }

  function cleanStr(str) {
    if (window.DFWolSearch && typeof window.DFWolSearch.cleanText === "function") {
      return window.DFWolSearch.cleanText(str);
    }
    return String(str || "").replace(/\s+/g, " ").trim();
  }

  // ==========================================================================
  // 1. Stockage Hors-Ligne (IndexedDB avec secours localStorage)
  // ==========================================================================

  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("No IndexedDB"));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveArticleOffline(articleData) {
    if (!articleData) return false;
    const key = articleData.url || `doc-${articleData.docId || Date.now()}`;
    const record = {
      key,
      url: articleData.url || key,
      docId: articleData.docId || null,
      lang: articleData.lang || "fr",
      title: articleData.title || "Publication",
      citation: articleData.citation || "",
      articleClasses: articleData.articleClasses || "jwac",
      hasNativeHeader: Boolean(articleData.hasNativeHeader),
      html: articleData.html || "",
      paragraphs: articleData.paragraphs || [],
      plainText: articleData.plainText || "",
      savedAt: new Date().toISOString()
    };

    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {
      try {
        const list = JSON.parse(localStorage.getItem(LS_OFFLINE_KEY) || "[]").filter((x) => x.key !== key);
        list.unshift(record);
        localStorage.setItem(LS_OFFLINE_KEY, JSON.stringify(list.slice(0, 15)));
      } catch (e) {
        throw new Error("Espace de stockage hors-ligne insuffisant.");
      }
    }

    if (activeSubtab === "downloads") renderDownloadsView();
    window.DFWolToast && window.DFWolToast(`Enregistré hors-ligne : ${record.title}`);
    return true;
  }

  async function listOfflineArticles() {
    try {
      const db = await openDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))));
        req.onerror = () => resolve([]);
      });
    } catch (_) {
      try {
        return JSON.parse(localStorage.getItem(LS_OFFLINE_KEY) || "[]");
      } catch (_) {
        return [];
      }
    }
  }

  async function getOfflineArticle(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      const list = await listOfflineArticles();
      return list.find((x) => x.key === key) || null;
    }
  }

  async function deleteOfflineArticle(key) {
    try {
      const db = await openDb();
      await new Promise((resolve) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    } catch (_) {}
    try {
      const list = JSON.parse(localStorage.getItem(LS_OFFLINE_KEY) || "[]").filter((x) => x.key !== key);
      localStorage.setItem(LS_OFFLINE_KEY, JSON.stringify(list));
    } catch (_) {}
    renderDownloadsView();
  }

  // ==========================================================================
  // 2. Onglet PUBLICATIONS 1:1 (Capture 1)
  // ==========================================================================

  const PUB_CATEGORIES = [
    {
      id: "books",
      fr: "Livres",
      en: "Books",
      match: /livres|books/i,
      searchQ: "livre",
      svg: `<svg viewBox="0 0 28 28"><rect x="4" y="4" width="15" height="20" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M22 6v16M8 9h7M8 12h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
    },
    {
      id: "brochures",
      fr: "Brochures",
      en: "Brochures & Booklets",
      match: /brochures/i,
      searchQ: "brochure",
      svg: `<svg viewBox="0 0 28 28"><rect x="4" y="4" width="15" height="20" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M22 6v16M7 18l4-5 3 3 2-2 2 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="9.5" r="1.5" fill="currentColor"/></svg>`
    },
    {
      id: "tracts",
      fr: "Tracts et invitations",
      en: "Tracts",
      match: /tracts/i,
      searchQ: "tract",
      svg: `<svg viewBox="0 0 28 28"><rect x="5" y="5" width="13" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M18 7c2.5 0 4 2 4 6s-1.5 7-4 8M9 11h5M9 15h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
    },
    {
      id: "series",
      fr: "Rubriques",
      en: "Article Series",
      match: /rubriques|article series/i,
      searchQ: "rubrique",
      svg: `<svg viewBox="0 0 28 28"><path d="M4 7h15v15H4zM19 10h4v12h-4M7 11h5v5H7zM14 11h3M14 14h3M7 19h9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`
    },
    {
      id: "watchtower",
      fr: "Tour de Garde",
      en: "The Watchtower",
      match: /tour de garde|watchtower/i,
      searchQ: "Tour de Garde",
      svg: `<svg viewBox="0 0 28 28"><path d="M7 6h3v2h2.5V6h3v2H18V6h3v5l-2 2v9H9v-9l-2-2V6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`
    },
    {
      id: "awake",
      fr: "Réveillez-vous !",
      en: "Awake!",
      match: /r[ée]veillez|awake/i,
      searchQ: "Réveillez-vous",
      svg: `<svg viewBox="0 0 28 28"><path d="M12 4h4l-.8 12h-2.4L12 4z" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11.5" y="19" width="5" height="5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`
    },
    {
      id: "workbooks",
      fr: "Cahiers Vie et ministère",
      en: "Meeting Workbooks",
      match: /cahier|vie et minist[èe]re|workbook/i,
      searchQ: "Cahier Vie et ministère",
      svg: `<svg viewBox="0 0 28 28"><rect x="4" y="4" width="15" height="20" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="11.5" cy="10.5" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 18.5h8l-1-4h-6zM22 6v16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`
    },
    {
      id: "km",
      fr: "Ministère du Royaume",
      en: "Kingdom Ministry",
      match: /minist[èe]re du royaume|kingdom ministry/i,
      searchQ: "Ministère du Royaume",
      svg: `<svg viewBox="0 0 28 28"><rect x="4" y="4" width="15" height="20" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="14" cy="10" r="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 18c0-2 1.2-3.5 2.5-3.5M12 18c0-2 1.2-3.5 2.5-3.5M22 6v16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
    },
    {
      id: "programs",
      fr: "Programmes",
      en: "Programs",
      match: /programmes|programs/i,
      searchQ: "programme assemblée",
      svg: `<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 8v6l4 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
    },
    {
      id: "indexes",
      fr: "Index & Guide de recherche",
      en: "Indexes & Research Guide",
      match: /index|guide de recherche/i,
      wolPathFr: "https://wol.jw.org/fr/wol/lv/r30/lp-f/0/21275",
      wolPathEn: "https://wol.jw.org/en/wol/lv/r1/lp-e/0/21275",
      svg: `<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m17 11-2 5-5 2 2-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`
    },
    {
      id: "insight",
      fr: "Étude perspicace (it)",
      en: "Insight on the Scriptures",
      match: /perspicace|insight|ouvrages de r[ée]f[ée]rence/i,
      wolPathFr: "https://wol.jw.org/fr/wol/lv/r30/lp-f/0/2",
      wolPathEn: "https://wol.jw.org/en/wol/lv/r1/lp-e/0/2",
      svg: `<svg viewBox="0 0 28 28"><path d="M5 10h18M7 10v10M12 10v10M16 10v10M21 10v10M4 20h20M14 5l10 5H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`
    }
  ];

  async function resolveWolRootCategories(lang = "fr") {
    if (Object.keys(wolCategoryUrls[lang] || {}).length > 0) return wolCategoryUrls[lang];
    const cfg = window.DFWolBible.getLangConfig(lang);
    const rootUrl = `https://wol.jw.org/${cfg.code}/wol/lv/${cfg.r}/${cfg.lp}/0`;
    try {
      const res = await window.DFWolNet.fetchWolHtml(rootUrl);
      const doc = new DOMParser().parseFromString(res.html, "text/html");
      const map = {};
      doc.querySelectorAll("a[href]").forEach((a) => {
        const txt = cleanStr(a.textContent || "");
        let href = a.getAttribute("href") || "";
        if (!txt || !href || !/\/wol\//i.test(href)) return;
        if (href.startsWith("/")) href = `https://wol.jw.org${href}`;
        PUB_CATEGORIES.forEach((cat) => {
          if (!map[cat.id] && cat.match.test(txt)) {
            map[cat.id] = href;
          }
        });
      });
      wolCategoryUrls[lang] = map;
    } catch (_) {}
    return wolCategoryUrls[lang] || {};
  }

  function renderPublicationsRoot(lang = "fr") {
    currentPubDrill = null;
    const listEl = document.getElementById("lib-publications-list");
    const drillEl = document.getElementById("lib-publications-drill");
    if (drillEl) drillEl.classList.add("hidden");
    if (!listEl) return;
    listEl.classList.remove("hidden");

    listEl.innerHTML = PUB_CATEGORIES.map((cat) => {
      const label = lang === "en" ? cat.en : cat.fr;
      return `
        <button type="button" class="jwl-list-row" data-lib-cat="${cat.id}">
          <span class="jwl-list-icon">${cat.svg}</span>
          <span class="jwl-list-label">${esc(label)}</span>
          <span class="jwl-list-chevron">›</span>
        </button>
      `;
    }).join("");

    resolveWolRootCategories(lang);
  }

  async function openPublicationCategory(catId, lang = "fr") {
    const cat = PUB_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    const label = lang === "en" ? cat.en : cat.fr;
    const listEl = document.getElementById("lib-publications-list");
    const drillEl = document.getElementById("lib-publications-drill");
    const titleEl = document.getElementById("lib-pub-drill-title");
    const bodyEl = document.getElementById("lib-pub-drill-body");
    if (!drillEl || !bodyEl) return;

    currentPubDrill = { catId, label };
    listEl?.classList.add("hidden");
    drillEl.classList.remove("hidden");
    if (titleEl) titleEl.textContent = label;
    bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement de « ${esc(label)} »…</div>`;

    try {
      const resolvedMap = await resolveWolRootCategories(lang);
      const targetUrl =
        resolvedMap[cat.id] || (lang === "en" ? cat.wolPathEn : cat.wolPathFr) || null;

      if (targetUrl) {
        const res = await window.DFWolNet.fetchWolHtml(targetUrl);
        const doc = new DOMParser().parseFromString(res.html, "text/html");
        const links = [];
        const seen = new Set();

        doc.querySelectorAll("a.cardContainer[href], ul.directory a[href], #article a[href]").forEach((a) => {
          if (a.closest("nav, header, footer, .breadcrumbs, .siteNav")) return;
          let href = a.getAttribute("href") || "";
          if (!href || href.startsWith("#") || !/\/wol\//i.test(href)) return;
          if (href.startsWith("/")) href = `https://wol.jw.org${href}`;
          if (href === targetUrl || seen.has(href)) return;
          const line1 = cleanStr(a.querySelector(".cardLine1")?.textContent || a.textContent || "");
          if (!line1 || line1.length <= 1 || line1.toLowerCase() === label.toLowerCase()) return;
          seen.add(href);
          const line2 = cleanStr(a.querySelector(".cardLine2")?.textContent || "");
          const imgEl = a.querySelector("img");
          const thumb = imgEl ? (imgEl.getAttribute("src") || imgEl.getAttribute("data-src") || "").trim() : "";
          const fullThumb = thumb && thumb.startsWith("/") ? `https://wol.jw.org${thumb}` : thumb;
          links.push({ title: line1, sub: line2, url: href, thumb: fullThumb });
        });

        if (links.length > 0) {
          renderPubDrillItems(bodyEl, links, lang);
          return;
        }
      }

      // Secours via JW.org Search API
      const searchRes = await window.DFWolSearch.runUnifiedSearch({
        query: cat.searchQ || label,
        scope: "publications",
        lang,
        engine: "jw"
      });
      const items = (searchRes.jwItems || []).map((it) => ({
        title: it.title,
        sub: it.context,
        url: it.wolUrl,
        thumb: it.imageUrl
      }));
      if (items.length > 0) {
        renderPubDrillItems(bodyEl, items, lang);
      } else {
        bodyEl.innerHTML = `<p class="card-helper-text">Aucune publication trouvée dans cette catégorie.</p>`;
      }
    } catch (err) {
      bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  function renderPubDrillItems(container, items, lang) {
    container.innerHTML = items
      .slice(0, 50)
      .map(
        (it, idx) => `
        <div class="jwl-audio-row">
          <button type="button" class="jwl-audio-row-main" data-open-pub-url="${esc(it.url)}">
            ${it.thumb ? `<img src="${esc(it.thumb)}" alt="" class="jwl-audio-thumb jwl-pub-cover" loading="lazy" />` : `<div class="jwl-pub-thumb-ph">📘</div>`}
            <div class="jwl-audio-row-text">
              <strong>${esc(it.title)}</strong>
              ${it.sub ? `<small>${esc(it.sub)}</small>` : ""}
            </div>
          </button>
          <button type="button" class="jwl-row-more-btn" data-pub-more="${idx}" title="Options">⋮</button>
        </div>
      `
      )
      .join("");

    container.querySelectorAll("img.jwl-pub-cover").forEach((img) => {
      img.addEventListener("error", () => {
        const ph = document.createElement("div");
        ph.className = "jwl-pub-thumb-ph";
        ph.textContent = "📘";
        img.replaceWith(ph);
      });
    });

    container.querySelectorAll("[data-open-pub-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const u = btn.getAttribute("data-open-pub-url");
        if (/\/wol\/(?:lv|library|publication)\//i.test(u)) {
          openWolDirectoryUrl(u, btn.querySelector("strong")?.textContent || "Publications", lang);
        } else {
          window.DFWolReader && window.DFWolReader.openArticleInApp(u, { lang });
        }
      });
    });

    container.querySelectorAll("[data-pub-more]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const it = items[Number(btn.getAttribute("data-pub-more"))];
        if (it && window.DFWolReader && typeof window.DFWolReader.showCardActionMenu === "function") {
          window.DFWolReader.showCardActionMenu(e.currentTarget, { title: it.title, url: it.url, lang });
        }
      });
    });
  }

  async function openWolDirectoryUrl(wolUrl, title, lang = "fr") {
    const bodyEl = document.getElementById("lib-pub-drill-body");
    const titleEl = document.getElementById("lib-pub-drill-title");
    if (!bodyEl) return;
    if (titleEl) titleEl.textContent = title;
    bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement…</div>`;
    try {
      const res = await window.DFWolNet.fetchWolHtml(wolUrl);
      const doc = new DOMParser().parseFromString(res.html, "text/html");
      const items = [];
      const seen = new Set();
      doc.querySelectorAll("a[href]").forEach((a) => {
        let href = a.getAttribute("href") || "";
        if (!href || href.startsWith("#") || !/\/wol\//i.test(href)) return;
        if (href.startsWith("/")) href = `https://wol.jw.org${href}`;
        if (seen.has(href) || href === wolUrl) return;
        seen.add(href);
        const txt = cleanStr(a.querySelector(".cardLine1")?.textContent || a.textContent || "");
        const sub = cleanStr(a.querySelector(".cardLine2")?.textContent || "");
        const thumb = a.querySelector("img")?.getAttribute("src") || "";
        const fullThumb = thumb && thumb.startsWith("/") ? `https://wol.jw.org${thumb}` : thumb;
        if (txt && txt.length > 1) items.push({ title: txt, sub, url: href, thumb: fullThumb });
      });
      if (items.length > 0) renderPubDrillItems(bodyEl, items, lang);
      else window.DFWolReader.openArticleInApp(wolUrl, { lang });
    } catch (_) {
      window.DFWolReader.openArticleInApp(wolUrl, { lang });
    }
  }

  // ==========================================================================
  // 3. Onglet CONTENUS AUDIO 1:1 (Capture 2)
  // ==========================================================================

  async function loadAudioCategories(lang = "fr") {
    const listEl = document.getElementById("lib-audio-list");
    const drillEl = document.getElementById("lib-audio-drill");
    if (drillEl) drillEl.classList.add("hidden");
    if (!listEl) return;
    listEl.classList.remove("hidden");
    listEl.innerHTML = `<div class="loading-box">⏳ Chargement des contenus audio JW…</div>`;

    try {
      const ll = window.DFWolNet.getLangLetter(lang);
      const data = await window.DFWolNet.mediatorGet(`categories/${ll}/Audio?detailed=1&clientType=www`);
      const subs = (data && data.category && data.category.subcategories) || [];
      loadedLangAudio = lang;

      if (subs.length === 0) {
        listEl.innerHTML = `<p class="card-helper-text">Aucune catégorie audio disponible.</p>`;
        return;
      }

      listEl.innerHTML = subs
        .map((sc) => {
          const thumb =
            (sc.images && (sc.images.sqr?.lg || sc.images.lss?.lg || sc.images.wss?.lg || sc.images.pnr?.lg)) || "";
          return `
            <button type="button" class="jwl-audio-row jwl-audio-cat-btn" data-audio-cat="${esc(sc.key)}" data-audio-cat-name="${esc(sc.name)}">
              <div class="jwl-audio-row-main">
                ${thumb ? `<img src="${esc(thumb)}" alt="" class="jwl-audio-thumb" loading="lazy" />` : `<div class="jwl-pub-thumb-ph">🎵</div>`}
                <div class="jwl-audio-row-text">
                  <strong>${esc(sc.name)}</strong>
                </div>
              </div>
              <span class="jwl-list-chevron">›</span>
            </button>
          `;
        })
        .join("");
    } catch (err) {
      listEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  async function openAudioCategory(catKey, catName, lang = "fr") {
    const listEl = document.getElementById("lib-audio-list");
    const drillEl = document.getElementById("lib-audio-drill");
    const titleEl = document.getElementById("lib-audio-drill-title");
    const bodyEl = document.getElementById("lib-audio-drill-body");
    if (!drillEl || !bodyEl) return;

    currentAudioDrill = { catKey, catName };
    listEl?.classList.add("hidden");
    drillEl.classList.remove("hidden");
    if (titleEl) titleEl.textContent = catName || "Audio";
    bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement des pistes audio…</div>`;

    try {
      const ll = window.DFWolNet.getLangLetter(lang);
      const data = await window.DFWolNet.mediatorGet(
        `categories/${ll}/${encodeURIComponent(catKey)}?detailed=1&mediaLimit=60&clientType=www`
      );
      const cat = data && data.category;
      const subs = (cat && cat.subcategories) || [];
      const media = (cat && cat.media) || [];

      let html = "";
      if (subs.length > 0) {
        html += subs
          .map((sc) => {
            const thumb = (sc.images && (sc.images.sqr?.lg || sc.images.lss?.lg)) || "";
            return `
              <button type="button" class="jwl-audio-row jwl-audio-cat-btn" data-audio-cat="${esc(sc.key)}" data-audio-cat-name="${esc(sc.name)}">
                <div class="jwl-audio-row-main">
                  ${thumb ? `<img src="${esc(thumb)}" alt="" class="jwl-audio-thumb" loading="lazy" />` : `<div class="jwl-pub-thumb-ph">🎵</div>`}
                  <div class="jwl-audio-row-text"><strong>${esc(sc.name)}</strong></div>
                </div>
                <span class="jwl-list-chevron">›</span>
              </button>
            `;
          })
          .join("");
      }

      if (media.length > 0) {
        const tracks = media
          .map((m) => {
            const file = (m.files || []).find((f) => f.progressiveDownloadURL) || null;
            return {
              title: m.title,
              duration: m.durationFormattedMinSec || "",
              url: file ? file.progressiveDownloadURL : "",
              filesize: file ? file.filesize : 0,
              thumb: (m.images && (m.images.sqr?.lg || m.images.lss?.lg)) || ""
            };
          })
          .filter((t) => t.url);

        if (tracks.length > 0) {
          html += `
            <div class="audio-cat-actions-bar">
              <button type="button" class="btn-primary btn-sm" id="btn-audio-cat-play-all">▶ Tout écouter (${tracks.length})</button>
            </div>
          `;
          html += tracks
            .map(
              (t, idx) => `
              <div class="jwl-audio-track-card">
                <div class="jwl-audio-track-info">
                  ${t.thumb ? `<img src="${esc(t.thumb)}" alt="" class="jwl-audio-thumb-sm" loading="lazy" />` : `<span class="jwl-track-num">${idx + 1}</span>`}
                  <div class="jwl-audio-track-meta">
                    <strong>${esc(t.title)}</strong>
                    <small>${esc(t.duration)}${t.filesize && window.DFWolExport ? ` • ${window.DFWolExport.formatBytes(t.filesize)}` : ""}</small>
                  </div>
                </div>
                <div class="btn-group">
                  <button type="button" class="btn-primary btn-xs" data-atr-play="${idx}" title="Écouter">▶</button>
                  <button type="button" class="btn-secondary btn-xs" data-atr-queue="${idx}" title="Ajouter à la file d'attente">+</button>
                  <button type="button" class="btn-ghost btn-xs" data-atr-dl="${idx}" title="Télécharger MP3">⬇️</button>
                </div>
              </div>
            `
            )
            .join("");

          bodyEl.innerHTML = html;

          bodyEl.querySelector("#btn-audio-cat-play-all")?.addEventListener("click", () => {
            window.DFWolAudio &&
              window.DFWolAudio.playQueue(
                tracks.map((t) => ({
                  title: t.title,
                  subtitle: catName,
                  audioUrl: t.url,
                  lang,
                  mode: "mp3"
                }))
              );
          });

          bodyEl.querySelectorAll("[data-atr-play]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const t = tracks[Number(btn.getAttribute("data-atr-play"))];
              if (t && window.DFWolAudio) {
                window.DFWolAudio.playTrack({ title: t.title, subtitle: catName, audioUrl: t.url, lang, mode: "mp3" });
              }
            });
          });
          bodyEl.querySelectorAll("[data-atr-queue]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const t = tracks[Number(btn.getAttribute("data-atr-queue"))];
              if (t && window.DFWolAudio) {
                window.DFWolAudio.addToQueue({ title: t.title, subtitle: catName, audioUrl: t.url, lang, mode: "mp3" });
                window.DFWolToast && window.DFWolToast("Ajouté à la file d'attente !");
              }
            });
          });
          bodyEl.querySelectorAll("[data-atr-dl]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const t = tracks[Number(btn.getAttribute("data-atr-dl"))];
              if (t && window.DFWolExport) {
                window.DFWolExport.downloadAudioTrack(t.url, t.title, catName, { thumb: t.thumb });
              }
            });
          });
          return;
        }
      }

      bodyEl.innerHTML = html || `<p class="card-helper-text">Aucun contenu audio trouvé dans cette section.</p>`;
    } catch (err) {
      bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  // ==========================================================================
  // 4. Onglet TÉLÉCHARGÉ (Hors-ligne + Historique Vidéo/Audio/PDF)
  // ==========================================================================

  async function renderDownloadsView() {
    const container = document.getElementById("lib-downloads-container");
    if (!container) return;

    const offlineArticles = await listOfflineArticles();
    const mediaDownloads = window.DFWolExport ? window.DFWolExport.getDownloadsHistory() : [];

    let html = `<div class="downloads-section"><h3>📚 Publications sauvegardées hors-ligne (${offlineArticles.length})</h3>`;
    if (offlineArticles.length === 0) {
      html += `<p class="card-helper-text">Aucune publication enregistrée hors-ligne. Cliquez sur « 💾 Hors-ligne » ou « ⋮ » dans le lecteur pour en sauvegarder.</p>`;
    } else {
      html += `<div class="downloads-list">`;
      offlineArticles.forEach((art) => {
        html += `
          <div class="jwl-audio-track-card">
            <div class="jwl-audio-track-meta">
              <strong>${esc(art.title)}</strong>
              <small>${esc(art.citation || art.lang.toUpperCase())} • ${new Date(art.savedAt).toLocaleDateString()}</small>
            </div>
            <div class="btn-group">
              <button type="button" class="btn-primary btn-xs" data-off-open="${esc(art.key)}">📖 Lire</button>
              <button type="button" class="btn-secondary btn-xs" data-off-pdf="${esc(art.key)}">📄 PDF</button>
              <button type="button" class="btn-ghost btn-xs" data-off-del="${esc(art.key)}">🗑️</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
    html += `</div>`;

    html += `<div class="downloads-section" style="margin-top:1.4rem;"><h3>⬇️ Médias téléchargés (${mediaDownloads.length})</h3>`;
    if (mediaDownloads.length === 0) {
      html += `<p class="card-helper-text">Vos vidéos MP4, audios MP3 et images téléchargés apparaîtront ici pour un accès rapide.</p>`;
    } else {
      html += `<div class="downloads-list">`;
      mediaDownloads.forEach((dl) => {
        const icon = dl.type === "video" ? "🎬" : dl.type === "audio" ? "🎧" : "🖼️";
        html += `
          <div class="jwl-audio-track-card">
            <div class="jwl-audio-track-info">
              <span class="jwl-track-num">${icon}</span>
              <div class="jwl-audio-track-meta">
                <strong>${esc(dl.title)}</strong>
                <small>${esc(dl.filename || "")} • ${new Date(dl.downloadedAt).toLocaleDateString()}</small>
              </div>
            </div>
            <div class="btn-group">
              ${dl.lank ? `<button type="button" class="btn-primary btn-xs" data-dl-play-lank="${esc(dl.lank)}">▶ Lire</button>` : ""}
              ${dl.type === "audio" ? `<button type="button" class="btn-primary btn-xs" data-dl-play-audio="${esc(dl.url)}" data-dl-title="${esc(dl.title)}">▶ Écouter</button>` : ""}
              <button type="button" class="btn-secondary btn-xs" data-dl-again="${esc(dl.url)}" data-dl-fname="${esc(dl.filename || "media")}">⬇️</button>
              <button type="button" class="btn-ghost btn-xs" data-dl-del="${esc(dl.id)}">✕</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
    html += `</div>`;

    container.innerHTML = html;

    container.querySelectorAll("[data-off-open]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rec = await getOfflineArticle(btn.getAttribute("data-off-open"));
        if (rec && window.DFWolReader && typeof window.DFWolReader.openParsedArticleObject === "function") {
          window.DFWolReader.openParsedArticleObject(rec);
        }
      });
    });

    container.querySelectorAll("[data-off-pdf]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rec = await getOfflineArticle(btn.getAttribute("data-off-pdf"));
        if (rec && window.DFWolExport) {
          window.DFWolExport.openPdfExportModal({
            type: "article",
            title: rec.title,
            subtitle: rec.citation,
            html: rec.html,
            docId: rec.docId,
            lang: rec.lang
          });
        }
      });
    });

    container.querySelectorAll("[data-off-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteOfflineArticle(btn.getAttribute("data-off-del")));
    });

    container.querySelectorAll("[data-dl-play-lank]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.DFWolVideo && window.DFWolVideo.openVideoInApp(btn.getAttribute("data-dl-play-lank"));
      });
    });

    container.querySelectorAll("[data-dl-play-audio]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.DFWolAudio &&
          window.DFWolAudio.playTrack({
            title: btn.getAttribute("data-dl-title") || "Audio",
            audioUrl: btn.getAttribute("data-dl-play-audio"),
            mode: "mp3"
          });
      });
    });

    container.querySelectorAll("[data-dl-again]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.DFWolExport &&
          window.DFWolExport.downloadMediaFile(
            btn.getAttribute("data-dl-again"),
            btn.getAttribute("data-dl-fname")
          );
      });
    });

    container.querySelectorAll("[data-dl-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.DFWolExport && window.DFWolExport.removeDownloadEntry(btn.getAttribute("data-dl-del"));
      });
    });
  }

  // ==========================================================================
  // 5. Navigation sous-onglets Bibliothèque
  // ==========================================================================

  function setLibraryView(subtab = "publications") {
    activeSubtab = subtab;
    const views = ["publications", "videos", "audio", "downloads", "search"];
    views.forEach((v) => {
      document.getElementById(`lib-view-${v}`)?.classList.toggle("hidden", v !== subtab);
    });
    document.querySelectorAll("[data-lib-subtab]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-lib-subtab") === subtab);
    });

    const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
    const subLabel = document.getElementById("library-top-sub");
    if (subLabel) subLabel.textContent = lang === "en" ? "English" : "Français";

    if (subtab === "publications" && loadedLangPubs !== lang) {
      loadedLangPubs = lang;
      renderPublicationsRoot(lang);
    } else if (subtab === "videos" && window.DFWolVideo) {
      window.DFWolVideo.ensureLoadedForLang(lang);
    } else if (subtab === "audio" && loadedLangAudio !== lang) {
      loadAudioCategories(lang);
    } else if (subtab === "downloads") {
      renderDownloadsView();
    }
  }

  function refreshForLanguage(lang = "fr") {
    loadedLangPubs = null;
    loadedLangAudio = null;
    setLibraryView(activeSubtab);
  }

  function init() {
    if (uiBound) return;
    uiBound = true;

    document.querySelectorAll("[data-lib-subtab]").forEach((btn) => {
      btn.addEventListener("click", () => setLibraryView(btn.getAttribute("data-lib-subtab")));
    });

    document.getElementById("lib-publications-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lib-cat]");
      if (!btn) return;
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      openPublicationCategory(btn.getAttribute("data-lib-cat"), lang);
    });

    document.getElementById("btn-lib-pub-back")?.addEventListener("click", () => {
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      renderPublicationsRoot(lang);
    });

    const handleAudioCatClick = (e) => {
      const btn = e.target.closest("[data-audio-cat]");
      if (!btn) return;
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      openAudioCategory(btn.getAttribute("data-audio-cat"), btn.getAttribute("data-audio-cat-name"), lang);
    };
    document.getElementById("lib-audio-list")?.addEventListener("click", handleAudioCatClick);
    document.getElementById("lib-audio-drill-body")?.addEventListener("click", handleAudioCatClick);

    document.getElementById("btn-lib-audio-back")?.addEventListener("click", () => {
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      loadAudioCategories(lang);
    });

    document.getElementById("btn-lib-top-search")?.addEventListener("click", () => {
      setLibraryView("search");
      document.getElementById("adv-search-input")?.focus();
    });

    const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
    renderPublicationsRoot(lang);
  }

  return {
    init,
    setLibraryView,
    refreshForLanguage,
    saveArticleOffline,
    getOfflineArticle,
    listOfflineArticles,
    deleteOfflineArticle,
    renderDownloadsView,
    getActiveSubtab: () => activeSubtab
  };
})();
