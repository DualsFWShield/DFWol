/* ==========================================================================
   DFWol Studio — Lecteur Audio Persistant & File d'Attente Unifiée
   (MP3 Officiels PubMedia/Mediator + Synthèse Vocale TTS découpée)
   ========================================================================== */

window.DFWolAudio = (function () {
  "use strict";

  const htmlAudio = new Audio();
  htmlAudio.preload = "metadata";

  const state = {
    queue: [],
    currentIndex: -1,
    activeEngine: null, // 'mp3' | 'tts' | null
    isPlaying: false,
    rate: 1.0,
    ttsChunks: [],
    ttsChunkIndex: 0,
    ttsActiveUtterance: null,
    ttsCurrentTrack: null,
    ttsStopRequested: false,
    onProgressCallback: null
  };

  let uiBound = false;

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /**
   * Découpe un texte ou un tableau de paragraphes en segments <= 240 caractères
   * pour éviter la coupure Chrome Web Speech API sur les longs textes.
   */
  function buildTtsChunks(paragraphsOrText) {
    const chunks = [];
    const rawParas = Array.isArray(paragraphsOrText)
      ? paragraphsOrText.map((p, idx) =>
          typeof p === "string" ? { text: p, pid: null, pIdx: idx } : { text: p.text, pid: p.pid || null, pIdx: idx }
        )
      : String(paragraphsOrText || "")
          .split(/\n+/)
          .map((t, idx) => ({ text: t, pid: null, pIdx: idx }));

    rawParas.forEach((p) => {
      const clean = (p.text || "").replace(/\s+/g, " ").trim();
      if (!clean) return;
      // Découpe par phrases
      const sentences = clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean];
      let buffer = "";
      sentences.forEach((sent) => {
        if ((buffer + sent).length > 240 && buffer.trim()) {
          chunks.push({ text: buffer.trim(), pid: p.pid, pIdx: p.pIdx });
          buffer = sent;
        } else {
          buffer += sent;
        }
      });
      if (buffer.trim()) {
        chunks.push({ text: buffer.trim(), pid: p.pid, pIdx: p.pIdx });
      }
    });

    return chunks;
  }

  function pickVoice(lang = "fr") {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const prefix = lang === "en" ? "en" : "fr";
    const preferred =
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix) && /natural|google|microsoft|thomas|hortense|denise|aria|jenny/i.test(v.name)) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    return preferred || null;
  }

  function stopTtsInternal() {
    state.ttsStopRequested = true;
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    state.ttsActiveUtterance = null;
    clearArticleHighlights();
  }

  function stopMp3Internal() {
    try {
      htmlAudio.pause();
      htmlAudio.removeAttribute("src");
      htmlAudio.load();
    } catch (_) {}
  }

  function stopAll() {
    stopTtsInternal();
    stopMp3Internal();
    state.activeEngine = null;
    state.isPlaying = false;
    updatePlayerUI();
  }

  function clearArticleHighlights() {
    document.querySelectorAll(".tts-speaking-para").forEach((el) => el.classList.remove("tts-speaking-para"));
  }

  function highlightParagraph(chunk) {
    clearArticleHighlights();
    if (!chunk || !chunk.pid) return;
    const el = document.querySelector(`[data-reader-pid="${chunk.pid}"]`);
    if (el) {
      el.classList.add("tts-speaking-para");
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function speakChunkAt(index) {
    if (state.ttsStopRequested) return;
    if (index >= state.ttsChunks.length) {
      state.isPlaying = false;
      clearArticleHighlights();
      playNextInQueue();
      return;
    }

    state.ttsChunkIndex = index;
    const chunk = state.ttsChunks[index];
    highlightParagraph(chunk);

    if (!("speechSynthesis" in window)) {
      window.DFWolToast && window.DFWolToast("Synthèse vocale non supportée sur ce navigateur.");
      return;
    }

    const utt = new SpeechSynthesisUtterance(chunk.text);
    const lang = (state.ttsCurrentTrack && state.ttsCurrentTrack.lang) || "fr";
    utt.lang = lang === "en" ? "en-US" : "fr-FR";
    const voice = pickVoice(lang);
    if (voice) utt.voice = voice;
    utt.rate = state.rate;

    utt.onend = () => {
      if (!state.ttsStopRequested && state.activeEngine === "tts") {
        speakChunkAt(index + 1);
      }
    };
    utt.onerror = () => {
      if (!state.ttsStopRequested && state.activeEngine === "tts") {
        speakChunkAt(index + 1);
      }
    };

    state.ttsActiveUtterance = utt;
    state.isPlaying = true;
    state.activeEngine = "tts";
    window.speechSynthesis.speak(utt);
    updatePlayerUI();
  }

  function updateMediaSession(track) {
    if ("mediaSession" in navigator && track) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title || "DFWol Audio",
          artist: track.subtitle || "JW.org / WOL",
          album: "DFWol Studio"
        });
        navigator.mediaSession.setActionHandler("play", () => togglePlayPause());
        navigator.mediaSession.setActionHandler("pause", () => togglePlayPause());
        navigator.mediaSession.setActionHandler("previoustrack", () => playPrevInQueue());
        navigator.mediaSession.setActionHandler("nexttrack", () => playNextInQueue());
      } catch (_) {}
    }
  }

  /**
   * Joue immédiatement un item résolu (MP3 ou TTS)
   */
  async function startTrackItem(item) {
    stopTtsInternal();
    stopMp3Internal();

    if (!item) {
      state.activeEngine = null;
      state.isPlaying = false;
      updatePlayerUI();
      return;
    }

    showAudioBar();
    setBarStatus(item.title, `${item.subtitle || "Chargement…"}`);

    // Résolution automatique si l'item vient du Guide de recherche / d'une liste d'articles
    let resolvedUrl = item.audioUrl || null;
    let resolvedText = item.text || item.paragraphs || null;
    let resolvedTitle = item.title || "Lecture Audio";
    let resolvedSubtitle = item.subtitle || "";

    if (!resolvedUrl && (!resolvedText || resolvedText.length === 0) && item.wolUrl && window.DFWolReader) {
      try {
        setBarStatus(resolvedTitle, "Récupération de l'article & vérification MP3…");
        const parsed = await window.DFWolReader.fetchArticleParsed(item.wolUrl);
        resolvedTitle = parsed.title || resolvedTitle;
        resolvedSubtitle = parsed.citation || resolvedSubtitle;
        resolvedText = parsed.paragraphs.length ? parsed.paragraphs : parsed.plainText;

        if (parsed.docId && window.DFWolNet) {
          const mp3Track = await window.DFWolNet.getArticleAudioByDocId(parsed.docId, item.lang || "fr");
          if (mp3Track && mp3Track.file && mp3Track.file.url) {
            resolvedUrl = mp3Track.file.url;
          }
        }
      } catch (err) {
        window.DFWolToast && window.DFWolToast(`Impossible de charger l'audio de "${resolvedTitle}" : ${err.message}`);
        playNextInQueue();
        return;
      }
    } else if (!resolvedUrl && item.docId && window.DFWolNet && item.mode !== "tts") {
      try {
        const mp3Track = await window.DFWolNet.getArticleAudioByDocId(item.docId, item.lang || "fr");
        if (mp3Track && mp3Track.file && mp3Track.file.url) {
          resolvedUrl = mp3Track.file.url;
        }
      } catch (_) {}
    }

    // Mémoriser les données résolues sur l'item
    item.title = resolvedTitle;
    item.subtitle = resolvedSubtitle;
    if (resolvedUrl && item.mode !== "tts") {
      item.audioUrl = resolvedUrl;
      state.activeEngine = "mp3";
      htmlAudio.src = resolvedUrl;
      htmlAudio.playbackRate = state.rate;
      try {
        await htmlAudio.play();
        state.isPlaying = true;
      } catch (_) {
        state.isPlaying = false;
      }
      updateMediaSession(item);
      updatePlayerUI();
      return;
    }

    // Fallback ou mode explicite TTS
    if (resolvedText) {
      state.ttsStopRequested = false;
      state.ttsCurrentTrack = item;
      state.ttsChunks = buildTtsChunks(resolvedText);
      if (state.ttsChunks.length === 0) {
        playNextInQueue();
        return;
      }
      state.activeEngine = "tts";
      speakChunkAt(0);
      updateMediaSession(item);
      updatePlayerUI();
    } else {
      window.DFWolToast && window.DFWolToast("Aucun contenu audio ou texte disponible pour cet élément.");
      playNextInQueue();
    }
  }

  function playTrack(track) {
    state.queue = [Object.assign({ id: "trk-" + Date.now() }, track)];
    state.currentIndex = 0;
    renderQueueList();
    startTrackItem(state.queue[0]);
  }

  function playQueue(tracks, startIndex = 0) {
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    state.queue = tracks.map((t, i) => Object.assign({ id: t.id || `q-${Date.now()}-${i}` }, t));
    state.currentIndex = Math.max(0, Math.min(startIndex, state.queue.length - 1));
    renderQueueList();
    startTrackItem(state.queue[state.currentIndex]);
  }

  function addToQueue(track) {
    state.queue.push(Object.assign({ id: track.id || `q-${Date.now()}` }, track));
    renderQueueList();
    showAudioBar();
    if (state.currentIndex === -1) {
      state.currentIndex = 0;
      startTrackItem(state.queue[0]);
    } else {
      updatePlayerUI();
    }
  }

  function playNextInQueue() {
    if (state.currentIndex + 1 < state.queue.length) {
      state.currentIndex++;
      renderQueueList();
      startTrackItem(state.queue[state.currentIndex]);
    } else {
      stopAll();
    }
  }

  function playPrevInQueue() {
    if (state.activeEngine === "mp3" && htmlAudio.currentTime > 5) {
      htmlAudio.currentTime = 0;
      return;
    }
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderQueueList();
      startTrackItem(state.queue[state.currentIndex]);
    }
  }

  function togglePlayPause() {
    if (state.activeEngine === "mp3") {
      if (htmlAudio.paused) {
        htmlAudio.play().then(() => {
          state.isPlaying = true;
          updatePlayerUI();
        }).catch(() => {});
      } else {
        htmlAudio.pause();
        state.isPlaying = false;
        updatePlayerUI();
      }
    } else if (state.activeEngine === "tts") {
      if (state.isPlaying) {
        state.ttsStopRequested = true;
        window.speechSynthesis.cancel();
        state.isPlaying = false;
        updatePlayerUI();
      } else {
        state.ttsStopRequested = false;
        speakChunkAt(state.ttsChunkIndex);
      }
    } else if (state.queue.length > 0) {
      if (state.currentIndex < 0) state.currentIndex = 0;
      startTrackItem(state.queue[state.currentIndex]);
    }
  }

  function seekDelta(seconds) {
    if (state.activeEngine === "mp3") {
      htmlAudio.currentTime = Math.max(0, Math.min(htmlAudio.duration || 0, htmlAudio.currentTime + seconds));
    } else if (state.activeEngine === "tts") {
      const step = seconds > 0 ? 1 : -1;
      const targetIdx = Math.max(0, Math.min(state.ttsChunks.length - 1, state.ttsChunkIndex + step));
      stopTtsInternal();
      state.ttsStopRequested = false;
      speakChunkAt(targetIdx);
    }
  }

  function cycleRate() {
    const rates = [0.85, 1.0, 1.25, 1.5, 1.75, 2.0];
    const idx = rates.indexOf(state.rate);
    state.rate = rates[(idx + 1) % rates.length];
    if (state.activeEngine === "mp3") {
      htmlAudio.playbackRate = state.rate;
    } else if (state.activeEngine === "tts" && state.isPlaying) {
      const curIdx = state.ttsChunkIndex;
      stopTtsInternal();
      state.ttsStopRequested = false;
      speakChunkAt(curIdx);
    }
    updatePlayerUI();
  }

  // ==========================================================================
  // Liaison UI Barre Audio Persistante
  // ==========================================================================

  function showAudioBar() {
    const bar = document.getElementById("global-audio-bar");
    if (bar) {
      bar.classList.remove("hidden");
      document.body.classList.add("has-audio-bar");
    }
  }

  function hideAudioBar() {
    stopAll();
    const bar = document.getElementById("global-audio-bar");
    const drawer = document.getElementById("audio-queue-drawer");
    if (bar) bar.classList.add("hidden");
    if (drawer) drawer.classList.add("hidden");
    document.body.classList.remove("has-audio-bar");
  }

  function setBarStatus(title, subtitle) {
    const tEl = document.getElementById("audio-bar-title");
    const sEl = document.getElementById("audio-bar-sub");
    if (tEl) tEl.textContent = title || "Lecteur Audio";
    if (sEl) sEl.textContent = subtitle || "";
  }

  function updatePlayerUI() {
    const cur = state.queue[state.currentIndex];
    const titleEl = document.getElementById("audio-bar-title");
    const subEl = document.getElementById("audio-bar-sub");
    const playBtn = document.getElementById("audio-btn-play");
    const rateBtn = document.getElementById("audio-btn-rate");
    const badgeEl = document.getElementById("audio-engine-badge");
    const queueCountEl = document.getElementById("audio-queue-count");
    const progressEl = document.getElementById("audio-progress-range");
    const timeEl = document.getElementById("audio-time-label");

    if (cur) {
      if (titleEl) titleEl.textContent = cur.title || "Audio";
      if (subEl) subEl.textContent = cur.subtitle || (state.activeEngine === "mp3" ? "MP3 Officiel JW" : "Voix TTS");
    }

    if (playBtn) playBtn.textContent = state.isPlaying ? "⏸" : "▶";
    if (rateBtn) rateBtn.textContent = `${state.rate}×`;
    if (badgeEl) {
      badgeEl.textContent = state.activeEngine === "mp3" ? "MP3 Officiel" : state.activeEngine === "tts" ? "Voix TTS" : "Prêt";
    }
    if (queueCountEl) queueCountEl.textContent = String(state.queue.length);

    if (state.activeEngine === "mp3") {
      const dur = htmlAudio.duration || 0;
      const curT = htmlAudio.currentTime || 0;
      if (progressEl) {
        progressEl.max = dur > 0 ? Math.floor(dur) : 100;
        progressEl.value = dur > 0 ? Math.floor(curT) : 0;
      }
      if (timeEl) timeEl.textContent = `${formatTime(curT)} / ${formatTime(dur)}`;
    } else if (state.activeEngine === "tts") {
      const total = Math.max(1, state.ttsChunks.length);
      if (progressEl) {
        progressEl.max = total - 1;
        progressEl.value = state.ttsChunkIndex;
      }
      if (timeEl) timeEl.textContent = `Seg. ${state.ttsChunkIndex + 1}/${total}`;
    }

    renderQueueList();
  }

  function renderQueueList() {
    const list = document.getElementById("audio-queue-list");
    if (!list) return;
    if (state.queue.length === 0) {
      list.innerHTML = `<p class="card-helper-text">La file d'attente audio est vide.</p>`;
      return;
    }
    list.innerHTML = state.queue
      .map((item, idx) => {
        const active = idx === state.currentIndex;
        return `
          <div class="audio-queue-item ${active ? "active" : ""}">
            <button type="button" class="audio-queue-play-btn" data-q-play="${idx}">
              <span>${active && state.isPlaying ? "🔊" : `${idx + 1}.`}</span>
              <div>
                <strong>${window.DFWolSearch ? window.DFWolSearch.escapeHtml(item.title) : item.title}</strong>
                <small>${window.DFWolSearch ? window.DFWolSearch.escapeHtml(item.subtitle || (item.audioUrl ? "MP3" : "Auto MP3/TTS")) : ""}</small>
              </div>
            </button>
            <button type="button" class="btn-icon-xs" data-q-del="${idx}" title="Retirer">✕</button>
          </div>
        `;
      })
      .join("");
  }

  function init() {
    if (uiBound) return;
    uiBound = true;

    htmlAudio.addEventListener("timeupdate", () => {
      if (state.activeEngine === "mp3") updatePlayerUI();
    });
    htmlAudio.addEventListener("ended", () => {
      playNextInQueue();
    });
    htmlAudio.addEventListener("error", () => {
      // Si le MP3 échoue et qu'on a le texte, basculer sur TTS
      const cur = state.queue[state.currentIndex];
      if (cur && (cur.text || cur.paragraphs)) {
        cur.mode = "tts";
        startTrackItem(cur);
      } else {
        playNextInQueue();
      }
    });

    document.getElementById("audio-btn-play")?.addEventListener("click", togglePlayPause);
    document.getElementById("audio-btn-prev")?.addEventListener("click", playPrevInQueue);
    document.getElementById("audio-btn-next")?.addEventListener("click", playNextInQueue);
    document.getElementById("audio-btn-back15")?.addEventListener("click", () => seekDelta(-15));
    document.getElementById("audio-btn-fwd15")?.addEventListener("click", () => seekDelta(15));
    document.getElementById("audio-btn-rate")?.addEventListener("click", cycleRate);
    document.getElementById("audio-btn-close")?.addEventListener("click", hideAudioBar);

    document.getElementById("audio-btn-queue")?.addEventListener("click", () => {
      document.getElementById("audio-queue-drawer")?.classList.toggle("hidden");
    });
    document.getElementById("audio-queue-close")?.addEventListener("click", () => {
      document.getElementById("audio-queue-drawer")?.classList.add("hidden");
    });
    document.getElementById("audio-queue-clear")?.addEventListener("click", () => {
      state.queue = [];
      state.currentIndex = -1;
      stopAll();
      renderQueueList();
    });

    document.getElementById("audio-progress-range")?.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      if (state.activeEngine === "mp3") {
        htmlAudio.currentTime = val;
      } else if (state.activeEngine === "tts") {
        stopTtsInternal();
        state.ttsStopRequested = false;
        speakChunkAt(val);
      }
    });

    document.getElementById("audio-queue-list")?.addEventListener("click", (e) => {
      const pBtn = e.target.closest("[data-q-play]");
      const dBtn = e.target.closest("[data-q-del]");
      if (pBtn) {
        state.currentIndex = Number(pBtn.getAttribute("data-q-play"));
        startTrackItem(state.queue[state.currentIndex]);
      } else if (dBtn) {
        const idx = Number(dBtn.getAttribute("data-q-del"));
        state.queue.splice(idx, 1);
        if (idx === state.currentIndex) {
          if (state.queue.length > 0) {
            state.currentIndex = Math.min(idx, state.queue.length - 1);
            startTrackItem(state.queue[state.currentIndex]);
          } else {
            state.currentIndex = -1;
            stopAll();
          }
        } else if (idx < state.currentIndex) {
          state.currentIndex--;
        }
        renderQueueList();
      }
    });
  }

  return {
    init,
    playTrack,
    playQueue,
    addToQueue,
    togglePlayPause,
    stopAll,
    getState: () => state
  };
})();
