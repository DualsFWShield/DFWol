/* ==========================================================================
   DFWol Studio — Téléchargements Faciles (Vidéo MP4, Audio MP3, Sous-titres),
   Export PDF Publications & Bible (avec/sans versets & images) & Vue Médias
   ========================================================================== */

window.DFWolExport = (function () {
  "use strict";

  const DOWNLOADS_KEY = "dfwol_downloads_v1";
  let currentPdfSource = null;
  let currentMediaModalData = null;
  let html2pdfPromise = null;
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

  function sanitizeFilename(name, fallback = "dfwol-document") {
    const clean = cleanStr(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 85);
    return clean || fallback;
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!isFinite(n) || n <= 0) return "";
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  }

  // ==========================================================================
  // 1. Historique & Téléchargement Facile Vidéo / Audio / Sous-titres
  // ==========================================================================

  function getDownloadsHistory() {
    try {
      const list = JSON.parse(localStorage.getItem(DOWNLOADS_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveDownloadsHistory(list) {
    try {
      localStorage.setItem(DOWNLOADS_KEY, JSON.stringify((list || []).slice(0, 60)));
    } catch (_) {}
  }

  function recordDownload(entry) {
    const list = getDownloadsHistory();
    const filtered = list.filter((x) => x.url !== entry.url);
    filtered.unshift(
      Object.assign(
        {
          id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          downloadedAt: new Date().toISOString()
        },
        entry
      )
    );
    saveDownloadsHistory(filtered);
    if (window.DFWolLibrary && typeof window.DFWolLibrary.renderDownloadsView === "function") {
      window.DFWolLibrary.renderDownloadsView();
    }
  }

  function removeDownloadEntry(id) {
    const list = getDownloadsHistory().filter((x) => x.id !== id);
    saveDownloadsHistory(list);
    if (window.DFWolLibrary && typeof window.DFWolLibrary.renderDownloadsView === "function") {
      window.DFWolLibrary.renderDownloadsView();
    }
  }

  function triggerBlobDownload(blobOrText, filename, mimeType = "application/octet-stream") {
    const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
  }

  async function downloadMediaFile(url, filename, meta = {}) {
    if (!url) {
      window.DFWolToast && window.DFWolToast("Aucune URL de téléchargement disponible.");
      return false;
    }

    const cleanName = filename || `${sanitizeFilename(meta.title || "media")}.bin`;
    const isNative = window.DFWolNet && window.DFWolNet.isNativeCapacitor && window.DFWolNet.isNativeCapacitor();
    const capBrowser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;

    recordDownload({
      type: meta.type || "media",
      title: meta.title || cleanName,
      subtitle: meta.subtitle || "",
      url,
      filename: cleanName,
      thumb: meta.thumb || "",
      lank: meta.lank || ""
    });

    if (isNative && capBrowser && typeof capBrowser.open === "function") {
      try {
        await capBrowser.open({ url });
        window.DFWolToast && window.DFWolToast(`Téléchargement lancé : ${cleanName}`);
        return true;
      } catch (_) {}
    }

    if (meta.onProgress) meta.onProgress(0);
    window.DFWolToast && window.DFWolToast(`Téléchargement en cours : ${cleanName}…`);

    try {
      const blob = await window.DFWolNet.fetchBlobWithProxyFallback(url, meta.onProgress);
      triggerBlobDownload(blob, cleanName, blob.type || "application/octet-stream");
      window.DFWolToast && window.DFWolToast(`Téléchargé : ${cleanName}`);
      return true;
    } catch (_) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("data-allow-external", "1");
      a.download = cleanName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.DFWolToast && window.DFWolToast("Ouvert dans le gestionnaire de téléchargement du navigateur.");
      return true;
    }
  }

  async function downloadAudioTrack(url, title, subtitle = "", meta = {}) {
    const ext = /\.m4a(\?|$)/i.test(url) ? "m4a" : "mp3";
    const fname = `${sanitizeFilename(title || "audio")}.${ext}`;
    return downloadMediaFile(url, fname, Object.assign({ type: "audio", title, subtitle }, meta));
  }

  async function downloadBibleChapterAudio(bookNum, chapter, lang = "fr") {
    const book = window.DFWolBible.getBookByNumber(bookNum);
    const ch = Number(chapter) || 1;
    const bookName = window.DFWolBible.getBookDisplayName(book, lang);
    const tracks = await window.DFWolNet.getBibleAudio(book.num, lang);
    const track = tracks.find((t) => Number(t.track) === ch) || tracks[ch - 1];
    if (!track || !track.file || !track.file.url) {
      window.DFWolToast && window.DFWolToast("Aucun MP3 officiel disponible pour ce chapitre.");
      return false;
    }
    return downloadAudioTrack(track.file.url, `${bookName} ${ch}`, "Bible NWT MP3");
  }

  async function downloadArticleAudio(docId, title, lang = "fr") {
    if (!docId) {
      window.DFWolToast && window.DFWolToast("Aucun audio MP3 associé à cet article.");
      return false;
    }
    const track = await window.DFWolNet.getArticleAudioByDocId(docId, lang);
    if (!track || !track.file || !track.file.url) {
      window.DFWolToast && window.DFWolToast("Aucun MP3 officiel disponible pour cet article.");
      return false;
    }
    return downloadAudioTrack(track.file.url, title || `article-${docId}`, "Publication JW MP3");
  }

  async function openVideoDownloadModal(lankOrMedia, lang = "fr") {
    const modal = document.getElementById("video-download-modal");
    const titleEl = document.getElementById("vdl-title");
    const metaEl = document.getElementById("vdl-meta");
    const listEl = document.getElementById("vdl-list");
    const subsEl = document.getElementById("vdl-subs-list");
    if (!modal || !listEl) return;

    modal.classList.remove("hidden");
    if (titleEl) titleEl.textContent = "Téléchargement vidéo";
    if (metaEl) metaEl.textContent = "Chargement des qualités MP4…";
    listEl.innerHTML = `<div class="loading-box">⏳ Récupération des liens MP4…</div>`;
    if (subsEl) subsEl.innerHTML = "";

    try {
      let media = typeof lankOrMedia === "object" && lankOrMedia ? lankOrMedia : null;
      if (!media || !Array.isArray(media.files)) {
        const lank = typeof lankOrMedia === "string" ? lankOrMedia : lankOrMedia?.lank || lankOrMedia?.languageAgnosticNaturalKey;
        const ll = window.DFWolNet.getLangLetter(lang);
        const data = await window.DFWolNet.mediatorGet(`media-items/${ll}/${encodeURIComponent(lank)}?clientType=www`);
        media = data && data.media && data.media[0];
      }
      if (!media) throw new Error("Vidéo introuvable dans cette langue.");

      currentMediaModalData = { media, lang };
      const thumb = (media.images && (media.images.lss?.lg || media.images.wss?.lg || media.images.pnr?.lg || media.images.sqr?.lg)) || "";
      const files = (media.files || [])
        .filter((f) => f.progressiveDownloadURL)
        .sort((a, b) => (parseInt(b.label, 10) || 0) - (parseInt(a.label, 10) || 0));

      if (titleEl) titleEl.textContent = media.title || "Téléchargement vidéo";
      if (metaEl) metaEl.textContent = `${lang.toUpperCase()} • ${media.durationFormattedMinSec || ""} • ${files.length} format(s)`;

      if (files.length === 0) {
        listEl.innerHTML = `<p class="card-helper-text">Aucun fichier téléchargeable trouvé.</p>`;
      } else {
        listEl.innerHTML = files
          .map((f, idx) => {
            const label = f.label || "MP4";
            const sizeStr = formatBytes(f.filesize);
            const fname = `${sanitizeFilename(media.title)}-${sanitizeFilename(label)}.mp4`;
            return `
              <div class="vdl-row">
                <div class="vdl-info">
                  <strong>🎬 Qualité ${esc(label)}</strong>
                  <small>${sizeStr ? sizeStr : "MP4 progressif"}</small>
                </div>
                <div class="btn-group">
                  <button type="button" class="btn-primary btn-xs" data-vdl-idx="${idx}">⬇️ Télécharger</button>
                  <a href="${esc(f.progressiveDownloadURL)}" data-allow-external="1" target="_blank" rel="noopener" class="btn-ghost btn-xs" download="${esc(fname)}">↗ Direct</a>
                </div>
              </div>
            `;
          })
          .join("");

        listEl.querySelectorAll("[data-vdl-idx]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const f = files[Number(btn.getAttribute("data-vdl-idx"))];
            if (!f) return;
            const origText = btn.textContent;
            btn.disabled = true;
            const fname = `${sanitizeFilename(media.title)}-${sanitizeFilename(f.label || "video")}.mp4`;
            await downloadMediaFile(f.progressiveDownloadURL, fname, {
              type: "video",
              title: `${media.title} (${f.label || "MP4"})`,
              subtitle: media.durationFormattedMinSec || "Vidéo JW",
              thumb,
              lank: media.languageAgnosticNaturalKey || "",
              onProgress: (pct) => {
                btn.textContent = pct !== null ? `⏳ ${pct}%` : "⏳ …";
              }
            });
            btn.disabled = false;
            btn.textContent = origText;
          });
        });
      }

      const subFile = (media.files || []).find((f) => f.subtitles && f.subtitles.url);
      if (subsEl && subFile) {
        subsEl.innerHTML = `
          <div class="vdl-subs-box">
            <strong>📝 Sous-titres disponibles</strong>
            <div class="btn-group" style="margin-top:0.4rem;">
              <button type="button" class="btn-secondary btn-xs" data-vdl-sub="vtt">⬇️ .VTT</button>
              <button type="button" class="btn-secondary btn-xs" data-vdl-sub="srt">⬇️ .SRT</button>
              <button type="button" class="btn-secondary btn-xs" data-vdl-sub="txt">⬇️ .TXT</button>
            </div>
          </div>
        `;
        subsEl.querySelectorAll("[data-vdl-sub]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const fmt = btn.getAttribute("data-vdl-sub");
            try {
              const rawVtt = await window.DFWolNet.fetchTextDirect(subFile.subtitles.url);
              const baseName = sanitizeFilename(media.title);
              if (fmt === "vtt") {
                triggerBlobDownload(rawVtt, `${baseName}.vtt`, "text/vtt;charset=utf-8");
              } else {
                const cues = window.DFWolVideo ? window.DFWolVideo.parseVtt(rawVtt) : [];
                if (fmt === "srt") {
                  const srt = cues
                    .map((c, i) => `${i + 1}\n${fmtSrtTime(c.start)} --> ${fmtSrtTime(c.end)}\n${c.text}\n`)
                    .join("\n");
                  triggerBlobDownload(srt, `${baseName}.srt`, "text/plain;charset=utf-8");
                } else {
                  const txt = cues.map((c) => `[${c.startShort}] ${c.text}`).join("\n");
                  triggerBlobDownload(txt, `${baseName}.txt`, "text/plain;charset=utf-8");
                }
              }
              window.DFWolToast && window.DFWolToast(`Sous-titres .${fmt.toUpperCase()} téléchargés !`);
            } catch (err) {
              window.DFWolToast && window.DFWolToast(`Erreur sous-titres : ${err.message}`);
            }
          });
        });
      }
    } catch (err) {
      listEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  function fmtSrtTime(sec) {
    const sTotal = Math.max(0, Number(sec) || 0);
    const hrs = Math.floor(sTotal / 3600);
    const mins = Math.floor((sTotal % 3600) / 60);
    const secs = Math.floor(sTotal % 60);
    const ms = Math.round((sTotal - Math.floor(sTotal)) * 1000);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }

  // ==========================================================================
  // 2. Export PDF Publication / Bible (avec ou sans versets inclus et images)
  // ==========================================================================

  function openPdfExportModal(source = null) {
    const modal = document.getElementById("pdf-export-modal");
    const titleLabel = document.getElementById("pdf-export-title-label");
    const progEl = document.getElementById("pdf-export-progress");
    if (!modal) return;

    if (!source) {
      const art = window.DFWolReader && window.DFWolReader.getCurrentArticleData();
      if (art) {
        const liveBody = document.getElementById("reader-article-body");
        let snapshotHtml = art.html;
        if (liveBody) {
          const clone = liveBody.cloneNode(true);
          const origTas = liveBody.querySelectorAll("textarea");
          const cloneTas = clone.querySelectorAll("textarea");
          origTas.forEach((ta, i) => {
            if (cloneTas[i]) {
              cloneTas[i].setAttribute("data-live-val", ta.value);
              cloneTas[i].textContent = ta.value;
            }
          });
          snapshotHtml = clone.innerHTML;
        }
        source = {
          type: "article",
          title: art.title,
          subtitle: art.citation || "WOL.jw.org",
          html: snapshotHtml,
          docId: art.docId,
          lang: art.lang || "fr",
          baseUrl: art.url
        };
      }
    }

    if (!source) {
      window.DFWolToast && window.DFWolToast("Ouvrez d'abord une publication ou un chapitre biblique à exporter.");
      return;
    }

    currentPdfSource = source;
    if (titleLabel) titleLabel.textContent = source.title || "Publication DFWol";
    if (progEl) {
      progEl.textContent = "";
      progEl.classList.add("hidden");
    }
    modal.classList.remove("hidden");
  }

  function collectRefsInElement(el, lang = "fr") {
    const refs = [];
    const seen = new Set();
    const pushRef = (r) => {
      if (!r || !r.bookNum || !r.chapter) return;
      const key = `${r.bookNum}:${r.chapter}:${r.verseSpecCompact || r.verseStart || 1}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push(r);
      }
    };

    el.querySelectorAll("[data-inapp-bible]").forEach((node) => {
      const parsed = window.DFWolBible.parseDataBibleAttr(node.getAttribute("data-inapp-bible"));
      pushRef(window.DFWolBible.buildScriptureLinks(parsed.bookNum, parsed.chapter, parsed.verses, null, lang));
    });

    el.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const txt = cleanStr(a.textContent || "");
      const parsedHref = window.DFWolBible.parseWolUrlTarget(href, lang);
      if (parsedHref.type === "bible") {
        const fromTxt = window.DFWolBible.parseScriptureReferences(txt, lang);
        if (fromTxt.length === 1 && fromTxt[0].bookNum === parsedHref.bookNum && fromTxt[0].chapter === parsedHref.chapter) {
          pushRef(fromTxt[0]);
        } else {
          pushRef(
            window.DFWolBible.buildScriptureLinks(
              parsedHref.bookNum,
              parsedHref.chapter,
              parsedHref.verses || parsedHref.verseStart || 1,
              null,
              lang
            )
          );
        }
      } else if (parsedHref.type === "wol-bible-redirect") {
        window.DFWolBible.parseScriptureReferences(txt, lang).forEach(pushRef);
      }
    });

    window.DFWolBible.parseScriptureReferences(cleanStr(el.textContent || ""), lang).forEach(pushRef);
    return refs;
  }

  function formatVersePassageHtml(ref, chapterData, lang = "fr") {
    if (!chapterData || !Array.isArray(chapterData.verses)) return "";
    const targetVerses = Array.isArray(ref.verses) && ref.verses.length ? ref.verses : [ref.verseStart || 1];
    const matched = targetVerses
      .map((vn) => chapterData.verses.find((v) => v.verse === vn))
      .filter(Boolean);
    if (!matched.length) return "";

    const body = matched.map((v) => `<sup>${v.verse}</sup>\u00a0${esc(v.text)}`).join(" ");
    return `
      <div class="pdf-verse-box">
        <div class="pdf-verse-ref">📖 ${esc(ref.label)}</div>
        <div class="pdf-verse-txt">${body}</div>
      </div>
    `;
  }

  async function inlineImagesForCanvas(containerEl) {
    const imgs = Array.from(containerEl.querySelectorAll("img"));
    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute("src") || "";
        if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
        try {
          const blob = await window.DFWolNet.fetchBlobWithProxyFallback(src);
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) img.setAttribute("src", dataUrl);
        } catch (_) {}
      })
    );
  }

  async function buildPdfHtmlDocument(source, options = {}, onProgress = null, inlineImages = false) {
    const lang = source.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = source.html || "";

    // Nettoyer les contrôles interactifs
    wrapper
      .querySelectorAll(
        ".jw-ai-inline-bar, .jw-ai-inline-result, #todayNav, #materialNav, .dc-screenReaderText, .alternatePresentation, script, style, button"
      )
      .forEach((el) => el.remove());

    // Notes & Champs réponses
    wrapper.querySelectorAll(".gen-field").forEach((gf) => {
      const ta = gf.querySelector("textarea");
      const val = ta ? (ta.getAttribute("data-live-val") ?? ta.value ?? ta.textContent ?? "").trim() : "";
      if (!options.includeNotes) {
        gf.remove();
        return;
      }
      const box = document.createElement("div");
      box.className = val ? "pdf-answer-box has-text" : "pdf-answer-box is-empty";
      box.innerHTML = val
        ? `<span class="pdf-answer-label">${lang === "en" ? "My answer:" : "Ma réponse :"}</span> ${esc(val).replace(/\n/g, "<br/>")}`
        : `<span class="pdf-answer-placeholder">${lang === "en" ? "Notes:" : "Notes :"}</span>`;
      gf.replaceWith(box);
    });

    if (!options.includeNotes) {
      wrapper.querySelectorAll("mark.jw-hl").forEach((m) => {
        const textNode = document.createTextNode(m.textContent || "");
        m.replaceWith(textNode);
      });
    }

    // Images & descriptions
    if (!options.includeImages) {
      wrapper.querySelectorAll("figure, img, .jw-banner-figure, .jw-figure-card, .jw-img-desc-box").forEach((el) => el.remove());
    } else {
      if (!options.includeImgDescs) {
        wrapper.querySelectorAll(".jw-img-desc-box").forEach((el) => el.remove());
      } else {
        wrapper.querySelectorAll("details.jw-img-desc-box").forEach((d) => {
          d.setAttribute("open", "open");
        });
      }
      if (inlineImages) {
        if (onProgress) onProgress("Préparation des illustrations…");
        await inlineImagesForCanvas(wrapper);
      }
    }

    // Versets inclus (multi-versets pris en charge)
    let appendixHtml = "";
    if (options.includeVerses) {
      const rawBlocks = Array.from(wrapper.querySelectorAll("p, li, blockquote, div.stdPullQuote"));
      const blocks = rawBlocks.filter((blk) => !rawBlocks.some((other) => other !== blk && other.contains(blk)));
      const blockRefsList = [];
      const allUniqueRefs = new Map();
      const chapterCache = new Map();

      blocks.forEach((blk) => {
        if (blk.closest("figure, figcaption, .jw-img-desc-box")) return;
        const rList = collectRefsInElement(blk, lang);
        if (rList.length) {
          blockRefsList.push({ blk, refs: rList });
          rList.forEach((r) => {
            const rKey = `${r.bookNum}:${r.chapter}:${r.verseSpecCompact || r.verseStart || 1}`;
            if (!allUniqueRefs.has(rKey)) allUniqueRefs.set(rKey, r);
            const cKey = `${r.bookNum}:${r.chapter}`;
            if (!chapterCache.has(cKey)) chapterCache.set(cKey, { bookNum: r.bookNum, chapter: r.chapter, data: null });
          });
        }
      });

      const chaptersToFetch = Array.from(chapterCache.values());
      const BATCH_SIZE = 3;
      for (let i = 0; i < chaptersToFetch.length; i += BATCH_SIZE) {
        const slice = chaptersToFetch.slice(i, i + BATCH_SIZE);
        if (onProgress) {
          onProgress(`Chargement des versets (${Math.min(i + slice.length, chaptersToFetch.length)}/${chaptersToFetch.length} chapitres)…`);
        }
        await Promise.all(
          slice.map(async (item) => {
            try {
              item.data = await window.DFWolReader.fetchBibleChapterParsed(item.bookNum, item.chapter, lang);
            } catch (_) {
              item.data = null;
            }
          })
        );
      }

      if (options.versesPosition === "appendix") {
        const boxes = [];
        allUniqueRefs.forEach((r) => {
          const chEntry = chapterCache.get(`${r.bookNum}:${r.chapter}`);
          const boxHtml = formatVersePassageHtml(r, chEntry?.data, lang);
          if (boxHtml) boxes.push(boxHtml);
        });
        if (boxes.length) {
          appendixHtml = `
            <section class="pdf-verses-appendix">
              <h2>📖 ${lang === "en" ? "Cited Scriptures" : "Versets bibliques cités"} (${boxes.length})</h2>
              ${boxes.join("")}
            </section>
          `;
        }
      } else {
        blockRefsList.forEach(({ blk, refs }) => {
          const boxes = refs
            .map((r) => formatVersePassageHtml(r, chapterCache.get(`${r.bookNum}:${r.chapter}`)?.data, lang))
            .filter(Boolean);
          if (boxes.length) {
            const container = document.createElement("div");
            container.className = "pdf-inline-verses-group";
            container.innerHTML = boxes.join("");
            blk.insertAdjacentElement("afterend", container);
          }
        });
      }
    }

    const pageSize = options.pageSize || "A4";
    const fontSize = options.fontSize || "11pt";
    const bodyHtml = `${wrapper.innerHTML}${appendixHtml}`;

    const css = `
      @page { size: ${pageSize}; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: "Noto Sans", Arial, sans-serif; font-size: ${fontSize}; line-height: 1.58; color: #1f242b; background: #fff; margin: 0; padding: 0; }
      .pdf-doc-wrap { max-width: 740px; margin: 0 auto; padding: 8px 4px; }
      .pdf-doc-header { border-bottom: 2px solid #4a6da7; padding-bottom: 10px; margin-bottom: 16px; }
      .pdf-doc-eyebrow { font-size: 0.78em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #4a6da7; }
      .pdf-doc-title { font-size: 1.55em; font-weight: 700; margin: 4px 0; color: #111827; }
      .pdf-doc-meta { font-size: 0.85em; color: #586069; }
      h1, h2, h3 { color: #1e3a5f; page-break-after: avoid; break-after: avoid; margin: 1.1em 0 0.45em; }
      p { margin: 0 0 0.75em; }
      a { color: #3d5d94; text-decoration: none; font-weight: 600; }
      figure { margin: 14px 0; page-break-inside: avoid; break-inside: avoid; }
      figure img { max-width: 100%; max-height: 360px; width: auto; height: auto; border-radius: 4px; display: block; }
      figcaption { font-size: 0.85em; color: #4b5563; margin-top: 5px; }
      .jw-img-desc-box { margin-top: 6px; padding: 6px 10px; background: #f8fafc; border-left: 3px solid #4a6da7; font-size: 0.85em; }
      .pdf-inline-verses-group { margin: 6px 0 14px; }
      .pdf-verse-box { background: #f4f7fc; border-left: 3px solid #4a6da7; border-radius: 4px; padding: 7px 11px; margin: 5px 0; page-break-inside: avoid; break-inside: avoid; }
      .pdf-verse-ref { font-size: 0.82em; font-weight: 700; color: #385586; margin-bottom: 2px; }
      .pdf-verse-txt { font-size: 0.92em; color: #1f242b; }
      .pdf-verses-appendix { margin-top: 24px; padding-top: 14px; border-top: 2px solid #cbd5e1; }
      .pdf-answer-box { margin: 6px 0 12px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fafafa; font-size: 0.92em; page-break-inside: avoid; }
      .pdf-answer-box.is-empty { min-height: 38px; color: #94a3b8; }
      .pdf-answer-label { font-weight: 700; color: #4a6da7; }
      mark.jw-hl { padding: 0 2px; border-radius: 2px; }
      mark.hl-yellow { background: #fef08a; }
      mark.hl-pink { background: #fbcfe8; }
      mark.hl-blue { background: #bfdbfe; }
      mark.hl-green { background: #bbf7d0; }
      mark.hl-purple { background: #ddd6fe; }
      .stdPullQuote { margin: 12px 0 12px 14px; padding-left: 10px; border-left: 3px solid #c48400; font-style: italic; color: #7c3b0e; }
    `;

    const fullHtml = `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
  <meta charset="UTF-8" />
  <title>${esc(source.title || "DFWol PDF")}</title>
  <style>${css}</style>
</head>
<body>
  <div class="pdf-doc-wrap">
    <header class="pdf-doc-header">
      <div class="pdf-doc-eyebrow">DFWol • JW.org × WOL</div>
      <div class="pdf-doc-title">${esc(source.title || "Publication")}</div>
      <div class="pdf-doc-meta">${esc(source.subtitle || "")} • ${new Date().toLocaleDateString(lang === "en" ? "en-US" : "fr-FR")}</div>
    </header>
    <main class="pdf-doc-body">${bodyHtml}</main>
  </div>
</body>
</html>`;

    return { fullHtml, css, bodyInnerHtml: bodyHtml };
  }

  function readPdfModalOptions() {
    return {
      includeVerses: document.getElementById("pdf-opt-verses")?.checked !== false,
      versesPosition: document.getElementById("pdf-opt-verses-pos")?.value || "inline",
      includeImages: document.getElementById("pdf-opt-images")?.checked !== false,
      includeImgDescs: document.getElementById("pdf-opt-img-descs")?.checked === true,
      includeNotes: document.getElementById("pdf-opt-notes")?.checked !== false,
      pageSize: document.getElementById("pdf-opt-format")?.value || "A4",
      fontSize: document.getElementById("pdf-opt-fontsize")?.value || "11pt"
    };
  }

  async function runPdfExport(mode = "print") {
    if (!currentPdfSource) return;
    const progEl = document.getElementById("pdf-export-progress");
    const setProg = (msg) => {
      if (!progEl) return;
      progEl.textContent = msg;
      progEl.classList.remove("hidden");
    };

    const opts = readPdfModalOptions();
    setProg("Préparation du document…");

    try {
      const built = await buildPdfHtmlDocument(currentPdfSource, opts, setProg, mode === "download-pdf");

      if (mode === "html") {
        const fname = `${sanitizeFilename(currentPdfSource.title)}.html`;
        triggerBlobDownload(built.fullHtml, fname, "text/html;charset=utf-8");
        setProg(`✅ Fichier ${fname} téléchargé.`);
        return;
      }

      if (mode === "download-pdf") {
        setProg("Chargement du générateur PDF…");
        if (!window.html2pdf) {
          if (!html2pdfPromise) {
            html2pdfPromise = new Promise((resolve, reject) => {
              const s = document.createElement("script");
              s.src = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.2/dist/html2pdf.bundle.min.js";
              s.onload = resolve;
              s.onerror = () => {
                html2pdfPromise = null;
                reject(new Error("Impossible de charger html2pdf.js (hors-ligne ?). Utilisez Imprimer PDF."));
              };
              document.head.appendChild(s);
            });
          }
          await html2pdfPromise;
        }
        setProg("Génération du fichier .PDF…");
        const tempHost = document.createElement("div");
        tempHost.style.cssText = "position:fixed;left:-99999px;top:0;width:740px;background:#fff;color:#1f242b;padding:16px;";
        tempHost.innerHTML = `<style>${built.css}</style><div class="pdf-doc-wrap"><header class="pdf-doc-header"><div class="pdf-doc-eyebrow">DFWol • JW.org × WOL</div><div class="pdf-doc-title">${esc(currentPdfSource.title)}</div><div class="pdf-doc-meta">${esc(currentPdfSource.subtitle || "")}</div></header><main class="pdf-doc-body">${built.bodyInnerHtml}</main></div>`;
        document.body.appendChild(tempHost);

        const fname = `${sanitizeFilename(currentPdfSource.title)}.pdf`;
        await window
          .html2pdf()
          .set({
            margin: 10,
            filename: fname,
            image: { type: "jpeg", quality: 0.92 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: "mm", format: opts.pageSize.toLowerCase(), orientation: "portrait" }
          })
          .from(tempHost)
          .save();
        tempHost.remove();
        setProg(`✅ PDF téléchargé : ${fname}`);
        window.DFWolToast && window.DFWolToast(`PDF téléchargé : ${fname}`);
        return;
      }

      // Mode impression / Enregistrer en PDF vectoriel natif
      setProg("Ouverture de l'aperçu PDF…");
      const oldFrame = document.getElementById("dfwol-print-iframe");
      if (oldFrame) oldFrame.remove();

      const iframe = document.createElement("iframe");
      iframe.id = "dfwol-print-iframe";
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
      document.body.appendChild(iframe);

      const idoc = iframe.contentWindow.document;
      idoc.open();
      idoc.write(built.fullHtml);
      idoc.close();

      // Attendre le chargement des images (max 5s)
      const imgs = Array.from(idoc.images || []);
      if (imgs.length > 0) {
        await Promise.race([
          Promise.all(
            imgs.map(
              (img) =>
                img.complete ||
                new Promise((res) => {
                  img.onload = res;
                  img.onerror = res;
                })
            )
          ),
          new Promise((res) => setTimeout(res, 5000))
        ]);
      }

      setProg("✅ Prêt ! Sélectionnez « Enregistrer au format PDF ».");
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (err) {
      setProg(`⚠️ ${err.message}`);
    }
  }

  // ==========================================================================
  // 3. Vue « Voir les médias » (Capture 5 : Vidéos, Cantiques & Images)
  // ==========================================================================

  async function extractMediaItemsFromDom(rootEl, lang = "fr") {
    const videosMap = new Map();
    const imagesMap = new Map();
    const songNumbers = new Set();

    const scanContainer = (el) => {
      if (!el) return;

      el.querySelectorAll("a[data-video], a[href*='lank='], a[href*='webpubvid://']").forEach((a) => {
        const raw = a.getAttribute("data-video") || a.getAttribute("href") || "";
        const parsed = window.DFWolBible.parseWolUrlTarget(raw, lang);
        if (parsed.type === "video" && parsed.lank && !videosMap.has(parsed.lank)) {
          videosMap.set(parsed.lank, {
            lank: parsed.lank,
            title: cleanStr(a.textContent || parsed.lank),
            songNum: null
          });
        }
      });

      // Détecter les cantiques (ex: "Cantique 158", "Song 109")
      const txt = cleanStr(el.textContent || "");
      const songRe = /\b(?:Cantique|Song)\s+(\d{1,3})\b/gi;
      let sm;
      while ((sm = songRe.exec(txt)) !== null) {
        const num = parseInt(sm[1], 10);
        if (num >= 1 && num <= 165) songNumbers.add(num);
      }

      el.querySelectorAll("figure").forEach((fig) => {
        if (fig.closest("#materialNav")) return;
        const img = fig.querySelector("img");
        if (!img) return;
        const rawSrc = img.getAttribute("src") || "";
        if (!rawSrc || rawSrc.startsWith("data:") || img.classList.contains("suppressZoom")) return;
        const src = window.DFWolNet?.proxyImageUrl ? window.DFWolNet.proxyImageUrl(rawSrc) : rawSrc;
        if (img.getAttribute("height") && Number(img.getAttribute("height")) <= 90) return;
        if (!imagesMap.has(src)) {
          const cap = fig.querySelector("figcaption");
          imagesMap.set(src, {
            src,
            caption: cap ? cleanStr(cap.textContent || "") : "",
            alt: cleanStr(img.getAttribute("alt") || "")
          });
        }
      });
    };

    scanContainer(rootEl);

    // Si on est sur la vue programme de la semaine (#materialNav), charger Vie & Ministère + Tour de Garde
    if (rootEl && rootEl.querySelector("#materialNav")) {
      const links = Array.from(rootEl.querySelectorAll("#materialNav a.cardContainer[href]"))
        .map((a) => a.getAttribute("href"))
        .filter((h) => h && !/\/sjj|\/lmd|\/th|\/lff/i.test(h))
        .slice(0, 2);

      await Promise.all(
        links.map(async (u) => {
          try {
            const parsed = await window.DFWolReader.fetchArticleParsed(u);
            const tmp = document.createElement("div");
            tmp.innerHTML = parsed.html;
            scanContainer(tmp);
          } catch (_) {}
        })
      );
    }

    songNumbers.forEach((n) => {
      const lank = `pub-sjjm_${n}_VIDEO`;
      if (!videosMap.has(lank)) {
        videosMap.set(lank, {
          lank,
          title: `${lang === "en" ? "Song" : "Cantique"} ${n}`,
          songNum: n
        });
      }
    });

    const ll = window.DFWolNet.getLangLetter(lang);
    const entries = Array.from(videosMap.values()).slice(0, 24);
    const resolvedVideos = [];

    for (let i = 0; i < entries.length; i += 4) {
      const batch = entries.slice(i, i + 4);
      const chunkRes = await Promise.all(
        batch.map(async (item) => {
          try {
            const data = await window.DFWolNet.mediatorGet(`media-items/${ll}/${encodeURIComponent(item.lank)}?clientType=www`);
            const m = data && data.media && data.media[0];
            if (!m) return null;
            return {
              lank: m.languageAgnosticNaturalKey || item.lank,
              title: m.title || item.title,
              duration: m.durationFormattedMinSec || "",
              songNum: item.songNum,
              thumb: (m.images && (m.images.lss?.lg || m.images.wss?.lg || m.images.pnr?.lg || m.images.sqr?.lg)) || "",
              media: m
            };
          } catch (_) {
            return null;
          }
        })
      );
      chunkRes.filter(Boolean).forEach((v) => resolvedVideos.push(v));
    }

    return {
      videos: resolvedVideos,
      images: Array.from(imagesMap.values())
    };
  }

  async function openMeetingMediaView(containerEl = null, contextTitle = "", lang = "fr") {
    if (window.DFWolShowMeetingsView) {
      window.DFWolShowMeetingsView("media");
    }
    const contentEl = document.getElementById("meetings-media-content");
    const subEl = document.getElementById("meetings-media-subtitle");
    if (subEl) subEl.textContent = contextTitle || (lang === "en" ? "Meetings & Study" : "Vie et ministère");
    if (!contentEl) return;

    contentEl.innerHTML = `<div class="loading-box">⏳ Extraction des vidéos, cantiques et images…</div>`;
    const sourceEl = containerEl || document.getElementById("reader-article-body");

    try {
      const { videos, images } = await extractMediaItemsFromDom(sourceEl, lang);
      if (videos.length === 0 && images.length === 0) {
        contentEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🎬</div><p>Aucun média détecté dans cette publication.</p></div>`;
        return;
      }

      let html = "";
      if (videos.length > 0) {
        html += `<h2 class="jwl-media-section-title">${lang === "en" ? "Videos & Songs" : "Vidéos & Cantiques"}</h2>`;
        html += `<div class="jwl-media-grid-2">`;
        videos.forEach((v, idx) => {
          html += `
            <div class="jwl-media-tile">
              <div class="jwl-media-thumb" data-media-play="${esc(v.lank)}">
                ${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy" />` : `<div class="video-thumb-placeholder">🎬</div>`}
                ${v.duration ? `<span class="jwl-media-dur">▶ ${esc(v.duration)}</span>` : ""}
                ${!v.thumb && v.songNum ? `<span class="jwl-media-songnum">${v.songNum}</span>` : ""}
                <button type="button" class="jwl-media-dl-overlay" data-media-dl="${idx}" title="Télécharger la vidéo">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M7 18a4.5 4.5 0 0 1-.4-9A5.5 5.5 0 0 1 17.5 8a4 4 0 0 1 1 7.9M12 12v8m0 0-3-3m3 3 3-3"/></svg>
                </button>
              </div>
              <div class="jwl-media-caption">${esc(v.title)}</div>
            </div>
          `;
        });
        html += `</div>`;
      }

      if (images.length > 0) {
        html += `<h2 class="jwl-media-section-title">Images</h2>`;
        html += `<div class="jwl-media-grid-2">`;
        images.forEach((im, idx) => {
          html += `
            <div class="jwl-media-tile">
              <div class="jwl-media-thumb is-image" data-img-zoom="${idx}">
                <img src="${esc(im.src)}" alt="${esc(im.alt || im.caption)}" referrerpolicy="no-referrer" loading="lazy" />
                <button type="button" class="jwl-media-dl-overlay" data-img-dl="${idx}" title="Télécharger l'image">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/></svg>
                </button>
              </div>
              ${im.caption ? `<div class="jwl-media-caption">${esc(im.caption)}</div>` : ""}
            </div>
          `;
        });
        html += `</div>`;
      }

      contentEl.innerHTML = html;

      contentEl.querySelectorAll("[data-media-play]").forEach((el) => {
        el.addEventListener("click", (e) => {
          if (e.target.closest("[data-media-dl]")) return;
          const lank = el.getAttribute("data-media-play");
          window.DFWolVideo && window.DFWolVideo.openVideoInApp(lank, { lang });
        });
      });

      contentEl.querySelectorAll("[data-media-dl]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const v = videos[Number(btn.getAttribute("data-media-dl"))];
          if (v) openVideoDownloadModal(v.media || v.lank, lang);
        });
      });

      contentEl.querySelectorAll("[data-img-zoom]").forEach((el) => {
        el.addEventListener("click", (e) => {
          if (e.target.closest("[data-img-dl]")) return;
          const im = images[Number(el.getAttribute("data-img-zoom"))];
          if (im && window.DFWolReader && typeof window.DFWolReader.openImageLightbox === "function") {
            window.DFWolReader.openImageLightbox(im.src, im.caption, im.alt, lang);
          }
        });
      });

      contentEl.querySelectorAll("[data-img-dl]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const im = images[Number(btn.getAttribute("data-img-dl"))];
          if (im) {
            downloadMediaFile(im.src, `${sanitizeFilename(im.caption || "illustration")}.jpg`, {
              type: "image",
              title: im.caption || "Illustration JW",
              thumb: im.src
            });
          }
        });
      });
    } catch (err) {
      contentEl.innerHTML = `<p class="card-helper-text">⚠️ ${esc(err.message)}</p>`;
    }
  }

  function init() {
    if (uiBound) return;
    uiBound = true;

    document.getElementById("pdf-modal-close")?.addEventListener("click", () => {
      document.getElementById("pdf-export-modal")?.classList.add("hidden");
    });
    document.getElementById("pdf-export-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "pdf-export-modal") e.target.classList.add("hidden");
    });
    document.getElementById("btn-pdf-print")?.addEventListener("click", () => runPdfExport("print"));
    document.getElementById("btn-pdf-download")?.addEventListener("click", () => runPdfExport("download-pdf"));
    document.getElementById("btn-pdf-html")?.addEventListener("click", () => runPdfExport("html"));

    document.getElementById("vdl-modal-close")?.addEventListener("click", () => {
      document.getElementById("video-download-modal")?.classList.add("hidden");
    });
    document.getElementById("video-download-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "video-download-modal") e.target.classList.add("hidden");
    });
  }

  return {
    init,
    sanitizeFilename,
    formatBytes,
    getDownloadsHistory,
    removeDownloadEntry,
    triggerBlobDownload,
    downloadMediaFile,
    downloadAudioTrack,
    downloadBibleChapterAudio,
    downloadArticleAudio,
    openVideoDownloadModal,
    openPdfExportModal,
    openMeetingMediaView,
    extractMediaItemsFromDom
  };
})();
