/* ==========================================================================
   DFWol Studio — Lecteur Intégré (Bible + Publications façon JW Library),
   Interception Totale des Liens & Extracteur Guide de Recherche en Lot
   ========================================================================== */

window.DFWolReader = (function () {
  "use strict";

  const HIGHLIGHTS_KEY = "dfwol_highlights_v1";
  const articleHistory = [];
  let articleHistoryPos = -1;
  let currentArticleData = null;
  let currentBibleState = { bookNum: 19, chapter: 83, verse: 18, verses: [18], lang: "fr", parallel: false, multiSelectMode: false };
  let readerFontScale = 100;
  let batchExtractedArticles = [];
  let articleRequestSeq = 0;
  let bibleRequestSeq = 0;
  let allImageDescsExpanded = false; // Replié par défaut pour un rendu épuré façon JW Library
  let activeSelectionRange = null;
  let activeHighlightMarkId = null;

  const SVG_ICONS = {
    gem: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.2 3h11.6l3.7 5.5L12 21 2.5 8.5 6.2 3zm1.1 2l-2.1 3h4.3L8.2 5zm3.3 0L9.2 8h5.6l-1.4-3h-2.8zm4.8 0l-1.3 3h4.3l-2.1-3h-.9zm-9.6 5l4.9 6.8L8.4 10H5.8zm4.2 0l2 7.5 2-7.5H10zm5.6 0l-2.3 6.8L18.2 10h-2.6z"/></svg>`,
    wheat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a1 1 0 0 1-1-1v-6.2C8.6 14 7 12.1 7 9.8V7.5l2.8 1.4c.5.2.9.6 1.2 1.1V6.5C8.6 5.7 7 3.8 7 1.5l3 1.5c1 .5 1.7 1.3 2 2.3.3-1 1-1.8 2-2.3l3-1.5c0 2.3-1.6 4.2-4 5V10c.3-.5.7-.9 1.2-1.1L17 7.5v2.3c0 2.3-1.6 4.2-4 5V21a1 1 0 0 1-1 1z"/></svg>`,
    sheep: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.6 9.3a2.7 2.7 0 0 0-3.2-2.2A3 3 0 0 0 10 6.5a3 3 0 0 0-5.1 2A2.8 2.8 0 0 0 3.5 13a2.8 2.8 0 0 0 2.7 3.5H7v2.8a.9.9 0 0 0 1.8 0v-2.8h1.8v2.8a.9.9 0 0 0 1.8 0v-2.8h2.2v2.8a.9.9 0 0 0 1.8 0v-3.1c2-.7 3.6-2.5 3.6-4.7 0-1-.5-1.8-1.4-2.2zM19.5 11c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/></svg>`,
    music: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 3v12.2a3.3 3.3 0 1 1-2-3V6.9L10 8.6v8.6a3.3 3.3 0 1 1-2-3V6.2c0-.6.4-1.1 1-1.3l8.6-2.2c.8-.2 1.4.4 1.4 1.3z"/></svg>`
  };

  const MUSIC_THUMB_FALLBACK_SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="8" fill="#8b8e93"/><path fill="#ffffff" d="M78 28v43.5a11.5 11.5 0 1 1-6-10.1V41.5L47 47.6v31.9a11.5 11.5 0 1 1-6-10.1V40.5c0-2.1 1.4-3.9 3.4-4.4l29-7.3c2.3-.6 4.6 1.1 4.6 3.5z"/></svg>`
    );

  const BOOK_THUMB_FALLBACK_SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="8" fill="#4a6da7"/><path fill="#ffffff" d="M35 30h42c4.4 0 8 3.6 8 8v48c0 2.2-1.8 4-4 4H37c-4.4 0-8-3.6-8-8V38c0-4.4 3.6-8 8-8zm4 10v38h38V40H39z"/></svg>`
    );

  function esc(str) {
    return window.DFWolSearch ? window.DFWolSearch.escapeHtml(str) : String(str || "");
  }

  function cleanStr(str) {
    if (window.DFWolSearch && typeof window.DFWolSearch.cleanText === "function") {
      return window.DFWolSearch.cleanText(str);
    }
    return String(str || "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/[\u00a0\u202f\u200b]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripHtmlToText(str) {
    const raw = String(str || "");
    if (!/[<>]/.test(raw)) return cleanStr(raw);
    const tmp = document.createElement("div");
    tmp.innerHTML = raw;
    return cleanStr(tmp.textContent || raw.replace(/<[^>]+>/g, " "));
  }

  function resolveWolResourceUrl(rawUrl, baseUrl = "https://wol.jw.org/") {
    const raw = String(rawUrl || "").trim();
    if (!raw || raw.startsWith("#") || /^(?:javascript:|data:|mailto:|tel:|webpubvid:|jwlibrary:)/i.test(raw)) {
      return raw;
    }
    try {
      const safeBase = /^https?:\/\/[^/]*jw\.org/i.test(baseUrl) ? baseUrl : "https://wol.jw.org/";
      return new URL(raw, safeBase).toString();
    } catch (_) {
      return raw.startsWith("/") ? `https://wol.jw.org${raw}` : raw;
    }
  }

  function absolutizeWolHtml(containerEl, baseUrl = "https://wol.jw.org/") {
    if (!containerEl) return;
    containerEl
      .querySelectorAll("script, style, .nav, .pswp, #questionContainer, #galleryModalContainer, .alternatePresentation, input[type='hidden']")
      .forEach((el) => el.remove());

    // Nettoyer les espaces insécables / &nbsp; littéraux dans tous les nœuds texte
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue) {
        node.nodeValue = node.nodeValue
          .replace(/&nbsp;|&#160;/gi, " ")
          .replace(/[\u00a0\u202f\u200b\ufeff]/g, " ");
      }
    }

    containerEl.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (src) {
        const abs = resolveWolResourceUrl(src, baseUrl);
        img.setAttribute("data-orig-src", abs);
        img.setAttribute("src", window.DFWolNet?.proxyImageUrl ? window.DFWolNet.proxyImageUrl(abs) : abs);
      }
      const smallSrc = img.getAttribute("data-img-small-src") || "";
      if (smallSrc) {
        const absSmall = resolveWolResourceUrl(smallSrc, baseUrl);
        img.setAttribute("data-img-small-src", window.DFWolNet?.proxyImageUrl ? window.DFWolNet.proxyImageUrl(absSmall) : absSmall);
      }
      img.setAttribute("referrerpolicy", "no-referrer");
      img.setAttribute("loading", "lazy");
    });

    containerEl.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href && !href.startsWith("#")) {
        a.setAttribute("href", resolveWolResourceUrl(href, baseUrl));
      }
      a.removeAttribute("target");
    });
  }

  function openImageLightbox(src, caption = "", altDesc = "", lang = "fr") {
    const modal = document.getElementById("image-lightbox-modal");
    const imgEl = document.getElementById("lightbox-img");
    const capEl = document.getElementById("lightbox-caption");
    const descEl = document.getElementById("lightbox-alt-desc");
    const speakBtn = document.getElementById("lightbox-speak-btn");
    if (!modal || !imgEl) return;

    imgEl.src = src;
    imgEl.alt = altDesc || caption || "Illustration";
    if (capEl) capEl.textContent = caption || "";
    if (descEl) {
      descEl.textContent = altDesc || "Aucune description détaillée disponible.";
      descEl.classList.toggle("hidden", !altDesc);
    }
    if (speakBtn) {
      speakBtn.classList.toggle("hidden", !altDesc);
      speakBtn.onclick = () => {
        if (altDesc && window.DFWolAudio) {
          window.DFWolAudio.playTrack({
            title: "Description de l'image",
            subtitle: caption || "Illustration",
            text: altDesc,
            lang,
            mode: "tts"
          });
        }
      };
    }
    modal.classList.remove("hidden");
  }

  /**
   * Transforme chaque image / figure WOL :
   * - bannières décoratives (.suppressZoom) : bord à bord sans encart alt ni zoom
   * - illustrations : rendu fluide façon JW Library + panneau Description de l'image repliable
   */
  function enhanceArticleFigures(containerEl, lang = "fr") {
    if (!containerEl) return 0;
    let describedCount = 0;

    const figures = Array.from(containerEl.querySelectorAll("figure"));
    figures.forEach((fig) => {
      if (fig.closest("#materialNav") || fig.classList.contains("jw-figure-card") || fig.classList.contains("jw-banner-figure")) return;

      const parentWrap = fig.parentElement;
      const img = fig.querySelector("img");
      const figcaption = fig.querySelector("figcaption");
      const captionText = figcaption ? cleanStr(figcaption.textContent) : "";
      const altText = img ? cleanStr(img.getAttribute("alt") || img.getAttribute("title") || "") : "";
      const isDecorativeBanner =
        (img && img.classList.contains("suppressZoom")) ||
        (parentWrap && parentWrap.classList.contains("suppressZoom")) ||
        (img && img.getAttribute("height") && Number(img.getAttribute("height")) <= 120 && !altText);

      if (isDecorativeBanner) {
        fig.classList.add("jw-banner-figure");
        return;
      }

      fig.classList.add("jw-figure-card");
      if (img) {
        img.classList.add("jw-figure-img");
        img.title = "Cliquer pour agrandir l'image";
        img.addEventListener("click", () => openImageLightbox(img.src, captionText, altText, lang));
      }

      if (altText && altText.length >= 4) {
        describedCount++;
        const details = document.createElement("details");
        details.className = "jw-img-desc-box";
        if (allImageDescsExpanded) details.open = true;

        const summary = document.createElement("summary");
        summary.innerHTML = `<span>🖼️ Description de l'image</span><span class="badge badge-subtle">Alt officiel</span>`;
        details.appendChild(summary);

        const descBody = document.createElement("div");
        descBody.className = "jw-img-desc-content";

        const p = document.createElement("p");
        p.textContent = altText;
        descBody.appendChild(p);

        const actions = document.createElement("div");
        actions.className = "jw-img-desc-actions";

        const speakBtn = document.createElement("button");
        speakBtn.type = "button";
        speakBtn.className = "btn-secondary btn-xs";
        speakBtn.textContent = "🗣️ Écouter";
        speakBtn.addEventListener("click", () => {
          window.DFWolAudio &&
            window.DFWolAudio.playTrack({
              title: "Description de l'image",
              subtitle: captionText || "Illustration",
              text: altText,
              lang,
              mode: "tts"
            });
        });

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "btn-ghost btn-xs";
        copyBtn.textContent = "📋 Copier";
        copyBtn.addEventListener("click", async () => {
          await navigator.clipboard.writeText(altText);
          window.DFWolToast && window.DFWolToast("Description de l'image copiée !");
        });

        actions.appendChild(speakBtn);
        actions.appendChild(copyBtn);
        descBody.appendChild(actions);
        details.appendChild(descBody);
        fig.appendChild(details);
      }
    });

    return describedCount;
  }

  /**
   * Enrichit le rendu visuel WOL pour reproduire fidèlement JW Library :
   * icônes SVG (gem/wheat/sheep/music), zones de réponse persistantes,
   * badges vidéo intégrés, chevrons Réunions et secours de miniatures.
   */
  function enhanceArticleLayout(bodyEl, parsed) {
    if (!bodyEl) return;
    const lang = parsed?.lang || "fr";
    const docKey = parsed?.docId || "misc";

    // 1. Icônes de sections & cantiques (.dc-icon--gem / wheat / sheep / music)
    bodyEl.querySelectorAll(".dc-icon--gem, .dc-icon--wheat, .dc-icon--sheep").forEach((box) => {
      if (box.querySelector(".jw-section-icon-badge")) return;
      const type = box.classList.contains("dc-icon--gem")
        ? "gem"
        : box.classList.contains("dc-icon--wheat")
        ? "wheat"
        : "sheep";
      const badge = document.createElement("span");
      badge.className = `jw-section-icon-badge is-${type}`;
      badge.innerHTML = SVG_ICONS[type];
      box.insertBefore(badge, box.firstChild);
    });

    bodyEl.querySelectorAll(".dc-icon--music").forEach((el) => {
      if (el.querySelector(".jw-music-icon")) return;
      const iconSpan = document.createElement("span");
      iconSpan.className = "jw-music-icon";
      iconSpan.innerHTML = SVG_ICONS.music;
      el.insertBefore(iconSpan, el.firstChild);
    });

    // 2. Liens vidéo intégrés (a[data-video], lank=...)
    bodyEl.querySelectorAll("a[data-video], a[href*='lank=']").forEach((a) => {
      if (a.querySelector(".jw-video-inline-badge")) return;
      a.classList.add("jw-video-inline-link");
      const badge = document.createElement("span");
      badge.className = "jw-video-inline-badge";
      badge.textContent = "▶";
      a.insertBefore(badge, a.firstChild);
    });

    // 3. Champs de réponse interactifs persistants (div.gen-field textarea) + Boutons IA 1-clic
    bodyEl.querySelectorAll(".gen-field textarea").forEach((ta, idx) => {
      const gf = ta.closest(".gen-field");
      const fid = ta.getAttribute("id") || ta.getAttribute("name") || `f-${idx}`;
      const storageKey = `dfwol_ans_${docKey}_${fid}`;
      ta.classList.add("jw-answer-textarea");
      ta.rows = 2;
      ta.placeholder = lang === "en" ? "Your answer…" : "Ta réponse…";
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) ta.value = saved;
      } catch (_) {}

      const autoResize = () => {
        ta.style.height = "auto";
        ta.style.height = Math.max(52, Math.min(260, ta.scrollHeight + 2)) + "px";
      };
      autoResize();

      ta.addEventListener("input", () => {
        autoResize();
        try {
          localStorage.setItem(storageKey, ta.value);
        } catch (_) {}
      });

      if (gf && !gf.querySelector(".jw-ai-inline-bar")) {
        const aiBar = document.createElement("div");
        aiBar.className = "jw-ai-inline-bar";
        aiBar.innerHTML = `
          <button type="button" class="btn-ai-chip" data-inline-ai="run">✨ Réponse IA (1 clic)</button>
          <button type="button" class="btn-ghost btn-xs" data-inline-ai="copy">📋 Prompt IA</button>
        `;
        const gatherQuestionContext = () => {
          let question = "";
          const contextParas = [];
          let cur = gf.previousElementSibling;
          let steps = 0;
          while (cur && steps < 10) {
            steps++;
            const txt = cleanStr(cur.textContent || "");
            if (!question && (cur.matches("p.qu, .qu, h2, h3, h4") || /\?\s*$/.test(txt))) {
              question = txt;
            } else if (txt && !cur.matches(".gen-field")) {
              contextParas.unshift(txt);
            }
            if (question && contextParas.length >= 2) break;
            cur = cur.previousElementSibling;
          }
          if (!question) question = parsed?.title || "";
          const contextText = contextParas.join("\n\n");
          return {
            title: parsed?.title || "Étude",
            citation: parsed?.citation || "",
            question,
            contextText,
            refsText: `${question}\n${contextText}`,
            targetTextarea: ta,
            targetStorageKey: storageKey,
            lang
          };
        };

        aiBar.querySelector('[data-inline-ai="run"]')?.addEventListener("click", () => {
          window.DFWolAI && window.DFWolAI.prepareAndOpen(gatherQuestionContext());
        });
        aiBar.querySelector('[data-inline-ai="copy"]')?.addEventListener("click", () => {
          window.DFWolAI && window.DFWolAI.copyOneClickPrompt(gatherQuestionContext());
        });
        gf.appendChild(aiBar);
      }
    });

    // 4. Navigation Réunions (#todayNav) & vignettes (#materialNav) façon Capture #3
    const prevWeekA = bodyEl.querySelector("#footerPrevWeek a");
    if (prevWeekA && !prevWeekA.dataset.styled) {
      prevWeekA.dataset.styled = "1";
      prevWeekA.innerHTML = `<span class="jw-nav-chevron">‹</span>`;
    }
    const nextWeekA = bodyEl.querySelector("#footerNextWeek a");
    if (nextWeekA && !nextWeekA.dataset.styled) {
      nextWeekA.dataset.styled = "1";
      nextWeekA.innerHTML = `<span class="jw-nav-chevron">›</span>`;
    }
    const todayLink = bodyEl.querySelector("#navigationDailyTextToday a");
    if (todayLink && !todayLink.dataset.styled) {
      todayLink.dataset.styled = "1";
      todayLink.textContent = lang === "en" ? "This Week · Meetings" : "Cette semaine · Réunions";
    }

    bodyEl.querySelectorAll("#materialNav .cardThumbnailImage").forEach((img) => {
      const a = img.closest("a");
      const href = a ? a.getAttribute("href") || "" : "";
      const fallback = /\/sjj(?:$|\/)/i.test(href) ? MUSIC_THUMB_FALLBACK_SVG : BOOK_THUMB_FALLBACK_SVG;
      img.addEventListener("error", () => {
        if (img.src !== fallback) img.src = fallback;
      });
    });

    bodyEl.querySelectorAll("#materialNav .cardChevron").forEach((chev) => {
      const cardA = chev.closest("a.cardContainer");
      const cardHref = cardA ? cardA.getAttribute("href") || "" : "";
      const cardTitle = cleanStr(cardA?.querySelector(".cardLine1")?.textContent || "Publication");
      chev.innerHTML = `<button type="button" class="jw-card-more-btn" aria-label="Options">⋮</button>`;
      chev.querySelector(".jw-card-more-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCardActionMenu(e.currentTarget, { title: cardTitle, url: cardHref, lang });
      });
    });
  }

  // ==========================================================================
  // 1b. Surlignage persistant, Barre de sélection (Capture 6) & Menu ⋮
  // ==========================================================================

  function getAllHighlights() {
    try {
      const list = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveAllHighlights(list) {
    try {
      localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify((list || []).slice(0, 400)));
    } catch (_) {}
  }

  function addHighlight(docKey, docTitle, url, quote, color = "yellow") {
    const cleanQuote = cleanStr(quote);
    if (!cleanQuote || cleanQuote.length < 2) return null;
    const list = getAllHighlights();
    const item = {
      id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      docKey: String(docKey || "misc"),
      docTitle: docTitle || "Article",
      url: url || "",
      quote: cleanQuote,
      color,
      createdAt: new Date().toISOString()
    };
    list.unshift(item);
    saveAllHighlights(list);
    return item;
  }

  function removeHighlightById(id) {
    const list = getAllHighlights().filter((h) => h.id !== id);
    saveAllHighlights(list);
    document.querySelectorAll(`mark.jw-hl[data-hl-id="${id}"]`).forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent || ""));
    });
  }

  function wrapQuoteInContainer(containerEl, hl) {
    if (!containerEl || !hl || !hl.quote) return;
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || node.parentElement?.closest("mark.jw-hl, script, style, .jw-ai-inline-bar")) continue;
      const idx = node.nodeValue.indexOf(hl.quote);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + hl.quote.length);
        const mark = document.createElement("mark");
        mark.className = `jw-hl hl-${hl.color || "yellow"}`;
        mark.setAttribute("data-hl-id", hl.id);
        try {
          range.surroundContents(mark);
        } catch (_) {}
        return;
      }
    }
  }

  function applyHighlightsToContainer(containerEl, docKey) {
    if (!containerEl || !docKey) return;
    const items = getAllHighlights().filter((h) => h.docKey === String(docKey));
    items.forEach((hl) => wrapQuoteInContainer(containerEl, hl));
  }

  function hideSelectionToolbar() {
    document.getElementById("text-selection-toolbar")?.classList.add("hidden");
    activeSelectionRange = null;
    activeHighlightMarkId = null;
  }

  function showSelectionToolbarAtSelection() {
    const toolbar = document.getElementById("text-selection-toolbar");
    const bodyEl = document.getElementById("reader-article-body");
    if (!toolbar || !bodyEl) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return;
    }
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    if (!bodyEl.contains(range.commonAncestorContainer)) return;

    activeSelectionRange = range.cloneRange();
    const markEl =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer.closest("mark.jw-hl")
        : range.commonAncestorContainer.parentElement?.closest("mark.jw-hl");
    activeHighlightMarkId = markEl ? markEl.getAttribute("data-hl-id") : null;

    const rect = range.getBoundingClientRect();
    toolbar.classList.remove("hidden");
    const tbRect = toolbar.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - tbRect.width - 12, rect.left + rect.width / 2 - tbRect.width / 2));
    const top = Math.max(12, rect.top - tbRect.height - 10);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }

  function showCardActionMenu(anchorEl, item) {
    document.getElementById("dfwol-floating-card-menu")?.remove();
    const menu = document.createElement("div");
    menu.id = "dfwol-floating-card-menu";
    menu.className = "jwl-context-menu";
    menu.innerHTML = `
      <button type="button" data-cm="open">📖 Ouvrir dans l'app</button>
      <button type="button" data-cm="audio">🎧 Écouter l'audio</button>
      <button type="button" data-cm="media">🎬 Voir les médias</button>
      <button type="button" data-cm="pdf">📄 Exporter PDF</button>
      <button type="button" data-cm="ai">✨ Préparer pour l'IA</button>
      <button type="button" data-cm="note">📝 Ajouter aux notes</button>
      <button type="button" data-cm="offline">💾 Enregistrer hors-ligne</button>
      <button type="button" data-cm="external">🌐 Ouvrir sur WOL ↗</button>
    `;
    document.body.appendChild(menu);

    const rect = anchorEl.getBoundingClientRect();
    const mRect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - mRect.width - 8, rect.right - mRect.width));
    const top = Math.max(8, Math.min(window.innerHeight - mRect.height - 8, rect.bottom + 4));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const closeMenu = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== anchorEl) {
        menu.remove();
        document.removeEventListener("click", closeMenu, true);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu, true), 10);

    menu.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-cm]")?.getAttribute("data-cm");
      if (!act) return;
      menu.remove();
      document.removeEventListener("click", closeMenu, true);

      if (act === "open") {
        openArticleInApp(item.url, { lang: item.lang });
      } else if (act === "audio") {
        window.DFWolAudio && window.DFWolAudio.playTrack({ title: item.title, wolUrl: item.url, lang: item.lang, mode: "auto" });
      } else if (act === "media") {
        const parsed = await fetchArticleParsed(item.url);
        const tmp = document.createElement("div");
        tmp.innerHTML = parsed.html;
        window.DFWolExport && window.DFWolExport.openMeetingMediaView(tmp, parsed.title, parsed.lang);
      } else if (act === "pdf") {
        const parsed = await fetchArticleParsed(item.url);
        window.DFWolExport &&
          window.DFWolExport.openPdfExportModal({
            type: "article",
            title: parsed.title,
            subtitle: parsed.citation,
            html: parsed.html,
            docId: parsed.docId,
            lang: parsed.lang
          });
      } else if (act === "ai") {
        const parsed = await fetchArticleParsed(item.url);
        window.DFWolAI &&
          window.DFWolAI.prepareAndOpen({
            title: parsed.title,
            citation: parsed.citation,
            contextText: parsed.plainText,
            refsText: parsed.plainText,
            lang: parsed.lang
          });
      } else if (act === "note") {
        const parsed = await fetchArticleParsed(item.url);
        window.DFWolAddNote &&
          window.DFWolAddNote({
            title: parsed.title,
            tag: parsed.citation || "Réunions",
            body: `${parsed.title}\n${parsed.citation || ""}\n\n${(parsed.plainText || "").slice(0, 600)}…`
          });
      } else if (act === "offline") {
        const parsed = await fetchArticleParsed(item.url);
        window.DFWolLibrary && window.DFWolLibrary.saveArticleOffline(parsed);
      } else if (act === "external") {
        window.open(item.url, "_blank", "noopener");
      }
    });
  }

  // ==========================================================================
  // 1. Parseur & Lecteur d'Articles / Publications WOL
  // ==========================================================================

  async function fetchArticleParsed(wolUrl) {
    const res = await window.DFWolNet.fetchWolHtml(wolUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.html, "text/html");

    // Garde absolu contre l'auto-emboîtement (ne jamais retomber sur doc.body !)
    if (doc.getElementById("app-shell") || doc.getElementById("omnibar-form")) {
      throw new Error("Réponse invalide détectée (boucle applicative évitée).");
    }

    const articleEl =
      doc.querySelector("article#article") ||
      doc.querySelector("#article") ||
      doc.querySelector(".scalableui") ||
      doc.querySelector("#materialNav");

    if (!articleEl) {
      throw new Error("Aucun article WOL détecté à cette adresse.");
    }

    const effectiveUrl = res.finalUrl || wolUrl;
    const articleClasses = articleEl.className || "jwac";
    const hasNativeHeader = Boolean(articleEl.querySelector("header"));

    const clone = articleEl.cloneNode(true);
    absolutizeWolHtml(clone, effectiveUrl);

    const titleEl = clone.querySelector("header h1, h1, h2");
    const hiddenTitle = doc.getElementById("contentTitle")?.value;
    const title = stripHtmlToText(hiddenTitle || (titleEl ? titleEl.textContent : doc.title) || "Article WOL");

    const citationEl = doc.querySelector(".docCitation, .pubNavigationTitle, .titleElement, .sourceTitle");
    const parentTitle = doc.getElementById("parentTitle")?.value;
    const citation = stripHtmlToText(parentTitle || (citationEl ? citationEl.textContent : ""));

    // Extraire les paragraphes lisibles pour TTS (sans champs de réponse ni pagination)
    const paragraphs = [];
    clone.querySelectorAll("p, h1, h2, h3, li.su").forEach((p, idx) => {
      if (p.closest(".gen-field, #todayNav, #materialNav, .dc-screenReaderText, .alternatePresentation")) return;
      const pClone = p.cloneNode(true);
      pClone.querySelectorAll(".pageNum, .dc-screenReaderText").forEach((rm) => rm.remove());
      const txt = cleanStr(pClone.textContent || "");
      if (!txt) return;
      const pid = p.getAttribute("data-pid") || p.getAttribute("id") || `rp-${idx}`;
      p.setAttribute("data-reader-pid", pid);
      paragraphs.push({ pid, text: txt });
    });

    const plainText = paragraphs.map((p) => p.text).join("\n\n");
    const langFromUrl = /\/en\/wol\/|lp-e|wtlocale=E/i.test(effectiveUrl) ? "en" : "fr";

    return {
      url: effectiveUrl,
      docId: res.docId || window.DFWolNet.extractDocIdFromUrlOrHtml(effectiveUrl, res.html),
      lang: langFromUrl,
      title,
      citation,
      articleClasses,
      hasNativeHeader,
      html: clone.innerHTML,
      paragraphs,
      plainText
    };
  }

  function renderArticleToDom(parsed, options = {}) {
    currentArticleData = parsed;
    const isMeetingsProgram = /#materialNav|\/wol\/meetings\//i.test(`${parsed.url} ${parsed.html.slice(0, 600)}`);

    if (!options.skipTabSwitch && window.DFWolSwitchTab) {
      window.DFWolSwitchTab("meetings", {
        meetingsView: isMeetingsProgram ? "week" : "reader",
        skipAutoMeetings: true
      });
    } else if (window.DFWolShowMeetingsView) {
      window.DFWolShowMeetingsView(isMeetingsProgram ? "week" : "reader");
    }

    const headerBox = document.querySelector(".reader-article-header");
    const titleEl = document.getElementById("reader-article-title");
    const metaEl = document.getElementById("reader-article-meta");
    const topTitleEl = document.getElementById("meetings-reader-top-title");
    const topSubEl = document.getElementById("meetings-reader-top-sub");
    const bodyEl = document.getElementById("reader-article-body");
    const mp3Btn = document.getElementById("reader-btn-mp3");
    const mp3DlBtn = document.getElementById("reader-btn-mp3-dl");
    const imgBtn = document.getElementById("reader-btn-img-descs");
    const extLink = document.getElementById("reader-btn-external");

    if (!options.fromHistory) {
      if (articleHistory[articleHistoryPos] !== parsed.url) {
        articleHistory.splice(articleHistoryPos + 1);
        articleHistory.push(parsed.url);
        articleHistoryPos = articleHistory.length - 1;
      }
    }

    if (titleEl) titleEl.textContent = parsed.title;
    if (topTitleEl) topTitleEl.textContent = parsed.title;
    if (topSubEl) topSubEl.textContent = parsed.citation || "WOL.jw.org";
    document.getElementById("meetings-view-content")?.classList.toggle("is-meetings-week", isMeetingsProgram);
    if (headerBox) headerBox.classList.toggle("is-wol-native-header", Boolean(parsed.hasNativeHeader));
    if (metaEl) {
      metaEl.textContent = `${parsed.lang.toUpperCase()} • ${parsed.citation || "WOL.jw.org"}`;
    }
    if (extLink) extLink.href = parsed.url;

    if (bodyEl) {
      bodyEl.className = `reader-article-body jwac ${parsed.articleClasses || ""}`;
      bodyEl.innerHTML = parsed.html;
      bodyEl.style.fontSize = `${readerFontScale}%`;
      const imgCount = enhanceArticleFigures(bodyEl, parsed.lang);
      enhanceArticleLayout(bodyEl, parsed);
      applyHighlightsToContainer(bodyEl, parsed.docId || parsed.url);

      if (imgBtn) {
        imgBtn.classList.toggle("hidden", imgCount === 0);
        if (imgCount > 0) imgBtn.textContent = `🖼️ Descriptions (${imgCount})`;
      }
      bodyEl.dataset.inappBound = "0";
      attachInAppLinkInterceptor(bodyEl, parsed.lang);

      if (options.targetUrl) {
        const hashM = options.targetUrl.match(/#([A-Za-z0-9_-]+)/);
        if (hashM) {
          const anchorEl = bodyEl.querySelector(`#${hashM[1]}, [data-pid="${hashM[1].replace(/^p/, "")}"]`);
          if (anchorEl) anchorEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }

    if (mp3Btn) mp3Btn.classList.add("hidden");
    if (mp3DlBtn) mp3DlBtn.classList.add("hidden");
    updateReaderHistoryButtons();
    if (!isMeetingsProgram && window.DFWolAddRecent) {
      window.DFWolAddRecent({ title: parsed.title, sub: parsed.citation, url: parsed.url, lang: parsed.lang });
    }
  }

  function openParsedArticleObject(parsed, options = {}) {
    renderArticleToDom(parsed, options);
  }

  async function openArticleInApp(wolUrlOrDocId, options = {}) {
    const reqId = ++articleRequestSeq;
    const lang = options.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    let targetUrl = String(wolUrlOrDocId || "").trim();
    if (/^\d+$/.test(targetUrl)) {
      const cfg = window.DFWolBible.getLangConfig(lang);
      targetUrl = `https://wol.jw.org/wol/finder?wtlocale=${cfg.wtlocale}&docid=${targetUrl}`;
    }

    const isMeetingsUrl = /\/wol\/meetings\//i.test(targetUrl);
    if (!options.skipTabSwitch && window.DFWolSwitchTab) {
      window.DFWolSwitchTab("meetings", {
        meetingsView: isMeetingsUrl ? "week" : "reader",
        skipAutoMeetings: true
      });
    }

    const headerBox = document.querySelector(".reader-article-header");
    const titleEl = document.getElementById("reader-article-title");
    const topTitleEl = document.getElementById("meetings-reader-top-title");
    const bodyEl = document.getElementById("reader-article-body");
    const mp3Btn = document.getElementById("reader-btn-mp3");
    const mp3DlBtn = document.getElementById("reader-btn-mp3-dl");
    const imgBtn = document.getElementById("reader-btn-img-descs");

    if (headerBox) headerBox.classList.remove("is-wol-native-header");
    if (titleEl) titleEl.textContent = "Chargement de la publication…";
    if (topTitleEl) topTitleEl.textContent = "Chargement…";
    if (bodyEl) {
      bodyEl.className = "reader-article-body";
      bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement depuis WOL.jw.org…</div>`;
    }
    if (mp3Btn) mp3Btn.classList.add("hidden");
    if (mp3DlBtn) mp3DlBtn.classList.add("hidden");
    if (imgBtn) imgBtn.classList.add("hidden");

    try {
      let parsed = null;
      try {
        parsed = await fetchArticleParsed(targetUrl);
      } catch (netErr) {
        if (window.DFWolLibrary) {
          const offline = await window.DFWolLibrary.getOfflineArticle(targetUrl);
          if (offline) {
            parsed = offline;
            window.DFWolToast && window.DFWolToast("Ouvert depuis le stockage hors-ligne !");
          }
        }
        if (!parsed) throw netErr;
      }
      if (reqId !== articleRequestSeq) return;

      renderArticleToDom(parsed, Object.assign({}, options, { targetUrl }));

      // Vérification asynchrone d'un MP3 officiel via PubMedia
      if (parsed.docId && mp3Btn) {
        const track = await window.DFWolNet.getArticleAudioByDocId(parsed.docId, parsed.lang);
        if (reqId !== articleRequestSeq) return;
        if (track && track.file && track.file.url) {
          parsed.mp3Url = track.file.url;
          mp3Btn.classList.remove("hidden");
          if (mp3DlBtn) mp3DlBtn.classList.remove("hidden");
        } else {
          parsed.mp3Url = null;
          mp3Btn.classList.add("hidden");
          if (mp3DlBtn) mp3DlBtn.classList.add("hidden");
        }
      }
    } catch (err) {
      if (reqId !== articleRequestSeq) return;
      if (titleEl) titleEl.textContent = "Chargement interrompu";
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="error-recovery-box">
            <p><strong>⚠️ ${esc(err.message)}</strong></p>
            <div class="btn-group" style="margin-top:0.75rem;">
              <button type="button" class="btn-primary btn-sm" id="reader-retry-btn">🔄 Réessayer</button>
              <button type="button" class="btn-secondary btn-sm" id="reader-setup-proxy-btn">⚡ Configurer un proxy gratuit</button>
              <a href="${esc(targetUrl)}" data-allow-external="1" target="_blank" rel="noopener" class="btn-ghost btn-sm">Ouvrir sur WOL.jw.org ↗</a>
            </div>
          </div>
        `;
        document.getElementById("reader-retry-btn")?.addEventListener("click", () => {
          window.DFWolNet.clearHtmlCache();
          openArticleInApp(targetUrl, options);
        });
        document.getElementById("reader-setup-proxy-btn")?.addEventListener("click", () => {
          window.DFWolSwitchTab && window.DFWolSwitchTab("study", { studySubtab: "settings" });
          document.getElementById("custom-proxy-input")?.focus();
        });
      }
    }
  }

  function updateReaderHistoryButtons() {
    const prevBtn = document.getElementById("reader-btn-back");
    const nextBtn = document.getElementById("reader-btn-fwd");
    if (prevBtn) prevBtn.disabled = articleHistoryPos <= 0;
    if (nextBtn) nextBtn.disabled = articleHistoryPos >= articleHistory.length - 1;
  }

  function canGoBack() {
    return articleHistoryPos > 0;
  }

  function goBack() {
    if (articleHistoryPos > 0) {
      articleHistoryPos--;
      openArticleInApp(articleHistory[articleHistoryPos], { fromHistory: true });
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 2. Parseur & Lecteur Biblique Intégré (+ Notes d'étude + Guide de recherche)
  // ==========================================================================

  async function fetchBibleChapterParsed(bookNum, chapter, lang = "fr") {
    const links = window.DFWolBible.buildScriptureLinks(bookNum, chapter, null, null, lang);
    const res = await window.DFWolNet.fetchWolHtml(links.wolBibleUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.html, "text/html");

    const versesMap = new Map();
    const verseSpans = doc.querySelectorAll(`span[id^="v${bookNum}-${chapter}-"]`);
    verseSpans.forEach((span) => {
      const m = span.id.match(/^v(\d+)-(\d+)-(\d+)-/);
      if (!m) return;
      const vNum = parseInt(m[3], 10);
      if (!vNum) return;

      const clone = span.cloneNode(true);
      clone.querySelectorAll("a.b, a.fn").forEach((a) => {
        if (a.getAttribute("href")?.startsWith("/")) {
          a.setAttribute("href", `https://wol.jw.org${a.getAttribute("href")}`);
        }
      });

      const cleanText = cleanStr(clone.textContent.replace(/^\d+\s*/, "").replace(/[+*]/g, ""));
      if (!versesMap.has(vNum)) {
        versesMap.set(vNum, { verse: vNum, parts: [] });
      }
      versesMap.get(vNum).parts.push(cleanText);
    });

    const verses = Array.from(versesMap.values())
      .sort((a, b) => a.verse - b.verse)
      .map((item) => ({
        verse: item.verse,
        text: cleanStr(item.parts.join(" "))
      }));

    const studyByVerse = {};
    const sections = doc.querySelectorAll(`div.section[data-key^="${bookNum}-${chapter}-"]`);
    sections.forEach((sec) => {
      const keyParts = (sec.getAttribute("data-key") || "").split("-");
      const vNum = parseInt(keyParts[2], 10);
      if (!vNum) return;

      const crossRefs = [];
      sec.querySelectorAll(".group.marginal .marginal.title").forEach((mEl) => {
        const txt = cleanStr(mEl.textContent || "");
        if (txt) crossRefs.push(txt);
      });

      const studyNotes = [];
      sec.querySelectorAll(".group.studyNote li, .studyNote .bodyTxt p, .studyNote li.item").forEach((snEl) => {
        const txt = cleanStr(snEl.textContent || "");
        if (txt && txt.length > 3) studyNotes.push(txt);
      });

      const researchGuide = [];
      sec.querySelectorAll("li.item.ref-rsg").forEach((rsgLi) => {
        const linksInLi = rsgLi.querySelectorAll("a[href]");
        linksInLi.forEach((a) => {
          const title = cleanStr(a.textContent || "");
          let href = a.getAttribute("href") || "";
          if (!title || !href) return;
          if (href.startsWith("/")) href = `https://wol.jw.org${href}`;

          let citation = "";
          const parentDiv = a.closest("div");
          const nextDiv = parentDiv ? parentDiv.nextElementSibling : null;
          if (nextDiv) {
            citation = cleanStr(nextDiv.textContent || "");
          }

          researchGuide.push({
            verse: vNum,
            title,
            citation,
            wolUrl: href,
            lang
          });
        });
      });

      const pubIndex = [];
      sec.querySelectorAll("li.item.ref-dx a[href]").forEach((a) => {
        const title = cleanStr(a.textContent || "");
        let href = a.getAttribute("href") || "";
        if (!title || !href) return;
        if (href.startsWith("/")) href = `https://wol.jw.org${href}`;
        pubIndex.push({ title, wolUrl: href });
      });

      studyByVerse[vNum] = {
        crossRefs,
        studyNotes: Array.from(new Set(studyNotes)),
        researchGuide,
        pubIndex
      };
    });

    return {
      book: links.book,
      bookNum,
      chapter,
      lang,
      wolBibleUrl: links.wolBibleUrl,
      verses,
      studyByVerse
    };
  }

  async function openBibleChapter(bookNum, chapter, highlightVerseOrSpec = 1, lang = null, parallel = null) {
    const reqId = ++bibleRequestSeq;
    const activeLang = lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const isParallel = parallel !== null ? parallel : currentBibleState.parallel;
    const book = window.DFWolBible.getBookByNumber(bookNum);
    const ch = Math.max(1, Math.min(book.chapters, Number(chapter) || 1));

    const parsedVerses = window.DFWolBible.parseVerseSpec(highlightVerseOrSpec);
    const verses = parsedVerses.length ? parsedVerses : [1];

    currentBibleState = {
      bookNum: book.num,
      chapter: ch,
      verse: verses[0],
      verses,
      lang: activeLang,
      parallel: isParallel,
      multiSelectMode: currentBibleState.multiSelectMode
    };
    if (window.DFWolShowBibleView) window.DFWolShowBibleView("reader", book.num);

    const readerTitle = document.getElementById("bible-reader-title");
    const readerBody = document.getElementById("bible-reader-body");
    const studyPanel = document.getElementById("bible-study-panel");
    const bookDisplay = window.DFWolBible.getBookDisplayName(book, activeLang);

    if (readerTitle) {
      readerTitle.textContent = `${bookDisplay} ${ch}${isParallel ? " (Parallèle FR / EN)" : ""}`;
    }
    const pvInput = document.getElementById("picker-verse");
    if (pvInput) {
      pvInput.value = window.DFWolBible.formatVerseSpec(verses, true);
    }
    if (readerBody) {
      readerBody.innerHTML = `<div class="loading-box">⏳ Chargement du chapitre depuis WOL.jw.org…</div>`;
    }

    try {
      const primaryPromise = fetchBibleChapterParsed(book.num, ch, activeLang);
      const secondaryLang = activeLang === "fr" ? "en" : "fr";
      const secondaryPromise = isParallel ? fetchBibleChapterParsed(book.num, ch, secondaryLang) : Promise.resolve(null);

      const [primaryData, secondaryData] = await Promise.all([primaryPromise, secondaryPromise]);
      if (reqId !== bibleRequestSeq) return;
      currentBibleState.primaryData = primaryData;
      currentBibleState.secondaryData = secondaryData;
      const selectedSet = new Set(currentBibleState.verses);

      if (readerBody) {
        if (isParallel && secondaryData) {
          const secMap = new Map(secondaryData.verses.map((v) => [v.verse, v.text]));
          readerBody.innerHTML = primaryData.verses
            .map((v) => {
              const isSel = selectedSet.has(v.verse);
              const secTxt = secMap.get(v.verse) || "";
              const hasRsg = primaryData.studyByVerse[v.verse]?.researchGuide?.length > 0;
              return `
                <div class="bible-verse-row parallel ${isSel ? "selected" : ""}" data-select-verse="${v.verse}">
                  <div class="bible-verse-col">
                    <span class="bible-v-num">${v.verse}</span>
                    <span>${esc(v.text)}</span>
                    ${hasRsg ? `<span class="v-rsg-dot" title="Articles du Guide de recherche disponibles">🧭</span>` : ""}
                  </div>
                  <div class="bible-verse-col secondary">
                    <span class="bible-v-num">${v.verse}</span>
                    <span>${esc(secTxt)}</span>
                  </div>
                </div>
              `;
            })
            .join("");
        } else {
          readerBody.innerHTML = primaryData.verses
            .map((v) => {
              const isSel = selectedSet.has(v.verse);
              const hasRsg = primaryData.studyByVerse[v.verse]?.researchGuide?.length > 0;
              return `
                <div class="bible-verse-row ${isSel ? "selected" : ""}" data-select-verse="${v.verse}">
                  <span class="bible-v-num">${v.verse}</span>
                  <span class="bible-v-text">${esc(v.text)}</span>
                  ${hasRsg ? `<span class="v-rsg-dot" title="Guide de recherche disponible">🧭</span>` : ""}
                </div>
              `;
            })
            .join("");
        }

        const selEl = readerBody.querySelector(`[data-select-verse="${currentBibleState.verse}"]`);
        if (selEl) selEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      renderVerseStudyPanel(currentBibleState.verses);
    } catch (err) {
      if (readerBody) {
        readerBody.innerHTML = `<div class="card-helper-text">⚠️ ${esc(err.message)}</div>`;
      }
      if (studyPanel) studyPanel.innerHTML = "";
    }
  }

  function handleVerseRowClick(verseNum, shiftKey = false) {
    const vn = Number(verseNum) || 1;
    if (shiftKey) {
      const anchor = currentBibleState.verse || vn;
      const minV = Math.min(anchor, vn);
      const maxV = Math.max(anchor, vn);
      const range = [];
      for (let i = minV; i <= maxV; i++) range.push(i);
      renderVerseStudyPanel(range);
    } else if (currentBibleState.multiSelectMode) {
      const set = new Set(currentBibleState.verses || [vn]);
      if (set.has(vn) && set.size > 1) set.delete(vn);
      else set.add(vn);
      renderVerseStudyPanel(Array.from(set).sort((a, b) => a - b));
    } else {
      renderVerseStudyPanel([vn]);
    }
  }

  function toggleBibleMultiSelect(forceState = null) {
    currentBibleState.multiSelectMode = forceState !== null ? Boolean(forceState) : !currentBibleState.multiSelectMode;
    const btn = document.getElementById("btn-bible-multiselect");
    if (btn) btn.classList.toggle("active", currentBibleState.multiSelectMode);
    return currentBibleState.multiSelectMode;
  }

  function renderVerseStudyPanel(versesOrNum) {
    const panel = document.getElementById("bible-study-panel");
    const data = currentBibleState.primaryData;
    if (!panel || !data) return;

    const normalized = window.DFWolBible.parseVerseSpec(versesOrNum);
    const versesArr = normalized.length ? normalized : [1];
    currentBibleState.verses = versesArr;
    currentBibleState.verse = versesArr[0];

    const selectedSet = new Set(versesArr);
    document.querySelectorAll("#bible-reader-body .bible-verse-row").forEach((row) => {
      row.classList.toggle("selected", selectedSet.has(Number(row.getAttribute("data-select-verse"))));
    });

    const bookLabel = window.DFWolBible.getBookDisplayName(data.book, data.lang);
    const verseSpec = window.DFWolBible.formatVerseSpec(versesArr, false);
    const refTitle = `${bookLabel} ${data.chapter}:${verseSpec}`;
    const pvInput = document.getElementById("picker-verse");
    if (pvInput) pvInput.value = window.DFWolBible.formatVerseSpec(versesArr, true);

    const selectedObjs = versesArr.map((vn) => data.verses.find((v) => v.verse === vn)).filter(Boolean);
    const combinedText = selectedObjs.map((v) => `${v.verse}. ${v.text}`).join(" ");

    // Fusion & déduplication du Guide de recherche, renvois et notes d'étude sur toute la plage
    const rsgMap = new Map();
    const crossRefsSet = new Set();
    const notesSet = new Set();

    versesArr.forEach((vn) => {
      const st = data.studyByVerse[vn];
      if (!st) return;
      (st.researchGuide || []).forEach((art) => {
        const key = `${art.wolUrl}::${art.title}`;
        if (!rsgMap.has(key)) {
          rsgMap.set(key, Object.assign({}, art, { matchedVerses: [vn] }));
        } else {
          const ex = rsgMap.get(key);
          if (!ex.matchedVerses.includes(vn)) ex.matchedVerses.push(vn);
        }
      });
      (st.crossRefs || []).forEach((cr) => crossRefsSet.add(cr));
      (st.studyNotes || []).forEach((sn) => notesSet.add(sn));
    });

    const study = {
      researchGuide: Array.from(rsgMap.values()),
      crossRefs: Array.from(crossRefsSet),
      studyNotes: Array.from(notesSet)
    };

    // Mettre à jour la barre de sélection multi-verset au-dessus/dessous du lecteur
    const selBar = document.getElementById("bible-multi-selection-bar");
    if (selBar) {
      selBar.classList.remove("hidden");
      selBar.innerHTML = `
        <span class="badge badge-blue">📖 ${esc(refTitle)} (${versesArr.length} v.)</span>
        <div class="btn-group">
          <button type="button" class="btn-ai-chip" id="bmsb-ai">✨ IA 1-clic</button>
          <button type="button" class="btn-secondary btn-xs" id="bmsb-copy">📋 Copier</button>
          <button type="button" class="btn-secondary btn-xs" id="bmsb-speak">🗣️ Écouter</button>
          <button type="button" class="btn-secondary btn-xs" id="bmsb-pdf">📄 PDF</button>
        </div>
      `;
      const buildAiPayload = () => ({
        title: refTitle,
        refsLabel: refTitle,
        refsText: refTitle,
        explicitRefs: [window.DFWolBible.buildScriptureLinks(data.bookNum, data.chapter, versesArr, null, data.lang)],
        articles: study.researchGuide,
        lang: data.lang
      });
      document.getElementById("bmsb-ai")?.addEventListener("click", () => {
        window.DFWolAI && window.DFWolAI.prepareAndOpen(buildAiPayload());
      });
      document.getElementById("bmsb-copy")?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(`${refTitle}\n${combinedText}`);
        window.DFWolToast && window.DFWolToast(`${refTitle} copié !`);
      });
      document.getElementById("bmsb-speak")?.addEventListener("click", () => {
        if (combinedText && window.DFWolAudio) {
          window.DFWolAudio.playTrack({ title: refTitle, subtitle: "Lecture biblique", lang: data.lang, text: `${refTitle}. ${combinedText}`, mode: "tts" });
        }
      });
      document.getElementById("bmsb-pdf")?.addEventListener("click", () => {
        if (window.DFWolExport) {
          const versesHtml = selectedObjs.map((v) => `<p><strong>${v.verse}</strong> ${esc(v.text)}</p>`).join("");
          window.DFWolExport.openPdfExportModal({
            type: "bible",
            title: refTitle,
            subtitle: "Bible d'étude (nwtsty)",
            html: `<h2>${esc(refTitle)}</h2>${versesHtml}`,
            lang: data.lang
          });
        }
      });
    }

    let html = `
      <div class="study-panel-header">
        <div>
          <span class="badge badge-blue">${versesArr.length > 1 ? `Plage (${versesArr.length} versets)` : "Étude du verset"}</span>
          <h3>📖 ${esc(refTitle)}</h3>
        </div>
        <div class="btn-group">
          <button type="button" class="btn-ai-chip" id="btn-ai-verse-study">✨ IA 1-clic</button>
          <button type="button" class="btn-ghost btn-xs" id="btn-ai-copy-verse-study">📋 Prompt</button>
          ${combinedText ? `<button type="button" class="btn-ghost btn-xs" id="btn-speak-single-verse">🗣️ Écouter</button>` : ""}
          ${study.researchGuide.length > 0 ? `<button type="button" class="btn-primary btn-xs" id="btn-play-verse-rsg">🎧 Tout lire (${study.researchGuide.length})</button>` : ""}
        </div>
      </div>
    `;

    html += `<div class="study-block"><h4>🧭 Guide de recherche (${study.researchGuide.length})</h4>`;
    if (study.researchGuide.length === 0) {
      html += `<p class="card-helper-text">Aucune entrée spécifique du Guide de recherche pour cette sélection.</p>`;
    } else {
      html += `<div class="rsg-mini-list">`;
      study.researchGuide.forEach((item, idx) => {
        const vTag = versesArr.length > 1 && item.matchedVerses ? ` [v.${item.matchedVerses.join(",")}]` : "";
        html += `
          <div class="rsg-mini-card">
            <button type="button" class="rsg-open-btn" data-open-wol-article="${esc(item.wolUrl)}">
              <strong>${esc(item.title)}</strong>
              <span>${esc(item.citation)}${esc(vTag)}</span>
            </button>
            <button type="button" class="btn-icon-xs" data-play-single-rsg="${idx}" title="Écouter cet article">🎧</button>
          </div>
        `;
      });
      html += `</div>`;
    }
    html += `</div>`;

    if (study.crossRefs.length > 0) {
      const joinedRefs = study.crossRefs.join(" ; ");
      const linked = window.DFWolBible.linkifyScripturesInHtml(esc(joinedRefs), data.lang);
      html += `<div class="study-block"><h4>🔗 Renvois</h4><div class="crossrefs-box">${linked}</div></div>`;
    }

    if (study.studyNotes.length > 0) {
      html += `<div class="study-block"><h4>📝 Notes d'étude</h4>`;
      study.studyNotes.forEach((n) => {
        html += `<p class="study-note-para">${esc(n)}</p>`;
      });
      html += `</div>`;
    }

    panel.innerHTML = html;
    attachInAppLinkInterceptor(panel, data.lang);

    const aiParams = {
      title: refTitle,
      refsLabel: refTitle,
      refsText: refTitle,
      explicitRefs: [window.DFWolBible.buildScriptureLinks(data.bookNum, data.chapter, versesArr, null, data.lang)],
      articles: study.researchGuide,
      lang: data.lang
    };
    document.getElementById("btn-ai-verse-study")?.addEventListener("click", () => {
      window.DFWolAI && window.DFWolAI.prepareAndOpen(aiParams);
    });
    document.getElementById("btn-ai-copy-verse-study")?.addEventListener("click", () => {
      window.DFWolAI && window.DFWolAI.copyOneClickPrompt(aiParams);
    });

    document.getElementById("btn-speak-single-verse")?.addEventListener("click", () => {
      if (combinedText && window.DFWolAudio) {
        window.DFWolAudio.playTrack({
          title: refTitle,
          subtitle: "Verset(s) biblique(s)",
          lang: data.lang,
          text: `${refTitle}. ${combinedText}`,
          mode: "tts"
        });
      }
    });

    document.getElementById("btn-play-verse-rsg")?.addEventListener("click", () => {
      if (window.DFWolAudio && study.researchGuide.length > 0) {
        window.DFWolAudio.playQueue(
          study.researchGuide.map((item) => ({
            title: item.title,
            subtitle: `${refTitle} • ${item.citation}`,
            wolUrl: item.wolUrl,
            lang: data.lang,
            mode: "auto"
          }))
        );
        window.DFWolToast && window.DFWolToast(`Lecture en file de ${study.researchGuide.length} articles du Guide de recherche.`);
      }
    });

    panel.querySelectorAll("[data-play-single-rsg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = study.researchGuide[Number(btn.getAttribute("data-play-single-rsg"))];
        if (item && window.DFWolAudio) {
          window.DFWolAudio.playTrack({
            title: item.title,
            subtitle: `${refTitle} • ${item.citation}`,
            wolUrl: item.wolUrl,
            lang: data.lang,
            mode: "auto"
          });
        }
      });
    });
  }

  async function playBibleChapterAudio(bookNum, chapter, lang = "fr") {
    const book = window.DFWolBible.getBookByNumber(bookNum);
    const ch = Number(chapter) || 1;
    const bookName = window.DFWolBible.getBookDisplayName(book, lang);
    const tracks = await window.DFWolNet.getBibleAudio(book.num, lang);
    const track = tracks.find((t) => Number(t.track) === ch) || tracks[ch - 1];

    if (track && track.file && track.file.url && window.DFWolAudio) {
      window.DFWolAudio.playTrack({
        title: `${bookName} ${ch}`,
        subtitle: "Audio Officiel Bible NWT",
        audioUrl: track.file.url,
        lang,
        mode: "mp3"
      });
      return;
    }

    if (currentBibleState.primaryData && currentBibleState.primaryData.verses.length && window.DFWolAudio) {
      window.DFWolAudio.playTrack({
        title: `${bookName} ${ch}`,
        subtitle: "Lecture vocale IA",
        text: currentBibleState.primaryData.verses.map((v) => `${v.verse}. ${v.text}`),
        lang,
        mode: "tts"
      });
    }
  }

  // ==========================================================================
  // 3. Extracteur Automatique du Guide de Recherche en Lot (Batch RSG)
  // ==========================================================================

  async function extractResearchGuideForBatch(rawText, lang = "fr", expandRanges = true, onProgress = null) {
    const refs = window.DFWolBible.parseRangeOrBatchReferences(rawText, lang, expandRanges);
    if (refs.length === 0) {
      return { refs: [], articles: [] };
    }

    const chapterGroups = new Map();
    refs.forEach((r) => {
      const k = `${r.bookNum}:${r.chapter}`;
      if (!chapterGroups.has(k)) {
        chapterGroups.set(k, { bookNum: r.bookNum, chapter: r.chapter, verses: [] });
      }
      chapterGroups.get(k).verses.push(r);
    });

    const groupsArr = Array.from(chapterGroups.values());
    const articleMap = new Map();
    let done = 0;

    for (const grp of groupsArr) {
      done++;
      if (onProgress) {
        onProgress(`Extraction chapitre ${done}/${groupsArr.length} (${grp.verses[0].label})…`);
      }
      try {
        const parsedChapter = await fetchBibleChapterParsed(grp.bookNum, grp.chapter, lang);
        grp.verses.forEach((vRef) => {
          const vNum = vRef.verseStart || 1;
          const study = parsedChapter.studyByVerse[vNum];
          if (!study || !study.researchGuide) return;

          study.researchGuide.forEach((art) => {
            const key = `${art.wolUrl}::${art.title}`;
            if (!articleMap.has(key)) {
              articleMap.set(key, {
                title: art.title,
                citation: art.citation,
                wolUrl: art.wolUrl,
                lang,
                verses: [vRef.label]
              });
            } else {
              const existing = articleMap.get(key);
              if (!existing.verses.includes(vRef.label)) {
                existing.verses.push(vRef.label);
              }
            }
          });
        });
      } catch (_) {}
    }

    batchExtractedArticles = Array.from(articleMap.values());
    return {
      refs,
      articles: batchExtractedArticles
    };
  }

  // ==========================================================================
  // 4. Interception Totale des Liens, Notes de bas de page & Scripture Peek
  // ==========================================================================

  async function openFootnotePeek(url, lang = "fr") {
    const drawer = document.getElementById("scripture-peek-modal");
    const titleEl = document.getElementById("peek-title");
    const bodyEl = document.getElementById("peek-body");
    if (!drawer || !titleEl || !bodyEl) {
      openArticleInApp(url, { lang });
      return;
    }
    titleEl.textContent = "📌 Note & Référence";
    bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement de la note…</div>`;
    drawer.classList.remove("hidden");

    try {
      const parsed = await fetchArticleParsed(url);
      bodyEl.innerHTML = `<div class="jwac peek-footnote-body">${parsed.html}</div>`;
      bodyEl.dataset.inappBound = "0";
      attachInAppLinkInterceptor(bodyEl, parsed.lang || lang);
    } catch (err) {
      bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  async function openScripturePeekDrawer(bookNum, chapter, verseOrSpec = 1, lang = null) {
    const activeLang = lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const versesList = window.DFWolBible.parseVerseSpec(verseOrSpec);
    const verses = versesList.length ? versesList : [1];
    const verseSpec = window.DFWolBible.formatVerseSpec(verses, false);
    const verseSpecCompact = window.DFWolBible.formatVerseSpec(verses, true);

    const drawer = document.getElementById("scripture-peek-modal");
    const titleEl = document.getElementById("peek-title");
    const bodyEl = document.getElementById("peek-body");
    if (!drawer || !titleEl || !bodyEl) {
      if (window.DFWolSwitchTab) window.DFWolSwitchTab("bible");
      openBibleChapter(bookNum, chapter, verses, activeLang);
      return;
    }

    const book = window.DFWolBible.getBookByNumber(bookNum);
    const label = `${window.DFWolBible.getBookDisplayName(book, activeLang)} ${chapter}:${verseSpec}`;
    titleEl.textContent = `📖 ${label}`;
    bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement de ${esc(label)} et de ses références…</div>`;
    drawer.classList.remove("hidden");

    try {
      const chData = await fetchBibleChapterParsed(bookNum, chapter, activeLang);
      const matchedObjs = verses.map((vn) => chData.verses.find((v) => v.verse === vn)).filter(Boolean);
      const rsgMap = new Map();
      verses.forEach((vn) => {
        const st = chData.studyByVerse[vn];
        if (!st || !st.researchGuide) return;
        st.researchGuide.forEach((art) => {
          const k = `${art.wolUrl}::${art.title}`;
          if (!rsgMap.has(k)) rsgMap.set(k, art);
        });
      });
      const rsgList = Array.from(rsgMap.values());
      const plainCombined = matchedObjs.map((v) => `${v.verse}. ${v.text}`).join(" ");
      const quoteHtml = matchedObjs.length
        ? matchedObjs.map((v) => `<sup>${v.verse}</sup> ${esc(v.text)}`).join(" ")
        : "Texte du verset indisponible.";

      let html = `
        <blockquote class="dt-quote">${quoteHtml}</blockquote>
        <div class="btn-group" style="margin:0.75rem 0;">
          <button type="button" class="btn-primary btn-xs" id="peek-open-chapter">📖 Ouvrir dans Bible</button>
          <button type="button" class="btn-ai-chip" id="peek-ai-explain">✨ IA 1-clic</button>
          ${plainCombined ? `<button type="button" class="btn-secondary btn-xs" id="peek-copy-verse">📋 Copier</button>` : ""}
          ${plainCombined ? `<button type="button" class="btn-secondary btn-xs" id="peek-speak-verse">🗣️ Écouter</button>` : ""}
        </div>
      `;

      if (rsgList.length > 0) {
        html += `<h4 style="margin-top:0.8rem;">🧭 Guide de recherche (${rsgList.length})</h4><div class="rsg-mini-list">`;
        rsgList.forEach((art) => {
          html += `
            <button type="button" class="rsg-open-btn" data-open-wol-article="${esc(art.wolUrl)}">
              <strong>${esc(art.title)}</strong>
              <span>${esc(art.citation)}</span>
            </button>
          `;
        });
        html += `</div>`;
      }

      bodyEl.innerHTML = html;
      bodyEl.dataset.inappBound = "0";
      attachInAppLinkInterceptor(bodyEl, activeLang);

      document.getElementById("peek-open-chapter")?.addEventListener("click", () => {
        drawer.classList.add("hidden");
        if (window.DFWolSwitchTab) window.DFWolSwitchTab("bible");
        openBibleChapter(bookNum, chapter, verseSpecCompact, activeLang);
      });

      document.getElementById("peek-ai-explain")?.addEventListener("click", () => {
        drawer.classList.add("hidden");
        window.DFWolAI &&
          window.DFWolAI.prepareAndOpen({
            title: label,
            refsLabel: label,
            refsText: label,
            explicitRefs: [window.DFWolBible.buildScriptureLinks(bookNum, chapter, verses, null, activeLang)],
            articles: rsgList,
            lang: activeLang
          });
      });

      document.getElementById("peek-copy-verse")?.addEventListener("click", async () => {
        await navigator.clipboard.writeText(`${label}\n${plainCombined}`);
        window.DFWolToast && window.DFWolToast(`${label} copié !`);
      });

      document.getElementById("peek-speak-verse")?.addEventListener("click", () => {
        if (plainCombined && window.DFWolAudio) {
          window.DFWolAudio.playTrack({
            title: label,
            subtitle: "Verset(s) biblique(s)",
            text: `${label}. ${plainCombined}`,
            lang: activeLang,
            mode: "tts"
          });
        }
      });
    } catch (err) {
      bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  async function routeHrefInApp(href, linkEl = null, currentLang = "fr") {
    const dataVideo = linkEl ? linkEl.getAttribute("data-video") : null;
    if (dataVideo) {
      const vidTarget = window.DFWolBible.parseWolUrlTarget(dataVideo, currentLang);
      if (vidTarget.type === "video" && window.DFWolVideo) {
        document.getElementById("scripture-peek-modal")?.classList.add("hidden");
        window.DFWolVideo.openVideoInApp(vidTarget.lank, { lang: vidTarget.lang || currentLang });
        return true;
      }
    }

    const parsed = window.DFWolBible.parseWolUrlTarget(href, currentLang);
    if (parsed.type === "anchor") {
      const id = parsed.hash.replace(/^#/, "");
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }

    if (parsed.type === "video" && window.DFWolVideo) {
      document.getElementById("scripture-peek-modal")?.classList.add("hidden");
      window.DFWolVideo.openVideoInApp(parsed.lank, { lang: parsed.lang || currentLang });
      return true;
    }

    if (parsed.type === "bible") {
      const linkText = linkEl ? cleanStr(linkEl.textContent || "") : "";
      const txtRefs = linkText ? window.DFWolBible.parseScriptureReferences(linkText, currentLang) : [];
      if (txtRefs.length === 1 && txtRefs[0].bookNum === parsed.bookNum && txtRefs[0].chapter === parsed.chapter && txtRefs[0].verses.length > 1) {
        openScripturePeekDrawer(parsed.bookNum, parsed.chapter, txtRefs[0].verses, parsed.lang || currentLang);
      } else {
        openScripturePeekDrawer(parsed.bookNum, parsed.chapter, parsed.verses || parsed.verse || 1, parsed.lang || currentLang);
      }
      return true;
    }

    if (parsed.type === "footnote") {
      openFootnotePeek(parsed.url, currentLang);
      return true;
    }

    if (parsed.type === "wol-bible-redirect") {
      const linkText = linkEl ? cleanStr(linkEl.textContent || "") : "";
      const txtRefs = linkText ? window.DFWolBible.parseScriptureReferences(linkText, currentLang) : [];
      if (txtRefs.length === 1) {
        const r = txtRefs[0];
        openScripturePeekDrawer(r.bookNum, r.chapter, r.verses.length ? r.verses : 1, currentLang);
        return true;
      }
      try {
        const res = await window.DFWolNet.fetchWolHtml(parsed.url, { skipValidation: true });
        const resolved = window.DFWolBible.parseWolUrlTarget(res.finalUrl, currentLang);
        if (resolved.type === "bible") {
          openScripturePeekDrawer(resolved.bookNum, resolved.chapter, resolved.verses || resolved.verse || 1, resolved.lang || currentLang);
        } else {
          // Extraire les versets directement depuis le HTML /wol/bc/ si disponible
          const bcDoc = new DOMParser().parseFromString(res.html, "text/html");
          const spans = Array.from(bcDoc.querySelectorAll('span[id^="v"]'));
          if (spans.length > 0) {
            const firstM = spans[0].id.match(/^v(\d+)-(\d+)-(\d+)-/);
            if (firstM) {
              const b = parseInt(firstM[1], 10);
              const c = parseInt(firstM[2], 10);
              const vNums = Array.from(
                new Set(
                  spans
                    .map((sp) => sp.id.match(/^v\d+-\d+-(\d+)-/))
                    .filter(Boolean)
                    .map((m) => parseInt(m[1], 10))
                )
              );
              openScripturePeekDrawer(b, c, vNums.length ? vNums : 1, currentLang);
              return true;
            }
          }
          openArticleInApp(res.finalUrl || parsed.url, { lang: currentLang });
        }
      } catch (_) {
        openArticleInApp(parsed.url, { lang: currentLang });
      }
      return true;
    }

    if (parsed.type === "article") {
      document.getElementById("scripture-peek-modal")?.classList.add("hidden");
      openArticleInApp(parsed.url, { lang: currentLang });
      return true;
    }

    return false;
  }

  function attachInAppLinkInterceptor(containerEl, currentLang = "fr") {
    if (!containerEl || containerEl.dataset.inappBound === "1") return;
    containerEl.dataset.inappBound = "1";

    containerEl.addEventListener("click", async (e) => {
      const rsgBtn = e.target.closest("[data-open-wol-article]");
      if (rsgBtn) {
        e.preventDefault();
        const url = rsgBtn.getAttribute("data-open-wol-article");
        document.getElementById("scripture-peek-modal")?.classList.add("hidden");
        openArticleInApp(url, { lang: currentLang });
        return;
      }

      const link = e.target.closest("a[href], [data-inapp-bible], [data-video]");
      if (!link || link.getAttribute("data-allow-external") === "1") return;

      const bibAttr = link.getAttribute("data-inapp-bible");
      if (bibAttr) {
        e.preventDefault();
        const parsedAttr = window.DFWolBible.parseDataBibleAttr(bibAttr);
        openScripturePeekDrawer(parsedAttr.bookNum, parsedAttr.chapter, parsedAttr.verses, currentLang);
        return;
      }

      const href = link.getAttribute("href") || "";
      if (href.startsWith("javascript:")) return;

      const handled = await routeHrefInApp(href, link, currentLang);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      } else if (/^https?:\/\/(?:[^/]*\.)?(?:jw\.org|wol\.jw\.org)/i.test(href)) {
        // Ne jamais quitter DFWol vers jw.org sans autorisation explicite !
        e.preventDefault();
        e.stopPropagation();
        window.DFWolToast && window.DFWolToast("Lien JW/WOL conservé dans DFWol.");
      }
    });
  }

  function initReaderControls() {
    document.getElementById("reader-btn-back")?.addEventListener("click", goBack);

    document.getElementById("reader-btn-fwd")?.addEventListener("click", () => {
      if (articleHistoryPos < articleHistory.length - 1) {
        articleHistoryPos++;
        openArticleInApp(articleHistory[articleHistoryPos], { fromHistory: true });
      }
    });

    document.getElementById("reader-btn-switch-lang")?.addEventListener("click", () => {
      if (!currentArticleData) return;
      const otherLang = currentArticleData.lang === "fr" ? "en" : "fr";
      if (currentArticleData.docId) {
        const cfg = window.DFWolBible.getLangConfig(otherLang);
        openArticleInApp(`https://wol.jw.org/wol/finder?wtlocale=${cfg.wtlocale}&docid=${currentArticleData.docId}`, {
          lang: otherLang
        });
      } else {
        window.DFWolToast && window.DFWolToast("Basculer de langue nécessite un identifiant de document WOL (docid).");
      }
    });

    document.getElementById("reader-btn-mp3")?.addEventListener("click", () => {
      if (currentArticleData && currentArticleData.mp3Url && window.DFWolAudio) {
        window.DFWolAudio.playTrack({
          title: currentArticleData.title,
          subtitle: currentArticleData.citation || "Audio Officiel JW",
          audioUrl: currentArticleData.mp3Url,
          lang: currentArticleData.lang,
          mode: "mp3"
        });
      }
    });

    document.getElementById("reader-btn-tts")?.addEventListener("click", () => {
      if (currentArticleData && window.DFWolAudio) {
        window.DFWolAudio.playTrack({
          title: currentArticleData.title,
          subtitle: "Lecture vocale IA",
          paragraphs: currentArticleData.paragraphs,
          lang: currentArticleData.lang,
          mode: "tts"
        });
      }
    });

    document.getElementById("reader-btn-font-minus")?.addEventListener("click", () => {
      readerFontScale = Math.max(80, readerFontScale - 10);
      const body = document.getElementById("reader-article-body");
      if (body) body.style.fontSize = `${readerFontScale}%`;
    });

    document.getElementById("reader-btn-font-plus")?.addEventListener("click", () => {
      readerFontScale = Math.min(150, readerFontScale + 10);
      const body = document.getElementById("reader-article-body");
      if (body) body.style.fontSize = `${readerFontScale}%`;
    });

    document.getElementById("reader-btn-to-notes")?.addEventListener("click", () => {
      if (!currentArticleData || !window.DFWolAddNote) return;
      window.DFWolAddNote(
        currentArticleData.title,
        "Étude Perso",
        `${currentArticleData.citation ? currentArticleData.citation + "\n" : ""}${currentArticleData.plainText.slice(0, 1500)}…`
      );
    });

    document.getElementById("reader-btn-img-descs")?.addEventListener("click", () => {
      allImageDescsExpanded = !allImageDescsExpanded;
      document.querySelectorAll("#reader-article-body details.jw-img-desc-box").forEach((d) => {
        d.open = allImageDescsExpanded;
      });
    });

    document.getElementById("lightbox-close-btn")?.addEventListener("click", () => {
      document.getElementById("image-lightbox-modal")?.classList.add("hidden");
    });
    document.getElementById("image-lightbox-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "image-lightbox-modal") {
        e.target.classList.add("hidden");
      }
    });

    document.getElementById("peek-close-btn")?.addEventListener("click", () => {
      document.getElementById("scripture-peek-modal")?.classList.add("hidden");
    });
    document.getElementById("scripture-peek-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "scripture-peek-modal") {
        e.target.classList.add("hidden");
      }
    });

    // Barre flottante de sélection & surlignage (Capture 6)
    const bodyEl = document.getElementById("reader-article-body");
    if (bodyEl) {
      bodyEl.addEventListener("mouseup", () => setTimeout(showSelectionToolbarAtSelection, 20));
      bodyEl.addEventListener("touchend", () => setTimeout(showSelectionToolbarAtSelection, 80));
    }
    document.addEventListener("mousedown", (e) => {
      const tb = document.getElementById("text-selection-toolbar");
      if (tb && !tb.classList.contains("hidden") && !tb.contains(e.target)) {
        if (!e.target.closest("#reader-article-body")) hideSelectionToolbar();
      }
    });

    const selTb = document.getElementById("text-selection-toolbar");
    if (selTb) {
      selTb.querySelectorAll("[data-hl-color]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const color = btn.getAttribute("data-hl-color");
          const selText = activeSelectionRange ? activeSelectionRange.toString().trim() : window.getSelection()?.toString().trim();
          if (!selText || !currentArticleData) return;
          const docKey = currentArticleData.docId || currentArticleData.url;
          const hl = addHighlight(docKey, currentArticleData.title, currentArticleData.url, selText, color);
          if (hl && activeSelectionRange) {
            const mark = document.createElement("mark");
            mark.className = `jw-hl hl-${color}`;
            mark.setAttribute("data-hl-id", hl.id);
            try {
              activeSelectionRange.surroundContents(mark);
            } catch (_) {
              wrapQuoteInContainer(document.getElementById("reader-article-body"), hl);
            }
          }
          window.getSelection()?.removeAllRanges();
          hideSelectionToolbar();
          window.DFWolRenderHighlights && window.DFWolRenderHighlights();
          window.DFWolToast && window.DFWolToast("Texte surligné !");
        });
      });

      document.getElementById("sel-btn-remove-hl")?.addEventListener("click", () => {
        if (activeHighlightMarkId) {
          removeHighlightById(activeHighlightMarkId);
          window.DFWolRenderHighlights && window.DFWolRenderHighlights();
          window.DFWolToast && window.DFWolToast("Surlignage supprimé.");
        }
        hideSelectionToolbar();
      });

      document.getElementById("sel-btn-note")?.addEventListener("click", () => {
        const selText = activeSelectionRange ? activeSelectionRange.toString().trim() : window.getSelection()?.toString().trim();
        if (selText && window.DFWolAddNote) {
          window.DFWolAddNote(currentArticleData?.title || "Extrait d'étude", "Réunion", selText);
        }
        hideSelectionToolbar();
      });

      document.getElementById("sel-btn-copy")?.addEventListener("click", async () => {
        const selText = activeSelectionRange ? activeSelectionRange.toString().trim() : window.getSelection()?.toString().trim();
        if (selText) {
          await navigator.clipboard.writeText(selText);
          window.DFWolToast && window.DFWolToast("Extrait copié !");
        }
        hideSelectionToolbar();
      });

      document.getElementById("sel-btn-search")?.addEventListener("click", () => {
        const selText = activeSelectionRange ? activeSelectionRange.toString().trim() : window.getSelection()?.toString().trim();
        hideSelectionToolbar();
        if (selText && window.DFWolSwitchTab) {
          window.DFWolSwitchTab("library", { libSubtab: "search" });
          const inp = document.getElementById("adv-search-input");
          if (inp) {
            inp.value = selText.slice(0, 120);
            document.getElementById("advanced-search-form")?.dispatchEvent(new Event("submit", { cancelable: true }));
          }
        }
      });

      document.getElementById("sel-btn-ai")?.addEventListener("click", () => {
        const selText = activeSelectionRange ? activeSelectionRange.toString().trim() : window.getSelection()?.toString().trim();
        hideSelectionToolbar();
        if (selText && window.DFWolAI) {
          window.DFWolAI.prepareAndOpen({
            title: currentArticleData?.title || "Extrait sélectionné",
            citation: currentArticleData?.citation || "",
            question: `Explique cet extrait et ses références bibliques : « ${selText.slice(0, 280)} »`,
            contextText: selText,
            refsText: selText,
            lang: currentArticleData?.lang || "fr"
          });
        }
      });
    }

    // Bouton PDF & Hors-ligne & MP3 Download du lecteur
    document.getElementById("reader-btn-pdf")?.addEventListener("click", () => {
      window.DFWolExport && window.DFWolExport.openPdfExportModal();
    });
    document.getElementById("reader-btn-offline")?.addEventListener("click", () => {
      if (currentArticleData && window.DFWolLibrary) {
        window.DFWolLibrary.saveArticleOffline(currentArticleData);
      }
    });
    document.getElementById("reader-btn-mp3-dl")?.addEventListener("click", () => {
      if (currentArticleData && currentArticleData.mp3Url && window.DFWolExport) {
        window.DFWolExport.downloadAudioTrack(currentArticleData.mp3Url, currentArticleData.title, currentArticleData.citation || "");
      }
    });
    document.getElementById("reader-btn-ai")?.addEventListener("click", () => {
      if (currentArticleData && window.DFWolAI) {
        window.DFWolAI.prepareAndOpen({
          title: currentArticleData.title,
          citation: currentArticleData.citation,
          contextText: currentArticleData.plainText,
          refsText: currentArticleData.plainText,
          lang: currentArticleData.lang
        });
      }
    });
  }

  return {
    fetchArticleParsed,
    openArticleInApp,
    openParsedArticleObject,
    fetchBibleChapterParsed,
    openBibleChapter,
    handleVerseRowClick,
    toggleBibleMultiSelect,
    renderVerseStudyPanel,
    playBibleChapterAudio,
    extractResearchGuideForBatch,
    openScripturePeekDrawer,
    openImageLightbox,
    showCardActionMenu,
    getAllHighlights,
    removeHighlightById,
    routeHrefInApp,
    attachInAppLinkInterceptor,
    initReaderControls,
    canGoBack,
    goBack,
    getCurrentBibleState: () => currentBibleState,
    getCurrentArticleData: () => currentArticleData,
    getBatchExtractedArticles: () => batchExtractedArticles
  };
})();
