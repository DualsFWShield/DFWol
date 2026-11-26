/* ==========================================================================
   DFWol Studio — Espace d'Étude Avancé 1:1 JW Library+
   Étiquettes, Marque-pages Rubans, Listes de lecture, Historique complet,
   Menus contextuels (Clic droit / Appui long), Infobulles au survol,
   Recherche Ctrl+F dans l'article, Panneau d'étude côte-à-côte & Plans
   ========================================================================== */

window.DFWolStudy = (function () {
  "use strict";

  const TAGS_KEY = "dfwol_tags_v1";
  const BOOKMARKS_KEY = "dfwol_bookmarks_v1";
  const PLAYLISTS_KEY = "dfwol_playlists_v1";
  const HISTORY_KEY = "dfwol_history_v1";
  const MAX_HISTORY = 80;

  const RIBBON_SLOTS = [
    { id: "purple", label: "Violet", color: "#6d28d9" },
    { id: "blue", label: "Bleu", color: "#2563eb" },
    { id: "teal", label: "Sarcelle", color: "#0d9488" },
    { id: "green", label: "Vert", color: "#16a34a" },
    { id: "amber", label: "Ambre", color: "#d97706" },
    { id: "orange", label: "Orange", color: "#ea580c" },
    { id: "red", label: "Rouge", color: "#dc2626" },
    { id: "pink", label: "Rose", color: "#db2777" },
    { id: "indigo", label: "Indigo", color: "#4338ca" },
    { id: "slate", label: "Ardoise", color: "#475569" }
  ];

  const DEFAULT_TAGS = [
    { name: "Étude Perso", color: "#4a6da7" },
    { name: "Réunion", color: "#5b4682" },
    { name: "Prédication", color: "#0d9488" },
    { name: "Texte du Jour", color: "#d97706" },
    { name: "Prophéties", color: "#dc2626" },
    { name: "Famille", color: "#db2777" }
  ];

  let activeArticlePaneTab = "verses";
  let sidePanelTab = "verse"; // 'verse' | 'verses' | 'notes' | 'actions'
  let currentSidePayload = null;
  const sidePanelStack = [];
  let findMatches = [];
  let findCurrentIdx = -1;
  let findActive = false;
  let hoverShowTimer = null;
  let hoverHideTimer = null;
  let hoverPinned = false;
  let activeMenuKeyHandler = null;
  let pendingInputCallback = null;
  let uiBound = false;

  function esc(str) {
    return window.DFWolSearch ? window.DFWolSearch.escapeHtml(str) : String(str || "");
  }

  function cleanStr(str) {
    return String(str || "").replace(/[\u00a0\u202f\u200b]/g, " ").replace(/\s+/g, " ").trim();
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  async function safeCopyText(text, toastMsg = "Copié !") {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        window.DFWolToast && window.DFWolToast(toastMsg);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      window.DFWolToast && window.DFWolToast(toastMsg);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ==========================================================================
  // 1. Étiquettes Personnalisées (Tags)
  // ==========================================================================

  function getTags() {
    const list = loadJson(TAGS_KEY, null);
    if (!Array.isArray(list) || !list.length) {
      saveJson(TAGS_KEY, DEFAULT_TAGS);
      return DEFAULT_TAGS.slice();
    }
    return list;
  }

  function addTag(name, color = "#4a6da7") {
    const clean = cleanStr(name).slice(0, 32);
    if (!clean) return getTags();
    const list = getTags();
    if (!list.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
      list.push({ name: clean, color });
      saveJson(TAGS_KEY, list);
    }
    return list;
  }

  function renameTag(oldName, newName) {
    const cleanNew = cleanStr(newName).slice(0, 32);
    if (!cleanNew || oldName === cleanNew) return false;
    const list = getTags().map((t) => (t.name === oldName ? Object.assign({}, t, { name: cleanNew }) : t));
    saveJson(TAGS_KEY, list);
    if (window.DFWolRenameNoteTag) window.DFWolRenameNoteTag(oldName, cleanNew);
    return true;
  }

  function deleteTag(name) {
    const list = getTags().filter((t) => t.name !== name);
    saveJson(TAGS_KEY, list.length ? list : DEFAULT_TAGS.slice());
    return getTags();
  }

  // ==========================================================================
  // 2. Marque-pages Rubans (10 emplacements couleur façon JW Library)
  // ==========================================================================

  function getBookmarks() {
    const obj = loadJson(BOOKMARKS_KEY, {});
    return obj && typeof obj === "object" ? obj : {};
  }

  function setBookmark(slotId, payload) {
    if (!slotId || !payload) return getBookmarks();
    const map = getBookmarks();
    map[slotId] = Object.assign({}, payload, { slotId, updatedAt: new Date().toISOString() });
    saveJson(BOOKMARKS_KEY, map);
    window.DFWolToast && window.DFWolToast(`Marque-page « ${payload.title} » enregistré.`);
    renderBookmarksBadgeRefresh();
    return map;
  }

  function removeBookmark(slotId) {
    const map = getBookmarks();
    delete map[slotId];
    saveJson(BOOKMARKS_KEY, map);
    window.DFWolToast && window.DFWolToast("Marque-page retiré.");
    renderBookmarksBadgeRefresh();
    return map;
  }

  function getBookmarksForBibleChapter(bookNum, chapter) {
    const map = getBookmarks();
    return Object.values(map).filter((b) => b.type === "bible" && Number(b.bookNum) === Number(bookNum) && Number(b.chapter) === Number(chapter));
  }

  function renderBookmarksBadgeRefresh() {
    const pContainer = document.getElementById("study-bookmarks-list");
    if (pContainer) renderBookmarksPanel(pContainer);
    const bData = window.DFWolReader?.getCurrentBibleState?.();
    if (bData) {
      const chMarks = getBookmarksForBibleChapter(bData.bookNum, bData.chapter);
      const markedVerses = new Map();
      chMarks.forEach((bm) => markedVerses.set(Number(bm.verse || 1), bm));
      document.querySelectorAll("#bible-reader-body .bible-verse-row").forEach((row) => {
        const vn = Number(row.getAttribute("data-select-verse"));
        row.querySelector(".v-bm-ribbon")?.remove();
        const hit = markedVerses.get(vn);
        if (hit) {
          const slot = RIBBON_SLOTS.find((s) => s.id === hit.slotId) || RIBBON_SLOTS[0];
          const rib = document.createElement("span");
          rib.className = "v-bm-ribbon";
          rib.style.setProperty("--ribbon-color", slot.color);
          rib.title = `Marque-page ${slot.label}`;
          rib.textContent = "🔖";
          row.appendChild(rib);
        }
      });
    }
    window.DFWolUpdateSettingsStats && window.DFWolUpdateSettingsStats();
  }

  function openBookmarkPopover(anchorEl, ctx) {
    if (!ctx) return;
    const map = getBookmarks();
    const rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: window.innerWidth / 2 - 110, bottom: 120 };
    const items = RIBBON_SLOTS.map((slot) => {
      const existing = map[slot.id];
      const suffix = existing ? ` — ${existing.title.slice(0, 22)}` : " (libre)";
      return {
        label: `<span class="bm-swatch-dot" style="background:${slot.color}"></span> ${slot.label}${esc(suffix)}`,
        htmlLabel: true,
        onClick: () => setBookmark(slot.id, ctx)
      };
    });
    const currentHit = Object.values(map).find(
      (b) => (ctx.type === "bible" && b.type === "bible" && b.bookNum === ctx.bookNum && b.chapter === ctx.chapter && b.verse === ctx.verse) ||
        (ctx.type === "article" && b.type === "article" && b.url === ctx.url)
    );
    if (currentHit) {
      items.push({ label: "🗑️ Retirer le marque-page actuel", onClick: () => removeBookmark(currentHit.slotId) });
    }
    openContextMenu(rect.left, rect.bottom + 6, items);
  }

  function openBookmarkEntry(bm) {
    if (!bm) return;
    if (bm.type === "bible" && window.DFWolOpenBibleAt) {
      window.DFWolOpenBibleAt(bm.bookNum, bm.chapter, bm.verse || 1, bm.lang || "fr");
    } else if (bm.url && window.DFWolReader) {
      window.DFWolReader.openArticleInApp(bm.url, { lang: bm.lang || "fr" });
    }
  }

  function renderBookmarksPanel(containerEl) {
    if (!containerEl) return;
    const map = getBookmarks();
    const entries = RIBBON_SLOTS.map((slot) => ({ slot, bm: map[slot.id] || null }));
    const activeCount = entries.filter((e) => e.bm).length;
    containerEl.innerHTML = entries
      .map(({ slot, bm }) => {
        if (!bm) {
          return `
            <div class="bm-slot-card is-empty">
              <span class="bm-ribbon-bar" style="background:${slot.color}"></span>
              <div class="bm-slot-info">
                <strong>Ruban ${slot.label}</strong>
                <small>Emplacement libre — clic droit sur un verset ou menu ⋮ d'un article pour épingler.</small>
              </div>
            </div>
          `;
        }
        return `
          <div class="bm-slot-card">
            <span class="bm-ribbon-bar" style="background:${slot.color}"></span>
            <button type="button" class="bm-slot-open" data-bm-open="${esc(slot.id)}">
              <strong>${esc(bm.title)}</strong>
              <small>${esc(bm.subtitle || (bm.type === "bible" ? "Bible" : "Publication"))} • ${new Date(bm.updatedAt).toLocaleDateString()}</small>
            </button>
            <button type="button" class="btn-icon-xs" data-bm-del="${esc(slot.id)}" title="Retirer">✕</button>
          </div>
        `;
      })
      .join("");

    if (!activeCount) {
      containerEl.insertAdjacentHTML(
        "afterbegin",
        `<p class="card-helper-text" style="margin-bottom:0.65rem;">Cliquez sur l'icône 🔖 dans la Bible ou faites un clic droit sur un verset / paragraphe pour placer un ruban.</p>`
      );
    }

    containerEl.querySelectorAll("[data-bm-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bm = getBookmarks()[btn.getAttribute("data-bm-open")];
        openBookmarkEntry(bm);
      });
    });
    containerEl.querySelectorAll("[data-bm-del]").forEach((btn) => {
      btn.addEventListener("click", () => removeBookmark(btn.getAttribute("data-bm-del")));
    });
  }

  // ==========================================================================
  // 3. Listes de Lecture Persistantes (Playlists Vidéo & Audio)
  // ==========================================================================

  function getPlaylists() {
    const list = loadJson(PLAYLISTS_KEY, null);
    if (!Array.isArray(list)) {
      const initList = [{ id: "pl-favorites", name: "Favoris & Culte familial", items: [] }];
      saveJson(PLAYLISTS_KEY, initList);
      return initList;
    }
    return list;
  }

  function savePlaylists(list) {
    saveJson(PLAYLISTS_KEY, list);
    const panel = document.getElementById("study-playlists-list");
    if (panel) renderPlaylistsPanel(panel);
    window.DFWolUpdateSettingsStats && window.DFWolUpdateSettingsStats();
  }

  function createPlaylist(name) {
    const clean = cleanStr(name).slice(0, 60);
    if (!clean) return null;
    const list = getPlaylists();
    const pl = { id: `pl-${Date.now().toString(36)}`, name: clean, items: [] };
    list.push(pl);
    savePlaylists(list);
    return pl;
  }

  function deletePlaylist(id) {
    savePlaylists(getPlaylists().filter((p) => p.id !== id));
  }

  function renamePlaylist(id, newName) {
    const clean = cleanStr(newName).slice(0, 60);
    if (!clean) return;
    savePlaylists(getPlaylists().map((p) => (p.id === id ? Object.assign({}, p, { name: clean }) : p)));
  }

  function addItemToPlaylist(playlistId, item) {
    if (!item) return false;
    const list = getPlaylists();
    const target = list.find((p) => p.id === playlistId) || list[0];
    if (!target) return false;
    const dedupKey = `${item.kind || "audio"}:${item.lank || item.audioUrl || item.wolUrl || item.title}`;
    if (!target.items.some((x) => `${x.kind || "audio"}:${x.lank || x.audioUrl || x.wolUrl || x.title}` === dedupKey)) {
      target.items.push(Object.assign({ addedAt: new Date().toISOString() }, item));
      savePlaylists(list);
      window.DFWolToast && window.DFWolToast(`Ajouté à « ${target.name} »`);
      return true;
    }
    window.DFWolToast && window.DFWolToast(`Déjà dans « ${target.name} ».`);
    return false;
  }

  function removeItemFromPlaylist(playlistId, idx) {
    const list = getPlaylists();
    const pl = list.find((p) => p.id === playlistId);
    if (!pl) return;
    pl.items.splice(idx, 1);
    savePlaylists(list);
  }

  function movePlaylistItem(playlistId, idx, dir) {
    const list = getPlaylists();
    const pl = list.find((p) => p.id === playlistId);
    if (!pl) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= pl.items.length) return;
    const [moved] = pl.items.splice(idx, 1);
    pl.items.splice(targetIdx, 0, moved);
    savePlaylists(list);
  }

  function playPlaylist(playlistId, startIdx = 0) {
    const pl = getPlaylists().find((p) => p.id === playlistId);
    if (!pl || !pl.items.length) {
      window.DFWolToast && window.DFWolToast("Liste de lecture vide.");
      return;
    }
    const item = pl.items[startIdx] || pl.items[0];
    const audioOnly = pl.items.filter((x) => x.kind !== "video");
    if (item.kind === "video" && item.lank && window.DFWolVideo) {
      window.DFWolVideo.openVideoInApp(item.lank, { lang: item.lang || "fr" });
      return;
    }
    if (audioOnly.length && window.DFWolAudio) {
      window.DFWolAudio.playQueue(
        audioOnly.map((it) => ({
          title: it.title,
          subtitle: `${pl.name} • ${it.subtitle || ""}`,
          audioUrl: it.audioUrl,
          wolUrl: it.wolUrl,
          lang: it.lang || "fr",
          mode: it.audioUrl ? "mp3" : "auto"
        })),
        0
      );
      window.DFWolToast && window.DFWolToast(`Lecture de « ${pl.name} » (${audioOnly.length} pistes).`);
    }
  }

  function openAddToPlaylistModal(item) {
    if (!item) return;
    const pls = getPlaylists();
    const menuItems = pls.map((pl) => ({
      label: `🎶 ${pl.name} (${pl.items.length})`,
      onClick: () => addItemToPlaylist(pl.id, item)
    }));
    menuItems.push({
      label: "➕ Créer une nouvelle liste…",
      onClick: () => {
        openInputDialog({
          title: "Nouvelle liste de lecture",
          label: "Nom de la liste :",
          placeholder: "Ma liste",
          defaultValue: "Ma liste",
          onConfirm: (name) => {
            const pl = createPlaylist(name);
            if (pl) addItemToPlaylist(pl.id, item);
          }
        });
      }
    });
    openContextMenu(Math.max(20, window.innerWidth / 2 - 120), Math.max(80, window.innerHeight / 2 - 90), menuItems);
  }

  function renderPlaylistsPanel(containerEl) {
    if (!containerEl) return;
    const pls = getPlaylists();
    containerEl.innerHTML = pls
      .map((pl) => {
        const itemsHtml = pl.items.length
          ? pl.items
              .map(
                (it, idx) => `
              <div class="pl-track-row">
                <button type="button" class="pl-track-open" data-pl-play-item="${esc(pl.id)}:${idx}">
                  <span>${it.kind === "video" ? "🎬" : "🎧"}</span>
                  <div>
                    <strong>${esc(it.title)}</strong>
                    <small>${esc(it.subtitle || "")}</small>
                  </div>
                </button>
                <div class="btn-group">
                  <button type="button" class="btn-icon-xs" data-pl-mv="${esc(pl.id)}:${idx}:-1" title="Monter">↑</button>
                  <button type="button" class="btn-icon-xs" data-pl-mv="${esc(pl.id)}:${idx}:1" title="Descendre">↓</button>
                  <button type="button" class="btn-icon-xs" data-pl-rm="${esc(pl.id)}:${idx}" title="Retirer">✕</button>
                </div>
              </div>
            `
              )
              .join("")
          : `<p class="card-helper-text">Ajoutez des vidéos ou audios via clic droit ou le bouton ➕ Liste.</p>`;

        return `
          <div class="pl-card">
            <div class="pl-card-header">
              <strong>🎶 ${esc(pl.name)} <span class="badge badge-subtle">${pl.items.length}</span></strong>
              <div class="btn-group">
                <button type="button" class="btn-primary btn-xs" data-pl-play="${esc(pl.id)}" ${pl.items.length ? "" : "disabled"}>▶ Tout lire</button>
                <button type="button" class="btn-ghost btn-xs" data-pl-rename="${esc(pl.id)}" title="Renommer">✏️</button>
                ${pls.length > 1 ? `<button type="button" class="btn-ghost btn-xs" data-pl-del="${esc(pl.id)}" title="Supprimer">🗑️</button>` : ""}
              </div>
            </div>
            <div class="pl-items-list">${itemsHtml}</div>
          </div>
        `;
      })
      .join("");

    containerEl.querySelectorAll("[data-pl-play]").forEach((btn) => {
      btn.addEventListener("click", () => playPlaylist(btn.getAttribute("data-pl-play")));
    });
    containerEl.querySelectorAll("[data-pl-play-item]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [id, idx] = btn.getAttribute("data-pl-play-item").split(":");
        playPlaylist(id, Number(idx));
      });
    });
    containerEl.querySelectorAll("[data-pl-rename]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-pl-rename");
        const cur = getPlaylists().find((p) => p.id === id);
        openInputDialog({
          title: "Renommer la liste",
          label: "Nouveau nom :",
          defaultValue: cur?.name || "",
          onConfirm: (next) => renamePlaylist(id, next)
        });
      });
    });
    containerEl.querySelectorAll("[data-pl-del]").forEach((btn) => {
      btn.addEventListener("click", () => deletePlaylist(btn.getAttribute("data-pl-del")));
    });
    containerEl.querySelectorAll("[data-pl-rm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [id, idx] = btn.getAttribute("data-pl-rm").split(":");
        removeItemFromPlaylist(id, Number(idx));
      });
    });
    containerEl.querySelectorAll("[data-pl-mv]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [id, idx, dir] = btn.getAttribute("data-pl-mv").split(":");
        movePlaylistItem(id, Number(idx), Number(dir));
      });
    });
  }

  // ==========================================================================
  // 4. Historique Complet (Bible, Publications, Vidéos) + Tiroir dédié
  // ==========================================================================

  function getHistory() {
    const list = loadJson(HISTORY_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function recordHistory(entry) {
    if (!entry || !entry.title) return;
    const key =
      entry.type === "bible"
        ? `bible:${entry.bookNum}:${entry.chapter}:${entry.lang || "fr"}`
        : entry.type === "video"
        ? `video:${entry.lank}:${entry.lang || "fr"}`
        : `article:${entry.url}`;
    const list = getHistory().filter((x) => x.key !== key);
    list.unshift(Object.assign({ key, visitedAt: new Date().toISOString() }, entry));
    saveJson(HISTORY_KEY, list.slice(0, MAX_HISTORY));
  }

  function clearHistory() {
    saveJson(HISTORY_KEY, []);
    renderHistoryList();
    window.DFWolToast && window.DFWolToast("Historique effacé.");
  }

  function openHistoryEntry(entry) {
    document.getElementById("history-drawer-modal")?.classList.add("hidden");
    if (entry.type === "bible" && window.DFWolOpenBibleAt) {
      window.DFWolOpenBibleAt(entry.bookNum, entry.chapter, entry.verse || 1, entry.lang || "fr");
    } else if (entry.type === "video" && window.DFWolVideo) {
      window.DFWolVideo.openVideoInApp(entry.lank, { lang: entry.lang || "fr" });
    } else if (entry.url && window.DFWolReader) {
      window.DFWolReader.openArticleInApp(entry.url, { lang: entry.lang || "fr" });
    }
  }

  function renderHistoryList(filterType = "all", query = "") {
    const listEl = document.getElementById("history-drawer-list");
    if (!listEl) return;
    const q = cleanStr(query).toLowerCase();
    const items = getHistory().filter(
      (h) => (filterType === "all" || h.type === filterType) && (!q || `${h.title} ${h.subtitle || ""}`.toLowerCase().includes(q))
    );
    if (!items.length) {
      listEl.innerHTML = `<p class="card-helper-text">Aucun élément dans l'historique correspondant à ce filtre.</p>`;
      return;
    }
    listEl.innerHTML = items
      .map((it, idx) => {
        const icon = it.type === "bible" ? "📖" : it.type === "video" ? "🎬" : "📄";
        const when = new Date(it.visitedAt).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        return `
          <button type="button" class="history-item-btn" data-hist-idx="${idx}">
            <span class="hist-ico">${icon}</span>
            <div class="hist-meta">
              <strong>${esc(it.title)}</strong>
              <small>${esc(it.subtitle || it.type)} • ${when}</small>
            </div>
            <span>›</span>
          </button>
        `;
      })
      .join("");

    listEl.querySelectorAll("[data-hist-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosen = items[Number(btn.getAttribute("data-hist-idx"))];
        if (chosen) openHistoryEntry(chosen);
      });
    });
  }

  function openHistoryDrawer(defaultType = "all") {
    const modal = document.getElementById("history-drawer-modal");
    if (!modal) return;
    modal.dataset.filterType = defaultType;
    modal.querySelectorAll("[data-hist-filter]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-hist-filter") === defaultType);
    });
    const inp = document.getElementById("history-search-input");
    if (inp) inp.value = "";
    renderHistoryList(defaultType, "");
    modal.classList.remove("hidden");
  }

  // ==========================================================================
  // 5. Menu Contextuel Unifié (Clic droit PC + Appui long mobile)
  // ==========================================================================

  function closeContextMenu() {
    if (activeMenuKeyHandler) {
      document.removeEventListener("keydown", activeMenuKeyHandler, true);
      activeMenuKeyHandler = null;
    }
    document.getElementById("dfwol-floating-card-menu")?.remove();
  }

  function openContextMenu(x, y, items, opts = {}) {
    closeContextMenu();
    if (!items || !items.length) return;
    const menu = document.createElement("div");
    menu.id = "dfwol-floating-card-menu";
    menu.className = "jwl-context-menu";
    menu.setAttribute("role", "menu");
    items.forEach((it, idx) => {
      if (it.divider) {
        const sep = document.createElement("div");
        sep.className = "ctx-divider";
        menu.appendChild(sep);
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.dataset.cmIdx = String(idx);
      if (it.htmlLabel) btn.innerHTML = it.label;
      else btn.textContent = it.label;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeContextMenu();
        it.onClick && it.onClick();
      });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);

    const mRect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - mRect.width - 8, x));
    let top = opts.anchorTop ? y - mRect.height : y;
    top = Math.max(8, Math.min(window.innerHeight - mRect.height - 8, top));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const menuButtons = Array.from(menu.querySelectorAll('button[role="menuitem"]'));
    if (menuButtons.length) {
      menuButtons[0].focus({ preventScroll: true });
    }
    activeMenuKeyHandler = (ev) => {
      if (!document.body.contains(menu)) {
        closeContextMenu();
        return;
      }
      if (!menuButtons.length) return;
      const curIdx = menuButtons.indexOf(document.activeElement);
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        menuButtons[(curIdx + 1) % menuButtons.length].focus({ preventScroll: true });
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        menuButtons[(curIdx - 1 + menuButtons.length) % menuButtons.length].focus({ preventScroll: true });
      } else if (ev.key === "Home") {
        ev.preventDefault();
        menuButtons[0].focus({ preventScroll: true });
      } else if (ev.key === "End") {
        ev.preventDefault();
        menuButtons[menuButtons.length - 1].focus({ preventScroll: true });
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        closeContextMenu();
      }
    };
    document.addEventListener("keydown", activeMenuKeyHandler, true);

    const dismiss = (ev) => {
      if (!menu.contains(ev.target)) {
        closeContextMenu();
        document.removeEventListener("click", dismiss, true);
      }
    };
    setTimeout(() => document.addEventListener("click", dismiss, true), 10);
  }

  function buildBibleVerseContextItems(verseRow) {
    const vn = Number(verseRow.getAttribute("data-select-verse")) || 1;
    const bibleState = window.DFWolReader?.getCurrentBibleState?.();
    if (!bibleState || !bibleState.primaryData) return [];
    const data = bibleState.primaryData;
    const vObj = data.verses.find((v) => v.verse === vn);
    const vText = vObj ? vObj.text : "";
    const bookName = window.DFWolBible.getBookDisplayName(data.book, data.lang);
    const refLabel = `${bookName} ${data.chapter}:${vn}`;
    const docKey = `bible:${data.bookNum}:${data.chapter}`;

    const applyColorHighlight = (color) => {
      if (!vText || !window.DFWolReader) return;
      const textSpan = verseRow.querySelector(".bible-v-text") || verseRow;
      window.DFWolReader.addHighlight(docKey, `${bookName} ${data.chapter}`, data.wolBibleUrl, vText, color);
      window.DFWolReader.applyHighlightsToContainer(textSpan, docKey);
      window.DFWolRenderHighlights && window.DFWolRenderHighlights();
      window.DFWolToast && window.DFWolToast(`Verset ${vn} surligné.`);
    };

    return [
      { label: `📖 Étudier ${refLabel}`, onClick: () => window.DFWolReader.handleVerseRowClick(vn, false) },
      { label: "⚖️ Comparer les versions", onClick: () => {
        window.DFWolReader.renderVerseStudyPanel([vn], { activeTab: "compare" });
      } },
      { label: "📋 Copier le verset", onClick: () => safeCopyText(`${refLabel} — ${vText}`, `${refLabel} copié !`) },
      { label: "🎧 MP3 Bible dès ce verset", onClick: () => window.DFWolAudio && window.DFWolAudio.playMp3FromVerse(vn, data) },
      { label: "🗣️ Voix IA sur ce verset", onClick: () => window.DFWolAudio && window.DFWolAudio.playTrack({ title: refLabel, subtitle: "Bible d'étude", text: `${refLabel}. ${vText}`, lang: data.lang, mode: "tts" }) },
      { divider: true },
      { label: `<span class="cm-hl-dots"><span class="hl-dot hl-yellow"></span></span> Surligner Jaune`, htmlLabel: true, onClick: () => applyColorHighlight("yellow") },
      { label: `<span class="cm-hl-dots"><span class="hl-dot hl-pink"></span></span> Surligner Rose`, htmlLabel: true, onClick: () => applyColorHighlight("pink") },
      { label: `<span class="cm-hl-dots"><span class="hl-dot hl-blue"></span></span> Surligner Bleu`, htmlLabel: true, onClick: () => applyColorHighlight("blue") },
      { label: `<span class="cm-hl-dots"><span class="hl-dot hl-green"></span></span> Surligner Vert`, htmlLabel: true, onClick: () => applyColorHighlight("green") },
      { divider: true },
      { label: "📝 Ajouter une note liée", onClick: () => window.DFWolAddNote && window.DFWolAddNote(refLabel, "Étude Perso", vText, { targetType: "bible", ref: `${data.bookNum}:${data.chapter}:${vn}`, docKey }) },
      { label: "🔖 Placer un marque-page ruban", onClick: () => openBookmarkPopover(verseRow, { type: "bible", title: refLabel, subtitle: "Bible d'étude", bookNum: data.bookNum, chapter: data.chapter, verse: vn, lang: data.lang }) },
      { label: "✨ IA 1-clic (Expliquer ce verset)", onClick: () => window.DFWolAI && window.DFWolAI.prepareAndOpen({ title: refLabel, refsText: refLabel, explicitRefs: [window.DFWolBible.buildScriptureLinks(data.bookNum, data.chapter, [vn], null, data.lang)], articles: data.studyByVerse[vn]?.researchGuide || [], lang: data.lang }) },
      { label: "🔗 Partager / Copier le lien", onClick: () => shareDeepLink({ title: refLabel, text: `${refLabel} — ${vText}`, params: { tab: "bible", book: data.bookNum, ch: data.chapter, v: vn } }) }
    ];
  }

  function handleContextTrigger(target, clientX, clientY) {
    const verseRow = target.closest(".bible-verse-row");
    if (verseRow) {
      const items = buildBibleVerseContextItems(verseRow);
      if (items.length) {
        openContextMenu(clientX, clientY, items);
        return true;
      }
    }

    const artPara = target.closest("#reader-article-body p, #reader-article-body li");
    if (artPara && !target.closest(".gen-field, #materialNav, #todayNav")) {
      const art = window.DFWolReader?.getCurrentArticleData?.();
      const pTxt = cleanStr(artPara.textContent || "");
      const pid = artPara.getAttribute("data-reader-pid") || artPara.id || "";
      if (art && pTxt) {
        const ctxItems = [];
        if (art.mp3Url) {
          ctxItems.push({ label: "🎧 Lire le MP3 depuis ici", onClick: () => window.DFWolAudio && window.DFWolAudio.playMp3FromParagraph(pid, art) });
        }
        ctxItems.push(
          { label: "🗣️ Voix IA depuis ici", onClick: () => window.DFWolAudio && window.DFWolAudio.playFromParagraph(pid, art) },
          { label: "📋 Copier ce paragraphe", onClick: () => safeCopyText(pTxt, "Paragraphe copié !") },
          { label: "📝 Ajouter aux notes", onClick: () => window.DFWolAddNote && window.DFWolAddNote(art.title, "Réunion", pTxt, { targetType: "article", url: art.url, docKey: art.docId || art.url }) },
          { label: "🔖 Placer un marque-page ruban", onClick: () => openBookmarkPopover(artPara, { type: "article", title: art.title, subtitle: art.citation, url: art.url, lang: art.lang }) },
          { label: "✨ IA 1-clic sur ce paragraphe", onClick: () => window.DFWolAI && window.DFWolAI.prepareAndOpen({ title: art.title, citation: art.citation, question: `Explique ce paragraphe et les versets cités : « ${pTxt.slice(0, 260)} »`, contextText: pTxt, refsText: pTxt, lang: art.lang }) },
          { label: "🔗 Partager le lien", onClick: () => shareDeepLink({ title: art.title, params: { tab: "meetings", article: art.docId || art.url } }) }
        );
        openContextMenu(clientX, clientY, ctxItems);
        return true;
      }
    }

    const vidCard = target.closest(".video-card, .jwl-media-tile[data-media-play], .jwl-media-thumb[data-media-play]");
    if (vidCard) {
      const lank = vidCard.getAttribute("data-media-play") || vidCard.querySelector("[data-play-lank]")?.getAttribute("data-play-lank");
      const title = cleanStr(vidCard.querySelector("h4, .jwl-media-caption")?.textContent || lank || "Vidéo JW");
      const thumb = vidCard.querySelector("img")?.src || "";
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      if (lank) {
        openContextMenu(clientX, clientY, [
          { label: "▶ Regarder dans l'app", onClick: () => window.DFWolVideo && window.DFWolVideo.openVideoInApp(lank, { lang }) },
          { label: "➕ Ajouter à une liste de lecture", onClick: () => openAddToPlaylistModal({ kind: "video", title, lank, lang, thumb }) },
          { label: "⬇️ Télécharger MP4", onClick: () => window.DFWolExport && window.DFWolExport.openVideoDownloadModal(lank, lang) },
          { label: "🔗 Partager la vidéo", onClick: () => shareDeepLink({ title, params: { tab: "library", video: lank } }) }
        ]);
        return true;
      }
    }

    const audioCard = target.closest(".jwl-audio-track-card");
    if (audioCard) {
      const playBtn = audioCard.querySelector("[data-play-track]");
      const title = cleanStr(audioCard.querySelector("strong")?.textContent || "Piste audio");
      const sub = cleanStr(audioCard.querySelector("small")?.textContent || "");
      const qBtn = audioCard.querySelector("[data-queue-track]");
      const dlBtn = audioCard.querySelector("[data-dl-track]");
      openContextMenu(clientX, clientY, [
        { label: "▶ Écouter maintenant", onClick: () => playBtn?.click() },
        { label: "➕ Ajouter à la file d'attente", onClick: () => qBtn?.click() },
        { label: "🎶 Ajouter à une liste de lecture", onClick: () => {
          const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
          const plUrl = audioCard.getAttribute("data-track-url") || "";
          openAddToPlaylistModal({ kind: "audio", title, subtitle: sub, audioUrl: plUrl, lang });
        } },
        { label: "⬇️ Télécharger MP3", onClick: () => dlBtn?.click() }
      ]);
      return true;
    }

    const noteCard = target.closest(".note-card[data-note-id]");
    if (noteCard) {
      const noteId = noteCard.getAttribute("data-note-id");
      const editBtn = noteCard.querySelector("[data-edit-note]");
      const delBtn = noteCard.querySelector("[data-del-note]");
      openContextMenu(clientX, clientY, [
        { label: "✏️ Modifier la note", onClick: () => editBtn?.click() },
        { label: "📋 Copier la note", onClick: () => safeCopyText(cleanStr(noteCard.innerText || ""), "Note copiée !") },
        { label: "🗑️ Supprimer", onClick: () => delBtn?.click() }
      ]);
      return Boolean(noteId);
    }

    return false;
  }

  function bindContextMenus() {
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest("input, textarea")) return;
      const handled = handleContextTrigger(e.target, e.clientX, e.clientY);
      if (handled) e.preventDefault();
    });

    // Appui long sur mobile / tablette tactile
    let pressTimer = null;
    let startX = 0;
    let startY = 0;
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.pointerType !== "touch") return;
        if (e.target.closest("button, a, input, textarea, select")) return;
        startX = e.clientX;
        startY = e.clientY;
        const target = e.target;
        pressTimer = setTimeout(() => {
          const sel = window.getSelection()?.toString().trim();
          if (!sel) handleContextTrigger(target, startX, startY);
        }, 560);
      },
      { passive: true }
    );
    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    document.addEventListener("pointermove", (e) => {
      if (pressTimer && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) cancelPress();
    }, { passive: true });
    document.addEventListener("pointerup", cancelPress, { passive: true });
    document.addEventListener("pointercancel", cancelPress, { passive: true });
  }

  // ==========================================================================
  // 6. Infobulles au Survol Desktop (Versets, Notes * et Renvois +)
  // ==========================================================================

  function ensureHoverPopoverEl() {
    let pop = document.getElementById("dfwol-hover-popover");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "dfwol-hover-popover";
      pop.className = "dfwol-hover-popover hidden";
      pop.setAttribute("role", "tooltip");
      document.body.appendChild(pop);
      pop.addEventListener("mouseenter", () => {
        hoverPinned = true;
        clearTimeout(hoverHideTimer);
      });
      pop.addEventListener("mouseleave", () => {
        hoverPinned = false;
        scheduleHideHoverPopover();
      });
    }
    return pop;
  }

  function hideHoverPopover() {
    clearTimeout(hoverShowTimer);
    clearTimeout(hoverHideTimer);
    hoverPinned = false;
    document.getElementById("dfwol-hover-popover")?.classList.add("hidden");
  }

  function scheduleHideHoverPopover() {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(() => {
      if (!hoverPinned) hideHoverPopover();
    }, 180);
  }

  function positionHoverPopover(pop, anchorRect) {
    pop.classList.remove("hidden");
    const pRect = pop.getBoundingClientRect();
    const left = Math.max(10, Math.min(window.innerWidth - pRect.width - 10, anchorRect.left));
    const showAbove = anchorRect.bottom + pRect.height + 16 > window.innerHeight && anchorRect.top > pRect.height + 20;
    const top = showAbove ? Math.max(10, anchorRect.top - pRect.height - 8) : Math.min(window.innerHeight - pRect.height - 10, anchorRect.bottom + 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  async function showHoverPreviewForTrigger(triggerEl) {
    if (!triggerEl || !document.contains(triggerEl)) return;
    const pop = ensureHoverPopoverEl();
    const rect = triggerEl.getBoundingClientRect();
    const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";

    const fnUrl = triggerEl.getAttribute("data-fn-url") || triggerEl.getAttribute("data-mr-url");
    if (fnUrl && window.DFWolReader?.fetchWolFootnoteOrMarginal) {
      pop.innerHTML = `<div class="hover-pop-head"><span>${triggerEl.classList.contains("bible-fn-btn") ? "📌 Note de bas de page" : "🔗 Renvois marginaux"}</span></div><div class="hover-pop-body">⏳ Chargement…</div>`;
      positionHoverPopover(pop, rect);
      try {
        const res = await window.DFWolReader.fetchWolFootnoteOrMarginal(fnUrl, lang);
        if (pop.classList.contains("hidden")) return;
        pop.innerHTML = `<div class="hover-pop-head"><span>${triggerEl.classList.contains("bible-fn-btn") ? "📌 Note" : "🔗 Renvois"}</span><button type="button" class="btn-ghost btn-xs" id="hover-pop-copy">📋</button></div><div class="hover-pop-body">${res.html}</div>`;
        window.DFWolReader.attachInAppLinkInterceptor(pop, lang);
        positionHoverPopover(pop, rect);
        pop.querySelector("#hover-pop-copy")?.addEventListener("click", () => safeCopyText(res.plainText, "Copié !"));
      } catch (_) {
        hideHoverPopover();
      }
      return;
    }

    const bibAttr = triggerEl.getAttribute("data-inapp-bible");
    let refObj = null;
    if (bibAttr) {
      const p = window.DFWolBible.parseDataBibleAttr(bibAttr);
      refObj = window.DFWolBible.buildScriptureLinks(p.bookNum, p.chapter, p.verses, null, lang);
    } else if (triggerEl.matches("a[href]")) {
      const parsed = window.DFWolBible.parseWolUrlTarget(triggerEl.getAttribute("href") || "", lang);
      if (parsed.type === "bible") {
        refObj = window.DFWolBible.buildScriptureLinks(parsed.bookNum, parsed.chapter, parsed.verses || parsed.verse || 1, null, parsed.lang || lang);
      }
    }
    if (!refObj || !window.DFWolReader) return;

    pop.innerHTML = `<div class="hover-pop-head"><strong>📖 ${esc(refObj.label)}</strong></div><div class="hover-pop-body">⏳ Chargement…</div>`;
    positionHoverPopover(pop, rect);
    try {
      const chData = await window.DFWolReader.fetchBibleChapterParsed(refObj.bookNum, refObj.chapter, refObj.lang || lang);
      if (pop.classList.contains("hidden")) return;
      const vList = Array.isArray(refObj.verses) && refObj.verses.length ? refObj.verses : [1];
      const matched = vList.map((vn) => chData.verses.find((v) => v.verse === vn)).filter(Boolean);
      const textBody = matched.map((v) => `<sup>${v.verse}</sup> ${esc(v.text)}`).join(" ");
      const plainCopy = matched.map((v) => `${v.verse}. ${v.text}`).join(" ");
      pop.innerHTML = `
        <div class="hover-pop-head">
          <strong>📖 ${esc(refObj.label)}</strong>
          <div class="btn-group">
            <button type="button" class="btn-ghost btn-xs" id="hover-pop-open">Ouvrir</button>
            <button type="button" class="btn-ghost btn-xs" id="hover-pop-copy">📋</button>
          </div>
        </div>
        <div class="hover-pop-body">${textBody || "Texte indisponible."}</div>
      `;
      positionHoverPopover(pop, rect);
      pop.querySelector("#hover-pop-open")?.addEventListener("click", () => {
        hideHoverPopover();
        window.DFWolReader.openScripturePeekDrawer(refObj.bookNum, refObj.chapter, vList, refObj.lang || lang);
      });
      pop.querySelector("#hover-pop-copy")?.addEventListener("click", () => safeCopyText(`${refObj.label} — ${plainCopy}`, "Verset copié !"));
    } catch (_) {
      hideHoverPopover();
    }
  }

  function initHoverPreviews() {
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.addEventListener("mouseover", (e) => {
      const trig = e.target.closest("[data-inapp-bible], a.inline-scripture-link, .bible-fn-btn, .bible-mr-btn");
      if (!trig || trig.closest("#dfwol-hover-popover, .modal-backdrop")) return;
      if (e.relatedTarget && trig.contains(e.relatedTarget)) return;
      clearTimeout(hoverHideTimer);
      clearTimeout(hoverShowTimer);
      hoverShowTimer = setTimeout(() => showHoverPreviewForTrigger(trig), 260);
    });
    document.addEventListener("mouseout", (e) => {
      const trig = e.target.closest("[data-inapp-bible], a.inline-scripture-link, .bible-fn-btn, .bible-mr-btn");
      if (!trig) return;
      if (e.relatedTarget && (trig.contains(e.relatedTarget) || e.relatedTarget.closest("#dfwol-hover-popover"))) return;
      clearTimeout(hoverShowTimer);
      scheduleHideHoverPopover();
    });
  }

  // ==========================================================================
  // 7. Recherche dans l'Article / Chapitre (Ctrl+F)
  // ==========================================================================

  function clearFindHighlights() {
    document.querySelectorAll("mark.dfwol-find-hit").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent || ""), m);
      parent.normalize();
    });
    findMatches = [];
    findCurrentIdx = -1;
  }

  function getActiveFindContainer() {
    const tabMeetings = document.getElementById("tab-meetings")?.classList.contains("active");
    if (tabMeetings) return document.getElementById("reader-article-body");
    const tabBible = document.getElementById("tab-bible")?.classList.contains("active");
    if (tabBible) return document.getElementById("bible-reader-body");
    return document.getElementById("dash-dt-body");
  }

  function updateFindCounterLabel() {
    const lbl = document.getElementById("find-bar-count");
    if (!lbl) return;
    lbl.textContent = findMatches.length ? `${findCurrentIdx + 1}/${findMatches.length}` : "0/0";
  }

  function jumpToFindMatch(dir = 1) {
    if (!findMatches.length) return;
    if (findCurrentIdx >= 0 && findMatches[findCurrentIdx]) {
      findMatches[findCurrentIdx].classList.remove("active");
    }
    findCurrentIdx = (findCurrentIdx + dir + findMatches.length) % findMatches.length;
    const activeEl = findMatches[findCurrentIdx];
    if (activeEl) {
      activeEl.classList.add("active");
      activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateFindCounterLabel();
  }

  function runFindInContainer(query) {
    clearFindHighlights();
    const q = String(query || "").trim();
    const container = getActiveFindContainer();
    if (!q || !container || q.length < 1) {
      updateFindCounterLabel();
      return;
    }
    const lowerQ = q.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && !n.parentElement?.closest("script, style, button, .jw-ai-inline-bar")) {
        if (n.nodeValue.toLowerCase().includes(lowerQ)) nodes.push(n);
      }
    }
    nodes.forEach((textNode) => {
      const val = textNode.nodeValue;
      const low = val.toLowerCase();
      let idx = low.indexOf(lowerQ);
      if (idx === -1) return;
      const frag = document.createDocumentFragment();
      let cursor = 0;
      while (idx !== -1 && findMatches.length < 250) {
        if (idx > cursor) frag.appendChild(document.createTextNode(val.slice(cursor, idx)));
        const mark = document.createElement("mark");
        mark.className = "dfwol-find-hit";
        mark.textContent = val.slice(idx, idx + q.length);
        frag.appendChild(mark);
        findMatches.push(mark);
        cursor = idx + q.length;
        idx = low.indexOf(lowerQ, cursor);
      }
      if (cursor < val.length) frag.appendChild(document.createTextNode(val.slice(cursor)));
      textNode.parentNode?.replaceChild(frag, textNode);
    });

    if (findMatches.length) {
      findCurrentIdx = 0;
      findMatches[0].classList.add("active");
      findMatches[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateFindCounterLabel();
  }

  function openFindBar() {
    const bar = document.getElementById("in-reader-find-bar");
    const inp = document.getElementById("find-bar-input");
    if (!bar || !inp) return false;
    findActive = true;
    bar.classList.remove("hidden");
    inp.focus();
    inp.select();
    if (inp.value.trim()) runFindInContainer(inp.value);
    return true;
  }

  function closeFindBar() {
    findActive = false;
    clearFindHighlights();
    document.getElementById("in-reader-find-bar")?.classList.add("hidden");
  }

  // ==========================================================================
  // 8. Volet Latéral Unifié « Étude Individuelle » (Sans modale verset)
  // ==========================================================================

  function showGlobalStudyPanelDrawer() {
    const panel = document.getElementById("global-study-panel");
    const bd = document.getElementById("global-study-panel-backdrop");
    if (!panel) return false;
    bd?.classList.remove("hidden");
    panel.classList.remove("hidden");
    requestAnimationFrame(() => panel.classList.add("is-open"));
    return true;
  }

  function closeArticleStudyPane() {
    document.getElementById("meetings-view-content")?.classList.remove("has-study-pane");
    document.getElementById("article-study-pane")?.classList.add("hidden");
    const panel = document.getElementById("global-study-panel");
    if (panel) {
      panel.classList.remove("is-open");
      panel.classList.add("hidden");
    }
    document.getElementById("global-study-panel-backdrop")?.classList.add("hidden");
  }

  function toggleStudySidePanel() {
    const panel = document.getElementById("global-study-panel");
    if (panel && !panel.classList.contains("hidden")) {
      closeArticleStudyPane();
      return;
    }
    if (currentSidePayload) {
      openStudySidePanel(currentSidePayload, { skipPush: true });
      return;
    }
    openArticleStudyPane();
  }

  async function renderSideVerseDetails(bodyEl, payload) {
    const lang = payload.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    if (payload.kind === "footnote") {
      bodyEl.innerHTML = renderSkeleton("article");
      try {
        const res = await window.DFWolReader.fetchWolFootnoteOrMarginal(payload.url, lang);
        bodyEl.innerHTML = `<div class="jwac peek-footnote-body">${res.html}</div>`;
        window.DFWolReader.attachInAppLinkInterceptor(bodyEl, lang);
      } catch (err) {
        bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
      }
      return;
    }

    if (payload.kind === "intro") {
      const book = window.DFWolBible.getBookByNumber(payload.bookNum);
      const bookName = window.DFWolBible.getBookDisplayName(book, lang);
      bodyEl.innerHTML = renderSkeleton("list");
      try {
        const chData = await window.DFWolReader.fetchBibleChapterParsed(book.num, 1, lang);
        const outline = Array.isArray(chData.outline) ? chData.outline : [];
        bodyEl.innerHTML = `
          <div class="study-panel-verse-box">
            <span class="badge badge-blue">Aperçu • ${book.chapters} ch.</span>
            <h3>${esc(bookName)}</h3>
          </div>
          ${outline.length
            ? `<ul class="outline-mini-list">${outline.map((o) => `<li class="ol-lvl-${o.level}">${o.href ? `<a href="${esc(o.href)}">${esc(o.text)}</a>` : esc(o.text)}</li>`).join("")}</ul>`
            : `<p class="card-helper-text">${esc(bookName)} contient ${book.chapters} chapitre(s).</p>`}
        `;
        window.DFWolReader.attachInAppLinkInterceptor(bodyEl, lang);
      } catch (err) {
        bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
      }
      return;
    }

    // kind === "verse"
    const versesList = window.DFWolBible.parseVerseSpec(payload.verseOrSpec || 1);
    const verses = versesList.length ? versesList : [1];
    const verseSpec = window.DFWolBible.formatVerseSpec(verses, false);
    const verseSpecCompact = window.DFWolBible.formatVerseSpec(verses, true);
    const book = window.DFWolBible.getBookByNumber(payload.bookNum);
    const label = `${window.DFWolBible.getBookDisplayName(book, lang)} ${payload.chapter}:${verseSpec}`;
    bodyEl.innerHTML = renderSkeleton("article");

    try {
      const chData = await window.DFWolReader.fetchBibleChapterParsed(book.num, payload.chapter, lang);
      const matchedObjs = verses.map((vn) => chData.verses.find((v) => v.verse === vn)).filter(Boolean);
      const plainCombined = matchedObjs.map((v) => `${v.verse}. ${v.text}`).join(" ");
      const quoteHtml = matchedObjs.length
        ? matchedObjs.map((v) => `<sup>${v.verse}</sup> ${esc(v.text)}`).join(" ")
        : "Texte indisponible.";

      const studyNotes = [];
      const crossRefs = [];
      const rsgMap = new Map();
      const pubIdxMap = new Map();
      verses.forEach((vn) => {
        const st = chData.studyByVerse[vn];
        if (!st) return;
        (st.studyNotesHtml || []).forEach((nh) => {
          if (!studyNotes.includes(nh)) studyNotes.push(nh);
        });
        (st.crossRefs || []).forEach((cr) => {
          if (!crossRefs.includes(cr)) crossRefs.push(cr);
        });
        (st.researchGuide || []).forEach((art) => {
          const k = `${art.wolUrl}::${art.title}`;
          if (!rsgMap.has(k)) rsgMap.set(k, art);
        });
        (st.pubIndex || []).forEach((dx) => {
          const k = `${dx.wolUrl}::${dx.title}`;
          if (!pubIdxMap.has(k)) pubIdxMap.set(k, dx);
        });
      });

      const rsgList = Array.from(rsgMap.values());
      const pubIdxList = Array.from(pubIdxMap.values());
      const refLinkObj = window.DFWolBible.buildScriptureLinks(book.num, payload.chapter, verses, null, lang);

      let html = `
        <div class="study-panel-verse-box">
          <div class="study-panel-verse-head">
            <h3>${esc(label)}</h3>
            <span class="badge badge-subtle">${lang.toUpperCase()}</span>
          </div>
          <blockquote class="dt-quote">${quoteHtml}</blockquote>
          <div class="btn-group" style="margin-top:0.55rem;">
            <button type="button" class="btn-primary btn-xs" id="gsp-open-bible">📖 Chapitre complet</button>
            <button type="button" class="btn-ai-chip btn-xs" id="gsp-ai-explain">✨ IA 1-clic</button>
            ${plainCombined ? `<button type="button" class="btn-secondary btn-xs" id="gsp-speak-verse">🗣️ Écouter</button>` : ""}
            ${plainCombined ? `<button type="button" class="btn-ghost btn-xs" id="gsp-copy-verse">📋</button>` : ""}
            ${plainCombined ? `<button type="button" class="btn-ghost btn-xs" id="gsp-note-verse">📝</button>` : ""}
          </div>
        </div>
      `;

      if (studyNotes.length > 0) {
        html += `<div class="study-block"><h4>📝 Notes d'étude (${studyNotes.length})</h4><div class="study-notes-rich-list">${studyNotes.map((n) => `<div class="study-note-para">${n}</div>`).join("")}</div></div>`;
      }

      if (crossRefs.length > 0) {
        const linked = window.DFWolBible.linkifyScripturesInHtml(esc(crossRefs.join(" ; ")), lang);
        html += `<div class="study-block"><h4>🔗 Renvois</h4><div class="crossrefs-box">${linked}</div></div>`;
      }

      if (rsgList.length > 0) {
        html += `<div class="study-block"><h4>🧭 Articles &amp; Guide de recherche (${rsgList.length})</h4><div class="rsg-mini-list">`;
        rsgList.forEach((art, idx) => {
          html += `
            <div class="rsg-mini-card">
              <button type="button" class="rsg-open-btn" data-open-wol-article="${esc(art.wolUrl)}">
                <strong>${esc(art.title)}</strong>
                <span>${esc(art.citation)}</span>
              </button>
              <button type="button" class="btn-icon-xs" data-gsp-play-rsg="${idx}" title="Écouter cet article">🎧</button>
            </div>
          `;
        });
        html += `</div></div>`;
      }

      if (pubIdxList.length > 0) {
        html += `<div class="study-block"><h4>🗂️ Index des publications (${pubIdxList.length})</h4><div class="rsg-mini-list">${pubIdxList.map((dx) => `<button type="button" class="rsg-open-btn" data-open-wol-article="${esc(dx.wolUrl)}"><strong>${esc(dx.title)}</strong></button>`).join("")}</div></div>`;
      }

      html += `<details class="study-block" id="gsp-compare-details"><summary>⚖️ Comparer les versions (TMN, NWT, KJV, Interlinéaire)</summary><div id="gsp-compare-body" style="margin-top:0.5rem;"></div></details>`;

      bodyEl.innerHTML = html;
      window.DFWolReader.attachInAppLinkInterceptor(bodyEl, lang);

      bodyEl.querySelector("#gsp-open-bible")?.addEventListener("click", () => {
        closeArticleStudyPane();
        if (window.DFWolOpenBibleAt) window.DFWolOpenBibleAt(book.num, payload.chapter, verseSpecCompact, lang);
      });
      bodyEl.querySelector("#gsp-ai-explain")?.addEventListener("click", () => {
        window.DFWolAI?.prepareAndOpen({
          title: label,
          refsLabel: label,
          refsText: label,
          explicitRefs: [refLinkObj],
          articles: rsgList,
          lang
        });
      });
      bodyEl.querySelector("#gsp-speak-verse")?.addEventListener("click", () => {
        window.DFWolAudio?.playTrack({ title: label, subtitle: "Bible d'étude", text: `${label}. ${plainCombined}`, lang, mode: "tts" });
      });
      bodyEl.querySelector("#gsp-copy-verse")?.addEventListener("click", () => safeCopyText(`${label}\n${plainCombined}`, `${label} copié !`));
      bodyEl.querySelector("#gsp-note-verse")?.addEventListener("click", () => {
        window.DFWolAddNote && window.DFWolAddNote(label, "Étude Perso", plainCombined, { targetType: "bible", docKey: `bible:${book.num}:${payload.chapter}` });
      });
      bodyEl.querySelectorAll("[data-gsp-play-rsg]").forEach((b) => {
        b.addEventListener("click", () => {
          const item = rsgList[Number(b.getAttribute("data-gsp-play-rsg"))];
          if (item) window.DFWolAudio?.playTrack({ title: item.title, subtitle: `${label} • ${item.citation}`, wolUrl: item.wolUrl, lang, mode: "auto" });
        });
      });

      const cmpDet = bodyEl.querySelector("#gsp-compare-details");
      cmpDet?.addEventListener("toggle", async () => {
        const cmpBody = bodyEl.querySelector("#gsp-compare-body");
        if (!cmpDet.open || !cmpBody || cmpBody.dataset.loaded === "1") return;
        cmpBody.innerHTML = renderSkeleton("list");
        try {
          const rows = await window.DFWolNet.fetchBibleComparison(book.num, payload.chapter, verses, lang);
          cmpBody.dataset.loaded = "1";
          cmpBody.innerHTML = rows.length
            ? rows.map((r) => `<div class="bible-cmp-card"><div class="bible-cmp-head"><strong>${esc(r.label)}</strong></div><p>${esc(r.text)}</p></div>`).join("")
            : `<p class="card-helper-text">Aucune traduction parallèle disponible.</p>`;
        } catch (_) {
          cmpBody.innerHTML = `<p class="card-helper-text">Comparaison indisponible hors-ligne.</p>`;
        }
      });
    } catch (err) {
      bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  function renderUnifiedStudyDrawer() {
    const panel = document.getElementById("global-study-panel");
    const titleEl = document.getElementById("gsp-header-title");
    const backBtn = document.getElementById("gsp-back-btn");
    const tabsEl = document.getElementById("gsp-tabs-row");
    const bodyEl = document.getElementById("gsp-body");
    if (!panel || !bodyEl) return;

    const art = window.DFWolReader?.getCurrentArticleData?.();
    const refs = art ? window.DFWolBible.parseScriptureReferences(art.plainText || "", art.lang || "fr") : [];
    const linkedNotes = art && window.DFWolGetNotes ? window.DFWolGetNotes().filter((n) => n.docKey === (art.docId || art.url) || n.title === art.title) : [];
    const allHl = art ? window.DFWolReader?.getAllHighlights?.().filter((h) => h.docKey === String(art.docId || art.url)) || [] : [];

    if (!currentSidePayload && !art) {
      sidePanelTab = "actions";
    } else if (!currentSidePayload && sidePanelTab === "verse") {
      sidePanelTab = "verses";
    }

    if (backBtn) backBtn.classList.toggle("hidden", sidePanelStack.length === 0);
    if (titleEl) {
      titleEl.textContent = sidePanelTab === "verse" && currentSidePayload
        ? (currentSidePayload.kind === "footnote" ? "Note & Renvois" : currentSidePayload.kind === "intro" ? "Aperçu du livre" : "Verset & Références")
        : art?.title || "Étude individuelle";
    }

    if (tabsEl) {
      tabsEl.innerHTML = `
        ${currentSidePayload ? `<button type="button" class="pill-btn ${sidePanelTab === "verse" ? "active" : ""}" data-gsp-tab="verse">Verset / Réf</button>` : ""}
        ${art ? `<button type="button" class="pill-btn ${sidePanelTab === "verses" ? "active" : ""}" data-gsp-tab="verses">Versets (${refs.length})</button>` : ""}
        ${art ? `<button type="button" class="pill-btn ${sidePanelTab === "notes" ? "active" : ""}" data-gsp-tab="notes">Notes (${linkedNotes.length + allHl.length})</button>` : ""}
        <button type="button" class="pill-btn ${sidePanelTab === "actions" ? "active" : ""}" data-gsp-tab="actions">Outils</button>
      `;
      tabsEl.querySelectorAll("[data-gsp-tab]").forEach((b) => {
        b.addEventListener("click", () => {
          sidePanelTab = b.getAttribute("data-gsp-tab");
          renderUnifiedStudyDrawer();
        });
      });
    }

    if (sidePanelTab === "verse" && currentSidePayload) {
      renderSideVerseDetails(bodyEl, currentSidePayload);
      return;
    }

    if (sidePanelTab === "notes" && art) {
      bodyEl.innerHTML = `
        <div class="asp-section">
          <button type="button" class="btn-primary btn-xs" id="asp-new-note">➕ Nouvelle note sur cet article</button>
          <div class="asp-notes-stack" style="margin-top:0.65rem;">
            ${linkedNotes.length ? linkedNotes.map((n) => `<div class="asp-note-item"><strong>${esc(n.title)}</strong><p>${esc(n.body.slice(0, 260))}</p></div>`).join("") : "<p class='card-helper-text'>Aucune note liée à cet article.</p>"}
            ${allHl.length ? `<h5 style="margin-top:0.75rem;">Surlignages (${allHl.length})</h5>` + allHl.map((h) => `<div class="asp-hl-item hl-${esc(h.color)}">${esc(h.quote)}</div>`).join("") : ""}
          </div>
        </div>
      `;
      bodyEl.querySelector("#asp-new-note")?.addEventListener("click", () => {
        openInputDialog({
          title: "Nouvelle note",
          label: "Votre note pour cet article :",
          placeholder: "Saisissez votre réflexion…",
          onConfirm: (txt) => {
            if (window.DFWolAddNote) {
              window.DFWolAddNote(art.title, "Réunion", txt, { targetType: "article", url: art.url, docKey: art.docId || art.url });
              renderUnifiedStudyDrawer();
            }
          }
        });
      });
      return;
    }

    if (sidePanelTab === "verses" && art) {
      renderStudyPaneContents(bodyEl, art, { hideHeader: true });
      return;
    }

    // "actions" tab (works everywhere, even outside article)
    bodyEl.innerHTML = `
      <div class="asp-section">
        <div class="btn-group" style="margin-bottom:0.85rem;">
          ${art ? `<button type="button" class="btn-ai-chip" id="gsp-act-ai">✨ IA 1-clic</button>` : ""}
          ${art ? `<button type="button" class="btn-primary btn-xs" id="gsp-act-pdf">📄 Exporter PDF</button>` : ""}
          ${art ? `<button type="button" class="btn-secondary btn-xs" id="gsp-act-media">🎬 Médias</button>` : ""}
          ${art ? `<button type="button" class="btn-secondary btn-xs" id="gsp-act-offline">💾 Hors-ligne</button>` : ""}
          ${art ? `<button type="button" class="btn-secondary btn-xs" id="gsp-act-bm">🔖 Marque-page</button>` : ""}
          ${art ? `<button type="button" class="btn-secondary btn-xs" id="gsp-act-share">🔗 Partager</button>` : ""}
          <button type="button" class="btn-secondary btn-xs" id="gsp-act-brother">🤝 Spiritual Brother (Local)</button>
          <button type="button" class="btn-ghost btn-xs" id="gsp-act-history">🕒 Historique</button>
        </div>
        <p class="card-helper-text">Touchez n'importe quel verset d'un article pour l'afficher ici avec ses notes d'étude, renvois et articles du Guide de recherche, ou faites un clic droit / appui long sur un paragraphe pour lancer le MP3 officiel à cet endroit.</p>
      </div>
    `;
    bodyEl.querySelector("#gsp-act-ai")?.addEventListener("click", () => {
      art && window.DFWolAI?.prepareAndOpen({ title: art.title, citation: art.citation, contextText: art.plainText, refsText: art.plainText, lang: art.lang });
    });
    bodyEl.querySelector("#gsp-act-pdf")?.addEventListener("click", () => window.DFWolExport?.openPdfExportModal());
    bodyEl.querySelector("#gsp-act-media")?.addEventListener("click", () => {
      art && window.DFWolExport?.openMeetingMediaView(document.getElementById("reader-article-body"), art.title, art.lang);
    });
    bodyEl.querySelector("#gsp-act-offline")?.addEventListener("click", () => art && window.DFWolLibrary?.saveArticleOffline(art));
    bodyEl.querySelector("#gsp-act-bm")?.addEventListener("click", (e) => {
      art && openBookmarkPopover(e.currentTarget, { type: "article", title: art.title, subtitle: art.citation, url: art.url, lang: art.lang });
    });
    bodyEl.querySelector("#gsp-act-share")?.addEventListener("click", () => {
      art && shareDeepLink({ title: art.title, params: { tab: "meetings", article: art.docId || art.url } });
    });
    bodyEl.querySelector("#gsp-act-brother")?.addEventListener("click", () => {
      closeArticleStudyPane();
      window.DFWolSwitchTab && window.DFWolSwitchTab("study", { studySubtab: "brother" });
    });
    bodyEl.querySelector("#gsp-act-history")?.addEventListener("click", () => openHistoryDrawer());
  }

  async function openStudySidePanel(payload, opts = {}) {
    if (!opts.fromBack && !opts.skipPush && currentSidePayload && !document.getElementById("global-study-panel")?.classList.contains("hidden")) {
      sidePanelStack.push(currentSidePayload);
      if (sidePanelStack.length > 20) sidePanelStack.shift();
    } else if (!opts.fromBack && !opts.skipPush) {
      sidePanelStack.length = 0;
    }
    currentSidePayload = payload;
    sidePanelTab = "verse";
    showGlobalStudyPanelDrawer();
    renderUnifiedStudyDrawer();
  }

  function openArticleStudyPane(tabName = null) {
    const art = window.DFWolReader?.getCurrentArticleData?.();
    if (tabName) {
      activeArticlePaneTab = tabName;
      sidePanelTab = tabName;
    } else if (art && (!currentSidePayload || sidePanelTab === "verse")) {
      sidePanelTab = "verses";
    } else if (!art && !currentSidePayload) {
      sidePanelTab = "actions";
    }
    showGlobalStudyPanelDrawer();
    renderUnifiedStudyDrawer();
  }

  function refreshArticleStudyPane(parsed) {
    const panel = document.getElementById("global-study-panel");
    if (panel && !panel.classList.contains("hidden") && parsed) {
      renderUnifiedStudyDrawer();
    }
  }

  function renderStudyPaneContents(container, art, opts = {}) {
    const refs = window.DFWolBible.parseScriptureReferences(art.plainText || "", art.lang || "fr");
    const linkedNotes = window.DFWolGetNotes ? window.DFWolGetNotes().filter((n) => n.docKey === (art.docId || art.url) || n.title === art.title) : [];
    const allHl = window.DFWolReader?.getAllHighlights?.().filter((h) => h.docKey === String(art.docId || art.url)) || [];

    const tabsHtml = opts.hideHeader
      ? ""
      : `
      <div class="asp-header">
        <div class="asp-tabs" role="tablist">
          <button type="button" class="pill-btn ${activeArticlePaneTab === "verses" ? "active" : ""}" data-asp-tab="verses">📖 Versets (${refs.length})</button>
          <button type="button" class="pill-btn ${activeArticlePaneTab === "notes" ? "active" : ""}" data-asp-tab="notes">📝 Notes (${linkedNotes.length + allHl.length})</button>
          <button type="button" class="pill-btn ${activeArticlePaneTab === "actions" ? "active" : ""}" data-asp-tab="actions">💎 Outils</button>
        </div>
        <button type="button" class="btn-icon-xs" data-asp-close title="Fermer le panneau d'étude">✕</button>
      </div>
    `;

    let bodyHtml = "";
    if (activeArticlePaneTab === "notes") {
      bodyHtml = `
        <div class="asp-section">
          <button type="button" class="btn-primary btn-xs" id="asp-new-note">➕ Nouvelle note sur cet article</button>
          <div class="asp-notes-stack" style="margin-top:0.65rem;">
            ${linkedNotes.length ? linkedNotes.map((n) => `<div class="asp-note-item"><strong>${esc(n.title)}</strong><p>${esc(n.body.slice(0, 260))}</p></div>`).join("") : "<p class='card-helper-text'>Aucune note liée à cet article.</p>"}
            ${allHl.length ? `<h5 style="margin-top:0.75rem;">Surlignages (${allHl.length})</h5>` + allHl.map((h) => `<div class="asp-hl-item hl-${esc(h.color)}">${esc(h.quote)}</div>`).join("") : ""}
          </div>
        </div>
      `;
    } else if (activeArticlePaneTab === "actions") {
      bodyHtml = `
        <div class="asp-section">
          <div class="btn-group" style="margin-bottom:0.8rem;">
            <button type="button" class="btn-ai-chip" id="asp-btn-ai">✨ IA 1-clic</button>
            <button type="button" class="btn-primary btn-xs" id="asp-btn-pdf">📄 Exporter PDF</button>
            <button type="button" class="btn-secondary btn-xs" id="asp-btn-media">🎬 Médias</button>
            <button type="button" class="btn-secondary btn-xs" id="asp-btn-offline">💾 Hors-ligne</button>
            <button type="button" class="btn-secondary btn-xs" id="asp-btn-bm">🔖 Marque-page</button>
            <button type="button" class="btn-secondary btn-xs" id="asp-btn-share">🔗 Partager</button>
          </div>
          <p class="card-helper-text">Astuce : Faites un clic droit (ou appui long) sur n'importe quel paragraphe pour lire en TTS depuis cet endroit ou l'expliquer avec l'IA.</p>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="asp-section">
          ${refs.length ? `<div class="asp-verses-list">${refs.map((r, i) => `<div class="asp-verse-card"><button type="button" class="asp-verse-trigger" data-asp-verse="${i}"><strong>📖 ${esc(r.label)}</strong><span>Afficher / Étudier ▾</span></button><div class="asp-verse-expand hidden" id="asp-vexp-${i}"></div></div>`).join("")}</div>` : `<p class="card-helper-text">Aucun verset détecté dans cet article.</p>`}
        </div>
      `;
    }

    container.innerHTML = tabsHtml + `<div class="asp-body">${bodyHtml}</div>`;
    container.querySelectorAll("[data-asp-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeArticlePaneTab = btn.getAttribute("data-asp-tab");
        renderStudyPaneContents(container, art);
      });
    });
    container.querySelector("[data-asp-close]")?.addEventListener("click", () => {
      closeArticleStudyPane();
      document.getElementById("study-gem-drawer")?.classList.add("hidden");
    });
    container.querySelector("#asp-new-note")?.addEventListener("click", () => {
      openInputDialog({
        title: "Nouvelle note",
        label: "Votre note pour cet article :",
        placeholder: "Saisissez votre réflexion ou référence…",
        onConfirm: (txt) => {
          if (window.DFWolAddNote) {
            window.DFWolAddNote(art.title, "Réunion", txt, { targetType: "article", url: art.url, docKey: art.docId || art.url });
            renderStudyPaneContents(container, art);
          }
        }
      });
    });
    container.querySelector("#asp-btn-ai")?.addEventListener("click", () => {
      window.DFWolAI && window.DFWolAI.prepareAndOpen({ title: art.title, citation: art.citation, contextText: art.plainText, refsText: art.plainText, lang: art.lang });
    });
    container.querySelector("#asp-btn-pdf")?.addEventListener("click", () => {
      window.DFWolExport && window.DFWolExport.openPdfExportModal();
    });
    container.querySelector("#asp-btn-media")?.addEventListener("click", () => {
      const bodyEl = document.getElementById("reader-article-body");
      window.DFWolExport && window.DFWolExport.openMeetingMediaView(bodyEl, art.title, art.lang);
    });
    container.querySelector("#asp-btn-offline")?.addEventListener("click", () => {
      window.DFWolLibrary && window.DFWolLibrary.saveArticleOffline(art);
    });
    container.querySelector("#asp-btn-bm")?.addEventListener("click", (e) => {
      openBookmarkPopover(e.currentTarget, { type: "article", title: art.title, subtitle: art.citation, url: art.url, lang: art.lang });
    });
    container.querySelector("#asp-btn-share")?.addEventListener("click", () => {
      shareDeepLink({ title: art.title, params: { tab: "meetings", article: art.docId || art.url } });
    });

    container.querySelectorAll("[data-asp-verse]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.getAttribute("data-asp-verse"));
        const r = refs[idx];
        const exp = container.querySelector(`#asp-vexp-${idx}`);
        if (!r || !exp) return;
        if (!exp.classList.contains("hidden")) {
          exp.classList.add("hidden");
          return;
        }
        exp.classList.remove("hidden");
        exp.innerHTML = "⏳ Chargement du texte…";
        try {
          const chData = await window.DFWolReader.fetchBibleChapterParsed(r.bookNum, r.chapter, art.lang || "fr");
          const vList = Array.isArray(r.verses) && r.verses.length ? r.verses : [1];
          const objs = vList.map((vn) => chData.verses.find((v) => v.verse === vn)).filter(Boolean);
          exp.innerHTML = `
            <p>${objs.map((v) => `<sup>${v.verse}</sup> ${esc(v.text)}`).join(" ")}</p>
            <div class="btn-group" style="margin-top:0.35rem;">
              <button type="button" class="btn-primary btn-xs" data-open-full="${esc(r.dataAttr)}">📖 Ouvrir</button>
              <button type="button" class="btn-ai-chip btn-xs" data-ai-v="${idx}">✨ IA</button>
            </div>
          `;
          exp.querySelector("[data-open-full]")?.addEventListener("click", () => {
            window.DFWolReader.openScripturePeekDrawer(r.bookNum, r.chapter, vList, art.lang || "fr");
          });
          exp.querySelector("[data-ai-v]")?.addEventListener("click", () => {
            window.DFWolAI && window.DFWolAI.prepareAndOpen({ title: r.label, refsText: r.label, explicitRefs: [r], lang: art.lang || "fr" });
          });
        } catch (_) {
          exp.innerHTML = "<small>Texte indisponible.</small>";
        }
      });
    });
  }

  // ==========================================================================
  // 9. Plans de Lecture Biblique
  // ==========================================================================

  const READING_PLANS = [
    {
      id: "plan-year",
      title: "Bible complète en 1 an (3–4 chapitres/jour)",
      desc: "Parcours séquentiel de Genèse 1 à Révélation 22.",
      getTodayStep: (readProgress) => {
        let total = 0;
        Object.values(readProgress || {}).forEach((arr) => {
          if (Array.isArray(arr)) total += arr.length;
        });
        let rem = total;
        for (const b of window.DFWolBible.BIBLE_BOOKS) {
          if (rem < b.chapters) {
            return { bookNum: b.num, chapter: rem + 1, label: `${b.name} ${rem + 1}` };
          }
          rem -= b.chapters;
        }
        return { bookNum: 1, chapter: 1, label: "Genèse 1" };
      }
    },
    {
      id: "plan-chrono",
      title: "Parcours Chronologique des Grands Événements",
      desc: "Genèse → Job → Exode → Juges → Psaumes → Évangiles → Actes.",
      sequence: [1, 18, 2, 7, 19, 20, 40, 44, 66],
      getTodayStep: () => ({ bookNum: 18, chapter: 1, label: "Job 1 (Patience & Souveraineté)" })
    },
    {
      id: "plan-gospels",
      title: "Vie et Ministère de Jésus (4 Évangiles)",
      desc: "Matthieu, Marc, Luc et Jean côte à côte.",
      getTodayStep: (readProgress) => {
        for (const num of [40, 41, 42, 43]) {
          const b = window.DFWolBible.getBookByNumber(num);
          const doneSet = new Set((readProgress && readProgress[String(num)]) || []);
          for (let ch = 1; ch <= b.chapters; ch++) {
            if (!doneSet.has(ch)) return { bookNum: num, chapter: ch, label: `${b.name} ${ch}` };
          }
        }
        return { bookNum: 40, chapter: 5, label: "Matthieu 5" };
      }
    }
  ];

  function renderReadingPlans(containerEl, readProgress) {
    if (!containerEl) return;
    containerEl.innerHTML = READING_PLANS.map((p) => {
      const next = p.getTodayStep(readProgress);
      return `
        <div class="rplan-card">
          <div>
            <strong>${esc(p.title)}</strong>
            <small>${esc(p.desc)}</small>
          </div>
          <button type="button" class="btn-primary btn-xs" data-rplan-open="${next.bookNum}:${next.chapter}">
            📖 Lire ${esc(next.label)}
          </button>
        </div>
      `;
    }).join("");

    containerEl.querySelectorAll("[data-rplan-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [b, ch] = btn.getAttribute("data-rplan-open").split(":").map(Number);
        window.DFWolOpenBibleAt && window.DFWolOpenBibleAt(b, ch, 1);
      });
    });
  }

  // ==========================================================================
  // 10. Partage / Deep-Links & Modale Édition Note
  // ==========================================================================

  async function shareDeepLink({ title = "DFWol", text = "", params = {} }) {
    try {
      const url = new URL(window.location.origin + window.location.pathname);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== "") url.searchParams.set(k, String(v));
      });
      const fullUrl = url.toString();
      if (navigator.share) {
        try {
          await navigator.share({ title, text: text || title, url: fullUrl });
          return true;
        } catch (_) {}
      }
      return await safeCopyText(`${text ? text + "\n" : ""}${fullUrl}`, "Lien direct copié !");
    } catch (_) {
      return false;
    }
  }

  function openInputDialog({ title = "Saisie", label = "Valeur :", placeholder = "", defaultValue = "", onConfirm = null } = {}) {
    const modal = document.getElementById("dfwol-input-modal");
    const titleEl = document.getElementById("dfwol-input-modal-title");
    const labelEl = document.getElementById("dfwol-input-modal-label");
    const fieldEl = document.getElementById("dfwol-input-modal-field");
    if (!modal || !fieldEl) {
      const fallbackVal = window.prompt(label, defaultValue);
      if (fallbackVal && fallbackVal.trim() && onConfirm) onConfirm(fallbackVal.trim());
      return;
    }
    if (titleEl) titleEl.textContent = title;
    if (labelEl) labelEl.textContent = label;
    fieldEl.placeholder = placeholder || "";
    fieldEl.value = defaultValue || "";
    pendingInputCallback = onConfirm;
    modal.classList.remove("hidden");
    setTimeout(() => {
      fieldEl.focus();
      fieldEl.select();
    }, 25);
  }

  function init() {
    if (uiBound) return;
    uiBound = true;

    bindContextMenus();
    initHoverPreviews();

    document.getElementById("global-study-panel-close")?.addEventListener("click", closeArticleStudyPane);
    document.getElementById("global-study-panel-backdrop")?.addEventListener("click", closeArticleStudyPane);
    document.getElementById("gsp-back-btn")?.addEventListener("click", () => {
      if (sidePanelStack.length > 0) {
        const prev = sidePanelStack.pop();
        openStudySidePanel(prev, { fromBack: true });
      }
    });

    document.getElementById("dfwol-input-modal-close")?.addEventListener("click", () => {
      pendingInputCallback = null;
      document.getElementById("dfwol-input-modal")?.classList.add("hidden");
    });
    document.getElementById("dfwol-input-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "dfwol-input-modal") {
        pendingInputCallback = null;
        e.target.classList.add("hidden");
      }
    });
    document.getElementById("dfwol-input-modal-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("dfwol-input-modal-field")?.value.trim();
      const cb = pendingInputCallback;
      pendingInputCallback = null;
      document.getElementById("dfwol-input-modal")?.classList.add("hidden");
      if (val && cb) cb(val);
    });

    document.getElementById("history-drawer-close")?.addEventListener("click", () => {
      document.getElementById("history-drawer-modal")?.classList.add("hidden");
    });
    document.getElementById("history-drawer-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "history-drawer-modal") e.target.classList.add("hidden");
    });
    document.getElementById("btn-clear-browsing-history")?.addEventListener("click", clearHistory);
    document.getElementById("history-search-input")?.addEventListener("input", (e) => {
      const ft = document.getElementById("history-drawer-modal")?.dataset.filterType || "all";
      renderHistoryList(ft, e.target.value);
    });
    document.querySelectorAll("[data-hist-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ft = btn.getAttribute("data-hist-filter");
        const modal = document.getElementById("history-drawer-modal");
        if (modal) modal.dataset.filterType = ft;
        document.querySelectorAll("[data-hist-filter]").forEach((b) => b.classList.toggle("active", b === btn));
        renderHistoryList(ft, document.getElementById("history-search-input")?.value || "");
      });
    });

    // Barre Ctrl+F
    let findTimer = null;
    document.getElementById("find-bar-input")?.addEventListener("input", (e) => {
      const q = e.target.value;
      clearTimeout(findTimer);
      findTimer = setTimeout(() => runFindInContainer(q), 120);
    });
    document.getElementById("find-bar-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        jumpToFindMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeFindBar();
      }
    });
    document.getElementById("find-bar-prev")?.addEventListener("click", () => jumpToFindMatch(-1));
    document.getElementById("find-bar-next")?.addEventListener("click", () => jumpToFindMatch(1));
    document.getElementById("find-bar-close")?.addEventListener("click", closeFindBar);

    window.addEventListener("scroll", hideHoverPopover, { passive: true });
    initHoverPrefetch();
    initModalFocusTrap();
    initReadingProgressBar();
  }

  /**
   * Generates shimmer skeleton markup while remote content is fetching.
   */
  function renderSkeleton(variant = "article") {
    if (variant === "bible") {
      return `
        <div class="dfwol-skeleton-wrap" aria-busy="true" aria-label="Chargement du chapitre">
          <div class="dfwol-skeleton dfwol-skel-title"></div>
          ${Array.from({ length: 6 }, (_, i) => `
            <div class="dfwol-skel-verse-row">
              <div class="dfwol-skeleton dfwol-skel-vnum"></div>
              <div class="dfwol-skel-vlines">
                <div class="dfwol-skeleton dfwol-skel-line ${i % 2 ? "w-90" : "w-100"}"></div>
                <div class="dfwol-skeleton dfwol-skel-line ${i % 3 ? "w-85" : "w-70"}"></div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }
    if (variant === "cards") {
      return `
        <div class="dfwol-skeleton-wrap dfwol-skel-grid" aria-busy="true" aria-label="Chargement des éléments">
          ${Array.from({ length: 6 }, () => `
            <div class="dfwol-skel-card">
              <div class="dfwol-skeleton dfwol-skel-thumb"></div>
              <div class="dfwol-skeleton dfwol-skel-line w-85"></div>
              <div class="dfwol-skeleton dfwol-skel-line w-60"></div>
            </div>
          `).join("")}
        </div>
      `;
    }
    if (variant === "list") {
      return `
        <div class="dfwol-skeleton-wrap dfwol-skel-list" aria-busy="true" aria-label="Chargement de la liste">
          ${Array.from({ length: 5 }, (_, i) => `
            <div class="dfwol-skel-list-row">
              <div class="dfwol-skeleton dfwol-skel-avatar"></div>
              <div class="dfwol-skel-vlines">
                <div class="dfwol-skeleton dfwol-skel-line ${i % 2 ? "w-75" : "w-85"}"></div>
                <div class="dfwol-skeleton dfwol-skel-line w-50"></div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }
    if (variant === "dailytext") {
      return `
        <div class="dfwol-skeleton-wrap" aria-busy="true" aria-label="Chargement du texte du jour">
          <div class="dfwol-skeleton dfwol-skel-title w-60"></div>
          <div class="dfwol-skeleton dfwol-skel-quote"></div>
          <div class="dfwol-skeleton dfwol-skel-line w-100"></div>
          <div class="dfwol-skeleton dfwol-skel-line w-95"></div>
          <div class="dfwol-skeleton dfwol-skel-line w-80"></div>
        </div>
      `;
    }
    return `
      <div class="dfwol-skeleton-wrap" aria-busy="true" aria-label="Chargement de l'article">
        <div class="dfwol-skeleton dfwol-skel-kicker"></div>
        <div class="dfwol-skeleton dfwol-skel-title w-75"></div>
        <div class="dfwol-skeleton dfwol-skel-line w-100"></div>
        <div class="dfwol-skeleton dfwol-skel-line w-95"></div>
        <div class="dfwol-skeleton dfwol-skel-line w-85"></div>
        <div class="dfwol-skeleton dfwol-skel-gap"></div>
        <div class="dfwol-skeleton dfwol-skel-line w-100"></div>
        <div class="dfwol-skeleton dfwol-skel-line w-90"></div>
        <div class="dfwol-skeleton dfwol-skel-line w-70"></div>
      </div>
    `;
  }

  /**
   * Prefetches Bible chapters or WOL articles after 140ms hover when Data Saver is off.
   */
  function initHoverPrefetch() {
    if (window.__dfwolHoverPrefetchBound) return;
    window.__dfwolHoverPrefetchBound = true;
    const prefetchedKeys = new Set();
    let hoverTimer = null;

    document.addEventListener("mouseover", (e) => {
      if (navigator.connection?.saveData) return;
      const target = e.target?.closest?.(
        "[data-pick-chapter], #materialNav a.cardContainer[href], [data-recent-url], [data-open-pub-url], [data-open-wol-article]"
      );
      if (!target) return;

      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
        const chAttr = target.getAttribute("data-pick-chapter");
        if (chAttr) {
          const ch = Number(chAttr);
          const bookNum = Number(
            target.getAttribute("data-book-num") ||
            document.getElementById("bible-chapters-grid")?.dataset.bookNum ||
            0
          );
          if (!bookNum || !ch) return;
          const key = `bible:${lang}:${bookNum}:${ch}`;
          if (prefetchedKeys.has(key)) return;
          prefetchedKeys.add(key);
          window.DFWolReader?.fetchBibleChapterParsed?.(bookNum, ch, lang).catch(() => {});
          return;
        }

        const rawUrl =
          target.getAttribute("data-recent-url") ||
          target.getAttribute("data-open-pub-url") ||
          target.getAttribute("data-open-wol-article") ||
          target.getAttribute("href") ||
          "";
        if (!rawUrl || rawUrl.startsWith("#") || rawUrl.startsWith("javascript:")) return;
        const url = rawUrl.startsWith("http")
          ? rawUrl
          : `https://wol.jw.org${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
        const key = `wol:${url}`;
        if (prefetchedKeys.has(key)) return;
        prefetchedKeys.add(key);
        window.DFWolNet?.fetchWolHtml?.(url, { timeoutMs: 8000 }).catch(() => {});
      }, 140);
    }, { passive: true });

    document.addEventListener("mouseout", (e) => {
      if (e.target?.closest?.("[data-pick-chapter], #materialNav a.cardContainer[href], [data-recent-url], [data-open-pub-url], [data-open-wol-article]")) {
        clearTimeout(hoverTimer);
      }
    }, { passive: true });
  }

  /**
   * Traps Tab navigation inside visible .modal-backdrop overlays and restores prior focus on close.
   */
  function initModalFocusTrap() {
    if (window.__dfwolModalTrapBound) return;
    window.__dfwolModalTrapBound = true;
    const openerStack = [];
    const focusableSelector =
      'a[href]:not([disabled]), button:not([disabled]):not(.hidden), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getVisibleModal = () => {
      const openModals = Array.from(document.querySelectorAll(".modal-backdrop:not(.hidden)"));
      return openModals.length ? openModals[openModals.length - 1] : null;
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        const el = m.target;
        if (!el || !el.classList?.contains("modal-backdrop")) return;
        const wasHidden = String(m.oldValue || "").includes("hidden");
        const isHidden = el.classList.contains("hidden");
        if (wasHidden && !isHidden) {
          openerStack.push({ modal: el, opener: document.activeElement });
          requestAnimationFrame(() => {
            if (!el.contains(document.activeElement)) {
              const first = el.querySelector(focusableSelector);
              first?.focus?.({ preventScroll: true });
            }
          });
        } else if (!wasHidden && isHidden) {
          for (let i = openerStack.length - 1; i >= 0; i--) {
            if (openerStack[i].modal === el) {
              const [{ opener }] = openerStack.splice(i, 1);
              if (opener && typeof opener.focus === "function" && document.body.contains(opener)) {
                requestAnimationFrame(() => opener.focus({ preventScroll: true }));
              }
              break;
            }
          }
        }
      });
    });

    document.querySelectorAll(".modal-backdrop").forEach((modal) => {
      observer.observe(modal, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const modal = getVisibleModal();
      if (!modal) return;
      const focusables = Array.from(modal.querySelectorAll(focusableSelector)).filter(
        (node) => node.offsetParent !== null || getComputedStyle(node).position === "fixed"
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /**
   * Drives the 3px header scroll progress indicator across Bible & Meetings reader views.
   */
  function initReadingProgressBar() {
    if (window.__dfwolProgressBarBound) return;
    window.__dfwolProgressBarBound = true;
    let rafPending = false;

    const updateProgress = () => {
      rafPending = false;
      const bar = document.getElementById("reading-progress-bar");
      if (!bar) return;
      const bibleActive = document.getElementById("tab-bible")?.classList.contains("active") &&
        !document.getElementById("bible-view-reader")?.classList.contains("hidden");
      const articleActive = document.getElementById("tab-meetings")?.classList.contains("active") &&
        !document.getElementById("meetings-topbar-reader")?.classList.contains("hidden");

      if (!bibleActive && !articleActive) {
        bar.style.width = "0%";
        bar.classList.remove("is-visible");
        return;
      }

      if (bibleActive) {
        const bibleEl = document.getElementById("bible-reader-body");
        if (bibleEl && bibleEl.scrollHeight > bibleEl.clientHeight + 20) {
          const maxB = Math.max(1, bibleEl.scrollHeight - bibleEl.clientHeight);
          const pctB = Math.max(0, Math.min(100, Math.round((bibleEl.scrollTop / maxB) * 100)));
          bar.style.width = `${pctB}%`;
          bar.classList.add("is-visible");
          return;
        }
      }

      const docEl = document.documentElement;
      const maxScroll = Math.max(1, docEl.scrollHeight - window.innerHeight);
      const pct = Math.max(0, Math.min(100, Math.round((window.scrollY / maxScroll) * 100)));
      bar.style.width = `${pct}%`;
      bar.classList.toggle("is-visible", docEl.scrollHeight > window.innerHeight + 60);
    };

    const scheduleUpdate = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(updateProgress);
    };

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    document.getElementById("bible-reader-body")?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("dfwol:viewchange", scheduleUpdate);
    document.addEventListener("click", () => setTimeout(scheduleUpdate, 60), { passive: true });
  }

  /**
   * Tracks consecutive daily study visits under dfwol_streak_v1 in localStorage.
   */
  function updateAndGetStreak() {
    const STREAK_KEY = "dfwol_streak_v1";
    const now = new Date();
    const toYmd = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = toYmd(now);
    const yestDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterday = toYmd(yestDate);

    let data = { count: 0, lastDate: "" };
    try {
      const raw = localStorage.getItem(STREAK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.count === "number") data = parsed;
      }
    } catch (_) {}

    if (data.lastDate === today) {
      return Math.max(1, data.count);
    }
    const nextCount = data.lastDate === yesterday ? Math.max(1, data.count) + 1 : 1;
    const updated = { count: nextCount, lastDate: today };
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
    } catch (_) {}
    return nextCount;
  }

  return {
    init,
    RIBBON_SLOTS,
    getTags,
    addTag,
    renameTag,
    deleteTag,
    getBookmarks,
    setBookmark,
    removeBookmark,
    getBookmarksForBibleChapter,
    openBookmarkPopover,
    renderBookmarksPanel,
    renderBookmarksBadgeRefresh,
    getPlaylists,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addItemToPlaylist,
    removeItemFromPlaylist,
    movePlaylistItem,
    playPlaylist,
    openAddToPlaylistModal,
    renderPlaylistsPanel,
    getHistory,
    recordHistory,
    clearHistory,
    openHistoryDrawer,
    openContextMenu,
    closeContextMenu,
    hideHoverPopover,
    openFindBar,
    closeFindBar,
    isFindOpen: () => findActive,
    openStudySidePanel,
    toggleStudySidePanel,
    openArticleStudyPane,
    closeArticleStudyPane,
    refreshArticleStudyPane,
    renderReadingPlans,
    shareDeepLink,
    safeCopyText,
    openInputDialog,
    renderSkeleton,
    updateAndGetStreak
  };
})();
