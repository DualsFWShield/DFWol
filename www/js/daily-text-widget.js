/* ==========================================================================
   DFWol Studio — Moteur « Texte du Jour » (FR & EN)
   Résumés Multi-Niveaux (1 Mot, 1 Phrase, Petit Paragraphe, Complet)
   + Bridge Natif Capacitor & Carte Canvas PNG HD
   ========================================================================== */

window.DFWolDailyText = (function () {
  "use strict";

  const STORAGE_CACHE_PREFIX = "dfwol_dt_cache_v4_";
  const CAPACITOR_WIDGET_KEY = "dfwol_daily_text_widget_payload";

  // Bibliothèque hors-ligne bilingue FR & EN
  const CURATED_DAILY_TEXTS = {
    fr: [
      {
        scriptureText: "« Pour qu’on sache que toi, dont le nom est Jéhovah, tu es, toi seul, le Très-Haut sur toute la terre ! »",
        scriptureRef: "Psaume 83:18",
        commentary:
          "Le nom divin, Jéhovah, renferme la promesse que Dieu réalise toujours ce qu’il entreprend. Connaître ce nom ne se limite pas à savoir le prononcer : cela implique d’avoir une confiance absolue dans la souveraineté, la sagesse et l’amour fidèle de Celui qui le porte, et d’honorer ce nom par notre conduite quotidienne."
      },
      {
        scriptureText: "« Ceci signifie la vie éternelle : qu’ils apprennent à te connaître, toi, le seul vrai Dieu, et celui que tu as envoyé, Jésus Christ. »",
        scriptureRef: "Jean 17:3",
        commentary:
          "Apprendre à connaître Jéhovah et Jésus Christ est un processus vivant et continu. Plus nous étudions les Écritures en profondeur, plus notre amitié avec Jéhovah s’affermit, éclairant chacune de nos décisions et fortifiant notre espérance."
      },
      {
        scriptureText: "« Mets ta confiance en Jéhovah de tout ton cœur et ne t’appuie pas sur ton intelligence. Dans toutes tes voies, tiens compte de lui, et lui, il rendra droits tes sentiers. »",
        scriptureRef: "Proverbes 3:5, 6",
        commentary:
          "Lorsque nous devons prendre une décision importante, notre premier réflexe devrait être de consulter la Parole de Dieu par la prière et la recherche personnelle. En tenant compte des principes bibliques dans toutes nos voies, nous permettons à Jéhovah de guider nos pas avec sécurité."
      },
      {
        scriptureText: "« N’aie pas peur, car je suis avec toi. Ne sois pas inquiet, car je suis ton Dieu. Je te fortifierai, oui, je t’aiderai. »",
        scriptureRef: "Isaïe 41:10",
        commentary:
          "Jéhovah ne nous promet pas une vie exempte d’épreuves dans le système actuel, mais il nous garantit sa présence indéfectible. Il nous fortifie au moyen de son esprit saint, de sa Parole consolante et de notre famille spirituelle internationale."
      }
    ],
    en: [
      {
        scriptureText: "“May people know that you, whose name is Jehovah, you alone are the Most High over all the earth.”",
        scriptureRef: "Psalm 83:18",
        commentary:
          "Jehovah’s name carries the assurance that he always fulfills his purpose. Knowing his name means far more than pronouncing it; it means trusting completely in his sovereignty, wisdom, and loyal love, and honoring him through our daily conduct."
      },
      {
        scriptureText: "“This means everlasting life, their coming to know you, the only true God, and the one whom you sent, Jesus Christ.”",
        scriptureRef: "John 17:3",
        commentary:
          "Coming to know Jehovah and Jesus Christ is a lifelong, rewarding journey. As we dig deeper into the Scriptures through personal study, our friendship with Jehovah grows stronger and guides every decision we make."
      },
      {
        scriptureText: "“Trust in Jehovah with all your heart, and do not rely on your own understanding. In all your ways take notice of him, and he will make your paths straight.”",
        scriptureRef: "Proverbs 3:5, 6",
        commentary:
          "Whenever we face important choices, our first step should be to seek Jehovah’s guidance through prayer and Bible research. Taking notice of his principles in all our ways allows him to direct our steps safely."
      },
      {
        scriptureText: "“Do not be afraid, for I am with you. Do not be anxious, for I am your God. I will fortify you, yes, I will help you.”",
        scriptureRef: "Isaiah 41:10",
        commentary:
          "While Jehovah does not shield us from every trial today, he guarantees his unwavering support. He strengthens us by means of his holy spirit, his comforting Word, and our worldwide spiritual family."
      }
    ]
  };

  // Lexique thématique bilingue pour le résumé en 1 MOT
  const THEME_LEXICON = [
    { fr: "Confiance", en: "Trust", kw: ["confiance", "appuie", "trust", "rely", "faithfulness", "fidélité"] },
    { fr: "Amour", en: "Love", kw: ["amour", "affection", "tendresse", "love", "loyal love", "cherish"] },
    { fr: "Prière", en: "Prayer", kw: ["prière", "prier", "supplication", "prayer", "pray", "supplications"] },
    { fr: "Courage", en: "Courage", kw: ["courage", "peur", "crainte", "inquiet", "afraid", "anxious", "fortifier", "fortify"] },
    { fr: "Espérance", en: "Hope", kw: ["espérance", "espoir", "avenir", "promesse", "hope", "future", "promise", "paradis"] },
    { fr: "Patience", en: "Patience", kw: ["patience", "endurance", "persévérance", "patient", "endure", "perseverance"] },
    { fr: "Humilité", en: "Humility", kw: ["humilité", "humble", "modestie", "orgueil", "humble", "humility", "modesty"] },
    { fr: "Sagesse", en: "Wisdom", kw: ["sagesse", "sage", "discernement", "intelligence", "wisdom", "wise", "insight"] },
    { fr: "Pardon", en: "Forgiveness", kw: ["pardon", "pardonner", "miséricorde", "forgive", "forgiveness", "mercy"] },
    { fr: "Paix", en: "Peace", kw: ["paix", "sérénité", "calme", "tranquille", "peace", "serenity", "calm"] },
    { fr: "Joie", en: "Joy", kw: ["joie", "heureux", "réjouir", "joy", "happy", "rejoice"] },
    { fr: "Foi", en: "Faith", kw: ["foi", "croire", "conviction", "faith", "believe"] },
    { fr: "Obéissance", en: "Obedience", kw: ["obéir", "obéissance", "commandement", "obey", "obedience", "commandment"] },
    { fr: "Ministère", en: "Ministry", kw: ["prêcher", "ministère", "témoignage", "bonne nouvelle", "preach", "ministry", "good news"] },
    { fr: "Étude", en: "Study", kw: ["étudier", "méditation", "méditer", "parole", "study", "meditate", "scriptures"] },
    { fr: "Unité", en: "Unity", kw: ["unité", "frères", "assemblée", "congrégation", "unity", "brothers", "congregation"] },
    { fr: "Gratitude", en: "Gratitude", kw: ["reconnaissance", "gratitude", "remerciement", "thankful", "gratitude", "thanks"] },
    { fr: "Royaume", en: "Kingdom", kw: ["royaume", "roi", "souveraineté", "kingdom", "sovereignty"] },
    { fr: "Réconfort", en: "Comfort", kw: ["consoler", "consolation", "réconfort", "sanctuaire", "comfort", "console"] },
    { fr: "Priorités", en: "Priorities", kw: ["priorité", "d'abord", "spirituelles", "priority", "first", "spiritual"] }
  ];

  function generateDailyTextSummaries(scriptureText, scriptureRef, commentaryPlain, lang = "fr") {
    const combined = `${scriptureText || ""} ${commentaryPlain || ""}`.toLowerCase();

    // 1. Résumé en 1 MOT
    let bestTheme = null;
    let bestScore = 0;
    THEME_LEXICON.forEach((entry) => {
      let score = 0;
      entry.kw.forEach((k) => {
        const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
        const matches = combined.match(re);
        if (matches) score += matches.length;
      });
      if (score > bestScore) {
        bestScore = score;
        bestTheme = entry;
      }
    });

    const oneWord = bestTheme
      ? lang === "en"
        ? bestTheme.en
        : bestTheme.fr
      : lang === "en"
      ? "Faithfulness"
      : "Fidélité";

    // Découpage en phrases propres du commentaire
    const cleanComment = String(commentaryPlain || "").replace(/\s+/g, " ").trim();
    const sentences = (cleanComment.match(/[^.!?]+[.!?]+/g) || [cleanComment])
      .map((s) => s.trim())
      .filter((s) => s.length > 15 && !/^\([a-z]+\d+/i.test(s));

    // 2. Résumé en 1 PHRASE (privilégier les phrases d'application / conclusion avec mots forts)
    let bestSentence = sentences[0] || cleanComment;
    let bestSentScore = -1;
    sentences.forEach((s, idx) => {
      let sc = 0;
      if (idx === sentences.length - 1 || idx === sentences.length - 2) sc += 2;
      if (/\b(nous|notre|devrions|permet|aidera|we|our|should|helps|reminds)\b/i.test(s)) sc += 3;
      if (s.length >= 45 && s.length <= 165) sc += 2;
      if (sc > bestSentScore) {
        bestSentScore = sc;
        bestSentence = s;
      }
    });

    if (bestSentence.length > 175) {
      bestSentence = bestSentence.slice(0, 172).trimEnd() + "…";
    }

    // 3. Résumé en PETIT PARAGRAPHE (2 à 3 phrases essentielles : ouverture + cœur + conclusion)
    let shortPara = "";
    if (sentences.length <= 2) {
      shortPara = sentences.join(" ");
    } else {
      const picked = [sentences[0]];
      if (!picked.includes(bestSentence)) picked.push(bestSentence);
      else if (sentences[1]) picked.push(sentences[1]);
      if (sentences.length > 2 && !picked.includes(sentences[sentences.length - 1]) && picked.join(" ").length < 240) {
        picked.push(sentences[sentences.length - 1]);
      }
      shortPara = picked.join(" ");
    }

    return {
      oneWord,
      oneSentence: bestSentence,
      shortParagraph: shortPara
    };
  }

  function buildWolDailyTextUrl(dateObj = new Date(), langCode = "fr") {
    const cfg = window.DFWolBible.getLangConfig(langCode);
    const yyyy = dateObj.getFullYear();
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    return `https://wol.jw.org/${cfg.code}/wol/dt/${cfg.r}/${cfg.lp}/${yyyy}/${m}/${d}`;
  }

  function formatDateHuman(dateObj = new Date(), langCode = "fr") {
    try {
      return new Intl.DateTimeFormat(langCode === "en" ? "en-US" : "fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(dateObj);
    } catch (_) {
      return dateObj.toLocaleDateString();
    }
  }

  function getDateKey(dateObj = new Date(), langCode = "fr") {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    return `${langCode}_${yyyy}-${mm}-${dd}`;
  }

  function getCuratedFallback(dateObj = new Date(), langCode = "fr") {
    const lang = langCode === "en" ? "en" : "fr";
    const list = CURATED_DAILY_TEXTS[lang];
    const start = new Date(dateObj.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((dateObj - start) / 86400000);
    const item = list[Math.abs(dayOfYear) % list.length];
    const wolUrl = buildWolDailyTextUrl(dateObj, lang);
    const refs = window.DFWolBible.parseScriptureReferences(item.scriptureRef, lang);
    const summaries = generateDailyTextSummaries(item.scriptureText, item.scriptureRef, item.commentary, lang);
    const linkedHtml = window.DFWolBible.linkifyScripturesInHtml(
      window.DFWolSearch ? window.DFWolSearch.escapeHtml(item.commentary) : item.commentary,
      lang
    );

    return {
      dateIso: dateObj.toISOString().slice(0, 10),
      formattedDate: formatDateHuman(dateObj, lang),
      scriptureText: item.scriptureText,
      scriptureRef: item.scriptureRef,
      scriptureWolUrl: refs.length > 0 ? refs[0].wolBibleUrl : wolUrl,
      commentary: item.commentary,
      commentaryHtml: linkedHtml,
      summaries,
      wolUrl,
      source: "curated-cache",
      lang
    };
  }

  function cleanDtText(str) {
    if (window.DFWolSearch && typeof window.DFWolSearch.cleanText === "function") {
      return window.DFWolSearch.cleanText(str);
    }
    return String(str || "").replace(/&nbsp;|&#160;/gi, " ").replace(/[\u00a0\u202f\u200b]/g, " ").replace(/\s+/g, " ").trim();
  }

  function sanitizeCommentaryHtml(bodyEl, lang) {
    if (!bodyEl) return "";
    const clone = bodyEl.cloneNode(true);
    clone.querySelectorAll("script, style").forEach((el) => el.remove());
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue) {
        n.nodeValue = n.nodeValue.replace(/&nbsp;/gi, " ").replace(/[\u00a0\u202f\u200b]/g, " ");
      }
    }
    clone.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/")) {
        a.setAttribute("href", `https://wol.jw.org${href}`);
      }
      a.removeAttribute("target");
      a.classList.add("inline-scripture-link");
    });
    return clone.innerHTML;
  }

  async function getDailyTextForDate(dateObj = new Date(), langCode = "fr", forceRefresh = false) {
    const lang = langCode === "en" ? "en" : "fr";
    const cacheKey = STORAGE_CACHE_PREFIX + getDateKey(dateObj, lang);
    const wolUrl = buildWolDailyTextUrl(dateObj, lang);

    if (!forceRefresh) {
      try {
        const cachedRaw = localStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.scriptureText && cached.summaries) {
            return cached;
          }
        }
      } catch (_) {}
    }

    try {
      const res = await window.DFWolNet.fetchWolHtml(wolUrl, { skipCache: forceRefresh });
      const parser = new DOMParser();
      const doc = parser.parseFromString(res.html, "text/html");

      // Sur WOL, la page /wol/dt/ contient 1 ou 3 jours dans .itemData ; chercher celui qui correspond au mois/jour
      const targetDay = String(dateObj.getDate());
      const itemBlocks = Array.from(doc.querySelectorAll(".itemData"));
      let chosenBlock = itemBlocks.find((b) => {
        const h2 = b.querySelector("header h2");
        return h2 && new RegExp(`\\b${targetDay}\\b`).test(h2.textContent || "");
      });
      if (!chosenBlock && itemBlocks.length > 0) {
        chosenBlock = itemBlocks[0];
      }

      const scope = chosenBlock || doc;
      const themeEl = scope.querySelector("p.themeScrp, .themeScrp");
      const bodyEl = scope.querySelector(".bodyTxt");
      const bodyPara = scope.querySelector(".bodyTxt p");

      if (themeEl && (bodyEl || bodyPara)) {
        const fullTheme = cleanDtText(themeEl.textContent || "");
        const commentaryPlain = cleanDtText((bodyEl || bodyPara).textContent || "");
        const commentaryHtml = sanitizeCommentaryHtml(bodyEl || bodyPara, lang);

        let scriptureText = fullTheme;
        let scriptureRef = lang === "en" ? "Daily Text" : "Texte du jour";
        const parenMatch = fullTheme.match(/^(.*)\(([^()]+)\)\.?$/);
        const dashMatch = fullTheme.match(/^(.*?)\s*[—–]\s*([1-3]?\s*[A-Za-zÀ-ÖØ-öø-ÿ]{2,20}\.?\s+\d+[:.,\d\s–-]*)\.?$/);
        if (parenMatch) {
          const quoteCore = parenMatch[1].replace(/^[«“"\s]+|[»”".\s]+$/g, "").trim();
          scriptureText = lang === "en" ? `“${quoteCore}”` : `« ${quoteCore} »`;
          scriptureRef = window.DFWolBible.expandScriptureRefFull(parenMatch[2].trim(), lang);
        } else if (dashMatch) {
          const quoteCore = dashMatch[1].replace(/^[«“"\s]+|[»”".\s]+$/g, "").trim();
          scriptureText = lang === "en" ? `“${quoteCore}”` : `« ${quoteCore} »`;
          scriptureRef = window.DFWolBible.expandScriptureRefFull(dashMatch[2].trim(), lang);
        }

        const refs = window.DFWolBible.parseScriptureReferences(scriptureRef, lang);
        const summaries = generateDailyTextSummaries(scriptureText, scriptureRef, commentaryPlain, lang);

        const payload = {
          dateIso: dateObj.toISOString().slice(0, 10),
          formattedDate: formatDateHuman(dateObj, lang),
          scriptureText,
          scriptureRef,
          scriptureWolUrl: refs.length > 0 ? refs[0].wolBibleUrl : wolUrl,
          commentary: commentaryPlain,
          commentaryHtml,
          summaries,
          wolUrl,
          source: "wol-live",
          lang
        };

        try {
          localStorage.setItem(cacheKey, JSON.stringify(payload));
        } catch (_) {}

        return payload;
      }
    } catch (_) {}

    return getCuratedFallback(dateObj, lang);
  }

  async function syncWithCapacitorNativeWidget(dtData, widgetSettings = {}) {
    const summaries = dtData.summaries || generateDailyTextSummaries(dtData.scriptureText, dtData.scriptureRef, dtData.commentary, dtData.lang);
    const widgetPayload = {
      dateIso: dtData.dateIso,
      formattedDate: dtData.formattedDate,
      scriptureText: dtData.scriptureText,
      scriptureRef: dtData.scriptureRef,
      commentary: dtData.commentary,
      oneWord: summaries.oneWord,
      oneSentence: summaries.oneSentence,
      shortParagraph: summaries.shortParagraph,
      displayMode: widgetSettings.displayMode || "shortParagraph",
      wolUrl: dtData.wolUrl,
      theme: widgetSettings.theme || "theme-jw-light",
      showCommentary: widgetSettings.showCommentary !== false,
      fontScale: widgetSettings.fontScale || 100,
      updatedAt: new Date().toISOString()
    };

    const jsonString = JSON.stringify(widgetPayload);

    try {
      localStorage.setItem(CAPACITOR_WIDGET_KEY, jsonString);
    } catch (_) {}

    let nativeSynced = false;
    try {
      if (window.Capacitor && window.Capacitor.Plugins) {
        if (window.Capacitor.Plugins.Preferences) {
          await window.Capacitor.Plugins.Preferences.set({
            key: CAPACITOR_WIDGET_KEY,
            value: jsonString
          });
          nativeSynced = true;
        }
        if (window.Capacitor.Plugins.DailyTextWidget && typeof window.Capacitor.Plugins.DailyTextWidget.refreshWidget === "function") {
          await window.Capacitor.Plugins.DailyTextWidget.refreshWidget(widgetPayload);
          nativeSynced = true;
        }
      }
    } catch (_) {}

    return {
      synced: true,
      nativePlatform: Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
      nativeSynced,
      timestamp: new Date().toLocaleTimeString()
    };
  }

  function generateWidgetPngCard(canvasEl, dtData, theme = "theme-jw-light") {
    if (!canvasEl) return null;
    const ctx = canvasEl.getContext("2d");
    const W = 1080;
    const H = 1080;
    canvasEl.width = W;
    canvasEl.height = H;

    const summaries = dtData.summaries || generateDailyTextSummaries(dtData.scriptureText, dtData.scriptureRef, dtData.commentary, dtData.lang);
    const palettes = {
      "theme-jw-light": { bg1: "#ffffff", bg2: "#f7f7f7", text: "#292929", accent: "#4a6da7", sub: "#626262", border: "#d8d8d8" },
      "theme-jw-blue": { bg1: "#4a6da7", bg2: "#3b5888", text: "#ffffff", accent: "#e8effb", sub: "#e8effb", border: "#9fb9e3" },
      "theme-jw-dark": { bg1: "#121212", bg2: "#1d1d1d", text: "#ffffff", accent: "#9fb9e3", sub: "#c0c0c0", border: "#3c3c3c" },
      "theme-parchment": { bg1: "#fefce8", bg2: "#f5f5f4", text: "#1c1917", accent: "#4a6da7", sub: "#44403c", border: "#d6d3d1" }
    };
    const pal = palettes[theme] || palettes["theme-jw-light"];

    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, W, H);

    // Bandeau supérieur DFWol Saphir (#102547)
    ctx.fillStyle = "#102547";
    ctx.fillRect(0, 0, W, 168);
    ctx.fillStyle = "#f4c45d";
    ctx.font = "bold 26px Noto Sans, Arial, sans-serif";
    ctx.fillText(`DFWOL • TEXTE DU JOUR • ${summaries.oneWord.toUpperCase()}`, 72, 82);

    ctx.fillStyle = "#e8effb";
    ctx.font = "600 30px Noto Sans, Arial, sans-serif";
    ctx.fillText(dtData.formattedDate || "", 72, 132);

    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(44, 44, W - 88, H - 88);

    ctx.fillStyle = pal.text;
    ctx.font = "italic bold 40px Georgia, serif";
    let y = wrapCanvasText(ctx, dtData.scriptureText || "", 72, 240, W - 144, 54, 5);

    y += 18;
    ctx.fillStyle = pal.accent;
    ctx.font = "bold 32px Noto Sans, Arial, sans-serif";
    ctx.fillText(`— ${dtData.scriptureRef || ""}`, 72, y);

    y += 38;
    ctx.strokeStyle = pal.border;
    ctx.beginPath();
    ctx.moveTo(72, y);
    ctx.lineTo(W - 72, y);
    ctx.stroke();

    y += 48;
    ctx.fillStyle = pal.text;
    ctx.font = "bold 28px Noto Sans, Arial, sans-serif";
    y = wrapCanvasText(ctx, `💡 ${summaries.oneSentence}`, 72, y, W - 144, 40, 4);

    y += 20;
    ctx.fillStyle = pal.sub;
    ctx.font = "400 25px Noto Sans, Arial, sans-serif";
    wrapCanvasText(ctx, summaries.shortParagraph || dtData.commentary || "", 72, y, W - 144, 36, 6);

    ctx.fillStyle = pal.accent;
    ctx.font = "bold 22px Noto Sans, Arial, sans-serif";
    ctx.fillText("DFWol.org • FR & EN • wol.jw.org • jw.org", 72, H - 76);

    return canvasEl.toDataURL("image/png");
  }

  function wrapCanvasText(ctx, text, x, startY, maxWidth, lineHeight, maxLines) {
    const words = String(text || "").split(/\s+/);
    let line = "";
    let y = startY;
    let linesCount = 0;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      if (ctx.measureText(testLine).width > maxWidth && i > 0) {
        linesCount++;
        if (maxLines && linesCount >= maxLines) {
          ctx.fillText(line.trim() + "…", x, y);
          return y + lineHeight;
        }
        ctx.fillText(line.trim(), x, y);
        line = words[i] + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line.trim()) {
      ctx.fillText(line.trim(), x, y);
      y += lineHeight;
    }
    return y;
  }

  return {
    CAPACITOR_WIDGET_KEY,
    buildWolDailyTextUrl,
    formatDateHuman,
    generateDailyTextSummaries,
    getDailyTextForDate,
    syncWithCapacitorNativeWidget,
    generateWidgetPngCard
  };
})();
