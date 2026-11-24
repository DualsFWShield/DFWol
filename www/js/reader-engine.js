/* ==========================================================================
   DFWol Studio — Lecteur Intégré (Bible + Publications), Interception
   Totale des Liens & Extracteur Automatique du Guide de Recherche (Lot)
   ========================================================================== */

window.DFWolReader = (function () {
  "use strict";

  const articleHistory = [];
  let articleHistoryPos = -1;
  let currentArticleData = null;
  let currentBibleState = { bookNum: 19, chapter: 83, verse: 18, lang: "fr", parallel: false };
  let readerFontScale = 100;
  let batchExtractedArticles = [];

  function esc(str) {
    return window.DFWolSearch ? window.DFWolSearch.escapeHtml(str) : String(str || "");
  }

  function absolutizeWolHtml(containerEl) {
    if (!containerEl) return;
    containerEl.querySelectorAll("script, style, .nav, .pswp").forEach((el) => el.remove());

    containerEl.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (src.startsWith("/")) {
        img.setAttribute("src", `https://wol.jw.org${src}`);
      }
      img.setAttribute("loading", "lazy");
    });

    containerEl.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/")) {
        a.setAttribute("href", `https://wol.jw.org${href}`);
      }
      a.removeAttribute("target");
    });
  }

  // ==========================================================================
  // 1. Parseur & Lecteur d'Articles / Publications WOL
  // ==========================================================================

  async function fetchArticleParsed(wolUrl) {
    const res = await window.DFWolNet.fetchWolHtml(wolUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.html, "text/html");

    const articleEl = doc.querySelector("article#article") || doc.querySelector("#article") || doc.querySelector(".scalableui") || doc.body;
    const clone = articleEl.cloneNode(true);
    absolutizeWolHtml(clone);

    // Extraire titre & source
    const titleEl = clone.querySelector("header h1, h1, h2");
    const title = (titleEl ? titleEl.textContent : doc.title || "Article WOL").replace(/\s+/g, " ").trim();

    const citationEl = doc.querySelector(".docCitation, .pubNavigationTitle, .titleElement, .sourceTitle");
    const citation = citationEl ? citationEl.textContent.replace(/\s+/g, " ").trim() : "";

    // Paragraphes pour TTS & surlignage
    const paragraphs = [];
    clone.querySelectorAll("p, h1, h2, h3, li.su").forEach((p, idx) => {
      const txt = (p.textContent || "").replace(/\s+/g, " ").trim();
      if (!txt) return;
      const pid = p.getAttribute("data-pid") || p.getAttribute("id") || `rp-${idx}`;
      p.setAttribute("data-reader-pid", pid);
      paragraphs.push({ pid, text: txt });
    });

    const plainText = paragraphs.map((p) => p.text).join("\n\n");
    const langFromUrl = /\/en\/wol\/|lp-e|wtlocale=E/i.test(res.finalUrl || wolUrl) ? "en" : "fr";

    return {
      url: res.finalUrl || wolUrl,
      docId: res.docId || window.DFWolNet.extractDocIdFromUrlOrHtml(res.finalUrl || wolUrl, res.html),
      lang: langFromUrl,
      title,
      citation,
      html: clone.innerHTML,
      paragraphs,
      plainText
    };
  }

  async function openArticleInApp(wolUrlOrDocId, options = {}) {
    const lang = options.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    let targetUrl = String(wolUrlOrDocId || "").trim();
    if (/^\d+$/.test(targetUrl)) {
      const cfg = window.DFWolBible.getLangConfig(lang);
      targetUrl = `https://wol.jw.org/wol/finder?wtlocale=${cfg.wtlocale}&docid=${targetUrl}`;
    }

    if (!options.skipTabSwitch && window.DFWolSwitchTab) {
      window.DFWolSwitchTab("reader");
    }

    const titleEl = document.getElementById("reader-article-title");
    const metaEl = document.getElementById("reader-article-meta");
    const bodyEl = document.getElementById("reader-article-body");
    const mp3Btn = document.getElementById("reader-btn-mp3");
    const extLink = document.getElementById("reader-btn-external");

    if (titleEl) titleEl.textContent = "Chargement de la publication…";
    if (bodyEl) bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement de l'article depuis WOL.jw.org…</div>`;
    if (mp3Btn) mp3Btn.classList.add("hidden");

    try {
      const parsed = await fetchArticleParsed(targetUrl);
      currentArticleData = parsed;

      if (!options.fromHistory) {
        articleHistory.splice(articleHistoryPos + 1);
        articleHistory.push(parsed.url);
        articleHistoryPos = articleHistory.length - 1;
      }

      if (titleEl) titleEl.textContent = parsed.title;
      if (metaEl) {
        metaEl.textContent = `${parsed.lang.toUpperCase()} • ${parsed.citation || "WOL.jw.org"}${parsed.docId ? ` • docid ${parsed.docId}` : ""}`;
      }
      if (extLink) extLink.href = parsed.url;

      if (bodyEl) {
        bodyEl.innerHTML = parsed.html;
        bodyEl.style.fontSize = `${readerFontScale}%`;
        attachInAppLinkInterceptor(bodyEl, parsed.lang);
      }

      updateReaderHistoryButtons();

      // Vérification asynchrone d'un MP3 officiel via PubMedia
      if (parsed.docId && mp3Btn) {
        const track = await window.DFWolNet.getArticleAudioByDocId(parsed.docId, parsed.lang);
        if (track && track.file && track.file.url) {
          parsed.mp3Url = track.file.url;
          mp3Btn.classList.remove("hidden");
        } else {
          parsed.mp3Url = null;
          mp3Btn.classList.add("hidden");
        }
      }
    } catch (err) {
      if (titleEl) titleEl.textContent = "Erreur de chargement";
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="card-helper-text">
            <p>⚠️ ${esc(err.message)}</p>
            <a href="${esc(targetUrl)}" target="_blank" rel="noopener" class="btn-secondary btn-sm">Ouvrir sur WOL.jw.org ↗</a>
          </div>
        `;
      }
    }
  }

  function updateReaderHistoryButtons() {
    const prevBtn = document.getElementById("reader-btn-back");
    const nextBtn = document.getElementById("reader-btn-fwd");
    if (prevBtn) prevBtn.disabled = articleHistoryPos <= 0;
    if (nextBtn) nextBtn.disabled = articleHistoryPos >= articleHistory.length - 1;
  }

  // ==========================================================================
  // 2. Parseur & Lecteur Biblique Intégré (+ Notes d'étude + Guide de recherche)
  // ==========================================================================

  async function fetchBibleChapterParsed(bookNum, chapter, lang = "fr") {
    const links = window.DFWolBible.buildScriptureLinks(bookNum, chapter, null, null, lang);
    const res = await window.DFWolNet.fetchWolHtml(links.wolBibleUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(res.html, "text/html");

    // 1. Versets du chapitre
    const versesMap = new Map();
    const verseSpans = doc.querySelectorAll(`span[id^="v${bookNum}-${chapter}-"]`);
    verseSpans.forEach((span) => {
      const m = span.id.match(/^v(\d+)-(\d+)-(\d+)-/);
      if (!m) return;
      const vNum = parseInt(m[3], 10);
      if (!vNum) return;

      const clone = span.cloneNode(true);
      // Nettoyer les liens internes de numéro de verset tout en gardant le texte lisible
      clone.querySelectorAll("a.b, a.fn").forEach((a) => {
        if (a.getAttribute("href")?.startsWith("/")) {
          a.setAttribute("href", `https://wol.jw.org${a.getAttribute("href")}`);
        }
      });

      const cleanText = clone.textContent.replace(/^\d+\s*/, "").replace(/[+*]/g, "").replace(/\s+/g, " ").trim();
      if (!versesMap.has(vNum)) {
        versesMap.set(vNum, { verse: vNum, parts: [] });
      }
      versesMap.get(vNum).parts.push(cleanText);
    });

    const verses = Array.from(versesMap.values())
      .sort((a, b) => a.verse - b.verse)
      .map((item) => ({
        verse: item.verse,
        text: item.parts.join(" ").replace(/\s+/g, " ").trim()
      }));

    // 2. Extraction des sections d'étude par verset (Notes, Renvois, Guide de recherche, Index)
    const studyByVerse = {};
    const sections = doc.querySelectorAll(`div.section[data-key^="${bookNum}-${chapter}-"]`);
    sections.forEach((sec) => {
      const keyParts = (sec.getAttribute("data-key") || "").split("-");
      const vNum = parseInt(keyParts[2], 10);
      if (!vNum) return;

      const crossRefs = [];
      sec.querySelectorAll(".group.marginal .marginal.title").forEach((mEl) => {
        const txt = (mEl.textContent || "").replace(/\s+/g, " ").trim();
        if (txt) crossRefs.push(txt);
      });

      const studyNotes = [];
      sec.querySelectorAll(".group.studyNote li, .studyNote .bodyTxt p, .studyNote li.item").forEach((snEl) => {
        const txt = (snEl.textContent || "").replace(/\s+/g, " ").trim();
        if (txt && txt.length > 3) studyNotes.push(txt);
      });

      const researchGuide = [];
      sec.querySelectorAll("li.item.ref-rsg").forEach((rsgLi) => {
        // Chaque bloc contient des p.su avec un <a> suivi d'un p.su avec <em>ref</em>
        const linksInLi = rsgLi.querySelectorAll("a[href]");
        linksInLi.forEach((a) => {
          const title = (a.textContent || "").replace(/\s+/g, " ").trim();
          let href = a.getAttribute("href") || "";
          if (!title || !href) return;
          if (href.startsWith("/")) href = `https://wol.jw.org${href}`;

          // Chercher la référence abrégée (w08 15/10 p. 12 § 3...) dans le div suivant
          let citation = "";
          const parentDiv = a.closest("div");
          const nextDiv = parentDiv ? parentDiv.nextElementSibling : null;
          if (nextDiv) {
            citation = (nextDiv.textContent || "").replace(/\s+/g, " ").trim();
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
        const title = (a.textContent || "").replace(/\s+/g, " ").trim();
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

  async function openBibleChapter(bookNum, chapter, highlightVerse = 1, lang = null, parallel = null) {
    const activeLang = lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const isParallel = parallel !== null ? parallel : currentBibleState.parallel;
    const book = window.DFWolBible.getBookByNumber(bookNum);
    const ch = Math.max(1, Math.min(book.chapters, Number(chapter) || 1));

    currentBibleState = { bookNum: book.num, chapter: ch, verse: Number(highlightVerse) || 1, lang: activeLang, parallel: isParallel };

    const readerTitle = document.getElementById("bible-reader-title");
    const readerBody = document.getElementById("bible-reader-body");
    const studyPanel = document.getElementById("bible-study-panel");

    if (readerTitle) {
      readerTitle.textContent = `${window.DFWolBible.getBookDisplayName(book, activeLang)} ${ch}${isParallel ? " (Parallèle FR / EN)" : ""}`;
    }
    if (readerBody) {
      readerBody.innerHTML = `<div class="loading-box">⏳ Chargement du chapitre depuis WOL.jw.org…</div>`;
    }

    try {
      const primaryPromise = fetchBibleChapterParsed(book.num, ch, activeLang);
      const secondaryLang = activeLang === "fr" ? "en" : "fr";
      const secondaryPromise = isParallel ? fetchBibleChapterParsed(book.num, ch, secondaryLang) : Promise.resolve(null);

      const [primaryData, secondaryData] = await Promise.all([primaryPromise, secondaryPromise]);
      currentBibleState.primaryData = primaryData;
      currentBibleState.secondaryData = secondaryData;

      if (readerBody) {
        if (isParallel && secondaryData) {
          const secMap = new Map(secondaryData.verses.map((v) => [v.verse, v.text]));
          readerBody.innerHTML = primaryData.verses
            .map((v) => {
              const isSel = v.verse === currentBibleState.verse;
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
              const isSel = v.verse === currentBibleState.verse;
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

      renderVerseStudyPanel(currentBibleState.verse);
    } catch (err) {
      if (readerBody) {
        readerBody.innerHTML = `<div class="card-helper-text">⚠️ ${esc(err.message)}</div>`;
      }
      if (studyPanel) studyPanel.innerHTML = "";
    }
  }

  function renderVerseStudyPanel(verseNum) {
    const panel = document.getElementById("bible-study-panel");
    const data = currentBibleState.primaryData;
    if (!panel || !data) return;

    currentBibleState.verse = Number(verseNum) || 1;
    document.querySelectorAll("#bible-reader-body .bible-verse-row").forEach((row) => {
      row.classList.toggle("selected", Number(row.getAttribute("data-select-verse")) === currentBibleState.verse);
    });

    const bookLabel = window.DFWolBible.getBookDisplayName(data.book, data.lang);
    const refTitle = `${bookLabel} ${data.chapter}:${currentBibleState.verse}`;
    const study = data.studyByVerse[currentBibleState.verse] || {
      crossRefs: [],
      studyNotes: [],
      researchGuide: [],
      pubIndex: []
    };

    const verseObj = data.verses.find((v) => v.verse === currentBibleState.verse);

    let html = `
      <div class="study-panel-header">
        <div>
          <span class="badge badge-blue">Étude du verset</span>
          <h3>📖 ${esc(refTitle)}</h3>
        </div>
        <div class="btn-group">
          ${verseObj ? `<button type="button" class="btn-ghost btn-xs" id="btn-speak-single-verse">🗣️ Écouter</button>` : ""}
          ${study.researchGuide.length > 0 ? `<button type="button" class="btn-primary btn-xs" id="btn-play-verse-rsg">🎧 Tout lire (${study.researchGuide.length})</button>` : ""}
        </div>
      </div>
    `;

    // Guide de recherche
    html += `<div class="study-block"><h4>🧭 Guide de recherche (${study.researchGuide.length})</h4>`;
    if (study.researchGuide.length === 0) {
      html += `<p class="card-helper-text">Aucune entrée spécifique du Guide de recherche pour ce verset.</p>`;
    } else {
      html += `<div class="rsg-mini-list">`;
      study.researchGuide.forEach((item, idx) => {
        html += `
          <div class="rsg-mini-card">
            <button type="button" class="rsg-open-btn" data-open-wol-article="${esc(item.wolUrl)}">
              <strong>${esc(item.title)}</strong>
              <span>${esc(item.citation)}</span>
            </button>
            <button type="button" class="btn-icon-xs" data-play-single-rsg="${idx}" title="Écouter cet article">🎧</button>
          </div>
        `;
      });
      html += `</div>`;
    }
    html += `</div>`;

    // Renvois
    if (study.crossRefs.length > 0) {
      const joinedRefs = study.crossRefs.join(" ; ");
      const linked = window.DFWolBible.linkifyScripturesInHtml(esc(joinedRefs), data.lang);
      html += `<div class="study-block"><h4>🔗 Renvois</h4><div class="crossrefs-box">${linked}</div></div>`;
    }

    // Notes d'étude
    if (study.studyNotes.length > 0) {
      html += `<div class="study-block"><h4>📝 Notes d'étude</h4>`;
      study.studyNotes.forEach((n) => {
        html += `<p class="study-note-para">${esc(n)}</p>`;
      });
      html += `</div>`;
    }

    panel.innerHTML = html;
    attachInAppLinkInterceptor(panel, data.lang);

    document.getElementById("btn-speak-single-verse")?.addEventListener("click", () => {
      if (verseObj && window.DFWolAudio) {
        window.DFWolAudio.playTrack({
          title: refTitle,
          subtitle: "Verset biblique (TTS)",
          lang: data.lang,
          text: `${refTitle}. ${verseObj.text}`,
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

    // Fallback TTS si chapitre absent
    if (currentBibleState.primaryData && currentBibleState.primaryData.verses.length && window.DFWolAudio) {
      window.DFWolAudio.playTrack({
        title: `${bookName} ${ch}`,
        subtitle: "Lecture vocale TTS",
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

    // Grouper par (bookNum, chapter) pour ne télécharger chaque chapitre qu'une fois
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
  // 4. Interception Totale des Liens & Tiroir Aperçu de Verset (Scripture Peek)
  // ==========================================================================

  async function openScripturePeekDrawer(bookNum, chapter, verse, lang = null) {
    const activeLang = lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const drawer = document.getElementById("scripture-peek-modal");
    const titleEl = document.getElementById("peek-title");
    const bodyEl = document.getElementById("peek-body");
    if (!drawer || !titleEl || !bodyEl) {
      if (window.DFWolSwitchTab) window.DFWolSwitchTab("bible");
      openBibleChapter(bookNum, chapter, verse, activeLang);
      return;
    }

    const book = window.DFWolBible.getBookByNumber(bookNum);
    const label = `${window.DFWolBible.getBookDisplayName(book, activeLang)} ${chapter}:${verse || 1}`;
    titleEl.textContent = `📖 ${label}`;
    bodyEl.innerHTML = `<div class="loading-box">⏳ Chargement du verset et de ses références…</div>`;
    drawer.classList.remove("hidden");

    try {
      const chData = await fetchBibleChapterParsed(bookNum, chapter, activeLang);
      const vObj = chData.verses.find((v) => v.verse === Number(verse || 1));
      const study = chData.studyByVerse[Number(verse || 1)] || { researchGuide: [], studyNotes: [] };

      let html = `
        <blockquote class="dt-quote">${vObj ? esc(vObj.text) : "Texte du verset indisponible."}</blockquote>
        <div class="btn-group" style="margin:0.75rem 0;">
          <button type="button" class="btn-primary btn-xs" id="peek-open-chapter">📖 Ouvrir le chapitre complet dans l'app</button>
          ${vObj ? `<button type="button" class="btn-secondary btn-xs" id="peek-speak-verse">🗣️ Écouter</button>` : ""}
        </div>
      `;

      if (study.researchGuide.length > 0) {
        html += `<h4 style="margin-top:0.8rem;">🧭 Guide de recherche (${study.researchGuide.length})</h4><div class="rsg-mini-list">`;
        study.researchGuide.forEach((art) => {
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
      attachInAppLinkInterceptor(bodyEl, activeLang);

      document.getElementById("peek-open-chapter")?.addEventListener("click", () => {
        drawer.classList.add("hidden");
        if (window.DFWolSwitchTab) window.DFWolSwitchTab("bible");
        openBibleChapter(bookNum, chapter, verse || 1, activeLang);
      });

      document.getElementById("peek-speak-verse")?.addEventListener("click", () => {
        if (vObj && window.DFWolAudio) {
          window.DFWolAudio.playTrack({
            title: label,
            subtitle: "Verset biblique",
            text: `${label}. ${vObj.text}`,
            lang: activeLang,
            mode: "tts"
          });
        }
      });
    } catch (err) {
      bodyEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  function attachInAppLinkInterceptor(containerEl, currentLang = "fr") {
    if (!containerEl || containerEl.dataset.inappBound === "1") return;
    containerEl.dataset.inappBound = "1";

    containerEl.addEventListener("click", async (e) => {
      // Bouton direct vers un article WOL
      const rsgBtn = e.target.closest("[data-open-wol-article]");
      if (rsgBtn) {
        e.preventDefault();
        const url = rsgBtn.getAttribute("data-open-wol-article");
        document.getElementById("scripture-peek-modal")?.classList.add("hidden");
        openArticleInApp(url, { lang: currentLang });
        return;
      }

      const link = e.target.closest("a[href], [data-inapp-bible]");
      if (!link) return;

      // Attribut explicite data-inapp-bible="book:chapter:verse"
      const bibAttr = link.getAttribute("data-inapp-bible");
      if (bibAttr) {
        e.preventDefault();
        const [b, c, v] = bibAttr.split(":").map(Number);
        openScripturePeekDrawer(b, c, v || 1, currentLang);
        return;
      }

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

      const parsed = window.DFWolBible.parseWolUrlTarget(href);
      if (parsed.type === "bible") {
        e.preventDefault();
        openScripturePeekDrawer(parsed.bookNum, parsed.chapter, parsed.verse || 1, parsed.lang || currentLang);
      } else if (parsed.type === "wol-bible-redirect") {
        e.preventDefault();
        try {
          const res = await window.DFWolNet.fetchWolHtml(parsed.url);
          const resolved = window.DFWolBible.parseWolUrlTarget(res.finalUrl);
          if (resolved.type === "bible") {
            openScripturePeekDrawer(resolved.bookNum, resolved.chapter, resolved.verse || 1, resolved.lang || currentLang);
          } else {
            openArticleInApp(res.finalUrl || parsed.url, { lang: currentLang });
          }
        } catch (_) {
          openArticleInApp(parsed.url, { lang: currentLang });
        }
      } else if (parsed.type === "article") {
        e.preventDefault();
        document.getElementById("scripture-peek-modal")?.classList.add("hidden");
        openArticleInApp(parsed.url, { lang: currentLang });
      }
    });
  }

  function initReaderControls() {
    document.getElementById("reader-btn-back")?.addEventListener("click", () => {
      if (articleHistoryPos > 0) {
        articleHistoryPos--;
        openArticleInApp(articleHistory[articleHistoryPos], { fromHistory: true });
      }
    });

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
          subtitle: "Lecture vocale (TTS)",
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

    document.getElementById("peek-close-btn")?.addEventListener("click", () => {
      document.getElementById("scripture-peek-modal")?.classList.add("hidden");
    });
    document.getElementById("scripture-peek-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "scripture-peek-modal") {
        e.target.classList.add("hidden");
      }
    });
  }

  return {
    fetchArticleParsed,
    openArticleInApp,
    fetchBibleChapterParsed,
    openBibleChapter,
    renderVerseStudyPanel,
    playBibleChapterAudio,
    extractResearchGuideForBatch,
    openScripturePeekDrawer,
    attachInAppLinkInterceptor,
    initReaderControls,
    getCurrentBibleState: () => currentBibleState,
    getCurrentArticleData: () => currentArticleData,
    getBatchExtractedArticles: () => batchExtractedArticles
  };
})();
