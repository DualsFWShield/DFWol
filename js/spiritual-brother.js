/* ==========================================================================
   DFWol Studio — « Spiritual Brother » : Tchat IA Spirituel 100 % Local
   Zéro clé API · Mémoire contextuelle · Recherche Bible & WOL en direct
   ========================================================================== */

window.DFWolBrother = (function () {
  "use strict";

  const CHAT_STORAGE_KEY = "dfwol_brother_chat_v2";
  let uiBound = false;
  let isThinking = false;
  let chatHistory = [];
  let convContext = {
    lastTopicId: null,
    lastRefs: [],
    lastQuery: "",
    lastBookNum: null,
    lastCharName: null
  };

  function esc(str) {
    return window.DFWolSearch ? window.DFWolSearch.escapeHtml(str) : String(str || "");
  }

  function cleanStr(str) {
    return String(str || "").replace(/\s+/g, " ").trim();
  }

  function norm(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function lang() {
    return window.DFWolGetLang ? window.DFWolGetLang() : "fr";
  }

  function loadPersistedChat() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.messages)) {
        chatHistory = saved.messages.slice(-40);
      }
      if (saved && saved.context && typeof saved.context === "object") {
        convContext = Object.assign(convContext, saved.context);
      }
    } catch (_) {}
  }

  function savePersistedChat() {
    try {
      localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({
          messages: chatHistory.slice(-40),
          context: convContext
        })
      );
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
      text: String(text).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/[#*_`]/g, ""),
      lang: lang(),
      mode: "tts"
    });
  }

  // ==========================================================================
  // Base de Connaissances Bibliques & Spirituelles Locale
  // ==========================================================================

  const TOPIC_MAP = [
    {
      id: "anxiete",
      keywords: ["anxiet", "stress", "inquiet", "peur", "angoiss", "paniqu", "tracas", "worry", "anxious", "fear", "paix d'esprit", "serenite"],
      title: "Apaiser l'inquiétude et retrouver la paix intérieure",
      verses: ["Philippiens 4:6, 7", "1 Pierre 5:7", "Matthieu 6:34", "Psaume 55:22", "Isaïe 41:10", "Psaume 94:19"],
      queries: ['"ne vous inquiétez de rien" paix', 'anxiété prière confiance Jéhovah', '"pensées troublantes" consolation'],
      advice: "Dépose avec précision ce qui pèse sur ton cœur dans la prière, un jour à la fois. En **Philippiens 4:6, 7**, Jéhovah ne promet pas forcément la disparition immédiate du problème, mais une **paix qui dépasse toute pensée** pour garder ton cœur comme une sentinelle.",
      illustration: "Un voyageur qui porte son lourd sac tout en étant déjà monté dans le train s'épuise inutilement ; **1 Pierre 5:7** nous invite à poser littéralement le fardeau sur les épaules de Jéhovah."
    },
    {
      id: "decouragement",
      keywords: ["decourag", "fatigue", "epuis", "triste", "larm", "deprim", "baisser les bras", "vide", "lassitude", "discourag", "sad", "tired"],
      title: "Reprendre courage quand la force vient à manquer",
      verses: ["Psaume 34:18", "2 Corinthiens 4:16", "Isaïe 40:29-31", "Galates 6:9", "Hébreux 6:10", "1 Rois 19:5-8"],
      queries: ['"cœur brisé" Psaume 34:18', 'persévérer découragement espérance', '"puissance qui dépasse la normale"'],
      advice: "Même des serviteurs fidèles comme Élie ont connu l'épuisement total (**1 Rois 19**). Jéhovah n'attend pas l'impossible : il remarque chaque petit pas fidèle (**Hébreux 6:10**) et renouvelle notre force jour après jour.",
      illustration: "Comme un coureur de fond qui ralentit dans une côte sans quitter le tracé, notre fidélité se mesure sur l'endurance, pas sur l'absence de fatigue."
    },
    {
      id: "pardon",
      keywords: ["pardon", "culpabil", "faute", "peche", "remord", "rancune", "reconcil", "forgiv", "guilt", "sin", "misericord", "regret"],
      title: "Le pardon de Jéhovah et le pardon envers autrui",
      verses: ["Psaume 86:5", "Isaïe 1:18", "1 Jean 1:9", "Colossiens 3:13", "Psaume 103:12", "Éphésiens 4:32"],
      queries: ['"prêt à pardonner" Psaume 86', 'surmonter culpabilité miséricorde', '"aussi loin que le levant"'],
      advice: "Quand le repentir est sincère, Jéhovah efface nos fautes « aussi loin que le levant est du couchant » (**Psaume 103:12**). S'accabler encore après avoir prié sincèrement revient à douter de la valeur de la rançon du Christ (**1 Jean 3:19, 20**).",
      illustration: "Pardonner à autrui ne signifie pas approuver le mal subi, mais décider de ne plus retenir la dette contre son frère."
    },
    {
      id: "famille",
      keywords: ["famille", "mariag", "couple", "enfant", "parent", "epoux", "epouse", "ado", "culte familial", "foyer", "family", "marriage", "child"],
      title: "Harmonie familiale, couple et éducation des enfants",
      verses: ["Éphésiens 5:28, 33", "Colossiens 3:18-21", "Proverbes 15:1", "Ecclésiaste 4:9, 12", "Deutéronome 6:6, 7", "Éphésiens 6:4"],
      queries: ['vie de famille communication respect', '"corde triple" mariage', '"parler avec douceur" famille'],
      advice: "Une famille unie repose sur l'écoute bienveillante, la patience et des moments spirituels joyeux. **Proverbes 15:1** montre qu'une réponse douce désamorce bien des tensions avant qu'elles n'enflent.",
      illustration: "Une corde à trois brins (**Ecclésiaste 4:12**) reste souple tout en supportant une tension immense lorsque Jéhovah est le troisième brin du foyer."
    },
    {
      id: "deuil",
      keywords: ["deuil", "mort", "resurrect", "perte", "disparu", "tombe", "grief", "death", "mourning", "paradise"],
      title: "Consolation dans le deuil et espérance de la résurrection",
      verses: ["Jean 5:28, 29", "Révélation 21:3, 4", "Jean 11:25, 35", "Psaume 147:3", "2 Corinthiens 1:3, 4", "Job 14:14, 15"],
      queries: ['résurrection espérance deuil consolation', '"essuiera toute larme" Révélation 21', 'Lazare espérance résurrection'],
      advice: "Jésus lui-même a laissé couler ses larmes devant le tombeau de Lazare (**Jean 11:35**). Pleurer n'est jamais un manque de foi. En **Job 14:14, 15**, Jéhovah dit qu'il *languit* après l'œuvre de ses mains pour la ramener à la vie.",
      illustration: "Jésus a comparé la mort à un sommeil profond sans rêves : celui qui dort ne souffre pas et se réveillera comme après une simple nuit."
    },
    {
      id: "priere",
      keywords: ["prier", "priere", "exauc", "ecout", "pray", "prayer"],
      title: "Rendre ses prières plus profondes et personnelles",
      verses: ["1 Jean 5:14", "Psaume 62:8", "Matthieu 6:9-13", "Romains 12:12", "Proverbes 15:8", "Philippiens 4:6"],
      queries: ['"répandez votre cœur" prière', 'comment améliorer nos prières', 'prière modèle Matthieu 6'],
      advice: "Parle à Jéhovah comme à un Père proche : commence par **louer** qui il est, **remercie-le** pour 2 ou 3 choses précises de ta journée, exprime **tes besoins sincères** et prie au nom de Jésus (**Jean 14:13**).",
      illustration: "Un dialogue vrai avec un ami précieux demande d'ouvrir son cœur sans formules figées, tout en écoutant sa réponse dans sa Parole."
    },
    {
      id: "jeunesse",
      keywords: ["jeune", "ecole", "ami", "tentation", "reseaux", "avenir", "etudes", "camarad", "youth", "school", "peer"],
      title: "Force morale pour les jeunes face aux pressions",
      verses: ["Ecclésiaste 12:1", "1 Timothée 4:12", "Proverbes 13:20", "Psaume 119:9", "2 Timothée 2:22", "1 Corinthiens 15:33"],
      queries: ['jeunes pressions camarades fidélité', '"souviens-toi de ton Grand Créateur"', '"modèle pour les fidèles" jeunes'],
      advice: "Tes choix d'aujourd'hui protègent la joie de tes vingt ans futurs. Choisir des amis qui partagent l'amour de Jéhovah (**Proverbes 13:20**) allège énormément la pression quotidienne.",
      illustration: "Une seule goutte d'encre trouble vite un verre d'eau limpide ; protéger ses fréquentations garde l'esprit clair."
    },
    {
      id: "decisions",
      keywords: ["choix", "decid", "travail", "emploi", "argent", "priorit", "sagess", "dilemme", "orientation", "wisdom", "work", "money"],
      title: "Prendre de sages décisions selon les principes bibliques",
      verses: ["Proverbes 3:5, 6", "Matthieu 6:33", "Jacques 1:5", "Luc 14:28", "Hébreux 13:5", "Proverbes 21:5"],
      queries: ['prendre sagesse décisions prière', '"cherchez d\'abord le Royaume"', '"évaluer la dépense" Luc 14'],
      advice: "Avant d'agir, pose trois questions simples : *Quels principes bibliques s'appliquent ? Quel impact sur mes réunions et ma spiritualité ? Quelle paix de conscience aurai-je dans cinq ans ?*",
      illustration: "Avant d'emprunter une route inconnue la nuit, consulter le GPS (**Psaume 119:105**) évite de longs détours coûteux."
    },
    {
      id: "ministere",
      keywords: ["predic", "minister", "enseign", "temoign", "nouvelle visite", "objection", "bible study", "preach", "ministry", "teach"],
      title: "Efficacité, tact et joie dans le ministère",
      verses: ["2 Timothée 4:2", "Colossiens 4:6", "Matthieu 28:19, 20", "Actes 17:22", "Proverbes 25:11", "1 Pierre 3:15"],
      queries: ['"assaisonnées de sel" tact prédication', 'efficacité enseignement Bible', 'engager conversation ministère'],
      advice: "Une belle discussion tient en trois temps : **écouter sincèrement**, **trouver un point commun**, puis **partager un seul verset clair** avec une question ouverte pour la prochaine rencontre.",
      illustration: "Une bonne parole dite au bon moment ressemble à des « pommes d'or dans des ciselures d'argent » (**Proverbes 25:11**) : sobre, précieuse et agréable à recevoir."
    },
    {
      id: "amour",
      keywords: ["amour", "frere", "soeur", "unite", "hospital", "conflit", "dispute", "assemblee", "congr", "love", "brother", "unity"],
      title: "Amour fraternel, paix et pardon dans l'assemblée",
      verses: ["Jean 13:34, 35", "1 Corinthiens 13:4-8", "1 Jean 4:7, 8", "Romains 12:10", "Psaume 133:1", "Matthieu 5:23, 24"],
      queries: ['"amour ne disparaît jamais"', 'unité congrégation pardon', '"honorez-vous les uns les autres"'],
      advice: "L'amour décrit en **1 Corinthiens 13:4-8** n'est pas d'abord une émotion, mais une décision active de patience, d'écoute et d'hospitalité, surtout quand nos personnalités diffèrent.",
      illustration: "Comme des pierres taillées pour un même édifice, les frottements mutuels finissent par nous ajuster ensemble."
    },
    {
      id: "esperance",
      keywords: ["esper", "royaume", "paradis", "avenir", "prophet", "fin du monde", "monde nouveau", "hope", "kingdom", "future"],
      title: "Rendre vivante l'espérance du Royaume et du Paradis",
      verses: ["Psaume 37:10, 11, 29", "Isaïe 65:21-25", "Daniel 2:44", "Romains 15:4, 13", "Hébreux 11:1", "Hébreux 6:19"],
      queries: ['espérance Royaume de Dieu paradis', '"ancre de l\'âme" Hébreux 6', 'Isaïe 65 monde nouveau'],
      advice: "En **Hébreux 6:19**, l'espérance est comparée à une *ancre* solide et sûre : elle empêche notre navire de dériver quand les vagues de ce système se déchaînent.",
      illustration: "Un navire ancré dans le fond marin reste immobile même sous la tempête ; méditer sur **Isaïe 65:21-25** ancre notre cœur."
    },
    {
      id: "patience",
      keywords: ["colere", "impati", "agac", "maitrise", "calme", "temper", "anger", "self-control", "patience"],
      title: "Maîtrise de soi, patience et sérénité",
      verses: ["Proverbes 14:29", "Proverbes 16:32", "Jacques 1:19, 20", "Éphésiens 4:26, 31", "Galates 5:22, 23"],
      queries: ['"lent à la colère" Proverbes', 'maîtrise de soi patience esprit', '"prompt à écouter" Jacques 1'],
      advice: "Applique la règle de **Jacques 1:19** : être *prompt à écouter, lent à parler, lent à se mettre en colère*. Laisser passer trente secondes ou prier silencieusement comme Néhémie (**Néhémie 2:4**) change souvent toute la conversation.",
      illustration: "Celui qui domine son esprit vaut plus que celui qui prend une ville (**Proverbes 16:32**)."
    },
    {
      id: "solitude",
      keywords: ["seul", "solitud", "isole", "abandonn", "incompris", "lonely", "alone"],
      title: "Quand la solitude pèse sur le cœur",
      verses: ["Psaume 27:10", "Psaume 68:5, 6", "Jean 16:32", "Isaïe 41:10", "Proverbes 18:24"],
      queries: ['surmonter solitude Jéhovah proche', '"Père des orphelins" Psaume 68', 'trouver amis assemblée'],
      advice: "Même quand Jésus savait que ses apôtres allaient se disperser, il a dit : « Je ne suis pas seul, parce que le Père est avec moi » (**Jean 16:32**). Tu peux aussi prendre l'initiative d'un appel ou d'une courte visite envers quelqu'un d'autre qui se sent isolé.",
      illustration: "Allumer une bougie pour éclairer quelqu'un d'autre illumine d'abord nos propres mains."
    },
    {
      id: "tentation",
      keywords: ["tentat", "chute", "habitude", "puret", "depend", "addict", "pecher", "temptation"],
      title: "Résister aux tentations et garder un cœur pur",
      verses: ["1 Corinthiens 10:13", "Jacques 1:14, 15", "Psaume 119:9, 11", "Galates 5:16", "Romains 12:9"],
      queries: ['"pas tenté au-delà de ce que vous pouvez"', 'résister tentation fuir', 'pureté morale prière'],
      advice: "**1 Corinthiens 10:13** assure que Jéhovah prépare toujours une *issue* avec la tentation. Le secret consiste souvent à agir *avant* le moment critique, en coupant l'occasion et en priant immédiatement à voix basse.",
      illustration: "On éteint bien plus facilement une étincelle qu'un incendie déjà propagé : fuis dès le premier compromis."
    },
    {
      id: "sante",
      keywords: ["malad", "sante", "hopital", "douleur", "souffr", "handicap", "sang", "sick", "health", "pain", "illness"],
      title: "Force et paix pendant la maladie ou l'épreuve physique",
      verses: ["Psaume 41:3", "Isaïe 33:24", "2 Corinthiens 12:9", "Romains 8:38, 39", "Psaume 73:26"],
      queries: ['"soutiendra sur un lit de douleur" Psaume 41', '"aucun habitant ne dira : Je suis malade"', 'maladie chronique consolation'],
      advice: "**Psaume 41:3** promet tendrement que Jéhovah « le soutiendra sur un lit de douleur » et transformera tout son lit pendant sa maladie. Garde tes objectifs à la mesure de ton énergie d'aujourd'hui : Jéhovah connaît tes limites (**Psaume 103:14**).",
      illustration: "Dans un hiver rigoureux, un arbre garde ses racines vivantes sans devoir produire de feuilles chaque semaine : rester attaché à Jéhovah suffit parfois largement."
    },
    {
      id: "bible_verite",
      keywords: ["nom divin", "jehovah", "jesus", "croix", "ame", "science", "creation", "trinite", "enfer", "1914", "verite", "doctrine"],
      title: "Fondements doctrinaux et exactitude des Écritures",
      verses: ["Psaume 83:18", "Jean 17:3", "2 Timothée 3:16, 17", "Romains 1:20", "Actes 17:11", "Ecclésiaste 9:5"],
      queries: ['Psaume 83:18 nom divin Jéhovah', '"toute Écriture est inspirée"', 'vérifier enseignements Écritures Bérée'],
      advice: "Comme les Béréens d'**Actes 17:11**, vérifie toujours chaque question en comparant les versets dans leur contexte : la Bible s'explique merveilleusement par elle-même.",
      illustration: "Assembler les différentes pièces d'un puzzle fait apparaître une image limpide et cohérente de la vérité biblique."
    }
  ];

  const BOOK_SHEETS = {
    1: { author: "Moïse", era: "v. 1513 av. n. è.", theme: "Origines, promesse d'Éden et alliance abrahamique", structure: "1–11 Origines · 12–50 Patriarches" },
    2: { author: "Moïse", era: "v. 1512 av. n. è.", theme: "Délivrance d'Égypte, sanctification du nom de Jéhovah et Loi", structure: "1–18 Exode · 19–40 Alliance & Tabernacle" },
    18: { author: "Moïse", era: "v. 1473 av. n. è.", theme: "Intégrité humaine et question de la souveraineté universelle", structure: "1–2 Épreuve · 3–31 Discours · 32–42 Élihou & Jéhovah" },
    19: { author: "David, fils de Qoré, Asaph, Moïse…", era: "v. 1473–460 av. n. è.", theme: "Louange, prière dans l'épreuve et confiance en Jéhovah", structure: "5 recueils (1–41 · 42–72 · 73–89 · 90–106 · 107–150)" },
    20: { author: "Salomon, Agour, Lemouël", era: "v. 717 av. n. è.", theme: "Sagesse pratique fondée sur la crainte de Jéhovah", structure: "1–9 Fondements · 10–29 Maximes · 30–31 Conseils" },
    23: { author: "Isaïe", era: "v. 732 av. n. è.", theme: "Jugement, consolation et le Serviteur messianique", structure: "1–39 Avertissements · 40–66 Promesses & Nouveaux cieux" },
    27: { author: "Daniel", era: "v. 536 av. n. è.", theme: "Domination éternelle du Très-Haut sur les royaumes humains", structure: "1–6 Intégrité à Babylone · 7–12 Visions prophétiques" },
    40: { author: "Matthieu", era: "v. 41 de n. è.", theme: "Jésus Christ est le Roi messianique promis", structure: "1–4 Origines · 5–7 Sermon · 8–25 Ministère · 26–28 Rançon" },
    42: { author: "Luc", era: "v. 56–58 de n. è.", theme: "Récit historique précis du Sauveur compatissant pour tous", structure: "1–9 Galilée · 10–19 En route vers Jérusalem · 20–24 Sacrifice" },
    43: { author: "Apôtre Jean", era: "v. 98 de n. è.", theme: "Jésus révèle l'amour du Père et donne la vie éternelle", structure: "1–12 Signes publics · 13–17 Dernier soir · 18–21 Victoire" },
    44: { author: "Luc", era: "v. 61 de n. è.", theme: "Expansion rapide de la bonne nouvelle grâce à l'esprit saint", structure: "1–7 Jérusalem · 8–12 Judée/Samarie · 13–28 Voyages missionnaires" },
    45: { author: "Apôtre Paul", era: "v. 56 de n. è.", theme: "Justification par la foi en la rançon et conduite chrétienne", structure: "1–11 Rançon & dessin divin · 12–16 Vie de l'assemblée" },
    58: { author: "Apôtre Paul", era: "v. 61 de n. è.", theme: "Supériorité du sacerdoce du Christ et foi persévérante", structure: "1–10 Grand Prêtre Jésus · 11–13 Nuée de témoins" },
    66: { author: "Apôtre Jean", era: "v. 96 de n. è.", theme: "Triomphe complet du Royaume de Dieu et Paradis restauré", structure: "1–3 Sept assemblées · 4–20 Victoire · 21–22 Nouveaux cieux & terre" }
  };

  const CHARACTER_PROFILES = [
    { name: "Ruth", trait: "Amour fidèle & humilité", trial: "Veuvage et déracinement complet en pays étranger", lesson: "Sa loyauté envers Jéhovah et Naomi l'a fait entrer dans la lignée du Messie.", verse: "Ruth 1:16, 17" },
    { name: "David", trait: "Courage & repentir sincère", trial: "Persécution de Saül, graves fautes suivies de discipline", lesson: "Dieu chérit un cœur entier qui reconnaît vite ses torts et reste proche de Lui.", verse: "1 Samuel 17:45" },
    { name: "Esther", trait: "Bravoure réfléchie & tact", trial: "Risque de mort devant Assuérus pour défendre le peuple de Dieu", lesson: "Allier jeûne/prière, calme préparation et franchise au bon moment.", verse: "Esther 4:14" },
    { name: "Daniel", trait: "Intégrité constante dès la jeunesse", trial: "Exil, pression culturelle, fournaise/fosse aux lions", lesson: "Une discipline quotidienne de prière rend inébranlable face aux plus grandes crises.", verse: "Daniel 6:10" },
    { name: "Joseph", trait: "Chasteté, endurance & pardon", trial: "Vendu par ses frères, faussement accusé et emprisonné", lesson: "Même oublié dans l'injustice, la fidélité prépare des délivrances inattendues.", verse: "Genèse 39:9" },
    { name: "Marie", trait: "Humilité joyeuse & méditation", trial: "Incompréhension, exil en Égypte et épreuve du poteau", lesson: "Garder et méditer les paroles de Dieu fortifie le cœur pour les tempêtes futures.", verse: "Luc 1:38" },
    { name: "Paul", trait: "Zèle, adaptabilité & gratitude", trial: "Naufrages, lapidation, prison et épine dans la chair", lesson: "La puissance du Christ s'accomplit précisément lorsque nous sentons nos limites.", verse: "2 Corinthiens 12:9" },
    { name: "Timothée", trait: "Bienveillance sincère & progrès", trial: "Jeunesse, timidité et ennuis de santé chroniques", lesson: "L'intérêt sincère pour les frères l'emporte sur l'appréhension naturelle.", verse: "1 Timothée 4:12" },
    { name: "Néhémie", trait: "Prière éclair & esprit pratique", trial: "Murs en ruine, menaces extérieures et découragement interne", lesson: "Une courte prière silencieuse avant chaque décision donne assurance et ordre.", verse: "Néhémie 2:4" },
    { name: "Job", trait: "Endurance & intégrité pure", trial: "Perte totale de ses biens, enfants et santé", lesson: "Servir Jéhovah par amour désintéressé et jamais par simple intérêt matériel.", verse: "Job 27:5" },
    { name: "Rahab", trait: "Foi courageuse traduite en actes", trial: "Élevée à Jéricho, ville pourtant vouée à la destruction", lesson: "Passé difficile ou milieu hostile n'empêchent jamais Jéhovah d'accueillir une foi sincère.", verse: "Hébreux 11:31" },
    { name: "Élie", trait: "Zèle vif & profonde humanité", trial: "Famine, confrontation solitaire au Carmel et épuisement moral", lesson: "Quand un serviteur s'effondre de fatigue, Jéhovah lui parle avec une voix calme et douce.", verse: "1 Rois 19:12" },
    { name: "Jonas", trait: "Apprentissage de la compassion", trial: "Répugnance envers Ninive, tempête et découragement sous le ricin", lesson: "La miséricorde de Jéhovah envers ceux qui se repentent dépasse de loin nos jugements.", verse: "Jonas 4:2" },
    { name: "Lydie", trait: "Cœur réceptif & hospitalité", trial: "Commerçante en ville païenne (Philippes)", lesson: "Ouvrir son foyer devient un pilier discret mais vital pour l'avancement de la vérité.", verse: "Actes 16:14, 15" },
    { name: "Pierre", trait: "Ardeur & reconstruction après chute", trial: "Peur des hommes, triple reniement et pardon du Christ", lesson: "Une défaillance même grave n'efface pas notre avenir spirituel quand le repentir est vrai.", verse: "Jean 21:17" },
    { name: "Abraham", trait: "Foi agissante & amitié avec Dieu", trial: "Quitter sa terre sans carte précise et l'épreuve de Moria", lesson: "Obéir pas à pas dans la confiance vaut d'être appelé « ami de Jéhovah ».", verse: "Jacques 2:23" },
    { name: "Moïse", trait: "Douceur remarquable & loyauté", trial: "Peuple souvent murmurateur pendant quarante ans", lesson: "Regarder constamment « Celui qui est invisible » permet de tenir ferme sous pression.", verse: "Hébreux 11:27" },
    { name: "Jérémie", trait: "Sensibilité & fidélité isolée", trial: "Quarante ans d'indifférence, fosse boueuse et rejet", lesson: "Un jeune timide soutenu par Jéhovah devient comme une « colonne de fer ».", verse: "Jérémie 1:8" },
    { name: "Hanna", trait: "Prière fervente dans la tristesse", trial: "Stérilité, moqueries répétées et incompréhension d'Éli", lesson: "Décharger son âme amèrement auprès de Jéhovah ramène un visage paisible avant même l'exaucement.", verse: "1 Samuel 1:18" },
    { name: "Barnabé", trait: "« Fils de consolation »", trial: "Tensions autour de Marc et doutes envers Paul converti", lesson: "Croire au potentiel des autres relève ceux que d'autres écarteraient.", verse: "Actes 9:27" }
  ];

  const GLOSSARY_TERMS = [
    { term: "Jéhovah", def: "Forme usuelle du Tétragramme YHWH (« Il fait devenir ») : nom personnel du Créateur (~7 000 fois dans le texte original).", refs: ["Psaume 83:18", "Exode 3:15"] },
    { term: "Âme (néphèsh / psykhé)", def: "Désigne un être vivant qui respire ou la vie elle-même — jamais une partie immortelle survivant séparément à la mort.", refs: ["Genèse 2:7", "Ézéchiel 18:4"] },
    { term: "Schéol / Hadès", def: "La tombe commune des humains, état d'inconscience et d'inactivité totale en attendant la résurrection.", refs: ["Ecclésiaste 9:5, 10", "Actes 2:27"] },
    { term: "Géhenne", def: "Empruntée à la vallée de Hinnom (décharge brûlante) : symbole de destruction définitive sans résurrection.", refs: ["Matthieu 10:28", "Matthieu 23:33"] },
    { term: "Rançon (lytron)", def: "Prix correspondant payé par la vie parfaite de Jésus pour racheter l'humanité du péché et de la mort hérités d'Adam.", refs: ["Matthieu 20:28", "1 Timothée 2:5, 6"] },
    { term: "Royaume de Dieu", def: "Gouvernement céleste réel établi par Dieu avec Jésus Christ pour Roi, qui sanctifiera le nom divin et transformera la terre.", refs: ["Daniel 2:44", "Matthieu 6:9, 10"] },
    { term: "Présence (parousia)", def: "Période invisible pendant laquelle le Christ règne depuis les cieux et achève le rassemblement de ses serviteurs.", refs: ["Matthieu 24:3, 37"] },
    { term: "Amour fidèle (hésèd)", def: "Attachement loyal et affectueux qui ne lâche jamais prise, guidé par la bonté et la fidélité morale.", refs: ["Exode 34:6", "Psaume 136:1"] },
    { term: "Esprit saint", def: "Force agissante invisible et toute-puissante de Dieu (et non une personne distincte) par laquelle il crée et enseigne.", refs: ["Genèse 1:2", "Actes 1:8"] },
    { term: "Foi (pistis)", def: "Attente assurée et conviction solide appuyée sur des preuves manifestes de réalités encore invisibles.", refs: ["Hébreux 11:1", "Romains 10:17"] },
    { term: "Alliance nouvelle", def: "Accord validé par le sang de Jésus remplaçant l'alliance de la Loi et unissant des rois-prêtres à son règne.", refs: ["Jérémie 31:31-34", "Luc 22:20"] },
    { term: "Souveraineté", def: "Droit légitime et autorité suprême de Jéhovah de diriger tout ce qui vit pour son plus grand bien.", refs: ["Psaume 103:19", "Révélation 4:11"] },
    { term: "Intégrité", def: "Droiture morale complète et fidélité loyale envers Dieu quelles que soient les circonstances.", refs: ["Job 27:5", "Psaume 26:11"] },
    { term: "Méditation", def: "Réflexion calme et attentive permettant aux vérités bibliques de descendre de la tête jusqu'aux sentiments et aux choix.", refs: ["Psaume 1:2", "Josué 1:8"] },
    { term: "Humilité", def: "Estimation juste et modeste de soi devant Dieu ; reconnaître joyeusement qu'on a besoin de sa sagesse.", refs: ["Proverbes 11:2", "Philippiens 2:3"] },
    { term: "Résurrection (anastasis)", def: "« Relèvement » à la vie des personnes gardées dans le souvenir parfait de Dieu, sur terre ou au ciel.", refs: ["Jean 5:28, 29", "Actes 24:15"] }
  ];

  const OBJECTIONS = [
    { match: ["temps", "occupe", "presse"], obj: "Pas le temps", reply: "Je comprends tout à fait, nos journées filent vite ! Je voulais simplement partager une phrase de 20 secondes sur la vraie paix d'esprit : selon vous, qu'est-ce qui aide le plus à garder le calme aujourd'hui ?", verse: "Éphésiens 5:15, 16" },
    { match: ["ma religion", "croyant", "catholique", "musulman", "protestant"], obj: "J'ai déjà ma religion", reply: "C'est respectable d'attacher du prix aux valeurs spirituelles. Au-delà des appartenances, aimeriez-vous voir ce que la Bible elle-même promet pour l'avenir proche de notre planète ?", verse: "Psaume 37:29" },
    { match: ["souffrance", "mal", "guerre", "pourquoi dieu"], obj: "Pourquoi Dieu permet-il la souffrance ?", reply: "C'est l'une des questions les plus justes. La Bible montre que Dieu n'est jamais l'auteur du mal (**Jacques 1:13**), mais qu'il accorde un délai limité afin de régler définitivement une question morale avant de tout réparer.", verse: "Jacques 1:13" },
    { match: ["science", "evolution", "hasard", "big bang"], obj: "Science vs Bible / Hasard", reply: "Beaucoup sont surpris de découvrir que la vraie science et la Bible s'accordent : bien avant notre époque, **Job 26:7** parlait déjà de la terre « suspendue sur rien » et **Hébreux 3:4** rappelle que toute maison a un constructeur.", verse: "Hébreux 3:4" },
    { match: ["pas besoin", "sans religion", "bon sans"], obj: "Pas besoin de religion pour être bon", reply: "On peut tout à fait avoir un beau cœur sans église. Jésus lui-même dénonçait l'hypocrisie rituelle et invitait à trois attitudes simples : pratiquer la justice, aimer la fidélité et marcher modestement avec Dieu.", verse: "Michée 6:8" },
    { match: ["enfer", "chatiment", "bruler"], obj: "L'Enfer existe-t-il ?", reply: "Un père aimant ne torturerait jamais son enfant éternellement. En **Romains 6:23**, la Bible dit que le salaire du péché c'est simplement la mort (l'inexistence), jamais le supplice éternel.", verse: "Romains 6:23" },
    { match: ["trinite", "jesus dieu", "trois"], obj: "Jésus est-il le Dieu Tout-Puissant ?", reply: "Jésus est le Fils bien-aimé et le Roi choisi, mais il a lui-même prié son Père en l'appelant en **Jean 17:3** « le seul vrai Dieu », et déclaré en **Jean 14:28** : « Le Père est plus grand que moi. »", verse: "Jean 17:3" },
    { match: ["ecrite par hommes", "modifiee", "traduite"], obj: "Bible modifiée par les hommes ?", reply: "Excellente question ! La découverte des rouleaux de la mer Morte, antérieurs de mille ans aux manuscrits jusque-là connus, a confirmé une transmission remarquablement fidèle du texte biblique.", verse: "Isaïe 40:8" }
  ];

  const QUIZ_BANK = [
    { q: "Quel verset cite explicitement le nom divin dans de nombreuses traductions ?", a: ["Psaume 83:18", "Jean 1:1", "Genèse 2:1", "Matthieu 5:1"], c: 0, ref: "Psaume 83:18" },
    { q: "Combien de livres et de chapitres composent la Bible ?", a: ["39 livres / 929 ch.", "66 livres / 1 189 ch.", "72 livres / 1 200 ch.", "27 livres / 260 ch."], c: 1, ref: "2 Timothée 3:16" },
    { q: "Quel apôtre était collecteur d'impôts avant de suivre Jésus ?", a: ["Luc", "Matthieu", "Marc", "Philippe"], c: 1, ref: "Matthieu 9:9" },
    { q: "Quel prophète a été jeté dans la fosse aux lions ?", a: ["Ézéchiel", "Daniel", "Jérémie", "Jonas"], c: 1, ref: "Daniel 6:16" },
    { q: "Quel est le premier fruit de l'esprit mentionné en Galates 5:22 ?", a: ["La joie", "La patience", "L'amour", "La douceur"], c: 2, ref: "Galates 5:22" },
    { q: "Qui a prononcé « Où tu iras j'irai » ?", a: ["Esther", "Ruth", "Débora", "Abigaïl"], c: 1, ref: "Ruth 1:16" },
    { q: "Quel verset promet que Dieu « essuiera toute larme de leurs yeux » ?", a: ["Révélation 21:4", "Actes 20:35", "Romains 8:28", "Psaume 23:1"], c: 0, ref: "Révélation 21:4" },
    { q: "Quelle femme marchande de pourpre a accueilli Paul à Philippes ?", a: ["Priscille", "Lydie", "Dorcas", "Phœbé"], c: 1, ref: "Actes 16:14, 15" },
    { q: "Quel prophète a reconstruit les murailles de Jérusalem en 52 jours ?", a: ["Esdras", "Néhémie", "Aggée", "Zacharie"], c: 1, ref: "Néhémie 6:15" },
    { q: "Quel verset encourage : « Déchargez-vous sur lui de toute votre inquiétude » ?", a: ["1 Pierre 5:7", "2 Pierre 1:5", "Jude 20", "Tite 2:11"], c: 0, ref: "1 Pierre 5:7" }
  ];

  // ==========================================================================
  // Helpers de Contexte Actif (Chapitre Bible, Article Ouvert, Notes, Texte du Jour)
  // ==========================================================================

  function getLiveContextSummary() {
    const curArt = window.DFWolReader?.getCurrentArticleData?.();
    const curBible = window.DFWolReader?.getCurrentBibleState?.();
    const curBibleData = curBible?.primaryData;
    const notes = window.DFWolGetNotes ? window.DFWolGetNotes() : [];
    const dtRef = document.getElementById("dt-scripture-ref-label")?.textContent?.trim() ||
      document.getElementById("dt-scripture-ref-btn")?.textContent?.trim() || "";

    let bibleLabel = "";
    if (curBibleData?.book) {
      const bName = window.DFWolBible.getBookDisplayName(curBibleData.book, curBibleData.lang || lang());
      bibleLabel = `${bName} ${curBibleData.chapter}`;
    }

    return {
      curArt,
      curBibleData,
      bibleLabel,
      notesCount: notes.length,
      dtRef
    };
  }

  async function fetchLiveArticlesForTopic(queryStr) {
    if (!queryStr || !window.DFWolSearch?.runUnifiedSearch) return [];
    const curLang = lang();
    try {
      const task = window.DFWolSearch.runUnifiedSearch({
        query: queryStr,
        scope: "publications",
        proximity: "par",
        sort: "occ",
        lang: curLang,
        engine: "auto"
      });
      const timeout = new Promise((res) => setTimeout(() => res(null), 5500));
      const data = await Promise.race([task, timeout]);
      if (!data) return [];
      const wolHits = (data.wolItems || []).map((r) => ({
        title: cleanStr(r.title),
        sub: cleanStr(r.context || "WOL.jw.org"),
        url: r.wolUrl
      }));
      const jwHits = (data.jwItems || [])
        .filter((r) => r.subtype !== "video" && (r.wolUrl || r.jwUrl))
        .map((r) => ({
          title: cleanStr(r.title),
          sub: cleanStr(r.context || "JW.org"),
          url: r.wolUrl || r.jwUrl
        }));
      const seen = new Set();
      const merged = [];
      for (const it of [...jwHits, ...wolHits]) {
        if (!it.title || !it.url || seen.has(it.url)) continue;
        seen.add(it.url);
        merged.push(it);
        if (merged.length >= 4) break;
      }
      return merged;
    } catch (_) {
      return [];
    }
  }

  async function fetchLiveVerseQuotes(refLabels) {
    const list = (refLabels || []).slice(0, 2);
    if (!list.length || !window.DFWolReader?.fetchBibleChapterParsed || !window.DFWolBible?.parseScriptureReferences) {
      return [];
    }
    const curLang = lang();
    const out = [];
    for (const lbl of list) {
      try {
        const parsed = window.DFWolBible.parseScriptureReferences(lbl, curLang);
        if (!parsed.length) continue;
        const r = parsed[0];
        const vList = r.verses?.length ? r.verses : [1];
        const chTask = window.DFWolReader.fetchBibleChapterParsed(r.bookNum, r.chapter, curLang);
        const timeout = new Promise((res) => setTimeout(() => res(null), 3500));
        const chData = await Promise.race([chTask, timeout]);
        if (!chData?.verses) continue;
        const matched = vList.map((vn) => chData.verses.find((v) => v.verse === vn)).filter(Boolean);
        if (matched.length) {
          const bName = window.DFWolBible.getBookDisplayName(chData.book, curLang);
          out.push({
            ref: `${bName} ${r.chapter}:${window.DFWolBible.formatVerseSpec(vList, true)}`,
            text: matched.map((v) => `${vList.length > 1 ? v.verse + ". " : ""}${v.text}`).join(" ")
          });
        }
      } catch (_) {}
    }
    return out;
  }

  function findTopicMatch(low) {
    let best = null;
    let bestScore = 0;
    for (const t of TOPIC_MAP) {
      let score = 0;
      t.keywords.forEach((kw) => {
        if (low.includes(norm(kw))) score += kw.length >= 6 ? 3 : 2;
      });
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return bestScore > 0 ? best : null;
  }

  function formatMarkdownReply(text) {
    const escaped = esc(text || "");
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, "$1<em>$2</em>");
  }

  // ==========================================================================
  // Moteur Principal de Réponse Conversationnelle Locale + Live Async
  // ==========================================================================

  async function processUserMessage(rawQuery) {
    const q = cleanStr(rawQuery);
    const low = norm(q);
    const curLang = lang();
    const ctx = getLiveContextSummary();

    // 0. Salutations simples
    if (/^(bonjour|salut|hello|hi|coucou|bonsoir|merci|super|genial|parfait)\b/.test(low) && q.split(/\s+/).length <= 5) {
      const ctxHint = ctx.curArt
        ? `Je vois que tu lis « ${ctx.curArt.title} ».`
        : ctx.bibleLabel
        ? `Je vois que tu es dans **${ctx.bibleLabel}**.`
        : ctx.dtRef
        ? `Le Texte du jour est **${ctx.dtRef}**.`
        : "";
      return {
        text: low.includes("merci")
          ? `Avec grand plaisir ! N'hésite pas dès que tu cherches un verset, une explication d'article, un plan de commentaire ou une réponse pleine de tact.`
          : `Salut frère/sœur ! ${ctxHint} Pose-moi n'importe quelle question spirituelle ou dis-moi simplement ce que tu traverses aujourd'hui : je consulte la Bible, tes notes et WOL/JW pour toi.`,
        verses: ["Proverbes 3:5, 6", "Psaume 119:105"],
        followups: ctx.curArt
          ? ["Résume l'article ouvert", "Commentaire de 30s sur cet article", "Quiz biblique"]
          : ["Je suis inquiet, que lire ?", "Articles sur le pardon", "Idée de culte familial"]
      };
    }

    // 1. Analyse de l'article ouvert (résumé, commentaire 30s, perles)
    if (/(resum|synthese|commentaire|perle|30s|30 seconde)/.test(low) && (/(article|reunion|etude|tour de garde|cahier|ouvert|page|paragraphe)/.test(low) || (!findTopicMatch(low) && (ctx.curArt || ctx.curBibleData)))) {
      if (low.includes("commentaire") && ctx.curArt?.paragraphs?.length) {
        const pCandidates = ctx.curArt.paragraphs.filter((p) => p.text.length > 75 && !/^(\d+\.|CANTIQUE|EN BREF)/i.test(p.text));
        const picked = pCandidates[0]?.text || ctx.curArt.paragraphs[1]?.text || ctx.curArt.plainText;
        const sentences = picked.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
        const refs = window.DFWolBible?.parseScriptureReferences?.(picked, curLang) || [];
        const comment = `${(sentences[0] || picked.slice(0, 140)).replace(/[.!?]+$/, "")}. ${refs[0] ? `Comme l'illustre ${refs[0].label}, ` : ""}cela nous encourage à appliquer pleinement ce principe dès cette semaine.`;
        return {
          text: `Voici une proposition de commentaire naturel (~30s) tirée de **« ${ctx.curArt.title} »** :\n\n« ${comment} »`,
          verses: refs.slice(0, 3).map((r) => r.label),
          followups: ["Résume l'article ouvert", "Extraire les perles"]
        };
      }
      if (low.includes("perle") && (ctx.curBibleData || ctx.curArt)) {
        const srcName = ctx.curBibleData ? ctx.bibleLabel : ctx.curArt.title;
        const pool = ctx.curBibleData
          ? ctx.curBibleData.verses.map((v) => `v.${v.verse} : ${v.text}`)
          : (ctx.curArt.paragraphs || []).map((p) => p.text);
        const needles = [/jehovah|jéhovah/i, /jesus|jésus|christ/i, /promet|promesse/i, /fidel|fidél|amour|humil|courage/i];
        const pearls = pool.filter((line) => line.length > 35 && needles.some((rx) => rx.test(line))).slice(0, 4);
        return {
          text: pearls.length
            ? `Voici **${pearls.length} perles spirituelles** extraites de **${srcName}** :\n\n${pearls.map((p, i) => `• **Perle ${i + 1} :** ${p.slice(0, 220)}${p.length > 220 ? "…" : ""}`).join("\n")}`
            : `Ouvre un chapitre dans la Bible ou un article dans Réunions pour que j'en extraie des perles précises.`,
          followups: ctx.curArt ? ["Commentaire de 30s", "Résume l'article ouvert"] : ["Quiz biblique"]
        };
      }
      if (ctx.curArt) {
        const words = (ctx.curArt.plainText || "").split(/\s+/).filter(Boolean).length;
        const mins = Math.max(1, Math.round(words / 180));
        const keyParas = (ctx.curArt.paragraphs || []).filter((p) => p.text.length > 55).slice(0, 3);
        const artRefs = (window.DFWolBible?.parseScriptureReferences?.(ctx.curArt.plainText || "", curLang) || []).slice(0, 4).map((r) => r.label);
        return {
          text: `**Résumé de « ${ctx.curArt.title} »** (~${words} mots · ~${mins} min de lecture)\n\n${keyParas.map((p) => `• ${p.text.slice(0, 210)}…`).join("\n")}`,
          verses: artRefs,
          followups: ["Commentaire de 30s", "Extraire les perles"]
        };
      }
      if (low.includes("texte du jour") || ctx.dtRef) {
        const quote = document.getElementById("dt-scripture-quote")?.textContent?.trim() || "";
        const comm = document.getElementById("dt-commentary-box")?.textContent?.trim() || "";
        return {
          text: `**Texte du jour (${ctx.dtRef})** : ${quote}\n\n${comm.slice(0, 280)}…`,
          verses: ctx.dtRef ? [ctx.dtRef] : [],
          followups: ["Je suis inquiet, que lire ?", "Quiz biblique"]
        };
      }
    }

    // 2. Relances contextuelles ("autre verset", "illustration", "articles", "objection", "commentaire")
    const isFollowup =
      q.length < 48 &&
      !/(ouvert|cet article|cette page|ce chapitre)/.test(low) &&
      /^(?:et |donne |autre|encore|plus|quelque|fais |cherche |trouve )?(?:des |d autres |d'autres |une? )?(illustration|exemple|articles|versets|commentaire)/i.test(low);
    const activeTopic = convContext.lastTopicId ? TOPIC_MAP.find((t) => t.id === convContext.lastTopicId) : null;

    if (isFollowup && activeTopic) {
      if (low.includes("illustration") || low.includes("exemple")) {
        return {
          text: `Voici une illustration simple pour **${activeTopic.title}** :\n\n${activeTopic.illustration}`,
          verses: activeTopic.verses.slice(0, 2),
          followups: [`Articles sur ${activeTopic.title.split(" ")[0]}`, "Commentaire de 30s", "Autres versets"]
        };
      }
      if (low.includes("article")) {
        const arts = await fetchLiveArticlesForTopic(activeTopic.queries[0] || activeTopic.title);
        return {
          text: arts.length
            ? `Voici les articles WOL/JW pertinents trouvés pour **${activeTopic.title}** :`
            : `Je n'ai pas pu contacter WOL pour le moment, mais tu peux lancer directement cette recherche booléenne optimisée :`,
          articles: arts,
          verses: activeTopic.verses.slice(0, 3),
          queries: activeTopic.queries,
          followups: ["Donne une illustration", "Prière sur ce thème"]
        };
      }
      if (low.includes("verset")) {
        const extraRefs = activeTopic.verses.slice(2);
        const quotes = await fetchLiveVerseQuotes(extraRefs);
        return {
          text: `Voici d'autres passages bibliques fortifiants sur **${activeTopic.title}** :`,
          verseQuotes: quotes,
          verses: activeTopic.verses,
          followups: ["Articles sur ce thème", "Donne une illustration"]
        };
      }
    }

    // 3. Quiz biblique interactif directement dans le tchat
    if (/(quiz|question biblique|teste moi|test biblique)/.test(low)) {
      const qIdx = Math.floor(Math.random() * QUIZ_BANK.length);
      return {
        text: `C'est parti ! Voici une question biblique pour t'exercer :`,
        quizIdx: qIdx,
        followups: ["Une autre question de quiz", "Parle-moi d'un personnage"]
      };
    }

    // 4. Stats de lecture & Carnet de notes personnel
    if (/(statistique|stats|progres|progression|combien de chapitre|mes notes|mon carnet)/.test(low)) {
      let totalCh = 0;
      try {
        const st = JSON.parse(localStorage.getItem("dfwol_studio_state_v3") || "{}");
        Object.values(st.readingProgress || {}).forEach((arr) => {
          if (Array.isArray(arr)) totalCh += arr.length;
        });
      } catch (_) {}
      const remaining = Math.max(0, 1189 - totalCh);
      const streak = window.DFWolStudy?.updateAndGetStreak ? window.DFWolStudy.updateAndGetStreak() : 1;
      const notes = window.DFWolGetNotes ? window.DFWolGetNotes() : [];
      const hls = window.DFWolReader?.getAllHighlights ? window.DFWolReader.getAllHighlights() : [];
      const pct = ((totalCh / 1189) * 100).toFixed(1);
      const daysAt3 = Math.ceil(remaining / 3);
      return {
        text: `**Ton bilan spirituel local :**\n• Lecture biblique : **${totalCh} / 1 189 chapitres (${pct}%)** · série de **${streak} jour(s)**\n• À 3 chapitres/jour, il te reste ~**${daysAt3} jours** pour boucler toute la Bible.\n• Carnet : **${notes.length} note(s)** et **${hls.length} passage(s) surligné(s)**.`,
        verses: ["Psaume 1:2, 3", "Josué 1:8"],
        followups: ["Plan d'exposé sur la persévérance", "Quiz biblique"]
      };
    }

    // 5. Références bibliques directes saisies par l'utilisateur -> citation réelle NWT + articles
    const directRefs = window.DFWolBible?.parseScriptureReferences?.(q, curLang) || [];
    if (directRefs.length > 0) {
      const labels = directRefs.map((r) => r.label);
      convContext.lastRefs = labels;
      convContext.lastBookNum = directRefs[0].bookNum;
      const [quotes, arts] = await Promise.all([
        fetchLiveVerseQuotes(labels),
        fetchLiveArticlesForTopic(labels[0])
      ]);
      const notesMatch = (window.DFWolGetNotes ? window.DFWolGetNotes() : []).filter((n) =>
        labels.some((lbl) => `${n.title} ${n.body}`.toLowerCase().includes(lbl.toLowerCase()))
      );
      const noteLine = notesMatch.length ? `\n\nTu as aussi une note personnelle intitulée « ${notesMatch[0].title} ».` : "";
      return {
        text: `Voici **${labels.join(", ")}** tiré de la *Traduction du monde nouveau*, avec des articles d'étude associés.${noteLine}`,
        verseQuotes: quotes,
        verses: labels,
        articles: arts,
        queries: labels,
        followups: ["Comment appliquer ce verset ?", "Aperçu du livre"]
      };
    }

    // 6. Objections de ministère & illustrations
    if (/(objection|repondre si|que repondre|predication|porte a porte|pas le temps|ma religion|pourquoi.*souffrance|enfer|trinite|science|evolution)/.test(low)) {
      const matchedObj = OBJECTIONS.find((o) => o.match.some((kw) => low.includes(kw))) || OBJECTIONS[2];
      return {
        text: `**Approche pleine de tact — « ${matchedObj.obj} »**\n\n${matchedObj.reply}`,
        verses: [matchedObj.verse],
        queries: [matchedObj.obj, matchedObj.verse],
        followups: ["Autre objection courante", "Donne une illustration"]
      };
    }

    // 7. Plan d'exposé / discours
    if (/(plan|expose|discours|sujet|presentation)/.test(low)) {
      const durMatch = low.match(/\b(5|10|15|20|30)\s*min/);
      const mins = durMatch ? Number(durMatch[1]) : 10;
      const cleanTopic = q.replace(/^(?:fais|prepare|cree|donne)?.*?(?:plan|expose|discours)\s*(?:de\s*\d+\s*min)?\s*(?:sur|pour)?/i, "").trim() || "Garder confiance en Jéhovah";
      const topicHit = findTopicMatch(low);
      const refList = topicHit ? topicHit.verses.slice(0, 3) : ["Proverbes 3:5, 6", "Philippiens 4:6, 7"];
      const arts = await fetchLiveArticlesForTopic(cleanTopic);
      return {
        text: `**Canevas d'exposé (${mins} min) — « ${cleanTopic} »**\n1. **Introduction (${Math.max(1, Math.round(mins * 0.15))} min) :** Question d'actualité ou situation concrète pour éveiller l'intérêt.\n2. **Développement (${Math.max(3, Math.round(mins * 0.7))} min) :**\n   • Lire et expliquer **${refList[0]}**\n   • Illustration parlante tirée du quotidien\n   • Application pratique avec **${refList[1] || refList[0]}**\n3. **Conclusion (${Math.max(1, mins - Math.max(1, Math.round(mins * 0.15)) - Math.max(3, Math.round(mins * 0.7)))} min) :** Synthèse brève + invitation encourageante à agir cette semaine.`,
        verses: refList,
        articles: arts,
        followups: ["Donne une illustration", "Articles sur ce sujet"]
      };
    }

    // 8. Aide à la prière
    if (/(comment prier|aide.*prier|priere struct)/.test(low)) {
      return {
        text: `**Modèle simple en 4 étapes pour enrichir ta prière (Matthieu 6:9-13) :**\n1. **Louange :** Remercie Jéhovah pour qui il est (sa patience, sa création, sa justice).\n2. **Gratitude ciblée :** Cite trois bienfaits précis vécus aujourd'hui.\n3. **Pardon & humilité :** Confie librement tes faiblesses et demande son esprit saint.\n4. **Besoins & intercession :** Prie pour tes défis, ta famille et nos frères dans le monde, toujours au nom de Jésus.`,
        verses: ["Philippiens 4:6", "1 Jean 5:14", "Psaume 62:8"],
        followups: ["Je suis inquiet, que lire ?", "Quiz biblique"]
      };
    }

    // 9. Culte familial
    if (/(culte familial|en famille|idee soiree)/.test(low)) {
      const ideas = [
        "**Portrait vivant :** Lisez ensemble l'histoire de **Ruth (chap. 1–2)** ou de **Daniel 6**, puis chacun nomme la qualité qu'il veut imiter cette semaine.",
        "**Atelier ministère :** Choisissez 2 objections entendues récemment (ex : « Pourquoi Dieu permet-il la souffrance ? ») et exercez-vous en 30 secondes avec bienveillance.",
        "**Chasse au trésor biblique :** En 5 min, chacun choisit un verset des **Psaumes** sur la création ou la joie et explique pourquoi il le touche."
      ];
      const pick = ideas[Math.floor(Math.random() * ideas.length)];
      return {
        text: `**Idée prête pour votre Culte familial :**\n\n${pick}`,
        verses: ["Deutéronome 6:6, 7", "Psaume 1:1-3"],
        followups: ["Une autre idée de culte familial", "Objection : Pourquoi le mal ?"]
      };
    }

    // 10. Fiche de livre biblique (les 66 livres)
    const books = window.DFWolBible?.BIBLE_BOOKS || [];
    const matchedBook = books.find((b) => {
      const fr = norm(b.nameFr || "");
      const en = norm(b.nameEn || "");
      return (fr.length >= 3 && new RegExp(`\\b${fr}\\b`).test(low)) || (en.length >= 3 && new RegExp(`\\b${en}\\b`).test(low));
    });
    if (matchedBook && (/(livre|apercu|intro|resum|qui a ecrit|redacteur|chapitre|parle)/.test(low) || q.split(/\s+/).length <= 3)) {
      const bName = window.DFWolBible.getBookDisplayName(matchedBook, curLang);
      const sheet = BOOK_SHEETS[matchedBook.num];
      const test = matchedBook.num <= 39 ? "Écritures hébraïques" : "Écritures grecques";
      convContext.lastBookNum = matchedBook.num;
      const quotes = await fetchLiveVerseQuotes([`${bName} 1:1`]);
      return {
        text: sheet
          ? `**Livre biblique : ${bName}** (${matchedBook.chapters} chapitres · ${test})\n• **Rédacteur & époque :** ${sheet.author} (${sheet.era})\n• **Thème central :** ${sheet.theme}\n• **Structure :** ${sheet.structure}`
          : `**Livre biblique : ${bName}** — **${matchedBook.chapters} chapitre(s)** (${test}, livre n° ${matchedBook.num}). Tu peux ouvrir son aperçu complet ou commencer au chapitre 1 ci-dessous.`,
        verseQuotes: quotes,
        verses: [`${bName} 1:1`],
        bookIntroNum: matchedBook.num,
        queries: [`${bName} introduction plan livre`],
        followups: ["Articles sur ce livre", "Quiz biblique"]
      };
    }

    // 11. Profil de personnage biblique
    const matchedChar = CHARACTER_PROFILES.find((c) => new RegExp(`\\b${norm(c.name)}\\b`).test(low));
    if (matchedChar) {
      convContext.lastCharName = matchedChar.name;
      const [quotes, arts] = await Promise.all([
        fetchLiveVerseQuotes([matchedChar.verse]),
        fetchLiveArticlesForTopic(`${matchedChar.name} foi exemple Bible`)
      ]);
      return {
        text: `**Personnage biblique : ${matchedChar.name}** — *${matchedChar.trait}*\n• **Épreuve traversée :** ${matchedChar.trial}\n• **Leçon clé :** ${matchedChar.lesson}`,
        verseQuotes: quotes,
        verses: [matchedChar.verse],
        articles: arts,
        queries: [`${matchedChar.name} imitons leur foi`],
        followups: ["Autre personnage biblique", "Quiz biblique"]
      };
    }

    // 12. Glossaire doctrinal
    const matchedGloss = GLOSSARY_TERMS.find((g) => {
      const head = norm(g.term.split("(")[0].split("/")[0].trim());
      return head.length >= 3 && new RegExp(`\\b${head}\\b`).test(low);
    });
    if (matchedGloss && (/(que veut dire|signifie|definition|c est quoi|qu est ce|explique)/.test(low) || q.split(/\s+/).length <= 3)) {
      const [quotes, arts] = await Promise.all([
        fetchLiveVerseQuotes(matchedGloss.refs.slice(0, 1)),
        fetchLiveArticlesForTopic(matchedGloss.term.split("(")[0].trim())
      ]);
      return {
        text: `**${matchedGloss.term}**\n\n${matchedGloss.def}`,
        verseQuotes: quotes,
        verses: matchedGloss.refs,
        articles: arts,
        followups: ["Articles sur ce sujet", "Autre question"]
      };
    }

    // 13. Thème spirituel / question de vie / recherche d'articles & versets en direct
    const topicMatch = findTopicMatch(low);
    if (topicMatch) {
      convContext.lastTopicId = topicMatch.id;
      convContext.lastRefs = topicMatch.verses;
      const searchHint = /(article|trouve|cherche|etude|pub)/.test(low) ? topicMatch.queries[0] : topicMatch.queries[0];
      const [quotes, arts] = await Promise.all([
        fetchLiveVerseQuotes(topicMatch.verses.slice(0, 2)),
        fetchLiveArticlesForTopic(searchHint)
      ]);
      const notesMatch = (window.DFWolGetNotes ? window.DFWolGetNotes() : []).filter((n) =>
        topicMatch.keywords.some((kw) => norm(`${n.title} ${n.body}`).includes(norm(kw)))
      );
      const noteNote = notesMatch.length ? `\n\n📝 *Note personnelle retrouvée :* « ${notesMatch[0].title} ».` : "";
      return {
        text: `**${topicMatch.title}**\n\n${topicMatch.advice}${noteNote}`,
        verseQuotes: quotes,
        verses: topicMatch.verses,
        articles: arts,
        queries: topicMatch.queries,
        followups: ["Donne une illustration", "Autres versets sur ce thème", "Plan d'exposé 10 min"]
      };
    }

    // 14. Requête libre générale : recherche en direct dans les notes locales + WOL & JW.org !
    const cleanedWords = q
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(trouve|cherche|moi|des|les|une|sur|pour|que|dit|bible|article|articles|comment|pourquoi|est)$/i.test(w));
    const searchQ = cleanedWords.slice(0, 5).join(" ") || q;
    convContext.lastQuery = searchQ;

    const notes = window.DFWolGetNotes ? window.DFWolGetNotes() : [];
    const matchingNotes = notes.filter((n) => norm(`${n.title} ${n.body}`).includes(norm(searchQ))).slice(0, 2);
    const liveArticles = await fetchLiveArticlesForTopic(searchQ);
    const suggestedBool = cleanedWords.length >= 2 ? cleanedWords.slice(0, 4).join(" & ") : searchQ;

    let body = liveArticles.length
      ? `Voici ce que j'ai trouvé en direct sur JW.org & WOL pour **« ${searchQ} »** :`
      : `Voici des pistes de recherche ciblées pour approfondir **« ${searchQ} »** dans la Bible et sur WOL :`;
    if (matchingNotes.length) {
      body += `\n\n📝 Dans ton carnet personnel, tu as déjà écrit sur ce sujet : « **${matchingNotes[0].title}** ».`;
    }

    return {
      text: body,
      articles: liveArticles,
      verses: ["Proverbes 2:1-5", "Psaume 119:105", "Actes 17:11"],
      queries: [suggestedBool, `"${searchQ}"`],
      followups: ["Plan d'exposé sur " + searchQ, "Quiz biblique"]
    };
  }

  // ==========================================================================
  // Rendu & Gestionnaire du Tchat (#study-view-brother)
  // ==========================================================================

  function ensureInitialMessage() {
    if (chatHistory.length > 0) return;
    chatHistory.push({
      role: "brother",
      text: "Salut ! Je suis **Spiritual Brother**, ton compagnon spirituel **100 % local** (zéro clé API). Pose-moi n'importe quelle question : **je cite les versets, cherche les vrais articles WOL/JW.org en direct, résume ton article ouvert, prépare des commentaires ou des exposés, et t'encourage selon ta situation.**",
      verses: ["Psaume 83:18", "Proverbes 3:5, 6", "Philippiens 4:6, 7"],
      followups: [
        "Je suis inquiet, quels versets lire ?",
        "Articles sur le pardon",
        "Résume l'article ouvert",
        "Quiz biblique"
      ]
    });
  }

  function renderQuizInsideMsg(msg, msgIdx) {
    const q = QUIZ_BANK[msg.quizIdx % QUIZ_BANK.length];
    if (!q) return "";
    return `
      <div class="sb-quiz-card">
        <strong>🏆 Quiz biblique</strong>
        <p style="margin:0.25rem 0 0.5rem;">${esc(q.q)}</p>
        <div class="sb-quiz-opts">
          ${q.a
            .map((opt, oIdx) => {
              let cls = "btn-secondary btn-xs sb-quiz-opt";
              if (msg.quizAnswered) {
                if (oIdx === q.c) cls = "btn-primary btn-xs sb-quiz-opt is-correct";
                else if (oIdx === msg.quizSelected) cls = "btn-secondary btn-xs sb-quiz-opt is-wrong";
              }
              return `<button type="button" class="${cls}" data-sb-quiz-msg="${msgIdx}" data-sb-quiz-opt="${oIdx}">${esc(opt)}</button>`;
            })
            .join("")}
        </div>
        ${msg.quizAnswered ? `<div style="margin-top:0.45rem;"><button type="button" class="pill-btn pill-xs sb-verse-chip" data-sb-open-ref="${esc(q.ref)}">📖 Vérifier : ${esc(q.ref)}</button></div>` : ""}
      </div>
    `;
  }

  function render(containerId = "study-view-brother") {
    const root = document.getElementById(containerId);
    if (!root) return;
    ensureInitialMessage();

    const ctx = getLiveContextSummary();
    const ctxBadge = ctx.curArt
      ? `📄 Article : ${ctx.curArt.title.slice(0, 32)}`
      : ctx.bibleLabel
      ? `📖 Bible : ${ctx.bibleLabel}`
      : ctx.dtRef
      ? `☀️ Texte du jour : ${ctx.dtRef}`
      : "🧭 Prêt";

    const quickSuggestions = ctx.curArt
      ? ["Résume l'article ouvert", "Commentaire de 30s", "Extraire les perles", "Quiz biblique"]
      : ["Je suis découragé, aide-moi", "Articles sur l'espérance", "Objection : Pourquoi la souffrance ?", "Mes stats de lecture"];

    root.innerHTML = `
      <div class="sb-chat-shell card">
        <div class="sb-chat-topbar">
          <div class="sb-header-id">
            <div class="sb-avatar" aria-hidden="true">🧭</div>
            <div>
              <h3>Spiritual Brother <span class="badge badge-blue">Tchat Local · 0 Clé API</span></h3>
              <span class="sb-ctx-pill">${esc(ctxBadge)}</span>
            </div>
          </div>
          <button type="button" id="sb-clear-chat" class="btn-ghost btn-xs" title="Démarrer une nouvelle conversation">🗑️ Nouveau</button>
        </div>

        <div class="sb-chat-thread" id="sb-chat-thread">
          ${chatHistory
            .map((msg, idx) => {
              const isUser = msg.role === "user";
              return `
                <div class="sb-chat-msg ${isUser ? "is-user" : "is-brother"}">
                  <div class="sb-chat-bubble">
                    <p class="sb-msg-text" style="white-space:pre-wrap;margin:0;">${formatMarkdownReply(msg.text)}</p>
                    ${
                      msg.verseQuotes?.length
                        ? `<div class="sb-quotes-stack">${msg.verseQuotes
                            .map(
                              (vq) =>
                                `<blockquote class="sb-verse-quote-card"><strong>${esc(vq.ref)}</strong><p>${esc(vq.text)}</p></blockquote>`
                            )
                            .join("")}</div>`
                        : ""
                    }
                    ${typeof msg.quizIdx === "number" ? renderQuizInsideMsg(msg, idx) : ""}
                    ${
                      msg.articles?.length
                        ? `<div class="sb-article-cards">${msg.articles
                            .map(
                              (art, aIdx) => `
                              <div class="sb-article-row">
                                <div>
                                  <strong>${esc(art.title)}</strong>
                                  <small>${esc(art.sub)}</small>
                                </div>
                                <div class="btn-group">
                                  <button type="button" class="btn-primary btn-xs" data-sb-read-art="${idx}:${aIdx}">📖 Lire</button>
                                  <button type="button" class="btn-secondary btn-xs" data-sb-listen-art="${idx}:${aIdx}" title="Écouter">🎧</button>
                                </div>
                              </div>`
                            )
                            .join("")}</div>`
                        : ""
                    }
                    ${
                      msg.verses?.length || msg.bookIntroNum
                        ? `<div class="btn-group" style="margin-top:0.5rem;">
                            ${(msg.verses || []).map((ref) => `<button type="button" class="pill-btn pill-xs sb-verse-chip" data-sb-open-ref="${esc(ref)}">📖 ${esc(ref)}</button>`).join("")}
                            ${msg.bookIntroNum ? `<button type="button" class="btn-secondary btn-xs" data-sb-book-intro="${msg.bookIntroNum}">📘 Aperçu du livre</button>` : ""}
                          </div>`
                        : ""
                    }
                    ${
                      msg.queries?.length
                        ? `<div class="btn-group" style="margin-top:0.4rem;">
                            ${msg.queries.map((q) => `<button type="button" class="btn-secondary btn-xs" data-sb-search="${esc(q)}">🔍 ${esc(q.slice(0, 34))}</button>`).join("")}
                          </div>`
                        : ""
                    }
                    ${
                      !isUser && idx > 0
                        ? `<div class="sb-bubble-actions">
                            <button type="button" class="btn-ghost btn-xs" data-sb-speak="${idx}" title="Écouter avec Vivienne">🗣️ Écouter</button>
                            <button type="button" class="btn-ghost btn-xs" data-sb-note="${idx}" title="Enregistrer en note">📝 Noter</button>
                            <button type="button" class="btn-ghost btn-xs" data-sb-copy="${idx}" title="Copier">📋 Copier</button>
                          </div>`
                        : ""
                    }
                    ${
                      !isUser && idx === chatHistory.length - 1 && msg.followups?.length
                        ? `<div class="sb-followups">${msg.followups
                            .map((f) => `<button type="button" class="pill-btn pill-xs" data-sb-prompt="${esc(f)}">${esc(f)}</button>`)
                            .join("")}</div>`
                        : ""
                    }
                  </div>
                </div>
              `;
            })
            .join("")}
          ${
            isThinking
              ? `<div class="sb-chat-msg is-brother"><div class="sb-chat-bubble"><span class="sb-typing-dots">🧭 Consultation Bible &amp; WOL en cours…</span></div></div>`
              : ""
          }
        </div>

        <div class="sb-quick-prompts btn-group">
          ${quickSuggestions.map((s) => `<button type="button" class="pill-btn pill-xs" data-sb-prompt="${esc(s)}">${esc(s)}</button>`).join("")}
        </div>

        <form class="sb-chat-form" id="sb-chat-form">
          <textarea id="sb-chat-input" class="input-compact" rows="2" placeholder="Pose ta question (ex : versets contre l'anxiété, Psaume 83:18, résume l'article, articles sur le pardon…)"></textarea>
          <button type="submit" id="sb-chat-send" class="btn-primary btn-sm" ${isThinking ? "disabled" : ""}>Envoyer 🧭</button>
        </form>
      </div>
    `;

    const thread = root.querySelector("#sb-chat-thread");
    if (thread) thread.scrollTop = thread.scrollHeight;

    const sendUserText = async (text) => {
      const clean = cleanStr(text);
      if (!clean || isThinking) return;
      chatHistory.push({ role: "user", text: clean });
      isThinking = true;
      render(containerId);
      try {
        const reply = await processUserMessage(clean);
        chatHistory.push(Object.assign({ role: "brother" }, reply));
        if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
      } finally {
        isThinking = false;
        savePersistedChat();
        render(containerId);
      }
    };

    root.querySelector("#sb-chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = root.querySelector("#sb-chat-input");
      if (!inp) return;
      const val = inp.value;
      inp.value = "";
      sendUserText(val);
    });

    root.querySelector("#sb-chat-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        root.querySelector("#sb-chat-form")?.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });

    root.querySelector("#sb-clear-chat")?.addEventListener("click", () => {
      chatHistory = [];
      convContext = { lastTopicId: null, lastRefs: [], lastQuery: "", lastBookNum: null, lastCharName: null };
      savePersistedChat();
      render(containerId);
    });

    root.querySelectorAll("[data-sb-prompt]").forEach((btn) => {
      btn.addEventListener("click", () => sendUserText(btn.getAttribute("data-sb-prompt")));
    });

    root.querySelectorAll("[data-sb-open-ref]").forEach((btn) => {
      btn.addEventListener("click", () => openScriptureRef(btn.getAttribute("data-sb-open-ref")));
    });

    root.querySelectorAll("[data-sb-book-intro]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.DFWolReader?.openBibleBookIntro?.(Number(btn.getAttribute("data-sb-book-intro")), lang());
      });
    });

    root.querySelectorAll("[data-sb-search]").forEach((btn) => {
      btn.addEventListener("click", () => launchWolSearch(btn.getAttribute("data-sb-search")));
    });

    root.querySelectorAll("[data-sb-read-art]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [mIdx, aIdx] = btn.getAttribute("data-sb-read-art").split(":").map(Number);
        const art = chatHistory[mIdx]?.articles?.[aIdx];
        if (art?.url) window.DFWolReader?.openArticleInApp?.(art.url, { lang: lang() });
      });
    });

    root.querySelectorAll("[data-sb-listen-art]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [mIdx, aIdx] = btn.getAttribute("data-sb-listen-art").split(":").map(Number);
        const art = chatHistory[mIdx]?.articles?.[aIdx];
        if (art?.url) {
          window.DFWolAudio?.playTrack?.({ title: art.title, subtitle: art.sub, wolUrl: art.url, lang: lang(), mode: "auto" });
        }
      });
    });

    root.querySelectorAll("[data-sb-speak]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const msg = chatHistory[Number(btn.getAttribute("data-sb-speak"))];
        if (msg) {
          const full = [msg.text, ...(msg.verseQuotes || []).map((q) => `${q.ref}. ${q.text}`)].join("\n\n");
          speakText("Spiritual Brother", full);
        }
      });
    });

    root.querySelectorAll("[data-sb-note]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const msg = chatHistory[Number(btn.getAttribute("data-sb-note"))];
        if (msg && window.DFWolAddNote) {
          const body = [msg.text.replace(/\*\*([^*]+)\*\*/g, "$1"), ...(msg.verseQuotes || []).map((q) => `${q.ref} : ${q.text}`)].join("\n\n");
          window.DFWolAddNote("Spiritual Brother — Réponse", "Étude Perso", body);
        }
      });
    });

    root.querySelectorAll("[data-sb-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const msg = chatHistory[Number(btn.getAttribute("data-sb-copy"))];
        if (msg) {
          const body = [msg.text.replace(/\*\*([^*]+)\*\*/g, "$1"), ...(msg.verseQuotes || []).map((q) => `${q.ref} : ${q.text}`)].join("\n\n");
          window.DFWolStudy?.safeCopyText?.(body, "Réponse copiée !");
        }
      });
    });

    root.querySelectorAll("[data-sb-quiz-msg]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mIdx = Number(btn.getAttribute("data-sb-quiz-msg"));
        const optIdx = Number(btn.getAttribute("data-sb-quiz-opt"));
        const msg = chatHistory[mIdx];
        if (!msg || msg.quizAnswered) return;
        msg.quizAnswered = true;
        msg.quizSelected = optIdx;
        savePersistedChat();
        render(containerId);
      });
    });
  }

  function init() {
    if (uiBound) return;
    uiBound = true;
    loadPersistedChat();
    render("study-view-brother");
  }

  return {
    init,
    render,
    ask: processUserMessage
  };
})();
