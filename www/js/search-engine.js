/* ==========================================================================
   DFWol Studio — Moteur de Recherche Tout-en-un (JW.org API + WOL Booléen)
   Nettoyage strict des entités HTML (&nbsp;) & Recherche Totale
   ========================================================================== */

window.DFWolSearch = (function () {
  "use strict";

  const SCOPE_MODIFIERS = {
    all: {
      label: "Tout (Vidéos, Publications, Bible, Audio, Index)",
      jwSlug: "all",
      wolExtraQuery: ""
    },
    videos: {
      label: "Vidéos & Sous-titres",
      jwSlug: "videos",
      wolExtraQuery: ""
    },
    publications: {
      label: "Publications (Tour de Garde, Livres, Brochures)",
      jwSlug: "publications",
      wolExtraQuery: ""
    },
    bible: {
      label: "Bible d'étude (nwtsty)",
      jwSlug: "bible",
      wolExtraQuery: ""
    },
    audio: {
      label: "Audio & Cantiques",
      jwSlug: "audio",
      wolExtraQuery: ""
    },
    indexes: {
      label: "Index & Guide de recherche",
      jwSlug: "indexes",
      wolExtraQuery: ""
    },
    it: {
      label: "Étude perspicace des Écritures (it)",
      jwSlug: "publications",
      wolExtraQuery: ' & ("Étude perspicace" | it-1 | it-2)',
      wolExtraQueryEn: ' & ("Insight" | it-1 | it-2)'
    },
    qreaders: {
      label: "Questions des lecteurs",
      jwSlug: "publications",
      wolExtraQuery: ' & #"Questions des lecteurs"',
      wolExtraQueryEn: ' & #"Questions From Readers"'
    },
    biographies: {
      label: "Biographies / Récits de vie",
      jwSlug: "publications",
      wolExtraQuery: ' & (#"Biographie" | "récit de vie")',
      wolExtraQueryEn: ' & #"Life Story"'
    }
  };

  let decodeTextarea = null;

  function decodeEntitiesOnce(str) {
    if (!str) return "";
    if (typeof document === "undefined") {
      return String(str)
        .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&rsquo;/gi, "'");
    }
    if (!decodeTextarea) decodeTextarea = document.createElement("textarea");
    decodeTextarea.innerHTML = String(str);
    return decodeTextarea.value;
  }

  /**
   * Décode récursivement les entités HTML (&nbsp;, &amp;nbsp;, &rsquo;, etc.),
   * supprime les espaces insécables (\u00a0, \u202f, \u200b) et normalise les espaces.
   */
  function cleanText(str) {
    if (str === null || str === undefined) return "";
    let s = String(str);
    // 2 passes pour gérer les entités doublement encodées (&amp;nbsp;)
    s = decodeEntitiesOnce(s);
    s = decodeEntitiesOnce(s);
    return s
      .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
      .replace(/[\u00a0\u202f\u200b\ufeff]/g, " ")
      .replace(/[ \t\r\n]+/g, " ")
      .trim();
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Nettoie un extrait HTML provenant d'API/WOL via DOMParser en ne conservant que <strong>
   * et en supprimant toute entité brute (&nbsp;).
   */
  function sanitizeSnippetHtml(raw) {
    if (!raw) return "";
    if (typeof DOMParser === "undefined") {
      return escapeHtml(cleanText(String(raw).replace(/<[^>]+>/g, " ")));
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${String(raw)}</div>`, "text/html");
      const root = doc.body.firstElementChild;
      if (!root) return escapeHtml(cleanText(raw));

      const serializeClean = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return escapeHtml(cleanText(node.nodeValue || ""));
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          const inner = Array.from(node.childNodes).map(serializeClean).join(" ");
          if (node.tagName === "STRONG" || node.tagName === "B") {
            return `<strong>${inner.trim()}</strong>`;
          }
          return inner;
        }
        return "";
      };

      return Array.from(root.childNodes)
        .map(serializeClean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    } catch (_) {
      return escapeHtml(cleanText(raw));
    }
  }

  function buildSearchUrls({ query = "", proximity = "par", sort = "occ", scope = "all", lang = "fr" }) {
    const cfg = window.DFWolBible.getLangConfig(lang);
    const scopeObj = SCOPE_MODIFIERS[scope] || SCOPE_MODIFIERS.all;
    const rawQ = (query || "").trim();

    let finalWolQuery = rawQ;
    const extra = lang === "en" && scopeObj.wolExtraQueryEn ? scopeObj.wolExtraQueryEn : scopeObj.wolExtraQuery;
    if (rawQ && extra && !rawQ.includes(extra.trim())) {
      finalWolQuery = `(${rawQ})${extra}`;
    }

    const wolUrl = `https://wol.jw.org/${cfg.code}/wol/s/${cfg.r}/${cfg.lp}?q=${encodeURIComponent(finalWolQuery)}&p=${encodeURIComponent(proximity)}&r=${encodeURIComponent(sort)}`;

    const jwCleanQuery = rawQ
      .replace(/#/g, "")
      .replace(/\s+\|\s+/g, " OR ")
      .replace(/\s+&\s+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const jwUrl = `https://www.jw.org/${cfg.code}/${cfg.jwSearchPath}/?q=${encodeURIComponent(jwCleanQuery)}&filter=${encodeURIComponent(scopeObj.jwSlug || "all")}`;

    return {
      rawQuery: rawQ,
      finalWolQuery,
      jwCleanQuery,
      wolUrl,
      jwUrl,
      langConfig: cfg,
      scopeLabel: scopeObj.label,
      jwSlug: scopeObj.jwSlug || "all"
    };
  }

  function explainWolQuery({ query = "", proximity = "par", sort = "occ", scope = "all" }) {
    const q = (query || "").trim();
    if (!q) {
      return "Tapez n'importe quel sujet, mot-clé, phrase de vidéo ou expression booléenne WOL (<code>&amp;</code>, <code>|</code>, <code>!</code>, <code>&quot;…&quot;</code>, <code>*</code>, <code>#</code>).";
    }

    const singleVerse = window.DFWolBible.parseSingleVerseQuery(q);
    if (singleVerse) {
      return `📖 <strong>Verset détecté :</strong> <code>${escapeHtml(singleVerse.label)}</code> — Ouverture directe dans le lecteur biblique intégré + extraction du Guide de recherche.`;
    }

    const parts = [];
    const exactMatches = q.match(/"([^"]+)"/g);
    if (exactMatches && exactMatches.length > 0) parts.push(`Exact : <strong>${escapeHtml(exactMatches.join(", "))}</strong>`);
    if (q.includes("#")) parts.push(`Titres uniquement (<code>#</code>)`);
    const exclusions = q.match(/![A-Za-zÀ-ÖØ-öø-ÿ0-9*"?]+/g);
    if (exclusions && exclusions.length > 0) parts.push(`Exclut : <code>${escapeHtml(exclusions.join(", "))}</code>`);
    if (q.includes("|")) parts.push(`Logique <strong>OU</strong> (<code>|</code>)`);
    if (q.includes("&")) parts.push(`Logique <strong>ET</strong> (<code>&amp;</code>)`);
    if (q.includes("*") || q.includes("?")) parts.push(`Troncature (<code>*</code>/<code>?</code>)`);

    const proxMap = { par: "même paragraphe", sen: "même phrase", doc: "même document" };
    const sortMap = { occ: "pertinence", newest: "plus récent", oldest: "plus ancien" };
    const scopeObj = SCOPE_MODIFIERS[scope] || SCOPE_MODIFIERS.all;

    return `${parts.length ? parts.join(" • ") + " • " : ""}<strong>${scopeObj.label}</strong> (WOL : ${proxMap[proximity] || "même paragraphe"}, tri ${sortMap[sort] || "pertinence"}).`;
  }

  function flattenJwResults(apiJson) {
    const out = [];
    const walk = (node, parentGroupLabel = "") => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach((child) => walk(child, parentGroupLabel));
        return;
      }
      if (node.type === "item") {
        out.push({
          source: "jw-api",
          subtype: node.subtype || "article",
          title: cleanText(node.title || "Sans titre"),
          context: cleanText(node.context || parentGroupLabel || ""),
          snippetHtml: sanitizeSnippetHtml(node.snippet || ""),
          lank: node.lank || "",
          imageUrl: (node.image && node.image.url) || "",
          wolUrl: (node.links && node.links.wol) || "",
          jwUrl: (node.links && node.links["jw.org"]) || "",
          deepLinks: Array.isArray(node.deepLinks) ? node.deepLinks : []
        });
        return;
      }
      if (node.type === "group" && Array.isArray(node.results)) {
        walk(node.results, node.label || parentGroupLabel);
      }
    };
    if (apiJson && apiJson.results) {
      walk(apiJson.results, "");
    }
    return out;
  }

  function parseWolSearchHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const items = [];

    const resultNodes = doc.querySelectorAll("ul.results > li, .results .result");
    for (let i = 0; i < resultNodes.length; i++) {
      const el = resultNodes[i];
      if (el.classList.contains("caption")) {
        const linkEl = el.querySelector("a.lnk, a");
        if (!linkEl) continue;
        const title = cleanText(linkEl.textContent || "");
        let href = linkEl.getAttribute("href") || "";
        if (!title || !href) continue;
        if (href.startsWith("/")) href = `https://wol.jw.org${href}`;

        let snippet = "";
        let context = "";
        const nextEl = el.nextElementSibling;
        if (nextEl && !nextEl.classList.contains("caption")) {
          const docEl = nextEl.querySelector(".document, .snippet, p");
          snippet = docEl ? cleanText(docEl.textContent || "") : "";
          const refEl = nextEl.querySelector(".ref, .publication");
          context = refEl ? cleanText(refEl.textContent || "") : "";
        }

        items.push({
          source: "wol-html",
          subtype: "article",
          title,
          context: context || "WOL.jw.org",
          snippetHtml: escapeHtml(snippet.slice(0, 260)),
          lank: "",
          imageUrl: "",
          wolUrl: href,
          jwUrl: "",
          deepLinks: []
        });
        if (items.length >= 25) break;
      }
    }

    if (items.length === 0) {
      doc.querySelectorAll("a.lnk").forEach((a) => {
        if (items.length >= 20) return;
        const title = cleanText(a.textContent || "");
        let href = a.getAttribute("href") || "";
        if (!title || !href) return;
        if (href.startsWith("/")) href = `https://wol.jw.org${href}`;
        items.push({
          source: "wol-html",
          subtype: "article",
          title,
          context: "WOL.jw.org",
          snippetHtml: "",
          lank: "",
          imageUrl: "",
          wolUrl: href,
          jwUrl: "",
          deepLinks: []
        });
      });
    }

    return items;
  }

  async function runUnifiedSearch({
    query = "",
    scope = "all",
    proximity = "par",
    sort = "occ",
    lang = "fr",
    engine = "auto",
    offset = 0
  }) {
    const urls = buildSearchUrls({ query, proximity, sort, scope, lang });
    const hasBooleanOps = /[&|!*?#"]/.test(query);
    const shouldFetchWol = engine === "wol" || (engine === "auto" && hasBooleanOps);
    const shouldFetchJw = engine !== "wol" || !hasBooleanOps;

    let jwItems = [];
    let wolItems = [];
    const errors = [];

    const tasks = [];

    if (shouldFetchJw && urls.jwCleanQuery) {
      tasks.push(
        window.DFWolNet.jwSearch(urls.jwSlug, urls.jwCleanQuery, lang, 24, offset)
          .then((json) => {
            jwItems = flattenJwResults(json);
          })
          .catch((err) => errors.push(err.message))
      );
    }

    if (shouldFetchWol && urls.finalWolQuery) {
      tasks.push(
        window.DFWolNet.fetchWolHtml(urls.wolUrl)
          .then((res) => {
            wolItems = parseWolSearchHtml(res.html);
          })
          .catch((err) => errors.push(err.message))
      );
    }

    await Promise.all(tasks);

    return {
      urls,
      jwItems,
      wolItems,
      errors
    };
  }

  return {
    SCOPE_MODIFIERS,
    cleanText,
    escapeHtml,
    sanitizeSnippetHtml,
    buildSearchUrls,
    explainWolQuery,
    runUnifiedSearch
  };
})();
