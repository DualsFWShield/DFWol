/* ==========================================================================
   DFWol Studio — « Spiritual Brother » : IA Spirituelle 100 % Locale (Hors-ligne)
   Zéro clé API requise · Suggestions d'articles & versets · 32 Capacités Actives
   ========================================================================== */

window.DFWolBrother = (function () {
  "use strict";

  const BROTHER_STATE_KEY = "dfwol_spiritual_brother_v1";
  let uiBound = false;
  let activeCategory = "all";
  let activeSkillId = "chat";
  let chatHistory = [];
  let flashcardIdx = 0;
  let flashcardStep = 0; // 0 = caché, 1 = indice, 2 = complet
  let quizState = { idx: 0, score: 0, answered: false, selected: -1 };
  let rehearsalTimer = { running: false, startedAt: 0, elapsedMs: 0, intervalId: null };

  function esc(str) {
    return window.DFWolSearch ? window.DFWolSearch.escapeHtml(str) : String(str || "");
  }

  function lang() {
    return window.DFWolGetLang ? window.DFWolGetLang() : "fr";
  }

  function loadBrotherPrefs() {
    try {
      return JSON.parse(localStorage.getItem(BROTHER_STATE_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function saveBrotherPrefs(patch) {
    try {
      const cur = loadBrotherPrefs();
      localStorage.setItem(BROTHER_STATE_KEY, JSON.stringify(Object.assign({}, cur, patch)));
    } catch (_) {}
  }

  function openScriptureRef(refLabel) {
    const refs = window.DFWolBible?.parseScriptureReferences?.(refLabel, lang()) || [];
    if (!refs.length) {
      window.DFWolToast && window.DFWolToast(`Référence : ${refLabel}`);
      return;
    }
    const r = refs[0];
    const verses = r.verses?.length ? r.verses : r.verseStart || 1;
    if (window.DFWolStudy?.openStudySidePanel) {
      window.DFWolStudy.openStudySidePanel({
        kind: "verse",
        bookNum: r.bookNum,
        chapter: r.chapter,
        verseOrSpec: verses,
        lang: lang()
      });
    } else if (window.DFWolOpenBibleAt) {
      window.DFWolOpenBibleAt(r.bookNum, r.chapter, verses, lang());
    }
  }

  function launchWolSearch(query) {
    if (!query) return;
    window.DFWolSwitchTab && window.DFWolSwitchTab("library", { libSubtab: "search" });
    const inp = document.getElementById("adv-search-input");
    if (inp) {
      inp.value = query;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("adv-search-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }

  function speakText(title, text) {
    if (!window.DFWolAudio || !text) return;
    window.DFWolAudio.playTrack({
      title: title || "Spiritual Brother",
      subtitle: "Lecture vocale naturelle",
      text,
      lang: lang(),
      mode: "tts"
    });
  }

  function renderScriptureChips(refs) {
    return (refs || [])
      .map(
        (ref) =>
          `<button type="button" class="pill-btn pill-xs sb-verse-chip" data-sb-open-ref="${esc(ref)}">📖 ${esc(ref)}</button>`
      )
      .join("");
  }

  // ==========================================================================
  // Bases de Connaissances Hors-Ligne Enrichies
  // ==========================================================================

  const TOPIC_MAP = [
    {
      id: "anxiete",
      keywords: ["anxiet", "stress", "inquiet", "peur", "angoiss", "triste", "worry", "anxious", "fear", "paix"],
      title: "Apaiser l'inquiétude & retrouver la paix",
      verses: ["Philippiens 4:6, 7", "1 Pierre 5:7", "Matthieu 6:34", "Psaume 55:22", "Isaïe 41:10"],
      queries: ['"ne vous inquiétez de rien" paix', 'anxiété prière confiance Jéhovah', '"déchargez-vous sur lui"'],
      advice: "Dépose précisément ce qui pèse sur ton cœur dans la prière, un jour à la fois. Jéhovah promet une paix qui dépasse tout entendement pour protéger ton cœur et ton esprit."
    },
    {
      id: "decouragement",
      keywords: ["decourag", "fatigue", "epuis", "triste", "larm", "deprim", "seul", "courage", "discourag", "sad", "tired"],
      title: "Reprendre courage quand la force manque",
      verses: ["Psaume 34:18", "2 Corinthiens 4:16", "Isaïe 40:29-31", "Galates 6:9", "Hébreux 6:10"],
      queries: ['"cœur brisé" consolé Psaume 34', 'persévérer découragement espérance', '"puissance qui dépasse la normale"'],
      advice: "Même les fidèles comme Élie ont eu besoin de repos et de réconfort. Jéhovah remarque chaque effort fidèle et redonne de la vigueur à celui qui est fatigué."
    },
    {
      id: "pardon",
      keywords: ["pardon", "culpabil", "faute", "peche", "remord", "forgiv", "guilt", "sin", "misericord"],
      title: "Comprendre le pardon & surmonter la culpabilité",
      verses: ["Psaume 86:5", "Isaïe 1:18", "1 Jean 1:9", "Colossiens 3:13", "Psaume 103:12"],
      queries: ['"prêt à pardonner" Psaume 86', 'surmonter culpabilité miséricorde', '"aussi loin que l\'est est de l\'ouest"'],
      advice: "Jéhovah connaît notre poussière et ne garde pas rancune éternellement. Quand le repentir est sincère, sa miséricorde efface la dette complètement."
    },
    {
      id: "famille",
      keywords: ["famille", "mariag", "couple", "enfant", "parent", "epoux", "epouse", "family", "marriage", "child"],
      title: "Vie de famille heureuse & communication",
      verses: ["Éphésiens 5:28, 33", "Colossiens 3:18-21", "Proverbes 15:1", "Ecclésiaste 4:9, 12", "Deutéronome 6:6, 7"],
      queries: ['vie de famille communication respect', '"corde triple" mariage', '"parler avec douceur" Proverbes 15:1'],
      advice: "Un foyer solide se bâtit par l'écoute patiente, le respect mutuel et des habitudes spirituelles régulières."
    },
    {
      id: "deuil",
      keywords: ["deuil", "mort", "resurrect", "perte", "disparu", "grief", "death", "mourning", "paradise"],
      title: "Espérance de la résurrection & consolation",
      verses: ["Jean 5:28, 29", "Révélation 21:3, 4", "Jean 11:25", "Psaume 147:3", "2 Corinthiens 1:3, 4"],
      queries: ['résurrection espérance deuil consolation', '"essuiera toute larme" Révélation 21', 'où sont les morts Bible'],
      advice: "Jésus lui-même a pleuré devant la tombe de Lazare. La résurrection est une promesse garantie par le Dieu qui ne peut mentir."
    },
    {
      id: "priere",
      keywords: ["prier", "priere", "exauc", "ecout", "pray", "prayer"],
      title: "Enrichir ses prières personnelles",
      verses: ["1 Jean 5:14", "Psaume 62:8", "Matthieu 6:9-13", "Romains 12:12", "Proverbes 15:8"],
      queries: ['"répandez votre cœur" prière', 'comment améliorer nos prières', 'prier avec persévérance foi'],
      advice: "Parle à Jéhovah comme à un Père bienveillant : nomme tes craintes, remercie-le pour trois bienfaits précis et demande sa sagesse."
    },
    {
      id: "jeunesse",
      keywords: ["jeune", "ecole", "ami", "tentation", "reseaux", "avenir", "youth", "school", "peer"],
      title: "Décisions sages pour les jeunes & l'avenir",
      verses: ["Ecclésiaste 12:1", "1 Timothée 4:12", "Proverbes 13:20", "Psaume 119:9", "2 Timothée 2:22"],
      queries: ['jeunes pressions camarades fidélité', '"souviens-toi de ton Grand Créateur"', '"modèle pour les fidèles"'],
      advice: "Tes choix d'aujourd'hui dessinent la paix de demain. Choisis des amis qui aiment ce que tu veux devenir."
    },
    {
      id: "decisions",
      keywords: ["choix", "decid", "travail", "argent", "priorit", "sagess", "wisdom", "work", "money"],
      title: "Sagesse pratique, travail & priorités",
      verses: ["Proverbes 3:5, 6", "Matthieu 6:33", "Jacques 1:5", "Luc 14:28", "Hébreux 13:5"],
      queries: ['prendre sagesse décisions prière', '"cherchez d\'abord le Royaume"', '"évaluer la dépense" Luc 14'],
      advice: "Avant d'agir, vérifie les principes bibliques, pèse les conséquences spirituelles à long terme et demande à Jéhovah du discernement."
    },
    {
      id: "ministere",
      keywords: ["predic", "minister", "enseign", "temoign", "etude", "preach", "ministry", "teach"],
      title: "Efficacité, tact & joie dans le ministère",
      verses: ["2 Timothée 4:2", "Colossiens 4:6", "Matthieu 28:19, 20", "Actes 17:22", "Proverbes 25:11"],
      queries: ['"assaisonnées de sel" tact prédication', 'efficacité enseignement Bible', 'engager conversation ministère'],
      advice: "Pose une question sincère, écoute attentivement la personne, puis relie une idée simple à un seul verset clair."
    },
    {
      id: "amour",
      keywords: ["amour", "frere", "unite", "hospital", "paix", "congr", "love", "brother", "unity"],
      title: "Amour fraternel, unité & bienveillance",
      verses: ["Jean 13:34, 35", "1 Corinthiens 13:4-8", "1 Jean 4:7, 8", "Romains 12:10", "Psaume 133:1"],
      queries: ['"amour ne disparaît jamais"', 'unité congrégation hospitalité', '"honorez-vous les uns les autres"'],
      advice: "L'amour chrétien se voit dans les petites attentions : un message, une écoute sans juger et le désir sincère de mettre l'autre à l'aise."
    },
    {
      id: "esperance",
      keywords: ["esper", "royaume", "paradis", "avenir", "prophet", "hope", "kingdom", "future"],
      title: "Garder vivante l'espérance du Royaume",
      verses: ["Psaume 37:10, 11, 29", "Isaïe 65:21-25", "Daniel 2:44", "Romains 15:4, 13", "Hébreux 11:1"],
      queries: ['espérance Royaume de Dieu paradis', '"ancre de l\'âme" Hébreux 6', 'promesses prophéties accomplies'],
      advice: "Visualise concrètement les promesses du monde nouveau et laisse cette certitude éclairer tes priorités d'aujourd'hui."
    },
    {
      id: "bible",
      keywords: ["nom", "jehovah", "jesus", "croix", "ame", "science", "creation", "verite"],
      title: "Fondements bibliques & recherche doctrinale",
      verses: ["Psaume 83:18", "Jean 17:3", "2 Timothée 3:16, 17", "Romains 1:20", "Actes 17:11"],
      queries: ['Psaume 83:18 nom divin Jéhovah', '"toute Écriture est inspirée"', 'exactitude scientifique Bible'],
      advice: "Compare toujours plusieurs traductions et laisse la Bible s'expliquer par elle-même grâce aux renvois et au contexte."
    }
  ];

  const BOOK_SHEETS = [
    { num: 1, author: "Moïse", era: "Vers 1513 av. n. è.", theme: "Origines, promesse de la descendance et alliance abrahamique", structure: "1-11 Origines · 12-50 Patriarches" },
    { num: 18, author: "Moïse", era: "Vers 1473 av. n. è.", theme: "Intégrité humaine, souveraineté divine & consolation", structure: "1-2 Épreuve · 3-31 Débats · 32-42 Élihou & Jéhovah" },
    { num: 19, author: "David, fils de Qoré, Asaph, Moïse…", era: "Vers 1473-460 av. n. è.", theme: "Louange, prière dans l'épreuve et confiance en Jéhovah", structure: "5 livres (1-41 · 42-72 · 73-89 · 90-106 · 107-150)" },
    { num: 20, author: "Salomon, Agour, Lemouël", era: "Vers 717 av. n. è.", theme: "Sagesse pratique fondée sur la crainte de Jéhovah", structure: "1-9 Principes · 10-29 Sentences · 30-31 Agour & Lemouël" },
    { num: 23, author: "Isaïe", era: "Vers 732 av. n. è.", theme: "Jugement, restauration et le Serviteur messianique", structure: "1-39 Avertissements · 40-66 Consolation & Nouveaux cieux" },
    { num: 27, author: "Daniel", era: "Vers 536 av. n. è.", theme: "Domination du Très-Haut sur les royaumes humains", structure: "1-6 Fidélité à Babylone · 7-12 Visions prophétiques" },
    { num: 40, author: "Matthieu (Lévi)", era: "Vers 41 de n. è.", theme: "Jésus est le Roi messianique promis", structure: "1-4 Origines · 5-7 Sermon · 8-25 Ministère · 26-28 Rançon" },
    { num: 43, author: "Apôtre Jean", era: "Vers 98 de n. è.", theme: "Jésus le Fils de Dieu révèle le Père et donne la vie", structure: "1-12 Signes publics · 13-17 Intimité · 18-21 Sacrifice & victoire" },
    { num: 44, author: "Luc", era: "Vers 61 de n. è.", theme: "Expansion de la bonne nouvelle jusqu'aux extrémités de la terre", structure: "1-7 Jérusalem · 8-12 Judée/Samarie · 13-28 Voyages de Paul" },
    { num: 45, author: "Apôtre Paul", era: "Vers 56 de n. è.", theme: "Justice par la foi et miséricorde de Dieu", structure: "1-11 Rançon & dessin divin · 12-16 Vie chrétienne pratique" },
    { num: 58, author: "Apôtre Paul", era: "Vers 61 de n. è.", theme: "Supériorité de l'alliance nouvelle et foi persévérante", structure: "1-10 Grand Prêtre Jésus · 11-13 Nuée de témoins & fidélité" },
    { num: 66, author: "Apôtre Jean", era: "Vers 96 de n. è.", theme: "Triomphe final de Dieu et bénédictions éternelles", structure: "1-3 Sept assemblées · 4-20 Victoire du Royaume · 21-22 Paradis" }
  ];

  const CHARACTER_PROFILES = [
    { name: "Ruth", trait: "Amour fidèle & humilité", trial: "Veuvage en terre étrangère, pauvreté", lesson: "Rester loyal à Jéhovah ouvre des bénédictions insoupçonnées.", verse: "Ruth 1:16, 17" },
    { name: "David", trait: "Courage, repentir sincère", trial: "Persécution de Saül, graves fautes suivies de discipline", lesson: "La proximité de Jéhovah naît d'un cœur entier prêt à se corriger.", verse: "1 Samuel 17:45" },
    { name: "Esther", trait: "Bravoure réfléchie", trial: "Risque de mort devant le roi pour sauver son peuple", lesson: "Prier, préparer avec tact et agir au bon moment.", verse: "Esther 4:14" },
    { name: "Daniel", trait: "Intégrité constante dès la jeunesse", trial: "Exil, pression alimentaire, fosse aux lions", lesson: "Une habitude quotidienne de prière rend inébranlable dans les crises.", verse: "Daniel 6:10" },
    { name: "Joseph (fils de Jacob)", trait: "Chasteté, pardon & foi", trial: "Trahison fraternelle, esclavage, prison injuste", lesson: "Même dans l'injustice, la fidélité prépare une délivrance future.", verse: "Genèse 39:9" },
    { name: "Marie (mère de Jésus)", trait: "Soumission joyeuse & méditation", trial: "Incompréhension possible, fuite, mort de son Fils", lesson: "Garder les paroles de Dieu dans son cœur soutient dans l'épreuve.", verse: "Luc 1:38" },
    { name: "Apôtre Paul", trait: "Zèle, adaptabilité & persévérance", trial: "Épreuve physique, naufrages, persécutions", lesson: "La grâce de Dieu suffit quand nous nous appuyons sur sa puissance.", verse: "2 Corinthiens 12:9" },
    { name: "Timothée", trait: "Bonté sincère & progrès spirituel", trial: "Jeunesse, santé fragile, responsabilités lourdes", lesson: "L'amour authentique pour autrui l'emporte sur la timidité.", verse: "1 Timothée 4:12" },
    { name: "Néhémie", trait: "Organisation, prière éclair & ténacité", trial: "Ruines de Jérusalem, moqueries & complot", lesson: "Allier prière instantanée et action méthodique.", verse: "Néhémie 2:4" },
    { name: "Job", trait: "Endurance & sincérité", trial: "Perte de ses biens, de ses enfants et maladie aiguë", lesson: "La loyauté ne dépend pas de l'absence d'épreuves.", verse: "Job 27:5" },
    { name: "Rahab", trait: "Foi courageuse par les œuvres", trial: "Vivait dans une ville condamnée (Jéricho)", lesson: "Quiconque agit en harmonie avec le vrai Dieu peut être accueilli.", verse: "Hébreux 11:31" },
    { name: "Élie", trait: "Zèle pour le culte pur & humanité", trial: "Famine, menace de mort, profond épuisement", lesson: "Même un prophète fidèle ressent parfois de l'épuisement ; Jéhovah le relève.", verse: "1 Rois 19:12" },
    { name: "Jonas", trait: "Apprentissage de la miséricorde", trial: "Mission difficile à Ninive, tempête", lesson: "La compassion de Jéhovah dépasse nos préjugés.", verse: "Jonas 4:2" },
    { name: "Lydie", trait: "Cœur ouvert & hospitalité", trial: "Commerçante dans une ville païenne (Philippes)", lesson: "Ouvrir son foyer soutient concrètement les serviteurs de Dieu.", verse: "Actes 16:14, 15" },
    { name: "Apôtre Pierre", trait: "Ardeur, humilité après échec", trial: "Peur des hommes, reniement puis restauration", lesson: "Une chute n'efface pas notre utilité si nous nous relevons humblement.", verse: "Jean 21:17" }
  ];

  const GLOSSARY_TERMS = [
    { term: "Jéhovah", def: "Forme française usuelle du Tétragramme YHWH : « Il fait devenir ». Nom personnel du Tout-Puissant (~7 000 fois dans le texte original).", refs: ["Psaume 83:18", "Exode 3:14, 15"] },
    { term: "Âme (néphèsh / psykhé)", def: "Désigne un être vivant (humain ou animal) qui respire, ou la vie elle-même — jamais une entité immortelle séparée du corps.", refs: ["Genèse 2:7", "Ézéchiel 18:4"] },
    { term: "Schéol / Hadès", def: "La tombe commune des humains, lieu d'inactivité et d'inconscience en attente de la résurrection.", refs: ["Ecclésiaste 9:5, 10", "Actes 2:27"] },
    { term: "Géhenne", def: "Empruntée à la vallée de Hinnom (décharge de Jérusalem) : symbole de destruction complète sans résurrection.", refs: ["Matthieu 10:28", "Matthieu 23:33"] },
    { term: "Rançon (lytron)", def: "Prix payé par le sacrifice parfait de Jésus pour racheter l'humanité du péché et de la mort hérités d'Adam.", refs: ["Matthieu 20:28", "1 Timothée 2:5, 6"] },
    { term: "Royaume de Dieu", def: "Gouvernement céleste réel dirigé par Jésus Christ qui sanctifiera le nom de Dieu et rétablira le Paradis sur terre.", refs: ["Daniel 2:44", "Matthieu 6:9, 10"] },
    { term: "Présence (parousia)", def: "Période invisible au cours de laquelle Christ règne dans les cieux et prépare le dénouement de ce système.", refs: ["Matthieu 24:3, 37"] },
    { term: "Amour fidèle (hésèd)", def: "Attachement loyal et durable guidé par l'engagement moral et la tendresse ; caractéristique majeure de Jéhovah.", refs: ["Exode 34:6", "Psaume 136:1"] },
    { term: "Esprit saint", def: "Force agissante invisible et puissante de Dieu grâce à laquelle il crée, inspire les Écritures et soutient ses serviteurs.", refs: ["Genèse 1:2", "Actes 1:8"] },
    { term: "Foi (pistis)", def: "Attente assurée et démonstration évidente de réalités invisibles, fondée sur des preuves solides.", refs: ["Hébreux 11:1", "Romains 10:17"] },
    { term: "Alliance nouvelle", def: "Accord inauguré par le sang de Jésus remplaçant l'alliance de la Loi et associant des cohéritiers au Royaume.", refs: ["Jérémie 31:31-34", "Luc 22:20"] },
    { term: "Souveraineté", def: "Autorité suprême et droit légitime de Jéhovah de diriger tout l'univers pour le bien de ses créatures.", refs: ["Psaume 103:19", "Révélation 4:11"] },
    { term: "Intégrité", def: "Droiture morale complète et fidélité inébranlable envers Dieu, même sous pression.", refs: ["Job 27:5", "Psaume 26:11"] },
    { term: "Méditation (biblique)", def: "Réflexion calme et profonde sur les pensées de Dieu afin qu'elles descendent du cerveau jusqu'au cœur.", refs: ["Psaume 1:2", "Josué 1:8"] },
    { term: "Humilité", def: "Estimation juste et modeste de soi-même devant Dieu et autrui ; conscience joyeuse de dépendre du Créateur.", refs: ["Proverbes 11:2", "Philippiens 2:3"] },
    { term: "Justice divine", def: "Respect parfait de ce qui est moralement droit et équitable, toujours équilibré par l'amour et la sagesse.", refs: ["Deutéronome 32:4", "Psaume 89:14"] },
    { term: "Sanctuaire / Temple spirituel", def: "Disposition établie par Jéhovah pour que les humains l'adorent de façon pure sur la base du sacrifice du Christ.", refs: ["Hébreux 8:1, 2"] },
    { term: "Résurrection (anastasis)", def: "« Relèvement » littéral à la vie de ceux qui sont dans le souvenir de Dieu, soit au ciel soit sur une terre paradisiaque.", refs: ["Jean 5:28, 29", "Actes 24:15"] }
  ];

  const OBJECTIONS = [
    { obj: "« Je n'ai pas le temps de parler / de lire. »", reply: "Je comprends tout à fait, nos journées filent vite ! C'est justement pourquoi je voulais juste vous laisser cette pensée courte en 30 secondes sur la vraie paix d'esprit.", verse: "Éphésiens 5:15, 16" },
    { obj: "« J'ai déjà ma religion. »", reply: "C'est respectable d'attacher de l'importance aux valeurs spirituelles. Au-delà des étiquettes, que pensez-vous de cette promesse de la Bible concernant l'avenir de la terre ?", verse: "Matthieu 5:5" },
    { obj: "« S'il y a un Dieu, pourquoi y a-t-il tant de souffrances ? »", reply: "C'est l'une des questions les plus justes qui soient. Savez-vous que la Bible montre clairement que Dieu n'est pas l'auteur du mal et explique pourquoi il l'a toléré temporairement ?", verse: "Jacques 1:13" },
    { obj: "« Je crois en la science, pas en la Bible. »", reply: "Beaucoup pensent qu'elles s'opposent, mais la Bible n'est pas un manuel de religion aveugle : des siècles avant la science moderne, elle décrivait déjà la terre suspendue sur le néant et le cycle de l'eau.", verse: "Job 26:7" },
    { obj: "« On n'a pas besoin de religion pour être quelqu'un de bien. »", reply: "On peut tout à fait avoir un beau cœur sans église. Ce qui est fascinant, c'est que Jésus lui-même mettait l'accent sur la bonté concrète et une amitié personnelle avec Dieu plutôt que sur les rituels.", verse: "Michée 6:8" },
    { obj: "« La Bible a été écrite par des hommes et modifiée. »", reply: "Bonne remarque ! Justement, les découvertes comme les rouleaux de la mer Morte ont permis de comparer des manuscrits anciens sur mille ans et de constater une fidélité étonnante.", verse: "Isaïe 40:8" },
    { obj: "« Je ne crois pas en Dieu. »", reply: "Merci pour votre franchise ! Est-ce plutôt à cause de l'hypocrisie que l'on voit parfois dans les religions, ou parce que vous pensez que l'univers s'est formé seul ?", verse: "Hébreux 3:4" },
    { obj: "« Tout est écrit d'avance (destin). »", reply: "Si tout était figé, nos choix n'auraient aucun sens. En fait, la Bible compare notre avenir à une route où Dieu nous laisse choisir le chemin.", verse: "Deutéronome 30:19" },
    { obj: "« Que faites-vous de différent avec le nom de Dieu ? »", reply: "Quand on connaît quelqu'un, on aime utiliser son prénom. Dans les manuscrits hébreux, Dieu utilise son nom Jéhovah près de 7 000 fois comme une invitation à se rapprocher de lui.", verse: "Psaume 83:18" },
    { obj: "« Pourquoi allez-vous de maison en maison ? »", reply: "Tout le monde n'a pas l'occasion ni l'envie d'entrer dans un lieu de culte, alors nous suivons l'exemple de Jésus en allant humblement parler aux gens là où ils vivent.", verse: "Matthieu 10:11-13" },
    { obj: "« Les choses iront toujours ainsi, rien ne change. »", reply: "On peut comprendre ce sentiment en voyant les nouvelles ! Pourtant, l'histoire humaine montre qu'il y a déjà eu des tournants décisifs, et Dieu a promis un changement global.", verse: "2 Pierre 3:3, 9" },
    { obj: "« L'Enfer attend-il les méchants ? »", reply: "Un père aimant ne torturerait jamais un enfant éternellement pour une faute temporaire. La Bible montre que le salaire du péché, c'est la mort — l'absence de vie, pas le supplice.", verse: "Romains 6:23" },
    { obj: "« Comment savoir quel chemin est le bon parmi tant d'Églises ? »", reply: "Jésus a donné un critère très simple pour reconnaître ses vrais disciples : pas leurs grands édifices, mais l'amour concret qu'ils ont entre eux.", verse: "Jean 13:35" },
    { obj: "« Revenez plus tard, là c'est compliqué. »", reply: "Bien sûr, je ne veux surtout pas vous déranger. Quel moment de la semaine est habituellement plus calme pour vous ?", verse: "Colossiens 4:6" }
  ];

  const ILLUSTRATIONS = [
    { topic: "Guidance divine", title: "Le GPS & la carte routière", text: "Avoir une belle voiture ne suffit pas pour trouver une route inconnue la nuit ; il faut un GPS fiable à jour. La Bible joue ce rôle face aux virages de la vie.", verse: "Psaume 119:105" },
    { topic: "Création & Concepteur", title: "L'horloger et la montre suisse", text: "On ne suppose pas que des engrenages jetés en l'air se sont assemblés pour donner l'heure exacte. La précision du cosmos et de l'ADN révèle une intelligence bien supérieure.", verse: "Hébreux 3:4" },
    { topic: "Tolérance du mal", title: "L'élève qui conteste le professeur", text: "Si un élève prétend savoir mieux résoudre une équation devant toute la classe, l'enseignant sage le laisse essayer un moment au tableau afin que chacun voie la preuve irréfutable.", verse: "Deutéronome 32:4, 5" },
    { topic: "Prière", title: "La lettre et l'appel familial", text: "Dans une amitié vivante, l'un lit les messages (la Bible) et répond de vive voix (la prière). Sans échange dans les deux sens, le lien refroidit.", verse: "Jacques 4:8" },
    { topic: "Rançon", title: "L'usine en faillite rachetée", text: "Quand un employé détourné laisse l'usine endettée, un bienfaiteur innocent peut payer exactement le montant dû pour libérer les travailleurs. Jésus a payé cette vie parfaite équivalente.", verse: "1 Corinthiens 15:22" },
    { topic: "Choix des amis", title: "L'encre dans l'eau claire", text: "Une goutte d'encre suffit pour troubler un verre d'eau limpide ; inversement, côtoyer des personnes aimant Dieu clarifie notre cœur.", verse: "1 Corinthiens 15:33" },
    { topic: "Humilité", title: "L'épi de blé chargé", text: "Plus un épi est vide, plus il dresse la tête avec arrogance ; plus il est rempli de bon grain, plus il s'incline modestement.", verse: "Proverbes 11:2" },
    { topic: "Pardon", title: "Le pardessus couvert de boue vs l'oubli volontaire", text: "Pardonner ne signifie pas faire semblant que ça n'a pas fait mal, mais décider de ne plus jeter la facture sur la table.", verse: "Éphésiens 4:32" },
    { topic: "Persévérance", title: "Le coureur de fond", text: "On ne juge pas un marathonien sur un seul kilomètre : même s'il ralentit dans une côte, tant qu'il reste sur le tracé, il avance vers la ligne.", verse: "Hébreux 12:1" },
    { topic: "Méditation", title: "L'éponge dans l'eau", text: "Survoler vite un chapitre est comme éclabousser une pierre. Méditer revient à plonger l'éponge dans l'eau jusqu'à ce qu'elle s'imprègne.", verse: "Josué 1:8" },
    { topic: "État des morts", title: "Le sommeil profond sans rêves", text: "Jésus a comparé la mort de Lazare à un sommeil paisible : celui qui dort profondément ne souffre pas et se réveille sans avoir vu le temps passer.", verse: "Jean 11:11-14" },
    { topic: "Paroles douces", title: "La clé et le verrou", text: "Forcer un coffre abîme la porte, alors qu'une parole calme et réfléchie ouvre doucement le cœur de l'interlocuteur.", verse: "Proverbes 25:15" }
  ];

  const TIMELINE_EVENTS = [
    { era: "Origines", date: "Création", title: "Paradis originel en Éden & promesse d'Éden", desc: "Création parfaite de la terre et promesse en Genèse 3:15 d'écraser le serpent.", verse: "Genèse 3:15" },
    { era: "Patriarches", date: "~1943 av. n. è.", title: "Alliance avec Abraham", desc: "Promesse que par sa descendance toutes les nations seront bénies.", verse: "Genèse 22:18" },
    { era: "Exode", date: "1513 av. n. è.", title: "Délivrance d'Égypte & Alliance de la Loi", desc: "Pâque, traversée de la mer Rouge et Loi au mont Sinaï.", verse: "Exode 19:5, 6" },
    { era: "Royauté", date: "~1070–997 av. n. è.", title: "Règne de David & Temple de Salomon", desc: "Alliance pour une royauté éternelle et dédicace du Temple de Jérusalem.", verse: "2 Samuel 7:16" },
    { era: "Exil", date: "607–537 av. n. è.", title: "Destruction de Jérusalem puis retour de Babylone", desc: "Les 70 ans de désolation accomplis exactement selon Jérémie & Daniel.", verse: "Daniel 9:2" },
    { era: "Messie", date: "29 de n. è.", title: "Baptême de Jésus & début des 70 semaines", desc: "Oint d'esprit saint au Jourdain ; début du ministère public du Messie.", verse: "Luc 3:21, 22" },
    { era: "Rançon", date: "14 Nisan 33 de n. è.", title: "Sacrifice rédempteur & Pentecôte", desc: "Christ offre sa vie parfaite ; naissance de l'assemblée chrétienne 50 jours après.", verse: "Actes 2:1-4" },
    { era: "Nouvelle alliance", date: "36 de n. è.", title: "Accueil de Corneille (nations non juives)", desc: "La bonne nouvelle s'ouvre officiellement aux personnes de toutes les nations.", verse: "Actes 10:34, 35" },
    { era: "Dernières lettres", date: "~98 de n. è.", title: "Achèvement du canon biblique par Jean", desc: "Rédaction de Révélation et de l'Évangile de Jean à Éphèse/Patmos.", verse: "Révélation 1:1" },
    { era: "Temps de la fin", date: "1914 de n. è.", title: "Intronisation du Royaume messianique", desc: "Début du règne céleste de Christ et de l'œuvre mondiale de prédication.", verse: "Matthieu 24:14" },
    { era: "Dénouement", date: "Imminent", title: "Grande tribulation & Harmaguédon", desc: "Sanctification définitive du nom de Jéhovah devant toutes les nations.", verse: "Daniel 2:44" },
    { era: "Paradis éternel", date: "1 000 ans & au-delà", title: "Résurrection et vie sans mort ni larmes", desc: "La terre restaurée en Éden mondial sous la royauté aimante de Dieu.", verse: "Révélation 21:3, 4" }
  ];

  const QUIZ_BANK = [
    { q: "Quel verset cite explicitement le nom divin dans de nombreuses traductions ?", a: ["Psaume 83:18", "Jean 1:1", "Genèse 2:1", "Matthieu 5:1"], c: 0, ref: "Psaume 83:18" },
    { q: "Combien de livres composent la Bible complète ?", a: ["39", "66", "72", "27"], c: 1, ref: "2 Timothée 3:16" },
    { q: "Combien de chapitres contient toute la Bible ?", a: ["929", "1 000", "1 189", "1 500"], c: 2, ref: "Psaume 1:2" },
    { q: "Quel apôtre était collecteur d'impôts avant de suivre Jésus ?", a: ["Luc", "Matthieu", "Marc", "Philippe"], c: 1, ref: "Matthieu 9:9" },
    { q: "À qui Jésus a-t-il dit que le fruit de la vie éternelle vient de la connaissance de Dieu ?", a: ["Ses disciples lors de la prière chap. 17", "Hérode", "Les pharisiens seuls", "Les Romains"], c: 0, ref: "Jean 17:3" },
    { q: "Quel prophète a été jeté dans la fosse aux lions ?", a: ["Ézéchiel", "Daniel", "Jérémie", "Jonas"], c: 1, ref: "Daniel 6:16" },
    { q: "Quel est le premier fruit de l'esprit mentionné en Galates 5:22 ?", a: ["La joie", "La patience", "L'amour", "La douceur"], c: 2, ref: "Galates 5:22" },
    { q: "Qui a prononcé la prière mémorable « Où tu iras j'irai » ?", a: ["Esther", "Ruth", "Débora", "Abigaïl"], c: 1, ref: "Ruth 1:16" },
    { q: "Selon Proverbes 3:5, sur quoi ne faut-il PAS s'appuyer ?", a: ["Son propre intelligence / compréhension", "Les conseils sages", "La prière", "L'expérience"], c: 0, ref: "Proverbes 3:5" },
    { q: "Quel roi a bâti le premier Temple de Jérusalem ?", a: ["David", "Saül", "Salomon", "Ézéchias"], c: 2, ref: "1 Rois 6:1" },
    { q: "Quel verset promet que Dieu « essuiera toute larme de leurs yeux » ?", a: ["Révélation 21:4", "Actes 20:35", "Romains 8:28", "Psaume 23:1"], c: 0, ref: "Révélation 21:4" },
    { q: "Combien d'hommes fidèles Gédéon a-t-il gardés contre Madian ?", a: ["10 000", "1 000", "300", "12"], c: 2, ref: "Juges 7:7" },
    { q: "Quelle femme marchande de pourpre a ouvert sa maison à Paul à Philippes ?", a: ["Priscille", "Lydie", "Dorcas", "Phœbé"], c: 1, ref: "Actes 16:14, 15" },
    { q: "Que déclare 1 Jean 4:8 sur la nature essentielle de Dieu ?", a: ["Dieu est mystère", "Dieu est amour", "Dieu est silence", "Dieu est lointain"], c: 1, ref: "1 Jean 4:8" },
    { q: "Quel livre contient « Une corde triple ne se rompt pas vite » ?", a: ["Cantique des cantiques", "Ecclésiaste", "Lamentations", "Osée"], c: 1, ref: "Ecclésiaste 4:12" },
    { q: "Quel ami de Jésus a été ressuscité après quatre jours au tombeau ?", a: ["Étienne", "Lazare", "Bartimée", "Zachée"], c: 1, ref: "Jean 11:39-44" },
    { q: "Dans quel Évangile trouve-t-on la parabole du bon Samaritain ?", a: ["Matthieu", "Marc", "Luc", "Jean"], c: 2, ref: "Luc 10:33" },
    { q: "Quel chapitre biblique est surnommé l'hymne à l'amour ?", a: ["1 Corinthiens 13", "Romains 5", "Hébreux 11", "Matthieu 5"], c: 0, ref: "1 Corinthiens 13:4-8" },
    { q: "Quel roi de Babylone vit une écriture mystérieuse sur le mur ?", a: ["Neboukadnetsar", "Belshatsar", "Cyrus", "Darius"], c: 1, ref: "Daniel 5:5" },
    { q: "Quel jeune collaborateur de Paul connaissait les Écritures dès sa petite enfance ?", a: ["Tite", "Timothée", "Philémon", "Onésime"], c: 1, ref: "2 Timothée 3:15" },
    { q: "Qui a prié silencieusement « dans son cœur » au tabernacle avant de devenir mère de Samuel ?", a: ["Sara", "Rébecca", "Hanna", "Élisabeth"], c: 2, ref: "1 Samuel 1:13" },
    { q: "Que compare Psaume 1:3 à celui qui médite jour et nuit ?", a: ["Un arbre planté près de ruisseaux d'eau", "Un éclair du matin", "Un roc isolé", "Un nuage rapide"], c: 0, ref: "Psaume 1:3" },
    { q: "Quel verset encourage « Déchargez-vous sur lui de toute votre inquiétude » ?", a: ["1 Pierre 5:7", "2 Pierre 1:5", "Jude 20", "Tite 2:11"], c: 0, ref: "1 Pierre 5:7" },
    { q: "Quel prophète a reconstruit les murailles de Jérusalem en 52 jours ?", a: ["Esdras", "Néhémie", "Aggée", "Zacharie"], c: 1, ref: "Néhémie 6:15" },
    { q: "Quelle est la toute première phrase du livre de la Genèse ?", a: ["Au commencement Dieu créa le ciel et la terre", "Au commencement était la Parole", "Jéhovah est mon berger", "Heureux ceux qui sont conscients"], c: 0, ref: "Genèse 1:1" }
  ];

  // ==========================================================================
  // Moteur Conversationnel Local (Zero-API Natural Intent Router)
  // ==========================================================================

  function analyzeUserQueryLocally(rawQuery) {
    const q = String(rawQuery || "").trim();
    const low = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // 1. Si l'utilisateur saisit directement un verset biblique
    const directRefs = window.DFWolBible?.parseScriptureReferences?.(q, lang()) || [];
    if (directRefs.length > 0) {
      return {
        reply: `J'ai reconnu la référence biblique **${directRefs.map((r) => r.label).join(", ")}**. Tu peux l'ouvrir directement dans le volet Étude individuelle, lancer un quiz ou demander les perles du contexte.`,
        verses: directRefs.map((r) => r.label),
        queries: directRefs.map((r) => r.label),
        recommendedSkill: "verse-lens"
      };
    }

    // 2. Correspondance avec la base thématique
    let bestTopic = null;
    let bestScore = 0;
    for (const t of TOPIC_MAP) {
      let score = 0;
      t.keywords.forEach((kw) => {
        if (low.includes(kw)) score += 2;
      });
      if (score > bestScore) {
        bestScore = score;
        bestTopic = t;
      }
    }

    if (bestTopic && bestScore > 0) {
      return {
        reply: `**${bestTopic.title}**\n\n${bestTopic.advice}`,
        verses: bestTopic.verses,
        queries: bestTopic.queries,
        recommendedSkill: "meditation-4step"
      };
    }

    // 3. Correspondance personnage biblique ou glossaire
    const matchedChar = CHARACTER_PROFILES.find((c) => low.includes(c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
    if (matchedChar) {
      return {
        reply: `**Profil de ${matchedChar.name}** — *${matchedChar.trait}*\nÉpreuve : ${matchedChar.trial}\nLeçon : ${matchedChar.lesson}`,
        verses: [matchedChar.verse],
        queries: [`${matchedChar.name} foi exemple fidélité`],
        recommendedSkill: "character-profiles"
      };
    }

    const matchedGloss = GLOSSARY_TERMS.find((g) => low.includes(g.term.toLowerCase().split(" ")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
    if (matchedGloss) {
      return {
        reply: `**${matchedGloss.term}** : ${matchedGloss.def}`,
        verses: matchedGloss.refs,
        queries: [matchedGloss.term.split("(")[0].trim()],
        recommendedSkill: "bible-glossary"
      };
    }

    // 4. Recherche dans les notes personnelles locales
    const notes = window.DFWolGetNotes ? window.DFWolGetNotes() : [];
    const matchingNotes = notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())).slice(0, 2);
    const words = q.replace(/[^\p{L}\p{N}\s-]/gu, "").trim().split(/\s+/).filter((w) => w.length > 2);
    const wolQ = words.slice(0, 4).join(" & ");

    let noteText = matchingNotes.length
      ? `\n\nDans tes propres notes, tu as déjà noté : « ${matchingNotes[0].title} ».`
      : "";

    return {
      reply: `Voici comment explorer « ${q} » avec les ressources bibliques : je t'ai préparé des requêtes WOL/JW prêtes à lancer ainsi que des versets pivots pour méditer.${noteText}`,
      verses: ["Proverbes 2:1-5", "Psaume 119:105", "Romains 15:4"],
      queries: [wolQ || q, `"${q}"`, `${words[0] || q} & Jéhovah`].filter(Boolean),
      recommendedSkill: "wol-query-builder"
    };
  }

  // ==========================================================================
  // Registre Officiel des 32 Capacités Actives de Spiritual Brother
  // ==========================================================================

  const SKILLS = [
    // Catégorie : recherche (6)
    { id: "article-finder", cat: "recherche", icon: "🔎", name: "Rechercheur d'articles ciblés", desc: "Trouve des articles adaptés à ton besoin ou sujet précis." },
    { id: "scripture-suggester", cat: "recherche", icon: "📖", name: "Suggéreur de versets par situation", desc: "12 situations de vie → versets directs dans le volet étude." },
    { id: "personal-recs", cat: "recherche", icon: "🧭", name: "Recommandations d'après vos notes", desc: "Analyse vos notes, marque-pages et surlignages localement." },
    { id: "notes-synth", cat: "recherche", icon: "🗂️", name: "Synthétiseur de mes notes", desc: "Regroupe vos notes et extrait tous vos versets favoris." },
    { id: "wol-query-builder", cat: "recherche", icon: "⚡", name: "Constructeur booléen WOL", desc: "Assemble ET, OU, guillemets, proximité et titre # sans erreur." },
    { id: "daily-text-brief", cat: "recherche", icon: "☀️", name: "Synthèse locale Texte du jour", desc: "Extrait l'idée force et une application du Texte du jour." },

    // Catégorie : bible (6)
    { id: "book-sheets", cat: "bible", icon: "📜", name: "Fiches des livres bibliques", desc: "Rédacteur, époque, thème central et structure par livre." },
    { id: "chapter-analyzer", cat: "bible", icon: "🔬", name: "Analyseur du chapitre ouvert", desc: "Compte mots, thèmes clés et durée du chapitre affiché." },
    { id: "crossref-chains", cat: "bible", icon: "🔗", name: "Chaînes thématiques de renvois", desc: "Parcours de 5–6 versets liés sur un grand enseignement." },
    { id: "verse-lens", cat: "bible", icon: "💎", name: "Loupe d'étude sur un verset", desc: "Examine un verset : principe, question de méditation & audio." },
    { id: "quality-comparator", cat: "bible", icon: "⚖️", name: "Comparateur de qualités chrétiennes", desc: "Distingue douceur/faiblesse, crainte/peur, zèle/précipitation." },
    { id: "bible-glossary", cat: "bible", icon: "📚", name: "Glossaire biblique express", desc: "18 termes essentiels définis simplement avec versets." },

    // Catégorie : meditation (6)
    { id: "quick-encouragement", cat: "meditation", icon: "🕊️", name: "Encouragement spirituel immédiat", desc: "Selon votre émotion actuelle : réconfort + verset + lecture vocale." },
    { id: "meditation-4step", cat: "meditation", icon: "🪷", name: "Atelier méditation en 4 étapes", desc: "Jéhovah → Christ → Foi → Geste concret + enregistrement note." },
    { id: "prayer-guide", cat: "meditation", icon: "🙏", name: "Guide de prière structurée", desc: "Canevas complet : louange, gratitude, besoins et intercession." },
    { id: "verse-flashcards", cat: "meditation", icon: "🃏", name: "Mémorisation active (Flashcards)", desc: "Entraînement par indices progressifs sur les versets clés." },
    { id: "daily-challenge", cat: "meditation", icon: "🌟", name: "Défi spirituel quotidien", desc: "Une action concrète et encourageante pour aujourd'hui." },
    { id: "family-worship", cat: "meditation", icon: "👨‍👩‍👧‍👦", name: "Planificateur de culte familial", desc: "Idées d'ateliers variés avec versets et minuteur." },

    // Catégorie : reunions (6)
    { id: "comment-30s", cat: "reunions", icon: "💬", name: "Générateur de commentaire 30s", desc: "Bâtit localement un commentaire naturel (~55 mots) sur l'article ouvert." },
    { id: "pearl-extractor", cat: "reunions", icon: "💠", name: "Extracteur de perles spirituelles", desc: "Repère Jéhovah, promesses et principes dans le texte affiché." },
    { id: "article-summary", cat: "reunions", icon: "⏱️", name: "Résumeur & temps de lecture", desc: "Sélectionne les phrases maîtresses et estime la durée de lecture." },
    { id: "talk-outliner", cat: "reunions", icon: "🎙️", name: "Plan d'exposé 5 / 10 / 15 min", desc: "Structure introduction, points principaux, versets et conclusion." },
    { id: "speech-timer", cat: "reunions", icon: "⏲️", name: "Chronomètre & débit d'exposé", desc: "Calcule la durée à 130 mots/min avec vrai chronomètre." },
    { id: "meeting-prep-checklist", cat: "reunions", icon: "✅", name: "Check-list préparation réunion", desc: "Suivi mémorisé des 6 étapes pour arriver serein à la salle." },

    // Catégorie : ministere (4)
    { id: "ministry-starters", cat: "ministere", icon: "🚪", name: "Brise-glace pour le ministère", desc: "Approches naturelles : porte-à-porte, rue, téléphone, collègues." },
    { id: "objection-responder", cat: "ministere", icon: "🤝", name: "Réponses pleines de tact", desc: "14 objections fréquentes avec pont bienveillant + verset." },
    { id: "illustrations-bank", cat: "ministere", icon: "💡", name: "Banque d'illustrations & analogies", desc: "12 comparaisons parlantes pour enseigner simplement." },
    { id: "return-visit-3step", cat: "ministere", icon: "🔁", name: "Nouvelle visite en 3 étapes", desc: "Prépare rappel, verset clé et question ouverte pour la prochaine fois." },

    // Catégorie : parcours (4)
    { id: "bible-quiz", cat: "parcours", icon: "🏆", name: "Quiz biblique interactif", desc: "25 questions corrigées avec versets vérifiables en 1 clic." },
    { id: "character-profiles", cat: "parcours", icon: "👤", name: "Profils de personnages bibliques", desc: "15 témoins de foi : qualité, épreuve, leçon & verset pivot." },
    { id: "bible-timeline", cat: "parcours", icon: "⏳", name: "Frise chronologique biblique", desc: "12 grandes époques de la Création jusqu'au Paradis promis." },
    { id: "stats-reading-plan", cat: "parcours", icon: "📊", name: "Statistiques & plan personnalisé", desc: "Projection exacte de fin de lecture selon ton rythme quotidien." }
  ];

  // ==========================================================================
  // Rendu Interactif de Chaque Capacité Active
  // ==========================================================================

  function renderSkillWorkspace(skillId) {
    const curArt = window.DFWolReader?.getCurrentArticleData?.();
    const curBible = window.DFWolReader?.getCurrentBibleState?.();

    switch (skillId) {
      case "article-finder":
        return `
          <h4>🔎 Rechercheur d'articles ciblés</h4>
          <p class="card-helper-text">Choisis un thème ou tape ton besoin ci-dessous pour générer instantanément les meilleures pistes sur WOL & JW.org.</p>
          <div class="sb-topics-grid">
            ${TOPIC_MAP.map((t) => `
              <div class="sb-mini-card">
                <strong>${esc(t.title)}</strong>
                <div class="btn-group" style="margin-top:0.4rem;">
                  ${t.queries.slice(0, 2).map((q) => `<button type="button" class="btn-secondary btn-xs" data-sb-search="${esc(q)}">🔍 ${esc(q.slice(0, 28))}</button>`).join("")}
                </div>
              </div>
            `).join("")}
          </div>
        `;

      case "scripture-suggester":
        return `
          <h4>📖 Suggéreur de versets par situation</h4>
          <p class="card-helper-text">Clique sur n'importe quel verset pour l'ouvrir avec ses notes & renvois dans le volet Étude individuelle.</p>
          <div class="sb-topics-grid">
            ${TOPIC_MAP.map((t) => `
              <div class="sb-mini-card">
                <strong>${esc(t.title)}</strong>
                <p style="font-size:0.84rem;color:var(--text-secondary);margin:0.25rem 0 0.45rem;">${esc(t.advice)}</p>
                <div class="btn-group">${renderScriptureChips(t.verses)}</div>
              </div>
            `).join("")}
          </div>
        `;

      case "personal-recs": {
        const notes = window.DFWolGetNotes ? window.DFWolGetNotes() : [];
        const hls = window.DFWolReader?.getAllHighlights ? window.DFWolReader.getAllHighlights() : [];
        const bms = window.DFWolStudy ? Object.values(window.DFWolStudy.getBookmarks()) : [];
        const corpus = `${notes.map((n) => `${n.title} ${n.body}`).join(" ")} ${hls.map((h) => h.quote).join(" ")}`.toLowerCase();
        const scoredTopics = TOPIC_MAP.map((t) => ({
          topic: t,
          hits: t.keywords.reduce((acc, kw) => acc + (corpus.includes(kw) ? 1 : 0), 0)
        })).sort((a, b) => b.hits - a.hits);
        const top = scoredTopics.slice(0, 3);
        return `
          <h4>🧭 Recommandations personnalisées (100 % local)</h4>
          <p class="card-helper-text">Basé sur tes <strong>${notes.length}</strong> notes, <strong>${hls.length}</strong> surlignages et <strong>${bms.length}</strong> marque-pages.</p>
          ${top.map(({ topic, hits }) => `
            <div class="sb-mini-card" style="margin-bottom:0.65rem;">
              <div style="display:flex;justify-content:space-between;gap:0.5rem;">
                <strong>${esc(topic.title)}</strong>
                <span class="badge badge-blue">${hits > 0 ? `${hits} affinité(s)` : "Découverte"}</span>
              </div>
              <p style="font-size:0.85rem;margin:0.35rem 0;">${esc(topic.advice)}</p>
              <div class="btn-group">
                ${renderScriptureChips(topic.verses.slice(0, 3))}
                <button type="button" class="btn-secondary btn-xs" data-sb-search="${esc(topic.queries[0])}">🔍 Articles WOL</button>
              </div>
            </div>
          `).join("")}
        `;
      }

      case "notes-synth": {
        const notes = window.DFWolGetNotes ? window.DFWolGetNotes() : [];
        const allText = notes.map((n) => `${n.title} ${n.body}`).join("\n");
        const refs = window.DFWolBible?.parseScriptureReferences?.(allText, lang()) || [];
        const uniqueRefs = Array.from(new Set(refs.map((r) => r.label)));
        const tagCounts = {};
        notes.forEach((n) => {
          const t = n.tag || "Étude Perso";
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
        return `
          <h4>🗂️ Synthétiseur de mes notes (${notes.length})</h4>
          <div class="btn-group" style="margin-bottom:0.75rem;">
            ${Object.entries(tagCounts).map(([t, c]) => `<span class="badge badge-blue">${esc(t)} : ${c}</span>`).join("") || "<small>Aucune note encore.</small>"}
          </div>
          <p><strong>Versets cités dans ton carnet (${uniqueRefs.length}) :</strong></p>
          <div class="btn-group" style="margin-bottom:0.8rem;">
            ${uniqueRefs.length ? renderScriptureChips(uniqueRefs.slice(0, 18)) : "<small>Ajoute des références (ex: Ps 83:18) dans tes notes pour les relier ici.</small>"}
          </div>
          <button type="button" class="btn-secondary btn-xs" id="sb-copy-notes-synth">📋 Copier la synthèse du carnet</button>
        `;
      }

      case "wol-query-builder":
        return `
          <h4>⚡ Constructeur booléen WOL</h4>
          <div class="sb-form-grid">
            <label>Mot(s) obligatoires (ET) <input type="text" id="sb-qb-and" class="input-compact" placeholder="ex: foi endurance" /></label>
            <label>Au moins un de (OU) <input type="text" id="sb-qb-or" class="input-compact" placeholder="ex: joie paix" /></label>
            <label>Expression exacte ("…") <input type="text" id="sb-qb-exact" class="input-compact" placeholder="ex: amour fidèle" /></label>
            <label>Mot de titre (#) <input type="text" id="sb-qb-title" class="input-compact" placeholder="ex: Questions des lecteurs" /></label>
            <label>Exclure (!) <input type="text" id="sb-qb-not" class="input-compact" placeholder="ex: ancien" /></label>
          </div>
          <div class="sb-code-preview" id="sb-qb-output" style="margin:0.65rem 0;">Prévisualisation de la requête WOL…</div>
          <div class="btn-group">
            <button type="button" class="btn-primary btn-xs" id="sb-qb-run">🔍 Lancer dans Recherche Totale</button>
            <button type="button" class="btn-secondary btn-xs" id="sb-qb-copy">📋 Copier</button>
          </div>
        `;

      case "daily-text-brief": {
        const ref = document.getElementById("dt-scripture-ref-btn")?.textContent?.trim() || "Texte du jour";
        const quote = document.getElementById("dt-scripture-text")?.textContent?.trim() || "";
        const comm = document.getElementById("dt-commentary-text")?.textContent?.trim() || "";
        const sentences = comm.split(/(?<=[.!?])\s+/).filter((s) => s.length > 25);
        const keyIdea = sentences[0] || "Ouvre d'abord le Texte du jour sur l'Accueil pour l'analyser ici.";
        const takeaway = sentences[sentences.length - 1] || "";
        return `
          <h4>☀️ Synthèse locale du Texte du jour</h4>
          <div class="sb-mini-card">
            <span class="badge badge-blue">${esc(ref)}</span>
            ${quote ? `<blockquote class="dt-quote" style="margin:0.5rem 0;">${esc(quote)}</blockquote>` : ""}
            <p><strong>Idée maîtresse :</strong> ${esc(keyIdea)}</p>
            ${takeaway && takeaway !== keyIdea ? `<p style="margin-top:0.4rem;"><strong>Application pratique :</strong> ${esc(takeaway)}</p>` : ""}
            <div class="btn-group" style="margin-top:0.5rem;">
              ${ref && ref !== "Texte du jour" ? renderScriptureChips([ref]) : ""}
              ${(quote || keyIdea) ? `<button type="button" class="btn-secondary btn-xs" id="sb-dt-speak-btn">🗣️ Lire avec Vivienne</button>` : ""}
            </div>
          </div>
        `;
      }

      case "book-sheets": {
        const allBooks = window.DFWolBible?.BIBLE_BOOKS || [];
        const sheetByNum = new Map(BOOK_SHEETS.map((bs) => [bs.num, bs]));
        const curLang = lang();
        return `
          <h4>📜 Fiches panoramiques des 66 livres bibliques</h4>
          <input type="search" id="sb-books-filter" class="input-compact" placeholder="Filtrer un livre (Genèse, Psaumes, Matthieu, Révélation…)" style="margin-bottom:0.65rem;" />
          <div class="sb-topics-grid" id="sb-books-grid">
            ${allBooks.map((b) => {
              const name = window.DFWolBible.getBookDisplayName(b, curLang);
              const meta = sheetByNum.get(b.num);
              const testamentLabel = b.num <= 39 ? "Écritures hébraïques" : "Écritures grecques";
              return `
                <div class="sb-mini-card sb-book-card" data-bname="${esc(name.toLowerCase())}">
                  <div style="display:flex;justify-content:space-between;gap:0.4rem;">
                    <strong>${b.num}. ${esc(name)}</strong>
                    <small>${b.chapters} ch.</small>
                  </div>
                  <small style="color:var(--jw-blue-link);">${esc(meta ? `${meta.author} · ${meta.era}` : testamentLabel)}</small>
                  ${meta ? `<p style="font-size:0.84rem;margin:0.3rem 0;">${esc(meta.theme)}</p><small style="display:block;color:var(--text-secondary);margin-bottom:0.4rem;">${esc(meta.structure)}</small>` : `<p style="font-size:0.82rem;color:var(--text-secondary);margin:0.3rem 0 0.45rem;">Livre n° ${b.num} · ${esc(testamentLabel)} (${b.chapters} chapitres).</p>`}
                  <div class="btn-group">
                    <button type="button" class="btn-secondary btn-xs" data-sb-book-intro="${b.num}">📘 Aperçu du livre</button>
                    <button type="button" class="btn-primary btn-xs" data-sb-open-ref="${esc(name)} 1:1">📖 Ouvrir ch. 1</button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      case "chapter-analyzer": {
        const pData = curBible?.primaryData;
        if (!pData?.verses?.length) {
          return `
            <h4>🔬 Analyseur du chapitre ouvert</h4>
            <p class="card-helper-text">Aucun chapitre biblique n'est chargé pour le moment.</p>
            <button type="button" class="btn-primary btn-xs" data-sb-open-ref="Psaume 83:18">📖 Charger Psaume 83</button>
          `;
        }
        const bName = window.DFWolBible.getBookDisplayName(pData.book, pData.lang || lang());
        const fullTxt = pData.verses.map((v) => v.text).join(" ");
        const words = fullTxt.split(/\s+/).filter(Boolean);
        const stopWords = new Set(["dans", "pour", "avec", "nous", "vous", "leurs", "tout", "tous", "cette", "mais", "qui", "que", "est", "sont", "les", "des", "une", "par", "pas", "sur", "aux", "ils", "elle", "son", "ses", "mon", "ton", "car", "comme", "plus", "that", "with", "this", "from", "have", "your", "they", "will", "were", "when"]);
        const freq = new Map();
        words.forEach((w) => {
          const cleanW = w.toLowerCase().replace(/[^\p{L}]/gu, "");
          if (cleanW.length >= 4 && !stopWords.has(cleanW)) {
            freq.set(cleanW, (freq.get(cleanW) || 0) + 1);
          }
        });
        const topKeywords = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const readSec = Math.round((words.length / 150) * 60);
        return `
          <h4>🔬 Analyse de ${esc(bName)} ${pData.chapter}</h4>
          <div class="btn-group" style="margin-bottom:0.65rem;">
            <span class="badge badge-blue">${pData.verses.length} versets</span>
            <span class="badge badge-blue">${words.length} mots</span>
            <span class="badge badge-blue">~${Math.max(1, Math.round(readSec / 60))} min de lecture</span>
          </div>
          <p><strong>Mots clés dominants :</strong></p>
          <div class="btn-group" style="margin-bottom:0.7rem;">
            ${topKeywords.map(([w, c]) => `<button type="button" class="pill-btn pill-xs" data-sb-search="${esc(w)}">${esc(w)} (${c})</button>`).join("")}
          </div>
          <p><strong>Premier & dernier verset :</strong></p>
          <p class="card-helper-text"><strong>v.${pData.verses[0].verse}</strong> : ${esc(pData.verses[0].text)}</p>
          <p class="card-helper-text"><strong>v.${pData.verses[pData.verses.length - 1].verse}</strong> : ${esc(pData.verses[pData.verses.length - 1].text)}</p>
        `;
      }

      case "crossref-chains": {
        const chains = [
          { title: "Nom divin & relation avec Dieu", refs: ["Exode 3:15", "Psaume 83:18", "Proverbes 18:10", "Joël 2:32", "Jean 17:6, 26"] },
          { title: "Promesse du Royaume sur la Terre", refs: ["Genèse 1:28", "Psaume 37:11, 29", "Daniel 2:44", "Matthieu 6:9, 10", "Révélation 21:3, 4"] },
          { title: "La Rançon de Jésus Christ", refs: ["Genèse 3:15", "Isaïe 53:5", "Matthieu 20:28", "Jean 3:16", "Romains 5:8"] },
          { title: "Paix & Confiance dans les épreuves", refs: ["Psaume 23:1-4", "Isaïe 41:10", "Matthieu 6:33, 34", "Philippiens 4:6, 7", "1 Pierre 5:7"] }
        ];
        return `
          <h4>🔗 Chaînes thématiques de renvois bibliques</h4>
          ${chains.map((c) => `
            <div class="sb-mini-card" style="margin-bottom:0.65rem;">
              <strong>${esc(c.title)}</strong>
              <div class="btn-group" style="margin-top:0.45rem;">${renderScriptureChips(c.refs)}</div>
            </div>
          `).join("")}
        `;
      }

      case "verse-lens":
        return `
          <h4>💎 Loupe d'étude sur un verset</h4>
          <div class="btn-group" style="margin-bottom:0.6rem;">
            <input type="text" id="sb-lens-input" class="input-compact" placeholder="Ex: Psaume 83:18 ou Romains 12:12" value="Psaume 83:18" />
            <button type="button" class="btn-primary btn-xs" id="sb-lens-open">Ouvrir dans le volet Étude</button>
          </div>
          <div class="sb-mini-card">
            <p><strong>4 questions automatiques pour tout verset :</strong></p>
            <ul style="margin:0.35rem 0 0 1.2rem;font-size:0.88rem;line-height:1.5;">
              <li>Qui parle à qui, et dans quel contexte ?</li>
              <li>Quelle qualité de Jéhovah ou du Christ ressort ?</li>
              <li>Quel principe reste éternellement valable aujourd'hui ?</li>
              <li>À qui ou comment appliquer ce principe cette semaine ?</li>
            </ul>
          </div>
        `;

      case "quality-comparator": {
        const pairs = [
          { a: "Douceur (Praütês)", b: "Faiblesse", diff: "La douceur biblique est une force maîtrisée sous le contrôle de Dieu (comme Moïse ou Jésus), jamais de la lâcheté.", refs: ["Matthieu 11:29", "Galates 5:23"] },
          { a: "Crainte révérencielle", b: "Terreur morbide", diff: "Craindre Jéhovah signifie l'aimer et le respecter assez pour ne pas vouloir le peiner — cela libère de la peur humaine.", refs: ["Proverbes 29:25", "1 Jean 4:18"] },
          { a: "Humilité véritable", b: "Dévalorisation de soi", diff: "L'humilité reconnaît la grandeur de Dieu tout en sachant que notre vie a un immense prix à ses yeux.", refs: ["Matthieu 10:29-31", "Philippiens 2:3"] },
          { a: "Pardon volontaire", b: "Naïveté ou approbation du mal", diff: "Pardonner libère notre propre cœur de l'amertume, tout en conservant discernement et limites saines.", refs: ["Colossiens 3:13", "Proverbes 22:3"] }
        ];
        return `
          <h4>⚖️ Comparateur de qualités chrétiennes</h4>
          <div class="sb-topics-grid">
            ${pairs.map((p) => `
              <div class="sb-mini-card">
                <strong>${esc(p.a)} ≠ ${esc(p.b)}</strong>
                <p style="font-size:0.85rem;margin:0.35rem 0;">${esc(p.diff)}</p>
                <div class="btn-group">${renderScriptureChips(p.refs)}</div>
              </div>
            `).join("")}
          </div>
        `;
      }

      case "bible-glossary":
        return `
          <h4>📚 Glossaire biblique express (${GLOSSARY_TERMS.length} termes)</h4>
          <input type="search" id="sb-glossary-filter" class="input-compact" placeholder="Filtrer un mot (rançon, âme, présence, Géhenne…)" style="margin-bottom:0.65rem;" />
          <div id="sb-glossary-list" class="sb-topics-grid">
            ${GLOSSARY_TERMS.map((g) => `
              <div class="sb-mini-card sb-glossary-item" data-gterm="${esc(g.term.toLowerCase())}">
                <strong>${esc(g.term)}</strong>
                <p style="font-size:0.84rem;margin:0.25rem 0 0.45rem;">${esc(g.def)}</p>
                <div class="btn-group">${renderScriptureChips(g.refs)}</div>
              </div>
            `).join("")}
          </div>
        `;

      case "quick-encouragement": {
        const moods = [
          { k: "fatigue", label: "😩 Fatigué", text: "Tu n'as pas à tout porter seul aujourd'hui. Jéhovah te demande ta fidélité de ce jour, pas une force surhumaine.", verse: "Isaïe 40:29" },
          { k: "inquiet", label: "😟 Inquiet", text: "Un seul souffle calme vers Dieu vaut mieux que cent scénarios sombres dans la tête. Remets-lui cette préoccupation maintenant.", verse: "Psaume 55:22" },
          { k: "seul", label: "🫂 Seul", text: "Même si personne ne mesure ce que tu traverses intérieurement, le Berger te connaît par ton nom et compte tes larmes.", verse: "Psaume 56:8" },
          { k: "joyeux", label: "😊 Reconnaissant", text: "Profite de cette belle journée pour remercier Jéhovah nommément et partager une phrase encourageante à quelqu'un !", verse: "1 Thessaloniciens 5:18" }
        ];
        return `
          <h4>🕊️ Encouragement spirituel du moment</h4>
          <div class="sb-topics-grid">
            ${moods.map((m, i) => `
              <div class="sb-mini-card">
                <strong>${m.label}</strong>
                <p style="font-size:0.86rem;margin:0.35rem 0;">${esc(m.text)}</p>
                <div class="btn-group">
                  ${renderScriptureChips([m.verse])}
                  <button type="button" class="btn-secondary btn-xs" data-sb-speak-mood="${i}">🗣️ Écouter</button>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }

      case "meditation-4step":
        return `
          <h4>🪷 Atelier de méditation en 4 étapes</h4>
          <div class="sb-form-grid">
            <label>Passage ou thème étudié <input type="text" id="sb-med-ref" class="input-compact" placeholder="Ex: Psaume 23 ou texte d'aujourd'hui" /></label>
            <label>1. Qu'est-ce que cela m'apprend sur Jéhovah ? <textarea id="sb-med-1" rows="2" class="input-compact" placeholder="Ses qualités, sa patience, sa justice…"></textarea></label>
            <label>2. Quel lien avec Jésus Christ ou le Royaume ? <textarea id="sb-med-2" rows="2" class="input-compact" placeholder="Comment l'exemple ou le règne de Christ l'illustre ?"></textarea></label>
            <label>3. Comment cela fortifie-t-il ma foi ou mon espérance ? <textarea id="sb-med-3" rows="2" class="input-compact"></textarea></label>
            <label>4. Quel petit geste concret vais-je poser cette semaine ? <textarea id="sb-med-4" rows="2" class="input-compact"></textarea></label>
          </div>
          <button type="button" class="btn-primary btn-xs" id="sb-med-save-note" style="margin-top:0.55rem;">📝 Enregistrer dans mon Carnet de Notes</button>
        `;

      case "prayer-guide":
        return `
          <h4>🙏 Guide de prière structurée</h4>
          <div class="sb-topics-grid">
            <div class="sb-mini-card"><strong>1. Louange & Sainteté</strong><p>Reconnais qui est Jéhovah : sa sagesse dans la création, sa patience et sa souveraineté (Psaume 104:24).</p></div>
            <div class="sb-mini-card"><strong>2. Gratitude ciblée</strong><p>Remercie pour 3 bénédictions précises vécues aujourd'hui, petites ou grandes (Psaume 107:1).</p></div>
            <div class="sb-mini-card"><strong>3. Pardon & Humilité</strong><p>Exprime sincèrement tes erreurs et demande son aide pour corriger un trait (Psaume 139:23, 24).</p></div>
            <div class="sb-mini-card"><strong>4. Demandes & Intercession</strong><p>Prie pour ta famille, les frères persécutés, ta force spirituelle, toujours au nom de Jésus (Philippiens 4:6 ; Jean 14:13).</p></div>
          </div>
        `;

      case "verse-flashcards": {
        const cards = [
          { ref: "Psaume 83:18", text: "Que l'on sache que toi, dont le nom est Jéhovah, tu es, toi seul, le Très-Haut sur toute la terre !" },
          { ref: "Jean 17:3", text: "Ceci signifie la vie éternelle : qu'ils apprennent à te connaître, toi, le seul vrai Dieu, et celui que tu as envoyé, Jésus Christ." },
          { ref: "Proverbes 3:5, 6", text: "Fais confiance à Jéhovah de tout ton cœur et ne t'appuie pas sur ton intelligence. Dans toutes tes voies, tiens compte de lui, et il rendra droits tes sentiers." },
          { ref: "Isaïe 41:10", text: "N'aie pas peur, car je suis avec toi. Ne t'inquiète pas, car je suis ton Dieu. Je te rendrai fort, oui, je t'aiderai." },
          { ref: "Philippiens 4:6, 7", text: "Ne vous inquiétez de rien, mais en tout, par la prière et la supplication avec des remerciements, faites connaître vos requêtes à Dieu ; et la paix de Dieu gardera vos cœurs." },
          { ref: "Révélation 21:4", text: "Et il essuiera toute larme de leurs yeux, et la mort n'existera plus ; il n'y aura plus ni deuil, ni cri, ni douleur." }
        ];
        const card = cards[flashcardIdx % cards.length];
        const hintWords = card.text.split(" ").map((w) => w[0] + "•".repeat(Math.max(1, w.length - 1))).join(" ");
        return `
          <h4>🃏 Mémorisation active (${(flashcardIdx % cards.length) + 1}/${cards.length})</h4>
          <div class="sb-mini-card" style="text-align:center;padding:1.1rem;">
            <span class="badge badge-blue">${esc(card.ref)}</span>
            <p style="font-size:1rem;margin:0.8rem 0;line-height:1.55;">
              ${flashcardStep === 0 ? "<em>Essaie de réciter ce verset à voix haute avant d'afficher l'indice ou le texte…</em>" : flashcardStep === 1 ? esc(hintWords) : `« ${esc(card.text)} »`}
            </p>
            <div class="btn-group" style="justify-content:center;">
              <button type="button" class="btn-secondary btn-xs" id="sb-fc-hint">💡 Indice initiales</button>
              <button type="button" class="btn-primary btn-xs" id="sb-fc-reveal">👁️ Révéler</button>
              <button type="button" class="btn-secondary btn-xs" id="sb-fc-next">Suivant →</button>
            </div>
          </div>
        `;
      }

      case "daily-challenge": {
        const challenges = [
          "Envoie un bref message encourageant à un frère ou une sœur âgé(e) ou isolé(e).",
          "Lis un chapitre des Psaumes lentement en identifiant deux raisons de louer Jéhovah.",
          "Avant de répondre dans une discussion tendue aujourd'hui, compte 3 secondes et applique Proverbes 15:1.",
          "Remercie Jéhovah dans ta prière du soir pour trois bénédictions précises sans rien demander d'autre.",
          "Prépare d'avance un commentaire court de 20 secondes pour la prochaine réunion.",
          "Relis une note ancienne de ton carnet et médite 5 minutes sur son verset clé.",
          "Apprends ou révise par cœur un verset d'espérance pour le ministère."
        ];
        const dayIdx = Math.floor(Date.now() / 86400000) % challenges.length;
        const todayStr = new Date().toISOString().slice(0, 10);
        const prefs = loadBrotherPrefs();
        const done = prefs.challengeDoneDate === todayStr;
        return `
          <h4>🌟 Défi spirituel du jour</h4>
          <div class="sb-mini-card">
            <p style="font-size:1.02rem;font-weight:600;margin-bottom:0.65rem;">${esc(challenges[dayIdx])}</p>
            <button type="button" class="${done ? "btn-secondary" : "btn-primary"} btn-xs" id="sb-challenge-toggle">
              ${done ? "✅ Relevé aujourd'hui !" : "☐ Marquer comme accompli"}
            </button>
          </div>
        `;
      }

      case "family-worship": {
        const plans = [
          { title: "Soirée Portrait Biblique", steps: "Choisir un personnage (ex: Ruth ou Néhémie), lire 1 chapitre ensemble, jouer une scène courte, tirer 2 leçons familiales.", refs: ["Ruth 1:16", "Néhémie 2:4"] },
          { title: "Chasse aux trésors dans la Bible", steps: "Chaque membre trouve en 3 min un verset sur la joie, la création ou la prière et explique pourquoi il lui plaît.", refs: ["Psaume 104:24", "Proverbes 17:22"] },
          { title: "Atelier Cantique & Espérance", steps: "Écouter un cantique dans Bibliothèque Audio, lire les versets cités dans la marge puis prier ensemble.", refs: ["Éphésiens 5:19"] },
          { title: "Simulation Objections du Ministère", steps: "S'entraîner avec bienveillance à répondre en 30s à 3 questions fréquentes des voisins.", refs: ["1 Pierre 3:15"] }
        ];
        return `
          <h4>👨‍👩‍👧‍👦 Planificateur de culte familial</h4>
          <div class="sb-topics-grid">
            ${plans.map((p) => `
              <div class="sb-mini-card">
                <strong>${esc(p.title)}</strong>
                <p style="font-size:0.85rem;margin:0.35rem 0;">${esc(p.steps)}</p>
                <div class="btn-group">${renderScriptureChips(p.refs)}</div>
              </div>
            `).join("")}
          </div>
        `;
      }

      case "comment-30s": {
        const paraTxt = curArt?.paragraphs?.[2]?.text || curArt?.paragraphs?.[1]?.text || "";
        return `
          <h4>💬 Générateur de commentaire de 30s (local)</h4>
          <p class="card-helper-text">${curArt ? `Article ouvert : <strong>${esc(curArt.title)}</strong>` : "Colle ci-dessous le paragraphe à commenter :"}</p>
          <textarea id="sb-comment-src" rows="3" class="input-compact" placeholder="Colle ici le paragraphe d'étude…">${esc(paraTxt)}</textarea>
          <div class="btn-group" style="margin:0.5rem 0;">
            <button type="button" class="btn-primary btn-xs" id="sb-gen-comment-btn">✨ Construire le commentaire (~30s)</button>
          </div>
          <div id="sb-comment-out" class="sb-mini-card hidden"></div>
        `;
      }

      case "pearl-extractor": {
        const textPool = curBible?.primaryData
          ? curBible.primaryData.verses.map((v) => `v.${v.verse}: ${v.text}`)
          : (curArt?.paragraphs || []).map((p) => p.text);
        const needles = [/jéhovah/i, /jésus|christ/i, /promet|promesse/i, /exemple|leçon|montre/i, /fidèl|amour|courage/i];
        const pearls = textPool.filter((line) => line.length > 35 && needles.some((rx) => rx.test(line))).slice(0, 5);
        return `
          <h4>💠 Extracteur de perles spirituelles (local)</h4>
          <p class="card-helper-text">${curBible?.primaryData ? "Chapitre biblique actif" : curArt ? `Article : ${esc(curArt.title)}` : "Ouvre d'abord un chapitre ou un article de réunion."}</p>
          ${pearls.length ? pearls.map((p, idx) => `
            <div class="sb-mini-card" style="margin-bottom:0.5rem;">
              <span class="badge badge-blue">Perle #${idx + 1}</span>
              <p style="font-size:0.86rem;margin:0.3rem 0;">${esc(p.slice(0, 260))}${p.length > 260 ? "…" : ""}</p>
            </div>
          `).join("") : "<p class='card-helper-text'>Ouvre un chapitre dans Bible ou un Cahier Vie et ministère pour extraire automatiquement des perles.</p>"}
        `;
      }

      case "article-summary": {
        if (!curArt) {
          return `<h4>⏱️ Résumeur & temps de lecture</h4><p class="card-helper-text">Ouvre d'abord un article dans Réunions ou Bibliothèque pour obtenir son résumé local instantané.</p>`;
        }
        const words = (curArt.plainText || "").split(/\s+/).filter(Boolean).length;
        const mins = Math.max(1, Math.round(words / 180));
        const keySents = (curArt.paragraphs || []).map((p) => p.text).filter((t) => t.length > 45).slice(0, 4);
        return `
          <h4>⏱️ Résumé express : ${esc(curArt.title)}</h4>
          <div class="btn-group" style="margin-bottom:0.65rem;">
            <span class="badge badge-blue">~${words} mots</span>
            <span class="badge badge-blue">Lecture : ~${mins} min</span>
          </div>
          ${keySents.map((s) => `<div class="sb-mini-card" style="margin-bottom:0.45rem;"><p style="font-size:0.85rem;">${esc(s.slice(0, 220))}…</p></div>`).join("")}
        `;
      }

      case "talk-outliner":
        return `
          <h4>🎙️ Constructeur de plan d'exposé</h4>
          <div class="sb-form-grid">
            <label>Thème de l'exposé <input type="text" id="sb-talk-title" class="input-compact" placeholder="Ex: Garder sa joie dans les épreuves" /></label>
            <label>Durée cible
              <select id="sb-talk-dur" class="input-compact">
                <option value="5">5 min (Élève / Lecture + Leçon)</option>
                <option value="10" selected>10 min (Joyaux / Besoins locaux)</option>
                <option value="15">15 min (Discours thématique)</option>
              </select>
            </label>
            <label>Verset thème <input type="text" id="sb-talk-verse" class="input-compact" placeholder="Ex: Jacques 1:2-4" /></label>
          </div>
          <button type="button" class="btn-primary btn-xs" id="sb-talk-gen-btn" style="margin:0.55rem 0;">Générer le canevas minuté</button>
          <div id="sb-talk-out" class="sb-mini-card hidden"></div>
        `;

      case "speech-timer":
        return `
          <h4>⏲️ Chronomètre & débit d'exposé (~130 mots/min)</h4>
          <textarea id="sb-speech-text" rows="4" class="input-compact" placeholder="Colle ici tes notes ou ton introduction rédigée pour estimer ta durée réelle…"></textarea>
          <p id="sb-speech-estimate" class="card-helper-text" style="margin:0.4rem 0;">0 mots · 0 min 00 s estimées (à 130 mots/min)</p>
          <div class="sb-timer-box">
            <strong id="sb-stopwatch-display" style="font-size:1.5rem;font-variant-numeric:tabular-nums;">00:00</strong>
            <div class="btn-group">
              <button type="button" class="btn-primary btn-xs" id="sb-sw-toggle">${rehearsalTimer.running ? "⏸ Pause" : "▶ Démarrer"}</button>
              <button type="button" class="btn-secondary btn-xs" id="sb-sw-reset">↺ Remise à zéro</button>
            </div>
          </div>
        `;

      case "meeting-prep-checklist": {
        const items = [
          { id: "mprep-joyaux", label: "Lire la portion biblique & noter 1 perle" },
          { id: "mprep-cahier", label: "Surligner et préparer 2 commentaires Cahier" },
          { id: "mprep-min", label: "Réviser les présentations Vie & Ministère" },
          { id: "mprep-tg", label: "Lire les paragraphes et versets clés de La Tour de Garde" },
          { id: "mprep-cant", label: "Écouter les cantiques de la semaine (Voix / Audio)" },
          { id: "mprep-com", label: "Rédiger en 1 phrase un commentaire personnel" }
        ];
        const prefs = loadBrotherPrefs();
        const checked = prefs.meetingChecklist || {};
        return `
          <h4>✅ Check-list préparation de réunion</h4>
          <div class="sb-topics-grid">
            ${items.map((it) => `
              <label class="sb-mini-card" style="display:flex;align-items:center;gap:0.6rem;cursor:pointer;">
                <input type="checkbox" class="sb-mprep-cb" data-mprep-id="${it.id}" ${checked[it.id] ? "checked" : ""} />
                <span>${esc(it.label)}</span>
              </label>
            `).join("")}
          </div>
        `;
      }

      case "ministry-starters": {
        const starters = [
          { ctx: "Porte-à-porte", txt: "« Bonjour ! Beaucoup de voisins se demandent si l'avenir offrira enfin une vraie stabilité. Pensez-vous que ce changement viendra des gouvernements ou d'ailleurs ? »", verse: "Daniel 2:44" },
          { ctx: "Témoignage informel (banc, café)", txt: "« Avez-vous vu les actualités ce matin ? Face à tout cela, je suis tombé sur une pensée courte mais vraiment apaisante… »", verse: "Psaume 46:9" },
          { ctx: "Appel téléphonique", txt: "« Bonjour, je vous appelle juste une minute pour partager une phrase encourageante que beaucoup apprécient en ce moment… »", verse: "Isaïe 41:10" },
          { ctx: "Jeune ou étudiant", txt: "« Avec toute la pression des études et des réseaux, quel est selon toi le meilleur conseil pour garder un bon moral ? »", verse: "Proverbes 3:5, 6" }
        ];
        return `
          <h4>🚪 Brise-glace pour le ministère</h4>
          <div class="sb-topics-grid">
            ${starters.map((s) => `
              <div class="sb-mini-card">
                <span class="badge badge-blue">${esc(s.ctx)}</span>
                <p style="font-size:0.86rem;margin:0.35rem 0;">${esc(s.txt)}</p>
                <div class="btn-group">${renderScriptureChips([s.verse])}</div>
              </div>
            `).join("")}
          </div>
        `;
      }

      case "objection-responder":
        return `
          <h4>🤝 Réponses pleines de tact (${OBJECTIONS.length} situations)</h4>
          <div class="sb-topics-grid">
            ${OBJECTIONS.map((o) => `
              <div class="sb-mini-card">
                <strong>${esc(o.obj)}</strong>
                <p style="font-size:0.84rem;margin:0.3rem 0 0.45rem;">${esc(o.reply)}</p>
                <div class="btn-group">${renderScriptureChips([o.verse])}</div>
              </div>
            `).join("")}
          </div>
        `;

      case "illustrations-bank":
        return `
          <h4>💡 Banque d'illustrations & analogies (${ILLUSTRATIONS.length})</h4>
          <div class="sb-topics-grid">
            ${ILLUSTRATIONS.map((il) => `
              <div class="sb-mini-card">
                <span class="badge badge-blue">${esc(il.topic)}</span>
                <strong style="display:block;margin-top:0.25rem;">${esc(il.title)}</strong>
                <p style="font-size:0.84rem;margin:0.3rem 0 0.45rem;">${esc(il.text)}</p>
                <div class="btn-group">${renderScriptureChips([il.verse])}</div>
              </div>
            `).join("")}
          </div>
        `;

      case "return-visit-3step":
        return `
          <h4>🔁 Préparateur de nouvelle visite en 3 étapes</h4>
          <div class="sb-form-grid">
            <label>Nom / repère de la personne <input type="text" id="sb-rv-who" class="input-compact" placeholder="Ex: M. Martin (2e étage)" /></label>
            <label>Sujet laissé la fois dernière <input type="text" id="sb-rv-last" class="input-compact" placeholder="Ex: L'avenir de la terre" /></label>
            <label>Verset clé pour cette visite <input type="text" id="sb-rv-verse" class="input-compact" placeholder="Ex: Psaume 37:29" /></label>
            <label>Question passerelle pour la visite suivante <input type="text" id="sb-rv-nextq" class="input-compact" placeholder="Ex: Comment savoir quand ce changement aura lieu ?" /></label>
          </div>
          <button type="button" class="btn-primary btn-xs" id="sb-rv-save" style="margin-top:0.55rem;">📝 Sauvegarder en Note « Ministère »</button>
        `;

      case "bible-quiz": {
        const q = QUIZ_BANK[quizState.idx % QUIZ_BANK.length];
        return `
          <h4>🏆 Quiz biblique interactif (${(quizState.idx % QUIZ_BANK.length) + 1}/${QUIZ_BANK.length}) · Score : ${quizState.score}</h4>
          <div class="sb-mini-card">
            <p style="font-weight:600;margin-bottom:0.65rem;">${esc(q.q)}</p>
            <div class="sb-quiz-opts">
              ${q.a.map((opt, idx) => {
                let cls = "btn-secondary btn-xs sb-quiz-opt";
                if (quizState.answered) {
                  if (idx === q.c) cls = "btn-primary btn-xs sb-quiz-opt is-correct";
                  else if (idx === quizState.selected) cls = "btn-secondary btn-xs sb-quiz-opt is-wrong";
                }
                return `<button type="button" class="${cls}" data-sb-quiz-opt="${idx}">${esc(opt)}</button>`;
              }).join("")}
            </div>
            ${quizState.answered ? `
              <div class="btn-group" style="margin-top:0.7rem;">
                ${renderScriptureChips([q.ref])}
                <button type="button" class="btn-primary btn-xs" id="sb-quiz-next">Question suivante →</button>
              </div>
            ` : ""}
          </div>
        `;
      }

      case "character-profiles":
        return `
          <h4>👤 Profils de personnages bibliques (${CHARACTER_PROFILES.length})</h4>
          <div class="sb-topics-grid">
            ${CHARACTER_PROFILES.map((c) => `
              <div class="sb-mini-card">
                <strong>${esc(c.name)}</strong> <small style="color:var(--jw-blue-link);">· ${esc(c.trait)}</small>
                <p style="font-size:0.82rem;color:var(--text-secondary);margin:0.25rem 0;">Épreuve : ${esc(c.trial)}</p>
                <p style="font-size:0.85rem;margin:0.25rem 0 0.45rem;">${esc(c.lesson)}</p>
                <div class="btn-group">${renderScriptureChips([c.verse])}</div>
              </div>
            `).join("")}
          </div>
        `;

      case "bible-timeline":
        return `
          <h4>⏳ Frise chronologique biblique</h4>
          <div class="sb-timeline-list">
            ${TIMELINE_EVENTS.map((ev) => `
              <div class="sb-mini-card" style="margin-bottom:0.5rem;">
                <div style="display:flex;justify-content:space-between;gap:0.5rem;">
                  <strong>${esc(ev.title)}</strong>
                  <span class="badge badge-blue">${esc(ev.date)}</span>
                </div>
                <p style="font-size:0.84rem;margin:0.25rem 0 0.4rem;">${esc(ev.desc)}</p>
                <div class="btn-group">${renderScriptureChips([ev.verse])}</div>
              </div>
            `).join("")}
          </div>
        `;

      case "stats-reading-plan": {
        let totalCh = 0;
        try {
          const st = JSON.parse(localStorage.getItem("dfwol_studio_state_v3") || "{}");
          Object.values(st.readingProgress || {}).forEach((arr) => {
            if (Array.isArray(arr)) totalCh += arr.length;
          });
        } catch (_) {}
        const remaining = Math.max(0, 1189 - totalCh);
        const pace = Number(loadBrotherPrefs().pace || 3);
        const daysLeft = Math.ceil(remaining / Math.max(1, pace));
        const etaDate = new Date(Date.now() + daysLeft * 86400000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        const streak = window.DFWolStudy?.updateAndGetStreak ? window.DFWolStudy.updateAndGetStreak() : 1;
        return `
          <h4>📊 Mes statistiques & plan de lecture personnalisé</h4>
          <div class="btn-group" style="margin-bottom:0.75rem;">
            <span class="badge badge-blue">${totalCh} / 1 189 chapitres lus</span>
            <span class="badge badge-blue">Série : ${streak} jour(s)</span>
            <span class="badge badge-blue">Restant : ${remaining} ch.</span>
          </div>
          <label style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.65rem;">
            Mon rythme :
            <select id="sb-plan-pace" class="input-compact" style="width:auto;">
              ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${pace === n ? "selected" : ""}>${n} chapitre(s)/jour</option>`).join("")}
            </select>
          </label>
          <div class="sb-mini-card">
            <p>Au rythme de <strong>${pace} chapitre(s) par jour</strong>, tu termineras la lecture intégrale dans environ <strong>${daysLeft} jours</strong> (le <strong>${esc(etaDate)}</strong>).</p>
          </div>
        `;
      }

      default:
        return `<p class="card-helper-text">Sélectionne une des 32 capacités ci-dessus ou pose ta question à Spiritual Brother.</p>`;
    }
  }

  function bindSkillWorkspaceEvents(rootEl) {
    if (!rootEl) return;

    rootEl.querySelectorAll("[data-sb-open-ref]").forEach((btn) => {
      btn.addEventListener("click", () => openScriptureRef(btn.getAttribute("data-sb-open-ref")));
    });

    rootEl.querySelectorAll("[data-sb-search]").forEach((btn) => {
      btn.addEventListener("click", () => launchWolSearch(btn.getAttribute("data-sb-search")));
    });

    rootEl.querySelector("#sb-lens-open")?.addEventListener("click", () => {
      const val = rootEl.querySelector("#sb-lens-input")?.value || "Psaume 83:18";
      openScriptureRef(val);
    });

    rootEl.querySelector("#sb-glossary-filter")?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      rootEl.querySelectorAll(".sb-glossary-item").forEach((el) => {
        el.classList.toggle("hidden", Boolean(q) && !el.textContent.toLowerCase().includes(q));
      });
    });

    rootEl.querySelector("#sb-books-filter")?.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      rootEl.querySelectorAll(".sb-book-card").forEach((el) => {
        el.classList.toggle("hidden", Boolean(q) && !el.textContent.toLowerCase().includes(q));
      });
    });

    rootEl.querySelectorAll("[data-sb-book-intro]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bNum = Number(btn.getAttribute("data-sb-book-intro"));
        window.DFWolReader?.openBibleBookIntro?.(bNum, lang());
      });
    });

    rootEl.querySelectorAll("[data-sb-speak-mood]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".sb-mini-card");
        if (card) speakText("Encouragement Spiritual Brother", card.querySelector("p")?.textContent || "");
      });
    });

    rootEl.querySelector("#sb-dt-speak-btn")?.addEventListener("click", () => {
      const txt = rootEl.querySelector(".sb-mini-card")?.textContent || "";
      speakText("Synthèse Texte du jour", txt);
    });

    // Constructeur WOL
    const qbInputs = ["#sb-qb-and", "#sb-qb-or", "#sb-qb-exact", "#sb-qb-title", "#sb-qb-not"].map((id) => rootEl.querySelector(id)).filter(Boolean);
    const buildQbQuery = () => {
      const andRaw = rootEl.querySelector("#sb-qb-and")?.value.trim();
      const orRaw = rootEl.querySelector("#sb-qb-or")?.value.trim();
      const exRaw = rootEl.querySelector("#sb-qb-exact")?.value.trim();
      const tiRaw = rootEl.querySelector("#sb-qb-title")?.value.trim();
      const notRaw = rootEl.querySelector("#sb-qb-not")?.value.trim();
      const parts = [];
      if (andRaw) parts.push(andRaw.split(/\s+/).join(" & "));
      if (orRaw) parts.push(`(${orRaw.split(/\s+/).join(" | ")})`);
      if (exRaw) parts.push(`"${exRaw.replace(/"/g, "")}"`);
      if (tiRaw) parts.push(`#"${tiRaw.replace(/"/g, "")}"`);
      if (notRaw) parts.push(`!${notRaw.split(/\s+/)[0]}`);
      return parts.join(" & ");
    };
    qbInputs.forEach((inp) => {
      inp.addEventListener("input", () => {
        const out = rootEl.querySelector("#sb-qb-output");
        if (out) out.textContent = buildQbQuery() || "Prévisualisation de la requête WOL…";
      });
    });
    rootEl.querySelector("#sb-qb-run")?.addEventListener("click", () => launchWolSearch(buildQbQuery()));
    rootEl.querySelector("#sb-qb-copy")?.addEventListener("click", () => {
      const q = buildQbQuery();
      q && window.DFWolStudy?.safeCopyText?.(q, "Requête booléenne copiée !");
    });

    // Synthèse carnet
    rootEl.querySelector("#sb-copy-notes-synth")?.addEventListener("click", () => {
      const notes = window.DFWolGetNotes ? window.DFWolGetNotes() : [];
      const txt = notes.map((n, i) => `${i + 1}. [${n.tag}] ${n.title}\n${n.body}`).join("\n\n");
      window.DFWolStudy?.safeCopyText?.(txt || "Aucune note.", "Synthèse copiée !");
    });

    // Méditation 4 étapes -> Carnet de Notes
    rootEl.querySelector("#sb-med-save-note")?.addEventListener("click", () => {
      const ref = rootEl.querySelector("#sb-med-ref")?.value.trim() || "Méditation personnelle";
      const s1 = rootEl.querySelector("#sb-med-1")?.value.trim();
      const s2 = rootEl.querySelector("#sb-med-2")?.value.trim();
      const s3 = rootEl.querySelector("#sb-med-3")?.value.trim();
      const s4 = rootEl.querySelector("#sb-med-4")?.value.trim();
      const body = [
        s1 ? `1. Sur Jéhovah : ${s1}` : "",
        s2 ? `2. Sur Jésus/Royaume : ${s2}` : "",
        s3 ? `3. Pour ma foi : ${s3}` : "",
        s4 ? `4. Application : ${s4}` : ""
      ].filter(Boolean).join("\n");
      if (!body) return window.DFWolToast && window.DFWolToast("Remplis au moins une étape.");
      window.DFWolAddNote && window.DFWolAddNote(`Méditation — ${ref}`, "Étude Perso", body);
    });

    // Flashcards
    rootEl.querySelector("#sb-fc-hint")?.addEventListener("click", () => {
      flashcardStep = 1;
      render("study-view-brother");
    });
    rootEl.querySelector("#sb-fc-reveal")?.addEventListener("click", () => {
      flashcardStep = 2;
      render("study-view-brother");
    });
    rootEl.querySelector("#sb-fc-next")?.addEventListener("click", () => {
      flashcardIdx++;
      flashcardStep = 0;
      render("study-view-brother");
    });

    // Défi quotidien
    rootEl.querySelector("#sb-challenge-toggle")?.addEventListener("click", () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const prefs = loadBrotherPrefs();
      saveBrotherPrefs({ challengeDoneDate: prefs.challengeDoneDate === todayStr ? "" : todayStr });
      render("study-view-brother");
    });

    // Commentaire 30s local
    rootEl.querySelector("#sb-gen-comment-btn")?.addEventListener("click", () => {
      const src = rootEl.querySelector("#sb-comment-src")?.value.trim() || "";
      const out = rootEl.querySelector("#sb-comment-out");
      if (!out || !src) return;
      const sentences = src.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
      const first = sentences[0] || src.slice(0, 140);
      const mid = sentences[Math.min(1, sentences.length - 1)] || "";
      const refs = window.DFWolBible?.parseScriptureReferences?.(src, lang()) || [];
      const refHint = refs[0] ? `Comme le souligne ${refs[0].label}, ` : "";
      const generated = `${first.replace(/[.!?]+$/, "")}. ${refHint}${mid ? mid.replace(/^([A-Z])/, (m) => m.toLowerCase()) : "Cela nous motive à appliquer cette pensée concrètement dès cette semaine."}`;
      const words = generated.split(/\s+/).filter(Boolean).length;
      out.classList.remove("hidden");
      out.innerHTML = `
        <strong>Suggestion naturelle (~${words} mots · ~${Math.max(12, Math.round((words / 130) * 60))}s) :</strong>
        <p style="margin:0.4rem 0;">« ${esc(generated)} »</p>
        <button type="button" class="btn-secondary btn-xs" id="sb-copy-comment-gen">📋 Copier</button>
      `;
      out.querySelector("#sb-copy-comment-gen")?.addEventListener("click", () => {
        window.DFWolStudy?.safeCopyText?.(generated, "Commentaire copié !");
      });
    });

    // Plan d'exposé
    rootEl.querySelector("#sb-talk-gen-btn")?.addEventListener("click", () => {
      const title = rootEl.querySelector("#sb-talk-title")?.value.trim() || "Thème biblique";
      const dur = Number(rootEl.querySelector("#sb-talk-dur")?.value || 10);
      const verse = rootEl.querySelector("#sb-talk-verse")?.value.trim() || "Proverbes 3:5, 6";
      const out = rootEl.querySelector("#sb-talk-out");
      if (!out) return;
      const introMin = Math.max(1, Math.round(dur * 0.15));
      const bodyMin = Math.max(3, Math.round(dur * 0.7));
      const conclMin = Math.max(1, dur - introMin - bodyMin);
      const planText = `EXPOSÉ (${dur} min) : ${title}\nVerset thème : ${verse}\n1. Introduction (${introMin} min) : Question accroche + annonce du thème.\n2. Développement (${bodyMin} min) :\n   • Point A : Lire et expliquer ${verse}\n   • Point B : Illustration concrète tirée de la vie courante\n   • Point C : Application pratique aujourd'hui\n3. Conclusion (${conclMin} min) : Résumé clair + appel encourageant à l'action.`;
      out.classList.remove("hidden");
      out.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;margin:0 0 0.5rem;">${esc(planText)}</pre><button type="button" class="btn-primary btn-xs" id="sb-save-talk-note">📝 Enregistrer comme Note</button>`;
      out.querySelector("#sb-save-talk-note")?.addEventListener("click", () => {
        window.DFWolAddNote && window.DFWolAddNote(`Plan : ${title}`, "Exposé", planText);
      });
    });

    // Chronomètre discours
    const speechTa = rootEl.querySelector("#sb-speech-text");
    const estEl = rootEl.querySelector("#sb-speech-estimate");
    if (speechTa && estEl) {
      const updateEst = () => {
        const wc = speechTa.value.trim().split(/\s+/).filter(Boolean).length;
        const sec = Math.round((wc / 130) * 60);
        estEl.textContent = `${wc} mots · ${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, "0")} s estimées (à 130 mots/min)`;
      };
      speechTa.addEventListener("input", updateEst);
    }
    const formatSw = (ms) => {
      const s = Math.floor(ms / 1000);
      return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    };
    rootEl.querySelector("#sb-sw-toggle")?.addEventListener("click", (e) => {
      const disp = rootEl.querySelector("#sb-stopwatch-display");
      if (rehearsalTimer.running) {
        clearInterval(rehearsalTimer.intervalId);
        rehearsalTimer.elapsedMs += Date.now() - rehearsalTimer.startedAt;
        rehearsalTimer.running = false;
        e.currentTarget.textContent = "▶ Reprendre";
      } else {
        rehearsalTimer.startedAt = Date.now();
        rehearsalTimer.running = true;
        e.currentTarget.textContent = "⏸ Pause";
        rehearsalTimer.intervalId = setInterval(() => {
          const el = document.getElementById("sb-stopwatch-display");
          if (el) el.textContent = formatSw(rehearsalTimer.elapsedMs + (Date.now() - rehearsalTimer.startedAt));
        }, 250);
      }
      if (disp) disp.textContent = formatSw(rehearsalTimer.elapsedMs);
    });
    rootEl.querySelector("#sb-sw-reset")?.addEventListener("click", () => {
      clearInterval(rehearsalTimer.intervalId);
      rehearsalTimer = { running: false, startedAt: 0, elapsedMs: 0, intervalId: null };
      const disp = rootEl.querySelector("#sb-stopwatch-display");
      if (disp) disp.textContent = "00:00";
      const btn = rootEl.querySelector("#sb-sw-toggle");
      if (btn) btn.textContent = "▶ Démarrer";
    });

    // Check-list réunion
    rootEl.querySelectorAll(".sb-mprep-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        const prefs = loadBrotherPrefs();
        const cur = prefs.meetingChecklist || {};
        cur[cb.getAttribute("data-mprep-id")] = cb.checked;
        saveBrotherPrefs({ meetingChecklist: cur });
      });
    });

    // Nouvelle visite
    rootEl.querySelector("#sb-rv-save")?.addEventListener("click", () => {
      const who = rootEl.querySelector("#sb-rv-who")?.value.trim() || "Nouvelle visite";
      const last = rootEl.querySelector("#sb-rv-last")?.value.trim() || "-";
      const v = rootEl.querySelector("#sb-rv-verse")?.value.trim() || "-";
      const nextQ = rootEl.querySelector("#sb-rv-nextq")?.value.trim() || "-";
      const body = `1. Rappel précédent : ${last}\n2. Verset préparé : ${v}\n3. Question pour la suite : ${nextQ}`;
      window.DFWolAddNote && window.DFWolAddNote(`Visite — ${who}`, "Ministère", body);
    });

    // Quiz biblique
    rootEl.querySelectorAll("[data-sb-quiz-opt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (quizState.answered) return;
        const chosen = Number(btn.getAttribute("data-sb-quiz-opt"));
        const q = QUIZ_BANK[quizState.idx % QUIZ_BANK.length];
        quizState.answered = true;
        quizState.selected = chosen;
        if (chosen === q.c) quizState.score++;
        render("study-view-brother");
      });
    });
    rootEl.querySelector("#sb-quiz-next")?.addEventListener("click", () => {
      quizState.idx++;
      quizState.answered = false;
      quizState.selected = -1;
      render("study-view-brother");
    });

    // Rythme plan de lecture
    rootEl.querySelector("#sb-plan-pace")?.addEventListener("change", (e) => {
      saveBrotherPrefs({ pace: Number(e.target.value) });
      render("study-view-brother");
    });
  }

  // ==========================================================================
  // Vue Principale Spiritual Brother (#study-view-brother)
  // ==========================================================================

  function render(containerId = "study-view-brother") {
    const root = document.getElementById(containerId);
    if (!root) return;

    const cats = [
      { id: "all", label: `Tout (${SKILLS.length})` },
      { id: "recherche", label: "Recherche (6)" },
      { id: "bible", label: "Bible (6)" },
      { id: "meditation", label: "Méditation (6)" },
      { id: "reunions", label: "Réunions (6)" },
      { id: "ministere", label: "Ministère (4)" },
      { id: "parcours", label: "Parcours (4)" }
    ];
    const visibleSkills = activeCategory === "all" ? SKILLS : SKILLS.filter((s) => s.cat === activeCategory);

    if (chatHistory.length === 0) {
      chatHistory.push({
        role: "brother",
        text: "Salut ! Je suis **Spiritual Brother**, ton compagnon spirituel **100 % local** (zéro clé API requise). Dis-moi ce que tu traverses, le sujet que tu recherches, ou explore mes **32 outils** ci-dessous.",
        verses: ["Psaume 83:18", "Proverbes 3:5, 6", "Philippiens 4:6, 7"],
        queries: ["paix d'esprit Bible", "trouver des perles spirituelles"]
      });
    }

    root.innerHTML = `
      <div class="sb-shell card">
        <div class="sb-header">
          <div class="sb-avatar" aria-hidden="true">🧭</div>
          <div>
            <h3>Spiritual Brother <span class="badge badge-blue">IA 100 % Locale · 32 Capacités</span></h3>
            <p class="card-helper-text">Suggestions d'articles, versets, méditation, ministère & étude — instantané, privé et sans aucune clé API.</p>
          </div>
        </div>

        <div class="sb-chat-thread" id="sb-chat-thread">
          ${chatHistory.map((msg) => `
            <div class="sb-chat-msg ${msg.role === "user" ? "is-user" : "is-brother"}">
              <div class="sb-chat-bubble">
                <p style="white-space:pre-wrap;margin:0;">${esc(msg.text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>
                ${msg.verses?.length ? `<div class="btn-group" style="margin-top:0.45rem;">${renderScriptureChips(msg.verses)}</div>` : ""}
                ${msg.queries?.length ? `<div class="btn-group" style="margin-top:0.35rem;">${msg.queries.map((q) => `<button type="button" class="btn-secondary btn-xs" data-sb-search="${esc(q)}">🔍 ${esc(q)}</button>`).join("")}</div>` : ""}
                ${msg.recommendedSkill ? `<div style="margin-top:0.35rem;"><button type="button" class="btn-ghost btn-xs" data-sb-select-skill="${esc(msg.recommendedSkill)}">🛠️ Ouvrir l'outil associé</button></div>` : ""}
              </div>
            </div>
          `).join("")}
        </div>

        <form class="sb-chat-form" id="sb-chat-form">
          <input type="text" id="sb-chat-input" class="input-compact" placeholder="Ex : Je suis découragé, versets sur le pardon, plan d'exposé, Ruth…" autocomplete="off" />
          <button type="submit" class="btn-primary btn-sm">Demander 🧭</button>
        </form>

        <div class="sb-quick-prompts btn-group" style="margin-top:0.5rem;">
          <button type="button" class="pill-btn pill-xs" data-sb-prompt="Je suis inquiet, quels versets lire ?">😟 Inquiet</button>
          <button type="button" class="pill-btn pill-xs" data-sb-prompt="Trouve-moi des articles sur le pardon">🕊️ Pardon</button>
          <button type="button" class="pill-btn pill-xs" data-sb-prompt="Conseils pour le culte en famille">👨‍👩‍👧 Famille</button>
          <button type="button" class="pill-btn pill-xs" data-sb-prompt="Parle-moi de Daniel">👤 Daniel</button>
        </div>
      </div>

      <div class="sb-skills-section card" style="margin-top:1rem;">
        <div class="card-header-row" style="margin-bottom:0.65rem;">
          <h3>🛠️ Les 32 Capacités de Spiritual Brother</h3>
          <div class="btn-group">${cats.map((c) => `<button type="button" class="pill-btn pill-xs ${activeCategory === c.id ? "active" : ""}" data-sb-cat="${c.id}">${esc(c.label)}</button>`).join("")}</div>
        </div>

        <div class="sb-skills-grid">
          ${visibleSkills.map((sk) => `
            <button type="button" class="sb-skill-tile ${activeSkillId === sk.id ? "active" : ""}" data-sb-skill="${esc(sk.id)}">
              <span class="sb-skill-ico">${sk.icon}</span>
              <div>
                <strong>${esc(sk.name)}</strong>
                <small>${esc(sk.desc)}</small>
              </div>
            </button>
          `).join("")}
        </div>

        ${activeSkillId && activeSkillId !== "chat" ? `<div class="sb-active-workspace" id="sb-active-workspace">${renderSkillWorkspace(activeSkillId)}</div>` : ""}
      </div>
    `;

    const thread = root.querySelector("#sb-chat-thread");
    if (thread) thread.scrollTop = thread.scrollHeight;

    root.querySelector("#sb-chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = root.querySelector("#sb-chat-input");
      const text = inp?.value.trim();
      if (!text) return;
      chatHistory.push({ role: "user", text });
      const ans = analyzeUserQueryLocally(text);
      chatHistory.push({ role: "brother", text: ans.reply, verses: ans.verses, queries: ans.queries, recommendedSkill: ans.recommendedSkill });
      if (chatHistory.length > 24) chatHistory = chatHistory.slice(-24);
      render(containerId);
    });

    root.querySelectorAll("[data-sb-prompt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-sb-prompt");
        chatHistory.push({ role: "user", text });
        const ans = analyzeUserQueryLocally(text);
        chatHistory.push({ role: "brother", text: ans.reply, verses: ans.verses, queries: ans.queries, recommendedSkill: ans.recommendedSkill });
        render(containerId);
      });
    });

    root.querySelectorAll("[data-sb-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = btn.getAttribute("data-sb-cat");
        render(containerId);
      });
    });

    root.querySelectorAll("[data-sb-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSkillId = btn.getAttribute("data-sb-skill");
        render(containerId);
        document.getElementById("sb-active-workspace")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });

    root.querySelectorAll("[data-sb-select-skill]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSkillId = btn.getAttribute("data-sb-select-skill");
        render(containerId);
        document.getElementById("sb-active-workspace")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });

    root.querySelectorAll("[data-sb-open-ref]").forEach((btn) => {
      btn.addEventListener("click", () => openScriptureRef(btn.getAttribute("data-sb-open-ref")));
    });

    root.querySelectorAll("[data-sb-search]").forEach((btn) => {
      btn.addEventListener("click", () => launchWolSearch(btn.getAttribute("data-sb-search")));
    });

    bindSkillWorkspaceEvents(root.querySelector("#sb-active-workspace"));
  }

  function init() {
    if (uiBound) {
      return;
    }
    uiBound = true;
    render("study-view-brother");
  }

  return {
    init,
    render,
    getSkills: () => SKILLS.slice(),
    analyzeQuery: analyzeUserQueryLocally
  };
})();
