/* ==========================================================================
   DFWol Studio — Assistant IA 1-Clic (BYOK : Clé API fournie par l'utilisateur)
   Prépare tout le contenu nécessaire en 1 clic : Question + Versets complets
   (multi-versets inclus) + Articles du Guide de recherche / Publication
   ========================================================================== */

window.DFWolAI = (function () {
  "use strict";

  const AI_CONFIG_KEY = "dfwol_ai_config_v1";

  const PROVIDER_PRESETS = {
    gemini: {
      label: "Google Gemini",
      defaultModel: "gemini-2.5-flash",
      models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
      keyHint: "Clé AIza… (Google AI Studio)"
    },
    openai: {
      label: "OpenAI",
      defaultModel: "gpt-4o-mini",
      models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
      keyHint: "Clé sk-…"
    },
    openrouter: {
      label: "OpenRouter",
      defaultModel: "google/gemini-2.5-flash",
      models: [
        "google/gemini-2.5-flash",
        "anthropic/claude-3.5-sonnet",
        "openai/gpt-4o-mini",
        "meta-llama/llama-3.3-70b-instruct:free"
      ],
      keyHint: "Clé sk-or-…"
    },
    groq: {
      label: "Groq (Ultra rapide)",
      defaultModel: "llama-3.3-70b-versatile",
      models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      keyHint: "Clé gsk_…"
    },
    anthropic: {
      label: "Anthropic Claude",
      defaultModel: "claude-3-5-sonnet-latest",
      models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
      keyHint: "Clé sk-ant-…"
    },
    custom: {
      label: "Endpoint Compatible OpenAI",
      defaultModel: "mistral-small-latest",
      models: [],
      keyHint: "Clé API du fournisseur (ou vide si Ollama local)"
    }
  };

  const STYLE_INSTRUCTIONS = {
    meeting_short: {
      label: "Commentaire réunion (30 sec)",
      fr: "Formule une réponse claire, naturelle et chaleureuse pour une réunion chrétienne (2 à 4 phrases, ~30 secondes à l'oral), appuyée directement sur les paragraphes et les versets fournis.",
      en: "Write a clear, natural, warm congregation meeting comment (2 to 4 sentences, ~30 seconds spoken), grounded directly in the provided paragraphs and scriptures."
    },
    deep_study: {
      label: "Étude biblique approfondie",
      fr: "Fais une explication biblique structurée et précise en t'appuyant uniquement sur les versets et articles fournis : 1) Idée principale, 2) Analyse des versets cités, 3) Points tirés des articles, 4) Application pratique.",
      en: "Provide a structured, accurate Bible study explanation based strictly on the provided scriptures and articles: 1) Main idea, 2) Scripture analysis, 3) Key points from the articles, 4) Practical application."
    },
    gems_bullets: {
      label: "Perles spirituelles / Points clés",
      fr: "Résume en 3 à 5 puces courtes et percutantes les leçons spirituelles et l'application pratique tirées des versets et des articles.",
      en: "Summarize in 3 to 5 concise, impactful bullet points the spiritual lessons and practical applications from the scriptures and articles."
    },
    custom: {
      label: "Libre / Personnalisé",
      fr: "Réponds avec précision et clarté à la question en citant les références bibliques pertinentes issues du dossier fourni.",
      en: "Answer the question clearly and accurately, citing relevant scripture references from the provided context."
    }
  };

  const defaultConfig = {
    provider: "gemini",
    apiKey: "",
    model: "gemini-2.5-flash",
    endpointUrl: "",
    responseStyle: "meeting_short",
    customSystemPrompt: "",
    maxRsgArticles: 4,
    autoRunWithKey: true
  };

  let config = loadConfig();
  let currentBundle = null;
  let conversation = []; // [{ role: 'user'|'assistant', text: string }]
  let isGenerating = false;
  let uiBound = false;

  function loadConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || "null");
      return Object.assign({}, defaultConfig, raw || {});
    } catch (_) {
      return Object.assign({}, defaultConfig);
    }
  }

  function saveConfig(partial = {}) {
    config = Object.assign({}, config, partial);
    try {
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    } catch (_) {}
  }

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
  // 1. Préparateur Automatique de Contenu en 1 Clic
  // ==========================================================================

  async function prepareBundle(params = {}, onProgress = null) {
    const lang = params.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const styleKey = params.style || config.responseStyle || "meeting_short";
    const styleObj = STYLE_INSTRUCTIONS[styleKey] || STYLE_INSTRUCTIONS.meeting_short;

    if (onProgress) onProgress("Analyse de la question et des références…");

    // 1. Question formulée
    let question = cleanStr(params.question || "");
    if (!question && params.refsLabel) {
      question =
        lang === "en"
          ? `Explain ${params.refsLabel} and highlight its main spiritual lessons.`
          : `Explique ${params.refsLabel} et dégage les principales leçons spirituelles et pratiques.`;
    } else if (!question && params.title) {
      question =
        lang === "en"
          ? `Summarize the key points and scriptural basis of "${params.title}".`
          : `Résume les points clés et le fondement biblique de « ${params.title} ».`;
    }

    // 2. Collecter toutes les références bibliques (multi-versets inclus)
    const refsMap = new Map();
    const addRefsFromText = (txt) => {
      if (!txt || !window.DFWolBible) return;
      window.DFWolBible.parseScriptureReferences(String(txt), lang).forEach((r) => {
        const key = `${r.bookNum}:${r.chapter}:${r.verseSpecCompact || r.verseStart || 1}`;
        if (!refsMap.has(key)) refsMap.set(key, r);
      });
    };

    if (Array.isArray(params.explicitRefs)) {
      params.explicitRefs.forEach((r) => {
        if (r && r.bookNum && r.chapter) {
          const key = `${r.bookNum}:${r.chapter}:${r.verseSpecCompact || r.verseStart || 1}`;
          if (!refsMap.has(key)) refsMap.set(key, r);
        }
      });
    }
    addRefsFromText(params.refsText || "");
    addRefsFromText(question);
    addRefsFromText(params.contextText || "");
    addRefsFromText(params.transcriptText || "");

    const allRefs = Array.from(refsMap.values());
    const chapterCache = new Map();
    const uniqueChapters = new Map();
    allRefs.forEach((r) => {
      const ck = `${r.bookNum}:${r.chapter}`;
      if (!uniqueChapters.has(ck)) uniqueChapters.set(ck, { bookNum: r.bookNum, chapter: r.chapter });
    });

    const chaptersList = Array.from(uniqueChapters.values());
    if (chaptersList.length > 0 && window.DFWolReader) {
      if (onProgress) onProgress(`Récupération de ${chaptersList.length} chapitre(s) biblique(s)…`);
      for (let i = 0; i < chaptersList.length; i += 3) {
        const batch = chaptersList.slice(i, i + 3);
        await Promise.all(
          batch.map(async (c) => {
            try {
              const data = await window.DFWolReader.fetchBibleChapterParsed(c.bookNum, c.chapter, lang);
              chapterCache.set(`${c.bookNum}:${c.chapter}`, data);
            } catch (_) {}
          })
        );
      }
    }

    const versesEntries = [];
    const rsgCandidates = new Map();

    allRefs.forEach((r) => {
      const chData = chapterCache.get(`${r.bookNum}:${r.chapter}`);
      if (!chData) return;
      const targetVerses = Array.isArray(r.verses) && r.verses.length ? r.verses : [r.verseStart || 1];
      const textParts = [];
      const notes = [];

      targetVerses.forEach((vn) => {
        const vObj = chData.verses.find((v) => v.verse === vn);
        if (vObj) textParts.push(`${vn} ${vObj.text}`);
        const st = chData.studyByVerse[vn];
        if (st) {
          (st.studyNotes || []).forEach((n) => {
            if (!notes.includes(n)) notes.push(n);
          });
          (st.researchGuide || []).forEach((art) => {
            const ak = `${art.wolUrl}::${art.title}`;
            if (!rsgCandidates.has(ak)) rsgCandidates.set(ak, art);
          });
        }
      });

      if (textParts.length > 0) {
        versesEntries.push({
          label: r.label,
          text: textParts.join(" "),
          studyNotes: notes.slice(0, 4)
        });
      }
    });

    // 3. Articles (contexte courant + articles fournis + Guide de recherche auto-chargé)
    const articlesEntries = [];
    const seenUrls = new Set();

    if (params.contextText && cleanStr(params.contextText).length > 15) {
      articlesEntries.push({
        title: params.title || (lang === "en" ? "Current Publication Context" : "Extrait de la publication en cours"),
        citation: params.citation || "",
        text: cleanStr(params.contextText).slice(0, 6000)
      });
    }

    if (params.transcriptText && cleanStr(params.transcriptText).length > 15) {
      articlesEntries.push({
        title: `${params.title || "Vidéo"} — Sous-titres`,
        citation: "Transcription VTT",
        text: cleanStr(params.transcriptText).slice(0, 7000)
      });
    }

    const extraArticles = Array.isArray(params.articles) ? params.articles : [];
    const maxRsg = Math.max(0, Math.min(8, Number(config.maxRsgArticles ?? 4)));
    const includeRsg = params.includeRsg !== false;
    const rsgToLoad = includeRsg ? Array.from(rsgCandidates.values()).slice(0, maxRsg) : [];
    const combinedArticleRefs = params.explicitBatchSelection
      ? [...extraArticles, ...rsgToLoad]
      : [...extraArticles, ...rsgToLoad].slice(0, Math.max(1, maxRsg));

    if (combinedArticleRefs.length > 0 && window.DFWolReader) {
      if (onProgress) onProgress(`Extraction de ${combinedArticleRefs.length} article(s) de référence…`);
      for (let i = 0; i < combinedArticleRefs.length; i += 2) {
        const slice = combinedArticleRefs.slice(i, i + 2);
        await Promise.all(
          slice.map(async (art) => {
            if (!art) return;
            if (art.plainText) {
              articlesEntries.push({
                title: art.title || "Article",
                citation: art.citation || "",
                text: cleanStr(art.plainText).slice(0, 3500)
              });
              return;
            }
            if (!art.wolUrl || seenUrls.has(art.wolUrl)) return;
            seenUrls.add(art.wolUrl);
            try {
              const parsed = await window.DFWolReader.fetchArticleParsed(art.wolUrl);
              articlesEntries.push({
                title: parsed.title || art.title,
                citation: parsed.citation || art.citation || "",
                text: cleanStr(parsed.plainText).slice(0, 3500)
              });
            } catch (_) {}
          })
        );
      }
    }

    const bundle = {
      lang,
      styleKey,
      styleInstruction: lang === "en" ? styleObj.en : styleObj.fr,
      title: params.title || question.slice(0, 60) || "Préparation IA",
      question,
      verses: versesEntries,
      articles: articlesEntries,
      targetTextarea: params.targetTextarea || null,
      targetStorageKey: params.targetStorageKey || null,
      promptText: ""
    };

    bundle.promptText = buildFormattedPrompt(bundle);
    return bundle;
  }

  function buildFormattedPrompt(bundle) {
    const isEn = bundle.lang === "en";
    const sections = [];

    sections.push(isEn ? `### TASK / QUESTION\n${bundle.question}` : `### QUESTION FORMULÉE\n${bundle.question}`);
    sections.push(
      isEn
        ? `### EXPECTED RESPONSE STYLE\n${bundle.styleInstruction}`
        : `### CONSIGNE DE RÉPONSE\n${bundle.styleInstruction}`
    );

    if (bundle.verses.length > 0) {
      const vLines = bundle.verses.map((v) => {
        let block = `**${v.label}**\n« ${v.text} »`;
        if (v.studyNotes && v.studyNotes.length > 0) {
          block += `\nNotes d'étude : ${v.studyNotes.join(" | ")}`;
        }
        return block;
      });
      sections.push((isEn ? "### FULL SCRIPTURES\n" : "### VERSETS BIBLIQUES COMPLETS\n") + vLines.join("\n\n"));
    }

    if (bundle.articles.length > 0) {
      const aLines = bundle.articles.map((a, idx) => {
        const head = `${idx + 1}. ${a.title}${a.citation ? ` (${a.citation})` : ""}`;
        return `${head}\n${a.text}`;
      });
      sections.push((isEn ? "### REFERENCE ARTICLES\n" : "### ARTICLES & CONTEXTE\n") + aLines.join("\n\n---\n\n"));
    }

    return sections.join("\n\n");
  }

  // ==========================================================================
  // 2. Appels API Multi-Fournisseurs Côté Client (BYOK)
  // ==========================================================================

  function getSystemInstruction(lang = "fr") {
    if (config.customSystemPrompt && config.customSystemPrompt.trim()) {
      return config.customSystemPrompt.trim();
    }
    return lang === "en"
      ? "You are a helpful, accurate Bible research assistant integrated into DFWol. Base your answers faithfully on the scriptures and reference articles provided by the user. Cite exact scripture references (e.g., Psalm 83:18) and keep a respectful, clear, natural tone."
      : "Tu es un assistant d'étude biblique précis et fidèle intégré à DFWol. Appuie tes réponses directement sur les versets et articles fournis par l'utilisateur. Cite les références bibliques exactes (ex : Psaume 83:18) et adopte un ton clair, naturel et respectueux.";
  }

  async function callAiProvider(messages, systemPrompt) {
    const provider = config.provider || "gemini";
    const apiKey = (config.apiKey || "").trim();
    const model = (config.model || PROVIDER_PRESETS[provider]?.defaultModel || "").trim();

    if (!apiKey && provider !== "custom") {
      throw new Error("Aucune clé API configurée. Ajoutez votre clé dans Étude individuelle → Assistant IA.");
    }

    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model || "gemini-2.5-flash"
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }]
      }));

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.4 }
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error?.message || `Erreur Gemini (${resp.status})`);
      }
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      if (!text) throw new Error("Réponse Gemini vide.");
      return text;
    }

    if (provider === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: model || "claude-3-5-sonnet-latest",
          max_tokens: 1800,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }))
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error?.message || `Erreur Anthropic (${resp.status})`);
      }
      const text = json?.content?.map((c) => c.text || "").join("") || "";
      if (!text) throw new Error("Réponse Anthropic vide.");
      return text;
    }

    // OpenAI / OpenRouter / Groq / Custom OpenAI-compatible
    let endpoint = "https://api.openai.com/v1/chat/completions";
    if (provider === "openrouter") endpoint = "https://openrouter.ai/api/v1/chat/completions";
    else if (provider === "groq") endpoint = "https://api.groq.com/openai/v1/chat/completions";
    else if (provider === "custom") {
      endpoint = (config.endpointUrl || "").trim();
      if (!endpoint) throw new Error("URL de l'endpoint personnalisé manquante.");
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = location.origin;
      headers["X-Title"] = "DFWol Studio";
    }

    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || PROVIDER_PRESETS[provider]?.defaultModel || "gpt-4o-mini",
        temperature: 0.4,
        messages: [{ role: "system", content: systemPrompt }].concat(
          messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }))
        )
      })
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(json?.error?.message || `Erreur API (${resp.status})`);
    }
    const text = json?.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Réponse IA vide.");
    return text;
  }

  // ==========================================================================
  // 3. Rendu Markdown Sécurisé + Versets Cliquables
  // ==========================================================================

  function renderMarkdownSafe(rawMd, lang = "fr") {
    const escaped = esc(rawMd || "");
    const lines = escaped.split(/\r?\n/);
    const out = [];
    let inList = false;

    const formatInline = (txt) => {
      let s = txt
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      if (window.DFWolBible && typeof window.DFWolBible.linkifyScripturesInHtml === "function") {
        s = window.DFWolBible.linkifyScripturesInHtml(s, lang);
      }
      return s;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        return;
      }
      const hMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (hMatch) {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        const level = Math.min(4, hMatch[1].length + 2);
        out.push(`<h${level}>${formatInline(hMatch[2])}</h${level}>`);
        return;
      }
      const liMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      if (liMatch) {
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push(`<li>${formatInline(liMatch[1])}</li>`);
        return;
      }
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (trimmed.startsWith("&gt;")) {
        out.push(`<blockquote>${formatInline(trimmed.slice(4).trim())}</blockquote>`);
      } else {
        out.push(`<p>${formatInline(trimmed)}</p>`);
      }
    });

    if (inList) out.push("</ul>");
    return out.join("");
  }

  // ==========================================================================
  // 4. Interface Tiroir IA (#ai-assistant-drawer) & Studio IA
  // ==========================================================================

  function openDrawer() {
    const drawer = document.getElementById("ai-assistant-drawer");
    if (drawer) drawer.classList.remove("hidden");
  }

  function closeDrawer() {
    document.getElementById("ai-assistant-drawer")?.classList.add("hidden");
  }

  function updatePromptPreviewUi() {
    if (!currentBundle) return;
    currentBundle.promptText = buildFormattedPrompt(currentBundle);
    const qInput = document.getElementById("ai-drawer-question-input");
    const statsEl = document.getElementById("ai-drawer-stats");
    const preEl = document.getElementById("ai-drawer-prompt-preview");

    if (qInput && qInput.value !== currentBundle.question) {
      qInput.value = currentBundle.question;
    }
    if (statsEl) {
      const chars = currentBundle.promptText.length;
      const approxTokens = Math.ceil(chars / 4);
      statsEl.innerHTML = `
        <span class="badge badge-blue">📖 ${currentBundle.verses.length} verset(s)</span>
        <span class="badge badge-emerald">📚 ${currentBundle.articles.length} article(s)</span>
        <span class="badge badge-subtle">~${approxTokens} tokens (${chars} car.)</span>
      `;
    }
    if (preEl) {
      preEl.textContent = currentBundle.promptText;
    }
    document.querySelectorAll("[data-ai-style-pill]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-ai-style-pill") === currentBundle.styleKey);
    });
  }

  function renderConversationMessages() {
    const container = document.getElementById("ai-drawer-messages");
    if (!container) return;
    const lang = currentBundle?.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");

    if (conversation.length === 0) {
      const hasKey = Boolean((config.apiKey || "").trim() || config.provider === "custom");
      container.innerHTML = hasKey
        ? `<div class="ai-empty-hint">Contenu prêt ! Cliquez sur <strong>✨ Générer la réponse IA</strong> ou copiez le prompt complet en 1 clic.</div>`
        : `<div class="ai-empty-hint">Contenu complet préparé en 1 clic ! Copiez le prompt ci-dessous vers n'importe quelle IA, ou <button type="button" class="btn-link-inline" id="ai-open-key-settings">ajoutez votre clé API</button> pour répondre directement ici.</div>`;
      document.getElementById("ai-open-key-settings")?.addEventListener("click", () => {
        closeDrawer();
        window.DFWolSwitchTab && window.DFWolSwitchTab("study", { studySubtab: "ai" });
      });
      return;
    }

    container.innerHTML = conversation
      .map((msg, idx) => {
        if (msg.role === "user") {
          return `<div class="ai-msg ai-msg-user"><div class="ai-msg-role">Vous</div><div>${esc(msg.text)}</div></div>`;
        }
        const renderedHtml = renderMarkdownSafe(msg.text, lang);
        const canInsert = Boolean(currentBundle?.targetTextarea || currentBundle?.targetStorageKey);
        return `
          <div class="ai-msg ai-msg-assistant">
            <div class="ai-msg-role">✨ Assistant IA (${esc(PROVIDER_PRESETS[config.provider]?.label || config.provider)})</div>
            <div class="ai-msg-body">${renderedHtml}</div>
            <div class="ai-msg-actions">
              ${canInsert ? `<button type="button" class="btn-primary btn-xs" data-ai-insert="${idx}">↳ Insérer dans ma réponse</button>` : ""}
              <button type="button" class="btn-secondary btn-xs" data-ai-copy="${idx}">📋 Copier</button>
              <button type="button" class="btn-ghost btn-xs" data-ai-speak="${idx}">🗣️ Écouter</button>
              <button type="button" class="btn-ghost btn-xs" data-ai-note="${idx}">📝 Note</button>
            </div>
          </div>
        `;
      })
      .join("");

    if (window.DFWolReader) {
      container.dataset.inappBound = "0";
      window.DFWolReader.attachInAppLinkInterceptor(container, lang);
    }

    container.querySelectorAll("[data-ai-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const m = conversation[Number(btn.getAttribute("data-ai-copy"))];
        if (m) {
          await navigator.clipboard.writeText(m.text);
          window.DFWolToast && window.DFWolToast("Réponse IA copiée !");
        }
      });
    });

    container.querySelectorAll("[data-ai-speak]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = conversation[Number(btn.getAttribute("data-ai-speak"))];
        if (m && window.DFWolAudio) {
          window.DFWolAudio.playTrack({
            title: currentBundle?.title || "Réponse IA",
            subtitle: "Assistant Biblique IA",
            text: m.text,
            lang,
            mode: "tts"
          });
        }
      });
    });

    container.querySelectorAll("[data-ai-note]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = conversation[Number(btn.getAttribute("data-ai-note"))];
        if (m && window.DFWolAddNote) {
          window.DFWolAddNote(
            `IA — ${currentBundle?.title || "Étude"}`,
            "Étude Perso",
            `${currentBundle?.question ? currentBundle.question + "\n\n" : ""}${m.text}`
          );
        }
      });
    });

    container.querySelectorAll("[data-ai-insert]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const m = conversation[Number(btn.getAttribute("data-ai-insert"))];
        if (!m || !currentBundle) return;
        const ta = currentBundle.targetTextarea;
        if (ta && document.body.contains(ta)) {
          ta.value = m.text;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          closeDrawer();
          ta.scrollIntoView({ behavior: "smooth", block: "center" });
          window.DFWolToast && window.DFWolToast("Réponse insérée dans votre cahier !");
        } else if (currentBundle.targetStorageKey) {
          try {
            localStorage.setItem(currentBundle.targetStorageKey, m.text);
            window.DFWolToast && window.DFWolToast("Réponse sauvegardée !");
          } catch (_) {}
        }
      });
    });

    container.scrollTop = container.scrollHeight;
  }

  async function generateAnswer(followUpText = null) {
    if (isGenerating || !currentBundle) return;
    const genBtn = document.getElementById("btn-ai-generate");
    const statusEl = document.getElementById("ai-drawer-loading");

    isGenerating = true;
    if (genBtn) genBtn.disabled = true;
    if (statusEl) {
      statusEl.textContent = "⏳ Génération de la réponse IA…";
      statusEl.classList.remove("hidden");
    }

    try {
      let messagesPayload = [];
      if (followUpText) {
        conversation.push({ role: "user", text: followUpText });
        messagesPayload = [{ role: "user", text: currentBundle.promptText }].concat(conversation);
      } else {
        conversation = [];
        messagesPayload = [{ role: "user", text: currentBundle.promptText }];
      }
      renderConversationMessages();

      const answer = await callAiProvider(messagesPayload, getSystemInstruction(currentBundle.lang));
      conversation.push({ role: "assistant", text: answer });
      renderConversationMessages();
    } catch (err) {
      window.DFWolToast && window.DFWolToast(err.message);
      const container = document.getElementById("ai-drawer-messages");
      if (container) {
        container.insertAdjacentHTML(
          "beforeend",
          `<div class="error-recovery-box" style="margin-top:0.5rem;"><strong>⚠️ ${esc(err.message)}</strong></div>`
        );
      }
    } finally {
      isGenerating = false;
      if (genBtn) genBtn.disabled = false;
      if (statusEl) statusEl.classList.add("hidden");
    }
  }

  async function prepareAndOpen(params = {}) {
    openDrawer();
    conversation = [];
    const titleEl = document.getElementById("ai-drawer-title");
    const qInput = document.getElementById("ai-drawer-question-input");
    const loadingEl = document.getElementById("ai-drawer-loading");
    const msgEl = document.getElementById("ai-drawer-messages");
    const lang = params.lang || (window.DFWolGetLang ? window.DFWolGetLang() : "fr");
    const previewQuestion =
      cleanStr(params.question || "") ||
      (params.refsLabel
        ? lang === "en"
          ? `Explain ${params.refsLabel} and highlight its main spiritual lessons.`
          : `Explique ${params.refsLabel} et dégage les principales leçons spirituelles et pratiques.`
        : params.title || "");

    if (titleEl) titleEl.textContent = params.title || "Assistant IA — Préparation 1-clic";
    if (qInput) qInput.value = previewQuestion;
    if (msgEl) msgEl.innerHTML = "";
    if (loadingEl) {
      loadingEl.textContent = "⏳ Rassemblement des versets et articles…";
      loadingEl.classList.remove("hidden");
    }

    try {
      currentBundle = await prepareBundle(params, (msg) => {
        if (loadingEl) loadingEl.textContent = `⏳ ${msg}`;
      });
      if (loadingEl) loadingEl.classList.add("hidden");
      updatePromptPreviewUi();
      renderConversationMessages();

      const hasKey = Boolean((config.apiKey || "").trim() || config.provider === "custom");
      if ((params.autoGenerate || config.autoRunWithKey) && hasKey && !params.copyOnly) {
        await generateAnswer();
      }
    } catch (err) {
      if (loadingEl) loadingEl.classList.add("hidden");
      if (msgEl) msgEl.innerHTML = `<div class="error-recovery-box">⚠️ ${esc(err.message)}</div>`;
    }
  }

  async function copyOneClickPrompt(params = {}) {
    window.DFWolToast && window.DFWolToast("Préparation du prompt complet (versets + articles)…");
    const bundle = await prepareBundle(params);
    currentBundle = bundle;
    try {
      await navigator.clipboard.writeText(bundle.promptText);
      window.DFWolToast &&
        window.DFWolToast(
          `Prompt copié ! (${bundle.verses.length} verset(s), ${bundle.articles.length} article(s))`
        );
    } catch (_) {
      prepareAndOpen(Object.assign({}, params, { copyOnly: true }));
    }
  }

  // ==========================================================================
  // 5. Formulaire Paramètres Clé API & Studio IA
  // ==========================================================================

  function syncSettingsUi() {
    const provSel = document.getElementById("ai-provider-select");
    const keyInput = document.getElementById("ai-apikey-input");
    const modelInput = document.getElementById("ai-model-input");
    const endpointWrap = document.getElementById("ai-endpoint-wrap");
    const endpointInput = document.getElementById("ai-endpoint-input");
    const styleSel = document.getElementById("ai-style-select");
    const sysInput = document.getElementById("ai-system-prompt-input");
    const maxRsgInput = document.getElementById("ai-max-rsg-input");
    const autoRunCb = document.getElementById("ai-autorun-checkbox");
    const modelDatalist = document.getElementById("ai-model-suggestions");

    if (provSel) provSel.value = config.provider;
    if (keyInput) {
      keyInput.value = config.apiKey || "";
      keyInput.placeholder = PROVIDER_PRESETS[config.provider]?.keyHint || "Clé API…";
    }
    if (modelInput) modelInput.value = config.model || PROVIDER_PRESETS[config.provider]?.defaultModel || "";
    if (endpointWrap) endpointWrap.classList.toggle("hidden", config.provider !== "custom");
    if (endpointInput) endpointInput.value = config.endpointUrl || "";
    if (styleSel) styleSel.value = config.responseStyle || "meeting_short";
    if (sysInput) sysInput.value = config.customSystemPrompt || "";
    if (maxRsgInput) maxRsgInput.value = String(config.maxRsgArticles ?? 4);
    if (autoRunCb) autoRunCb.checked = config.autoRunWithKey !== false;
    if (modelDatalist) {
      const models = PROVIDER_PRESETS[config.provider]?.models || [];
      modelDatalist.innerHTML = models.map((m) => `<option value="${esc(m)}"></option>`).join("");
    }
  }

  async function testApiConnection() {
    const statusEl = document.getElementById("ai-key-status");
    if (statusEl) statusEl.textContent = "⏳ Test de la clé API en cours…";
    try {
      const reply = await callAiProvider([{ role: "user", text: "Réponds uniquement par: OK DFWol." }], "Réponds très brièvement.");
      if (statusEl) statusEl.textContent = `✅ Connexion réussie : ${cleanStr(reply).slice(0, 60)}`;
      window.DFWolToast && window.DFWolToast("Clé API valide !");
    } catch (err) {
      if (statusEl) statusEl.textContent = `⚠️ ${err.message}`;
      window.DFWolToast && window.DFWolToast(err.message);
    }
  }

  function init() {
    if (uiBound) return;
    uiBound = true;

    syncSettingsUi();

    document.getElementById("ai-drawer-close")?.addEventListener("click", closeDrawer);
    document.getElementById("ai-assistant-drawer")?.addEventListener("click", (e) => {
      if (e.target.id === "ai-assistant-drawer") closeDrawer();
    });

    document.getElementById("ai-drawer-question-input")?.addEventListener("input", (e) => {
      if (!currentBundle) return;
      currentBundle.question = e.target.value;
      updatePromptPreviewUi();
    });

    document.querySelectorAll("[data-ai-style-pill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!currentBundle) return;
        const st = btn.getAttribute("data-ai-style-pill");
        const stObj = STYLE_INSTRUCTIONS[st] || STYLE_INSTRUCTIONS.meeting_short;
        currentBundle.styleKey = st;
        currentBundle.styleInstruction = currentBundle.lang === "en" ? stObj.en : stObj.fr;
        updatePromptPreviewUi();
      });
    });

    document.getElementById("btn-ai-copy-prompt")?.addEventListener("click", async () => {
      if (!currentBundle) return;
      await navigator.clipboard.writeText(currentBundle.promptText);
      window.DFWolToast && window.DFWolToast("Prompt complet copié dans le presse-papiers !");
    });

    document.getElementById("btn-ai-generate")?.addEventListener("click", () => generateAnswer(null));

    document.getElementById("ai-followup-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = document.getElementById("ai-followup-input");
      const val = inp?.value.trim();
      if (!val) return;
      inp.value = "";
      generateAnswer(val);
    });

    // Studio IA (onglet Étude individuelle -> ASSISTANT IA)
    document.getElementById("btn-studio-ai-prepare")?.addEventListener("click", () => {
      const q = document.getElementById("studio-ai-question")?.value.trim() || "";
      const refs = document.getElementById("studio-ai-refs")?.value.trim() || "";
      const autoRsg = document.getElementById("studio-ai-include-rsg")?.checked !== false;
      if (!q && !refs) {
        window.DFWolToast && window.DFWolToast("Saisissez une question et/ou une référence (ex: Ps 83:15-18).");
        return;
      }
      prepareAndOpen({
        title: refs || q.slice(0, 50),
        question: q,
        refsText: refs,
        refsLabel: refs,
        includeRsg: autoRsg,
        lang: window.DFWolGetLang ? window.DFWolGetLang() : "fr"
      });
    });

    // Paramètres Clé API
    document.getElementById("ai-provider-select")?.addEventListener("change", (e) => {
      const p = e.target.value;
      const preset = PROVIDER_PRESETS[p] || PROVIDER_PRESETS.gemini;
      saveConfig({ provider: p, model: preset.defaultModel });
      syncSettingsUi();
    });

    document.getElementById("btn-ai-save-config")?.addEventListener("click", () => {
      saveConfig({
        provider: document.getElementById("ai-provider-select")?.value || "gemini",
        apiKey: document.getElementById("ai-apikey-input")?.value.trim() || "",
        model: document.getElementById("ai-model-input")?.value.trim() || "",
        endpointUrl: document.getElementById("ai-endpoint-input")?.value.trim() || "",
        responseStyle: document.getElementById("ai-style-select")?.value || "meeting_short",
        customSystemPrompt: document.getElementById("ai-system-prompt-input")?.value.trim() || "",
        maxRsgArticles: Number(document.getElementById("ai-max-rsg-input")?.value || 4),
        autoRunWithKey: document.getElementById("ai-autorun-checkbox")?.checked !== false
      });
      window.DFWolToast && window.DFWolToast("Configuration IA enregistrée !");
    });

    document.getElementById("btn-ai-test-key")?.addEventListener("click", () => {
      saveConfig({
        provider: document.getElementById("ai-provider-select")?.value || "gemini",
        apiKey: document.getElementById("ai-apikey-input")?.value.trim() || "",
        model: document.getElementById("ai-model-input")?.value.trim() || "",
        endpointUrl: document.getElementById("ai-endpoint-input")?.value.trim() || ""
      });
      testApiConnection();
    });

    document.getElementById("btn-ai-toggle-key-vis")?.addEventListener("click", () => {
      const inp = document.getElementById("ai-apikey-input");
      if (inp) inp.type = inp.type === "password" ? "text" : "password";
    });
  }

  return {
    init,
    getConfig: () => Object.assign({}, config),
    hasApiKey: () => Boolean((config.apiKey || "").trim() || config.provider === "custom"),
    prepareBundle,
    prepareAndOpen,
    copyOneClickPrompt,
    closeDrawer
  };
})();
