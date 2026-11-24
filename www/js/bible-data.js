/* ==========================================================================
   DFWol Studio — Base de données des 66 Livres Bibliques (FR & EN),
   Analyseur Intelligent de Références & Calculateur de Semaines ISO
   ========================================================================== */

window.DFWolBible = (function () {
  "use strict";

  // Configuration officielle strictement FR & EN pour WOL.jw.org et JW.org
  const WOL_LANG_CONFIG = {
    fr: {
      code: "fr",
      label: "Français",
      flag: "🇫🇷",
      r: "r30",
      lp: "lp-f",
      wtlocale: "F",
      jwSearchPath: "rechercher",
      wolHome: "https://wol.jw.org/fr/wol/h/r30/lp-f",
      jwHome: "https://www.jw.org/fr/"
    },
    en: {
      code: "en",
      label: "English",
      flag: "🇬🇧",
      r: "r1",
      lp: "lp-e",
      wtlocale: "E",
      jwSearchPath: "search",
      wolHome: "https://wol.jw.org/en/wol/h/r1/lp-e",
      jwHome: "https://www.jw.org/en/"
    }
  };

  // Les 66 livres canoniques avec numérotation standard JW/WOL (1 à 66)
  const BIBLE_BOOKS = [
    { num: 1, name: "Genèse", nameEn: "Genesis", abbr: "Gn", abbrEn: "Ge", chapters: 50, section: "hebrew", group: "pentateuch", aliases: ["genese", "gen", "gn", "ge", "genesis"] },
    { num: 2, name: "Exode", nameEn: "Exodus", abbr: "Ex", abbrEn: "Ex", chapters: 40, section: "hebrew", group: "pentateuch", aliases: ["exode", "ex", "exo", "exodus"] },
    { num: 3, name: "Lévitique", nameEn: "Leviticus", abbr: "Lv", abbrEn: "Le", chapters: 27, section: "hebrew", group: "pentateuch", aliases: ["levitique", "lv", "lev", "le", "leviticus"] },
    { num: 4, name: "Nombres", nameEn: "Numbers", abbr: "Nb", abbrEn: "Nu", chapters: 36, section: "hebrew", group: "pentateuch", aliases: ["nombres", "nb", "nom", "nu", "num", "numbers"] },
    { num: 5, name: "Deutéronome", nameEn: "Deuteronomy", abbr: "Dt", abbrEn: "De", chapters: 34, section: "hebrew", group: "pentateuch", aliases: ["deuteronome", "dt", "deut", "de", "deuteronomy"] },
    { num: 6, name: "Josué", nameEn: "Joshua", abbr: "Jos", abbrEn: "Jos", chapters: 24, section: "hebrew", group: "historical", aliases: ["josue", "jos", "josh", "joshua"] },
    { num: 7, name: "Juges", nameEn: "Judges", abbr: "Jg", abbrEn: "Jg", chapters: 21, section: "hebrew", group: "historical", aliases: ["juges", "jg", "jug", "jdg", "judges"] },
    { num: 8, name: "Ruth", nameEn: "Ruth", abbr: "Ru", abbrEn: "Ru", chapters: 4, section: "hebrew", group: "historical", aliases: ["ruth", "rt", "ru"] },
    { num: 9, name: "1 Samuel", nameEn: "1 Samuel", abbr: "1S", abbrEn: "1Sa", chapters: 31, section: "hebrew", group: "historical", aliases: ["1 samuel", "1samuel", "1 sam", "1sam", "1 s", "1s", "1 sa", "1sa"] },
    { num: 10, name: "2 Samuel", nameEn: "2 Samuel", abbr: "2S", abbrEn: "2Sa", chapters: 24, section: "hebrew", group: "historical", aliases: ["2 samuel", "2samuel", "2 sam", "2sam", "2 s", "2s", "2 sa", "2sa"] },
    { num: 11, name: "1 Rois", nameEn: "1 Kings", abbr: "1R", abbrEn: "1Ki", chapters: 22, section: "hebrew", group: "historical", aliases: ["1 rois", "1rois", "1 r", "1r", "1 ki", "1ki", "1 kings"] },
    { num: 12, name: "2 Rois", nameEn: "2 Kings", abbr: "2R", abbrEn: "2Ki", chapters: 25, section: "hebrew", group: "historical", aliases: ["2 rois", "2rois", "2 r", "2r", "2 ki", "2ki", "2 kings"] },
    { num: 13, name: "1 Chroniques", nameEn: "1 Chronicles", abbr: "1Ch", abbrEn: "1Ch", chapters: 29, section: "hebrew", group: "historical", aliases: ["1 chroniques", "1chroniques", "1 ch", "1ch", "1 chr", "1chr", "1 chronicles"] },
    { num: 14, name: "2 Chroniques", nameEn: "2 Chronicles", abbr: "2Ch", abbrEn: "2Ch", chapters: 36, section: "hebrew", group: "historical", aliases: ["2 chroniques", "2chroniques", "2 ch", "2ch", "2 chr", "2chr", "2 chronicles"] },
    { num: 15, name: "Esdras", nameEn: "Ezra", abbr: "Esd", abbrEn: "Ezr", chapters: 10, section: "hebrew", group: "historical", aliases: ["esdras", "esd", "ezr", "ezra"] },
    { num: 16, name: "Néhémie", nameEn: "Nehemiah", abbr: "Né", abbrEn: "Ne", chapters: 13, section: "hebrew", group: "historical", aliases: ["nehemie", "ne", "neh", "nehemiah"] },
    { num: 17, name: "Esther", nameEn: "Esther", abbr: "Est", abbrEn: "Es", chapters: 10, section: "hebrew", group: "historical", aliases: ["esther", "est", "es"] },
    { num: 18, name: "Job", nameEn: "Job", abbr: "Jb", abbrEn: "Job", chapters: 42, section: "hebrew", group: "poetic", aliases: ["job", "jb"] },
    { num: 19, name: "Psaumes", nameEn: "Psalms", abbr: "Ps", abbrEn: "Ps", chapters: 150, section: "hebrew", group: "poetic", aliases: ["psaumes", "psaume", "ps", "psalm", "psalms"] },
    { num: 20, name: "Proverbes", nameEn: "Proverbs", abbr: "Pr", abbrEn: "Pr", chapters: 31, section: "hebrew", group: "poetic", aliases: ["proverbes", "proverbe", "pr", "prov", "proverbs"] },
    { num: 21, name: "Ecclésiaste", nameEn: "Ecclesiastes", abbr: "Ec", abbrEn: "Ec", chapters: 12, section: "hebrew", group: "poetic", aliases: ["ecclesiaste", "ec", "ecc", "eccl", "ecclesiastes"] },
    { num: 22, name: "Chant de Salomon", nameEn: "Song of Solomon", abbr: "Ct", abbrEn: "Ca", chapters: 8, section: "hebrew", group: "poetic", aliases: ["chant de salomon", "cantique des cantiques", "ct", "cant", "ca", "song of solomon", "song"] },
    { num: 23, name: "Isaïe", nameEn: "Isaiah", abbr: "Is", abbrEn: "Isa", chapters: 66, section: "hebrew", group: "prophets", aliases: ["isaie", "esaie", "is", "isa", "isaiah"] },
    { num: 24, name: "Jérémie", nameEn: "Jeremiah", abbr: "Jr", abbrEn: "Jer", chapters: 52, section: "hebrew", group: "prophets", aliases: ["jeremie", "jr", "jer", "je", "jeremiah"] },
    { num: 25, name: "Lamentations", nameEn: "Lamentations", abbr: "Lm", abbrEn: "La", chapters: 5, section: "hebrew", group: "prophets", aliases: ["lamentations", "lm", "lam", "la"] },
    { num: 26, name: "Ézéchiel", nameEn: "Ezekiel", abbr: "Éz", abbrEn: "Eze", chapters: 48, section: "hebrew", group: "prophets", aliases: ["ezechiel", "ez", "eze", "ezk", "ezekiel"] },
    { num: 27, name: "Daniel", nameEn: "Daniel", abbr: "Dn", abbrEn: "Da", chapters: 12, section: "hebrew", group: "prophets", aliases: ["daniel", "dn", "dan", "da"] },
    { num: 28, name: "Osée", nameEn: "Hosea", abbr: "Os", abbrEn: "Ho", chapters: 14, section: "hebrew", group: "prophets", aliases: ["osee", "os", "hos", "ho", "hosea"] },
    { num: 29, name: "Joël", nameEn: "Joel", abbr: "Jl", abbrEn: "Joe", chapters: 3, section: "hebrew", group: "prophets", aliases: ["joel", "jl", "joe"] },
    { num: 30, name: "Amos", nameEn: "Amos", abbr: "Am", abbrEn: "Am", chapters: 9, section: "hebrew", group: "prophets", aliases: ["amos", "am"] },
    { num: 31, name: "Abdias", nameEn: "Obadiah", abbr: "Ab", abbrEn: "Ob", chapters: 1, section: "hebrew", group: "prophets", aliases: ["abdias", "ab", "abd", "ob", "obadiah"] },
    { num: 32, name: "Jonas", nameEn: "Jonah", abbr: "Jon", abbrEn: "Jon", chapters: 4, section: "hebrew", group: "prophets", aliases: ["jonas", "jon", "jnh", "jonah"] },
    { num: 33, name: "Michée", nameEn: "Micah", abbr: "Mi", abbrEn: "Mic", chapters: 7, section: "hebrew", group: "prophets", aliases: ["michee", "mi", "mic", "micah"] },
    { num: 34, name: "Nahoum", nameEn: "Nahum", abbr: "Na", abbrEn: "Na", chapters: 3, section: "hebrew", group: "prophets", aliases: ["nahoum", "nahum", "na", "nah"] },
    { num: 35, name: "Habacuc", nameEn: "Habakkuk", abbr: "Hab", abbrEn: "Hab", chapters: 3, section: "hebrew", group: "prophets", aliases: ["habacuc", "habakouk", "hab", "ha", "habakkuk"] },
    { num: 36, name: "Sophonie", nameEn: "Zephaniah", abbr: "Sph", abbrEn: "Zep", chapters: 3, section: "hebrew", group: "prophets", aliases: ["sophonie", "so", "sph", "soph", "zep", "zephaniah"] },
    { num: 37, name: "Aggée", nameEn: "Haggai", abbr: "Ag", abbrEn: "Hag", chapters: 2, section: "hebrew", group: "prophets", aliases: ["aggee", "ag", "agg", "hag", "haggai"] },
    { num: 38, name: "Zacharie", nameEn: "Zechariah", abbr: "Za", abbrEn: "Zec", chapters: 14, section: "hebrew", group: "prophets", aliases: ["zacharie", "za", "zach", "zec", "zechariah"] },
    { num: 39, name: "Malachie", nameEn: "Malachi", abbr: "Ml", abbrEn: "Mal", chapters: 4, section: "hebrew", group: "prophets", aliases: ["malachie", "ml", "mal", "malachi"] },

    { num: 40, name: "Matthieu", nameEn: "Matthew", abbr: "Mt", abbrEn: "Mt", chapters: 28, section: "greek", group: "gospels", aliases: ["matthieu", "mt", "mat", "matt", "matthew"] },
    { num: 41, name: "Marc", nameEn: "Mark", abbr: "Mc", abbrEn: "Mr", chapters: 16, section: "greek", group: "gospels", aliases: ["marc", "mc", "mr", "mrk", "mark"] },
    { num: 42, name: "Luc", nameEn: "Luke", abbr: "Lc", abbrEn: "Lu", chapters: 24, section: "greek", group: "gospels", aliases: ["luc", "lc", "lu", "luk", "luke"] },
    { num: 43, name: "Jean", nameEn: "John", abbr: "Jean", abbrEn: "Joh", chapters: 21, section: "greek", group: "gospels", aliases: ["jean", "jn", "jhn", "joh", "john"] },
    { num: 44, name: "Actes", nameEn: "Acts", abbr: "Ac", abbrEn: "Ac", chapters: 28, section: "greek", group: "acts", aliases: ["actes", "ac", "act", "acts"] },
    { num: 45, name: "Romains", nameEn: "Romans", abbr: "Rm", abbrEn: "Ro", chapters: 16, section: "greek", group: "letters", aliases: ["romains", "rm", "rom", "ro", "romans"] },
    { num: 46, name: "1 Corinthiens", nameEn: "1 Corinthians", abbr: "1Co", abbrEn: "1Co", chapters: 16, section: "greek", group: "letters", aliases: ["1 corinthiens", "1corinthiens", "1 co", "1co", "1 cor", "1cor", "1 corinthians"] },
    { num: 47, name: "2 Corinthiens", nameEn: "2 Corinthians", abbr: "2Co", abbrEn: "2Co", chapters: 13, section: "greek", group: "letters", aliases: ["2 corinthiens", "2corinthiens", "2 co", "2co", "2 cor", "2cor", "2 corinthians"] },
    { num: 48, name: "Galates", nameEn: "Galatians", abbr: "Ga", abbrEn: "Ga", chapters: 6, section: "greek", group: "letters", aliases: ["galates", "ga", "gal", "galatians"] },
    { num: 49, name: "Éphésiens", nameEn: "Ephesians", abbr: "Ép", abbrEn: "Eph", chapters: 6, section: "greek", group: "letters", aliases: ["ephesiens", "ep", "eph", "ephesians"] },
    { num: 50, name: "Philippiens", nameEn: "Philippians", abbr: "Php", abbrEn: "Php", chapters: 4, section: "greek", group: "letters", aliases: ["philippiens", "php", "phil", "ph", "philippians"] },
    { num: 51, name: "Colossiens", nameEn: "Colossians", abbr: "Col", abbrEn: "Col", chapters: 4, section: "greek", group: "letters", aliases: ["colossiens", "col", "co", "colossians"] },
    { num: 52, name: "1 Thessaloniciens", nameEn: "1 Thessalonians", abbr: "1Th", abbrEn: "1Th", chapters: 5, section: "greek", group: "letters", aliases: ["1 thessaloniciens", "1thessaloniciens", "1 th", "1th", "1 thess", "1thess", "1 thessalonians"] },
    { num: 53, name: "2 Thessaloniciens", nameEn: "2 Thessalonians", abbr: "2Th", abbrEn: "2Th", chapters: 3, section: "greek", group: "letters", aliases: ["2 thessaloniciens", "2thessaloniciens", "2 th", "2th", "2 thess", "2thess", "2 thessalonians"] },
    { num: 54, name: "1 Timothée", nameEn: "1 Timothy", abbr: "1Tm", abbrEn: "1Ti", chapters: 6, section: "greek", group: "letters", aliases: ["1 timothee", "1timothee", "1 tm", "1tm", "1 tim", "1tim", "1 ti", "1ti", "1 timothy"] },
    { num: 55, name: "2 Timothée", nameEn: "2 Timothy", abbr: "2Tm", abbrEn: "2Ti", chapters: 4, section: "greek", group: "letters", aliases: ["2 timothee", "2timothee", "2 tm", "2tm", "2 tim", "2tim", "2 ti", "2ti", "2 timothy"] },
    { num: 56, name: "Tite", nameEn: "Titus", abbr: "Tt", abbrEn: "Tit", chapters: 3, section: "greek", group: "letters", aliases: ["tite", "tt", "tit", "ti", "titus"] },
    { num: 57, name: "Philémon", nameEn: "Philemon", abbr: "Phm", abbrEn: "Phm", chapters: 1, section: "greek", group: "letters", aliases: ["philemon", "phm", "phlm"] },
    { num: 58, name: "Hébreux", nameEn: "Hebrews", abbr: "Hé", abbrEn: "Heb", chapters: 13, section: "greek", group: "letters", aliases: ["hebreux", "he", "heb", "hebrews"] },
    { num: 59, name: "Jacques", nameEn: "James", abbr: "Jc", abbrEn: "Jas", chapters: 5, section: "greek", group: "letters", aliases: ["jacques", "jc", "jac", "jas", "james"] },
    { num: 60, name: "1 Pierre", nameEn: "1 Peter", abbr: "1P", abbrEn: "1Pe", chapters: 5, section: "greek", group: "letters", aliases: ["1 pierre", "1pierre", "1 p", "1p", "1 pi", "1pi", "1 pe", "1pe", "1 pet", "1 peter"] },
    { num: 61, name: "2 Pierre", nameEn: "2 Peter", abbr: "2P", abbrEn: "2Pe", chapters: 3, section: "greek", group: "letters", aliases: ["2 pierre", "2pierre", "2 p", "2p", "2 pi", "2pi", "2 pe", "2pe", "2 pet", "2 peter"] },
    { num: 62, name: "1 Jean", nameEn: "1 John", abbr: "1J", abbrEn: "1Jo", chapters: 5, section: "greek", group: "letters", aliases: ["1 jean", "1jean", "1 j", "1j", "1 jn", "1jn", "1 jo", "1 john"] },
    { num: 63, name: "2 Jean", nameEn: "2 John", abbr: "2J", abbrEn: "2Jo", chapters: 1, section: "greek", group: "letters", aliases: ["2 jean", "2jean", "2 j", "2j", "2 jn", "2jn", "2 jo", "2 john"] },
    { num: 64, name: "3 Jean", nameEn: "3 John", abbr: "3J", abbrEn: "3Jo", chapters: 1, section: "greek", group: "letters", aliases: ["3 jean", "3jean", "3 j", "3j", "3 jn", "3jn", "3 jo", "3 john"] },
    { num: 65, name: "Jude", nameEn: "Jude", abbr: "Jd", abbrEn: "Jude", chapters: 1, section: "greek", group: "letters", aliases: ["jude", "jd", "jud"] },
    { num: 66, name: "Révélation", nameEn: "Revelation", abbr: "Ré", abbrEn: "Re", chapters: 22, section: "greek", group: "revelation", aliases: ["revelation", "apocalypse", "rev", "re", "ap", "apoc"] }
  ];

  function normalizeStr(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const ALIAS_MAP = new Map();
  BIBLE_BOOKS.forEach((book) => {
    ALIAS_MAP.set(normalizeStr(book.name), book);
    ALIAS_MAP.set(normalizeStr(book.nameEn), book);
    ALIAS_MAP.set(normalizeStr(book.abbr), book);
    ALIAS_MAP.set(normalizeStr(book.abbrEn), book);
    book.aliases.forEach((al) => ALIAS_MAP.set(normalizeStr(al), book));
  });

  function findBookByName(rawName) {
    const clean = normalizeStr(rawName);
    if (!clean) return null;
    if (ALIAS_MAP.has(clean)) return ALIAS_MAP.get(clean);
    if (clean.length >= 3) {
      for (const book of BIBLE_BOOKS) {
        if (normalizeStr(book.name).startsWith(clean) || normalizeStr(book.nameEn).startsWith(clean)) {
          return book;
        }
      }
    }
    return null;
  }

  function getBookByNumber(num) {
    return BIBLE_BOOKS.find((b) => b.num === Number(num)) || BIBLE_BOOKS[0];
  }

  function getBookDisplayName(book, langCode = "fr") {
    return langCode === "en" ? book.nameEn : book.name;
  }

  function getLangConfig(langCode) {
    return WOL_LANG_CONFIG[langCode === "en" ? "en" : "fr"];
  }

  function formatJwBibleCode(bookNum, chapter, verse) {
    const bb = String(bookNum).padStart(2, "0");
    const ccc = String(chapter || 1).padStart(3, "0");
    const vvv = String(verse || 1).padStart(3, "0");
    return `${bb}${ccc}${vvv}`;
  }

  function buildScriptureLinks(bookNum, chapter, verseStart, verseEnd, langCode = "fr") {
    const cfg = getLangConfig(langCode);
    const book = getBookByNumber(bookNum);
    const ch = Math.max(1, Math.min(book.chapters, Number(chapter) || 1));
    const vStart = verseStart ? Math.max(1, Number(verseStart)) : null;
    const vEnd = verseEnd && Number(verseEnd) > vStart ? Number(verseEnd) : null;

    let wolBibleUrl = `https://wol.jw.org/${cfg.code}/wol/b/${cfg.r}/${cfg.lp}/nwtsty/${book.num}/${ch}`;
    if (vStart) {
      wolBibleUrl += `#study=discover&v=${book.num}:${ch}:${vStart}`;
      if (vEnd) {
        wolBibleUrl += `-${book.num}:${ch}:${vEnd}`;
      }
    }

    const startCode = formatJwBibleCode(book.num, ch, vStart || 1);
    const jwCode = vEnd ? `${startCode}-${formatJwBibleCode(book.num, ch, vEnd)}` : startCode;
    const jwFinderUrl = `https://www.jw.org/finder?wtlocale=${cfg.wtlocale}&prefer=lang&bible=${jwCode}&pub=nwtsty`;
    const jwLibraryUrl = `jwlibrary:///finder?bible=${jwCode}`;

    const displayBookName = getBookDisplayName(book, cfg.code);
    const refQuery = vStart ? `"${displayBookName} ${ch}:${vStart}"` : `"${displayBookName} ${ch}"`;
    const wolCommentarySearchUrl = `https://wol.jw.org/${cfg.code}/wol/s/${cfg.r}/${cfg.lp}?q=${encodeURIComponent(refQuery)}&p=par&r=occ`;

    let label = `${displayBookName} ${ch}`;
    if (vStart) {
      label += `:${vStart}`;
      if (vEnd) label += `-${vEnd}`;
    }

    return {
      book,
      bookNum: book.num,
      chapter: ch,
      verseStart: vStart,
      verseEnd: vEnd,
      label,
      jwCode,
      wolBibleUrl,
      jwFinderUrl,
      jwLibraryUrl,
      wolCommentarySearchUrl
    };
  }

  const SCRIPTURE_REGEX = /\b((?:[123]\s*)?[A-Za-zÀ-ÖØ-öø-ÿ]{2,18}\.?)\s+(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3})|\s*,\s*(\d{1,3}))?)?\b/g;

  function parseScriptureReferences(text, langCode = "fr") {
    if (!text || typeof text !== "string") return [];
    const results = [];
    const seenKeys = new Set();

    let match;
    SCRIPTURE_REGEX.lastIndex = 0;
    while ((match = SCRIPTURE_REGEX.exec(text)) !== null) {
      const rawBook = match[1];
      const rawChapter = parseInt(match[2], 10);
      const rawVerseStart = match[3] ? parseInt(match[3], 10) : null;
      const rawVerseRangeEnd = match[4] ? parseInt(match[4], 10) : null;
      const rawVerseCommaEnd = match[5] ? parseInt(match[5], 10) : null;

      const book = findBookByName(rawBook);
      if (!book) continue;
      if (rawChapter < 1 || rawChapter > book.chapters) continue;

      const vEnd = rawVerseRangeEnd || rawVerseCommaEnd || null;
      const key = `${book.num}:${rawChapter}:${rawVerseStart || 0}-${vEnd || 0}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const linkData = buildScriptureLinks(book.num, rawChapter, rawVerseStart, vEnd, langCode);
      linkData.rawMatch = match[0];
      results.push(linkData);
    }

    return results;
  }

  /**
   * Analyseur avancé pour l'extraction en lot du Guide de recherche :
   * Supporte les plages de versets (ex: Ps 83:15-18 -> versets 15,16,17,18) et listes séparées par virgules (ex: Rom 12:1, 2).
   */
  function parseRangeOrBatchReferences(text, langCode = "fr", expandRanges = true) {
    const baseRefs = parseScriptureReferences(text, langCode);
    if (!expandRanges) return baseRefs;

    const expanded = [];
    const seen = new Set();

    baseRefs.forEach((ref) => {
      if (ref.verseStart && ref.verseEnd && ref.verseEnd > ref.verseStart && ref.verseEnd - ref.verseStart <= 25) {
        for (let v = ref.verseStart; v <= ref.verseEnd; v++) {
          const k = `${ref.bookNum}:${ref.chapter}:${v}`;
          if (!seen.has(k)) {
            seen.add(k);
            expanded.push(buildScriptureLinks(ref.bookNum, ref.chapter, v, null, langCode));
          }
        }
      } else {
        const k = `${ref.bookNum}:${ref.chapter}:${ref.verseStart || 1}`;
        if (!seen.has(k)) {
          seen.add(k);
          expanded.push(buildScriptureLinks(ref.bookNum, ref.chapter, ref.verseStart || 1, null, langCode));
        }
      }
    });

    return expanded;
  }

  function parseSingleVerseQuery(input, langCode = "fr") {
    const trimmed = (input || "").trim();
    if (!trimmed || /[&|!*?#"]/.test(trimmed)) return null;
    const refs = parseScriptureReferences(trimmed, langCode);
    if (refs.length === 1 && trimmed.length <= 36) {
      return refs[0];
    }
    return null;
  }

  function expandScriptureRefFull(rawRef, langCode = "fr") {
    const input = String(rawRef || "").trim();
    if (!input) return input;
    return input.replace(SCRIPTURE_REGEX, (fullMatch, rawBook, rawCh, rawV1, rawV2, rawV3) => {
      const book = findBookByName(rawBook);
      const ch = parseInt(rawCh, 10);
      if (!book || ch < 1 || ch > book.chapters) return fullMatch;
      let fullName = getBookDisplayName(book, langCode);
      if (book.num === 19) {
        fullName = langCode === "en" ? "Psalm" : "Psaume";
      }
      let res = `${fullName} ${ch}`;
      if (rawV1) {
        res += `:${rawV1}`;
        if (rawV2) res += `-${rawV2}`;
        else if (rawV3) res += `, ${rawV3}`;
      }
      return res;
    });
  }

  /**
   * Transforme toutes les références bibliques d'un texte échappé en liens interactifs IN-APP
   */
  function linkifyScripturesInHtml(escapedHtmlText, langCode = "fr") {
    if (!escapedHtmlText) return "";
    return escapedHtmlText.replace(SCRIPTURE_REGEX, (fullMatch, rawBook, rawCh, rawV1, rawV2, rawV3) => {
      const book = findBookByName(rawBook);
      const ch = parseInt(rawCh, 10);
      if (!book || ch < 1 || ch > book.chapters) return fullMatch;
      const v1 = rawV1 ? parseInt(rawV1, 10) : 1;
      const vEnd = rawV2 ? parseInt(rawV2, 10) : rawV3 ? parseInt(rawV3, 10) : null;
      const links = buildScriptureLinks(book.num, ch, v1, vEnd, langCode);
      return `<a href="${links.wolBibleUrl}" data-inapp-bible="${book.num}:${ch}:${v1}" class="inline-scripture-link" title="Lire ${links.label} dans DFWol">📖 ${fullMatch}</a>`;
    });
  }

  /**
   * Analyse une URL WOL ou JW.org pour déterminer comment l'ouvrir directement dans l'application
   * sans jamais sortir vers Chrome / JW.org ni ouvrir DFWol dans lui-même.
   */
  function parseWolUrlTarget(rawUrl, defaultLang = "fr") {
    if (!rawUrl) return { type: "external", url: rawUrl };
    let urlStr = String(rawUrl).trim();

    if (urlStr.startsWith("#")) {
      return { type: "anchor", hash: urlStr };
    }

    // Convertir toute URL relative WOL (/fr/wol/..., /en/wol/..., /wol/...) en URL absolue wol.jw.org
    if (/^\/(?:fr|en)\/wol\/|^\/wol\//i.test(urlStr)) {
      urlStr = `https://wol.jw.org${urlStr}`;
    }

    // Convertir URL webpubvid://?pub=jwb-130&track=5 en lank vidéo Mediator
    if (urlStr.startsWith("webpubvid://")) {
      const mPub = urlStr.match(/[?&]pub=([^&#]+)/i);
      const mTrk = urlStr.match(/[?&]track=(\d+)/i);
      const mLank = urlStr.match(/[?&]lank=([^&#]+)/i);
      if (mLank) {
        return { type: "video", lank: decodeURIComponent(mLank[1]), lang: /wtlocale=E|langwritten=E/i.test(urlStr) ? "en" : defaultLang };
      }
      if (mPub) {
        const pub = decodeURIComponent(mPub[1]);
        const trk = mTrk ? `_${mTrk[1]}` : "";
        return {
          type: "video",
          lank: `pub-${pub}${trk}_VIDEO`,
          lang: /langwritten=E|wtlocale=E/i.test(urlStr) ? "en" : defaultLang
        };
      }
    }

    if (urlStr.startsWith("jwlibrary://")) {
      const mBib = urlStr.match(/bible=(\d{2})(\d{3})(\d{3})/);
      if (mBib) {
        return {
          type: "bible",
          bookNum: parseInt(mBib[1], 10),
          chapter: parseInt(mBib[2], 10),
          verse: parseInt(mBib[3], 10)
        };
      }
    }

    // Liens Vidéos JW.org finder (lank=pub-xxx_VIDEO ou content=video)
    const mLank = urlStr.match(/jw\.org\/(?:finder|open)\?.*?[?&]lank=([^&#]+)/i);
    if (mLank) {
      const lankVal = decodeURIComponent(mLank[1]);
      if (lankVal.endsWith("_VIDEO") || /content=video/i.test(urlStr)) {
        return {
          type: "video",
          lank: lankVal,
          lang: /wtlocale=E/i.test(urlStr) ? "en" : /wtlocale=F/i.test(urlStr) ? "fr" : defaultLang
        };
      }
    }

    // Liens Bible WOL: /wol/b/r30/lp-f/nwtsty/19/83#v=19:83:18
    const mWolBible = urlStr.match(/\/wol\/b\/r\d+\/lp-([a-z]+)\/[^/]+\/(\d+)\/(\d+)(?:.*?[&#]v=(\d+):(\d+):(\d+))?/i);
    if (mWolBible) {
      return {
        type: "bible",
        lang: mWolBible[1] === "e" ? "en" : "fr",
        bookNum: parseInt(mWolBible[2], 10),
        chapter: parseInt(mWolBible[3], 10),
        verse: mWolBible[6] ? parseInt(mWolBible[6], 10) : 1
      };
    }

    // Liens JW.org Finder Bible: bible=BBCCCVVV
    const mJwBib = urlStr.match(/bible=(\d{2})(\d{3})(\d{3})/);
    if (mJwBib) {
      return {
        type: "bible",
        bookNum: parseInt(mJwBib[1], 10),
        chapter: parseInt(mJwBib[2], 10),
        verse: parseInt(mJwBib[3], 10)
      };
    }

    // Notes de bas de page WOL (/wol/fn/)
    if (/\/wol\/fn\//i.test(urlStr)) {
      const fullWol = urlStr.startsWith("http") ? urlStr : `https://wol.jw.org${urlStr}`;
      return { type: "footnote", url: fullWol };
    }

    // Liens /wol/bc/ ou /wol/dx/ (citations versets dans WOL)
    if (/\/wol\/(?:bc|dx)\//i.test(urlStr)) {
      const fullWol = urlStr.startsWith("http") ? urlStr : `https://wol.jw.org${urlStr}`;
      return { type: "wol-bible-redirect", url: fullWol };
    }

    // Toute URL WOL (/wol/d/, /wol/pc/, /wol/finder, /wol/l/, /wol/lv/, /wol/meetings/, /wol/library/, /wol/publication/, /wol/dt/, /wol/h/, /wol/s/)
    if (/^https?:\/\/wol\.jw\.org\//i.test(urlStr)) {
      return { type: "article", url: urlStr };
    }

    // Liens jw.org/open?... ou jw.org/finder?... avec docid ou pub
    const mOpenDoc = urlStr.match(/jw\.org\/(?:open|finder)\?.*?docid=(\d+)/i);
    if (mOpenDoc) {
      const langParam = /wtlocale=E/i.test(urlStr) ? "E" : "F";
      if (/content=video/i.test(urlStr)) {
        return { type: "external-video-docid", docId: mOpenDoc[1], url: urlStr };
      }
      return {
        type: "article",
        docId: mOpenDoc[1],
        url: `https://wol.jw.org/wol/finder?wtlocale=${langParam}&docid=${mOpenDoc[1]}`
      };
    }

    const mOpenPub = urlStr.match(/jw\.org\/(?:open|finder)\?.*?pub=([^&#]+)/i);
    if (mOpenPub) {
      const langParam = /wtlocale=E/i.test(urlStr) ? "E" : "F";
      const issueM = urlStr.match(/[?&]issue=([^&#]+)/i);
      return {
        type: "article",
        url: `https://wol.jw.org/wol/finder?wtlocale=${langParam}&pub=${encodeURIComponent(decodeURIComponent(mOpenPub[1]))}${issueM ? `&issue=${issueM[1]}` : ""}`
      };
    }

    return { type: "external", url: urlStr };
  }

  function getIsoWeekInfo(dateObj = new Date(), langCode = "fr") {
    const cfg = getLangConfig(langCode);
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    const isoYear = d.getUTCFullYear();

    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - 3);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const wolMeetingsUrl = `https://wol.jw.org/${cfg.code}/wol/meetings/${cfg.r}/${cfg.lp}/${isoYear}/${String(weekNo).padStart(2, "0")}`;
    const jwWorkbooksUrl =
      cfg.code === "fr"
        ? "https://www.jw.org/fr/bibliotheque/cahiers-vie-et-ministere/"
        : "https://www.jw.org/en/library/jw-meeting-workbook/";

    return {
      isoYear,
      weekNo,
      monday,
      sunday,
      wolMeetingsUrl,
      jwWorkbooksUrl
    };
  }

  return {
    WOL_LANG_CONFIG,
    BIBLE_BOOKS,
    getLangConfig,
    getBookDisplayName,
    findBookByName,
    getBookByNumber,
    formatJwBibleCode,
    buildScriptureLinks,
    parseScriptureReferences,
    parseRangeOrBatchReferences,
    parseSingleVerseQuery,
    expandScriptureRefFull,
    linkifyScripturesInHtml,
    parseWolUrlTarget,
    getIsoWeekInfo
  };
})();
