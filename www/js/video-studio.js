/* ==========================================================================
   DFWol Studio — Studio Vidéo Intégré, Lecteur MP4 + Sous-titres VTT
   Synchronisés, Recherche dans les Sous-titres & Extracteur VTT/SRT/TXT
   ========================================================================== */

window.DFWolVideo = (function () {
  "use strict";

  let currentVideoState = {
    lank: null,
    lang: "fr",
    media: null,
    files: [],
    activeQuality: "480p",
    subtitlesUrl: null,
    rawVtt: "",
    cues: [],
    blobTrackUrl: null,
    startTime: 0
  };

  function esc(str) {
    return window.DFWolSearch ? window.DFWolSearch.escapeHtml(str) : String(str || "");
  }

  function timeStrToSeconds(ts) {
    const clean = String(ts || "").trim().replace(",", ".");
    const parts = clean.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }

  function secondsToFmt(sec, useCommaForSrt = false) {
    const sTotal = Math.max(0, Number(sec) || 0);
    const hrs = Math.floor(sTotal / 3600);
    const mins = Math.floor((sTotal % 3600) / 60);
    const secs = Math.floor(sTotal % 60);
    const ms = Math.round((sTotal - Math.floor(sTotal)) * 1000);
    const sep = useCommaForSrt ? "," : ".";
    return (
      `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` +
      `${sep}${String(ms).padStart(3, "0")}`
    );
  }

  function secondsToShortLabel(sec) {
    const sTotal = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sTotal / 60);
    const s = sTotal % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /**
   * Parseur WebVTT robuste : gère HH:MM:SS.mmm / MM:SS.mmm,
   * nettoie les réglages de positionnement et les balises <c>/<i>.
   */
  function parseVtt(vttText) {
    if (!vttText) return [];
    const normalized = String(vttText).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const blocks = normalized.split(/\n{2,}/);
    const cues = [];

    blocks.forEach((block) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return;
      if (/^(WEBVTT|NOTE|STYLE|REGION)/i.test(lines[0])) return;

      const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
      if (timeLineIdx === -1) return;

      const timeLine = lines[timeLineIdx];
      const m = timeLine.match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
      if (!m) return;

      const start = timeStrToSeconds(m[1]);
      const end = timeStrToSeconds(m[2]);
      const rawText = lines
        .slice(timeLineIdx + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!rawText) return;
      cues.push({
        index: cues.length + 1,
        start,
        end,
        startShort: secondsToShortLabel(start),
        text: rawText
      });
    });

    return cues;
  }

  function buildSrtFromCues(cues) {
    return cues
      .map((c, idx) => `${idx + 1}\n${secondsToFmt(c.start, true)} --> ${secondsToFmt(c.end, true)}\n${c.text}\n`)
      .join("\n");
  }

  function buildPlainTranscript(cues) {
    return cues.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
  }

  function buildTimestampedTranscript(cues) {
    return cues.map((c) => `[${c.startShort}] ${c.text}`).join("\n");
  }

  // ==========================================================================
  // 1. Chargement des Catégories & Recherche Vidéo Mediator / JW Search
  // ==========================================================================

  async function loadVideoCategories(lang = "fr") {
    const langLetter = window.DFWolNet.getLangLetter(lang);
    const select = document.getElementById("video-category-select");
    try {
      const vodData = await window.DFWolNet.mediatorGet(`categories/${langLetter}/VideoOnDemand?detailed=0&clientType=www`);
      const subCats = (vodData && vodData.category && vodData.category.subcategories) || [];

      if (select) {
        const baseOpts = [
          { key: "LatestVideos", name: lang === "en" ? "Latest Videos" : "Dernières vidéos" },
          { key: "FeaturedLibraryVideos", name: lang === "en" ? "Featured" : "Notre sélection" }
        ];
        const combined = baseOpts.concat(subCats.map((sc) => ({ key: sc.key, name: sc.name })));
        select.innerHTML = combined.map((c) => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join("");
      }
      await loadVideosByCategory("LatestVideos", lang);
    } catch (err) {
      const grid = document.getElementById("video-catalog-grid");
      if (grid) grid.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  async function loadVideosByCategory(categoryKey = "LatestVideos", lang = "fr") {
    const langLetter = window.DFWolNet.getLangLetter(lang);
    const grid = document.getElementById("video-catalog-grid");
    if (!grid) return;
    grid.innerHTML = `<div class="loading-box">⏳ Chargement du catalogue vidéo JW…</div>`;

    try {
      const data = await window.DFWolNet.mediatorGet(
        `categories/${langLetter}/${encodeURIComponent(categoryKey)}?detailed=1&mediaLimit=24&clientType=www`
      );
      const media = (data && data.category && data.category.media) || [];
      if (media.length === 0) {
        // Si c'est une catégorie conteneur, prendre la première sous-catégorie
        const subs = (data && data.category && data.category.subcategories) || [];
        if (subs.length > 0) {
          return loadVideosByCategory(subs[0].key, lang);
        }
        grid.innerHTML = `<p class="card-helper-text">Aucune vidéo dans cette catégorie.</p>`;
        return;
      }

      renderVideoCards(
        media.map((m) => ({
          lank: m.languageAgnosticNaturalKey,
          title: m.title,
          duration: m.durationFormattedMinSec || "",
          thumb: (m.images && (m.images.lss?.lg || m.images.wss?.lg || m.images.pnr?.lg || m.images.sqr?.lg)) || "",
          snippet: "",
          deepLinks: []
        })),
        lang
      );
    } catch (err) {
      grid.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  async function searchVideosAndSubtitles(query, lang = "fr") {
    const grid = document.getElementById("video-catalog-grid");
    if (!grid) return;
    const q = (query || "").trim();
    if (!q) {
      const cat = document.getElementById("video-category-select")?.value || "LatestVideos";
      return loadVideosByCategory(cat, lang);
    }

    grid.innerHTML = `<div class="loading-box">🔍 Recherche dans les titres et sous-titres des vidéos…</div>`;
    try {
      const res = await window.DFWolSearch.runUnifiedSearch({ query: q, scope: "videos", lang, engine: "jw" });
      const videos = res.jwItems || [];
      if (videos.length === 0) {
        grid.innerHTML = `<p class="card-helper-text">Aucune vidéo trouvée pour « ${esc(q)} ».</p>`;
        return;
      }

      renderVideoCards(
        videos.map((v) => ({
          lank: v.lank,
          title: v.title,
          duration: "",
          thumb: v.imageUrl,
          snippetHtml: v.snippetHtml,
          deepLinks: v.deepLinks || []
        })),
        lang
      );
    } catch (err) {
      grid.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  function renderVideoCards(items, lang) {
    const grid = document.getElementById("video-catalog-grid");
    if (!grid) return;

    grid.innerHTML = items
      .map((item) => {
        const jumpButtons = (item.deepLinks || [])
          .slice(0, 3)
          .map((dl) => {
            const url = (dl.urls && dl.urls["jw.org"]) || "";
            const tsMatch = url.match(/[?&]ts=([\d.]+)/);
            const ts = tsMatch ? parseFloat(tsMatch[1]) : 0;
            return `<button type="button" class="btn-accent btn-xs" data-play-lank="${esc(item.lank)}" data-play-ts="${ts}">⏱️ ${esc(dl.jumpLabel || secondsToShortLabel(ts))}</button>`;
          })
          .join("");

        return `
          <div class="video-card">
            <div class="video-thumb-wrap" data-play-lank="${esc(item.lank)}" data-play-ts="0">
              ${item.thumb ? `<img src="${esc(item.thumb)}" alt="" loading="lazy" />` : `<div class="video-thumb-placeholder">🎬</div>`}
              ${item.duration ? `<span class="video-duration-pill">${esc(item.duration)}</span>` : ""}
              <span class="video-play-overlay">▶</span>
            </div>
            <div class="video-card-body">
              <h4>${esc(item.title)}</h4>
              ${item.snippetHtml ? `<p class="video-sub-snippet">${item.snippetHtml}</p>` : ""}
              <div class="video-card-actions">
                <button type="button" class="btn-primary btn-xs" data-play-lank="${esc(item.lank)}" data-play-ts="0">▶ Lire &amp; Sous-titres</button>
                ${jumpButtons}
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ==========================================================================
  // 2. Ouverture d'une Vidéo dans le Lecteur Intégré + Extraction VTT
  // ==========================================================================

  async function openVideoInApp(lank, options = {}) {
    if (!lank) return;
    const lang = options.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const startTime = Number(options.startTime) || 0;

    if (!options.skipTabSwitch && window.DFWolSwitchTab) {
      window.DFWolSwitchTab("videos");
    }

    const playerStage = document.getElementById("video-player-stage");
    const titleEl = document.getElementById("video-active-title");
    const metaEl = document.getElementById("video-active-meta");
    const transcriptEl = document.getElementById("video-transcript-list");

    if (playerStage) playerStage.classList.remove("hidden");
    if (titleEl) titleEl.textContent = "Chargement de la vidéo et des sous-titres…";
    if (transcriptEl) transcriptEl.innerHTML = `<div class="loading-box">⏳ Chargement des sous-titres…</div>`;

    try {
      const langLetter = window.DFWolNet.getLangLetter(lang);
      const data = await window.DFWolNet.mediatorGet(
        `media-items/${langLetter}/${encodeURIComponent(lank)}?clientType=www`
      );
      const media = data && data.media && data.media[0];
      if (!media) throw new Error("Média introuvable dans cette langue.");

      const mp4Files = (media.files || []).filter(
        (f) => f.progressiveDownloadURL && /mp4/i.test(f.mimetype || f.progressiveDownloadURL)
      );
      const preferred =
        mp4Files.find((f) => f.label === currentVideoState.activeQuality) ||
        mp4Files.find((f) => f.label === "480p") ||
        mp4Files[mp4Files.length - 1] ||
        (media.files && media.files[0]);

      const subFile = (media.files || []).find((f) => f.subtitles && f.subtitles.url);
      const subtitlesUrl = subFile ? subFile.subtitles.url : null;

      currentVideoState = {
        lank,
        lang,
        media,
        files: mp4Files,
        activeQuality: preferred ? preferred.label : "auto",
        subtitlesUrl,
        rawVtt: "",
        cues: [],
        blobTrackUrl: currentVideoState.blobTrackUrl,
        startTime
      };

      if (titleEl) titleEl.textContent = media.title;
      if (metaEl) metaEl.textContent = `${lang.toUpperCase()} • ${media.durationFormattedMinSec || ""} • ${lank}`;

      // Sélecteur de qualité
      const qualSelect = document.getElementById("video-quality-select");
      if (qualSelect) {
        qualSelect.innerHTML = mp4Files
          .map((f) => `<option value="${esc(f.label)}" ${f === preferred ? "selected" : ""}>${esc(f.label || "MP4")}</option>`)
          .join("");
      }

      // Configurer la balise <video>
      const videoEl = document.getElementById("dfwol-video-el");
      if (videoEl && preferred) {
        // Mettre en pause l'audio global si actif
        window.DFWolAudio && window.DFWolAudio.stopAll();
        videoEl.src = preferred.progressiveDownloadURL;
        videoEl.onloadedmetadata = () => {
          if (startTime > 0 && startTime < videoEl.duration) {
            videoEl.currentTime = startTime;
          }
          videoEl.play().catch(() => {});
        };
      }

      // Charger les sous-titres .vtt
      await loadAndAttachSubtitles(subtitlesUrl, lang);
      playerStage?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      if (titleEl) titleEl.textContent = "Erreur vidéo";
      if (transcriptEl) transcriptEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  async function loadAndAttachSubtitles(subtitlesUrl, lang) {
    const videoEl = document.getElementById("dfwol-video-el");
    const transcriptEl = document.getElementById("video-transcript-list");
    const versesBox = document.getElementById("video-cited-verses-box");

    if (versesBox) versesBox.innerHTML = "";

    if (currentVideoState.blobTrackUrl) {
      URL.revokeObjectURL(currentVideoState.blobTrackUrl);
      currentVideoState.blobTrackUrl = null;
    }

    if (videoEl) {
      videoEl.querySelectorAll("track").forEach((t) => t.remove());
    }

    if (!subtitlesUrl) {
      currentVideoState.rawVtt = "";
      currentVideoState.cues = [];
      if (transcriptEl) transcriptEl.innerHTML = `<p class="card-helper-text">Aucun fichier de sous-titres (.vtt) disponible pour cette vidéo.</p>`;
      return;
    }

    try {
      const rawVtt = await window.DFWolNet.fetchTextDirect(subtitlesUrl);
      currentVideoState.rawVtt = rawVtt;
      currentVideoState.cues = parseVtt(rawVtt);

      // Attacher <track> UTF-8 à la vidéo
      if (videoEl) {
        const blob = new Blob([rawVtt], { type: "text/vtt;charset=utf-8" });
        const blobUrl = URL.createObjectURL(blob);
        currentVideoState.blobTrackUrl = blobUrl;

        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = lang === "en" ? "English" : "Français";
        track.srclang = lang;
        track.src = blobUrl;
        track.default = true;
        videoEl.appendChild(track);
        if (videoEl.textTracks && videoEl.textTracks[0]) {
          videoEl.textTracks[0].mode = "showing";
        }
      }

      renderTranscriptList();
    } catch (err) {
      if (transcriptEl) transcriptEl.innerHTML = `<p class="card-helper-text">⚠️ Impossible de charger les sous-titres : ${esc(err.message)}</p>`;
    }
  }

  function renderTranscriptList(filterQuery = "") {
    const list = document.getElementById("video-transcript-list");
    if (!list) return;

    const q = (filterQuery || "").trim().toLowerCase();
    const filtered = currentVideoState.cues.filter((c) => !q || c.text.toLowerCase().includes(q));

    if (filtered.length === 0) {
      list.innerHTML = `<p class="card-helper-text">Aucune ligne de sous-titre correspondante.</p>`;
      return;
    }

    list.innerHTML = filtered
      .map(
        (c) => `
        <button type="button" class="transcript-cue-btn" data-cue-idx="${c.index - 1}" data-cue-start="${c.start}">
          <span class="cue-ts">${c.startShort}</span>
          <span class="cue-txt">${esc(c.text)}</span>
        </button>
      `
      )
      .join("");
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function init() {
    document.getElementById("video-category-select")?.addEventListener("change", (e) => {
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      loadVideosByCategory(e.target.value, lang);
    });

    document.getElementById("video-search-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = document.getElementById("video-search-input")?.value || "";
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      searchVideosAndSubtitles(q, lang);
    });

    document.getElementById("video-catalog-grid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-play-lank]");
      if (!btn) return;
      const lank = btn.getAttribute("data-play-lank");
      const ts = parseFloat(btn.getAttribute("data-play-ts") || "0");
      const lang = window.DFWolGetLang ? window.DFWolGetLang() : "fr";
      openVideoInApp(lank, { startTime: ts, lang });
    });

    document.getElementById("video-quality-select")?.addEventListener("change", (e) => {
      const label = e.target.value;
      const file = currentVideoState.files.find((f) => f.label === label);
      const videoEl = document.getElementById("dfwol-video-el");
      if (file && videoEl) {
        const curT = videoEl.currentTime || 0;
        const wasPlaying = !videoEl.paused;
        currentVideoState.activeQuality = label;
        videoEl.src = file.progressiveDownloadURL;
        videoEl.onloadedmetadata = () => {
          videoEl.currentTime = curT;
          if (wasPlaying) videoEl.play().catch(() => {});
        };
      }
    });

    document.getElementById("video-btn-switch-lang")?.addEventListener("click", () => {
      if (!currentVideoState.lank) return;
      const videoEl = document.getElementById("dfwol-video-el");
      const curT = videoEl ? videoEl.currentTime : 0;
      const nextLang = currentVideoState.lang === "fr" ? "en" : "fr";
      openVideoInApp(currentVideoState.lank, { lang: nextLang, startTime: curT, skipTabSwitch: true });
    });

    document.getElementById("video-transcript-filter")?.addEventListener("input", (e) => {
      renderTranscriptList(e.target.value);
    });

    document.getElementById("video-transcript-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cue-start]");
      if (!btn) return;
      const start = parseFloat(btn.getAttribute("data-cue-start") || "0");
      const videoEl = document.getElementById("dfwol-video-el");
      if (videoEl) {
        videoEl.currentTime = start;
        videoEl.play().catch(() => {});
      }
    });

    // Surlignage en temps réel du sous-titre actif
    document.getElementById("dfwol-video-el")?.addEventListener("timeupdate", (e) => {
      const t = e.target.currentTime;
      const cues = currentVideoState.cues;
      if (!cues.length) return;
      const activeIdx = cues.findIndex((c) => t >= c.start && t <= c.end);
      const list = document.getElementById("video-transcript-list");
      if (!list) return;
      list.querySelectorAll(".transcript-cue-btn.active").forEach((b) => b.classList.remove("active"));
      if (activeIdx >= 0) {
        const activeBtn = list.querySelector(`[data-cue-idx="${activeIdx}"]`);
        if (activeBtn) activeBtn.classList.add("active");
      }
    });

    // Actions d'extraction des sous-titres
    document.getElementById("sub-btn-copy-plain")?.addEventListener("click", async () => {
      if (!currentVideoState.cues.length) return;
      await navigator.clipboard.writeText(buildPlainTranscript(currentVideoState.cues));
      window.DFWolToast && window.DFWolToast("Texte des sous-titres copié !");
    });

    document.getElementById("sub-btn-copy-ts")?.addEventListener("click", async () => {
      if (!currentVideoState.cues.length) return;
      await navigator.clipboard.writeText(buildTimestampedTranscript(currentVideoState.cues));
      window.DFWolToast && window.DFWolToast("Transcription horodatée copiée !");
    });

    document.getElementById("sub-btn-dl-vtt")?.addEventListener("click", () => {
      if (!currentVideoState.rawVtt) return;
      downloadFile(currentVideoState.rawVtt, `${currentVideoState.lank || "subtitles"}.vtt`, "text/vtt;charset=utf-8");
    });

    document.getElementById("sub-btn-dl-srt")?.addEventListener("click", () => {
      if (!currentVideoState.cues.length) return;
      downloadFile(buildSrtFromCues(currentVideoState.cues), `${currentVideoState.lank || "subtitles"}.srt`, "text/plain;charset=utf-8");
    });

    document.getElementById("sub-btn-dl-txt")?.addEventListener("click", () => {
      if (!currentVideoState.cues.length) return;
      downloadFile(buildTimestampedTranscript(currentVideoState.cues), `${currentVideoState.lank || "transcript"}.txt`, "text/plain;charset=utf-8");
    });

    document.getElementById("sub-btn-extract-verses")?.addEventListener("click", () => {
      const box = document.getElementById("video-cited-verses-box");
      if (!box || !currentVideoState.cues.length) return;
      const fullText = buildPlainTranscript(currentVideoState.cues);
      const refs = window.DFWolBible.parseScriptureReferences(fullText, currentVideoState.lang);
      if (refs.length === 0) {
        box.innerHTML = `<p class="card-helper-text">Aucun verset biblique explicite détecté dans les sous-titres.</p>`;
        return;
      }
      box.innerHTML = `
        <div class="cited-verses-strip">
          <strong>📖 Versets cités dans cette vidéo (${refs.length}) :</strong>
          <div class="verse-card-links" style="margin-top:0.4rem;">
            ${refs
              .map(
                (r) =>
                  `<button type="button" class="chip-btn" data-inapp-bible="${r.bookNum}:${r.chapter}:${r.verseStart || 1}">${esc(r.label)}</button>`
              )
              .join("")}
          </div>
        </div>
      `;
      window.DFWolReader && window.DFWolReader.attachInAppLinkInterceptor(box, currentVideoState.lang);
    });

    document.getElementById("sub-btn-to-notes")?.addEventListener("click", () => {
      if (!currentVideoState.cues.length || !window.DFWolAddNote) return;
      const title = `Transcription — ${currentVideoState.media?.title || currentVideoState.lank}`;
      window.DFWolAddNote(title, "Réunion", buildTimestampedTranscript(currentVideoState.cues));
    });

    document.getElementById("sub-btn-tts")?.addEventListener("click", () => {
      if (!currentVideoState.cues.length || !window.DFWolAudio) return;
      window.DFWolAudio.playTrack({
        title: currentVideoState.media?.title || "Transcription Vidéo",
        subtitle: "Lecture vocale des sous-titres",
        text: buildPlainTranscript(currentVideoState.cues),
        lang: currentVideoState.lang,
        mode: "tts"
      });
    });
  }

  return {
    init,
    loadVideoCategories,
    loadVideosByCategory,
    searchVideosAndSubtitles,
    openVideoInApp,
    parseVtt
  };
})();
