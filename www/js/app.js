/* ==========================================================================
   DFWol Studio v3 — Contrôleur Principal Unifié (FR & EN)
   Tout-en-un : Recherche Totale, Bible + Guide Auto en Lot, Vidéos + VTT,
   Lecteur d'Articles + Audio MP3/TTS, Texte du Jour Multi-Niveaux & Widget
   ========================================================================== */

(function () {
  "use strict";

  const STATE_KEY = "dfwol_studio_state_v3";

  const state = {
    lang: "fr",
    theme: "light",
    activeTab: "dashboard",
    dtDate: new Date(),
    dtCurrentData: null,
    dtSummaryMode: "full", // 'oneWord' | 'oneSentence' | 'shortParagraph' | 'full'
    videosLoadedLang: null,
    bibleLoadedOnce: false,
    widgetSettings: {
      size: "size-4x3",
      theme: "theme-jw-light",
      fontScale: 100,
      displayMode: "shortParagraph",
      showCommentary: true
    },
    savedSearches: [
      { query: '#"Questions des lecteurs" & sang', proximity: "doc", sort: "newest", scope: "all", lang: "fr" },
      { query: '("amour fidèle" | "attachement exclusif") & Jéhovah', proximity: "par", sort: "occ", scope: "all", lang: "fr" },
      { query: "Psaume 83:18", proximity: "par", sort: "occ", scope: "bible", lang: "fr" }
    ],
    notes: [
      {
        id: "note-welcome",
        title: "Bienvenue dans DFWol Studio v3",
        tag: "Étude Perso",
        body: "Toutes les références bibliques écrites ici s'ouvrent directement dans l'application : Psaume 83:18, Jean 17:3, Proverbes 3:5, 6 et Révélation 21:3, 4.",
        createdAt: new Date().toISOString()
      }
    ],
    readingProgress: {}
  };

  let deferredPwaPrompt = null;
  const tabHistory = ["dashboard"];
  let lastBackExitTime = 0;

  function loadPersistedState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.lang === "fr" || parsed.lang === "en") state.lang = parsed.lang;
      if (parsed.theme) state.theme = parsed.theme;
      if (parsed.dtSummaryMode) state.dtSummaryMode = parsed.dtSummaryMode;
      if (parsed.widgetSettings) state.widgetSettings = Object.assign({}, state.widgetSettings, parsed.widgetSettings);
      if (Array.isArray(parsed.savedSearches)) state.savedSearches = parsed.savedSearches;
      if (Array.isArray(parsed.notes)) state.notes = parsed.notes;
      if (parsed.readingProgress && typeof parsed.readingProgress === "object") state.readingProgress = parsed.readingProgress;
    } catch (_) {}
  }

  function saveState() {
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          lang: state.lang,
          theme: state.theme,
          dtSummaryMode: state.dtSummaryMode,
          widgetSettings: state.widgetSettings,
          savedSearches: state.savedSearches,
          notes: state.notes,
          readingProgress: state.readingProgress
        })
      );
    } catch (_) {}
  }

  function showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3400);
  }

  // Ponts globaux pour les modules
  window.DFWolToast = showToast;
  window.DFWolGetLang = () => state.lang;
  window.DFWolSwitchTab = switchTab;
  window.DFWolAddNote = function (title, tag, body) {
    state.notes.unshift({
      id: "note-" + Date.now(),
      title,
      tag: tag || "Étude Perso",
      body,
      createdAt: new Date().toISOString()
    });
    saveState();
    renderNotesList();
    showToast("Ajouté au Carnet de Notes !");
  };

  // ==========================================================================
  // Navigation, Historique & Bouton Retour Natif Android
  // ==========================================================================

  function switchTab(tabId, options = {}) {
    if (!tabId) return;
    if (tabId === "widget") tabId = "settings";
    if (!options.fromBack && state.activeTab !== tabId) {
      if (tabHistory[tabHistory.length - 1] !== tabId) {
        tabHistory.push(tabId);
        if (tabHistory.length > 25) tabHistory.shift();
      }
      if (!options.skipPushState && window.history && typeof window.history.pushState === "function") {
        try {
          window.history.pushState({ tab: tabId }, "");
        } catch (_) {}
      }
    }

    state.activeTab = tabId;
    document.querySelectorAll(".jw-nav-item").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
    document.querySelectorAll(".mbn-item").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tabId}`));

    if (tabId === "videos" && state.videosLoadedLang !== state.lang && window.DFWolVideo) {
      state.videosLoadedLang = state.lang;
      window.DFWolVideo.loadVideoCategories(state.lang);
    }
    if (tabId === "reader" && window.DFWolReader && !window.DFWolReader.getCurrentArticleData() && !options.skipAutoMeetings) {
      const info = window.DFWolBible.getIsoWeekInfo(new Date(), state.lang);
      window.DFWolReader.openArticleInApp(info.wolMeetingsUrl, { lang: state.lang, skipTabSwitch: true });
    }
    if (tabId === "settings") {
      updateSettingsStats();
    }
  }

  function openBibleAt(bookNum, chapter, verse = 1, lang = state.lang) {
    switchTab("bible");
    setBibleView("reader", bookNum);
    document.getElementById("picker-book").value = String(bookNum);
    populateChapterSelect(bookNum, chapter);
    window.DFWolReader.openBibleChapter(bookNum, chapter, verse, lang);
  }

  window.DFWolOpenDailyText = async function () {
    state.dtDate = new Date();
    state.dtSummaryMode = "full";
    saveState();
    switchTab("dashboard");
    document.querySelectorAll("[data-dt-view]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-dt-view") === "full");
    });
    await refreshDailyText(false);
    const dtCard = document.querySelector(".card-daily-text");
    if (dtCard) {
      dtCard.scrollIntoView({ behavior: "smooth", block: "start" });
      dtCard.classList.remove("dt-focus-flash");
      void dtCard.offsetWidth;
      dtCard.classList.add("dt-focus-flash");
    }
  };

  function handleBackNavigation() {
    const lightbox = document.getElementById("image-lightbox-modal");
    if (lightbox && !lightbox.classList.contains("hidden")) {
      lightbox.classList.add("hidden");
      return;
    }

    const peek = document.getElementById("scripture-peek-modal");
    if (peek && !peek.classList.contains("hidden")) {
      peek.classList.add("hidden");
      return;
    }

    const cmdPal = document.getElementById("cmd-palette-backdrop");
    if (cmdPal && !cmdPal.classList.contains("hidden")) {
      cmdPal.classList.add("hidden");
      return;
    }

    const qDrawer = document.getElementById("audio-queue-drawer");
    if (qDrawer && !qDrawer.classList.contains("hidden")) {
      qDrawer.classList.add("hidden");
      return;
    }

    const vidStage = document.getElementById("video-player-stage");
    if (state.activeTab === "videos" && vidStage && !vidStage.classList.contains("hidden")) {
      const vidEl = document.getElementById("dfwol-video-el");
      if (vidEl && !vidEl.paused) vidEl.pause();
      vidStage.classList.add("hidden");
      return;
    }

    if (state.activeTab === "bible" && activeBibleSubtab !== "books") {
      if (activeBibleSubtab === "reader") {
        setBibleView("chapters", selectedBibleBookNum);
      } else {
        setBibleView("books");
      }
      return;
    }

    if (state.activeTab === "reader" && window.DFWolReader && window.DFWolReader.canGoBack()) {
      if (window.DFWolReader.goBack()) return;
    }

    if (tabHistory.length > 1) {
      tabHistory.pop();
      const prevTab = tabHistory[tabHistory.length - 1] || "dashboard";
      switchTab(prevTab, { fromBack: true });
      return;
    }

    if (state.activeTab !== "dashboard") {
      switchTab("dashboard", { fromBack: true });
      return;
    }

    const now = Date.now();
    if (now - lastBackExitTime < 2200) {
      const appPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (appPlugin && typeof appPlugin.exitApp === "function") {
        appPlugin.exitApp();
      }
    } else {
      lastBackExitTime = now;
      showToast(state.lang === "en" ? "Press Back again to exit DFWol." : "Appuyez encore une fois sur Retour pour quitter DFWol.");
    }
  }

  function setupNativeBackAndLinkGuard() {
    // 1. Bouton Retour Natif Android (@capacitor/app) + Historique Web (popstate)
    const appPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (appPlugin && typeof appPlugin.addListener === "function") {
      appPlugin.addListener("backButton", () => {
        handleBackNavigation();
      });
    }

    window.addEventListener("popstate", () => {
      handleBackNavigation();
    });

    // 2. Garde global phase capture : empêche TOUTE sortie involontaire vers jw.org / wol.jw.org ou auto-ouverture
    document.addEventListener(
      "click",
      async (e) => {
        const a = e.target.closest("a[href]");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (!href || href.startsWith("javascript:")) return;

        // Liens locaux légitimes (ex: widget ./index.html)
        if (href.startsWith("./") || href.startsWith("index.html")) return;

        if (a.getAttribute("data-allow-external") === "1") {
          const capBrowser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
          if (window.DFWolNet && window.DFWolNet.isNativeCapacitor() && capBrowser && typeof capBrowser.open === "function") {
            e.preventDefault();
            e.stopPropagation();
            capBrowser.open({ url: href }).catch(() => {});
          }
          return;
        }

        if (/^(?:https?:\/\/)?(?:[^/]*\.)?(?:jw\.org|wol\.jw\.org)|^\/(?:fr|en)?\/?wol\//i.test(href)) {
          e.preventDefault();
          e.stopPropagation();
          if (window.DFWolReader && typeof window.DFWolReader.routeHrefInApp === "function") {
            const ok = await window.DFWolReader.routeHrefInApp(href, a, state.lang);
            if (!ok) {
              showToast("Lien JW/WOL conservé dans DFWol.");
            }
          }
        }
      },
      true
    );
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    const themeSel = document.getElementById("settings-theme-select");
    if (themeSel) themeSel.value = state.theme;
    saveState();
  }

  function updateGlobalLanguage(newLang) {
    const lang = newLang === "en" ? "en" : "fr";
    state.lang = lang;

    const sel = document.getElementById("global-lang-select");
    if (sel) sel.value = lang;
    const settingsLang = document.getElementById("settings-lang-select");
    if (settingsLang) settingsLang.value = lang;

    document.querySelectorAll("[data-quick-lang]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-quick-lang") === lang);
    });

    const weekInfo = window.DFWolBible.getIsoWeekInfo(new Date(), lang);
    const dashIsoWeek = document.getElementById("dash-iso-week");
    if (dashIsoWeek) dashIsoWeek.textContent = `${lang === "en" ? "Week" : "Semaine"} ${weekInfo.weekNo} (${weekInfo.isoYear})`;

    saveState();
    refreshDailyText();
    updateSearchExplainer();
    renderBibleBooksGrid("all");
    renderNotesList();
    if (window.DFWolAudio && window.DFWolAudio.populateVoiceSelector) {
      window.DFWolAudio.populateVoiceSelector(lang);
    }

    if (state.activeTab === "videos" && window.DFWolVideo) {
      state.videosLoadedLang = lang;
      window.DFWolVideo.loadVideoCategories(lang);
    }
    if (state.activeTab === "bible" && window.DFWolReader) {
      const bState = window.DFWolReader.getCurrentBibleState();
      window.DFWolReader.openBibleChapter(bState.bookNum, bState.chapter, bState.verse, lang);
    }
  }

  // ==========================================================================
  // Texte du Jour Multi-Niveaux (1 Mot / 1 Phrase / Petit Paragraphe / Complet)
  // ==========================================================================

  async function refreshDailyText(forceRefresh = false) {
    const dtDate = state.dtDate || new Date();
    const picker = document.getElementById("dash-dt-picker");
    if (picker) picker.value = dtDate.toISOString().slice(0, 10);

    const syncStatusEl = document.getElementById("dt-sync-status");
    if (syncStatusEl) syncStatusEl.textContent = "Synchronisation WOL…";

    const data = await window.DFWolDailyText.getDailyTextForDate(dtDate, state.lang, forceRefresh);
    state.dtCurrentData = data;

    renderDailyTextDisplay();
    updateWidgetPreviews(data);

    const syncInfo = await window.DFWolDailyText.syncWithCapacitorNativeWidget(data, state.widgetSettings);
    const lastSyncEl = document.getElementById("cap-last-sync-time");
    if (lastSyncEl) {
      lastSyncEl.textContent = `${syncInfo.timestamp} (${syncInfo.nativePlatform ? "Natif" : "PWA/Preferences"})`;
    }
  }

  function renderDailyTextDisplay() {
    const data = state.dtCurrentData;
    if (!data) return;
    const summaries = data.summaries || window.DFWolDailyText.generateDailyTextSummaries(data.scriptureText, data.scriptureRef, data.commentary, data.lang);

    document.getElementById("dt-formatted-date").textContent = data.formattedDate;
    document.getElementById("dt-sync-status").textContent = data.source === "wol-live" ? "● WOL En Direct" : "● Cache Local";
    document.getElementById("dt-one-word-badge").textContent = `⚡ ${summaries.oneWord}`;
    document.getElementById("dt-scripture-quote").textContent = data.scriptureText;
    document.getElementById("dt-scripture-ref-btn").textContent = `📖 ${data.scriptureRef}`;

    const summaryCard = document.getElementById("dt-summary-card");
    const commBox = document.getElementById("dt-commentary-box");

    if (state.dtSummaryMode === "oneWord") {
      summaryCard.innerHTML = `<strong>Mot-clé du jour :</strong> <span class="badge badge-amber" style="font-size:0.9rem;margin-left:0.4rem;">${window.DFWolSearch.escapeHtml(summaries.oneWord)}</span>`;
      summaryCard.classList.remove("hidden");
      commBox.classList.add("hidden");
    } else if (state.dtSummaryMode === "oneSentence") {
      summaryCard.innerHTML = `<strong>💡 En une phrase :</strong> ${window.DFWolSearch.escapeHtml(summaries.oneSentence)}`;
      summaryCard.classList.remove("hidden");
      commBox.classList.add("hidden");
    } else if (state.dtSummaryMode === "shortParagraph") {
      summaryCard.innerHTML = `<strong>📝 L'essentiel :</strong> ${window.DFWolSearch.escapeHtml(summaries.shortParagraph)}`;
      summaryCard.classList.remove("hidden");
      commBox.classList.add("hidden");
    } else {
      summaryCard.classList.add("hidden");
      commBox.innerHTML = data.commentaryHtml || window.DFWolSearch.escapeHtml(data.commentary);
      commBox.classList.remove("hidden");
      if (window.DFWolReader) {
        commBox.dataset.inappBound = "0";
        window.DFWolReader.attachInAppLinkInterceptor(commBox, data.lang);
      }
    }
  }

  function updateWidgetPreviews(dtData) {
    const data = dtData || state.dtCurrentData;
    if (!data) return;
    const summaries = data.summaries || window.DFWolDailyText.generateDailyTextSummaries(data.scriptureText, data.scriptureRef, data.commentary, data.lang);

    let bodyText = summaries.shortParagraph;
    let showBody = true;
    if (state.widgetSettings.displayMode === "oneWord") {
      showBody = false;
    } else if (state.widgetSettings.displayMode === "oneSentence") {
      bodyText = `💡 ${summaries.oneSentence}`;
    } else if (state.widgetSettings.displayMode === "full") {
      bodyText = data.commentary;
    }

    const targets = [
      {
        card: document.getElementById("studio-widget-preview"),
        word: document.getElementById("wprev-one-word"),
        date: document.getElementById("wprev-date"),
        scripture: document.getElementById("wprev-scripture"),
        ref: document.getElementById("wprev-ref"),
        comm: document.getElementById("wprev-commentary")
      },
      {
        card: document.getElementById("standalone-widget-card"),
        word: document.getElementById("sw-one-word-badge"),
        date: document.getElementById("sw-date-label"),
        scripture: document.getElementById("sw-scripture-text"),
        ref: document.getElementById("sw-scripture-ref"),
        comm: document.getElementById("sw-commentary")
      }
    ];

    targets.forEach((t) => {
      if (!t.card) return;
      t.card.className = `widget-preview-card ${state.widgetSettings.size} ${state.widgetSettings.theme}`;
      if (t.word) t.word.textContent = summaries.oneWord.toUpperCase();
      if (t.date) t.date.textContent = data.formattedDate;
      if (t.scripture) {
        t.scripture.textContent = data.scriptureText;
        t.scripture.style.fontSize = `${(state.widgetSettings.fontScale / 100) * 1.02}rem`;
      }
      if (t.ref) t.ref.textContent = `— ${data.scriptureRef}`;
      if (t.comm) {
        t.comm.textContent = bodyText;
        t.comm.classList.toggle("hidden", !showBody);
      }
    });
  }

  // ==========================================================================
  // Recherche Totale (Tout ouvrir dans l'App)
  // ==========================================================================

  function getSearchParams() {
    return {
      query: (document.getElementById("adv-search-input")?.value || "").trim(),
      scope: document.getElementById("filter-scope")?.value || "all",
      engine: document.getElementById("filter-engine")?.value || "auto",
      proximity: document.getElementById("filter-proximity")?.value || "par",
      sort: document.getElementById("filter-sort")?.value || "occ",
      lang: state.lang
    };
  }

  function updateSearchExplainer() {
    const params = getSearchParams();
    const el = document.getElementById("query-explainer-text");
    if (el) el.innerHTML = window.DFWolSearch.explainWolQuery(params);
  }

  async function executeUnifiedSearch() {
    const params = getSearchParams();
    const container = document.getElementById("live-results-container");
    const statusBadge = document.getElementById("live-results-status");
    if (!container) return;

    if (!params.query) {
      showToast("Saisissez un terme de recherche.");
      return;
    }

    updateSearchExplainer();
    if (statusBadge) statusBadge.textContent = "Recherche en cours…";
    container.innerHTML = `<div class="loading-box">🔍 Recherche dans JW.org et WOL.jw.org…</div>`;

    const detectedVerses = window.DFWolBible.parseScriptureReferences(params.query, params.lang);
    const res = await window.DFWolSearch.runUnifiedSearch(params);

    let html = "";

    // 1. Versets détectés ouvrables directement dans l'app
    detectedVerses.forEach((v) => {
      html += `
        <div class="result-item-card">
          <div class="result-item-content">
            <span class="badge badge-emerald">Verset Biblique</span>
            <h4>📖 ${window.DFWolSearch.escapeHtml(v.label)}</h4>
            <p>Ouvrir directement le chapitre, les notes d'étude et les articles du Guide de recherche.</p>
            <div class="result-meta-links">
              <button type="button" class="btn-primary btn-xs" data-inapp-bible="${v.bookNum}:${v.chapter}:${v.verseStart || 1}">📖 Lire dans l'app</button>
              <button type="button" class="btn-accent btn-xs" data-open-bible-chapter="${v.bookNum}:${v.chapter}:${v.verseStart || 1}">🧭 Chapitre &amp; Guide de recherche</button>
            </div>
          </div>
        </div>
      `;
    });

    // 2. Résultats directs JW.org (Vidéos + sous-titres, Publications, Bible, Audio, Index)
    const allItems = [...(res.jwItems || []), ...(res.wolItems || [])];
    if (allItems.length === 0 && detectedVerses.length === 0) {
      html += `
        <div class="empty-state">
          <p>Aucun résultat direct trouvé pour « ${window.DFWolSearch.escapeHtml(params.query)} ».</p>
          ${res.errors.length ? `<small style="color:var(--accent-amber);">${window.DFWolSearch.escapeHtml(res.errors.join(" • "))}</small>` : ""}
        </div>
      `;
    } else {
      allItems.forEach((item, idx) => {
        const isVideo = item.subtype === "video" || (item.lank && item.lank.endsWith("_VIDEO"));
        const isAudio = item.subtype === "audio";
        const thumbHtml = item.imageUrl
          ? `<img src="${window.DFWolSearch.escapeHtml(item.imageUrl)}" alt="" class="result-item-thumb" loading="lazy" />`
          : "";

        let actionsHtml = "";
        if (isVideo && item.lank) {
          actionsHtml += `<button type="button" class="btn-primary btn-xs" data-play-video-lank="${window.DFWolSearch.escapeHtml(item.lank)}" data-play-video-ts="0">🎬 Lire vidéo &amp; sous-titres</button>`;
          (item.deepLinks || []).slice(0, 3).forEach((dl) => {
            const url = (dl.urls && dl.urls["jw.org"]) || "";
            const mTs = url.match(/[?&]ts=([\d.]+)/);
            const ts = mTs ? parseFloat(mTs[1]) : 0;
            actionsHtml += `<button type="button" class="btn-accent btn-xs" data-play-video-lank="${window.DFWolSearch.escapeHtml(item.lank)}" data-play-video-ts="${ts}">⏱️ ${window.DFWolSearch.escapeHtml(dl.jumpLabel || `${Math.floor(ts)}s`)}</button>`;
          });
        } else {
          if (item.wolUrl) {
            actionsHtml += `<button type="button" class="btn-primary btn-xs" data-read-wol="${window.DFWolSearch.escapeHtml(item.wolUrl)}">📖 Lire dans l'app</button>`;
            actionsHtml += `<button type="button" class="btn-secondary btn-xs" data-listen-wol="${window.DFWolSearch.escapeHtml(item.wolUrl)}" data-listen-title="${window.DFWolSearch.escapeHtml(item.title)}">🎧 Écouter</button>`;
            actionsHtml += `<button type="button" class="btn-ghost btn-xs" data-queue-wol="${window.DFWolSearch.escapeHtml(item.wolUrl)}" data-listen-title="${window.DFWolSearch.escapeHtml(item.title)}">+ File</button>`;
          } else if (item.jwUrl) {
            const parsedTarget = window.DFWolBible.parseWolUrlTarget(item.jwUrl);
            if (parsedTarget.type === "bible") {
              actionsHtml += `<button type="button" class="btn-primary btn-xs" data-open-bible-chapter="${parsedTarget.bookNum}:${parsedTarget.chapter}:${parsedTarget.verse || 1}">📖 Ouvrir dans Bible</button>`;
            } else if (parsedTarget.type === "article") {
              actionsHtml += `<button type="button" class="btn-primary btn-xs" data-read-wol="${window.DFWolSearch.escapeHtml(parsedTarget.url)}">📖 Lire dans l'app</button>`;
            }
          }
          if (isAudio && item.lank) {
            actionsHtml += `<button type="button" class="btn-accent btn-xs" data-play-mediator-audio="${window.DFWolSearch.escapeHtml(item.lank)}" data-listen-title="${window.DFWolSearch.escapeHtml(item.title)}">🎧 Écouter Audio</button>`;
          }
        }

        const badgeLabel = isVideo ? "Vidéo" : isAudio ? "Audio" : item.source === "wol-html" ? "WOL" : item.context || item.subtype;
        html += `
          <div class="result-item-card">
            ${thumbHtml}
            <div class="result-item-content">
              <span class="badge badge-subtle">${window.DFWolSearch.escapeHtml(badgeLabel)}</span>
              <h4>${window.DFWolSearch.escapeHtml(item.title)}</h4>
              ${item.snippetHtml ? `<p>${item.snippetHtml}</p>` : ""}
              <div class="result-meta-links">${actionsHtml}</div>
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
    if (statusBadge) statusBadge.textContent = `● ${allItems.length + detectedVerses.length} résultats`;

    if (window.DFWolReader) {
      container.dataset.inappBound = "0";
      window.DFWolReader.attachInAppLinkInterceptor(container, params.lang);
    }
  }

  function renderSavedSearches() {
    const container = document.getElementById("saved-searches-container");
    if (!container) return;
    if (!state.savedSearches.length) {
      container.innerHTML = `<p class="card-helper-text">Aucun favori.</p>`;
      return;
    }
    container.innerHTML = state.savedSearches
      .map(
        (item, idx) => `
        <div class="saved-query-item">
          <button type="button" class="saved-query-btn" data-load-saved="${idx}">🔍 ${window.DFWolSearch.escapeHtml(item.query)}</button>
          <button type="button" class="btn-icon-xs" data-delete-saved="${idx}">✕</button>
        </div>
      `
      )
      .join("");
  }

  // ==========================================================================
  // Bible façon JW Library (Livres 6 colonnes -> Chapitres -> Lecture) + Lot
  // ==========================================================================

  let activeBibleSubtab = "books";
  let selectedBibleBookNum = 1;

  function setBibleView(viewName, bookNum = selectedBibleBookNum) {
    activeBibleSubtab = viewName;
    if (bookNum) selectedBibleBookNum = Number(bookNum);

    const viewIds = ["books", "chapters", "reader", "batch", "appendices"];
    viewIds.forEach((v) => {
      document.getElementById(`bible-view-${v}`)?.classList.toggle("hidden", v !== viewName);
    });

    const subtabHighlight = viewName === "chapters" ? "books" : viewName;
    document.querySelectorAll("[data-bible-subtab]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-bible-subtab") === subtabHighlight);
    });

    const backBtn = document.getElementById("btn-bible-back");
    const topTitle = document.getElementById("bible-top-title");
    const topSub = document.getElementById("bible-top-sub");
    const book = window.DFWolBible.getBookByNumber(selectedBibleBookNum);
    const bookName = window.DFWolBible.getBookDisplayName(book, state.lang);
    const studyTitle = state.lang === "en" ? "Study Bible" : "Bible d'étude";
    const langLabel = state.lang === "en" ? "English" : "Français";

    if (viewName === "chapters") {
      backBtn?.classList.remove("hidden");
      if (topTitle) topTitle.textContent = bookName;
      if (topSub) topSub.textContent = studyTitle;
      renderBibleChaptersGrid(selectedBibleBookNum);
    } else if (viewName === "reader") {
      backBtn?.classList.remove("hidden");
      const curCh = window.DFWolReader?.getCurrentBibleState()?.chapter || 1;
      if (topTitle) topTitle.textContent = `${bookName} ${curCh}`;
      if (topSub) topSub.textContent = studyTitle;
    } else {
      backBtn?.classList.add("hidden");
      if (topTitle) topTitle.textContent = studyTitle;
      if (topSub) topSub.textContent = langLabel;
    }
  }

  function populateBibleSelects() {
    const books = window.DFWolBible.BIBLE_BOOKS;
    const bookSelect = document.getElementById("picker-book");
    const readSelect = document.getElementById("reading-book-select");

    const opts = books
      .map((b) => `<option value="${b.num}">${b.num}. ${window.DFWolBible.getBookDisplayName(b, state.lang)} (${b.chapters})</option>`)
      .join("");

    if (bookSelect) {
      bookSelect.innerHTML = opts;
      bookSelect.value = "19";
    }
    if (readSelect) {
      readSelect.innerHTML = opts;
    }
    populateChapterSelect(19, 83);
    renderReadingTrackerGrid(1);
  }

  function populateChapterSelect(bookNum, defaultCh = 1) {
    const book = window.DFWolBible.getBookByNumber(bookNum);
    const chSelect = document.getElementById("picker-chapter");
    if (!chSelect || !book) return;
    let html = "";
    for (let i = 1; i <= book.chapters; i++) {
      html += `<option value="${i}">Chap. ${i}</option>`;
    }
    chSelect.innerHTML = html;
    chSelect.value = String(Math.min(book.chapters, defaultCh));
  }

  function renderBibleBooksGrid() {
    const hebGrid = document.getElementById("bible-hebrew-grid");
    const grkGrid = document.getElementById("bible-greek-grid");
    const hebHead = document.getElementById("bible-hebrew-heading");
    const grkHead = document.getElementById("bible-greek-heading");

    if (hebHead) {
      hebHead.textContent = state.lang === "en" ? "HEBREW-ARAMAIC SCRIPTURES" : "ÉCRITURES HÉBRAÏQUES ET ARAMÉENNES";
    }
    if (grkHead) {
      grkHead.textContent = state.lang === "en" ? "CHRISTIAN GREEK SCRIPTURES" : "ÉCRITURES GRECQUES CHRÉTIENNES";
    }

    const renderTile = (b) => {
      const abbr = state.lang === "en" ? b.abbrEn || b.abbr : b.abbr;
      const fullName = window.DFWolBible.getBookDisplayName(b, state.lang);
      return `<button type="button" class="bible-jwl-tile group-${b.group}" data-pick-book="${b.num}" title="${fullName}">${window.DFWolSearch.escapeHtml(abbr)}</button>`;
    };

    if (hebGrid) {
      hebGrid.innerHTML = window.DFWolBible.BIBLE_BOOKS.filter((b) => b.section === "hebrew")
        .map(renderTile)
        .join("");
    }
    if (grkGrid) {
      grkGrid.innerHTML = window.DFWolBible.BIBLE_BOOKS.filter((b) => b.section === "greek")
        .map(renderTile)
        .join("");
    }
  }

  function renderBibleChaptersGrid(bookNum) {
    const grid = document.getElementById("bible-chapters-grid");
    const introLabel = document.getElementById("bible-book-intro-label");
    const book = window.DFWolBible.getBookByNumber(bookNum);
    if (!grid || !book) return;

    const bookName = window.DFWolBible.getBookDisplayName(book, state.lang);
    const readSet = new Set(state.readingProgress[String(book.num)] || []);
    let html = "";
    for (let ch = 1; ch <= book.chapters; ch++) {
      html += `<button type="button" class="bible-jwl-ch-tile ${readSet.has(ch) ? "is-read" : ""}" data-pick-chapter="${ch}">${ch}</button>`;
    }
    grid.innerHTML = html;

    if (introLabel) {
      introLabel.textContent = state.lang === "en" ? `Introduction to ${bookName}` : `Introduction à ${bookName}`;
    }
  }

  async function runBatchResearchGuideExtraction() {
    const input = document.getElementById("batch-scripture-input");
    const statusEl = document.getElementById("batch-rsg-status");
    const toolbar = document.getElementById("batch-rsg-toolbar");
    const grid = document.getElementById("batch-scripture-results");
    if (!input || !grid) return;

    const raw = input.value.trim();
    if (!raw) {
      showToast("Saisissez au moins un verset ou une plage (ex: Ps 83:18 ; Jean 17:3).");
      return;
    }

    const expand = document.getElementById("batch-expand-ranges")?.checked !== false;
    statusEl?.classList.remove("hidden");
    if (statusEl) statusEl.textContent = "⏳ Analyse des versets…";
    toolbar?.classList.add("hidden");
    grid.innerHTML = `<div class="loading-box">⏳ Extraction des articles du Guide de recherche…</div>`;

    const res = await window.DFWolReader.extractResearchGuideForBatch(raw, state.lang, expand, (msg) => {
      if (statusEl) statusEl.textContent = `⏳ ${msg}`;
    });

    if (res.refs.length === 0) {
      if (statusEl) statusEl.textContent = "Aucune référence biblique reconnue.";
      grid.innerHTML = "";
      return;
    }

    if (res.articles.length === 0) {
      if (statusEl) statusEl.textContent = `${res.refs.length} verset(s) analysé(s) — Aucune entrée du Guide de recherche trouvée.`;
      grid.innerHTML = "";
      return;
    }

    if (statusEl) {
      statusEl.textContent = `✅ ${res.articles.length} article(s) uniques extraits pour ${res.refs.length} verset(s) !`;
    }
    toolbar?.classList.remove("hidden");

    grid.innerHTML = res.articles
      .map(
        (art, idx) => `
        <div class="verse-card">
          <div class="verse-card-header">
            <label class="checkbox-inline" style="align-items:flex-start;">
              <input type="checkbox" class="batch-art-check" data-art-idx="${idx}" checked />
              <span class="verse-card-title">${window.DFWolSearch.escapeHtml(art.title)}</span>
            </label>
          </div>
          <small style="color:var(--text-secondary);">${window.DFWolSearch.escapeHtml(art.citation)}</small>
          <div style="display:flex;flex-wrap:wrap;gap:0.25rem;">
            ${art.verses.map((v) => `<span class="badge badge-blue">${window.DFWolSearch.escapeHtml(v)}</span>`).join("")}
          </div>
          <div class="verse-card-links">
            <button type="button" class="btn-primary btn-xs" data-open-wol-article="${window.DFWolSearch.escapeHtml(art.wolUrl)}">📖 Lire dans l'app</button>
            <button type="button" class="btn-secondary btn-xs" data-play-batch-one="${idx}">🎧 Écouter</button>
          </div>
        </div>
      `
      )
      .join("");

    grid.dataset.inappBound = "0";
    window.DFWolReader.attachInAppLinkInterceptor(grid, state.lang);
  }

  function getSelectedBatchArticles() {
    const all = window.DFWolReader.getBatchExtractedArticles();
    const checkedIndices = Array.from(document.querySelectorAll(".batch-art-check:checked")).map((cb) =>
      Number(cb.getAttribute("data-art-idx"))
    );
    return checkedIndices.map((i) => all[i]).filter(Boolean);
  }

  // ==========================================================================
  // Carnet de Notes & Suivi des 1 189 Chapitres
  // ==========================================================================

  function renderNotesList() {
    const container = document.getElementById("notes-list-container");
    const filterVal = (document.getElementById("notes-filter-input")?.value || "").toLowerCase().trim();
    const dashCount = document.getElementById("dash-notes-count");
    if (dashCount) dashCount.textContent = `${state.notes.length} note${state.notes.length > 1 ? "s" : ""}`;
    if (!container) return;

    const filtered = state.notes.filter(
      (n) =>
        !filterVal ||
        (n.title || "").toLowerCase().includes(filterVal) ||
        (n.body || "").toLowerCase().includes(filterVal)
    );

    if (!filtered.length) {
      container.innerHTML = `<p class="card-helper-text">Aucune note.</p>`;
      return;
    }

    container.innerHTML = filtered
      .map((n) => {
        const escaped = window.DFWolSearch.escapeHtml(n.body);
        const linked = window.DFWolBible.linkifyScripturesInHtml(escaped, state.lang);
        return `
          <div class="note-item-card">
            <div class="note-item-header">
              <div>
                <span class="badge badge-blue">${window.DFWolSearch.escapeHtml(n.tag)}</span>
                <strong style="margin-left:0.4rem;">${window.DFWolSearch.escapeHtml(n.title)}</strong>
              </div>
              <button type="button" class="btn-icon-xs" data-delete-note="${n.id}">🗑️</button>
            </div>
            <div class="note-item-body">${linked}</div>
          </div>
        `;
      })
      .join("");

    if (window.DFWolReader) {
      container.dataset.inappBound = "0";
      window.DFWolReader.attachInAppLinkInterceptor(container, state.lang);
    }
  }

  function renderReadingTrackerGrid(bookNum) {
    const book = window.DFWolBible.getBookByNumber(bookNum);
    const grid = document.getElementById("reading-chapters-grid");
    if (!grid || !book) return;
    const readSet = new Set(state.readingProgress[String(book.num)] || []);
    let html = "";
    for (let ch = 1; ch <= book.chapters; ch++) {
      html += `<button type="button" class="chapter-check-btn ${readSet.has(ch) ? "read" : ""}" data-toggle-ch="${ch}" data-book="${book.num}">${ch}</button>`;
    }
    grid.innerHTML = html;

    let totalRead = 0;
    Object.values(state.readingProgress).forEach((arr) => {
      if (Array.isArray(arr)) totalRead += arr.length;
    });
    const pct = ((totalRead / 1189) * 100).toFixed(1);
    document.getElementById("reading-percent-label").textContent = `${pct}%`;
    document.getElementById("reading-count-label").textContent = `${totalRead} / 1 189 chapitres`;
    document.getElementById("reading-progress-fill").style.width = `${Math.min(100, pct)}%`;
    document.getElementById("dash-reading-progress").textContent = `${totalRead} / 1189 ch.`;
  }

  // ==========================================================================
  // OmniBar & Palette de Commandes
  // ==========================================================================

  function setupOmnibar() {
    const form = document.getElementById("omnibar-form");
    const input = document.getElementById("omnibar-input");
    const badge = document.getElementById("omnibar-detected-badge");
    if (!form || !input || !badge) return;

    input.addEventListener("input", () => {
      const val = input.value.trim();
      if (!val) {
        badge.textContent = "Auto";
        badge.className = "omnibar-badge";
        return;
      }
      const v = window.DFWolBible.parseSingleVerseQuery(val, state.lang);
      if (v) {
        badge.textContent = `📖 ${v.label}`;
        badge.className = "omnibar-badge is-verse";
      } else if (/[&|!*?#"]/.test(val)) {
        badge.textContent = "⚡ WOL Booléen";
        badge.className = "omnibar-badge is-boolean";
      } else {
        badge.textContent = "🔍 Tout chercher";
        badge.className = "omnibar-badge";
      }
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;
      const v = window.DFWolBible.parseSingleVerseQuery(val, state.lang);
      if (v) {
        openBibleAt(v.bookNum, v.chapter, v.verseStart || 1, state.lang);
      } else {
        switchTab("search");
        document.getElementById("adv-search-input").value = val;
        executeUnifiedSearch();
      }
    });
  }

  function setupCommandPalette() {
    const backdrop = document.getElementById("cmd-palette-backdrop");
    const input = document.getElementById("cmd-palette-input");
    const list = document.getElementById("cmd-palette-list");
    if (!backdrop || !input || !list) return;

    const cmds = [
      { label: "⚡ Accueil & Texte du Jour", fn: () => switchTab("dashboard") },
      { label: "🔍 Recherche Totale (Vidéos, Pubs, Bible, Audio)", fn: () => switchTab("search") },
      { label: "📖 Bible Intégrée & Guide de Recherche en Lot", fn: () => switchTab("bible") },
      { label: "🎬 Vidéos & Extracteur de Sous-titres", fn: () => switchTab("videos") },
      { label: "📚 Réunions & Publications", fn: () => switchTab("reader") },
      { label: "⚙️ Paramètres, Export & Notes", fn: () => switchTab("settings") },
      { label: "🌍 Basculer FR ↔ EN", fn: () => updateGlobalLanguage(state.lang === "fr" ? "en" : "fr") },
      { label: "🌓 Thème Clair / Sombre", fn: () => applyTheme(state.theme === "dark" ? "light" : "dark") }
    ];

    const renderList = (q = "") => {
      const low = q.trim().toLowerCase();
      let html = "";
      const v = window.DFWolBible.parseSingleVerseQuery(q, state.lang);
      if (v) {
        html += `<button type="button" class="cmd-item" data-cmd-verse="${v.bookNum}:${v.chapter}:${v.verseStart || 1}"><span>📖 Ouvrir <strong>${window.DFWolSearch.escapeHtml(v.label)}</strong> dans l'app</span><kbd>Entrée</kbd></button>`;
      }
      cmds
        .filter((c) => !low || c.label.toLowerCase().includes(low))
        .forEach((c, idx) => {
          html += `<button type="button" class="cmd-item" data-cmd-idx="${idx}"><span>${c.label}</span><kbd>→</kbd></button>`;
        });
      list.innerHTML = html;

      list.querySelector("[data-cmd-verse]")?.addEventListener("click", (e) => {
        const [b, c, vr] = e.currentTarget.getAttribute("data-cmd-verse").split(":").map(Number);
        backdrop.classList.add("hidden");
        switchTab("bible");
        window.DFWolReader.openBibleChapter(b, c, vr, state.lang);
      });
      list.querySelectorAll("[data-cmd-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const filtered = cmds.filter((c) => !low || c.label.toLowerCase().includes(low));
          const target = filtered[Number(btn.getAttribute("data-cmd-idx"))];
          backdrop.classList.add("hidden");
          target && target.fn();
        });
      });
    };

    const open = () => {
      backdrop.classList.remove("hidden");
      input.value = "";
      renderList("");
      setTimeout(() => input.focus(), 30);
    };

    document.getElementById("btn-cmd-palette")?.addEventListener("click", open);
    document.getElementById("btn-close-cmd")?.addEventListener("click", () => backdrop.classList.add("hidden"));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.add("hidden");
    });
    input.addEventListener("input", () => renderList(input.value));

    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        backdrop.classList.contains("hidden") ? open() : backdrop.classList.add("hidden");
      } else if (e.key === "Escape") {
        backdrop.classList.add("hidden");
        document.getElementById("scripture-peek-modal")?.classList.add("hidden");
      } else if (e.altKey && /^[1-6]$/.test(e.key)) {
        const map = { "1": "dashboard", "2": "bible", "3": "search", "4": "reader", "5": "videos", "6": "settings" };
        if (map[e.key]) {
          e.preventDefault();
          switchTab(map[e.key]);
        }
      }
    });
  }

  // ==========================================================================
  // Câblage complet des Événements
  // ==========================================================================

  function bindAllEvents() {
    document.querySelectorAll(".jw-nav-item, .mbn-item").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
    });
    document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.getAttribute("data-goto-tab")));
    });

    document.getElementById("btn-mobile-menu")?.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.toggle("open");
    });
    document.getElementById("btn-theme-toggle")?.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });

    document.getElementById("global-lang-select")?.addEventListener("change", (e) => updateGlobalLanguage(e.target.value));
    document.querySelectorAll("[data-quick-lang]").forEach((btn) => {
      btn.addEventListener("click", () => updateGlobalLanguage(btn.getAttribute("data-quick-lang")));
    });

    // Raccourcis Réunions & Publications dans l'app
    const openMeetingsInApp = () => {
      const info = window.DFWolBible.getIsoWeekInfo(new Date(), state.lang);
      window.DFWolReader.openArticleInApp(info.wolMeetingsUrl, { lang: state.lang });
    };
    const openInsightInApp = () => {
      const cfg = window.DFWolBible.getLangConfig(state.lang);
      window.DFWolReader.openArticleInApp(`https://wol.jw.org/${cfg.code}/wol/lv/${cfg.r}/${cfg.lp}/0/2`, { lang: state.lang });
    };
    const openRsgInApp = () => {
      const cfg = window.DFWolBible.getLangConfig(state.lang);
      window.DFWolReader.openArticleInApp(`https://wol.jw.org/${cfg.code}/wol/lv/${cfg.r}/${cfg.lp}/0/21275`, { lang: state.lang });
    };
    const openDxInApp = () => {
      const cfg = window.DFWolBible.getLangConfig(state.lang);
      window.DFWolReader.openArticleInApp(`https://wol.jw.org/${cfg.code}/wol/lv/${cfg.r}/${cfg.lp}/0/22625`, { lang: state.lang });
    };

    ["sb-open-meetings", "dash-open-week-inapp", "tile-open-meetings", "rq-meetings"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", openMeetingsInApp);
    });
    ["sb-open-insight", "tile-open-insight", "rq-insight"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", openInsightInApp);
    });
    ["sb-open-rsg", "rq-rsg"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", openRsgInApp);
    });
    document.getElementById("tile-open-rsg")?.addEventListener("click", () => switchTab("bible"));
    document.getElementById("tile-open-wt")?.addEventListener("click", () => {
      switchTab("search");
      document.getElementById("filter-scope").value = "publications";
      document.getElementById("adv-search-input").value = state.lang === "en" ? "Watchtower" : "Tour de Garde";
      executeUnifiedSearch();
    });
    document.getElementById("rq-dailytext")?.addEventListener("click", () => {
      const url = window.DFWolDailyText.buildWolDailyTextUrl(state.dtDate, state.lang);
      window.DFWolReader.openArticleInApp(url, { lang: state.lang });
    });
    document.getElementById("rq-dx")?.addEventListener("click", openDxInApp);

    // Texte du Jour
    document.querySelectorAll("[data-dt-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const d = Number(btn.getAttribute("data-dt-nav"));
        if (d === 0) state.dtDate = new Date();
        else {
          const next = new Date(state.dtDate);
          next.setDate(next.getDate() + d);
          state.dtDate = next;
        }
        refreshDailyText();
      });
    });

    document.getElementById("dash-dt-picker")?.addEventListener("change", (e) => {
      if (e.target.value) {
        state.dtDate = new Date(e.target.value + "T12:00:00");
        refreshDailyText();
      }
    });

    document.querySelectorAll("[data-dt-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-dt-view]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.dtSummaryMode = btn.getAttribute("data-dt-view");
        saveState();
        renderDailyTextDisplay();
      });
    });

    const speakDailyText = () => {
      if (!state.dtCurrentData || !window.DFWolAudio) return;
      const d = state.dtCurrentData;
      const fullRef = window.DFWolBible.expandScriptureRefFull(d.scriptureRef, d.lang);
      window.DFWolAudio.playTrack({
        title: `Texte du jour — ${fullRef}`,
        subtitle: d.formattedDate,
        text: `${d.formattedDate}. ${d.scriptureText}. ${fullRef}. ${d.commentary}`,
        lang: d.lang,
        mode: "tts"
      });
    };
    document.getElementById("btn-dt-speak")?.addEventListener("click", speakDailyText);
    document.getElementById("sw-btn-speak")?.addEventListener("click", speakDailyText);

    const openDtVerseInApp = () => {
      if (!state.dtCurrentData) return;
      const refs = window.DFWolBible.parseScriptureReferences(state.dtCurrentData.scriptureRef, state.lang);
      if (refs.length > 0) {
        const r = refs[0];
        openBibleAt(r.bookNum, r.chapter, r.verseStart || 1, state.lang);
      }
    };
    document.getElementById("dt-scripture-ref-btn")?.addEventListener("click", openDtVerseInApp);
    document.getElementById("btn-dt-open-inapp")?.addEventListener("click", openDtVerseInApp);

    document.getElementById("btn-dt-copy")?.addEventListener("click", async () => {
      if (!state.dtCurrentData) return;
      const d = state.dtCurrentData;
      const s = d.summaries;
      const text = `${d.formattedDate} [${s.oneWord}]\n${d.scriptureText} (${d.scriptureRef})\n\n💡 ${s.oneSentence}\n\n${d.commentary}`;
      await navigator.clipboard.writeText(text);
      showToast("Texte du jour + résumé copiés !");
    });

    document.getElementById("btn-dt-save-note")?.addEventListener("click", () => {
      if (!state.dtCurrentData) return;
      const d = state.dtCurrentData;
      window.DFWolAddNote(`Texte du jour — ${d.scriptureRef}`, "Texte du Jour", `${d.scriptureText}\n\n${d.commentary}`);
    });

    // Ouverture rapide verset Dashboard
    document.getElementById("quick-verse-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("quick-verse-input")?.value || "";
      const refs = window.DFWolBible.parseScriptureReferences(val, state.lang);
      if (!refs.length) return showToast("Référence non reconnue.");
      openBibleAt(refs[0].bookNum, refs[0].chapter, refs[0].verseStart || 1, state.lang);
    });
    document.querySelectorAll("[data-sample-verse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-sample-verse");
        const refs = window.DFWolBible.parseScriptureReferences(val, state.lang);
        if (refs.length) {
          openBibleAt(refs[0].bookNum, refs[0].chapter, refs[0].verseStart || 1, state.lang);
        }
      });
    });

    // Recherche Totale
    document.querySelectorAll("[data-scope-pill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-scope-pill]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const scopeSel = document.getElementById("filter-scope");
        if (scopeSel) scopeSel.value = btn.getAttribute("data-scope-pill");
        updateSearchExplainer();
        if (document.getElementById("adv-search-input")?.value.trim()) {
          executeUnifiedSearch();
        }
      });
    });

    const advInput = document.getElementById("adv-search-input");
    document.querySelectorAll(".op-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!advInput) return;
        const op = btn.getAttribute("data-op");
        const wrap = btn.getAttribute("data-op-wrap");
        const start = advInput.selectionStart || advInput.value.length;
        const end = advInput.selectionEnd || advInput.value.length;
        const sel = advInput.value.slice(start, end);
        if (wrap === '"') advInput.setRangeText(`"${sel || "expression exacte"}"`, start, end, "end");
        else if (wrap === "()") advInput.setRangeText(`(${sel || "a | b"})`, start, end, "end");
        else if (op) advInput.setRangeText(op, start, end, "end");
        advInput.focus();
        updateSearchExplainer();
      });
    });

    ["adv-search-input", "filter-scope", "filter-engine", "filter-proximity", "filter-sort"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", updateSearchExplainer);
      document.getElementById(id)?.addEventListener("change", updateSearchExplainer);
    });

    document.getElementById("btn-clear-search")?.addEventListener("click", () => {
      if (advInput) advInput.value = "";
      updateSearchExplainer();
    });

    document.getElementById("advanced-search-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      executeUnifiedSearch();
    });

    document.getElementById("btn-launch-wol")?.addEventListener("click", () => {
      const urls = window.DFWolSearch.buildSearchUrls(getSearchParams());
      window.open(urls.wolUrl, "_blank", "noopener");
    });
    document.getElementById("btn-launch-jw")?.addEventListener("click", () => {
      const urls = window.DFWolSearch.buildSearchUrls(getSearchParams());
      window.open(urls.jwUrl, "_blank", "noopener");
    });

    document.getElementById("btn-save-query")?.addEventListener("click", () => {
      const p = getSearchParams();
      if (!p.query) return;
      state.savedSearches.unshift(p);
      saveState();
      renderSavedSearches();
      showToast("Recherche sauvegardée !");
    });
    document.getElementById("btn-clear-history")?.addEventListener("click", () => {
      state.savedSearches = [];
      saveState();
      renderSavedSearches();
    });
    document.getElementById("saved-searches-container")?.addEventListener("click", (e) => {
      const loadBtn = e.target.closest("[data-load-saved]");
      const delBtn = e.target.closest("[data-delete-saved]");
      if (loadBtn) {
        const item = state.savedSearches[Number(loadBtn.getAttribute("data-load-saved"))];
        if (item && advInput) {
          advInput.value = item.query;
          executeUnifiedSearch();
        }
      } else if (delBtn) {
        state.savedSearches.splice(Number(delBtn.getAttribute("data-delete-saved")), 1);
        saveState();
        renderSavedSearches();
      }
    });

    document.querySelectorAll(".preset-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        advInput.value = btn.getAttribute("data-preset-q") || "";
        document.getElementById("filter-engine").value = "wol";
        advInput.focus();
        updateSearchExplainer();
      });
    });

    // Délégation des actions sur les cartes de résultats de recherche
    document.getElementById("live-results-container")?.addEventListener("click", async (e) => {
      const vidBtn = e.target.closest("[data-play-video-lank]");
      if (vidBtn) {
        const lank = vidBtn.getAttribute("data-play-video-lank");
        const ts = parseFloat(vidBtn.getAttribute("data-play-video-ts") || "0");
        window.DFWolVideo.openVideoInApp(lank, { startTime: ts, lang: state.lang });
        return;
      }

      const readBtn = e.target.closest("[data-read-wol]");
      if (readBtn) {
        window.DFWolReader.openArticleInApp(readBtn.getAttribute("data-read-wol"), { lang: state.lang });
        return;
      }

      const bibBtn = e.target.closest("[data-open-bible-chapter]");
      if (bibBtn) {
        const [b, c, v] = bibBtn.getAttribute("data-open-bible-chapter").split(":").map(Number);
        openBibleAt(b, c, v || 1, state.lang);
        return;
      }

      const listenBtn = e.target.closest("[data-listen-wol]");
      if (listenBtn) {
        window.DFWolAudio.playTrack({
          title: listenBtn.getAttribute("data-listen-title") || "Article WOL",
          wolUrl: listenBtn.getAttribute("data-listen-wol"),
          lang: state.lang,
          mode: "auto"
        });
        return;
      }

      const queueBtn = e.target.closest("[data-queue-wol]");
      if (queueBtn) {
        window.DFWolAudio.addToQueue({
          title: queueBtn.getAttribute("data-listen-title") || "Article WOL",
          wolUrl: queueBtn.getAttribute("data-queue-wol"),
          lang: state.lang,
          mode: "auto"
        });
        showToast("Ajouté à la file d'attente audio !");
        return;
      }

      const medAudioBtn = e.target.closest("[data-play-mediator-audio]");
      if (medAudioBtn) {
        const lank = medAudioBtn.getAttribute("data-play-mediator-audio");
        try {
          const ll = window.DFWolNet.getLangLetter(state.lang);
          const data = await window.DFWolNet.mediatorGet(`media-items/${ll}/${encodeURIComponent(lank)}?clientType=www`);
          const f = data?.media?.[0]?.files?.[0];
          if (f && f.progressiveDownloadURL) {
            window.DFWolAudio.playTrack({
              title: data.media[0].title,
              subtitle: "Audio JW.org",
              audioUrl: f.progressiveDownloadURL,
              lang: state.lang,
              mode: "mp3"
            });
          }
        } catch (err) {
          showToast(err.message);
        }
      }
    });

    // Bible façon JW Library + Navigation Livres -> Chapitres -> Lecture
    document.querySelectorAll("[data-bible-subtab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const st = btn.getAttribute("data-bible-subtab");
        if (st === "reader" && !window.DFWolReader.getCurrentBibleState().primaryData) {
          openBibleAt(selectedBibleBookNum, 1, 1, state.lang);
        } else {
          setBibleView(st, selectedBibleBookNum);
        }
      });
    });

    document.getElementById("btn-bible-back")?.addEventListener("click", () => {
      if (activeBibleSubtab === "reader") setBibleView("chapters", selectedBibleBookNum);
      else setBibleView("books");
    });

    document.getElementById("btn-bible-top-search")?.addEventListener("click", () => switchTab("search"));
    document.getElementById("btn-bible-top-batch")?.addEventListener("click", () => setBibleView("batch"));
    document.getElementById("btn-bible-top-audio")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      window.DFWolReader.playBibleChapterAudio(cur.bookNum || selectedBibleBookNum, cur.chapter || 1, state.lang);
    });

    const handleBookPick = (e) => {
      const tile = e.target.closest("[data-pick-book]");
      if (!tile) return;
      const bNum = Number(tile.getAttribute("data-pick-book"));
      document.getElementById("picker-book").value = String(bNum);
      populateChapterSelect(bNum, 1);
      setBibleView("chapters", bNum);
    };
    document.getElementById("bible-hebrew-grid")?.addEventListener("click", handleBookPick);
    document.getElementById("bible-greek-grid")?.addEventListener("click", handleBookPick);

    document.getElementById("bible-chapters-grid")?.addEventListener("click", (e) => {
      const tile = e.target.closest("[data-pick-chapter]");
      if (!tile) return;
      const ch = Number(tile.getAttribute("data-pick-chapter"));
      openBibleAt(selectedBibleBookNum, ch, 1, state.lang);
    });

    document.getElementById("btn-bible-book-intro")?.addEventListener("click", () => {
      const cfg = window.DFWolBible.getLangConfig(state.lang);
      window.DFWolReader.openArticleInApp(
        `https://wol.jw.org/${cfg.code}/wol/b/${cfg.r}/${cfg.lp}/nwtsty/${selectedBibleBookNum}/1`,
        { lang: state.lang }
      );
    });

    document.querySelectorAll("[data-open-bible-wol]").forEach((btn) => {
      btn.addEventListener("click", () => {
        let u = btn.getAttribute("data-open-bible-wol");
        if (state.lang === "en") {
          u = u.replace("/fr/wol/", "/en/wol/").replace("/r30/lp-f/", "/r1/lp-e/");
        }
        window.DFWolReader.openArticleInApp(u, { lang: state.lang });
      });
    });

    document.getElementById("picker-book")?.addEventListener("change", (e) => {
      populateChapterSelect(Number(e.target.value), 1);
    });
    document.getElementById("btn-bible-go")?.addEventListener("click", () => {
      const b = Number(document.getElementById("picker-book")?.value || 1);
      const c = Number(document.getElementById("picker-chapter")?.value || 1);
      const v = Number(document.getElementById("picker-verse")?.value || 1);
      openBibleAt(b, c, v, state.lang);
    });
    document.getElementById("btn-bible-prev-ch")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      if (cur.chapter > 1) {
        openBibleAt(cur.bookNum, cur.chapter - 1, 1, state.lang);
      }
    });
    document.getElementById("btn-bible-next-ch")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      const book = window.DFWolBible.getBookByNumber(cur.bookNum);
      if (cur.chapter < book.chapters) {
        openBibleAt(cur.bookNum, cur.chapter + 1, 1, state.lang);
      }
    });
    document.getElementById("btn-bible-audio")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      window.DFWolReader.playBibleChapterAudio(cur.bookNum, cur.chapter, state.lang);
    });
    document.getElementById("btn-bible-parallel")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      window.DFWolReader.openBibleChapter(cur.bookNum, cur.chapter, cur.verse, state.lang, !cur.parallel);
    });
    document.getElementById("bible-reader-body")?.addEventListener("click", (e) => {
      const row = e.target.closest("[data-select-verse]");
      if (row) {
        window.DFWolReader.renderVerseStudyPanel(Number(row.getAttribute("data-select-verse")));
      }
    });

    // Extracteur Guide de Recherche en Lot
    document.getElementById("btn-sample-batch")?.addEventListener("click", () => {
      document.getElementById("batch-scripture-input").value =
        "Psaume 83:17-18 ; Jean 17:3 ; Proverbes 3:5, 6 ; Isaïe 41:10 ; Révélation 21:4";
      runBatchResearchGuideExtraction();
    });
    document.getElementById("btn-extract-batch-rsg")?.addEventListener("click", runBatchResearchGuideExtraction);
    document.getElementById("btn-parse-batch")?.addEventListener("click", () => {
      const raw = document.getElementById("batch-scripture-input")?.value || "";
      const refs = window.DFWolBible.parseScriptureReferences(raw, state.lang);
      const grid = document.getElementById("batch-scripture-results");
      document.getElementById("batch-rsg-toolbar")?.classList.add("hidden");
      if (!grid) return;
      grid.innerHTML = refs
        .map(
          (r) => `
          <div class="verse-card">
            <div class="verse-card-header"><span class="verse-card-title">📖 ${window.DFWolSearch.escapeHtml(r.label)}</span></div>
            <div class="verse-card-links">
              <button type="button" class="btn-primary btn-xs" data-inapp-bible="${r.bookNum}:${r.chapter}:${r.verseStart || 1}">📖 Lire dans l'app</button>
            </div>
          </div>
        `
        )
        .join("");
      grid.dataset.inappBound = "0";
      window.DFWolReader.attachInAppLinkInterceptor(grid, state.lang);
    });
    document.getElementById("btn-clear-batch")?.addEventListener("click", () => {
      document.getElementById("batch-scripture-input").value = "";
      document.getElementById("batch-scripture-results").innerHTML = "";
      document.getElementById("batch-rsg-toolbar")?.classList.add("hidden");
      document.getElementById("batch-rsg-status")?.classList.add("hidden");
    });

    document.getElementById("btn-batch-select-all")?.addEventListener("click", () => {
      document.querySelectorAll(".batch-art-check").forEach((c) => (c.checked = true));
    });
    document.getElementById("btn-batch-unselect-all")?.addEventListener("click", () => {
      document.querySelectorAll(".batch-art-check").forEach((c) => (c.checked = false));
    });

    document.getElementById("btn-batch-play-audio")?.addEventListener("click", () => {
      const selected = getSelectedBatchArticles();
      if (!selected.length) return showToast("Cochez au moins un article.");
      window.DFWolAudio.playQueue(
        selected.map((a) => ({
          title: a.title,
          subtitle: `${a.verses.join(", ")} • ${a.citation}`,
          wolUrl: a.wolUrl,
          lang: a.lang,
          mode: "auto"
        }))
      );
      showToast(`Playlist audio lancée (${selected.length} articles) !`);
    });

    document.getElementById("btn-batch-compile-dossier")?.addEventListener("click", async () => {
      const selected = getSelectedBatchArticles();
      if (!selected.length) return showToast("Cochez au moins un article.");
      switchTab("reader");
      const titleEl = document.getElementById("reader-article-title");
      const metaEl = document.getElementById("reader-article-meta");
      const bodyEl = document.getElementById("reader-article-body");
      titleEl.textContent = `Dossier Guide de recherche (${selected.length} articles)`;
      metaEl.textContent = "Compilation automatique en cours…";
      bodyEl.innerHTML = `<div class="loading-box">⏳ Récupération de ${selected.length} articles…</div>`;

      let combinedHtml = "";
      const allParas = [];
      for (let i = 0; i < selected.length; i++) {
        const a = selected[i];
        try {
          const parsed = await window.DFWolReader.fetchArticleParsed(a.wolUrl);
          combinedHtml += `
            <section style="margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border-subtle);">
              <span class="badge badge-blue">${window.DFWolSearch.escapeHtml(a.verses.join(", "))} • ${window.DFWolSearch.escapeHtml(a.citation)}</span>
              <h2>${i + 1}. ${window.DFWolSearch.escapeHtml(parsed.title)}</h2>
              ${parsed.html}
            </section>
          `;
          parsed.paragraphs.forEach((p) => allParas.push(p));
        } catch (_) {}
      }
      metaEl.textContent = `${selected.length} articles compilés`;
      bodyEl.innerHTML = combinedHtml || "<p>Aucun contenu récupéré.</p>";
      window.DFWolReader.attachInAppLinkInterceptor(bodyEl, state.lang);
      document.getElementById("reader-btn-tts").onclick = () => {
        window.DFWolAudio.playTrack({
          title: `Dossier Guide de recherche (${selected.length})`,
          subtitle: "Lecture vocale complète",
          paragraphs: allParas,
          lang: state.lang,
          mode: "tts"
        });
      };
    });

    document.getElementById("batch-scripture-results")?.addEventListener("click", (e) => {
      const playOne = e.target.closest("[data-play-batch-one]");
      if (!playOne) return;
      const art = window.DFWolReader.getBatchExtractedArticles()[Number(playOne.getAttribute("data-play-batch-one"))];
      if (art) {
        window.DFWolAudio.playTrack({
          title: art.title,
          subtitle: `${art.verses.join(", ")} • ${art.citation}`,
          wolUrl: art.wolUrl,
          lang: art.lang,
          mode: "auto"
        });
      }
    });

    // Widget Studio & Proxy
    document.querySelectorAll("[data-wsize]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-wsize]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.widgetSettings.size = btn.getAttribute("data-wsize");
        saveState();
        updateWidgetPreviews();
      });
    });

    const syncWidgetUi = () => {
      saveState();
      updateWidgetPreviews();
      if (state.dtCurrentData) {
        window.DFWolDailyText.syncWithCapacitorNativeWidget(state.dtCurrentData, state.widgetSettings);
      }
    };

    document.getElementById("widget-display-mode")?.addEventListener("change", (e) => {
      state.widgetSettings.displayMode = e.target.value;
      syncWidgetUi();
    });
    document.getElementById("widget-theme-select")?.addEventListener("change", (e) => {
      state.widgetSettings.theme = e.target.value;
      syncWidgetUi();
    });
    document.getElementById("widget-font-scale")?.addEventListener("input", (e) => {
      state.widgetSettings.fontScale = Number(e.target.value);
      syncWidgetUi();
    });

    document.getElementById("btn-download-widget-png")?.addEventListener("click", () => {
      if (!state.dtCurrentData) return;
      const url = window.DFWolDailyText.generateWidgetPngCard(
        document.getElementById("widget-export-canvas"),
        state.dtCurrentData,
        state.widgetSettings.theme
      );
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `texte-du-jour-${state.dtCurrentData.dateIso}.png`;
        a.click();
        showToast("Carte image HD (.PNG) téléchargée !");
      }
    });
    document.getElementById("btn-open-mini-widget")?.addEventListener("click", () => {
      window.open("./index.html?mode=widget", "DFWolWidget", "width=460,height=420,menubar=no,toolbar=no");
    });
    document.getElementById("btn-force-cap-sync")?.addEventListener("click", async () => {
      await refreshDailyText(true);
      showToast("Widget synchronisé !");
    });

    const proxyInput = document.getElementById("custom-proxy-input");
    if (proxyInput && window.DFWolNet) proxyInput.value = window.DFWolNet.getCustomProxyBase();
    document.getElementById("btn-save-proxy")?.addEventListener("click", () => {
      window.DFWolNet.setCustomProxyBase(proxyInput?.value || "");
      window.DFWolNet.clearHtmlCache();
      showToast("Paramètre proxy enregistré !");
    });

    // Notes & Suivi de lecture
    document.getElementById("note-editor-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = document.getElementById("note-title-input");
      const g = document.getElementById("note-tag-select");
      const b = document.getElementById("note-body-input");
      if (!t.value.trim() || !b.value.trim()) return;
      window.DFWolAddNote(t.value.trim(), g.value, b.value.trim());
      t.value = "";
      b.value = "";
    });
    document.getElementById("notes-filter-input")?.addEventListener("input", renderNotesList);
    document.getElementById("notes-list-container")?.addEventListener("click", (e) => {
      const del = e.target.closest("[data-delete-note]");
      if (del) {
        state.notes = state.notes.filter((n) => n.id !== del.getAttribute("data-delete-note"));
        saveState();
        renderNotesList();
      }
    });

    document.getElementById("reading-book-select")?.addEventListener("change", (e) => renderReadingTrackerGrid(Number(e.target.value)));
    document.getElementById("reading-chapters-grid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-toggle-ch]");
      if (!btn) return;
      const bKey = String(btn.getAttribute("data-book"));
      const ch = Number(btn.getAttribute("data-toggle-ch"));
      const set = new Set(state.readingProgress[bKey] || []);
      set.has(ch) ? set.delete(ch) : set.add(ch);
      state.readingProgress[bKey] = Array.from(set).sort((a, b) => a - b);
      saveState();
      renderReadingTrackerGrid(Number(bKey));
    });
    document.getElementById("btn-mark-all-chapters")?.addEventListener("click", () => {
      const bNum = Number(document.getElementById("reading-book-select")?.value || 1);
      const book = window.DFWolBible.getBookByNumber(bNum);
      state.readingProgress[String(bNum)] = Array.from({ length: book.chapters }, (_, i) => i + 1);
      saveState();
      renderReadingTrackerGrid(bNum);
    });
    document.getElementById("btn-unmark-all-chapters")?.addEventListener("click", () => {
      const bNum = Number(document.getElementById("reading-book-select")?.value || 1);
      state.readingProgress[String(bNum)] = [];
      saveState();
      renderReadingTrackerGrid(bNum);
    });
    document.getElementById("btn-reset-reading")?.addEventListener("click", () => {
      state.readingProgress = {};
      saveState();
      renderReadingTrackerGrid(Number(document.getElementById("reading-book-select")?.value || 1));
    });

    // Paramètres généraux, Export complet JSON & TXT + Import
    document.getElementById("settings-theme-select")?.addEventListener("change", (e) => applyTheme(e.target.value));
    document.getElementById("settings-lang-select")?.addEventListener("change", (e) => updateGlobalLanguage(e.target.value));
    const skipRefsCb = document.getElementById("settings-tts-skip-refs");
    if (skipRefsCb && window.DFWolAudio) {
      skipRefsCb.checked = window.DFWolAudio.getSkipRefsEnabled();
      skipRefsCb.addEventListener("change", (e) => {
        window.DFWolAudio.setSkipRefsEnabled(e.target.checked);
        showToast(e.target.checked ? "TTS : versets & cotes ignorés." : "TTS : texte intégral lu.");
      });
    }

    const collectAnswers = () => {
      const answers = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("dfwol_ans_")) {
            const v = localStorage.getItem(k);
            if (v && v.trim()) answers[k] = v;
          }
        }
      } catch (_) {}
      return answers;
    };

    window.updateSettingsStats = function updateSettingsStatsInternal() {
      const ans = collectAnswers();
      let totalCh = 0;
      Object.values(state.readingProgress).forEach((arr) => {
        if (Array.isArray(arr)) totalCh += arr.length;
      });
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
      };
      setTxt("settings-stats-notes", state.notes.length);
      setTxt("settings-stats-answers", Object.keys(ans).length);
      setTxt("settings-stats-chapters", `${totalCh} / 1189`);
      setTxt("settings-stats-searches", state.savedSearches.length);
    };

    const deliverExport = async (content, filename, mimeType) => {
      const capShare = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
      if (window.DFWolNet && window.DFWolNet.isNativeCapacitor() && capShare && typeof capShare.share === "function") {
        try {
          await capShare.share({ title: filename, text: content, dialogTitle: "Exporter mes données DFWol" });
          showToast("Export prêt au partage !");
          return;
        } catch (_) {}
      }
      try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast(`Fichier ${filename} exporté !`);
      } catch (_) {
        await navigator.clipboard.writeText(content).catch(() => {});
        showToast("Données copiées dans le presse-papiers !");
      }
    };

    document.getElementById("btn-export-data")?.addEventListener("click", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "DFWol",
        state,
        publicationAnswers: collectAnswers(),
        tts: {
          skipRefsInTts: window.DFWolAudio ? window.DFWolAudio.getSkipRefsEnabled() : true,
          voiceFr: window.DFWolAudio ? window.DFWolAudio.getSelectedVoice("fr") : null,
          voiceEn: window.DFWolAudio ? window.DFWolAudio.getSelectedVoice("en") : null
        },
        customProxy: window.DFWolNet ? window.DFWolNet.getCustomProxyBase() : ""
      };
      deliverExport(JSON.stringify(payload, null, 2), `dfwol-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json;charset=utf-8");
    });

    document.getElementById("btn-export-txt")?.addEventListener("click", () => {
      const ans = collectAnswers();
      const lines = [
        `=== DFWOL — SAUVEGARDE NOTES & RÉPONSES (${new Date().toLocaleDateString()}) ===`,
        "",
        `--- CARNET DE NOTES (${state.notes.length}) ---`
      ];
      state.notes.forEach((n, idx) => {
        lines.push(`\n${idx + 1}. [${n.tag}] ${n.title}\n${n.body}`);
      });
      const ansKeys = Object.keys(ans);
      lines.push(`\n\n--- RÉPONSES CAHIERS & PUBLICATIONS (${ansKeys.length}) ---`);
      ansKeys.forEach((k) => {
        lines.push(`\n[${k.replace(/^dfwol_ans_/, "")}]\n${ans[k]}`);
      });
      deliverExport(lines.join("\n"), `dfwol-notes-${new Date().toISOString().slice(0, 10)}.txt`, "text/plain;charset=utf-8");
    });

    document.getElementById("input-import-data")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(String(reader.result));
          const imp = raw.state && typeof raw.state === "object" ? raw.state : raw;
          if (Array.isArray(imp.notes)) state.notes = imp.notes;
          if (Array.isArray(imp.savedSearches)) state.savedSearches = imp.savedSearches;
          if (imp.readingProgress) state.readingProgress = imp.readingProgress;
          if (imp.theme) applyTheme(imp.theme);
          if (imp.lang) updateGlobalLanguage(imp.lang);
          if (raw.publicationAnswers && typeof raw.publicationAnswers === "object") {
            Object.entries(raw.publicationAnswers).forEach(([k, v]) => {
              if (k.startsWith("dfwol_ans_")) localStorage.setItem(k, String(v));
            });
          }
          if (raw.customProxy && window.DFWolNet) {
            window.DFWolNet.setCustomProxyBase(raw.customProxy);
          }
          saveState();
          renderNotesList();
          renderSavedSearches();
          renderReadingTrackerGrid(Number(document.getElementById("reading-book-select")?.value || 1));
          updateSettingsStats();
          showToast("Toutes vos données ont été restaurées !");
        } catch (_) {
          showToast("Fichier JSON invalide.");
        }
      };
      reader.readAsText(file);
    });
  }

  function setupPwa() {
    const badge = document.getElementById("connection-badge");
    const updateNet = () => {
      if (!badge) return;
      badge.textContent = navigator.onLine ? "● En ligne" : "● Hors-ligne";
      badge.className = navigator.onLine ? "status-pill online" : "status-pill offline";
    };
    window.addEventListener("online", updateNet);
    window.addEventListener("offline", updateNet);
    updateNet();

    const installBtn = document.getElementById("btn-install-pwa");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPwaPrompt = e;
      installBtn?.classList.remove("hidden");
    });
    installBtn?.addEventListener("click", async () => {
      if (!deferredPwaPrompt) return;
      deferredPwaPrompt.prompt();
      await deferredPwaPrompt.userChoice;
      deferredPwaPrompt = null;
      installBtn.classList.add("hidden");
    });

    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  async function checkStartupUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "widget") {
      document.getElementById("standalone-widget-shell")?.classList.remove("hidden");
      document.getElementById("app-shell")?.classList.add("hidden");
      return;
    }
    if (params.get("open") === "daily-text") {
      await window.DFWolOpenDailyText();
      return;
    }
    try {
      const widgetPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.DailyTextWidget;
      if (widgetPlugin && typeof widgetPlugin.consumePendingTarget === "function") {
        const res = await widgetPlugin.consumePendingTarget();
        if (res && res.target === "daily_text") {
          await window.DFWolOpenDailyText();
          return;
        }
      }
    } catch (_) {}

    const tab = params.get("tab");
    if (tab && (document.getElementById(`tab-${tab}`) || tab === "widget")) {
      switchTab(tab);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadPersistedState();
    applyTheme(state.theme);

    // Sync UI initial state
    const dmSel = document.getElementById("widget-display-mode");
    if (dmSel) dmSel.value = state.widgetSettings.displayMode || "shortParagraph";
    const thSel = document.getElementById("widget-theme-select");
    if (thSel) {
      const legacyMap = { "theme-sapphire": "theme-jw-blue", "theme-midnight": "theme-jw-dark", "theme-emerald": "theme-jw-blue" };
      const mapped = legacyMap[state.widgetSettings.theme] || state.widgetSettings.theme || "theme-jw-light";
      state.widgetSettings.theme = mapped;
      thSel.value = mapped;
    }
    document.querySelectorAll("[data-dt-view]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-dt-view") === state.dtSummaryMode);
    });

    window.DFWolAudio.init();
    window.DFWolReader.initReaderControls();
    window.DFWolVideo.init();

    populateBibleSelects();
    renderBibleBooksGrid("all");
    renderSavedSearches();
    renderNotesList();
    setupOmnibar();
    setupCommandPalette();
    setupNativeBackAndLinkGuard();
    bindAllEvents();
    updateGlobalLanguage(state.lang);
    setBibleView("books");
    window.DFWolShowBibleView = setBibleView;
    updateSettingsStats();
    checkStartupUrlParams();
    setupPwa();
  });
})();
