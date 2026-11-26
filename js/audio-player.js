/* ==========================================================================
   DFWol Studio — Lecteur Audio Pro & Épuré + File d'Attente + TTS Neuronal
   Filtre intelligent des références entre parenthèses et cotes (w24...)
   ========================================================================== */

window.DFWolAudio = (function () {
  "use strict";

  const VOICE_PREF_KEY = "dfwol_tts_voice_prefs_v2";
  const SKIP_REFS_KEY = "dfwol_tts_skip_refs_v1";
  const htmlAudio = new Audio();
  htmlAudio.preload = "auto";

  const VOICE_CATALOG = {
    fr: [
      { id: "fr-FR-DeniseNeural", label: "✨ Denise (IA Rapide & Naturelle)" },
      { id: "fr-FR-HenriNeural", label: "✨ Henri (IA Rapide & Posée)" },
      { id: "fr-FR-VivienneMultilingualNeural", label: "✨ Vivienne (IA Multilingue)" },
      { id: "fr-FR-RemyMultilingualNeural", label: "✨ Rémy (IA Multilingue)" },
      { id: "piper:fr_FR-siwis-medium", label: "🧠 Siwis (IA Hors-ligne)" },
      { id: "system", label: "📱 Voix Système / Native" }
    ],
    en: [
      { id: "en-US-AriaNeural", label: "✨ Aria (Fast Neural AI)" },
      { id: "en-US-EmmaMultilingualNeural", label: "✨ Emma (Multilingual AI)" },
      { id: "en-US-AndrewMultilingualNeural", label: "✨ Andrew (Multilingual AI)" },
      { id: "en-GB-SoniaNeural", label: "✨ Sonia (Neural UK)" },
      { id: "piper:en_US-lessac-medium", label: "🧠 Lessac (Offline AI)" },
      { id: "system", label: "📱 System / Native Voice" }
    ]
  };

  let voicePrefs = {
    fr: "fr-FR-DeniseNeural",
    en: "en-US-AriaNeural"
  };
  let skipRefsInTts = true;

  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_PREF_KEY) || "null");
    if (saved && saved.fr) voicePrefs.fr = saved.fr;
    if (saved && saved.en) voicePrefs.en = saved.en;
    const savedSkip = localStorage.getItem(SKIP_REFS_KEY);
    if (savedSkip !== null) skipRefsInTts = savedSkip === "1";
  } catch (_) {}

  const SVG_PLAY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l10.5-6.5z"/></svg>`;
  const SVG_PAUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z"/></svg>`;

  const state = {
    queue: [],
    currentIndex: -1,
    activeEngine: null, // 'mp3' | 'neural-mp3' | 'piper-wasm' | 'native-tts' | 'web-tts' | null
    isPlaying: false,
    isBuffering: false,
    rate: 1.0,
    ttsChunks: [],
    ttsChunkIndex: 0,
    ttsSessionId: 0,
    ttsCurrentTrack: null,
    ttsStopRequested: false,
    activeBlobUrl: null
  };

  const MAX_TTS_CACHE_ENTRIES = 48;
  const ttsAudioCache = new Map();
  const inFlightSynth = new Map();
  const prefetchedChunks = new Map();
  let nativeListenersBound = false;
  let activeNativeUtteranceResolve = null;
  let activeNativeUtteranceId = null;
  let piperModulePromise = null;
  let piperQueue = Promise.resolve();
  let uiBound = false;

  const sleepState = {
    mode: null, // null | 'end' | 'timer'
    endAt: 0,
    intervalId: null
  };

  function clearSleepTimer() {
    if (sleepState.intervalId) {
      clearInterval(sleepState.intervalId);
      sleepState.intervalId = null;
    }
    sleepState.mode = null;
    sleepState.endAt = 0;
    updateSleepBadge();
  }

  function updateSleepBadge() {
    const btn = document.getElementById("audio-btn-sleep");
    const lbl = document.getElementById("audio-sleep-label");
    if (!btn) return;
    const isActive = Boolean(sleepState.mode);
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
    if (!lbl) return;
    if (!sleepState.mode) {
      lbl.textContent = "Min.";
    } else if (sleepState.mode === "end") {
      lbl.textContent = "Fin";
    } else {
      const remSec = Math.max(0, Math.ceil((sleepState.endAt - Date.now()) / 1000));
      const m = Math.floor(remSec / 60);
      const s = remSec % 60;
      lbl.textContent = `${m}:${String(s).padStart(2, "0")}`;
    }
  }

  function setSleepTimer(minutesOrMode) {
    clearSleepTimer();
    if (!minutesOrMode || minutesOrMode === "off" || minutesOrMode === 0) {
      window.DFWolToast && window.DFWolToast("Minuteur de sommeil désactivé.");
      return getSleepTimerState();
    }
    if (minutesOrMode === "end") {
      sleepState.mode = "end";
      updateSleepBadge();
      window.DFWolToast && window.DFWolToast("Lecture s'arrêtera à la fin de la piste.");
      return getSleepTimerState();
    }
    const mins = Math.max(1, Number(minutesOrMode) || 15);
    sleepState.mode = "timer";
    sleepState.endAt = Date.now() + mins * 60000;
    updateSleepBadge();
    sleepState.intervalId = setInterval(() => {
      if (Date.now() >= sleepState.endAt) {
        clearSleepTimer();
        if (state.isPlaying) togglePlayPause();
        window.DFWolToast && window.DFWolToast("Minuteur de sommeil écoulé — lecture mise en pause.");
      } else {
        updateSleepBadge();
      }
    }, 1000);
    window.DFWolToast && window.DFWolToast(`Minuteur de sommeil activé (${mins} min).`);
    return getSleepTimerState();
  }

  function getSleepTimerState() {
    return Object.assign({}, sleepState);
  }

  function isNativeCap() {
    return Boolean(window.DFWolNet && window.DFWolNet.isNativeCapacitor && window.DFWolNet.isNativeCapacitor());
  }

  function getNeuralPlugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NeuralTts;
  }

  function getSelectedVoice(lang = "fr") {
    const l = lang === "en" ? "en" : "fr";
    return voicePrefs[l] || VOICE_CATALOG[l][0].id;
  }

  function setSelectedVoice(lang, voiceId) {
    const l = lang === "en" ? "en" : "fr";
    voicePrefs[l] = voiceId;
    try {
      localStorage.setItem(VOICE_PREF_KEY, JSON.stringify(voicePrefs));
    } catch (_) {}
  }

  function getSkipRefsEnabled() {
    return skipRefsInTts;
  }

  function setSkipRefsEnabled(enabled) {
    skipRefsInTts = Boolean(enabled);
    try {
      localStorage.setItem(SKIP_REFS_KEY, skipRefsInTts ? "1" : "0");
    } catch (_) {}
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function revokeBlobUrl(url) {
    if (url && String(url).startsWith("blob:")) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
  }

  function clearPrefetchCache() {
    prefetchedChunks.forEach((p) => {
      Promise.resolve(p)
        .then((res) => res && res.url && revokeBlobUrl(res.url))
        .catch(() => {});
    });
    prefetchedChunks.clear();
  }

  /**
   * Formate une liste de numéros de versets triés en prose naturelle (FR/EN).
   */
  function formatSpokenVerseList(verses, lang = "fr") {
    const sorted = Array.from(new Set(verses.filter((n) => Number.isInteger(n) && n > 0))).sort((a, b) => a - b);
    if (!sorted.length) return "";
    const isEn = lang === "en";
    const runs = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        runs.push([start, end]);
        start = sorted[i];
        end = sorted[i];
      }
    }
    runs.push([start, end]);

    const parts = runs.map(([s, e]) => {
      if (s === e) return String(s);
      if (e === s + 1 && runs.length === 1) return isEn ? `${s} and ${e}` : `${s} et ${e}`;
      return isEn ? `${s} to ${e}` : `${s} à ${e}`;
    });
    const joined =
      parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(", ")}${isEn ? " and " : " et "}${parts[parts.length - 1]}`;
    const prefix = sorted.length === 1 ? (isEn ? "verse " : "verset ") : isEn ? "verses " : "versets ";
    return prefix + joined;
  }

  /**
   * Convertit toute référence biblique ("Psaume 73:14", "Ps. 83:15-18", "Jude 5")
   * en forme parlée sans deux-points pour éviter la lecture anglaise de "XX:YY".
   */
  function formatScripturesForSpeech(rawText, lang = "fr") {
    const input = String(rawText || "");
    if (!input || !window.DFWolBible || !window.DFWolBible.SCRIPTURE_REGEX) return input;
    const bible = window.DFWolBible;
    const formatRefObj = (ref, omitBook = false) => {
      if (!ref || !ref.book) return "";
      let bookName = bible.getBookDisplayName(ref.book, lang);
      if (ref.book.num === 19 && ref.chapter) {
        bookName = bookName.replace(/^(Psaumes|Psalms)/, lang === "en" ? "Psalm" : "Psaume");
      }
      if (Array.isArray(ref.verses) && ref.verses.length > 0) {
        const spokenVerses = formatSpokenVerseList(ref.verses, lang);
        if (omitBook) return `${ref.chapter}, ${spokenVerses}`;
        return ref.book.chapters === 1 ? `${bookName}, ${spokenVerses}` : `${bookName} ${ref.chapter}, ${spokenVerses}`;
      }
      if (ref.chapterEnd && ref.chapterEnd > ref.chapter) {
        return lang === "en"
          ? `${bookName}, chapters ${ref.chapter} to ${ref.chapterEnd}`
          : `${bookName}, chapitres ${ref.chapter} à ${ref.chapterEnd}`;
      }
      return omitBook ? String(ref.chapter) : `${bookName} ${ref.chapter}`;
    };

    const re = new RegExp(bible.SCRIPTURE_REGEX.source, "gi");
    const chainTailRe = /^(\s*(?:;|,(?=\s*\d{1,3}\s*:))\s*)(\d{1,3}\s*:\s*\d{1,3}(?:\s*(?:[-–—]\s*\d{1,3}|,\s*\d{1,3}(?!\s*:)(?:\s*[-–—]\s*\d{1,3})?))*)\b/;
    const parts = [];
    let cursor = 0;
    let m;
    while ((m = re.exec(input)) !== null) {
      parts.push(input.slice(cursor, m.index));
      const refs = bible.parseScriptureReferences(m[0], lang);
      if (!refs || !refs.length) {
        parts.push(m[0]);
        cursor = re.lastIndex;
        continue;
      }
      parts.push(formatRefObj(refs[0], false));
      cursor = re.lastIndex;
      const rawBook = m[1];
      while (cursor < input.length) {
        const tm = chainTailRe.exec(input.slice(cursor));
        if (!tm) break;
        const subRefs = bible.parseScriptureReferences(`${rawBook} ${tm[2]}`, lang);
        if (!subRefs || !subRefs.length) break;
        parts.push(tm[1], formatRefObj(subRefs[0], true));
        cursor += tm[0].length;
        re.lastIndex = cursor;
      }
    }
    parts.push(input.slice(cursor));
    return parts.join("");
  }

  /**
   * Nettoie un texte avant la lecture TTS :
   * - Supprime les versets entre parenthèses (ex: "(Lm 3:22 ; w24.01 30 § 16)", "(Éph. 2:12 ; Col. 1:21)")
   * - Supprime les cotes de publications ("w24.01 30 § 16", "w25.12 26-30", "w07 1/6 11 § 4", "mwb26", etc.)
   * - Formate les références bibliques restantes pour une prononciation 100% naturelle dans la langue cible
   */
  function sanitizeTextForTts(rawText, lang = "fr") {
    let text = String(rawText || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (!skipRefsInTts) {
      return formatScripturesForSpeech(text, lang);
    }

    const isRefOrPubInsideParens = (inner) => {
      const s = inner.trim();
      if (!s) return true;
      // 1) Référence chiffrée chapitre:verset (ex: "Lm 3:22", "1 Cor. 3:9")
      if (/\b\d{1,3}\s*:\s*\d{1,3}\b/.test(s)) return true;
      // 2) Code revue/publication JW (w24.01, w25.12, wp, g24, mwb, km, yb...)
      if (/\b(?:w|wp|g|yb|mwb|km)\s*\d{2,4}(?:[.\-/]\d{1,2})?/i.test(s)) return true;
      // 3) Symbole paragraphe §
      if (/§/.test(s)) return true;
      // 4) Sigles de brochures/livres JW (th leçon 12, lmd leçon 5, it « ... », wcg chap. 18...)
      if (
        /\b(?:lmd|th|it|lff|wcg|cl|rr|kr|od|sjj|rsg|dx|bh|bhs|ia|jy|my|yc|hf|ypq)\b(?:\s*(?:le[çc]on|lesson|chap\.?|ch\.?|p\.?|§|«|“|"|\d))/i.test(
          s
        )
      ) {
        return true;
      }
      // 5) Livre biblique + numéro de chapitre sans verset (ex: "voir Romains 8", "Juges 7")
      if (window.DFWolBible && typeof window.DFWolBible.findBookByName === "function") {
        const cleanedLead = s.replace(/^(?:voir(?:\s+aussi)?|compare|cf\.?|see(?:\s+also)?|read|lire)\s+/i, "");
        const mBook = cleanedLead.match(/^((?:[1-3]\s*)?[A-Za-zÀ-ÖØ-öø-ÿ]{2,16})\.?\s+\d{1,3}\b/);
        if (mBook && window.DFWolBible.findBookByName(mBook[1])) {
          return true;
        }
      }
      return false;
    };

    // Supprimer les blocs parenthésés contenant versets ou cotes
    text = text.replace(/\(([^()]{1,260})\)/g, (full, inner) => (isRefOrPubInsideParens(inner) ? " " : full));

    // Supprimer les cotes d'articles hors parenthèses (ex: "w24.01 30 § 16", "w25.12 26-30", "w07 1/6 11 § 4")
    text = text.replace(
      /\b(?:w|wp|g|yb|mwb|km)\s*\d{2,4}(?:[.\-/]\d{1,2})?(?:\s+\d{1,3}(?:\s*[-–/,]\s*\d{1,3})*)?(?:\s*§+\s*\d+(?:\s*[-–,]\s*\d+)*)?/gi,
      " "
    );
    text = text.replace(/\b(?:wcg|lmd|th|lff)\s+(?:chap\.?|le[çc]on|lesson)\s+\d+(?:\s+id[ée]e\s+\d+)?/gi, " ");
    text = text.replace(/\b(?:it)\s+(?:«[^»]{1,60}»|“[^”]{1,60}”|"[^"]{1,60}")(?:\s*§+\s*\d+(?:[-–]\d+)?)?/gi, " ");
    text = text.replace(/§+\s*\d+(?:\s*[-–,]\s*\d+)*/g, " ");

    // Nettoyer la ponctuation résiduelle
    text = text
      .replace(/\(\s*\)/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/[;:]\s*([.!?])/g, "$1")
      .replace(/\.\s*\./g, ".")
      .replace(/\s{2,}/g, " ")
      .trim();

    return formatScripturesForSpeech(text, lang);
  }

  function splitClauseForFastStart(sentence, maxLen = 165) {
    if (sentence.length <= maxLen) return [sentence];
    const searchSlice = sentence.slice(0, maxLen);
    let splitIdx = -1;
    const sepRe = /[;:—–,]\s+/g;
    let m;
    while ((m = sepRe.exec(searchSlice)) !== null) {
      if (m.index >= 70) splitIdx = m.index + 1;
    }
    if (splitIdx === -1) {
      const lastSpace = searchSlice.lastIndexOf(" ");
      if (lastSpace >= 70) splitIdx = lastSpace;
    }
    if (splitIdx <= 0) return [sentence];
    return [sentence.slice(0, splitIdx).trim(), sentence.slice(splitIdx).trim()];
  }

  /**
   * Découpe progressif "Fast-Start" :
   * - Chunk 0 <= 150 car. (démarrage quasi-instantané)
   * - Chunk 1 <= 260 car.
   * - Chunks 2+ <= 420 car.
   */
  function buildTtsChunks(paragraphsOrText, lang = "fr") {
    const chunks = [];
    const rawParas = Array.isArray(paragraphsOrText)
      ? paragraphsOrText.map((p, idx) =>
          typeof p === "string" ? { text: p, pid: null, pIdx: idx } : { text: p.text, pid: p.pid || null, pIdx: idx }
        )
      : String(paragraphsOrText || "")
          .split(/\n+/)
          .map((t, idx) => ({ text: t, pid: null, pIdx: idx }));

    const getLimit = () => (chunks.length === 0 ? 150 : chunks.length === 1 ? 260 : 420);

    rawParas.forEach((p) => {
      const clean = sanitizeTextForTts(p.text || "", lang);
      if (!clean || /^[,.;:!?—–-]+$/.test(clean)) return;
      const rawSentences = clean.match(/[^.!?…]+[.!?…]*\s*/g) || [clean];
      const pieces = [];
      rawSentences.forEach((s) => {
        if (chunks.length === 0 && pieces.length === 0 && s.trim().length > 185) {
          splitClauseForFastStart(s.trim(), 165).forEach((part) => part && pieces.push(part + " "));
        } else {
          pieces.push(s);
        }
      });

      let buffer = "";
      pieces.forEach((sent) => {
        const limit = getLimit();
        if ((buffer + sent).length > limit && buffer.trim()) {
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

  function getCachedAudio(cacheKey) {
    const hit = ttsAudioCache.get(cacheKey);
    if (!hit) return null;
    ttsAudioCache.delete(cacheKey);
    ttsAudioCache.set(cacheKey, hit);
    return hit;
  }

  function storeCachedAudio(cacheKey, blob, engine, engineLabel) {
    if (!blob || blob.size <= 100) return;
    if (ttsAudioCache.has(cacheKey)) ttsAudioCache.delete(cacheKey);
    ttsAudioCache.set(cacheKey, { blob, engine, engineLabel });
    if (ttsAudioCache.size > MAX_TTS_CACHE_ENTRIES) {
      const oldestKey = ttsAudioCache.keys().next().value;
      if (oldestKey !== undefined) ttsAudioCache.delete(oldestKey);
    }
  }

  function base64ToBlob(b64, mimeType = "audio/mpeg") {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  function getTtsEndpointBase() {
    if (window.DFWolNet && window.DFWolNet.isLocalServerProxyAvailable()) {
      return "/api/tts";
    }
    const custom = window.DFWolNet ? window.DFWolNet.getCustomProxyBase() : "";
    if (custom) {
      try {
        const u = new URL(custom);
        return `${u.origin}/api/tts`;
      } catch (_) {}
    }
    return null;
  }

  async function synthesizeViaPiper(text, piperVoiceId) {
    if (!piperModulePromise) {
      window.DFWolToast && window.DFWolToast("Chargement du modèle vocal IA local (première utilisation)…");
      piperModulePromise = import("https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web/+esm").catch((err) => {
        piperModulePromise = null;
        throw err;
      });
    }
    const runTask = async () => {
      const tts = await piperModulePromise;
      const wavBlob = await tts.predict({ text, voiceId: piperVoiceId });
      return {
        blob: wavBlob,
        engine: "piper-wasm",
        engineLabel: "IA Locale"
      };
    };
    const next = piperQueue.then(runTask, runTask);
    piperQueue = next.then(() => {}, () => {});
    return next;
  }

  async function synthesizeChunkAudio(text, lang, voiceId) {
    const cleanText = String(text || "").trim();
    if (!cleanText || voiceId === "system") return null;

    const cacheKey = `${voiceId}|${lang}|${cleanText}`;
    const cached = getCachedAudio(cacheKey);
    if (cached) {
      return {
        url: URL.createObjectURL(cached.blob),
        engine: cached.engine,
        engineLabel: cached.engineLabel,
        fromCache: true
      };
    }

    if (inFlightSynth.has(cacheKey)) {
      const entry = await inFlightSynth.get(cacheKey);
      if (!entry) return null;
      return {
        url: URL.createObjectURL(entry.blob),
        engine: entry.engine,
        engineLabel: entry.engineLabel
      };
    }

    const work = (async () => {
      if (voiceId.startsWith("piper:")) {
        const pid = voiceId.slice(6);
        const res = await synthesizeViaPiper(cleanText, pid);
        if (res && res.blob) storeCachedAudio(cacheKey, res.blob, res.engine, res.engineLabel);
        return res;
      }

      const plugin = getNeuralPlugin();
      if (plugin && typeof plugin.synthesizeEdgeNeural === "function") {
        try {
          const res = await plugin.synthesizeEdgeNeural({
            text: cleanText,
            voice: voiceId,
            lang,
            rate: 1.0
          });
          if (res && res.audioBase64) {
            const blob = base64ToBlob(res.audioBase64, res.mimeType || "audio/mpeg");
            storeCachedAudio(cacheKey, blob, "neural-mp3", "IA Neuronale");
            return { blob, engine: "neural-mp3", engineLabel: "IA Neuronale" };
          }
        } catch (_) {}
      }

      const endpoint = getTtsEndpointBase();
      if (endpoint) {
        try {
          const url = `${endpoint}?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(voiceId)}&lang=${encodeURIComponent(lang)}&rate=1`;
          const resp = await fetch(url);
          if (resp.ok) {
            const ct = resp.headers.get("Content-Type") || "";
            if (ct.includes("audio")) {
              const blob = await resp.blob();
              if (blob.size > 100) {
                storeCachedAudio(cacheKey, blob, "neural-mp3", "IA Neuronale");
                return { blob, engine: "neural-mp3", engineLabel: "IA Neuronale" };
              }
            }
          }
        } catch (_) {}
      }

      if (!isNativeCap()) {
        try {
          const fallbackPiper = lang === "en" ? "en_US-lessac-medium" : "fr_FR-siwis-medium";
          const res = await synthesizeViaPiper(cleanText, fallbackPiper);
          if (res && res.blob) storeCachedAudio(cacheKey, res.blob, res.engine, res.engineLabel);
          return res;
        } catch (_) {}
      }

      return null;
    })();

    inFlightSynth.set(cacheKey, work);
    try {
      const entry = await work;
      if (!entry || !entry.blob) return null;
      return {
        url: URL.createObjectURL(entry.blob),
        engine: entry.engine,
        engineLabel: entry.engineLabel
      };
    } finally {
      inFlightSynth.delete(cacheKey);
    }
  }

  function getOrPrefetchChunk(index, lang, voiceId, sessionId) {
    if (index < 0 || index >= state.ttsChunks.length) return null;
    const key = `${sessionId}:${index}:${voiceId}`;
    if (prefetchedChunks.has(key)) {
      return prefetchedChunks.get(key);
    }
    const chunk = state.ttsChunks[index];
    const p = synthesizeChunkAudio(chunk.text, lang, voiceId).catch(() => null);
    prefetchedChunks.set(key, p);
    return p;
  }

  function bindNativeTtsListeners() {
    if (nativeListenersBound) return;
    const plugin = getNeuralPlugin();
    if (!plugin || typeof plugin.addListener !== "function") return;
    nativeListenersBound = true;

    plugin.addListener("nativeTtsDone", (data) => {
      if (data && data.utteranceId === activeNativeUtteranceId && activeNativeUtteranceResolve) {
        const fn = activeNativeUtteranceResolve;
        activeNativeUtteranceResolve = null;
        fn("done");
      }
    });
    plugin.addListener("nativeTtsError", (data) => {
      if (data && data.utteranceId === activeNativeUtteranceId && activeNativeUtteranceResolve) {
        const fn = activeNativeUtteranceResolve;
        activeNativeUtteranceResolve = null;
        fn("error");
      }
    });
  }

  function pickWebVoice(lang = "fr") {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const prefix = lang === "en" ? "en" : "fr";
    return (
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix) && /online|natural|neural|google|vivienne|denise|henri|emma|aria/i.test(v.name)) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
      null
    );
  }

  function speakChunkViaSystemTts(text, lang, sessionId) {
    return new Promise(async (resolve) => {
      const plugin = getNeuralPlugin();
      if (plugin && typeof plugin.speakNative === "function") {
        bindNativeTtsListeners();
        const uttId = `dfwol-${sessionId}-${Date.now()}`;
        activeNativeUtteranceId = uttId;
        state.activeEngine = "native-tts";
        state.isPlaying = true;
        updatePlayerUI();

        const donePromise = new Promise((resDone) => {
          activeNativeUtteranceResolve = resDone;
          setTimeout(() => {
            if (activeNativeUtteranceId === uttId && activeNativeUtteranceResolve) {
              activeNativeUtteranceResolve = null;
              resDone("timeout");
            }
          }, 45000);
        });

        try {
          await plugin.speakNative({
            text,
            lang,
            rate: state.rate,
            utteranceId: uttId
          });
          await donePromise;
          resolve(true);
          return;
        } catch (_) {
          activeNativeUtteranceResolve = null;
        }
      }

      if ("speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
          const utt = new SpeechSynthesisUtterance(text);
          utt.lang = lang === "en" ? "en-US" : "fr-FR";
          const voice = pickWebVoice(lang);
          if (voice) utt.voice = voice;
          utt.rate = state.rate;
          state.activeEngine = "web-tts";
          state.isPlaying = true;
          updatePlayerUI();

          utt.onend = () => resolve(true);
          utt.onerror = () => resolve(true);
          window.speechSynthesis.speak(utt);
          return;
        } catch (_) {}
      }

      window.DFWolToast && window.DFWolToast("Aucune synthèse vocale disponible sur cet appareil.");
      resolve(false);
    });
  }

  function stopTtsInternal() {
    state.ttsStopRequested = true;
    state.ttsSessionId++;
    activeNativeUtteranceId = null;
    if (activeNativeUtteranceResolve) {
      const fn = activeNativeUtteranceResolve;
      activeNativeUtteranceResolve = null;
      fn("stopped");
    }
    const plugin = getNeuralPlugin();
    if (plugin && typeof plugin.stopNative === "function") {
      plugin.stopNative().catch(() => {});
    }
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    clearPrefetchCache();
    clearArticleHighlights();
  }

  function stopMp3Internal() {
    try {
      htmlAudio.pause();
      htmlAudio.removeAttribute("src");
      htmlAudio.load();
    } catch (_) {}
    if (state.activeBlobUrl) {
      revokeBlobUrl(state.activeBlobUrl);
      state.activeBlobUrl = null;
    }
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

  async function speakChunkAt(index) {
    const mySession = state.ttsSessionId;
    if (state.ttsStopRequested) return;
    if (index >= state.ttsChunks.length) {
      state.isPlaying = false;
      clearArticleHighlights();
      playNextInQueue();
      return;
    }

    state.ttsChunkIndex = index;
    const chunk = state.ttsChunks[index];
    const lang = (state.ttsCurrentTrack && state.ttsCurrentTrack.lang) || "fr";
    const voiceId = getSelectedVoice(lang);
    highlightParagraph(chunk);

    state.isPlaying = true;
    state.isBuffering = voiceId !== "system";
    state.activeEngine = voiceId === "system" ? (isNativeCap() ? "native-tts" : "web-tts") : "neural-mp3";
    updatePlayerUI();

    const audioRes = voiceId !== "system" ? await getOrPrefetchChunk(index, lang, voiceId, mySession) : null;
    if (state.ttsStopRequested || mySession !== state.ttsSessionId) {
      state.isBuffering = false;
      return;
    }
    state.isBuffering = false;

    if (audioRes && audioRes.url) {
      stopMp3Internal();
      state.activeBlobUrl = audioRes.url;
      state.activeEngine = audioRes.engine || "neural-mp3";
      htmlAudio.src = audioRes.url;
      htmlAudio.playbackRate = state.rate;
      updatePlayerUI();

      try {
        await htmlAudio.play();
        state.isPlaying = true;
        updatePlayerUI();

        if (audioRes.engine === "neural-mp3") {
          if (index + 1 < state.ttsChunks.length) getOrPrefetchChunk(index + 1, lang, voiceId, mySession);
          if (index + 2 < state.ttsChunks.length) getOrPrefetchChunk(index + 2, lang, voiceId, mySession);
        } else if (audioRes.engine === "piper-wasm" && index + 1 < state.ttsChunks.length) {
          setTimeout(() => {
            if (!state.ttsStopRequested && mySession === state.ttsSessionId) {
              getOrPrefetchChunk(index + 1, lang, voiceId, mySession);
            }
          }, 120);
        }
        return;
      } catch (_) {
        stopMp3Internal();
      }
    }

    updatePlayerUI();
    const ok = await speakChunkViaSystemTts(chunk.text, lang, mySession);
    if (!state.ttsStopRequested && mySession === state.ttsSessionId && ok) {
      speakChunkAt(index + 1);
    }
  }

  function prewarmText(paragraphsOrText, lang = "fr") {
    const voiceId = getSelectedVoice(lang);
    if (!voiceId || voiceId === "system" || voiceId.startsWith("piper:")) return;
    const hasEdge = Boolean(getNeuralPlugin()?.synthesizeEdgeNeural || getTtsEndpointBase());
    if (!hasEdge) return;
    const chunks = buildTtsChunks(paragraphsOrText, lang);
    if (!chunks.length) return;
    synthesizeChunkAudio(chunks[0].text, lang, voiceId)
      .then((res) => {
        if (res && res.url) revokeBlobUrl(res.url);
      })
      .catch(() => {});
  }

  function updateMediaSession(track) {
    if ("mediaSession" in navigator && track) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title || "DFWol Audio",
          artist: track.subtitle || "JW.org / WOL",
          album: "DFWol"
        });
        navigator.mediaSession.setActionHandler("play", () => togglePlayPause());
        navigator.mediaSession.setActionHandler("pause", () => togglePlayPause());
        navigator.mediaSession.setActionHandler("previoustrack", () => playPrevInQueue());
        navigator.mediaSession.setActionHandler("nexttrack", () => playNextInQueue());
      } catch (_) {}
    }
  }

  function populateVoiceSelector(lang = "fr") {
    const l = lang === "en" ? "en" : "fr";
    const list = VOICE_CATALOG[l];
    const current = getSelectedVoice(l);
    const optsHtml = list
      .map((v) => `<option value="${v.id}" ${v.id === current ? "selected" : ""}>${v.label}</option>`)
      .join("");

    ["audio-voice-select", "settings-voice-select"].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = optsHtml;
    });
  }

  async function startTrackItem(item) {
    stopTtsInternal();
    stopMp3Internal();

    if (!item) {
      state.activeEngine = null;
      state.isPlaying = false;
      updatePlayerUI();
      return;
    }

    const lang = item.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    populateVoiceSelector(lang);
    showAudioBar();
    setBarStatus(item.title, `${item.subtitle || "Chargement…"}`);

    let resolvedUrl = item.audioUrl || null;
    let resolvedText = item.text || item.paragraphs || null;
    let resolvedTitle = item.title || "Lecture Audio";
    let resolvedSubtitle = item.subtitle || "";

    if (!resolvedUrl && (!resolvedText || resolvedText.length === 0) && item.wolUrl && window.DFWolReader) {
      try {
        setBarStatus(resolvedTitle, "Récupération de l'article…");
        const parsed = await window.DFWolReader.fetchArticleParsed(item.wolUrl);
        resolvedTitle = parsed.title || resolvedTitle;
        resolvedSubtitle = parsed.citation || resolvedSubtitle;
        resolvedText = parsed.paragraphs.length ? parsed.paragraphs : parsed.plainText;

        if (parsed.docId && window.DFWolNet && item.mode !== "tts") {
          const mp3Track = await window.DFWolNet.getArticleAudioByDocId(parsed.docId, lang);
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
        const mp3Track = await window.DFWolNet.getArticleAudioByDocId(item.docId, lang);
        if (mp3Track && mp3Track.file && mp3Track.file.url) {
          resolvedUrl = mp3Track.file.url;
        }
      } catch (_) {}
    }

    item.title = resolvedTitle;
    item.subtitle = resolvedSubtitle;
    item.lang = lang;

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

    if (resolvedText) {
      state.ttsStopRequested = false;
      state.ttsCurrentTrack = item;
      state.ttsChunks = buildTtsChunks(resolvedText, lang);
      if (state.ttsChunks.length === 0) {
        playNextInQueue();
        return;
      }
      state.ttsSessionId++;
      speakChunkAt(0);
      updateMediaSession(item);
      updatePlayerUI();
    } else {
      window.DFWolToast && window.DFWolToast("Aucun contenu audio ou texte disponible.");
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
    if (sleepState.mode === "end") {
      clearSleepTimer();
      stopAll();
      window.DFWolToast && window.DFWolToast("Minuteur « Fin de piste » terminé.");
      return;
    }
    if (state.currentIndex + 1 < state.queue.length) {
      state.currentIndex++;
      renderQueueList();
      startTrackItem(state.queue[state.currentIndex]);
    } else {
      stopAll();
    }
  }

  function playFromParagraph(pid, articleData = null) {
    const art = articleData || (window.DFWolReader && window.DFWolReader.getCurrentArticleData && window.DFWolReader.getCurrentArticleData());
    if (!art || !Array.isArray(art.paragraphs) || !art.paragraphs.length) return false;
    const startIdx = art.paragraphs.findIndex((p) => String(p.pid) === String(pid));
    const slice = startIdx >= 0 ? art.paragraphs.slice(startIdx) : art.paragraphs;
    playTrack({
      title: art.title || "Lecture vocale",
      subtitle: startIdx > 0 ? `À partir du § ${startIdx + 1}` : art.citation || "Article WOL",
      paragraphs: slice,
      lang: art.lang || "fr",
      mode: "tts"
    });
    return true;
  }

  function playPrevInQueue() {
    if (state.activeEngine === "mp3" && htmlAudio.currentTime > 5) {
      htmlAudio.currentTime = 0;
      return;
    }
    if (isTtsMode() && state.ttsChunkIndex > 0) {
      const targetIdx = state.ttsChunkIndex - 1;
      stopTtsInternal();
      stopMp3Internal();
      state.ttsStopRequested = false;
      state.ttsSessionId++;
      speakChunkAt(targetIdx);
      return;
    }
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderQueueList();
      startTrackItem(state.queue[state.currentIndex]);
    }
  }

  function isTtsMode() {
    return (
      state.activeEngine === "neural-mp3" ||
      state.activeEngine === "piper-wasm" ||
      state.activeEngine === "native-tts" ||
      state.activeEngine === "web-tts"
    );
  }

  function togglePlayPause() {
    if (state.activeEngine === "mp3" || ((state.activeEngine === "neural-mp3" || state.activeEngine === "piper-wasm") && htmlAudio.src)) {
      if (htmlAudio.paused) {
        htmlAudio
          .play()
          .then(() => {
            state.isPlaying = true;
            updatePlayerUI();
          })
          .catch(() => {});
      } else {
        htmlAudio.pause();
        state.isPlaying = false;
        updatePlayerUI();
      }
    } else if (isTtsMode()) {
      if (state.isPlaying) {
        state.ttsStopRequested = true;
        state.ttsSessionId++;
        const plugin = getNeuralPlugin();
        if (plugin && typeof plugin.stopNative === "function") plugin.stopNative().catch(() => {});
        if ("speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
          } catch (_) {}
        }
        htmlAudio.pause();
        state.isPlaying = false;
        updatePlayerUI();
      } else {
        state.ttsStopRequested = false;
        state.ttsSessionId++;
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
    } else if (isTtsMode()) {
      const step = seconds > 0 ? 1 : -1;
      const targetIdx = Math.max(0, Math.min(state.ttsChunks.length - 1, state.ttsChunkIndex + step));
      stopTtsInternal();
      stopMp3Internal();
      state.ttsStopRequested = false;
      state.ttsSessionId++;
      speakChunkAt(targetIdx);
    }
  }

  function cycleRate() {
    const rates = [0.85, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0];
    const idx = rates.indexOf(state.rate);
    state.rate = rates[(idx + 1) % rates.length];
    if (state.activeEngine === "mp3" || ((state.activeEngine === "neural-mp3" || state.activeEngine === "piper-wasm") && htmlAudio.src)) {
      htmlAudio.playbackRate = state.rate;
    } else if ((state.activeEngine === "native-tts" || state.activeEngine === "web-tts") && state.isPlaying) {
      const curIdx = state.ttsChunkIndex;
      stopTtsInternal();
      state.ttsStopRequested = false;
      state.ttsSessionId++;
      speakChunkAt(curIdx);
    }
    updatePlayerUI();
  }

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
    const popover = document.getElementById("audio-voice-popover");
    if (bar) bar.classList.add("hidden");
    if (drawer) drawer.classList.add("hidden");
    if (popover) popover.classList.add("hidden");
    document.body.classList.remove("has-audio-bar");
  }

  function setBarStatus(title, subtitle) {
    const tEl = document.getElementById("audio-bar-title");
    const sEl = document.getElementById("audio-bar-sub");
    if (tEl) tEl.textContent = title || "Lecteur Audio";
    if (sEl) sEl.textContent = subtitle || "";
  }

  function updateTimeProgressOnly() {
    const progressEl = document.getElementById("audio-progress-range");
    const timeEl = document.getElementById("audio-time-label");
    if (state.activeEngine === "mp3") {
      const dur = htmlAudio.duration || 0;
      const curT = htmlAudio.currentTime || 0;
      if (progressEl) {
        progressEl.max = dur > 0 ? Math.floor(dur) : 100;
        progressEl.value = dur > 0 ? Math.floor(curT) : 0;
        const pct = dur > 0 ? Math.min(100, Math.round((curT / dur) * 100)) : 0;
        progressEl.style.setProperty("--progress-pct", `${pct}%`);
      }
      if (timeEl) timeEl.textContent = `${formatTime(curT)} / ${formatTime(dur)}`;
    } else if (isTtsMode()) {
      const total = Math.max(1, state.ttsChunks.length);
      if (progressEl) {
        progressEl.max = Math.max(0, total - 1);
        progressEl.value = state.ttsChunkIndex;
        const pct = total > 1 ? Math.round((state.ttsChunkIndex / (total - 1)) * 100) : state.isBuffering ? 0 : 100;
        progressEl.style.setProperty("--progress-pct", `${pct}%`);
      }
      if (timeEl) timeEl.textContent = `${state.ttsChunkIndex + 1}/${total}`;
    }
  }

  function updatePlayerUI() {
    const cur = state.queue[state.currentIndex];
    const titleEl = document.getElementById("audio-bar-title");
    const subEl = document.getElementById("audio-bar-sub");
    const playBtn = document.getElementById("audio-btn-play");
    const rateBtn = document.getElementById("audio-btn-rate");
    const badgeEl = document.getElementById("audio-engine-badge");
    const queueCountEl = document.getElementById("audio-queue-count");
    const dlBtn = document.getElementById("audio-btn-download");

    if (dlBtn) {
      dlBtn.classList.toggle("hidden", !(state.activeEngine === "mp3" && cur && cur.audioUrl));
    }

    const engineNames = {
      mp3: "MP3",
      "neural-mp3": "IA",
      "piper-wasm": "IA",
      "native-tts": "Natif",
      "web-tts": "TTS"
    };

    if (cur) {
      if (titleEl) titleEl.textContent = cur.title || "Audio";
      if (subEl) {
        subEl.textContent = state.isBuffering && isTtsMode() ? "⏳ Préparation vocale…" : cur.subtitle || engineNames[state.activeEngine] || "Lecture";
      }
    }

    if (playBtn) playBtn.innerHTML = state.isPlaying ? SVG_PAUSE : SVG_PLAY;
    if (rateBtn) rateBtn.textContent = `${state.rate}×`;
    if (badgeEl) badgeEl.textContent = state.isBuffering && isTtsMode() ? "⏳" : engineNames[state.activeEngine] || "Prêt";
    if (queueCountEl) queueCountEl.textContent = String(state.queue.length);
    const barEl = document.getElementById("global-audio-bar");
    if (barEl) barEl.classList.toggle("is-playing", Boolean(state.isPlaying && !state.isBuffering));

    updateTimeProgressOnly();
    updateSleepBadge();
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
                <small>${window.DFWolSearch ? window.DFWolSearch.escapeHtml(item.subtitle || (item.audioUrl ? "MP3" : "Voix IA / MP3")) : ""}</small>
              </div>
            </button>
            <button type="button" class="btn-icon-xs" data-q-del="${idx}" title="Retirer">✕</button>
          </div>
        `;
      })
      .join("");
  }

  function onVoiceChange(newVoiceId) {
    const lang = (state.ttsCurrentTrack && state.ttsCurrentTrack.lang) || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    setSelectedVoice(lang, newVoiceId);
    populateVoiceSelector(lang);
    clearPrefetchCache();
    if (isTtsMode() && state.isPlaying) {
      const curIdx = state.ttsChunkIndex;
      stopTtsInternal();
      stopMp3Internal();
      state.ttsStopRequested = false;
      state.ttsSessionId++;
      speakChunkAt(curIdx);
    }
  }

  function init() {
    if (uiBound) return;
    uiBound = true;

    populateVoiceSelector(window.DFWolGetLang ? window.DFWolGetLang() : "fr");

    htmlAudio.addEventListener("timeupdate", () => {
      if (state.activeEngine === "mp3") updateTimeProgressOnly();
    });
    htmlAudio.addEventListener("ended", () => {
      if (state.activeEngine === "mp3") {
        playNextInQueue();
      } else if (isTtsMode() && !state.ttsStopRequested) {
        speakChunkAt(state.ttsChunkIndex + 1);
      }
    });
    htmlAudio.addEventListener("error", () => {
      if (state.activeEngine === "mp3") {
        const cur = state.queue[state.currentIndex];
        if (cur && (cur.text || cur.paragraphs)) {
          cur.mode = "tts";
          startTrackItem(cur);
        } else {
          playNextInQueue();
        }
      } else if (isTtsMode() && !state.ttsStopRequested) {
        speakChunkAt(state.ttsChunkIndex + 1);
      }
    });

    document.getElementById("audio-voice-select")?.addEventListener("change", (e) => {
      onVoiceChange(e.target.value);
      document.getElementById("audio-voice-popover")?.classList.add("hidden");
    });
    document.getElementById("settings-voice-select")?.addEventListener("change", (e) => {
      onVoiceChange(e.target.value);
    });

    document.getElementById("audio-btn-voice-toggle")?.addEventListener("click", () => {
      document.getElementById("audio-voice-popover")?.classList.toggle("hidden");
    });

    document.getElementById("audio-btn-play")?.addEventListener("click", togglePlayPause);
    document.getElementById("audio-btn-prev")?.addEventListener("click", playPrevInQueue);
    document.getElementById("audio-btn-next")?.addEventListener("click", playNextInQueue);
    document.getElementById("audio-btn-back15")?.addEventListener("click", () => seekDelta(-15));
    document.getElementById("audio-btn-fwd15")?.addEventListener("click", () => seekDelta(15));
    document.getElementById("audio-btn-rate")?.addEventListener("click", cycleRate);
    document.getElementById("audio-btn-download")?.addEventListener("click", () => {
      const cur = state.queue[state.currentIndex];
      if (cur && cur.audioUrl && window.DFWolExport) {
        window.DFWolExport.downloadAudioTrack(cur.audioUrl, cur.title, cur.subtitle || "");
      }
    });
    document.getElementById("audio-btn-close")?.addEventListener("click", hideAudioBar);

    document.getElementById("audio-btn-queue")?.addEventListener("click", () => {
      document.getElementById("audio-voice-popover")?.classList.add("hidden");
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

    const progRange = document.getElementById("audio-progress-range");
    progRange?.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      if (state.activeEngine === "mp3") {
        htmlAudio.currentTime = val;
      } else if (isTtsMode()) {
        const total = Math.max(1, state.ttsChunks.length);
        const pct = total > 1 ? Math.round((val / (total - 1)) * 100) : 0;
        progRange.style.setProperty("--progress-pct", `${pct}%`);
      }
    });
    progRange?.addEventListener("change", (e) => {
      if (!isTtsMode()) return;
      const val = Number(e.target.value);
      stopTtsInternal();
      stopMp3Internal();
      state.ttsStopRequested = false;
      state.ttsSessionId++;
      speakChunkAt(val);
    });

    document.getElementById("audio-btn-sleep")?.addEventListener("click", (e) => {
      if (window.DFWolStudy && typeof window.DFWolStudy.openContextMenu === "function") {
        const rect = e.currentTarget.getBoundingClientRect();
        window.DFWolStudy.openContextMenu(rect.left, rect.top - 10, [
          { label: "🌙 15 minutes", onClick: () => setSleepTimer(15) },
          { label: "🌙 30 minutes", onClick: () => setSleepTimer(30) },
          { label: "🌙 45 minutes", onClick: () => setSleepTimer(45) },
          { label: "🌙 60 minutes", onClick: () => setSleepTimer(60) },
          { label: "⏭️ Fin de la piste", onClick: () => setSleepTimer("end") },
          { label: "✕ Désactiver le minuteur", onClick: () => setSleepTimer(0) }
        ], { anchorTop: true });
      } else {
        const nextMins = sleepState.mode === "timer" ? 0 : 30;
        setSleepTimer(nextMins);
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
    populateVoiceSelector,
    sanitizeTextForTts,
    formatScripturesForSpeech,
    buildTtsChunks,
    prewarmText,
    playFromParagraph,
    setSleepTimer,
    getSleepTimerState,
    getSkipRefsEnabled,
    setSkipRefsEnabled,
    getSelectedVoice,
    getCurrentTrack: () => state.queue[state.currentIndex] || null,
    getState: () => state
  };
})();
