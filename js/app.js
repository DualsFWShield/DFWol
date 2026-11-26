/* ==========================================================================
   DFWol Studio v3 — Contrôleur Principal Unifié (FR & EN)
   Tout-en-un : Recherche Totale, Bible + Guide Auto en Lot, Vidéos + VTT,
   Lecteur d'Articles + Audio MP3/TTS, Texte du Jour Multi-Niveaux & Widget
   ========================================================================== */

(function () {
  "use strict";

  const STATE_KEY = "dfwol_studio_state_v3";
  const RECENT_KEY = "dfwol_recent_v1";
  let activeStudySubtab = "notes";
  let activeMeetingsView = "week";
  let meetingsWeekOffset = 0;

  const state = {
    lang: "fr",
    theme: "light",
    readerFontFamily: "sans",
    activeTab: "dashboard",
    dtDate: new Date(),
    dtCurrentData: null,
    dtSummaryMode: "full", // 'oneWord' | 'oneSentence' | 'shortParagraph' | 'full'
    videosLoadedLang: null,
    bibleLoadedOnce: false,
    widgetSettings: {
      size: "size-4x3",
      theme: "theme-auto",
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
        title: "Bienvenue dans DFWol",
        tag: "Étude Perso",
        body: "Toutes les références bibliques écrites ici s'ouvrent directement dans l'application : Psaume 83:18, Jean 17:3, Proverbes 3:5, 6 et Révélation 21:3, 4.",
        createdAt: new Date().toISOString()
      }
    ],
    readingProgress: {}
  };

  let deferredPwaPrompt = null;
  const tabHistory = ["dashboard"];
  const inTabStacks = { dashboard: [], bible: [], library: [], meetings: [], study: [] };
  let isRestoringNav = false;
  let lastBackExitTime = 0;

  function loadPersistedState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.lang === "fr" || parsed.lang === "en") state.lang = parsed.lang;
      if (parsed.theme) state.theme = parsed.theme;
      if (parsed.readerFontFamily === "serif" || parsed.readerFontFamily === "sans") state.readerFontFamily = parsed.readerFontFamily;
      if (parsed.dtSummaryMode) state.dtSummaryMode = parsed.dtSummaryMode;
      if (parsed.widgetSettings) {
        state.widgetSettings = Object.assign({}, state.widgetSettings, parsed.widgetSettings);
        if (!state.widgetSettings.explicitThemeChosen && state.widgetSettings.theme === "theme-jw-light") {
          state.widgetSettings.theme = "theme-auto";
        }
      }
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
          readerFontFamily: state.readerFontFamily,
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
  let activeNoteTagFilter = "all";

  window.DFWolToast = showToast;
  window.DFWolGetLang = () => state.lang;
  window.DFWolSwitchTab = switchTab;
  window.DFWolOpenBibleAt = (...args) => openBibleAt(...args);
  window.DFWolGetNotes = () => state.notes;
  window.DFWolUpdateSettingsStats = () => window.updateSettingsStats && window.updateSettingsStats();

  window.DFWolRenameNoteTag = function (oldName, newName) {
    let changed = false;
    state.notes.forEach((n) => {
      if (n.tag === oldName) {
        n.tag = newName;
        changed = true;
      }
      if (Array.isArray(n.tags)) {
        n.tags = n.tags.map((t) => (t === oldName ? newName : t));
        changed = true;
      }
    });
    if (changed) {
      saveState();
      syncNoteTagsUi();
      renderNotesList();
    }
  };

  window.DFWolAddNote = function (titleOrObj, tag, body, opts = {}) {
    let payload;
    if (titleOrObj && typeof titleOrObj === "object" && !Array.isArray(titleOrObj)) {
      payload = titleOrObj;
    } else {
      payload = Object.assign({}, opts || {}, { title: titleOrObj, tag, body });
    }
    const primaryTag = String(payload.tag || (Array.isArray(payload.tags) && payload.tags[0]) || "Étude Perso").trim();
    const tags = Array.isArray(payload.tags) && payload.tags.length ? payload.tags.map(String) : [primaryTag];
    const nowIso = new Date().toISOString();
    state.notes.unshift({
      id: "note-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      title: String(payload.title || "Note"),
      tag: primaryTag,
      tags,
      body: String(payload.body || ""),
      targetType: payload.targetType || null,
      ref: payload.ref || null,
      url: payload.url || null,
      docKey: payload.docKey || null,
      createdAt: nowIso,
      updatedAt: nowIso
    });
    if (window.DFWolStudy && typeof window.DFWolStudy.addTag === "function") {
      tags.forEach((t) => window.DFWolStudy.addTag(t));
    }
    saveState();
    syncNoteTagsUi();
    renderNotesList();
    window.updateSettingsStats && window.updateSettingsStats();
    showToast("Ajouté au Carnet de Notes !");
  };

  // ==========================================================================
  // Navigation, Historique & Bouton Retour Natif Android
  // ==========================================================================

  function captureCurrentViewSnapshot() {
    const curArt = window.DFWolReader?.getCurrentArticleData?.();
    const curBible = window.DFWolReader?.getCurrentBibleState?.();
    const curLib = window.DFWolLibrary?.getActiveSubtab?.() || "publications";
    return {
      tab: state.activeTab,
      meetingsView: activeMeetingsView,
      meetingsOffset: meetingsWeekOffset,
      articleUrl: curArt?.url || null,
      articleLang: curArt?.lang || state.lang,
      bibleSubtab: activeBibleSubtab,
      bibleBook: curBible?.bookNum || selectedBibleBookNum,
      bibleChapter: curBible?.chapter || 1,
      bibleVerses: curBible?.verses || curBible?.verse || 1,
      bibleLang: curBible?.lang || state.lang,
      libSubtab: curLib,
      studySubtab: activeStudySubtab,
      scrollY: window.scrollY || 0
    };
  }

  function pushWebHistoryState(tag = "nav", count = 1) {
    if (isRestoringNav) return;
    if (window.history && typeof window.history.pushState === "function") {
      try {
        for (let i = 0; i < count; i++) {
          window.history.pushState({ dfwolNavTag: tag, ts: Date.now() }, "");
        }
      } catch (_) {}
    }
  }
  window.DFWolPushHistoryMarker = pushWebHistoryState;

  function snapshotsMatch(a, b) {
    if (!a || !b) return false;
    return (
      a.tab === b.tab &&
      a.meetingsView === b.meetingsView &&
      a.meetingsOffset === b.meetingsOffset &&
      a.articleUrl === b.articleUrl &&
      a.bibleSubtab === b.bibleSubtab &&
      a.bibleBook === b.bibleBook &&
      a.bibleChapter === b.bibleChapter &&
      a.libSubtab === b.libSubtab &&
      a.studySubtab === b.studySubtab
    );
  }

  function pushNavSnapshot(customSnap = null, targetTab = null) {
    if (isRestoringNav) return;
    const snap = customSnap || captureCurrentViewSnapshot();
    const bucketTab = targetTab || snap.tab || state.activeTab || "dashboard";
    if (bucketTab === "dashboard" && !targetTab) return;
    const stack = inTabStacks[bucketTab] || (inTabStacks[bucketTab] = []);
    const top = stack[stack.length - 1];
    if (snapshotsMatch(top, snap)) {
      return;
    }
    stack.push(snap);
    if (stack.length > 35) stack.shift();
    pushWebHistoryState(bucketTab, 1);
  }
  window.DFWolPushNavSnapshot = pushNavSnapshot;

  function isTabAtInitialState(tabId = state.activeTab) {
    if (tabId === "dashboard") return true;
    if (tabId === "bible") return activeBibleSubtab === "books";
    if (tabId === "library") {
      return window.DFWolLibrary?.isAtInitialState ? window.DFWolLibrary.isAtInitialState() : true;
    }
    if (tabId === "meetings") return activeMeetingsView === "week" && meetingsWeekOffset === 0;
    if (tabId === "study") return activeStudySubtab === "notes";
    return true;
  }

  async function resetTabToInitialState(tabId = state.activeTab, opts = {}) {
    if (!tabId) return;
    inTabStacks[tabId] = [];
    if (tabId === "dashboard") {
      document.getElementById("global-study-panel")?.classList.remove("open");
      document.getElementById("btn-floating-study")?.classList.remove("is-open");
      if (!opts.silentScroll) window.scrollTo({ top: 0, behavior: opts.smooth === false ? "instant" : "smooth" });
      return;
    }
    if (tabId === "bible") {
      setBibleView("books", selectedBibleBookNum, { skipNavPush: true, fromHistory: true });
      window.scrollTo({ top: 0, behavior: opts.smooth === false ? "instant" : "smooth" });
      return;
    }
    if (tabId === "library") {
      window.DFWolLibrary?.resetToInitial?.();
      return;
    }
    if (tabId === "meetings") {
      showMeetingsView("week");
      await loadMeetingsForOffset(0, { skipNavPush: true, fromHistory: true });
      window.scrollTo({ top: 0, behavior: opts.smooth === false ? "instant" : "smooth" });
      return;
    }
    if (tabId === "study") {
      setStudyView("notes", { skipNavPush: true, fromHistory: true });
      window.scrollTo({ top: 0, behavior: opts.smooth === false ? "instant" : "smooth" });
    }
  }
  window.DFWolIsRestoringNav = () => isRestoringNav;
  window.DFWolShowMeetingsWeek = () => loadMeetingsForOffset(meetingsWeekOffset);

  async function restoreNavSnapshot(snap) {
    if (!snap) return false;
    isRestoringNav = true;
    try {
      switchTab(snap.tab, {
        fromBack: true,
        skipPushState: true,
        skipAutoMeetings: true,
        preserveScroll: true,
        libSubtab: snap.libSubtab,
        studySubtab: snap.studySubtab,
        meetingsView: snap.meetingsView
      });

      if (snap.tab === "meetings") {
        if (snap.meetingsView === "reader" && snap.articleUrl && window.DFWolReader) {
          showMeetingsView("reader");
          await window.DFWolReader.openArticleInApp(snap.articleUrl, {
            lang: snap.articleLang || state.lang,
            skipTabSwitch: true,
            fromHistory: true
          });
        } else {
          await loadMeetingsForOffset(snap.meetingsOffset ?? meetingsWeekOffset, { fromHistory: true });
        }
      } else if (snap.tab === "bible") {
        if (snap.bibleSubtab === "reader" && snap.bibleBook) {
          setBibleView("reader", snap.bibleBook, { fromHistory: true });
          const pb = document.getElementById("picker-book");
          if (pb) pb.value = String(snap.bibleBook);
          populateChapterSelect(snap.bibleBook, snap.bibleChapter || 1);
          await window.DFWolReader.openBibleChapter(
            snap.bibleBook,
            snap.bibleChapter || 1,
            snap.bibleVerses || 1,
            snap.bibleLang || state.lang,
            undefined,
            { fromHistory: true }
          );
        } else {
          setBibleView(snap.bibleSubtab || "books", snap.bibleBook || selectedBibleBookNum, { fromHistory: true });
        }
      } else if (snap.tab === "library" && window.DFWolLibrary) {
        window.DFWolLibrary.setLibraryView(snap.libSubtab || "publications", { fromHistory: true });
      } else if (snap.tab === "study") {
        setStudyView(snap.studySubtab || "notes", { fromHistory: true });
      }

      requestAnimationFrame(() => {
        window.scrollTo({ top: snap.scrollY || 0, behavior: "instant" });
      });
      return true;
    } finally {
      isRestoringNav = false;
    }
  }

  function updateFloatingStudyFab() {
    const gemFab = document.getElementById("btn-reader-gem-fab");
    if (!gemFab) return;
    const hideFab = document.body.classList.contains("zen-focus-mode");
    gemFab.classList.toggle("hidden", hideFab);
  }

  function showMeetingsView(viewName = "week") {
    activeMeetingsView = viewName;
    const contentCard = document.getElementById("meetings-view-content");
    const mediaCard = document.getElementById("meetings-view-media");
    const topWeek = document.getElementById("meetings-topbar-week");
    const topReader = document.getElementById("meetings-topbar-reader");

    if (viewName === "media") {
      contentCard?.classList.add("hidden");
      mediaCard?.classList.remove("hidden");
      updateFloatingStudyFab();
      return;
    }

    mediaCard?.classList.add("hidden");
    contentCard?.classList.remove("hidden");

    const isWeek = viewName === "week";
    contentCard?.classList.toggle("is-meetings-week", isWeek);
    topWeek?.classList.toggle("hidden", !isWeek);
    topReader?.classList.toggle("hidden", isWeek);
    updateFloatingStudyFab();
  }
  window.DFWolShowMeetingsView = showMeetingsView;

  function setStudyView(subtab = "notes", options = {}) {
    if (!options.fromHistory && !options.skipNavPush && !isRestoringNav && state.activeTab === "study" && activeStudySubtab !== subtab) {
      pushNavSnapshot();
    }
    activeStudySubtab = subtab;
    ["notes", "bookmarks", "playlists", "ai", "brother", "reading", "settings"].forEach((v) => {
      document.getElementById(`study-view-${v}`)?.classList.toggle("hidden", v !== subtab);
    });
    document.querySelectorAll("[data-study-subtab]").forEach((btn) => {
      const isAct = btn.getAttribute("data-study-subtab") === subtab;
      btn.classList.toggle("active", isAct);
      btn.setAttribute("aria-selected", String(isAct));
    });
    if (subtab === "settings") updateSettingsStats();
    if (subtab === "notes") {
      syncNoteTagsUi();
      renderNotesList();
      renderHighlightsList();
    }
    if (subtab === "bookmarks" && window.DFWolStudy) {
      window.DFWolStudy.renderBookmarksPanel(document.getElementById("study-bookmarks-list"));
    }
    if (subtab === "playlists" && window.DFWolStudy) {
      window.DFWolStudy.renderPlaylistsPanel(document.getElementById("study-playlists-list"));
    }
    if (subtab === "reading" && window.DFWolStudy) {
      window.DFWolStudy.renderReadingPlans(document.getElementById("study-reading-plans"), state.readingProgress);
    }
    if (subtab === "brother" && window.DFWolBrother) {
      window.DFWolBrother.init();
      window.DFWolBrother.render("study-view-brother");
    }
  }

  function loadMeetingsForOffset(offsetWeeks = 0, options = {}) {
    if (
      !options.fromHistory &&
      !options.skipNavPush &&
      !isRestoringNav &&
      state.activeTab === "meetings" &&
      (activeMeetingsView === "reader" || offsetWeeks !== meetingsWeekOffset)
    ) {
      pushNavSnapshot();
    }
    meetingsWeekOffset = offsetWeeks;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offsetWeeks * 7);
    const info = window.DFWolBible.getIsoWeekInfo(targetDate, state.lang);
    const lbl = document.getElementById("meetings-week-label");
    if (lbl) {
      const fmt = (d) =>
        d.toLocaleDateString(state.lang === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "long" });
      const tag =
        offsetWeeks === 0
          ? state.lang === "en"
            ? " · This week"
            : " · Cette semaine"
          : "";
      lbl.textContent = `${fmt(info.monday)} – ${fmt(info.sunday)}${tag}`;
    }
    const langSub = document.getElementById("meetings-week-lang-sub");
    if (langSub) langSub.textContent = state.lang === "en" ? "English" : "Français";
    showMeetingsView("week");
    return window.DFWolReader && window.DFWolReader.openArticleInApp(info.wolMeetingsUrl, { lang: state.lang, skipTabSwitch: true, fromHistory: Boolean(options.fromHistory) });
  }

  function switchTab(tabId, options = {}) {
    if (!tabId) return;
    if (tabId === "widget" || tabId === "settings") {
      tabId = "study";
      options.studySubtab = options.studySubtab || "settings";
    } else if (tabId === "brother") {
      tabId = "study";
      options.studySubtab = "brother";
    } else if (tabId === "search") {
      tabId = "library";
      options.libSubtab = options.libSubtab || "search";
    } else if (tabId === "videos") {
      tabId = "library";
      options.libSubtab = options.libSubtab || "videos";
    } else if (tabId === "reader") {
      tabId = "meetings";
      options.meetingsView = options.meetingsView || "reader";
    }

    const tabChanged = state.activeTab !== tabId;
    if (!options.fromBack && !options.skipNavPush && !isRestoringNav && tabChanged) {
      if (tabId !== "dashboard") {
        pushWebHistoryState(`tab-${tabId}`, 1);
      }
      if (tabHistory[tabHistory.length - 1] !== tabId) {
        tabHistory.push(tabId);
        if (tabHistory.length > 25) tabHistory.shift();
      }
    }

    state.activeTab = tabId;
    document.querySelectorAll(".jw-nav-item").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
    document.querySelectorAll(".mbn-item").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tabId}`));
    if (tabId !== "bible" && tabId !== "meetings") {
      toggleFocusMode(false, { silent: true });
    }
    updateFloatingStudyFab();
    if (tabChanged && !options.preserveScroll) {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    window.dispatchEvent(new Event("dfwol:viewchange"));

    if (tabId === "library" && window.DFWolLibrary) {
      window.DFWolLibrary.setLibraryView(options.libSubtab || window.DFWolLibrary.getActiveSubtab() || "publications", {
        fromHistory: Boolean(options.fromBack),
        skipNavPush: true
      });
    }
    if (tabId === "meetings") {
      if (options.meetingsView) showMeetingsView(options.meetingsView);
      if (window.DFWolReader && !window.DFWolReader.getCurrentArticleData() && !options.skipAutoMeetings) {
        loadMeetingsForOffset(meetingsWeekOffset, { skipNavPush: true });
      }
    }
    if (tabId === "study") {
      setStudyView(options.studySubtab || activeStudySubtab || "notes", { fromHistory: Boolean(options.fromBack), skipNavPush: true });
    }
  }

  function openBibleAt(bookNum, chapter, verseOrSpec = 1, lang = state.lang, options = {}) {
    const curB = window.DFWolReader?.getCurrentBibleState?.();
    const targetB = Number(bookNum);
    const targetCh = Number(chapter);
    if (!options.fromHistory && !options.skipNavPush && !isRestoringNav) {
      if (
        state.activeTab === "bible" &&
        (activeBibleSubtab !== "reader" || Number(curB?.bookNum) !== targetB || Number(curB?.chapter) !== targetCh)
      ) {
        pushNavSnapshot(null, "bible");
      } else if (state.activeTab !== "bible") {
        // Jump depuis un autre onglet : préparer la hiérarchie intra-Bible (Livres -> Chapitres -> Chapitre)
        inTabStacks.bible.length = 0;
        inTabStacks.bible.push({ tab: "bible", bibleSubtab: "books", bibleBook: targetB });
        inTabStacks.bible.push({ tab: "bible", bibleSubtab: "chapters", bibleBook: targetB });
        pushWebHistoryState("bible-jump", 3);
      }
    }
    switchTab("bible", { fromBack: true, skipNavPush: true, preserveScroll: true });
    setBibleView("reader", targetB, { skipNavPush: true });
    document.getElementById("picker-book").value = String(targetB);
    populateChapterSelect(targetB, targetCh);
    window.DFWolReader.openBibleChapter(targetB, targetCh, verseOrSpec, lang, undefined, { skipNavPush: true });
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

  async function handleBackNavigation() {
    if (document.getElementById("dfwol-floating-card-menu")) {
      window.DFWolStudy ? window.DFWolStudy.closeContextMenu() : document.getElementById("dfwol-floating-card-menu")?.remove();
      return;
    }
    if (window.DFWolStudy && typeof window.DFWolStudy.isFindOpen === "function" && window.DFWolStudy.isFindOpen()) {
      window.DFWolStudy.closeFindBar();
      return;
    }
    for (const modalId of [
      "dfwol-input-modal",
      "image-lightbox-modal",
      "note-edit-modal",
      "history-drawer-modal",
      "scripture-peek-modal",
      "ai-assistant-drawer",
      "pdf-export-modal",
      "video-download-modal",
      "study-gem-drawer",
      "cmd-palette-backdrop",
      "audio-queue-drawer",
      "audio-voice-popover",
      "reader-display-popover",
      "text-selection-toolbar"
    ]) {
      const el = document.getElementById(modalId);
      if (el && !el.classList.contains("hidden")) {
        el.classList.add("hidden");
        return;
      }
    }

    const gsp = document.getElementById("global-study-panel");
    if (gsp && !gsp.classList.contains("hidden")) {
      window.DFWolStudy?.closeArticleStudyPane?.();
      return;
    }

    // 1. Lecteur vidéo dans Bibliothèque
    const vidStage = document.getElementById("video-player-stage");
    if (state.activeTab === "library" && vidStage && !vidStage.classList.contains("hidden")) {
      const vidEl = document.getElementById("dfwol-video-el");
      if (vidEl && !vidEl.paused) vidEl.pause();
      vidStage.classList.add("hidden");
      return;
    }

    // 2. Retour interne à l'onglet actif en PRIORITÉ
    if (state.activeTab === "library" && window.DFWolLibrary?.goBackInTab?.()) {
      return;
    }

    if (state.activeTab === "meetings" && activeMeetingsView === "media") {
      showMeetingsView(window.DFWolReader?.getCurrentArticleData() ? "reader" : "week");
      return;
    }

    const tabStack = inTabStacks[state.activeTab];
    const curSnap = captureCurrentViewSnapshot();
    while (tabStack && tabStack.length > 0 && snapshotsMatch(tabStack[tabStack.length - 1], curSnap)) {
      tabStack.pop();
    }
    if (tabStack && tabStack.length > 0) {
      const prevSnap = tabStack.pop();
      await restoreNavSnapshot(prevSnap);
      return;
    }

    if (state.activeTab === "bible" && activeBibleSubtab !== "books") {
      if (activeBibleSubtab === "reader") {
        setBibleView("chapters", selectedBibleBookNum, { fromHistory: true, skipNavPush: true });
      } else {
        setBibleView("books", selectedBibleBookNum, { fromHistory: true, skipNavPush: true });
      }
      return;
    }

    if (state.activeTab === "meetings" && !isTabAtInitialState("meetings")) {
      await resetTabToInitialState("meetings", { fromBack: true });
      return;
    }

    if (!isTabAtInitialState(state.activeTab)) {
      await resetTabToInitialState(state.activeTab, { fromBack: true });
      return;
    }

    // 3. Onglet revenu à son état initial -> retour à l'Accueil
    if (state.activeTab !== "dashboard") {
      switchTab("dashboard", { fromBack: true });
      return;
    }

    // 4. Sur l'Accueil à l'état initial -> double Retour pour quitter
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
        if (
          e.target.closest(
            ".jw-card-more-btn, .jwl-row-more-btn, [data-card-menu], .bible-fn-btn, .bible-mr-btn, .jwl-context-menu, .text-selection-toolbar"
          )
        ) {
          return;
        }
        const a = e.target.closest("a[href]");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (!href || href.startsWith("javascript:") || href.startsWith("#")) return;

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

  function applyReadingComfort() {
    const isSerif = state.readerFontFamily === "serif";
    document.getElementById("bible-reader-body")?.classList.toggle("font-serif-reading", isSerif);
    document.getElementById("reader-article-body")?.classList.toggle("font-serif-reading", isSerif);
    ["reader-btn-serif", "btn-bible-serif"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.classList.toggle("is-active", isSerif);
        btn.setAttribute("aria-pressed", String(isSerif));
      }
    });
  }

  function toggleFocusMode(forceState, options = {}) {
    const next = typeof forceState === "boolean" ? forceState : !document.body.classList.contains("zen-focus-mode");
    document.body.classList.toggle("zen-focus-mode", next);
    updateFloatingStudyFab();
    ["reader-btn-focus", "btn-bible-focus"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.classList.toggle("is-active", next);
        btn.setAttribute("aria-pressed", String(next));
      }
    });
    if (next && !options.silent) {
      showToast(state.lang === "en" ? "Focus mode on (Esc to exit)" : "Mode lecture épurée activé (Échap pour quitter)");
    }
  }

  function getNextUnreadBibleChapter() {
    const books = window.DFWolBible?.BIBLE_BOOKS || [];
    for (const b of books) {
      const readSet = new Set(state.readingProgress[String(b.num)] || []);
      for (let ch = 1; ch <= b.chapters; ch++) {
        if (!readSet.has(ch)) return { book: b, bookNum: b.num, ch };
      }
    }
    const fallback = books[0] || { num: 1, nameFr: "Genèse", nameEn: "Genesis", chapters: 50 };
    return { book: fallback, bookNum: fallback.num, ch: 1 };
  }

  function renderHomeHero() {
    const lang = state.lang === "en" ? "en" : "fr";
    const hour = new Date().getHours();
    let greetFr = "Bonjour";
    let greetEn = "Good morning";
    if (hour >= 12 && hour < 18) {
      greetFr = "Bon après-midi";
      greetEn = "Good afternoon";
    } else if (hour >= 18) {
      greetFr = "Bonsoir";
      greetEn = "Good evening";
    } else if (hour < 5) {
      greetFr = "Étude paisible";
      greetEn = "Quiet study";
    }

    const titleEl = document.getElementById("hero-greeting-title");
    const subEl = document.getElementById("hero-greeting-sub");
    if (titleEl) titleEl.textContent = lang === "en" ? greetEn : greetFr;
    if (subEl) {
      const dateStr = new Date().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long"
      });
      subEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }

    const streak = window.DFWolStudy?.updateAndGetStreak ? window.DFWolStudy.updateAndGetStreak() : 1;
    const streakEl = document.getElementById("hero-streak-pill");
    if (streakEl) {
      streakEl.textContent = lang === "en" ? `🔥 ${streak}d streak` : `🔥 ${streak} j d'étude`;
    }

    let totalRead = 0;
    Object.values(state.readingProgress || {}).forEach((arr) => {
      if (Array.isArray(arr)) totalRead += arr.length;
    });
    const ratio = Math.max(0, Math.min(1, totalRead / 1189));
    const pctRounded = Math.round(ratio * 100);
    const circ = 2 * Math.PI * 20;
    const ringEl = document.getElementById("hero-progress-ring-circle");
    const pctEl = document.getElementById("hero-ring-pct");
    if (ringEl) {
      ringEl.style.strokeDasharray = `${circ.toFixed(2)}`;
      ringEl.style.strokeDashoffset = `${(circ * (1 - ratio)).toFixed(2)}`;
    }
    if (pctEl) pctEl.textContent = `${pctRounded}%`;

    const dashProgEl = document.getElementById("dash-reading-progress");
    if (dashProgEl) dashProgEl.textContent = `${totalRead} / 1189 ch.`;
    const dashNotesEl = document.getElementById("dash-notes-count");
    if (dashNotesEl) dashNotesEl.textContent = `${state.notes.length} note${state.notes.length > 1 ? "s" : ""}`;

    const next = getNextUnreadBibleChapter();
    const contBtn = document.getElementById("dash-continue-bible");
    if (contBtn && next.book) {
      const bName = window.DFWolBible.getBookDisplayName(next.book, lang);
      contBtn.dataset.nextBook = String(next.bookNum);
      contBtn.dataset.nextCh = String(next.ch);
      const lbl = contBtn.querySelector(".hero-cta-label");
      if (lbl) {
        lbl.textContent = lang === "en" ? `Continue: ${bName} ${next.ch}` : `Continuer : ${bName} ${next.ch}`;
      }
    }
  }

  function resolveWidgetTheme(rawTheme = state.widgetSettings.theme) {
    if (!rawTheme || rawTheme === "theme-auto") {
      return state.theme === "dark" ? "theme-jw-dark" : "theme-jw-light";
    }
    return rawTheme;
  }

  function getEffectiveWidgetSettings() {
    return Object.assign({}, state.widgetSettings, {
      theme: resolveWidgetTheme(state.widgetSettings.theme)
    });
  }

  function applyTheme(theme) {
    state.theme = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", state.theme);
    document.getElementById("btn-theme-toggle")?.classList.toggle("is-dark", state.theme === "dark");
    const themeSel = document.getElementById("settings-theme-select");
    if (themeSel) themeSel.value = state.theme;
    saveState();
    updateWidgetPreviews();
    if (state.dtCurrentData && window.DFWolDailyText) {
      window.DFWolDailyText.syncWithCapacitorNativeWidget(state.dtCurrentData, getEffectiveWidgetSettings());
    }
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
    renderHomeHero();
    refreshDailyText();
    updateSearchExplainer();

    const curBibleB = selectedBibleBookNum || 19;
    const curBibleCh = Number(document.getElementById("picker-chapter")?.value || 83);
    populateBibleSelects(curBibleB, curBibleCh);
    renderBibleBooksGrid();
    if (activeBibleSubtab === "chapters") {
      setBibleView("chapters", selectedBibleBookNum);
    } else if (activeBibleSubtab !== "reader") {
      setBibleView(activeBibleSubtab, selectedBibleBookNum);
    }

    renderNotesList();
    if (window.DFWolAudio && window.DFWolAudio.populateVoiceSelector) {
      window.DFWolAudio.populateVoiceSelector(lang);
    }

    if (window.DFWolLibrary) {
      window.DFWolLibrary.refreshForLanguage(lang);
    }
    if (state.activeTab === "meetings" && activeMeetingsView === "week") {
      loadMeetingsForOffset(meetingsWeekOffset);
    }
    if (state.activeTab === "bible" && activeBibleSubtab === "reader" && window.DFWolReader) {
      const bState = window.DFWolReader.getCurrentBibleState();
      if (bState && bState.bookNum) {
        window.DFWolReader.openBibleChapter(bState.bookNum, bState.chapter, bState.verses || bState.verse, lang);
      }
    }
  }

  // ==========================================================================
  // Texte du Jour Multi-Niveaux (1 Mot / 1 Phrase / Petit Paragraphe / Complet)
  // ==========================================================================

  let dtPrewarmTimer = null;

  function buildDailyTextSpeechTrack(d) {
    const lang = d.lang || state.lang || "fr";
    const fullRef = window.DFWolBible.expandScriptureRefFull(d.scriptureRef, lang);
    const spokenRef =
      window.DFWolAudio && window.DFWolAudio.formatScripturesForSpeech
        ? window.DFWolAudio.formatScripturesForSpeech(fullRef, lang)
        : fullRef;
    const intro =
      lang === "en"
        ? `Daily text, ${d.formattedDate}. ${d.scriptureText} — ${spokenRef}.`
        : `Texte du jour, ${d.formattedDate}. ${d.scriptureText} — ${spokenRef}.`;
    return {
      title: `${lang === "en" ? "Daily Text" : "Texte du jour"} — ${fullRef}`,
      subtitle: d.formattedDate,
      paragraphs: [intro, d.commentary],
      lang,
      mode: "tts"
    };
  }

  async function refreshDailyText(forceRefresh = false) {
    const dtDate = state.dtDate || new Date();
    const picker = document.getElementById("dash-dt-picker");
    if (picker) {
      const y = dtDate.getFullYear();
      const m = String(dtDate.getMonth() + 1).padStart(2, "0");
      const day = String(dtDate.getDate()).padStart(2, "0");
      picker.value = `${y}-${m}-${day}`;
    }

    const syncStatusEl = document.getElementById("dt-sync-status");
    if (syncStatusEl) syncStatusEl.textContent = "Synchronisation WOL…";

    const data = await window.DFWolDailyText.getDailyTextForDate(dtDate, state.lang, forceRefresh);
    state.dtCurrentData = data;

    renderDailyTextDisplay();
    updateWidgetPreviews(data);

    if (dtPrewarmTimer) clearTimeout(dtPrewarmTimer);
    dtPrewarmTimer = setTimeout(() => {
      if (state.dtCurrentData === data && window.DFWolAudio && typeof window.DFWolAudio.prewarmText === "function") {
        const track = buildDailyTextSpeechTrack(data);
        window.DFWolAudio.prewarmText(track.paragraphs, track.lang);
      }
    }, 900);

    const syncInfo = await window.DFWolDailyText.syncWithCapacitorNativeWidget(data, getEffectiveWidgetSettings());
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
    const dtRefBtn = document.getElementById("dt-scripture-ref-btn");
    const dtRefLbl = document.getElementById("dt-scripture-ref-label");
    if (dtRefLbl) dtRefLbl.textContent = data.scriptureRef;
    else if (dtRefBtn) dtRefBtn.textContent = data.scriptureRef;

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
      t.card.className = `widget-preview-card ${state.widgetSettings.size} ${resolveWidgetTheme(state.widgetSettings.theme)}`;
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
    container.innerHTML = window.DFWolStudy?.renderSkeleton
      ? window.DFWolStudy.renderSkeleton("list")
      : `<div class="loading-box">🔍 Recherche dans JW.org et WOL.jw.org…</div>`;

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
              <button type="button" class="btn-primary btn-xs" data-inapp-bible="${v.dataAttr}">📖 Lire dans l'app</button>
              <button type="button" class="btn-accent btn-xs" data-open-bible-chapter="${v.dataAttr}">🧭 Chapitre &amp; Guide de recherche</button>
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
              const vSpec = parsedTarget.verseSpec || parsedTarget.verse || 1;
              actionsHtml += `<button type="button" class="btn-primary btn-xs" data-open-bible-chapter="${parsedTarget.bookNum}:${parsedTarget.chapter}:${vSpec}">📖 Ouvrir dans Bible</button>`;
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

  function setBibleView(viewName, bookNum = selectedBibleBookNum, options = {}) {
    if (
      !options.fromHistory &&
      !options.skipNavPush &&
      !isRestoringNav &&
      state.activeTab === "bible" &&
      (activeBibleSubtab !== viewName || (bookNum && Number(bookNum) !== Number(selectedBibleBookNum)))
    ) {
      pushNavSnapshot();
    }
    activeBibleSubtab = viewName;
    if (bookNum) selectedBibleBookNum = Number(bookNum);

    const viewIds = ["books", "chapters", "reader", "batch", "appendices"];
    viewIds.forEach((v) => {
      document.getElementById(`bible-view-${v}`)?.classList.toggle("hidden", v !== viewName);
    });

    const subtabHighlight = viewName === "chapters" ? "books" : viewName;
    document.querySelectorAll("[data-bible-subtab]").forEach((btn) => {
      const isAct = btn.getAttribute("data-bible-subtab") === subtabHighlight;
      btn.classList.toggle("active", isAct);
      btn.setAttribute("aria-selected", String(isAct));
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

    if (viewName !== "reader") {
      toggleFocusMode(false, { silent: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    window.dispatchEvent(new Event("dfwol:viewchange"));
  }

  function populateBibleSelects(defaultBook = 19, defaultChapter = 83) {
    const books = window.DFWolBible.BIBLE_BOOKS;
    const bookSelect = document.getElementById("picker-book");
    const readSelect = document.getElementById("reading-book-select");

    const opts = books
      .map((b) => `<option value="${b.num}">${b.num}. ${window.DFWolBible.getBookDisplayName(b, state.lang)} (${b.chapters})</option>`)
      .join("");

    if (bookSelect) {
      bookSelect.innerHTML = opts;
      bookSelect.value = String(defaultBook || 19);
    }
    if (readSelect) {
      const curReadBook = readSelect.value || "1";
      readSelect.innerHTML = opts;
      readSelect.value = curReadBook;
    }
    populateChapterSelect(defaultBook || 19, defaultChapter || 83);
    renderReadingTrackerGrid(Number(readSelect?.value || 1));
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
    grid.setAttribute("data-book-num", String(book.num));
    for (let ch = 1; ch <= book.chapters; ch++) {
      html += `<button type="button" class="bible-jwl-ch-tile ${readSet.has(ch) ? "is-read" : ""}" data-book-num="${book.num}" data-pick-chapter="${ch}">${ch}</button>`;
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
  // Carnet de Notes, Étiquettes & Suivi des 1 189 Chapitres
  // ==========================================================================

  function syncNoteTagsUi() {
    const tags = window.DFWolStudy ? window.DFWolStudy.getTags() : [{ name: "Étude Perso", color: "#4a6da7" }];
    const sel = document.getElementById("note-tag-select");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = tags.map((t) => `<option value="${window.DFWolSearch.escapeHtml(t.name)}">${window.DFWolSearch.escapeHtml(t.name)}</option>`).join("");
      if (cur && tags.some((t) => t.name === cur)) sel.value = cur;
    }

    const filterBar = document.getElementById("notes-tag-filter-bar");
    if (filterBar) {
      filterBar.innerHTML =
        `<button type="button" class="pill-btn ${activeNoteTagFilter === "all" ? "active" : ""}" data-note-tag-filter="all">Toutes (${state.notes.length})</button>` +
        tags
          .map((t) => {
            const count = state.notes.filter((n) => n.tag === t.name || (Array.isArray(n.tags) && n.tags.includes(t.name))).length;
            return `<button type="button" class="pill-btn ${activeNoteTagFilter === t.name ? "active" : ""}" data-note-tag-filter="${window.DFWolSearch.escapeHtml(t.name)}">${window.DFWolSearch.escapeHtml(t.name)} (${count})</button>`;
          })
          .join("");
    }
  }

  function openEditNoteModal(noteId) {
    const note = state.notes.find((n) => n.id === noteId);
    const modal = document.getElementById("note-edit-modal");
    if (!note || !modal) return;
    document.getElementById("note-edit-id").value = note.id;
    document.getElementById("note-edit-title").value = note.title || "";
    document.getElementById("note-edit-body").value = note.body || "";

    const wrap = document.getElementById("note-edit-tags-wrap");
    if (wrap) {
      const allTags = window.DFWolStudy ? window.DFWolStudy.getTags() : [{ name: "Étude Perso" }];
      const noteTags = new Set(Array.isArray(note.tags) && note.tags.length ? note.tags : [note.tag || "Étude Perso"]);
      wrap.innerHTML = allTags
        .map(
          (t) => `
          <label class="note-tag-chip">
            <input type="checkbox" name="note-edit-tag" value="${window.DFWolSearch.escapeHtml(t.name)}" ${noteTags.has(t.name) ? "checked" : ""} />
            <span>${window.DFWolSearch.escapeHtml(t.name)}</span>
          </label>
        `
        )
        .join("");
    }
    modal.classList.remove("hidden");
    setTimeout(() => document.getElementById("note-edit-title")?.focus(), 20);
  }

  function renderNotesList() {
    const container = document.getElementById("notes-list-container");
    const filterVal = String(document.getElementById("notes-filter-input")?.value || "")
      .toLowerCase()
      .trim();
    const dashCount = document.getElementById("dash-notes-count");
    if (dashCount) dashCount.textContent = `${state.notes.length} note${state.notes.length > 1 ? "s" : ""}`;
    if (!container) return;

    const filtered = state.notes.filter((n) => {
      const nTags = Array.isArray(n.tags) && n.tags.length ? n.tags : [n.tag || "Étude Perso"];
      if (activeNoteTagFilter !== "all" && !nTags.includes(activeNoteTagFilter)) return false;
      if (!filterVal) return true;
      return (
        String(n.title || "").toLowerCase().includes(filterVal) ||
        String(n.body || "").toLowerCase().includes(filterVal) ||
        nTags.some((t) => String(t || "").toLowerCase().includes(filterVal))
      );
    });

    if (!filtered.length) {
      container.innerHTML = `<p class="card-helper-text">Aucune note correspondant à ce filtre.</p>`;
      return;
    }

    container.innerHTML = filtered
      .map((n) => {
        const escaped = window.DFWolSearch.escapeHtml(String(n.body || ""));
        const linked = window.DFWolBible.linkifyScripturesInHtml(escaped, state.lang);
        const nTags = Array.isArray(n.tags) && n.tags.length ? n.tags : [n.tag || "Étude Perso"];
        const badgesHtml = nTags
          .map((t) => `<span class="badge badge-blue">${window.DFWolSearch.escapeHtml(t)}</span>`)
          .join(" ");
        const srcBtn = n.ref
          ? `<button type="button" class="btn-ghost btn-xs" data-open-note-ref="${window.DFWolSearch.escapeHtml(n.ref)}">📖 Source</button>`
          : n.url
          ? `<button type="button" class="btn-ghost btn-xs" data-open-note-url="${window.DFWolSearch.escapeHtml(n.url)}">📄 Source</button>`
          : "";
        return `
          <div class="note-item-card note-card" data-note-id="${window.DFWolSearch.escapeHtml(n.id)}">
            <div class="note-item-header">
              <div class="note-head-left">
                ${badgesHtml}
                <strong>${window.DFWolSearch.escapeHtml(String(n.title || ""))}</strong>
              </div>
              <div class="btn-group">
                ${srcBtn}
                <button type="button" class="btn-icon-xs" data-edit-note="${window.DFWolSearch.escapeHtml(n.id)}" title="Modifier" aria-label="Modifier">✏️</button>
                <button type="button" class="btn-icon-xs" data-delete-note="${window.DFWolSearch.escapeHtml(n.id)}" data-del-note="${window.DFWolSearch.escapeHtml(n.id)}" title="Supprimer" aria-label="Supprimer">🗑️</button>
              </div>
            </div>
            <div class="note-item-body">${linked}</div>
          </div>
        `;
      })
      .join("");

    if (window.DFWolReader) {
      window.DFWolReader.attachInAppLinkInterceptor(container, state.lang);
    }
  }

  function renderHighlightsList() {
    const container = document.getElementById("highlights-list-container");
    if (!container || !window.DFWolReader) return;
    const list = window.DFWolReader.getAllHighlights ? window.DFWolReader.getAllHighlights() : [];
    if (!list.length) {
      container.innerHTML = `<p class="card-helper-text">Aucun passage surligné. Sélectionnez du texte dans un article pour le surligner.</p>`;
      return;
    }
    container.innerHTML = list
      .map(
        (h) => `
        <div class="note-item-card" style="border-left:4px solid ${h.color === "pink" ? "#f9a8d4" : h.color === "blue" ? "#93c5fd" : h.color === "green" ? "#86efac" : "#fde047"};">
          <div class="note-item-header">
            <button type="button" class="saved-query-btn" data-open-hl-url="${window.DFWolSearch.escapeHtml(h.url)}"><strong>${window.DFWolSearch.escapeHtml(h.docTitle)}</strong></button>
            <button type="button" class="btn-icon-xs" data-del-hl="${window.DFWolSearch.escapeHtml(h.id)}">🗑️</button>
          </div>
          <div class="note-item-body">« ${window.DFWolSearch.escapeHtml(h.quote)} »</div>
        </div>
      `
      )
      .join("");

    container.querySelectorAll("[data-open-hl-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const u = btn.getAttribute("data-open-hl-url");
        if (u) window.DFWolReader.openArticleInApp(u, { lang: state.lang });
      });
    });
    container.querySelectorAll("[data-del-hl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.DFWolReader.removeHighlightById(btn.getAttribute("data-del-hl"));
        renderHighlightsList();
      });
    });
  }
  window.DFWolRenderHighlights = renderHighlightsList;

  function stripRawTags(str) {
    return String(str || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function addRecentEntry(entry) {
    if (!entry || !entry.url) return;
    try {
      const cleaned = Object.assign({ visitedAt: new Date().toISOString() }, entry, {
        title: stripRawTags(entry.title),
        sub: stripRawTags(entry.sub || "WOL.jw.org")
      });
      const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((x) => x.url !== cleaned.url);
      list.unshift(cleaned);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
      renderRecentList();
    } catch (_) {}
  }
  window.DFWolAddRecent = addRecentEntry;

  function renderRecentList() {
    const container = document.getElementById("dash-recent-list");
    if (!container) return;
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    } catch (_) {}
    if (!list.length) {
      container.innerHTML = `<p class="card-helper-text">Vos derniers articles et publications consultés apparaîtront ici.</p>`;
      return;
    }
    container.innerHTML = list
      .slice(0, 5)
      .map(
        (r) => `
        <button type="button" class="recent-item-btn" data-recent-url="${window.DFWolSearch.escapeHtml(r.url)}">
          <div>
            <strong>${window.DFWolSearch.escapeHtml(stripRawTags(r.title))}</strong>
            <div><small>${window.DFWolSearch.escapeHtml(stripRawTags(r.sub || "WOL.jw.org"))}</small></div>
          </div>
          <span>›</span>
        </button>
      `
      )
      .join("");
    container.querySelectorAll("[data-recent-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.DFWolReader && window.DFWolReader.openArticleInApp(btn.getAttribute("data-recent-url"), { lang: state.lang });
      });
    });
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
    renderHomeHero();
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
        openBibleAt(v.bookNum, v.chapter, v.verses.length ? v.verses : v.verseStart || 1, state.lang);
      } else {
        switchTab("library", { libSubtab: "search" });
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

    const openWolPubQuick = (subpath) => {
      const cfg = window.DFWolBible.getLangConfig(state.lang);
      window.DFWolReader && window.DFWolReader.openArticleInApp(`https://wol.jw.org/${cfg.code}/wol/publication/${cfg.r}/${cfg.lp}/${subpath}`, { lang: state.lang });
    };

    const cmds = [
      { label: "⚡ Accueil & Texte du Jour", fn: () => switchTab("dashboard") },
      { label: "📖 Bible d'étude & Multi-versets", fn: () => switchTab("bible") },
      { label: "📚 Bibliothèque (Publications, Vidéos, Audio)", fn: () => switchTab("library", { libSubtab: "publications" }) },
      { label: "📰 Actualités & Nouveautés JW.org", fn: () => switchTab("library", { libSubtab: "news" }) },
      { label: "📚 Glossaire des termes bibliques (nwtstg)", fn: () => openWolPubQuick("nwtstg") },
      { label: "🔍 Recherche Totale (Vidéos, Pubs, Bible, Audio)", fn: () => switchTab("library", { libSubtab: "search" }) },
      { label: "🎬 Vidéos & Téléchargement MP4", fn: () => switchTab("library", { libSubtab: "videos" }) },
      { label: "🎵 Contenus Audio & MP3", fn: () => switchTab("library", { libSubtab: "audio" }) },
      { label: "📅 Réunions & Lecteur de Publications", fn: () => switchTab("meetings") },
      { label: "✨ Assistant IA 1-clic & Clé API", fn: () => switchTab("study", { studySubtab: "ai" }) },
      { label: "🧭 Spiritual Brother (Tchat IA 100% local)", fn: () => switchTab("study", { studySubtab: "brother" }) },
      { label: "💎 Étude individuelle, Notes & Marque-pages", fn: () => switchTab("study", { studySubtab: "notes" }) },
      { label: "🔖 Marque-pages Rubans", fn: () => switchTab("study", { studySubtab: "bookmarks" }) },
      { label: "🎶 Listes de lecture", fn: () => switchTab("study", { studySubtab: "playlists" }) },
      { label: "🕒 Historique de lecture complet", fn: () => window.DFWolStudy && window.DFWolStudy.openHistoryDrawer() },
      { label: "🌍 Basculer FR ↔ EN", fn: () => updateGlobalLanguage(state.lang === "fr" ? "en" : "fr") },
      { label: "🌓 Thème Clair / Sombre", fn: () => applyTheme(state.theme === "dark" ? "light" : "dark") }
    ];

    let selectedIdx = 0;
    let currentActions = [];

    const updateSelectionUi = () => {
      const btns = list.querySelectorAll(".cmd-item");
      btns.forEach((b, i) => b.classList.toggle("is-selected", i === selectedIdx));
      if (btns[selectedIdx]) btns[selectedIdx].scrollIntoView({ block: "nearest" });
    };

    const renderList = (q = "") => {
      const low = q.trim().toLowerCase();
      currentActions = [];
      let html = "";
      const v = window.DFWolBible.parseSingleVerseQuery(q, state.lang);
      if (v) {
        const idx = currentActions.length;
        currentActions.push(() => openBibleAt(v.bookNum, v.chapter, v.verses.length ? v.verses : v.verseStart || 1, state.lang));
        html += `<button type="button" class="cmd-item is-selected" data-cmd-exec="${idx}"><span>📖 Ouvrir <strong>${window.DFWolSearch.escapeHtml(v.label)}</strong> dans l'app</span><kbd>Entrée</kbd></button>`;
      }

      cmds
        .filter((c) => !low || c.label.toLowerCase().includes(low))
        .forEach((c) => {
          const idx = currentActions.length;
          currentActions.push(c.fn);
          html += `<button type="button" class="cmd-item ${idx === 0 ? "is-selected" : ""}" data-cmd-exec="${idx}"><span>${window.DFWolSearch.escapeHtml(c.label)}</span><kbd>→</kbd></button>`;
        });

      if (low.length >= 2) {
        const bms = window.DFWolStudy ? Object.values(window.DFWolStudy.getBookmarks()) : [];
        bms
          .filter((b) => `${b.title} ${b.subtitle || ""}`.toLowerCase().includes(low))
          .slice(0, 4)
          .forEach((b) => {
            const idx = currentActions.length;
            currentActions.push(() =>
              b.type === "bible" ? openBibleAt(b.bookNum, b.chapter, b.verse || 1, b.lang || state.lang) : window.DFWolReader.openArticleInApp(b.url, { lang: b.lang || state.lang })
            );
            html += `<button type="button" class="cmd-item" data-cmd-exec="${idx}"><span>🔖 ${window.DFWolSearch.escapeHtml(b.title)}</span><kbd>Marque-page</kbd></button>`;
          });

        state.notes
          .filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(low))
          .slice(0, 4)
          .forEach((n) => {
            const idx = currentActions.length;
            currentActions.push(() => {
              switchTab("study", { studySubtab: "notes" });
              openEditNoteModal(n.id);
            });
            html += `<button type="button" class="cmd-item" data-cmd-exec="${idx}"><span>📝 ${window.DFWolSearch.escapeHtml(n.title)}</span><kbd>Note</kbd></button>`;
          });

        const hist = window.DFWolStudy ? window.DFWolStudy.getHistory() : [];
        hist
          .filter((h) => `${h.title} ${h.subtitle || ""}`.toLowerCase().includes(low))
          .slice(0, 4)
          .forEach((h) => {
            const idx = currentActions.length;
            currentActions.push(() => {
              if (h.type === "bible") openBibleAt(h.bookNum, h.chapter, h.verse || 1, h.lang || state.lang);
              else if (h.type === "video") window.DFWolVideo && window.DFWolVideo.openVideoInApp(h.lank, { lang: h.lang || state.lang });
              else window.DFWolReader && window.DFWolReader.openArticleInApp(h.url, { lang: h.lang || state.lang });
            });
            html += `<button type="button" class="cmd-item" data-cmd-exec="${idx}"><span>🕒 ${window.DFWolSearch.escapeHtml(h.title)}</span><kbd>Historique</kbd></button>`;
          });
      }

      if (!html) {
        html = `<div class="empty-state" style="padding:1rem;"><small>Aucun résultat. Appuyez sur Entrée pour lancer une recherche complète.</small></div>`;
      }

      selectedIdx = 0;
      list.innerHTML = html;
      list.querySelectorAll("[data-cmd-exec]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const fn = currentActions[Number(btn.getAttribute("data-cmd-exec"))];
          backdrop.classList.add("hidden");
          fn && fn();
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
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentActions.length) {
          selectedIdx = (selectedIdx + 1) % currentActions.length;
          updateSelectionUi();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (currentActions.length) {
          selectedIdx = (selectedIdx - 1 + currentActions.length) % currentActions.length;
          updateSelectionUi();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const fn = currentActions[selectedIdx];
        backdrop.classList.add("hidden");
        if (fn) fn();
        else if (input.value.trim()) {
          switchTab("library", { libSubtab: "search" });
          const adv = document.getElementById("adv-search-input");
          if (adv) {
            adv.value = input.value.trim();
            executeUnifiedSearch();
          }
        }
      }
    });

    window.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const inEditable = ["input", "textarea", "select"].includes(activeTag) || document.activeElement?.isContentEditable;
      const inBackdrop = Boolean(document.querySelector(".modal-backdrop:not(.hidden)"));

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        backdrop.classList.contains("hidden") ? open() : backdrop.classList.add("hidden");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (!inBackdrop && ["bible", "meetings", "dashboard"].includes(state.activeTab) && window.DFWolStudy) {
          e.preventDefault();
          window.DFWolStudy.openFindBar();
        }
      } else if (e.key === "Escape") {
        if (document.body.classList.contains("zen-focus-mode")) {
          toggleFocusMode(false, { silent: true });
          return;
        }
        if (document.getElementById("dfwol-floating-card-menu")) {
          window.DFWolStudy ? window.DFWolStudy.closeContextMenu() : document.getElementById("dfwol-floating-card-menu")?.remove();
          return;
        }
        window.DFWolStudy && window.DFWolStudy.hideHoverPopover();
        if (window.DFWolStudy && window.DFWolStudy.isFindOpen()) {
          window.DFWolStudy.closeFindBar();
          return;
        }
        const gsp = document.getElementById("global-study-panel");
        if (gsp && !gsp.classList.contains("hidden")) {
          window.DFWolStudy?.closeArticleStudyPane?.();
          return;
        }
        for (const id of [
          "dfwol-input-modal",
          "text-selection-toolbar",
          "reader-display-popover",
          "audio-voice-popover",
          "audio-queue-drawer",
          "note-edit-modal",
          "image-lightbox-modal",
          "history-drawer-modal",
          "study-gem-drawer",
          "scripture-peek-modal",
          "ai-assistant-drawer",
          "pdf-export-modal",
          "video-download-modal",
          "cmd-palette-backdrop"
        ]) {
          const el = document.getElementById(id);
          if (el && !el.classList.contains("hidden")) {
            el.classList.add("hidden");
            return;
          }
        }
      } else if (e.code === "Space" && !inEditable && !inBackdrop && !["button", "a"].includes(activeTag)) {
        const vidStage = document.getElementById("video-player-stage");
        const vidEl = document.getElementById("dfwol-video-el");
        const audioBar = document.getElementById("global-audio-bar");
        if (state.activeTab === "library" && vidStage && !vidStage.classList.contains("hidden") && vidEl && vidEl.src) {
          e.preventDefault();
          vidEl.paused ? vidEl.play().catch(() => {}) : vidEl.pause();
        } else if (audioBar && !audioBar.classList.contains("hidden")) {
          e.preventDefault();
          document.getElementById("audio-btn-play")?.click();
        }
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !inEditable && !inBackdrop && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        if (state.activeTab === "bible" && activeBibleSubtab === "reader") {
          document.getElementById(dir < 0 ? "btn-bible-prev-ch" : "btn-bible-next-ch")?.click();
        } else if (state.activeTab === "dashboard") {
          document.querySelector(`[data-dt-nav="${dir}"]`)?.click();
        } else if (state.activeTab === "meetings" && activeMeetingsView === "week") {
          document.getElementById(dir < 0 ? "btn-week-prev" : "btn-week-next")?.click();
        }
      } else if (e.altKey && /^[1-5]$/.test(e.key)) {
        const map = { "1": "dashboard", "2": "bible", "3": "library", "4": "meetings", "5": "study" };
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
      btn.addEventListener("click", () => {
        const targetTab = btn.getAttribute("data-tab");
        if (!targetTab) return;
        if (state.activeTab === targetTab) {
          resetTabToInitialState(targetTab, { smooth: true });
        } else {
          switchTab(targetTab);
        }
      });
    });
    document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-goto-tab");
        const libSub = btn.getAttribute("data-goto-lib-subtab");
        switchTab(t, libSub ? { libSubtab: libSub } : {});
      });
    });

    document.getElementById("btn-theme-toggle")?.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });

    document.getElementById("global-lang-select")?.addEventListener("change", (e) => updateGlobalLanguage(e.target.value));
    document.querySelectorAll("[data-quick-lang]").forEach((btn) => {
      btn.addEventListener("click", () => updateGlobalLanguage(btn.getAttribute("data-quick-lang")));
    });

    const openMeetingsInApp = () => {
      switchTab("meetings", { skipAutoMeetings: true });
      loadMeetingsForOffset(meetingsWeekOffset);
    };
    const openWolPublicationInApp = (subpath) => {
      const cfg = window.DFWolBible.getLangConfig(state.lang);
      window.DFWolReader.openArticleInApp(`https://wol.jw.org/${cfg.code}/wol/publication/${cfg.r}/${cfg.lp}/${subpath}`, { lang: state.lang });
    };

    document.getElementById("dash-open-week-inapp")?.addEventListener("click", openMeetingsInApp);
    document.getElementById("dash-open-reading")?.addEventListener("click", () => switchTab("study", { studySubtab: "reading" }));
    document.getElementById("dash-goto-reading")?.addEventListener("click", () => switchTab("study", { studySubtab: "reading" }));
    document.getElementById("btn-dash-open-history")?.addEventListener("click", () => window.DFWolStudy && window.DFWolStudy.openHistoryDrawer());
    document.getElementById("sb-open-insight")?.addEventListener("click", () => openWolPublicationInApp("it"));
    document.getElementById("sb-open-rsg")?.addEventListener("click", () => openWolPublicationInApp("rsg"));
    document.getElementById("sb-open-search")?.addEventListener("click", () => {
      switchTab("library", { libSubtab: "search" });
      document.getElementById("adv-search-input")?.focus();
    });

    ["btn-header-ai", "hero-btn-ai"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => switchTab("study", { studySubtab: "ai" }));
    });
    ["hero-btn-brother", "dash-open-brother"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => switchTab("study", { studySubtab: "brother" }));
    });
    document.getElementById("btn-header-settings")?.addEventListener("click", () => switchTab("study", { studySubtab: "settings" }));

    // Contrôles Réunions 1:1 (Semaine < >, Voir les médias, Topbar Lecteur, Panneau étude, Historique)
    document.getElementById("btn-week-prev")?.addEventListener("click", () => loadMeetingsForOffset(meetingsWeekOffset - 1));
    document.getElementById("btn-week-next")?.addEventListener("click", () => loadMeetingsForOffset(meetingsWeekOffset + 1));
    document.getElementById("btn-week-today")?.addEventListener("click", () => loadMeetingsForOffset(0));
    document.getElementById("btn-meetings-lang-top")?.addEventListener("click", () => updateGlobalLanguage(state.lang === "fr" ? "en" : "fr"));
    document.getElementById("btn-lib-top-lang")?.addEventListener("click", () => updateGlobalLanguage(state.lang === "fr" ? "en" : "fr"));
    document.getElementById("btn-meetings-history-top")?.addEventListener("click", () => window.DFWolStudy && window.DFWolStudy.openHistoryDrawer());
    document.getElementById("btn-lib-top-history")?.addEventListener("click", () => window.DFWolStudy && window.DFWolStudy.openHistoryDrawer());

    const triggerSeeMedia = () => {
      const art = window.DFWolReader?.getCurrentArticleData();
      const bodyEl = document.getElementById("reader-article-body");
      window.DFWolExport && window.DFWolExport.openMeetingMediaView(bodyEl, art?.title || "Vie et ministère", art?.lang || state.lang);
    };
    ["btn-week-see-media", "btn-reader-top-media"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", triggerSeeMedia);
    });
    document.getElementById("btn-meetings-media-back")?.addEventListener("click", () => {
      showMeetingsView(window.DFWolReader?.getCurrentArticleData() ? "reader" : "week");
    });
    document.getElementById("btn-meetings-reader-back")?.addEventListener("click", () => {
      const mStack = inTabStacks.meetings;
      if (mStack && mStack.length > 0) {
        restoreNavSnapshot(mStack.pop());
        return;
      }
      if (window.DFWolReader?.canGoBack() && window.DFWolReader.goBack()) return;
      loadMeetingsForOffset(meetingsWeekOffset, { fromHistory: true });
    });
    document.getElementById("btn-reader-top-week")?.addEventListener("click", () => {
      showMeetingsView("week");
      loadMeetingsForOffset(meetingsWeekOffset);
    });
    ["reader-btn-serif", "btn-bible-serif"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => {
        state.readerFontFamily = state.readerFontFamily === "serif" ? "sans" : "serif";
        saveState();
        applyReadingComfort();
      });
    });
    ["reader-btn-focus", "btn-bible-focus"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => toggleFocusMode());
    });
    document.getElementById("dash-continue-bible")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const bNum = Number(btn.dataset.nextBook) || getNextUnreadBibleChapter().bookNum;
      const ch = Number(btn.dataset.nextCh) || getNextUnreadBibleChapter().ch;
      openBibleAt(bNum, ch, 1, state.lang);
    });
    document.getElementById("btn-reader-top-audio")?.addEventListener("click", () => {
      const art = window.DFWolReader?.getCurrentArticleData();
      if (!art || !window.DFWolAudio) return;
      if (art.mp3Url) {
        window.DFWolAudio.playTrack({
          title: art.title,
          subtitle: art.citation,
          audioUrl: art.mp3Url,
          mp3Markers: art.mp3Markers || null,
          paragraphs: art.paragraphs,
          docId: art.docId,
          lang: art.lang,
          mode: "mp3"
        });
      } else {
        window.DFWolAudio.playTrack({
          title: art.title,
          subtitle: "Lecture vocale IA",
          paragraphs: art.paragraphs,
          lang: art.lang,
          mode: "tts"
        });
      }
    });
    document.getElementById("btn-reader-top-search")?.addEventListener("click", () => {
      switchTab("library", { libSubtab: "search" });
      document.getElementById("adv-search-input")?.focus();
    });
    document.getElementById("btn-reader-top-bookmark")?.addEventListener("click", (e) => {
      const art = window.DFWolReader?.getCurrentArticleData();
      if (art && window.DFWolStudy) {
        window.DFWolStudy.openBookmarkPopover(e.currentTarget, {
          type: "article",
          title: art.title,
          subtitle: art.citation || "Publication",
          url: art.url,
          lang: art.lang
        });
      }
    });
    document.getElementById("btn-reader-top-more")?.addEventListener("click", (e) => {
      const art = window.DFWolReader?.getCurrentArticleData();
      if (art && window.DFWolReader.showCardActionMenu) {
        window.DFWolReader.showCardActionMenu(e.currentTarget, {
          title: art.title,
          url: art.url,
          lang: art.lang,
          isReaderTopbar: true
        });
      }
    });

    // Volet latéral Étude individuelle & FAB flottant global
    document.getElementById("btn-reader-gem-fab")?.addEventListener("click", () => {
      window.DFWolStudy && (window.DFWolStudy.toggleStudySidePanel ? window.DFWolStudy.toggleStudySidePanel() : window.DFWolStudy.openArticleStudyPane());
    });
    ["btn-reader-top-study", "reader-btn-study-pane"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => {
        window.DFWolStudy && window.DFWolStudy.openArticleStudyPane();
      });
    });
    document.getElementById("gem-drawer-close")?.addEventListener("click", () => {
      document.getElementById("study-gem-drawer")?.classList.add("hidden");
    });
    document.getElementById("study-gem-drawer")?.addEventListener("click", (e) => {
      if (e.target.id === "study-gem-drawer") e.target.classList.add("hidden");
    });

    // Sous-onglets Étude individuelle
    document.querySelectorAll("[data-study-subtab]").forEach((btn) => {
      btn.addEventListener("click", () => setStudyView(btn.getAttribute("data-study-subtab")));
    });

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
      window.DFWolAudio.playTrack(buildDailyTextSpeechTrack(state.dtCurrentData));
    };
    document.getElementById("btn-dt-speak")?.addEventListener("click", speakDailyText);
    document.getElementById("sw-btn-speak")?.addEventListener("click", speakDailyText);

    const openDtVerseInApp = () => {
      if (!state.dtCurrentData) return;
      const refs = window.DFWolBible.parseScriptureReferences(state.dtCurrentData.scriptureRef, state.lang);
      if (refs.length > 0) {
        const r = refs[0];
        openBibleAt(r.bookNum, r.chapter, r.verses.length ? r.verses : r.verseStart || 1, state.lang);
      }
    };
    document.getElementById("dt-scripture-ref-btn")?.addEventListener("click", openDtVerseInApp);
    document.getElementById("btn-dt-open-inapp")?.addEventListener("click", openDtVerseInApp);

    document.getElementById("btn-dt-ai")?.addEventListener("click", () => {
      if (!state.dtCurrentData || !window.DFWolAI) return;
      const d = state.dtCurrentData;
      window.DFWolAI.prepareAndOpen({
        title: `Texte du jour — ${d.scriptureRef}`,
        question:
          state.lang === "en"
            ? `Give a warm, practical 30-second comment on today's text (${d.scriptureRef}) based on the scripture and commentary.`
            : `Prépare un commentaire chaleureux et pratique pour la discussion du Texte du jour (${d.scriptureRef}) à partir du verset et de l'explication.`,
        refsText: d.scriptureRef,
        contextText: `${d.scriptureText}\n\n${d.commentary}`,
        lang: d.lang || state.lang
      });
    });

    document.getElementById("btn-dt-copy")?.addEventListener("click", async () => {
      if (!state.dtCurrentData) return;
      const d = state.dtCurrentData;
      const s = d.summaries;
      const text = `${d.formattedDate} [${s.oneWord}]\n${d.scriptureText} (${d.scriptureRef})\n\n💡 ${s.oneSentence}\n\n${d.commentary}`;
      if (window.DFWolStudy && typeof window.DFWolStudy.safeCopyText === "function") {
        await window.DFWolStudy.safeCopyText(text, "Texte du jour + résumé copiés !");
      } else {
        try {
          await navigator.clipboard.writeText(text);
          showToast("Texte du jour + résumé copiés !");
        } catch (_) {}
      }
    });

    document.getElementById("btn-dt-save-note")?.addEventListener("click", () => {
      if (!state.dtCurrentData) return;
      const d = state.dtCurrentData;
      window.DFWolAddNote(`Texte du jour — ${d.scriptureRef}`, "Texte du Jour", `${d.scriptureText}\n\n${d.commentary}`);
    });

    // Ouverture rapide verset Dashboard (multi-verset supporté)
    document.getElementById("quick-verse-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("quick-verse-input")?.value || "";
      const refs = window.DFWolBible.parseScriptureReferences(val, state.lang);
      if (!refs.length) return showToast("Référence non reconnue.");
      openBibleAt(refs[0].bookNum, refs[0].chapter, refs[0].verses.length ? refs[0].verses : refs[0].verseStart || 1, state.lang);
    });
    document.querySelectorAll("[data-sample-verse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-sample-verse");
        const refs = window.DFWolBible.parseScriptureReferences(val, state.lang);
        if (refs.length) {
          openBibleAt(refs[0].bookNum, refs[0].chapter, refs[0].verses.length ? refs[0].verses : refs[0].verseStart || 1, state.lang);
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

    document.getElementById("filter-scope")?.addEventListener("change", (e) => {
      const val = e.target.value;
      document.querySelectorAll("[data-scope-pill]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-scope-pill") === val);
      });
      updateSearchExplainer();
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
      state.savedSearches = state.savedSearches.filter(
        (s) => !(s.query === p.query && s.scope === p.scope && s.proximity === p.proximity && s.sort === p.sort)
      );
      state.savedSearches.unshift(p);
      state.savedSearches = state.savedSearches.slice(0, 25);
      saveState();
      renderSavedSearches();
      updateSettingsStats();
      showToast("Recherche sauvegardée !");
    });
    document.getElementById("btn-clear-history")?.addEventListener("click", () => {
      state.savedSearches = [];
      saveState();
      renderSavedSearches();
      updateSettingsStats();
    });
    document.getElementById("saved-searches-container")?.addEventListener("click", (e) => {
      const loadBtn = e.target.closest("[data-load-saved]");
      const delBtn = e.target.closest("[data-delete-saved]");
      if (loadBtn) {
        const item = state.savedSearches[Number(loadBtn.getAttribute("data-load-saved"))];
        if (item && advInput) {
          advInput.value = item.query;
          if (item.scope && document.getElementById("filter-scope")) {
            document.getElementById("filter-scope").value = item.scope;
            document.querySelectorAll("[data-scope-pill]").forEach((b) => {
              b.classList.toggle("active", b.getAttribute("data-scope-pill") === item.scope);
            });
          }
          if (item.engine && document.getElementById("filter-engine")) document.getElementById("filter-engine").value = item.engine;
          if (item.proximity && document.getElementById("filter-proximity")) document.getElementById("filter-proximity").value = item.proximity;
          if (item.sort && document.getElementById("filter-sort")) document.getElementById("filter-sort").value = item.sort;
          executeUnifiedSearch();
        }
      } else if (delBtn) {
        state.savedSearches.splice(Number(delBtn.getAttribute("data-delete-saved")), 1);
        saveState();
        renderSavedSearches();
        updateSettingsStats();
      }
    });

    document.querySelectorAll(".preset-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        advInput.value = btn.getAttribute("data-preset-q") || "";
        const eng = document.getElementById("filter-engine");
        if (eng) eng.value = "wol";
        const prox = btn.getAttribute("data-preset-p");
        const proxSel = document.getElementById("filter-proximity");
        if (prox && proxSel) proxSel.value = prox;
        const sort = btn.getAttribute("data-preset-r");
        const sortSel = document.getElementById("filter-sort");
        if (sort && sortSel) sortSel.value = sort;
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
        const parsedAttr = window.DFWolBible.parseDataBibleAttr(bibBtn.getAttribute("data-open-bible-chapter"));
        openBibleAt(parsedAttr.bookNum, parsedAttr.chapter, parsedAttr.verses, state.lang);
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
      const bStack = inTabStacks.bible;
      if (bStack && bStack.length > 0) {
        restoreNavSnapshot(bStack.pop());
        return;
      }
      if (activeBibleSubtab === "reader") setBibleView("chapters", selectedBibleBookNum, { fromHistory: true, skipNavPush: true });
      else setBibleView("books", selectedBibleBookNum, { fromHistory: true, skipNavPush: true });
    });

    document.getElementById("btn-bible-top-search")?.addEventListener("click", () => {
      switchTab("library", { libSubtab: "search" });
      const scopeSel = document.getElementById("filter-scope");
      if (scopeSel) scopeSel.value = "bible";
      document.querySelectorAll("[data-scope-pill]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-scope-pill") === "bible");
      });
      updateSearchExplainer();
      document.getElementById("adv-search-input")?.focus();
    });
    document.getElementById("btn-bible-top-batch")?.addEventListener("click", () => setBibleView("batch"));
    document.getElementById("btn-bible-top-audio")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      window.DFWolReader.playBibleChapterAudio(cur.bookNum || selectedBibleBookNum, cur.chapter || 1, state.lang);
    });
    document.getElementById("btn-bible-bookmark")?.addEventListener("click", (e) => {
      const cur = window.DFWolReader?.getCurrentBibleState();
      const bNum = cur?.bookNum || selectedBibleBookNum || 19;
      const ch = cur?.chapter || Number(document.getElementById("picker-chapter")?.value || 1);
      const vn = cur?.verse || 1;
      const book = window.DFWolBible.getBookByNumber(bNum);
      const bName = window.DFWolBible.getBookDisplayName(book, state.lang);
      window.DFWolStudy &&
        window.DFWolStudy.openBookmarkPopover(e.currentTarget, {
          type: "bible",
          title: `${bName} ${ch}:${vn}`,
          subtitle: "Bible d'étude",
          bookNum: bNum,
          chapter: ch,
          verse: vn,
          lang: state.lang
        });
    });
    document.getElementById("btn-bible-find")?.addEventListener("click", () => {
      window.DFWolStudy && window.DFWolStudy.openFindBar();
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
      if (window.DFWolReader && typeof window.DFWolReader.openBibleBookIntro === "function") {
        window.DFWolReader.openBibleBookIntro(selectedBibleBookNum, state.lang);
      }
    });

    document.querySelectorAll("[data-open-bible-pub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pub = btn.getAttribute("data-open-bible-pub");
        const cfg = window.DFWolBible.getLangConfig(state.lang);
        window.DFWolReader.openArticleInApp(`https://wol.jw.org/${cfg.code}/wol/publication/${cfg.r}/${cfg.lp}/${pub}`, { lang: state.lang });
      });
    });

    document.getElementById("picker-book")?.addEventListener("change", (e) => {
      populateChapterSelect(Number(e.target.value), 1);
    });
    document.getElementById("picker-verse")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-bible-go")?.click();
      }
    });
    document.getElementById("btn-bible-go")?.addEventListener("click", () => {
      const b = Number(document.getElementById("picker-book")?.value || 1);
      const c = Number(document.getElementById("picker-chapter")?.value || 1);
      const vSpec = document.getElementById("picker-verse")?.value.trim() || "1";
      openBibleAt(b, c, vSpec, state.lang);
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
    document.getElementById("btn-bible-multiselect")?.addEventListener("click", () => {
      const active = window.DFWolReader.toggleBibleMultiSelect();
      showToast(active ? "Sélection multi-versets activée : touchez plusieurs versets !" : "Sélection simple activée.");
    });
    document.getElementById("btn-bible-audio")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      window.DFWolReader.playBibleChapterAudio(cur.bookNum, cur.chapter, state.lang);
    });
    document.getElementById("btn-bible-mp3-dl")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      window.DFWolExport && window.DFWolExport.downloadBibleChapterAudio(cur.bookNum, cur.chapter, state.lang);
    });
    document.getElementById("btn-bible-parallel")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      window.DFWolReader.openBibleChapter(cur.bookNum, cur.chapter, cur.verses || cur.verse, state.lang, !cur.parallel);
    });
    document.getElementById("btn-bible-pdf")?.addEventListener("click", () => {
      const cur = window.DFWolReader.getCurrentBibleState();
      const data = cur.primaryData;
      if (!data || !window.DFWolExport) return;
      const bookName = window.DFWolBible.getBookDisplayName(data.book, data.lang);
      const html = `<h2>${window.DFWolSearch.escapeHtml(bookName)} ${data.chapter}</h2>` +
        data.verses.map((v) => `<p><strong>${v.verse}</strong> ${window.DFWolSearch.escapeHtml(v.text)}</p>`).join("");
      window.DFWolExport.openPdfExportModal({
        type: "bible",
        title: `${bookName} ${data.chapter}`,
        subtitle: "Bible d'étude (nwtsty)",
        html,
        lang: data.lang
      });
    });
    document.getElementById("bible-reader-body")?.addEventListener("click", (e) => {
      const fnBtn = e.target.closest(".bible-fn-btn[data-fn-url], .bible-mr-btn[data-mr-url]");
      if (fnBtn) {
        e.preventDefault();
        e.stopPropagation();
        const url = fnBtn.getAttribute("data-fn-url") || fnBtn.getAttribute("data-mr-url");
        if (url && window.DFWolReader) window.DFWolReader.openFootnotePeek(url, state.lang);
        return;
      }
      if (e.target.closest("mark.jw-hl")) return;
      const row = e.target.closest("[data-select-verse]");
      if (row) {
        window.DFWolReader.handleVerseRowClick(Number(row.getAttribute("data-select-verse")), e.shiftKey);
      }
    });

    // Extracteur Guide de Recherche en Lot
    document.getElementById("btn-sample-batch")?.addEventListener("click", () => {
      document.getElementById("batch-scripture-input").value =
        "Psaume 83:15-18 ; 1 Corinthiens 13:4-8 ; Proverbes 3:5, 6 ; Isaïe 41:10 ; Jude 3-5";
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
              <button type="button" class="btn-primary btn-xs" data-inapp-bible="${r.dataAttr}">📖 Lire dans l'app</button>
            </div>
          </div>
        `
        )
        .join("");
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

    document.getElementById("btn-batch-ai")?.addEventListener("click", () => {
      const selected = getSelectedBatchArticles();
      const rawRefs = document.getElementById("batch-scripture-input")?.value || "";
      if (!selected.length && !rawRefs.trim()) return showToast("Extrayez d'abord des versets ou cochez des articles.");
      window.DFWolAI &&
        window.DFWolAI.prepareAndOpen({
          title: `Étude en lot (${selected.length} articles)`,
          question:
            state.lang === "en"
              ? `Synthesize the key teachings and practical lessons from these scriptures and research articles.`
              : `Synthétise les enseignements principaux et les leçons pratiques à partir de ces versets et articles du Guide de recherche.`,
          refsText: rawRefs,
          articles: selected,
          includeRsg: false,
          explicitBatchSelection: true,
          lang: state.lang
        });
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

    const buildBatchDossierHtml = async (selected) => {
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
      return { combinedHtml, allParas };
    };

    document.getElementById("btn-batch-pdf")?.addEventListener("click", async () => {
      const selected = getSelectedBatchArticles();
      if (!selected.length) return showToast("Cochez au moins un article.");
      showToast(`Préparation du dossier PDF (${selected.length} articles)…`);
      const { combinedHtml } = await buildBatchDossierHtml(selected);
      window.DFWolExport &&
        window.DFWolExport.openPdfExportModal({
          type: "dossier",
          title: `Dossier Guide de recherche (${selected.length} articles)`,
          subtitle: document.getElementById("batch-scripture-input")?.value || "",
          html: combinedHtml,
          lang: state.lang
        });
    });

    document.getElementById("btn-batch-compile-dossier")?.addEventListener("click", async () => {
      const selected = getSelectedBatchArticles();
      if (!selected.length) return showToast("Cochez au moins un article.");
      const dossierTitle = `Dossier Guide de recherche (${selected.length} articles)`;
      showToast(`Compilation de ${selected.length} articles…`);
      const { combinedHtml, allParas } = await buildBatchDossierHtml(selected);
      window.DFWolReader.openParsedArticleObject({
        url: `dossier://batch-${Date.now()}`,
        docId: null,
        lang: state.lang,
        title: dossierTitle,
        citation: `${selected.length} articles compilés`,
        articleClasses: "jwac",
        hasNativeHeader: false,
        html: combinedHtml || "<p>Aucun contenu récupéré.</p>",
        paragraphs: allParas,
        plainText: allParas.map((p) => (typeof p === "string" ? p : p.text)).join("\n\n")
      });
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
        window.DFWolDailyText.syncWithCapacitorNativeWidget(state.dtCurrentData, getEffectiveWidgetSettings());
      }
    };

    document.getElementById("widget-display-mode")?.addEventListener("change", (e) => {
      state.widgetSettings.displayMode = e.target.value;
      syncWidgetUi();
    });
    document.getElementById("widget-theme-select")?.addEventListener("change", (e) => {
      state.widgetSettings.theme = e.target.value;
      state.widgetSettings.explicitThemeChosen = e.target.value !== "theme-auto";
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
        resolveWidgetTheme(state.widgetSettings.theme)
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

    // Notes, Étiquettes, Modale d'édition, Listes de lecture & Suivi de lecture
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

    let notesFilterTimer = null;
    document.getElementById("notes-filter-input")?.addEventListener("input", () => {
      clearTimeout(notesFilterTimer);
      notesFilterTimer = setTimeout(renderNotesList, 140);
    });

    document.getElementById("notes-tag-filter-bar")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-note-tag-filter]");
      if (!btn) return;
      activeNoteTagFilter = btn.getAttribute("data-note-tag-filter") || "all";
      syncNoteTagsUi();
      renderNotesList();
    });

    document.getElementById("btn-add-custom-tag")?.addEventListener("click", () => {
      if (!window.DFWolStudy) return;
      window.DFWolStudy.openInputDialog({
        title: "Nouvelle étiquette",
        label: "Nom de l'étiquette :",
        placeholder: "Ex : Culte familial, Prophéties…",
        onConfirm: (name) => {
          window.DFWolStudy.addTag(name);
          syncNoteTagsUi();
          renderNotesList();
          showToast(`Étiquette « ${name} » créée !`);
        }
      });
    });

    document.getElementById("notes-list-container")?.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit-note]");
      if (editBtn) {
        openEditNoteModal(editBtn.getAttribute("data-edit-note"));
        return;
      }
      const refBtn = e.target.closest("[data-open-note-ref]");
      if (refBtn) {
        const [b, ch, v] = refBtn.getAttribute("data-open-note-ref").split(":").map(Number);
        if (b && ch) openBibleAt(b, ch, v || 1, state.lang);
        return;
      }
      const urlBtn = e.target.closest("[data-open-note-url]");
      if (urlBtn) {
        window.DFWolReader && window.DFWolReader.openArticleInApp(urlBtn.getAttribute("data-open-note-url"), { lang: state.lang });
        return;
      }
      const del = e.target.closest("[data-delete-note]");
      if (del) {
        state.notes = state.notes.filter((n) => n.id !== del.getAttribute("data-delete-note"));
        saveState();
        syncNoteTagsUi();
        renderNotesList();
        updateSettingsStats();
      }
    });

    document.getElementById("note-edit-close")?.addEventListener("click", () => {
      document.getElementById("note-edit-modal")?.classList.add("hidden");
    });
    document.getElementById("note-edit-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "note-edit-modal") e.target.classList.add("hidden");
    });
    document.getElementById("note-edit-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("note-edit-id")?.value;
      const title = document.getElementById("note-edit-title")?.value.trim();
      const body = document.getElementById("note-edit-body")?.value.trim();
      const checkedTags = Array.from(document.querySelectorAll('input[name="note-edit-tag"]:checked')).map((c) => c.value);
      const note = state.notes.find((n) => n.id === id);
      if (note && title && body) {
        note.title = title;
        note.body = body;
        note.tags = checkedTags.length ? checkedTags : [note.tag || "Étude Perso"];
        note.tag = note.tags[0];
        note.updatedAt = new Date().toISOString();
        saveState();
        syncNoteTagsUi();
        renderNotesList();
        showToast("Note mise à jour !");
      }
      document.getElementById("note-edit-modal")?.classList.add("hidden");
    });

    document.getElementById("btn-create-playlist")?.addEventListener("click", () => {
      if (!window.DFWolStudy) return;
      window.DFWolStudy.openInputDialog({
        title: "Nouvelle liste de lecture",
        label: "Nom de la liste :",
        placeholder: "Étude familiale",
        defaultValue: "Étude familiale",
        onConfirm: (name) => {
          window.DFWolStudy.createPlaylist(name);
          showToast("Liste de lecture créée !");
        }
      });
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

    if (window.DFWolAudio?.getTtsOptions && window.DFWolAudio?.setTtsOptions) {
      const opts = window.DFWolAudio.getTtsOptions();
      const pitchSelects = [document.getElementById("audio-tts-pitch"), document.getElementById("settings-tts-pitch")].filter(Boolean);
      pitchSelects.forEach((sel) => {
        sel.value = opts.pitch || "0%";
        sel.addEventListener("change", (e) => {
          const val = e.target.value;
          window.DFWolAudio.setTtsOptions({ pitch: val });
          pitchSelects.forEach((other) => {
            if (other !== e.target) other.value = val;
          });
        });
      });

      const pauseSel = document.getElementById("settings-tts-pause");
      if (pauseSel) {
        pauseSel.value = String(opts.paragraphPauseMs ?? 150);
        pauseSel.addEventListener("change", (e) => {
          window.DFWolAudio.setTtsOptions({ paragraphPauseMs: Number(e.target.value) });
        });
      }

      const autoScrollCb = document.getElementById("settings-tts-autoscroll");
      if (autoScrollCb) {
        autoScrollCb.checked = opts.autoScroll !== false;
        autoScrollCb.addEventListener("change", (e) => {
          window.DFWolAudio.setTtsOptions({ autoScroll: e.target.checked });
        });
      }

      ["btn-settings-voice-preview", "audio-btn-voice-preview"].forEach((id) => {
        document.getElementById(id)?.addEventListener("click", () => {
          window.DFWolAudio.previewSelectedVoice?.(state.lang);
        });
      });
    }

    document.getElementById("btn-clear-page-cache")?.addEventListener("click", async () => {
      if (window.DFWolNet?.clearHtmlCache) {
        await window.DFWolNet.clearHtmlCache();
        showToast("Cache persistant vidé !");
        window.updateSettingsStats && window.updateSettingsStats();
      }
    });

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
      const hlCount = window.DFWolReader?.getAllHighlights ? window.DFWolReader.getAllHighlights().length : 0;
      const bmCount = window.DFWolStudy ? Object.keys(window.DFWolStudy.getBookmarks()).length : 0;
      const plCount = window.DFWolStudy ? window.DFWolStudy.getPlaylists().length : 0;
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
      };
      setTxt("settings-stats-notes", state.notes.length);
      setTxt("settings-stats-highlights", hlCount);
      setTxt("settings-stats-bookmarks", bmCount);
      setTxt("settings-stats-answers", Object.keys(ans).length);
      setTxt("settings-stats-chapters", `${totalCh} / 1189`);
      setTxt("settings-stats-playlists", plCount);
      if (window.DFWolNet?.getCacheStats) {
        window.DFWolNet.getCacheStats().then((cs) => {
          const n = cs?.count ?? 0;
          const kb = cs?.approxKb ?? 0;
          setTxt("settings-stats-cache", `${n} page${n > 1 ? "s" : ""} (${kb} Ko)`);
        }).catch(() => {});
      }
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
      const readRaw = (key, fallback) => {
        try {
          const r = localStorage.getItem(key);
          return r ? JSON.parse(r) : fallback;
        } catch (_) {
          return fallback;
        }
      };
      const payload = {
        exportedAt: new Date().toISOString(),
        app: "DFWol",
        state,
        publicationAnswers: collectAnswers(),
        highlights: readRaw("dfwol_highlights_v1", []),
        tags: readRaw("dfwol_tags_v1", []),
        bookmarks: readRaw("dfwol_bookmarks_v1", {}),
        playlists: readRaw("dfwol_playlists_v1", []),
        history: readRaw("dfwol_history_v1", []),
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
      const inputEl = e.target;
      const file = inputEl.files?.[0];
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
          if (Array.isArray(raw.highlights)) localStorage.setItem("dfwol_highlights_v1", JSON.stringify(raw.highlights));
          if (Array.isArray(raw.tags)) localStorage.setItem("dfwol_tags_v1", JSON.stringify(raw.tags));
          if (raw.bookmarks && typeof raw.bookmarks === "object") localStorage.setItem("dfwol_bookmarks_v1", JSON.stringify(raw.bookmarks));
          if (Array.isArray(raw.playlists)) localStorage.setItem("dfwol_playlists_v1", JSON.stringify(raw.playlists));
          if (Array.isArray(raw.history)) localStorage.setItem("dfwol_history_v1", JSON.stringify(raw.history));
          if (raw.customProxy && window.DFWolNet) {
            window.DFWolNet.setCustomProxyBase(raw.customProxy);
          }
          saveState();
          syncNoteTagsUi();
          renderNotesList();
          renderHighlightsList();
          renderSavedSearches();
          renderReadingTrackerGrid(Number(document.getElementById("reading-book-select")?.value || 1));
          window.DFWolStudy && window.DFWolStudy.renderBookmarksPanel(document.getElementById("study-bookmarks-list"));
          window.DFWolStudy && window.DFWolStudy.renderPlaylistsPanel(document.getElementById("study-playlists-list"));
          updateSettingsStats();
          showToast("Toutes vos données (notes, surlignages, marque-pages, listes) ont été restaurées !");
        } catch (_) {
          showToast("Fichier JSON invalide.");
        } finally {
          inputEl.value = "";
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
      badge.className = navigator.onLine ? "status-pill online hidden" : "status-pill offline";
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
      const swShell = document.getElementById("standalone-widget-shell");
      const appShell = document.getElementById("app-shell");
      swShell?.classList.remove("hidden");
      swShell?.setAttribute("aria-hidden", "false");
      appShell?.classList.add("hidden");
      appShell?.setAttribute("aria-hidden", "true");
      window.addEventListener("storage", (ev) => {
        if (ev.key === STATE_KEY || ev.key === "dfwol_daily_text_widget_payload") {
          loadState();
          applyTheme(state.theme);
          updateWidgetPreviews();
        }
      });
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

    const bookParam = Number(params.get("book"));
    const chParam = Number(params.get("ch"));
    const vParam = Number(params.get("v")) || 1;
    if (bookParam && chParam) {
      openBibleAt(bookParam, chParam, vParam, state.lang);
      return;
    }

    const articleParam = params.get("article");
    if (articleParam && window.DFWolReader) {
      window.DFWolReader.openArticleInApp(articleParam, { lang: state.lang });
      return;
    }

    const videoParam = params.get("video");
    if (videoParam && window.DFWolVideo) {
      switchTab("library", { libSubtab: "videos" });
      window.DFWolVideo.openVideoInApp(videoParam, { lang: state.lang });
      return;
    }

    const tab = params.get("tab");
    if (tab && (document.getElementById(`tab-${tab}`) || ["widget", "settings", "search", "videos", "reader"].includes(tab))) {
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
      const mapped = legacyMap[state.widgetSettings.theme] || state.widgetSettings.theme || "theme-auto";
      state.widgetSettings.theme = mapped;
      thSel.value = mapped;
    }
    document.querySelectorAll("[data-dt-view]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-dt-view") === state.dtSummaryMode);
    });

    window.DFWolAudio.init();
    window.DFWolReader.initReaderControls();
    window.DFWolVideo.init();
    window.DFWolExport && window.DFWolExport.init();
    window.DFWolAI && window.DFWolAI.init();
    window.DFWolBrother && window.DFWolBrother.init();
    window.DFWolStudy && window.DFWolStudy.init();
    window.DFWolLibrary && window.DFWolLibrary.init();

    populateBibleSelects();
    renderBibleBooksGrid();
    syncNoteTagsUi();
    renderSavedSearches();
    renderNotesList();
    renderHighlightsList();
    renderRecentList();
    setupOmnibar();
    setupCommandPalette();
    setupNativeBackAndLinkGuard();
    bindAllEvents();
    updateGlobalLanguage(state.lang);
    setBibleView("books");
    window.DFWolShowBibleView = setBibleView;
    updateSettingsStats();
    applyReadingComfort();
    updateFloatingStudyFab();
    renderHomeHero();
    window.DFWolLibrary && window.DFWolLibrary.loadJwHomeFeatured && window.DFWolLibrary.loadJwHomeFeatured(state.lang);
    window.DFWolLibrary && window.DFWolLibrary.loadHomeNewsPreview(state.lang);
    checkStartupUrlParams();
    setupPwa();
  });
})();
