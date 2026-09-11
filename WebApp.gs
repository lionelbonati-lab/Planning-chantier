/**
 * WEB APP — Planning Chantiers (mini appli mobile connectée)
 *
 * FICHIER ADDITIF : à coller comme NOUVEAU fichier .gs dans le MÊME projet
 * Apps Script que Planning_Format.gs (Extensions > Apps Script > icône "+"
 * à côté de "Fichiers" > Script). Ne modifie ni ne remplace
 * Planning_Format.gs — réutilise ses fonctions et sa configuration (CONFIG,
 * detecterPersonnes, reformaterZone, formaterPlanning,
 * listerSemainesPlanning, apiListerSemaines, imprimerSemaine, isLabelCol,
 * semaineDepuisLabel...), qui doivent donc rester dans le même projet, tel
 * quel — rien n'y a été touché.
 *
 * Sert une page web (doGet) qui lit et modifie DIRECTEMENT la feuille
 * "Planning" réelle — contrairement à la maquette de démonstration
 * (planning-chantiers.html), qui elle ne touche à rien.
 *
 * ------------------------------------------------------------------------
 * PERSONNEL / SOUS-TRAITANTS : c'est la LIGNE qui décide.
 * Dans le planning réel, les sous-traitants sont regroupés en bas de la
 * feuille, à partir d'une ligne connue (cf. PREMIERE_LIGNE_SOUS_TRAITANT
 * juste en dessous). Aucun marquage n'est donc nécessaire dans la feuille :
 * l'appli déduit la section de la position du bloc, et n'écrit rien de
 * particulier. Deux marqueurs texte existent quand même, uniquement pour
 * les cas où la position mentirait (une personne ajoutée depuis l'appli du
 * "mauvais" côté du seuil) — cf. decoderNom_/encoderNom_.
 *
 * ------------------------------------------------------------------------
 * CONVENTION TEXTE pour le statut, choisie pour ne rien changer à la
 * structure de la feuille (4 lignes/personne, colonnes fixes) ni au script
 * existant :
 *
 *  - Statut (uniquement pertinent pour les sous-traitants) : préfixe
 *    "[Confirmé] " etc. en tête du texte de détail. C'est la formalisation
 *    de ce que Lionel tape déjà à la main aujourd'hui — rien de nouveau
 *    structurellement, juste un format que l'appli sait reconnaître. Une
 *    case déjà remplie SANS ce format (ancienne saisie libre) continue de
 *    s'afficher normalement, simplement sans statut structuré tant qu'elle
 *    n'a pas été réenregistrée une fois depuis l'appli.
 *
 *  - PLUSIEURS TÂCHES par demi-journée (demande de Lionel, 28.08.2026) : une
 *    case de détail peut contenir plusieurs lignes, CHACUNE avec son propre
 *    statut optionnel — plus une seule case = un seul statut. Ce n'est PAS
 *    un nouveau format : c'est la généralisation de la règle ci-dessus à
 *    chaque ligne au lieu de la case entière, ce qui tombe bien puisque
 *    tirets() (Planning_Format.gs) traite déjà chaque ligne indépendamment
 *    (il ajoute "- " à CHAQUE ligne non vide, pas seulement à la première).
 *    cf. decoderTaches_/encoderTaches_.
 *
 * ------------------------------------------------------------------------
 * AJOUT/SUPPRESSION D'UNE PERSONNE, SCOPÉ À LA SEMAINE AFFICHÉE :
 * Les lignes du planning sont PARTAGÉES par toutes les semaines (une même
 * ligne = le même "emplacement" pour chaque bloc de colonnes hebdomadaire) :
 * il n'existe donc pas de vraie notion de "ligne propre à une semaine" dans
 * la feuille elle-même. Pour que "ajouter/supprimer" ne touche vraiment que
 * la semaine affichée, on procède ainsi :
 *
 *  - Supprimer une personne = VIDER (jamais supprimer) sa case nom + ses
 *    cases pour la semaine affichée UNIQUEMENT. La ligne reste en place,
 *    inchangée pour toutes les autres semaines, et redevient un emplacement
 *    libre réutilisable pour CETTE semaine — exactement le mécanisme déjà
 *    utilisé par "👤 Ajouter du personnel" pour repérer un emplacement libre.
 *
 *  - Ajouter une personne : si un emplacement libre existe (colonne 1 ET la
 *    semaine visée toutes deux vides à cette ligne), on le réutilise pour
 *    la semaine affichée seulement. Sinon, un nouveau bloc de 4 lignes est
 *    créé — et dans CE cas seulement, comme pour "Ajouter du personnel" au
 *    menu existant, le nom est aussi posé en colonne 1 sur TOUTES les
 *    semaines (colonne 1 sert de repère à formaterPlanning()/reformaterZone()
 *    pour savoir qu'un bloc est "occupé" et doit recevoir sa mise en forme
 *    complète + liste déroulante Chantier ; sans ce repère, la case
 *    perdrait sa coloration et sa liste déroulante, y compris pour la
 *    semaine affichée). Les autres semaines affichent alors cette personne
 *    avec des cases vides — exactement ce que fait déjà aujourd'hui
 *    "Ajouter du personnel" pour tout nom entièrement nouveau.
 */

// ==== VERSION DU SERVEUR ====
// Marqueur de version, affiché discrètement sous le calendrier de la page
// Fériés (cf. Index.html, afficherVersionServeur). Sert à trancher en une
// seconde, sans rien deviner, la question qui revient à chaque envoi : "le
// serveur tourne-t-il vraiment sur le fichier que je viens de coller, ou sur
// une version jamais redéployée ?". Si l'appel échoue carrément
// ("apiVersionServeur is not a function"), c'est la preuve la plus nette
// possible que le déploiement actif ne sert pas ce fichier.
//
// À CHANGER À CHAQUE ENVOI qui touche WebApp.gs — c'est tout l'intérêt.
//
// Round r20 : l'enquête sur les fériés étant close (cf. BACKEND-CHANGELOG.md
// §19, cause = cellules fusionnées en colonne "Catégorie"), tout
// l'échafaudage de diagnostic temporaire est retiré : introspection des
// doublons de noms, fuseaux horaires, et surtout l'aller-retour d'écriture
// qui créait puis supprimait un jour de test (02.01.2099) à CHAQUE ouverture
// de la page Fériés. Cette fonction ne touche plus jamais au classeur.
var VERSION_WEBAPP = "2026-09-03-r25-demi-debut-fin";
function apiVersionServeur() { return VERSION_WEBAPP; }

// ==== PAGE WEB ====
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Planning Chantiers')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ==== VERROU (sérialise les écritures si plusieurs personnes utilisent l'appli en même temps) ====
function avecVerrou_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ss optionnel : réutilise le classeur déjà obtenu par l'appelant au lieu de
// refaire SpreadsheetApp.getActiveSpreadsheet() (round audit perf,
// 02.09.2026 — cf. apiDemarrer, où plusieurs étapes cherchaient chacune leur
// classeur/feuille séparément alors qu'un seul aller-retour les regroupe déjà
// côté réseau depuis le fix précédent). Tous les appels existants sans
// argument continuent de fonctionner à l'identique.
function feuillePlanning_(ss) {
  var sh = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) throw new Error('Feuille "' + CONFIG.NOM_FEUILLE + '" introuvable.');
  return sh;
}

// ==== MÉMOS DE REQUÊTE (couleurs des chantiers, jours fériés) ====
// Ces deux tables sont relues à l'identique par plusieurs étapes d'une même
// action (repeindre 10 cases d'une assignation groupée = 10 fois les mêmes
// 4 appels Sheets). Elles ne changent jamais AU COURS d'une requête, donc on
// les garde en mémoire le temps de celle-ci.
//
// Sans danger de rémanence : chaque appel google.script.run repart d'un
// contexte JavaScript neuf côté Apps Script, cette variable est donc
// automatiquement remise à null à chaque requête. (Le mémo des couleurs de
// chantiers a disparu avec la peinture au fil de l'eau, 28.08.2026 au soir —
// plus rien côté WebApp.gs ne lit ces couleurs, cf. ecrireDemiJournee_.)
var _memoFeries = null;
function feriesMemo_(ss) {
  if (_memoFeries === null) _memoFeries = lireFeries(ss);
  return _memoFeries;
}

// Lecture défensive d'une cellule dans un tableau 2D issu de getValues() —
// évite le piège classique String(undefined) === "undefined" si jamais la
// largeur réellement lue est plus courte que prévu (fin de feuille, etc.).
function v_(ligne, idx) {
  var val = ligne ? ligne[idx] : undefined;
  return (val === undefined || val === null) ? "" : val;
}

// ==== SECTIONS : à partir de quelle ligne commencent les sous-traitants ====
//
// >>> LE SEUL RÉGLAGE À CONNAÎTRE DANS CE FICHIER <<<
// Tout bloc "personne" qui commence à cette ligne OU EN DESSOUS est affiché
// comme sous-traitant ; tout ce qui est au-dessus est du personnel. Les blocs
// font 4 lignes et commencent ligne 6, donc les débuts possibles sont
// 6, 10, 14, 18, 22, 26… — 22 = la 5e personne de la feuille, c'est-à-dire
// que les 4 premières lignes du planning sont du personnel.
//
// Si un jour tu ajoutes ou retires du personnel DIRECTEMENT dans Google
// Sheets (pas depuis l'appli) au-dessus des sous-traitants, tout descend ou
// remonte de 4 lignes : il suffit alors de changer ce nombre de 4 en plus ou
// en moins ici, et de recoller ce fichier. (Les ajouts faits DEPUIS l'appli,
// eux, sont déjà gérés tout seuls — cf. apiAjouterPersonne.)
var PREMIERE_LIGNE_SOUS_TRAITANT = 22;

// ==== CONVENTIONS TEXTE : statut (détail) & surcharge de section (nom) ====
//
// STATUTS ÉDITABLES (round transfert V3, feuille "Statuts") : la liste des
// statuts possibles et leur couleur ne sont plus figées en dur — elles
// viennent désormais de la feuille "Statuts" (cf. apiListerStatuts plus bas),
// éditable comme la feuille "Chantier". Ces 4 valeurs restent néanmoins en
// dur ICI, sous un autre nom : elles servent de CONTENU PAR DÉFAUT écrit dans
// la feuille "Statuts" à sa toute première création (apiEnregistrerStatuts),
// et de FILET DE SÉCURITÉ si jamais cette feuille existe mais se retrouve
// vide (jamais d'erreur, jamais un planning qui perd tous ses statuts).
//
// IMPORTANT — ce qui NE change PAS : le texte réellement écrit dans les
// crochets d'une case ("[Confirmé] ...") reste le NOM AFFICHÉ du statut, pas
// sa clé technique. C'est ce nom qui sert de "clé de reconnaissance texte" à
// la relecture (decoderLigneTache_ ci-dessous, comparaison littérale) —
// exactement comme avant l'introduction de la feuille "Statuts". Renommer un
// statut (nom affiché) reste donc un choix conscient qui orpheline les cases
// déjà écrites avec l'ancien nom, tout comme renommer un chantier — cf. la
// note équivalente en tête de apiEnregistrerChantiers.
var STATUT_ORDER_WEB_DEFAUT = ["areserver", "reserve", "confirme", "annule"];
var STATUTS_WEB_DEFAUT = { areserver: "À réserver", reserve: "Réservé", confirme: "Confirmé", annule: "Annulé" };
var STATUT_COULEUR_DEFAUT = { areserver: "#fce8b2", reserve: "#cfe2f3", confirme: "#b6d7a8", annule: "#f4cccc" };

// Mémo de requête (même principe que feriesMemo_ ci-dessus) : la liste des
// statuts ne change jamais au cours d'une même requête, et decoderLigneTache_
// /encoderLigneTache_ la consultent potentiellement des dizaines de fois
// (une fois par ligne de tâche décodée/encodée) — la lire une seule fois
// évite un aller-retour Sheets par ligne.
var _memoStatutOrdre = null, _memoStatutsNoms = null;
function assurerCacheStatuts_() {
  if (_memoStatutOrdre !== null) return;
  var liste = apiListerStatuts();
  _memoStatutOrdre = liste.map(function (s) { return s.cle; });
  _memoStatutsNoms = {};
  liste.forEach(function (s) { _memoStatutsNoms[s.cle] = s.nom; });
}
function statutOrdreWeb_() { assurerCacheStatuts_(); return _memoStatutOrdre; }
function statutsNomsWeb_() { assurerCacheStatuts_(); return _memoStatutsNoms; }

// ==== FEUILLE DE CONFIG "Statuts" (round transfert V3, §3 du contrat) ====
// Même esprit que la feuille "Chantier" existante : 1 ligne d'en-tête, une
// ligne par statut. Col A = nom affiché, B = couleur (fond de la case, comme
// pour "Chantier"), C = ordre d'affichage (nombre).
var FEUILLE_STATUTS = "Statuts";
var STATUT_HEADER_ROWS = 1;

// creerSiAbsente=false (lecture) : ne JAMAIS créer la feuille en effet de
// bord d'une simple lecture — seule une écriture explicite (apiEnregistrerStatuts)
// la crée, au tout premier besoin réel, avec le contenu par défaut ci-dessus.
// ssConnu optionnel : cf. feuillePlanning_, même principe (round audit perf,
// 02.09.2026).
function feuilleStatuts_(creerSiAbsente, ssConnu) {
  var ss = ssConnu || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FEUILLE_STATUTS);
  if (sh || !creerSiAbsente) return sh || null;
  sh = ss.insertSheet(FEUILLE_STATUTS);
  sh.getRange(1, 1, 1, 3).setValues([["Nom affiché", "Couleur", "Ordre"]]).setFontWeight("bold");
  var lignes = STATUT_ORDER_WEB_DEFAUT.map(function (cle, i) {
    return [STATUTS_WEB_DEFAUT[cle], STATUT_COULEUR_DEFAUT[cle], i + 1];
  });
  sh.getRange(2, 1, lignes.length, 3).setValues(lignes);
  sh.setColumnWidths(1, 3, 140);
  sh.setFrozenRows(1);
  return sh;
}

// Clé technique = nom slugifié (sans accent, sans espace, minuscules) — ex.
// "À réserver" -> "areserver". Ne sert QU'à identifier une ligne de la
// feuille "Statuts" d'un appel à l'autre (cf. apiEnregistrerStatuts) ; ce
// n'est PAS ce qui est écrit dans les crochets de la feuille "Planning" (cf.
// note en tête de section ci-dessus).
function slugifierStatut_(nom) {
  var s = String(nom || "").trim().toLowerCase()
    .replace(/[àâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o").replace(/[ùûü]/g, "u").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
  return s || ("statut" + new Date().getTime());
}

// [{cle, nom, couleur, ordre}], triée par ordre. Ne crée jamais la feuille
// (cf. feuilleStatuts_) : tant que "Statuts" n'existe pas, ou existe mais est
// vide, les 4 valeurs par défaut font office de contenu — jamais de planning
// qui se retrouve sans aucun statut utilisable.
// ss optionnel : cf. feuillePlanning_ (round audit perf, 02.09.2026) —
// apiDemarrer le passe pour réutiliser le classeur déjà en main ; tout appel
// existant sans argument (le contrat public appelé par le client) continue
// de fonctionner à l'identique.
function apiListerStatuts(ss) {
  var defaut = STATUT_ORDER_WEB_DEFAUT.map(function (cle, i) {
    return { cle: cle, nom: STATUTS_WEB_DEFAUT[cle], couleur: STATUT_COULEUR_DEFAUT[cle], ordre: i + 1 };
  });
  var sh = feuilleStatuts_(false, ss);
  if (!sh) return defaut;
  var lr = sh.getLastRow();
  if (lr <= STATUT_HEADER_ROWS) return defaut;
  var n = lr - STATUT_HEADER_ROWS;
  var vals = sh.getRange(STATUT_HEADER_ROWS + 1, 1, n, 3).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    var nom = String(vals[i][0]).trim();
    if (nom === "") continue;
    out.push({ cle: slugifierStatut_(nom), nom: nom, couleur: String(vals[i][1] || "").trim() || "#e5e5e5", ordre: Number(vals[i][2]) || (i + 1) });
  }
  if (out.length === 0) return defaut; // feuille présente mais entièrement vide : même filet que "absente"
  out.sort(function (a, b) { return a.ordre - b.ordre; });
  return out;
}

// modifs:[{cle,nom,couleur,ordre}] (cle = celle renvoyée par un précédent
// apiListerStatuts, calculée à partir du nom ALORS en feuille — c'est ce qui
// permet de renommer un statut tout en restant localisable, cf. le calcul de
// `index` ci-dessous : construit depuis le nom ACTUEL de chaque ligne AVANT
// d'appliquer les modifs). nouveaux:[{nom,couleur,ordre}] (cle auto-générée).
// supprimes:[cle,...]. Miroir d'apiEnregistrerChantiers, en delete-then-append
// pour la couleur/ordre (comme pour "Formulaires rapides" — volume minuscule,
// pas besoin d'un diff ligne à ligne).
function apiEnregistrerStatuts(modifs, nouveaux, supprimes) {
  return avecVerrou_(function () {
    var sh = feuilleStatuts_(true); // crée avec le contenu par défaut au tout premier besoin réel
    var lr = sh.getLastRow();
    var n = Math.max(0, lr - STATUT_HEADER_ROWS);
    var vals = n > 0 ? sh.getRange(STATUT_HEADER_ROWS + 1, 1, n, 3).getValues() : [];

    var index = {}; // clé (dérivée du nom ACTUEL) -> index dans vals
    for (var i = 0; i < vals.length; i++) {
      var nomActuel = String(vals[i][0]).trim();
      if (nomActuel === "") continue;
      index[slugifierStatut_(nomActuel)] = i;
    }

    (modifs || []).forEach(function (m) {
      if (!m || !m.cle) return;
      var i = index[m.cle];
      if (i === undefined) return; // clé inconnue (feuille changée entre-temps par ailleurs) : ignorée, jamais bloquant
      if (m.nom != null && String(m.nom).trim() !== "") vals[i][0] = String(m.nom).trim();
      if (m.couleur != null) vals[i][1] = estCouleurHex_(m.couleur) ? m.couleur : vals[i][1];
      if (m.ordre != null && !isNaN(Number(m.ordre))) vals[i][2] = Number(m.ordre);
    });

    var aSupprimer = {};
    (supprimes || []).forEach(function (cle) {
      var i = index[cle];
      if (i !== undefined) aSupprimer[i] = true;
    });
    var restants = vals.filter(function (row, i) { return !aSupprimer[i]; });

    (nouveaux || []).forEach(function (nv) {
      if (!nv || String(nv.nom || "").trim() === "") return;
      restants.push([String(nv.nom).trim(), estCouleurHex_(nv.couleur) ? nv.couleur : "#e5e5e5", Number(nv.ordre) || (restants.length + 1)]);
    });

    if (lr > STATUT_HEADER_ROWS) sh.getRange(STATUT_HEADER_ROWS + 1, 1, lr - STATUT_HEADER_ROWS, 3).clearContent();
    if (restants.length > 0) sh.getRange(STATUT_HEADER_ROWS + 1, 1, restants.length, 3).setValues(restants);
    SpreadsheetApp.flush();

    // Le mémo de requête doit refléter ce qu'on vient d'écrire (utile si
    // d'autres écritures de statuts suivent dans le MÊME appel — jamais le
    // cas aujourd'hui, mais un cache qui mentirait serait pire qu'inutile).
    _memoStatutOrdre = null; _memoStatutsNoms = null;
    return apiListerStatuts();
  });
}

// Marqueurs de nom : ils ne servent QU'AUX CAS LIMITES, quand la position de
// la ligne ne suffit pas à trancher — typiquement un sous-traitant ajouté
// depuis l'appli sur une ligne libre située au-dessus du seuil, ou du
// personnel ajouté en dessous. Dans le cas normal (chacun de son côté du
// seuil), rien n'est écrit : les noms de la feuille restent tels quels.
var MARQUEUR_SOUS_TRAITANT = "🔧 ";
var MARQUEUR_PERSONNEL = "👷 ";

// startRow = ligne de début du bloc (facultatif : sans lui, seul un marqueur
// explicite peut désigner un sous-traitant).
function decoderNom_(brut, startRow) {
  var s = String(brut == null ? "" : brut);
  if (s.indexOf(MARQUEUR_SOUS_TRAITANT) === 0) return { nom: s.slice(MARQUEUR_SOUS_TRAITANT.length).trim(), sousTraitant: true };
  if (s.indexOf(MARQUEUR_PERSONNEL) === 0) return { nom: s.slice(MARQUEUR_PERSONNEL.length).trim(), sousTraitant: false };
  return { nom: s, sousTraitant: (startRow != null && startRow >= PREMIERE_LIGNE_SOUS_TRAITANT) };
}
// N'ajoute un marqueur que si la ligne dit le contraire de ce qu'on veut —
// sinon le nom est écrit tel quel, sans rien qui traîne dans la feuille.
function encoderNom_(nom, sousTraitant, startRow) {
  var n = String(nom == null ? "" : nom).trim();
  var implicite = (startRow != null && startRow >= PREMIERE_LIGNE_SOUS_TRAITANT);
  if (!!sousTraitant === implicite) return n;
  return (sousTraitant ? MARQUEUR_SOUS_TRAITANT : MARQUEUR_PERSONNEL) + n;
}
// Une case de détail = une LISTE DE TÂCHES (une par ligne non vide),
// CHACUNE avec son propre statut optionnel — demande de Lionel, 28.08.2026
// ("les 2 tâches peuvent avoir des statuts différents"). Un statut en tête
// de ligne est reconnu qu'il soit ou non déjà précédé du tiret que tirets()
// (Planning_Format.gs) ajoute automatiquement à CHAQUE ligne non vide dès le
// prochain reformatage — sinon le statut serait perdu à la sauvegarde
// suivante ("- [Confirmé] Béton radier" doit rester reconnu). Une ligne dont
// le crochet ne correspond à aucun statut connu (faute de frappe, ou texte
// libre qui commence par "[...]" pour une autre raison) est conservée telle
// quelle, sans statut reconnu — jamais d'erreur, jamais de perte de texte.
//
// Crochets reconnus en tête de ligne, DANS N'IMPORTE QUEL ORDRE à la
// relecture (round transfert V3, §2 et §4 du contrat) :
//   [S] / [D]     jour (Samedi/Dimanche) — UNIQUEMENT significatif pour la
//                 colonne week-end fusionnée (cf. plus bas, "CELLULE
//                 WEEK-END") ; sans objet pour une case de semaine normale,
//                 où il n'apparaît jamais.
//   [NomStatut]   statut (sous-traitant), depuis la feuille "Statuts".
//   [Important]   tag manuel (personnel ET sous-traitant, demande de Lionel,
//                 28.08.2026 : "tag important pour faire ressortir le texte
//                 d'une tâche").
//   [Série:xxxxxx] identifiant de série (round transfert V3, §4) — une tâche/
//                 note générée par apiEnregistrerSerie porte ce tag, qui sert
//                 ensuite à la retrouver pour apiModifierSerie/apiSupprimerSerie.
// Un seul tiret possible en tête (tirets(), dans Planning_Format.gs, n'en
// ajoute qu'un par ligne, jamais un par crochet) — il est donc retiré UNE
// SEULE FOIS, avant la boucle qui consomme les crochets. Un crochet qui ne
// correspond à AUCUN des 4 ci-dessus (faute de frappe, ou texte libre qui
// commence par "[...]" pour une autre raison) arrête la boucle et reste tel
// quel dans le texte : jamais d'erreur, jamais de perte de texte.
function decoderLigneTache_(ligne) {
  var s = String(ligne).replace(/^-\s+/, "");
  var jour = null, statut = null, important = false, serieId = null, demi = null, m;
  while ((m = /^\[([^\]]+)\][ \t]*/.exec(s))) {
    var tag = m[1];
    if (tag === "S" || tag === "D") { jour = tag; s = s.slice(m[0].length); continue; }
    // [M] / [A] : demi-journée d'un JALON ou d'une NOTE (round du 02.09.2026,
    // demande de Lionel : "j'aimerais mettre jalons et notes sur des demi-
    // journées aussi"). Même procédé que [S]/[D] pour le week-end : deux
    // valeurs dans une seule case, distinguées par une étiquette. Aucune
    // étiquette = la JOURNÉE ENTIÈRE, ce qui laisse tout l'existant lu
    // exactement comme avant — aucune migration.
    if (tag === "M") { demi = "matin"; s = s.slice(m[0].length); continue; }
    if (tag === "A") { demi = "aprem"; s = s.slice(m[0].length); continue; }
    if (tag === "Important") { important = true; s = s.slice(m[0].length); continue; }
    if (/^Série:/.test(tag)) { serieId = tag.slice(tag.indexOf(":") + 1).trim(); s = s.slice(m[0].length); continue; }
    var trouve = false;
    var ordre = statutOrdreWeb_(), noms = statutsNomsWeb_();
    for (var i = 0; i < ordre.length; i++) {
      if (noms[ordre[i]] === tag) { statut = ordre[i]; s = s.slice(m[0].length); trouve = true; break; }
    }
    if (!trouve) break;
  }
  return { statut: statut, texte: s, important: important, serieId: serieId, jour: jour, demi: demi };
}
function decoderTaches_(brut) {
  var s = String(brut == null ? "" : brut);
  if (s.trim() === "") return [];
  return s.split("\n")
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l !== ""; })
    .map(decoderLigneTache_);
}
// t = {texte, statut, important, serieId, jour} -> une ligne de texte, ou
// null si la tâche est vide (ligne ajoutée puis jamais remplie — ignorée par
// encoderTaches_ ci-dessous). Crochets posés dans l'ORDRE fixé par le contrat
// (jour -> statut -> important -> série), même si decoderLigneTache_ les
// relit dans n'importe quel ordre. Factorisé hors d'encoderTaches_ : c'est
// aussi le point d'écriture d'une ligne de la CELLULE WEEK-END (cf. plus
// bas), qui a besoin d'encoder une ligne à la fois plutôt qu'un tableau entier.
function encoderLigneTache_(t) {
  var texte = String(t && t.texte == null ? "" : t.texte).trim();
  if (texte === "") return null;
  var pre = "";
  if (t && t.jour === "S") pre += "[S] ";
  else if (t && t.jour === "D") pre += "[D] ";
  if (t && t.demi === "matin") pre += "[M] ";
  else if (t && t.demi === "aprem") pre += "[A] ";
  if (t && t.statut && statutsNomsWeb_()[t.statut]) pre += "[" + statutsNomsWeb_()[t.statut] + "] ";
  if (t && t.important) pre += "[Important] ";
  if (t && t.serieId) pre += "[Série:" + t.serieId + "] ";
  return pre + texte;
}
// taches = [{texte, statut, important, serieId, jour}, ...] -> une ligne de
// cellule par tâche non vide (cf. encoderLigneTache_ ci-dessus).
function encoderTaches_(taches) {
  return (taches || [])
    .map(encoderLigneTache_)
    .filter(function (l) { return l !== null; })
    .join("\n");
}
// Notes (ligne CONFIG.LIGNE_NOTES) : une case peut désormais contenir
// plusieurs notes indépendantes, une par ligne — même principe que les
// tâches ci-dessus (round du 28.08.2026, demande de Lionel), sans statut
// (concept propre aux sous-traitants, sans objet pour une note). Réutilise
// tel quel le décodeur/encodeur de ligne : un [Important] et/ou un
// [Série:xxxxxx] éventuels sont reconnus de la même façon ; un crochet de
// statut serait improbable dans une note libre et, s'il apparaissait, serait
// simplement ignoré (aucun dégât, jamais utilisé — la ligne 5 "notes" n'a pas
// de colonne week-end fusionnée par personne comme les cases de tâche, donc
// le tag [S]/[D] n'y apparaît pas non plus en pratique aujourd'hui, mais
// serait lu sans dégât s'il y apparaissait).
function decoderNotesJour_(brut) {
  return decoderTaches_(brut).map(function (t) { return { texte: t.texte, important: t.important, serieId: t.serieId, jour: t.jour, demi: t.demi }; });
}
function encoderNotesJour_(entrees) {
  return encoderTaches_((entrees || []).map(function (e) { return { texte: e.texte, important: e.important, serieId: e.serieId, jour: e.jour, demi: e.demi }; }));
}

// ==== CELLULE WEEK-END (round transfert V3, §2 du contrat) ====
// La feuille réelle n'a qu'UNE seule colonne fusionnée par bloc personne pour
// Sam+Dim (fusionnerWeekends, Planning_Format.gs, fusionne les 4 LIGNES du
// bloc entier x les 2 colonnes WE en UNE cellule — pas de ligne "Chantier"
// distincte de la ligne "détail" pour le week-end, contrairement à un jour de
// semaine). Toute la donnée du week-end (chantier ET tâches, Samedi ET
// Dimanche) vit donc dans UNE seule cellule physique, colonne jj=6 du bloc de
// semaine (jj=7, Dimanche, fait partie de la même fusion et ne porte jamais
// de valeur propre — Sheets vide les cellules non-ancres d'une fusion).
//
// Encodage choisi : la cellule week-end est une liste de lignes, EXACTEMENT
// comme une case de détail de semaine (decoderLigneTache_/encoderLigneTache_
// réutilisés tels quels, tag [S]/[D] en tête pour distinguer Samedi/Dimanche
// — absent = les deux jours, cf. §2). Le "chantier" du jour, qui pour un jour
// de semaine vit dans une case séparée, est ici représenté par une ligne
// dédiée au format "[Chantier] NomDuChantier" (le mot "Chantier" n'est PAS un
// statut connu ni "Important" ni une série : decoderLigneTache_ le laisse tel
// quel dans le texte décodé, cf. sa règle "crochet inconnu -> arrêt de la
// boucle, rien n'est perdu" — c'est justement ce qui permet de le reconnaître
// ici après coup, SANS toucher à decoderLigneTache_ lui-même). Une ligne est
// donc SOIT une ligne "chantier" (texte = "[Chantier] Nom"), SOIT une tâche
// normale — jamais les deux.
//
// COMPATIBILITÉ DESCENDANTE : une cellule week-end saisie à la main AVANT ce
// round (juste le nom du chantier tapé tel quel, sans aucun crochet — c'est
// tout ce que permettait la feuille jusqu'ici, cf. appliquerValidationChantier
// dans Planning_Format.gs) reste lisible : elle se décode simplement comme
// UNE tâche sans tag jour (donc affichée les 2 jours) et sans "chantier"
// structuré — exactement le même principe que "[Confirmé] " pour les statuts
// (une case déjà remplie sans le nouveau format continue de s'afficher,
// simplement sans la structuration, tant qu'elle n'a pas été réenregistrée).
function estLigneChantierWE_(dec) {
  return /^\[Chantier\][ \t]*/.test(dec.texte);
}
function nomChantierWE_(dec) {
  return dec.texte.replace(/^\[Chantier\][ \t]*/, "").trim();
}
function ligneChantierWE_(jour, nom) {
  return { jour: jour, statut: null, important: false, serieId: null, texte: "[Chantier] " + String(nom == null ? "" : nom).trim() };
}
// Décode la cellule week-end BRUTE en une liste de lignes, chacune enrichie
// de estChantier/chantierNom (undefined pour une tâche normale).
function decoderCelluleWeekend_(brut) {
  return decoderTaches_(brut).map(function (dec) {
    if (estLigneChantierWE_(dec)) { dec.estChantier = true; dec.chantierNom = nomChantierWE_(dec); }
    return dec;
  });
}
// Vue du week-end pour UN jour ('S' ou 'D') : { chantier, taches } — même
// forme que les jours 1-5 (cf. chargerSemaine_). Une ligne sans tag jour
// s'applique aux 2 jours (§2) ; en cas de plusieurs lignes "chantier" pour le
// même jour (ne devrait pas arriver en usage normal, cf. encodage à
// l'écriture), la DERNIÈRE l'emporte — comportement défensif, jamais d'erreur.
function vueJourWeekend_(lignesDecodees, jour) {
  var chantier = null, taches = [];
  lignesDecodees.forEach(function (dec) {
    if (dec.jour !== null && dec.jour !== jour) return; // réservé à l'autre jour
    if (dec.estChantier) { chantier = dec.chantierNom || null; return; }
    taches.push({ texte: dec.texte, statut: dec.statut, important: dec.important, serieId: dec.serieId, jour: dec.jour });
  });
  return { chantier: chantier, taches: taches };
}

// ÉCRITURE de la cellule week-end — REMPLACEMENT (fiche personne, cf.
// apiEnregistrerCellulePersonne) : le contenu de CE jour (jourEcrit, 'S' ou
// 'D') est intégralement remplacé par chantierNouveau/tachesNouvelles ;
// l'AUTRE jour, s'il a du contenu qui lui est propre (tagué), est préservé
// tel quel (§2 du contrat). Chaque nouvelle ligne n'est taguée jourEcrit QUE
// si la cellule contient, par ailleurs, du contenu pour l'autre jour et que
// ce contenu est DISTINCT de ce qu'on écrit maintenant — sinon elle reste
// sans tag (cas courant : "même chose les 2 jours"). La comparaison se fait
// par ENSEMBLE de signatures (texte encodé SANS le tag jour), chantier et
// tâches séparément — cf. §2 : "la cellule contient PAR AILLEURS du contenu
// [D] distinct", une notion au niveau de la cellule entière, pas ligne à ligne.
function fusionnerRemplacementWeekend_(ancienBrut, jourEcrit, chantierNouveau, tachesNouvelles) {
  var jourOppose = (jourEcrit === "S") ? "D" : "S";
  var lignes = decoderCelluleWeekend_(ancienBrut);
  var preserve = lignes.filter(function (l) { return l.jour === jourOppose; });
  var preserveChantier = preserve.filter(function (l) { return l.estChantier; });
  var preserveTaches = preserve.filter(function (l) { return !l.estChantier; });

  var nomChantierNouveau = String(chantierNouveau || "").trim();

  // --- Chantier : au plus 1 ligne pour ce jour.
  var chantierDistinct = preserveChantier.length > 0 &&
    preserveChantier.some(function (l) { return l.chantierNom !== nomChantierNouveau; });
  var tagChantier = chantierDistinct ? jourEcrit : null;
  var nouvellesLignes = [];
  if (nomChantierNouveau !== "") nouvellesLignes.push(ligneChantierWE_(tagChantier, nomChantierNouveau));

  // --- Tâches : signature = ligne encodée sans le tag jour (statut+
  //     important+série+texte), comparée en ENSEMBLE (ordre indifférent).
  function signatureTache_(t) { return encoderLigneTache_({ texte: t.texte, statut: t.statut, important: t.important, serieId: t.serieId, jour: null }) || ""; }
  var sigPreserve = preserveTaches.map(signatureTache_).sort();
  var sigNouvelles = (tachesNouvelles || []).map(signatureTache_).sort();
  var tachesDistinctes = preserveTaches.length > 0 &&
    (sigPreserve.length !== sigNouvelles.length || sigPreserve.some(function (s, i) { return s !== sigNouvelles[i]; }));
  var tagTaches = tachesDistinctes ? jourEcrit : null;
  (tachesNouvelles || []).forEach(function (t) {
    var texte = String(t && t.texte == null ? "" : t.texte).trim();
    if (texte === "") return;
    nouvellesLignes.push({ jour: tagTaches, statut: t.statut || null, important: !!(t && t.important), serieId: (t && t.serieId) || null, texte: texte });
  });

  var toutesLignes = preserve.concat(nouvellesLignes);
  var texte2 = toutesLignes.map(encoderLigneTache_).filter(function (l) { return l !== null; }).join("\n");
  return tirets(texte2);
}

// ÉCRITURE de la cellule week-end — AJOUT (série, cf. apiEnregistrerSerie) :
// une seule ligne de plus, TOUJOURS explicitement taguée jourEcrit (une
// occurrence de série est par construction propre à SON jour — "tous les
// samedis" ne doit jamais se mettre à s'appliquer aussi au dimanche du seul
// fait d'une coïncidence de texte) ; rien d'autre n'est touché. `ligne` =
// {texte, statut, important, serieId} (statut/important/serieId facultatifs).
function ajouterLigneWeekend_(ancienBrut, jourEcrit, ligne) {
  var brut = String(ancienBrut == null ? "" : ancienBrut);
  var texte = String(ligne && ligne.texte == null ? "" : ligne.texte).trim();
  var nouvelle = encoderLigneTache_({ jour: jourEcrit, statut: (ligne && ligne.statut) || null, important: !!(ligne && ligne.important), serieId: (ligne && ligne.serieId) || null, texte: texte });
  if (nouvelle === null) return brut;
  var combine = (brut.trim() === "") ? nouvelle : (brut + "\n" + nouvelle);
  return tirets(combine);
}

// ==== LECTURE ====

// Chantiers disponibles (feuille "Chantier") : nom tel que saisi + couleur
// (le FOND de la case, seule source de vérité — cf. lireCouleursChantier
// dans Planning_Format.gs). Ordre = ordre de la feuille.
// ss optionnel : cf. feuillePlanning_ (round audit perf, 02.09.2026).
function apiListerChantiers(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.FEUILLE_CHANTIER);
  if (!sh) return [];
  var lr = sh.getLastRow();
  if (lr <= CONFIG.CHANTIER_HEADER_ROWS) return [];
  var n = lr - CONFIG.CHANTIER_HEADER_ROWS;
  var noms = sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, n, 1).getValues();
  var fonds = sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_COULEUR, n, 1).getBackgrounds();
  var out = [];
  for (var i = 0; i < n; i++) {
    var nom = String(noms[i][0]).trim();
    if (nom === "") continue;
    var coul = fonds[i][0];
    // ligne = ligne réelle dans la feuille "Chantier", pour pouvoir y
    // réécrire la couleur (cf. apiEnregistrerChantiers).
    out.push({ nom: nom, couleur: (coul && coul.toLowerCase() !== CONFIG.BLANC) ? coul : "#e5e5e5", ligne: CONFIG.CHANTIER_HEADER_ROWS + 1 + i });
  }
  return out;
}

// ==== CHANTIERS : ajouter, changer les couleurs ====
// Tout est appliqué en un seul appel (plusieurs couleurs + éventuellement un
// nouveau chantier), puis recolorerChantiers() répercute sur le planning —
// c'est exactement ce que fait déjà le menu 🎨, mais sans avoir à y aller.
//
// Le NOM d'un chantier existant n'est jamais modifié ICI : il sert de clé
// dans chaque case du planning (correspondance par le texte, cf.
// lireCouleursChantier), le renommer sans migrer les cases orphelinerait
// tout ce qui l'utilise déjà. Pour renommer ou supprimer un chantier, cf.
// apiRenommerChantier/apiSupprimerChantier plus bas — round du 02.09.2026
// (suite), demande explicite de Lionel après vérification que la maquette
// avait bien ces 2 actions (elle les avait, cf. FRONTEND-CHANGELOG.md).
function apiEnregistrerChantiers(modifs, nouveau, labGCourant) {
  return avecVerrou_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.FEUILLE_CHANTIER);
    if (!sh) throw new Error('Feuille "' + CONFIG.FEUILLE_CHANTIER + '" introuvable.');

    var touche = false;
    (modifs || []).forEach(function (m) {
      if (!m || !m.ligne || !estCouleurHex_(m.couleur)) return;
      sh.getRange(m.ligne, CONFIG.CHANTIER_COL_COULEUR).setBackground(m.couleur).setValue("");
      touche = true;
    });

    if (nouveau && String(nouveau.nom || "").trim() !== "") {
      var nom = String(nouveau.nom).trim();
      var lr = sh.getLastRow();
      var existants = lr > CONFIG.CHANTIER_HEADER_ROWS
        ? sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, lr - CONFIG.CHANTIER_HEADER_ROWS, 1).getValues()
        : [];
      for (var i = 0; i < existants.length; i++) {
        if (String(existants[i][0]).trim().toLowerCase() === nom.toLowerCase()) throw new Error("« " + nom + " » existe déjà.");
      }
      var ligneNeuve = Math.max(lr, CONFIG.CHANTIER_HEADER_ROWS) + 1;
      var couleur = estCouleurHex_(nouveau.couleur) ? nouveau.couleur : pickNextColorChantier(getUsedColorsChantier(sh));
      sh.getRange(ligneNeuve, CONFIG.CHANTIER_COL_NOM).setValue(nom);
      sh.getRange(ligneNeuve, CONFIG.CHANTIER_COL_COULEUR).setBackground(couleur).setValue("");
      touche = true;
    }

    if (touche) {
      // Répercute les nouvelles couleurs sur ce qui est DÉJÀ peint sur le
      // planning (la peinture au fil de l'eau a disparu — cf.
      // ecrireDemiJournee_ — mais l'existant, posé par les créations de
      // semaine, resterait sinon dans l'ancienne couleur jusqu'à la
      // prochaine mise en forme). Action rare, ~5 appels : conservée.
      recolorerChantiers();
    }
    return { ok: true, chantiers: apiListerChantiers(), semaine: apiChargerSemaine(labGCourant) };
  });
}
function estCouleurHex_(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")); }

// ==== CHANTIERS : renommer (round du 02.09.2026, suite) ====
// Contrairement à apiEnregistrerChantiers (qui refuse tout renommage), cette
// fonction existe précisément pour gérer la migration que l'ancien
// commentaire redoutait : le nom sert de clé texte dans CHAQUE case
// "chantier" déjà écrite (une par demi-journée occupée, ligne séparée de la
// ligne détail — chantierRow = bloc.startRow (matin) ou +2 (après-midi), cf.
// apiEnregistrerCellulePersonne) ; renommer sans les migrer orphelinerait
// silencieusement toutes ces cases (elles perdraient leur couleur ET leur
// reconnaissance comme appartenant à ce chantier, cf. lireCouleursChantier).
//
// Migre TOUTES les semaines, PASSÉES COMPRISES — volontairement différent de
// apiRenommerPersonne (qui respecte "les semaines passées ne sont jamais
// modifiées"). Ce principe protège un FAIT historique (qui était où, avec
// quel statut) ; ici il ne s'agit que de corriger une clé de référence après
// coup — ne pas migrer les semaines passées casserait leur coloration pour
// aucun bénéfice (le fait qu'une case porte "Chantier A" ou son nouveau nom
// "Chantier B" est la même information, juste écrite différemment).
//
// Balayage : pour chaque personne détectée, les 2 lignes "chantier" (matin/
// après-midi) sont lues sur TOUTE la largeur de la feuille en un seul appel
// chacune, remplacées si un remplacement a eu lieu, réécrites en un seul
// appel — jamais case par case. La colonne 1 (nom de la personne) et les
// colonnes label de chaque semaine ne contiennent jamais le nom exact d'un
// chantier (autre nature de texte), donc une correspondance EXACTE à
// l'ancien nom ne peut cibler qu'une vraie case chantier.
function apiRenommerChantier(ligne, nouveauNom) {
  return avecVerrou_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.FEUILLE_CHANTIER);
    if (!sh) throw new Error('Feuille "' + CONFIG.FEUILLE_CHANTIER + '" introuvable.');
    var nom = String(nouveauNom || "").trim();
    if (!nom) throw new Error("Le nom ne peut pas être vide.");
    var ancienNom = String(sh.getRange(ligne, CONFIG.CHANTIER_COL_NOM).getValue()).trim();
    if (!ancienNom) throw new Error("Chantier introuvable.");
    if (nom.toLowerCase() === ancienNom.toLowerCase()) {
      return { ok: true, chantiers: apiListerChantiers(ss), casesMigrees: 0 };
    }

    var lrC = sh.getLastRow();
    var existants = lrC > CONFIG.CHANTIER_HEADER_ROWS
      ? sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, lrC - CONFIG.CHANTIER_HEADER_ROWS, 1).getValues()
      : [];
    for (var i = 0; i < existants.length; i++) {
      var autreLigne = CONFIG.CHANTIER_HEADER_ROWS + 1 + i;
      if (autreLigne === ligne) continue;
      if (String(existants[i][0]).trim().toLowerCase() === nom.toLowerCase()) throw new Error("« " + nom + " » existe déjà.");
    }

    sh.getRange(ligne, CONFIG.CHANTIER_COL_NOM).setValue(nom);

    var shP = feuillePlanning_(ss);
    var lc = shP.getLastColumn(), lrP = shP.getLastRow();
    var pers = detecterPersonnes(shP, CONFIG.PREMIERE_LIGNE_PERSO, lrP);
    var casesMigrees = 0;
    pers.forEach(function (b) {
      [b.startRow, b.startRow + 2].forEach(function (rowChantier) {
        if (rowChantier > lrP) return;
        var range = shP.getRange(rowChantier, 1, 1, lc);
        var vals = range.getValues()[0];
        var change = false;
        for (var c = 0; c < vals.length; c++) {
          if (String(vals[c]).trim() === ancienNom) { vals[c] = nom; change = true; casesMigrees++; }
        }
        if (change) range.setValues([vals]);
      });
    });

    SpreadsheetApp.flush();
    recolorerChantiers();
    return { ok: true, chantiers: apiListerChantiers(ss), casesMigrees: casesMigrees };
  });
}

// ==== CHANTIERS : compter les cases qui l'utilisent encore, avant suppression ====
// Ne compte QUE la semaine actuellement affichée et les suivantes — jamais
// les semaines passées (même principe que apiRenommerPersonne/
// apiSupprimerPersonne : "les semaines passées ne sont jamais modifiées").
// C'est aussi la seule plage qu'apiSupprimerChantier videra réellement (cf.
// juste après) : ce compte est donc exactement ce que la suppression va
// toucher, pas une estimation. Compte brut (pas de fusion de plage comme
// compterTachesParPersonne_) : une case matin et une case après-midi
// comptent chacune pour 1, largement suffisant pour une confirmation.
function compterUtilisationsChantier_(shP, lc, lr, pers, labGDepart, nom) {
  var n = 0;
  if (labGDepart > lc) return n;
  var largeur = lc - labGDepart + 1;
  pers.forEach(function (b) {
    [b.startRow, b.startRow + 2].forEach(function (rowChantier) {
      if (rowChantier > lr) return;
      var vals = shP.getRange(rowChantier, labGDepart, 1, largeur).getValues()[0];
      for (var c = 0; c < vals.length; c++) if (String(vals[c]).trim() === nom) n++;
    });
  });
  return n;
}
function apiCompterUtilisationsChantier(ligne, labGCourant) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.FEUILLE_CHANTIER);
  if (!sh) return 0;
  var nom = String(sh.getRange(ligne, CONFIG.CHANTIER_COL_NOM).getValue()).trim();
  if (!nom) return 0;
  var shP = feuillePlanning_(ss);
  var lc = shP.getLastColumn(), lr = shP.getLastRow();
  var pers = detecterPersonnes(shP, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  return compterUtilisationsChantier_(shP, lc, lr, pers, labGCourant, nom);
}

// ==== CHANTIERS : supprimer ====
// forcer=false (par défaut, 1er appel) : si des cases utilisent encore ce
// chantier (semaine affichée et suivantes), NE SUPPRIME RIEN et renvoie
// juste le nombre — au client de reproposer avec forcer=true après
// confirmation explicite (cf. Index.html, supprimerChantierUI, même
// principe que "Supprimer « Nom » et ses 3 tâches ?" pour une personne).
// forcer=true (ou 0 case utilisée) : vide ces cases (jamais les semaines
// passées) puis retire la ligne de la feuille "Chantier"
// (sh.deleteRow — la feuille "Chantier" est une petite liste, contrairement
// à "Planning" où on ne supprime jamais de ligne). Seul le tag "chantier"
// est vidé, jamais la ligne "détail" juste en dessous : le texte de tâche
// éventuellement déjà tapé reste visible, simplement sans chantier associé
// — moins destructeur que tout effacer.
function apiSupprimerChantier(ligne, labGCourant, forcer) {
  return avecVerrou_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.FEUILLE_CHANTIER);
    if (!sh) throw new Error('Feuille "' + CONFIG.FEUILLE_CHANTIER + '" introuvable.');
    var nom = String(sh.getRange(ligne, CONFIG.CHANTIER_COL_NOM).getValue()).trim();
    if (!nom) throw new Error("Chantier introuvable.");

    var shP = feuillePlanning_(ss);
    var lc = shP.getLastColumn(), lrP = shP.getLastRow();
    var pers = detecterPersonnes(shP, CONFIG.PREMIERE_LIGNE_PERSO, lrP);
    var utilisations = compterUtilisationsChantier_(shP, lc, lrP, pers, labGCourant, nom);
    if (utilisations > 0 && !forcer) {
      return { ok: false, utilisations: utilisations };
    }

    if (utilisations > 0) {
      var largeur = lc - labGCourant + 1;
      pers.forEach(function (b) {
        [b.startRow, b.startRow + 2].forEach(function (rowChantier) {
          if (rowChantier > lrP) return;
          var range = shP.getRange(rowChantier, labGCourant, 1, largeur);
          var vals = range.getValues()[0];
          var change = false;
          for (var c = 0; c < vals.length; c++) {
            if (String(vals[c]).trim() === nom) { vals[c] = ""; change = true; }
          }
          if (change) range.setValues([vals]);
        });
      });
    }

    sh.deleteRow(ligne);
    SpreadsheetApp.flush();
    var lrP2 = shP.getLastRow();
    var pers2 = detecterPersonnes(shP, CONFIG.PREMIERE_LIGNE_PERSO, lrP2);
    return { ok: true, chantiers: apiListerChantiers(ss), semaine: chargerSemaine_(shP, labGCourant, lc, lrP2, pers2) };
  });
}

// ==== FEUILLE DE CONFIG "Formulaires rapides" (round transfert V3, §3) ====
// Remplace TEXTES_METIER (Index.html, codé en dur jusqu'ici) et le concept V3
// FORMULAIRES_RAPIDES (en mémoire, prototype) : chaque formulaire rapide
// (ex. "Livraison armature", "Coulage béton"...) est une suite de champs, une
// LIGNE PAR CHAMP dans cette feuille — pas une ligne par formulaire, pour
// rester une simple feuille "plate" sans avoir à sérialiser toute la liste
// des champs dans une seule cellule.
var FEUILLE_FORMULAIRES_RAPIDES = "Formulaires rapides";
var FR_COL_NOM = 1, FR_COL_ORDRE_FORM = 2, FR_COL_ORDRE_CHAMP = 3, FR_COL_CLE = 4, FR_COL_LABEL = 5, FR_COL_TYPE = 6, FR_COL_OPTIONS = 7, FR_COL_ASSIGNE = 8, FR_COL_TYPE_ENTREE = 9;
var FR_NB_COLONNES = 9;
// 9e colonne "TypeEntree" (round du 02.09.2026, demande de Lionel : "il faut
// ajouter les absences aux ajouts rapides à éditer"). Un formulaire rapide
// produit soit une TÂCHE, soit une ABSENCE — c'est la notion de "type" du
// prototype, abandonnée au portage V3 faute de place dans le contrat serveur
// de l'époque (cf. FRONTEND-CHANGELOG.md §2), et qui manquait précisément
// pour rendre Absence / Congé / Vacances configurables comme le reste au lieu
// de rester codés en dur dans le menu "Ajouter".
var FR_TYPES_ENTREE = ["tache", "absence"];
function normaliserTypeEntree_(t) {
  var v = String(t || "").trim().toLowerCase();
  return FR_TYPES_ENTREE.indexOf(v) !== -1 ? v : "tache";
}
var FR_HEADER_ROWS = 1;
var FR_TYPES_VALIDES = ["texte", "nombre", "select", "case"];

// Les 3 formulaires rapides HISTORIQUES de Lionel (Armature/Béton/Livraison
// armature — construits ensemble avant ce round de transfert), chacun avec
// sa propre interface dédiée entièrement codée en dur dans Index.html
// (ouvrirFormulaireArmature/ouvrirFormulaireBeton/
// ouvrirFormulaireLivraisonArmature, reconnues par CORRESPONDANCE EXACTE DE
// NOM — cf. cablerBoutonsMenuAjout). Round "entrées rapides disparues"
// (01.09.2026) : au tout premier transfert, cette feuille de config partait
// vide (contrairement à "Statuts", qui a de vrais défauts universels), donc
// aucun de ces 3 formulaires n'apparaissait plus dans le menu "Ajouter" —
// leur code existait toujours, mais rien ne peuplait plus de ligne portant
// leur nom exact. Contrairement au reste du système "Formulaires rapides"
// (générique, champs éditables), le contenu des `champs` ci-dessous n'est
// JAMAIS lu par leur interface dédiée : il ne sert qu'à l'AFFICHAGE dans la
// page de réglages "Entrée rapide" (résumé de la carte) — d'où un unique
// champ "info" explicatif plutôt que les vrais champs (zone/précision/
// étape/quantité/...), pour ne jamais laisser croire qu'ils sont éditables
// depuis cette page générique.
var FR_NOMS_DEFAUT = ["Armature", "Béton", "Livraison armature"];
var FR_CHAMPS_DEFAUT = {
  "Armature": [{ cle: "info", label: "Formulaire intégré (zone / précision / étape / statut) — champs fixes, non modifiables ici", type: "texte", options: [] }],
  "Béton": [{ cle: "info", label: "Formulaire intégré (zone / quantité / formule / heure / statut) — champs fixes, non modifiables ici", type: "texte", options: [] }],
  "Livraison armature": [{ cle: "info", label: "Formulaire intégré (zone / statut) — champs fixes, non modifiables ici", type: "texte", options: [] }]
};

function feuilleFormulairesRapides_(creerSiAbsente) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FEUILLE_FORMULAIRES_RAPIDES);
  if (sh || !creerSiAbsente) return sh || null;
  sh = ss.insertSheet(FEUILLE_FORMULAIRES_RAPIDES);
  sh.getRange(1, 1, 1, FR_NB_COLONNES).setValues([["NomFormulaire", "OrdreFormulaire", "OrdreChamp", "Cle", "Label", "Type", "OptionsJSON", "AssigneA", "TypeEntree"]]).setFontWeight("bold");
  sh.setColumnWidths(1, FR_NB_COLONNES, 130);
  sh.setFrozenRows(1);
  // Seed avec les 3 formulaires historiques au tout premier besoin réel —
  // même principe que feuilleStatuts_ ci-dessus (round "entrées rapides
  // disparues", 01.09.2026, cf. commentaire sur FR_NOMS_DEFAUT). AssigneA
  // vide = "tout le monde" pour ces 3 formulaires historiques (comportement
  // identique à avant l'ajout de la colonne, round "reverifie 1x que tu a
  // tout fait" du 02.09.2026).
  var lignes = [];
  FR_NOMS_DEFAUT.forEach(function (nom, iForm) {
    FR_CHAMPS_DEFAUT[nom].forEach(function (c, iChamp) {
      lignes.push([nom, iForm + 1, iChamp + 1, c.cle, c.label, c.type, "", "", "tache"]);
    });
  });
  sh.getRange(2, 1, lignes.length, FR_NB_COLONNES).setValues(lignes);
  return sh;
}

// [{nom, ordre, champs:[{cle,label,type,options}]}] — regroupé par
// NomFormulaire (colonne A), champs triés par OrdreChamp (colonne C),
// formulaires triés par OrdreFormulaire (colonne B). Ne crée jamais la
// feuille par une simple LECTURE (même philosophie que Statuts/Chantier) —
// absente ou vide -> repli sur les 3 formulaires historiques par défaut
// (FR_NOMS_DEFAUT/FR_CHAMPS_DEFAUT ci-dessus, round "entrées rapides
// disparues", 01.09.2026 — même principe que STATUT_ORDER_WEB_DEFAUT pour
// "Statuts"). La feuille elle-même n'est physiquement créée (et seedée) que
// lors du premier ENREGISTREMENT réel depuis la page "Entrée rapide", cf.
// feuilleFormulairesRapides_(true) ci-dessus.
function apiListerFormulairesRapides() {
  var defaut = FR_NOMS_DEFAUT.map(function (nom, i) {
    return { nom: nom, ordre: i + 1, assigneA: "", typeEntree: "tache", champs: FR_CHAMPS_DEFAUT[nom].map(function (c) { return { cle: c.cle, label: c.label, type: c.type, options: c.options }; }) };
  });
  var sh = feuilleFormulairesRapides_(false);
  if (!sh) return defaut;
  var lr = sh.getLastRow();
  if (lr <= FR_HEADER_ROWS) return defaut;
  var n = lr - FR_HEADER_ROWS;
  var vals = sh.getRange(FR_HEADER_ROWS + 1, 1, n, FR_NB_COLONNES).getValues();
  var parNom = {}, ordreForms = [];
  for (var i = 0; i < n; i++) {
    var nom = String(vals[i][FR_COL_NOM - 1]).trim();
    if (nom === "") continue;
    if (!parNom[nom]) {
      // AssigneA porté par CHAQUE ligne-champ de ce formulaire (même valeur
      // répétée, même philosophie que NomFormulaire/OrdreFormulaire ci-dessus
      // sur cette feuille "plate") — on lit celle de la 1ère ligne rencontrée.
      // "" = tout le monde ; sinon l'ancre (ligne Planning) de la personne.
      parNom[nom] = {
        nom: nom,
        ordre: Number(vals[i][FR_COL_ORDRE_FORM - 1]) || (ordreForms.length + 1),
        assigneA: String(vals[i][FR_COL_ASSIGNE - 1] || "").trim(),
        typeEntree: normaliserTypeEntree_(vals[i][FR_COL_TYPE_ENTREE - 1]),
        champs: []
      };
      ordreForms.push(nom);
    }
    var clePropre = String(vals[i][FR_COL_CLE - 1]).trim();
    if (clePropre === "") continue; // ligne "porteuse" d'un formulaire sans champ (cf. apiEnregistrerFormulaireRapide) : nom/ordre/assigneA déjà capturés ci-dessus, rien à ajouter à champs[]
    var type = String(vals[i][FR_COL_TYPE - 1]).trim();
    if (FR_TYPES_VALIDES.indexOf(type) === -1) type = "texte"; // valeur inconnue (feuille modifiée à la main) : repli sûr, jamais d'erreur
    var options = [];
    var brutOpt = String(vals[i][FR_COL_OPTIONS - 1] || "").trim();
    if (brutOpt !== "") { try { var p = JSON.parse(brutOpt); if (Array.isArray(p)) options = p; } catch (ex) { options = []; } }
    parNom[nom].champs.push({
      cle: String(vals[i][FR_COL_CLE - 1]).trim(),
      label: String(vals[i][FR_COL_LABEL - 1]).trim(),
      type: type,
      options: options,
      _ordreChamp: Number(vals[i][FR_COL_ORDRE_CHAMP - 1]) || (parNom[nom].champs.length + 1)
    });
  }
  var out = ordreForms.map(function (nom) {
    var f = parNom[nom];
    f.champs.sort(function (a, b) { return a._ordreChamp - b._ordreChamp; });
    f.champs.forEach(function (c) { delete c._ordreChamp; });
    return f;
  });
  out.sort(function (a, b) { return a.ordre - b.ordre; });
  return out;
}

// Retire toutes les lignes existantes de ce nom puis réinsère le bloc entier
// (delete-then-append, pas de diff ligne à ligne — volume minuscule, cf. §3
// du contrat : "plus simple et suffisant vu le faible volume"). assigneA :
// "" = tout le monde, sinon l'ancre (ligne Planning) de la personne à qui ce
// formulaire est réservé — restauré round "reverifie 1x que tu a tout fait"
// du 02.09.2026 (cf. FRONTEND-CHANGELOG.md §2, deviation abandonnée).
function apiEnregistrerFormulaireRapide(nom, ordre, champs, assigneA, typeEntree) {
  var nomPropre = String(nom || "").trim();
  if (nomPropre === "") throw new Error("Nom du formulaire vide.");
  var assignePropre = String(assigneA || "").trim();
  var typePropre = normaliserTypeEntree_(typeEntree); // "tache" par défaut : un formulaire existant sans cette colonne reste une tâche, comme avant
  return avecVerrou_(function () {
    var sh = feuilleFormulairesRapides_(true);
    var lr = sh.getLastRow();
    var n = Math.max(0, lr - FR_HEADER_ROWS);
    var vals = n > 0 ? sh.getRange(FR_HEADER_ROWS + 1, 1, n, FR_NB_COLONNES).getValues() : [];
    var restantes = vals.filter(function (row) { return String(row[FR_COL_NOM - 1]).trim() !== nomPropre; });

    var ordreForm = Number(ordre) || 1;
    (champs || []).forEach(function (c, i) {
      if (!c || String(c.cle || "").trim() === "") return;
      var type = FR_TYPES_VALIDES.indexOf(c.type) !== -1 ? c.type : "texte";
      var options = (type === "select" && Array.isArray(c.options)) ? c.options : [];
      restantes.push([nomPropre, ordreForm, i + 1, String(c.cle).trim(), String(c.label || "").trim(), type, options.length > 0 ? JSON.stringify(options) : "", assignePropre, typePropre]);
    });
    // Formulaire sans aucun champ (valide — cf. note-panneau côté client,
    // "l'entrée s'ajoute directement en un clic, sans formulaire") : sans
    // cette ligne de secours, rien n'était écrit et le formulaire disparaissait
    // silencieusement au 1er enregistrement. Une seule ligne "porteuse"
    // (Cle/Label/Type/Options vides) suffit à faire survivre nom/ordre/assigneA.
    if (!champs || !champs.length) {
      restantes.push([nomPropre, ordreForm, 1, "", "", "", "", assignePropre, typePropre]);
    }

    if (lr > FR_HEADER_ROWS) sh.getRange(FR_HEADER_ROWS + 1, 1, lr - FR_HEADER_ROWS, FR_NB_COLONNES).clearContent();
    if (restantes.length > 0) sh.getRange(FR_HEADER_ROWS + 1, 1, restantes.length, FR_NB_COLONNES).setValues(restantes);
    SpreadsheetApp.flush();
    return apiListerFormulairesRapides();
  });
}

function apiSupprimerFormulaireRapide(nom) {
  var nomPropre = String(nom || "").trim();
  return avecVerrou_(function () {
    // creerSiAbsente = true (et non false comme avant le round "entrées
    // rapides disparues", 01.09.2026) : depuis qu'apiListerFormulairesRapides
    // peut renvoyer les 3 formulaires historiques par défaut SANS que la
    // feuille existe physiquement, supprimer l'un d'eux avant toute autre
    // écriture doit d'abord matérialiser la feuille (avec son contenu par
    // défaut) pour pouvoir ensuite en retirer la ligne demandée — sinon
    // c'était un no-op silencieux (la feuille absente ne contenait "rien à
    // supprimer", et le formulaire réapparaissait tel quel au rechargement).
    var sh = feuilleFormulairesRapides_(true);
    var lr = sh.getLastRow();
    var n = Math.max(0, lr - FR_HEADER_ROWS);
    if (n === 0) return apiListerFormulairesRapides();
    var vals = sh.getRange(FR_HEADER_ROWS + 1, 1, n, FR_NB_COLONNES).getValues();
    var restantes = vals.filter(function (row) { return String(row[FR_COL_NOM - 1]).trim() !== nomPropre; });
    sh.getRange(FR_HEADER_ROWS + 1, 1, n, FR_NB_COLONNES).clearContent();
    if (restantes.length > 0) sh.getRange(FR_HEADER_ROWS + 1, 1, restantes.length, FR_NB_COLONNES).setValues(restantes);
    SpreadsheetApp.flush();
    return apiListerFormulairesRapides();
  });
}

// ==== FÉRIÉS — feuille "Fériés" étendue (round transfert V3, §5) ====
// La feuille existe déjà dans le classeur réel (colonne A = libellé, colonne
// B = date — cf. lireFeries()/feriesMemo_ dans Planning_Format.gs, qui restent
// INCHANGÉES : elles alimentent la coloration du calendrier, continuent de
// fonctionner à l'identique, colonne Catégorie ou pas). Ce round en fait la
// source ÉDITABLE depuis l'appli (fusion des 2 systèmes déconnectés de V3,
// `FERIES` démo + `FERIES_ETAT`/page calendrier annuel) : on y AJOUTE une
// colonne C "Catégorie" (ferie | vacances_entreprise), de façon défensive —
// jamais recréée/écrasée si elle existe déjà, ajoutée avec 'ferie' comme
// valeur par défaut pour les lignes existantes sinon (cf.
// assurerColonneCategorieFeries_, appelée uniquement à l'ÉCRITURE : une
// lecture seule ne modifie jamais la feuille, cf. apiListerFeries qui
// applique le même défaut EN MÉMOIRE sans rien y écrire).
// ssConnu optionnel : cf. feuillePlanning_ (round audit perf, 02.09.2026).
function feuilleFeries_(creerSiAbsente, ssConnu) {
  var ss = ssConnu || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.FEUILLE_FERIES);
  if (sh || !creerSiAbsente) return sh || null;
  sh = ss.insertSheet(CONFIG.FEUILLE_FERIES);
  sh.getRange(1, 1, 1, 3).setValues([["Libellé", "Date", "Catégorie"]]).setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}
function assurerColonneCategorieFeries_(sh) {
  if (String(sh.getRange(1, 3).getValue()).trim() === "") sh.getRange(1, 3).setValue("Catégorie").setFontWeight("bold");
  var lr = sh.getLastRow();
  if (lr < 2) return;
  var n = lr - 1;
  var cats = sh.getRange(2, 3, n, 1).getValues();
  var toWrite = [], change = false;
  for (var i = 0; i < n; i++) {
    var v = String(cats[i][0] || "").trim();
    // Case vide = jour hérité d'avant la colonne Catégorie : "Férié" par
    // défaut, en toutes lettres (cf. libelleCategorieFerie_, round r15) —
    // jamais l'identifiant technique, la colonne reste lisible à la main.
    if (v === "") { toWrite.push([libelleCategorieFerie_("ferie")]); change = true; } else toWrite.push([v]);
  }
  if (change) sh.getRange(2, 3, n, 1).setValues(toWrite);
}
// Round du 02.09.2026 (suite, bug remonté par Lionel — cf. FRONTEND-CHANGELOG.md
// §11) : accepte aussi le séparateur "." (format suisse DD.MM.YYYY), en plus
// du "/" déjà géré — une cellule Date jamais reformatée en type Date (collée
// à la main, ou héritée d'un import) tombait sur aucun des deux avant,
// isoDeCelluleFerie_ renvoyait null, et la ligne entière devenait invisible
// pour l'appli (ni lue ni modifiable) sans message d'erreur.
// Round du 02.09.2026 (suite, r13) — VRAIE cause trouvée après élimination de
// l'hypothèse "déploiement pas à jour" : Google Sheets stocke une date comme un
// simple numéro de jour, SANS fuseau, et le convertit en objet Date avec le
// fuseau DE LA FEUILLE (ss.getSpreadsheetTimeZone()) ; alors que `isoJour(d)`
// (Planning_Format.gs) lit ce Date avec `d.getDate()/getMonth()/getFullYear()`,
// donc avec le fuseau DU SCRIPT. Si les deux fuseaux diffèrent (cas courant :
// projet Apps Script resté en fuseau américain par défaut, classeur en
// Europe/Zurich), l'instant "minuit à Zurich" se lit "22h la veille" côté
// script → toute date relue depuis la feuille recule d'un jour. Conséquence
// exacte du bug de Lionel : ce qu'il enregistre est bien écrit, mais relu
// décalé, donc l'iso renvoyé ne correspond plus à celui envoyé et le client
// conclut (à juste titre) que sa catégorie n'a pas été gardée. `tz` est donc
// désormais passé explicitement partout où l'on lit une date de CELLULE.
// Sans tz (autres appelants, tests), repli sur l'ancien comportement.
function isoDeCelluleFerie_(dv, tz) {
  if (dv instanceof Date) return tz ? Utilities.formatDate(dv, tz, "yyyy-MM-dd") : isoJour(dv);
  var s = String(dv || "").trim();
  var sep = s.indexOf("/") !== -1 ? "/" : ".";
  var parts = s.split(sep);
  if (parts.length === 3) return isoJour(new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)));
  return null;
}
function dateDepuisIso_(iso) {
  var p = String(iso || "").split("-");
  if (p.length !== 3) return null;
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}
// Date destinée à être ÉCRITE dans une cellule (même round r13) : ancrée à
// MIDI et non à minuit. Peu importe l'écart entre le fuseau du script et celui
// de la feuille (au pire ~13 h en pratique), midi reste le même jour civil des
// deux côtés — aucune écriture ne peut plus basculer sur le jour voisin.
// dateDepuisIso_ (minuit) reste inchangée : elle sert au calcul de dates pur
// (séries, décalages), jamais à écrire une date dans une cellule.
function dateCelluleFerie_(iso) {
  var p = String(iso || "").split("-");
  if (p.length !== 3) return null;
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
}
// Fuseau de la FEUILLE (celui avec lequel Sheets interprète ses propres dates).
// Défensif : un stub de test ou une feuille détachée n'a pas forcément de
// getParent()/getSpreadsheetTimeZone() — dans ce cas on renvoie null et
// isoDeCelluleFerie_ retombe sur l'ancien comportement plutôt que d'échouer.
function fuseauFeuille_(sh) {
  try { return sh.getParent().getSpreadsheetTimeZone(); } catch (e) { return null; }
}

// Round du 02.09.2026 (suite) — "le menu fériés n'est pas comme décidé lors
// de la maquette" : restauration de la 3e catégorie "Compensés" (repliée
// dans "ferie" depuis le transfert V3, cf. commentaire plus haut) — Lionel a
// confirmé vouloir les 2 écarts (3 catégories ET couleurs éditables, cf.
// FRONTEND-CHANGELOG.md). Whitelist plutôt que ternaire à 2 branches : seul
// point qui connaît la liste des catégories valides, réutilisé par
// apiListerFeries/apiEnregistrerFeries ET par la nouvelle feuille
// "Catégories fériés" ci-dessous — une valeur inconnue (feuille corrompue à
// la main, ancienne donnée) retombe sur "ferie", jamais bloquant.
var CATEGORIES_FERIES_IDS = ["ferie", "vacances_entreprise", "compenses"];

// ---- Round r15 (02.09.2026) : LA cause du "tout devient rouge" -----------
// La colonne "Catégorie" de la feuille "Fériés" est remplie À LA MAIN par
// Lionel depuis bien avant cette appli — cf. v2-backend-inventory.md, §feuille
// "Fériés" : « Col C = catégorie visuelle libre ajoutée par Lionel (Compensés
// / Fériés / Vacances) ». Ce sont donc des libellés FRANÇAIS, avec accents,
// majuscules et pluriels — jamais les identifiants techniques. La whitelist
// stricte ci-dessus ne reconnaissait aucun d'eux et les renvoyait tous sur
// "ferie" : d'où un calendrier entièrement rouge, ses vacances d'entreprise et
// ses compensés écrasés à chaque relecture. Ce n'était pas l'enregistrement
// qui perdait la catégorie, c'était la LECTURE qui ne savait pas la lire.
//
// La lecture accepte donc maintenant, en plus des 3 identifiants : les
// libellés français, sans accents, sans casse, au singulier comme au pluriel,
// et les quelques variantes qu'on trouve naturellement dans une colonne
// tapée à la main. Tout ce qui reste inconnu retombe sur "ferie" comme avant
// (jamais bloquant).
function sansAccents_(s) {
  return String(s || "")
    .replace(/[àáâä]/g, "a").replace(/[éèêë]/g, "e").replace(/[íìîï]/g, "i")
    .replace(/[óòôö]/g, "o").replace(/[úùûü]/g, "u").replace(/ç/g, "c");
}
var SYNONYMES_CATEGORIES_FERIES = {
  "ferie": "ferie", "feries": "ferie", "jour ferie": "ferie", "jours feries": "ferie",
  "vacances_entreprise": "vacances_entreprise", "vacances": "vacances_entreprise",
  "vacance": "vacances_entreprise", "vacances entreprise": "vacances_entreprise",
  "vacances d'entreprise": "vacances_entreprise", "vacances entreprises": "vacances_entreprise",
  "entreprise": "vacances_entreprise",
  "compenses": "compenses", "compense": "compenses", "compensation": "compenses",
  "compensations": "compenses", "recuperation": "compenses", "recup": "compenses"
};
function normaliserCategorieFerie_(cat) {
  var c = sansAccents_(String(cat || "").trim().toLowerCase());
  if (CATEGORIES_FERIES_IDS.indexOf(c) !== -1) return c;
  return SYNONYMES_CATEGORIES_FERIES[c] || "ferie";
}
// Ce qu'on ÉCRIT dans la colonne C : le libellé français, pas l'identifiant
// technique. La feuille reste lisible et modifiable à la main par Lionel
// exactement comme avant l'appli (c'est lui qui l'entretient depuis des
// années) ; la relecture, elle, passe par normaliserCategorieFerie_ ci-dessus
// qui accepte les deux formes.
// Table LOCALE et non un renvoi vers CATEGORIES_FERIES_NOMS_DEFAUT : cette
// constante globale pourrait elle aussi être écrasée par un autre fichier .gs
// du projet (cf. r16), ce qui ferait écrire une cellule VIDE sans la moindre
// erreur. Une fonction qui ne dépend de rien d'extérieur ne peut pas tomber
// dans ce piège.
// Round r18 : ceinture ET bretelles. Quoi qu'il arrive en amont (normalisation
// inattendue, table introuvable, valeur exotique), cette fonction ne peut plus
// renvoyer ni "", ni undefined, ni null — le dernier repli est l'identifiant
// brut reçu, puis "Férié". Une cellule "Catégorie" vide dans la feuille est
// précisément le symptôme observé chez Lionel ; quelle qu'en soit la cause,
// elle ne peut plus venir d'ici.
function libelleCategorieFerie_(id) {
  var noms = { ferie: "Férié", vacances_entreprise: "Vacances entreprise", compenses: "Compensés" };
  var brut = String(id == null ? "" : id).trim();
  var trouve;
  try { trouve = noms[normaliserCategorieFerie_(id)]; } catch (e) { trouve = null; }
  return trouve || noms[brut] || (brut !== "" ? brut : null) || "Férié";
}

// ---- Round r16/r17 : NOMS BLINDÉS (par précaution, PAS par diagnostic) ---
// Le diagnostic r15 sur le classeur de Lionel a montré :
//
//     aller-retour réel : envoyé vacances_entreprise -> revenu ferie
//     cellule catégorie écrite = ""
//
// La catégorie ressort VIDE de la feuille alors que ce fichier écrit toujours
// les 3 colonnes d'un bloc. J'en ai déduit qu'une ancienne copie
// d'`apiEnregistrerFeries` vivait dans son `Code.gs` et écrasait celle-ci
// (tous les fichiers .gs d'un projet partagent un seul espace de noms, la
// dernière définition chargée gagne en silence).
//
// CETTE DÉDUCTION S'EST RÉVÉLÉE FAUSSE : Lionel a envoyé `Code.gs` en entier,
// et il ne contient AUCUNE fonction fériés — c'est exactement le moteur de
// mise en forme (CONFIG, formaterPlanning, imprimerSemaine, lireFeries,
// isoJour, detecterPersonnes…), c'est-à-dire l'ancien `Planning_Format.gs`,
// dont la liste correspond exactement aux identifiants signalés comme
// "non déclarés" par acorn-globals sur WebApp.gs. Aucun doublon, rien à
// supprimer chez lui.
//
// Le renommage est néanmoins CONSERVÉ : il ne coûte rien, il protège
// réellement contre cette classe de panne (un projet Apps Script à plusieurs
// fichiers reste exposé), et il rend le circuit fériés indépendant de tout
// nom partagé. Mais il ne faut pas lui attribuer la correction du bug tant
// que la vraie cause n'est pas établie — d'où le diagnostic r17 ci-dessus,
// qui isole enfin `libelleCategorieFerie_` elle-même.
function listerFeriesV3_(ss) {
  var sh = feuilleFeries_(false, ss);
  if (!sh) return [];
  var lr = sh.getLastRow();
  if (lr < 2) return [];
  var n = lr - 1;
  var vals = sh.getRange(2, 1, n, 3).getValues(); // col C peut ne pas exister -> ""
  var tz = fuseauFeuille_(sh); // cf. isoDeCelluleFerie_ (round r13, décalage de fuseau)
  var out = [];
  for (var i = 0; i < n; i++) {
    var libelle = String(vals[i][0]).trim();
    var iso = isoDeCelluleFerie_(vals[i][1], tz);
    if (libelle === "" || !iso) continue;
    out.push({ iso: iso, libelle: libelle, categorie: normaliserCategorieFerie_(vals[i][2]) });
  }
  return out;
}

// Alias historique : conservé pour tout appelant existant. S'il se fait
// écraser par une autre définition du projet, plus aucune importance — le
// client n'appelle plus ce nom (cf. r16 ci-dessus).
function apiListerFeries(ss) { return listerFeriesV3_(ss); }

// ---- Round r19 : LA CAUSE, enfin — des cellules FUSIONNÉES en colonne C ---
// Diagnostic r17 sur le classeur de Lionel :
//     libelle(vacances_entreprise)="Vacances entreprise"   <- la fonction est bonne
//     ligne écrite [A="TEST DIAGNOSTIC" | B=<date ok> | C=""]   <- A et B passent, C non
// Une seule mécanique de Sheets produit ça : dans une plage FUSIONNÉE, seule
// la cellule d'ANCRAGE reçoit la valeur écrite ; les cellules "couvertes"
// ignorent setValues() SANS ERREUR et se relisent vides. Une fusion verticale
// dans la colonne "Catégorie" rend donc l'écriture de la catégorie sans effet
// sur toutes les lignes qu'elle couvre — alors que Libellé (A) et Date (B),
// hors fusion, s'écrivent normalement.
//
// Ça explique aussi le détail que Lionel a repéré de lui-même, et qui a
// emporté le diagnostic : "1 case reste en vert" — le 20 juillet d'abord,
// puis le 8 janvier après avoir tout refait. C'est à chaque fois le DERNIER
// jour cliqué : les nouvelles lignes sont ajoutées à la fin, donc la dernière
// tombe APRÈS la zone fusionnée et reçoit bien sa catégorie. Toutes les
// autres, couvertes, la perdent. Un seul survivant, et il se déplace avec la
// saisie : signature exacte d'une fusion, impossible à confondre.
//
// Défusionne la zone de données (colonnes A à C) avant chaque lecture/écriture.
// Sans perte : défusionner conserve la valeur de la cellule d'ancrage, et les
// cellules couvertes étaient déjà vides. Idempotent (aucune fusion -> ne fait
// rien), donc sans effet une fois la feuille assainie.
function defusionnerZoneFeries_(sh) {
  try {
    var lr = Math.max(sh.getLastRow(), 2);
    var fusions = sh.getRange(1, 1, lr, 3).getMergedRanges();
    for (var i = 0; i < fusions.length; i++) {
      try { fusions[i].breakApart(); } catch (e) {}
    }
    return fusions.length;
  } catch (e) {
    return 0; // jamais bloquant : au pire on retombe sur le comportement précédent
  }
}

// modifs/nouveaux/supprimes = items {iso, libelle, categorie} (supprimes =
// tableau d'iso). Matché par ISO (calculé depuis la date ACTUELLEMENT en
// feuille) plutôt que par ligne : la date d'un jour férié n'est en pratique
// jamais éditée depuis l'UI (renommer une date = supprimer + recréer, via
// supprimes+nouveaux) — seuls le libellé et la catégorie le sont.
function enregistrerFeriesV3_(modifs, nouveaux, supprimes) {
  return avecVerrou_(function () {
    var sh = feuilleFeries_(true);
    // AVANT toute lecture/écriture (round r19) : cf. defusionnerZoneFeries_.
    // Une cellule couverte par une fusion IGNORE silencieusement setValues()
    // et se relit vide — c'est la cause du bug, prouvée par le diagnostic r17
    // ([A="TEST DIAGNOSTIC" | B=<date> | C=""] : A et B écrits, C non).
    defusionnerZoneFeries_(sh);
    assurerColonneCategorieFeries_(sh);
    var lr = sh.getLastRow();
    var n = Math.max(0, lr - 1);
    var vals = n > 0 ? sh.getRange(2, 1, n, 3).getValues() : [];

    var tz = fuseauFeuille_(sh); // cf. isoDeCelluleFerie_ (round r13, décalage de fuseau)
    var index = {};
    for (var i = 0; i < vals.length; i++) {
      var iso = isoDeCelluleFerie_(vals[i][1], tz);
      if (iso) index[iso] = i;
    }

    (modifs || []).forEach(function (m) {
      if (!m || !m.iso) return;
      var i = index[m.iso];
      if (i === undefined) return; // iso inconnu (feuille changée entre-temps) : ignoré, jamais bloquant
      if (m.libelle != null && String(m.libelle).trim() !== "") vals[i][0] = String(m.libelle).trim();
      if (m.categorie != null) vals[i][2] = libelleCategorieFerie_(m.categorie); // libellé français, cf. r15
    });

    var aSupprimer = {};
    (supprimes || []).forEach(function (iso) {
      var i = index[iso];
      if (i !== undefined) aSupprimer[i] = true;
    });
    var restants = vals.filter(function (row, i) { return !aSupprimer[i]; });

    (nouveaux || []).forEach(function (nv) {
      if (!nv || !nv.iso) return;
      var d = dateCelluleFerie_(nv.iso); // midi, jamais minuit — cf. dateCelluleFerie_ (round r13)
      if (!d) return;
      restants.push([String(nv.libelle || "").trim(), d, libelleCategorieFerie_(nv.categorie)]); // libellé français, cf. r15
    });

    if (lr > 1) sh.getRange(2, 1, lr - 1, 3).clearContent();
    if (restants.length > 0) {
      sh.getRange(2, 1, restants.length, 3).setValues(restants);
      // Les dates sont écrites à midi (cf. dateCelluleFerie_) : sans format
      // explicite, une cellule neuve s'afficherait "20.07.2026 12:00". Format
      // jour seul = affichage identique à avant pour Lionel.
      sh.getRange(2, 2, restants.length, 1).setNumberFormat("dd.MM.yyyy");
    }
    SpreadsheetApp.flush();
    _memoFeries = null; // le mémo de requête (feriesMemo_) doit refléter ce qu'on vient d'écrire
    return listerFeriesV3_(); // jamais apiListerFeries : ce nom-là peut être écrasé (cf. r16)
  });
}
// Point d'entrée appelé par le client (nom neuf, non écrasable) + alias
// historique qui délègue, pour tout appelant existant. Cf. r16.
function apiEnregistrerFeriesV3(modifs, nouveaux, supprimes) { return enregistrerFeriesV3_(modifs, nouveaux, supprimes); }
function apiEnregistrerFeries(modifs, nouveaux, supprimes) { return enregistrerFeriesV3_(modifs, nouveaux, supprimes); }

// ==== FEUILLE DE CONFIG "Catégories fériés" (round du 02.09.2026, suite —
// restauration des couleurs éditables par catégorie, 2e des 2 écarts
// confirmés par Lionel avec la maquette d'origine). Même esprit que
// "Statuts" : 1 ligne d'en-tête, une ligne par catégorie (3, dans l'ordre de
// la maquette — point 104 du spec, prototype-bulles.html : Vacances, Férié,
// Compensés). Seule la couleur est éditable depuis l'appli (cf.
// apiEnregistrerCategoriesFeries) — les 3 catégories elles-mêmes sont fixes
// (même contrat que la colonne "Catégorie" de la feuille "Fériés" ci-dessus,
// cf. CATEGORIES_FERIES_IDS) : pas de renommage/ajout/suppression de
// catégorie depuis l'appli, seulement sa teinte.
var FEUILLE_CATEGORIES_FERIES = "Catégories fériés";
var CATEGORIE_FERIES_HEADER_ROWS = 1;
var CATEGORIES_FERIES_ORDRE_DEFAUT = ["vacances_entreprise", "ferie", "compenses"];
var CATEGORIES_FERIES_NOMS_DEFAUT = {
  vacances_entreprise: "Vacances entreprise",
  ferie: "Férié",
  compenses: "Compensés"
};
// vacances_entreprise/ferie : mêmes teintes pastel que celles déjà validées
// par Lionel en usage réel (COULEUR_VACANCES_ENTREPRISE/COULEUR_FERIE, cf.
// Index.html) — aucun changement visuel par défaut pour ces 2-là. compenses
// (nouvelle) reçoit une 3e teinte pastel de la même famille ; Lionel peut la
// changer depuis l'appli dès la restauration de ce round.
var CATEGORIES_FERIES_COULEUR_DEFAUT = {
  vacances_entreprise: "#a9c6ea",
  ferie: "#e8a3a3",
  compenses: "#e8dba3"
};

// creerSiAbsente=false (lecture) : ne JAMAIS créer la feuille en effet de
// bord d'une simple lecture — seule une écriture explicite
// (apiEnregistrerCategoriesFeries) la crée, au tout premier besoin réel.
// ssConnu optionnel : cf. feuillePlanning_ (round audit perf, 02.09.2026).
function feuilleCategoriesFeries_(creerSiAbsente, ssConnu) {
  var ss = ssConnu || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FEUILLE_CATEGORIES_FERIES);
  if (sh || !creerSiAbsente) return sh || null;
  sh = ss.insertSheet(FEUILLE_CATEGORIES_FERIES);
  sh.getRange(1, 1, 1, 3).setValues([["Clé", "Nom affiché", "Couleur"]]).setFontWeight("bold");
  var lignes = CATEGORIES_FERIES_ORDRE_DEFAUT.map(function (id) {
    return [id, CATEGORIES_FERIES_NOMS_DEFAUT[id], CATEGORIES_FERIES_COULEUR_DEFAUT[id]];
  });
  sh.getRange(2, 1, lignes.length, 3).setValues(lignes);
  sh.setColumnWidths(1, 3, 140);
  sh.setFrozenRows(1);
  return sh;
}

// [{id, nom, couleur}], dans l'ordre de la feuille. Ne crée jamais la
// feuille (cf. feuilleCategoriesFeries_) : tant qu'elle n'existe pas, ou
// existe mais est vide, les 3 valeurs par défaut font office de contenu —
// jamais de planning qui se retrouve avec des pilules fériés sans couleur.
// ss optionnel : cf. feuillePlanning_ — apiDemarrer le passe pour réutiliser
// le classeur déjà en main (couleurs render-critical pour la teinte des
// cases fériés de la grille, au même titre que statuts/feries).
function apiListerCategoriesFeries(ss) {
  var defaut = CATEGORIES_FERIES_ORDRE_DEFAUT.map(function (id) {
    return { id: id, nom: CATEGORIES_FERIES_NOMS_DEFAUT[id], couleur: CATEGORIES_FERIES_COULEUR_DEFAUT[id] };
  });
  var sh = feuilleCategoriesFeries_(false, ss);
  if (!sh) return defaut;
  var lr = sh.getLastRow();
  if (lr <= CATEGORIE_FERIES_HEADER_ROWS) return defaut;
  var n = lr - CATEGORIE_FERIES_HEADER_ROWS;
  var vals = sh.getRange(CATEGORIE_FERIES_HEADER_ROWS + 1, 1, n, 3).getValues();
  var out = [], vues = {};
  for (var i = 0; i < n; i++) {
    var id = normaliserCategorieFerie_(vals[i][0]);
    if (vues[id]) continue; // ligne corrompue/dupliquée : la 1re occurrence gagne, jamais 2 pilules identiques
    vues[id] = true;
    var nom = String(vals[i][1] || "").trim() || CATEGORIES_FERIES_NOMS_DEFAUT[id] || id;
    var couleur = estCouleurHex_(vals[i][2]) ? vals[i][2] : (CATEGORIES_FERIES_COULEUR_DEFAUT[id] || "#e5e5e5");
    out.push({ id: id, nom: nom, couleur: couleur });
  }
  if (out.length === 0) return defaut;
  return out;
}

// couleurs:[{id, couleur}] — seule la couleur est éditable (cf. commentaire
// plus haut) ; toute entrée à id inconnu, ou couleur invalide, est ignorée
// (jamais bloquant, même logique que apiEnregistrerStatuts).
function apiEnregistrerCategoriesFeries(couleurs) {
  return avecVerrou_(function () {
    var sh = feuilleCategoriesFeries_(true); // crée avec le contenu par défaut au tout premier besoin réel
    var lr = sh.getLastRow();
    var n = Math.max(0, lr - CATEGORIE_FERIES_HEADER_ROWS);
    var vals = n > 0 ? sh.getRange(CATEGORIE_FERIES_HEADER_ROWS + 1, 1, n, 3).getValues() : [];

    var index = {};
    for (var i = 0; i < vals.length; i++) {
      var id = normaliserCategorieFerie_(vals[i][0]);
      if (index[id] === undefined) index[id] = i; // 1re occurrence, cf. apiListerCategoriesFeries
    }

    (couleurs || []).forEach(function (c) {
      if (!c || !c.id || !estCouleurHex_(c.couleur)) return;
      var i = index[normaliserCategorieFerie_(c.id)];
      if (i === undefined) return;
      vals[i][2] = c.couleur;
    });

    if (vals.length > 0) sh.getRange(CATEGORIE_FERIES_HEADER_ROWS + 1, 1, vals.length, 3).setValues(vals);
    SpreadsheetApp.flush();
    return apiListerCategoriesFeries();
  });
}

var MOIS_ABBR_WEB = ["", "jan.", "fév.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// Charge une semaine entière (jalons, notes, personnel) pour l'appli.
// labG = colonne label de la semaine (cf. apiListerSemaines(), déjà dans
// Planning_Format.gs et réutilisée telle quelle pour la navigation — elle
// gère déjà correctement le cas d'un même n° de semaine sur deux années).
//
// PERFORMANCE : les lignes 2 à 5 (n° de semaine, dates, jalons, notes) sont
// lues en UN SEUL appel au lieu de quatre, et toute la zone personnel en un
// autre — même principe que le reste du projet (cf. note PERFORMANCE en tête
// de Planning_Format.gs : un appel API coûte cher quelle que soit la
// quantité de données).
function apiChargerSemaine(labG) {
  var sh = feuillePlanning_();
  var lc = sh.getLastColumn(), lr = sh.getLastRow();
  return chargerSemaine_(sh, labG, lc, lr, detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr));
}

// Cœur de la lecture d'une semaine, à qui l'on PASSE ce que l'appelant connaît
// déjà (la feuille, ses dimensions, et surtout le découpage en blocs
// "personne"). Toutes les fonctions d'écriture ci-dessous ont justement dû
// calculer tout ça pour faire leur travail : sans ce découpage, chacune
// terminait par un apiChargerSemaine() qui refaisait getLastRow +
// getLastColumn + detecterPersonnes (soit 4 appels Sheets) pour retrouver
// exactement ce qu'elle avait sous la main.
//
// À n'utiliser QUE si `pers` est encore valide après l'écriture : c'est le cas
// dès lors que seules des VALEURS ont changé (case, chantier de groupe,
// renommage — le nom affiché est relu ici depuis la feuille, jamais depuis
// pers[].nom). Une écriture qui insère ou décale des lignes doit, elle,
// repasser par apiChargerSemaine() pour redétecter la structure.
function chargerSemaine_(sh, labG, lc, lr, pers) {
  // largeurEntete va désormais jusqu'à 8 (colonne label + 5 jours ouvrés + les
  // 2 colonnes week-end fusionnées) — round transfert V3, §2 : jj=6 (Samedi,
  // colonne physique porteuse de la valeur) et jj=7 (Dimanche, fait partie de
  // la même fusion, toujours vide en lecture) étaient jusqu'ici ignorées.
  var largeurEntete = Math.min(8, lc - labG + 1);
  var entete = sh.getRange(2, labG, 4, largeurEntete).getValues(); // lignes 2,3,4,5

  var numero = String(v_(entete[0], 1)).trim();
  var dates = [], mois = [], isoDates = [];
  for (var j = 0; j < 5; j++) {
    var v = v_(entete[1], j + 1);
    if (v instanceof Date) {
      dates.push((v.getDate() < 10 ? "0" : "") + v.getDate());
      mois.push(MOIS_ABBR_WEB[v.getMonth() + 1]);
      isoDates.push(isoJour(v)); // sert au client à repérer la colonne d'aujourd'hui
    } else { dates.push(""); mois.push(""); isoDates.push(""); }
  }
  // Dates ISO du Samedi et du Dimanche (undefined -> "" si la semaine n'a pas
  // ces colonnes, fin de feuille) — additif par rapport au contrat minimal :
  // nécessaire pour que le client puisse construire ses appels
  // apiEnregistrerCellulePersonne(..., 6/7, ...) et les dates de départ d'une
  // série sur le week-end sans avoir à recalculer le calendrier lui-même.
  var weekendDates = [largeurEntete >= 7 && v_(entete[1], 6) instanceof Date ? isoJour(v_(entete[1], 6)) : "",
                       largeurEntete >= 8 && v_(entete[1], 7) instanceof Date ? isoJour(v_(entete[1], 7)) : ""];

  function texteLigne(ligne) {
    var out = [];
    for (var k = 1; k <= 5; k++) out.push(String(v_(ligne, k)).trim());
    return out;
  }

  var personnes = [];
  if (pers.length > 0) {
    var r1 = pers[0].startRow, r2 = pers[pers.length - 1].endRow;
    var zVals = sh.getRange(r1, labG, r2 - r1 + 1, largeurEntete).getValues();

    for (var p = 0; p < pers.length; p++) {
      var bloc = pers[p];
      var iAncre = bloc.startRow - r1;
      var nomBrut = String(v_(zVals[iAncre], 0)).trim();
      if (nomBrut === "") continue; // rien à cette ligne pour CETTE semaine précisément
      var decNom = decoderNom_(nomBrut, bloc.startRow);

      var out = { ancre: bloc.startRow, nom: decNom.nom, sousTraitant: decNom.sousTraitant, matin: [], aprem: [] };
      ["matin", "aprem"].forEach(function (demi, di) {
        var iC = iAncre + di * 2, iD = iC + 1;
        for (var jj = 1; jj <= 5; jj++) {
          var chantier = String(v_(zVals[iC], jj)).trim();
          out[demi].push({ chantier: chantier || null, taches: decoderTaches_(v_(zVals[iD], jj)) });
        }
      });
      // Week-end (jour 6=Samedi, jour 7=Dimanche) : UNE seule cellule
      // physique par personne (jj=6, l'ancre du bloc fusionné — cf. note en
      // tête de "CELLULE WEEK-END" plus haut), scindée en 2 entrées {chantier,
      // taches} par tag [S]/[D]/sans-tag. Absent de la semaine (fin de
      // feuille, largeurEntete < 7) -> 2 entrées vides, jamais d'erreur.
      var brutWE = (largeurEntete >= 7) ? v_(zVals[iAncre], 6) : "";
      var lignesWE = decoderCelluleWeekend_(brutWE);
      out.weekend = [vueJourWeekend_(lignesWE, "S"), vueJourWeekend_(lignesWE, "D")];
      personnes.push(out);
    }
  }

  return {
    labG: labG, numero: numero, dates: dates, mois: mois, isoDates: isoDates, weekendDates: weekendDates,
    // jalons : une case = UNE valeur unique (texte, éventuellement précédé
    // d'un tag [Série:xxxxxx] — round "idem pour les modifications de
    // série", 01.09.2026), contrairement aux notes ci-dessous qui admettent
    // plusieurs entrées indépendantes par case. decoderLigneTache_ décode ce
    // texte unique (statut/important ignorés en pratique pour un jalon,
    // aucun des 2 n'étant jamais posé par apiEnregistrerJalonNote/
    // apiEnregistrerPlage) -> {texte, serieId} par jour. AVANT ce correctif,
    // ce champ était renvoyé tel quel (chaîne brute jamais décodée) : un
    // jalon issu d'une série affichait donc littéralement son tag
    // "[Série:xxxxxx]" en texte visible, et perdait tout lien avec sa série
    // dès le rechargement de la page (rien ne portait le serieId côté
    // client). Cf. BACKEND-CHANGELOG.md.
    jalons: texteLigne(entete[2]).map(function (s) {
      var d = decoderLigneTache_(s);
      // Pas de demi-journée pour un JALON (precision de Lionel, 02.09.2026 :
      // "pour les jalons pas de demi-journee, pour les notes par contre
      // j'aimerais pouvoir le mettre en demi-journee"). Le decodeur sait
      // toujours reconnaitre une etiquette [M]/[A] — un vieux jalon qui en
      // porterait une verrait donc son texte nettoye plutot que l'etiquette
      // affichee telle quelle — mais elle n'est jamais ecrite ni remontee au
      // client pour un jalon.
      return { texte: d.texte, serieId: d.serieId };
    }),
    // notes : une case peut contenir plusieurs notes indépendantes (round du
    // 28.08.2026) -> liste d'entrées {texte, important} par jour, au lieu
    // d'une simple chaîne.
    notes: texteLigne(entete[3]).map(decoderNotesJour_),
    personnes: personnes
  };
}

// ==== CRÉATION AUTOMATIQUE DES SEMAINES MANQUANTES ====
//
// Le planning doit toujours avoir SEMAINES_AVANCE semaines devant lui. C'est
// vérifié à chaque ouverture de l'appli (apiDemarrer) ; en régime normal il
// n'y a rien à faire, ou une seule semaine à créer.
//
// Plafond de sécurité : sur un planning laissé de côté plusieurs mois, on ne
// crée pas trente semaines d'un coup — au maximum MAX_CREATIONS par ouverture,
// et le rattrapage se fait sur quelques ouvertures. L'appli le signale.
var SEMAINES_AVANCE = 5;
var MAX_CREATIONS_PAR_OUVERTURE = 6;

// Numéro de semaine ISO d'une date — même formule que le sélecteur de semaine
// du dialogue desktop (semIso, cf. htmlSelecteurSemaine dans Planning_Format.gs).
function numeroSemaineIso_(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7)); // jeudi de la même semaine
  var j4 = new Date(x.getFullYear(), 0, 4);
  return 1 + Math.round(((x - j4) / 86400000 - 3 + ((j4.getDay() + 6) % 7)) / 7);
}
function lundiDe_(iso) {
  var p = String(iso).split("-");
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * Crée la semaine suivante — VERSION SANS INTERFACE de creerSemaine()
 * (Planning_Format.gs), qui ne peut pas être appelée depuis une appli web :
 * elle commence par SpreadsheetApp.getUi(), interdit hors d'un clic de menu.
 *
 * ⚠️ SI TU MODIFIES creerSemaine(), PENSE À REGARDER ICI AUSSI — les deux
 * font la même chose et doivent produire exactement la même semaine.
 *
 * Une seule différence assumée, et c'est une correction : le numéro de la
 * nouvelle semaine est déduit de la DATE de la dernière semaine (+7 jours,
 * puis numéro ISO) au lieu de « dernier numéro + 1 » combiné à l'année
 * courante. À cheval sur deux années, l'original pouvait retomber en janvier
 * de l'année en cours ; ça ne se voyait pas en usage manuel (une semaine à la
 * fois), ça se verrait tout de suite ici où l'on peut en enchaîner plusieurs.
 *
 * Ne formate pas : l'appelant lance formaterPlanning(true) UNE fois à la fin,
 * même s'il crée plusieurs semaines (c'est de loin l'étape la plus coûteuse).
 *
 * shConnue optionnel : cf. feuillePlanning_ (round audit perf, 02.09.2026) —
 * les 3 appelants (assurerSemainesAvance_, apiEnregistrerSerie,
 * calculerPlanDecalage_) ont chacun déjà leur `sh` en main au moment de
 * l'appel, potentiellement dans une boucle de plusieurs itérations : refaire
 * la recherche à chaque itération n'aurait aucun sens.
 */
function creerSemaineWeb_(shConnue) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = shConnue || feuillePlanning_(ss);
  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();

  var semaines = listerSemainesPlanning(sh);
  if (semaines.length === 0) throw new Error("Aucune semaine existante : impossible d'en déduire la suivante.");
  var dernier = semaines[semaines.length - 1].dateDebut;

  var lundi = new Date(dernier.getFullYear(), dernier.getMonth(), dernier.getDate() + 7);
  var numSem = numeroSemaineIso_(lundi);
  var jours = [];
  for (var d = 0; d < 7; d++) jours.push(new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + d));

  var insertCol = isLabelCol(lastCol) ? lastCol : lastCol + 1;
  sh.insertColumnsAfter(insertCol - 1, 8);

  var NM = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var feries = lireFeries(ss);
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lastRow);

  var labelCol = insertCol;
  var prevLabelCol = insertCol - 8; // la semaine précédente n'a pas bougé : les colonnes ont été insérées APRÈS elle
  var nbLignesPerso = lastRow - CONFIG.PREMIERE_LIGNE_PERSO + 1;
  var nomsSource = (prevLabelCol >= 1 && nbLignesPerso > 0)
    ? sh.getRange(CONFIG.PREMIERE_LIGNE_PERSO, prevLabelCol, nbLignesPerso, 1).getValues()
    : [];

  // Lignes 4 (jalons) et 5 (notes) laissées vides — elles se remplissent à la main.
  var entete = [];
  for (var l = 0; l < 5; l++) { var lg = []; for (var dd = 0; dd < 8; dd++) lg.push(""); entete.push(lg); }
  entete[0][0] = "Mois"; entete[1][0] = "Sem"; entete[2][0] = "Date";

  var fonds = [];
  for (var r = 0; r < lastRow; r++) { var lf = []; for (var dd2 = 0; dd2 < 8; dd2++) lf.push(CONFIG.BLANC); fonds.push(lf); }

  var notesDates = [[]];
  for (var dj = 0; dj < 7; dj++) {
    var jour = jours[dj], jourSem = jour.getDay();
    entete[0][dj + 1] = NM[jour.getMonth() + 1];
    entete[1][dj + 1] = numSem;
    entete[2][dj + 1] = jour;
    sh.setColumnWidth(insertCol + 1 + dj, (jourSem === 0 || jourSem === 6) ? CONFIG.LARGEUR_WEEKEND : CONFIG.LARGEUR_DATE);
    var dk = fmtDK(jour);
    notesDates[0].push(feries[dk] ? feries[dk].label : "");
  }

  sh.setColumnWidth(labelCol, CONFIG.LARGEUR_LABEL_DATE);
  sh.getRange(1, insertCol, lastRow, 8).setBackgrounds(fonds);
  sh.getRange(1, insertCol, 5, 8).setValues(entete);
  sh.getRange(3, insertCol + 1, 1, 7).setNumberFormat("dd").setNotes(notesDates);

  if (nomsSource.length > 0) {
    sh.getRange(CONFIG.PREMIERE_LIGNE_PERSO, labelCol, nomsSource.length, 1).setValues(nomsSource);
    for (var p = 0; p < pers.length; p++) {
      if (pers[p].nom !== "" && pers[p].endRow > pers[p].startRow)
        sh.getRange(pers[p].startRow, labelCol, pers[p].endRow - pers[p].startRow + 1, 1).merge();
    }
  }

  // Les CHANTIERS ne sont volontairement PAS repris de la semaine précédente
  // (demande de Lionel, 27.08.2026) : une nouvelle semaine arrive vierge, on
  // n'y trouve que les noms. Seul creerSemaine() au menu les recopie encore.

  // RÉCURRENCES (demande de Lionel, 27.08.2026) : applique tout de suite les
  // tâches récurrentes actives à cette nouvelle semaine (jalon/note/personne
  // qui reviennent chaque semaine, cf. section RÉCURRENCES plus bas). En
  // best-effort : un souci ici ne doit jamais empêcher la création de la
  // semaine elle-même — au pire elle arrive sans, et on le verra au pire
  // rater silencieusement plutôt que de bloquer creerSemaine().
  try {
    var recsActives = apiListerRecurrences().filter(function (r) { return r.actif; });
    recsActives.forEach(function (r) { appliquerRecurrenceSurSemaine_(sh, r, labelCol); });
  } catch (exRec) { /* silencieux, cf. commentaire ci-dessus */ }

  sh.getRange(1, insertCol, 5, 8).setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(1, labelCol, lastRow, 1).setBorder(null, true, null, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange(4, insertCol, 1, 8).setBackground(CONFIG.GRIS_JALONS);
  sh.getRange(CONFIG.LIGNE_NOTES, insertCol, 1, 8).setBackground(CONFIG.JAUNE_NOTES);
  sh.getRange(1, insertCol, 3, 8).setHorizontalAlignment("center").setVerticalAlignment("middle");

  var moisStart = 0;
  for (var dm = 1; dm <= 7; dm++) {
    if (dm === 7 || jours[dm].getMonth() !== jours[moisStart].getMonth()) {
      var sc = insertCol + 1 + moisStart, nb = dm - moisStart;
      if (nb > 1) try { sh.getRange(1, sc, 1, nb).merge(); } catch (ex) {}
      moisStart = dm;
    }
  }
  try { sh.getRange(2, insertCol + 1, 1, 7).merge(); } catch (ex) {}

  // PAS de flush() ici (retiré au round audit perf, 02.09.2026) : les 3
  // appelants (assurerSemainesAvance_, apiEnregistrerSerie,
  // calculerPlanDecalage_) invoquent tous cette fonction dans une boucle
  // pouvant aller jusqu'à plusieurs dizaines d'itérations (une série longue,
  // en particulier — jusqu'à SERIE_MAX_SEMAINES_CREEES=60) ; un flush par
  // semaine créée forçait jusqu'à 60 synchronisations pour une seule
  // opération, alors qu'au sein d'une même exécution Apps Script les lectures
  // suivantes (getLastColumn/getRange().getValues()) voient déjà les
  // écritures non flushées de ce même script. Chacun des 3 appelants flushe
  // déjà lui-même après SA boucle (directement, ou via formaterPlanning(true)
  // qui flushe en interne) — rien n'est perdu, seulement regroupé.
  return { num: String(numSem), labG: labelCol, debut: isoJour(jours[0]) };
}

// Complète le planning pour qu'il ait toujours SEMAINES_AVANCE semaines
// APRÈS la semaine en cours. Sur un planning en retard, les premières
// semaines créées servent d'abord à rattraper le présent : on continue tant
// que le compte de semaines réellement à venir n'y est pas (dans la limite
// du plafond).
// shConnue optionnel : cf. feuillePlanning_/creerSemaineWeb_ (round audit
// perf, 02.09.2026) — apiDemarrer, seul appelant, a déjà sa feuille en main.
function assurerSemainesAvance_(isoAujourdhui, shConnue) {
  var sh = shConnue || feuillePlanning_();
  var semaines = listerSemainesPlanning(sh);
  if (semaines.length === 0) return { creees: 0, incomplet: false };

  var isoLundiCourant = isoJour(lundiDe_(isoAujourdhui));
  var futures = 0;
  for (var i = 0; i < semaines.length; i++) if (isoJour(semaines[i].dateDebut) > isoLundiCourant) futures++;
  if (futures >= SEMAINES_AVANCE) return { creees: 0, incomplet: false };

  var dernierLundi = semaines[semaines.length - 1].dateDebut;
  var creees = 0, nums = [];
  while (futures < SEMAINES_AVANCE && creees < MAX_CREATIONS_PAR_OUVERTURE) {
    var r = creerSemaineWeb_(sh);
    creees++; nums.push(r.num);
    dernierLundi = new Date(dernierLundi.getFullYear(), dernierLundi.getMonth(), dernierLundi.getDate() + 7);
    if (isoJour(dernierLundi) > isoLundiCourant) futures++;
  }
  if (creees > 0) formaterPlanning(true); // UNE seule passe de mise en forme pour toutes les semaines créées
  return { creees: creees, numeros: nums, incomplet: futures < SEMAINES_AVANCE };
}

// ==== DÉMARRAGE : tout ce dont l'appli a besoin en UN SEUL aller-retour ====
// Avant, l'ouverture enchaînait 3 appels google.script.run (liste des
// semaines, liste des chantiers, puis chargement de la semaine) — soit 3
// allers-retours réseau, chacun avec le coût de démarrage d'Apps Script.
// C'est ce qui rendait l'ouverture lente ; tout est désormais regroupé ici.
//
// La semaine ouverte par défaut est TOUJOURS celle d'aujourd'hui (ou, si le
// planning ne la contient pas, la prochaine créée). Le choix ne dépend plus
// de la cellule active de la feuille (actifLabG, utilisé par le dialogue
// desktop) : depuis un téléphone, cette cellule est celle où quelqu'un a
// cliqué la dernière fois sur ordinateur — ça n'a aucun sens ici.
// PERFORMANCE (round audit, 02.09.2026 — retour de Lionel : "les temps de
// chargement me semble long") : `ss`/`sh` sont récupérés UNE seule fois
// ci-dessous et transmis à chaque étape, au lieu de laisser chacune
// (assurerSemainesAvance_, apiChargerSemaine, apiListerChantiers/Statuts/
// Feries) redemander SpreadsheetApp.getActiveSpreadsheet()/getSheetByName()
// de son côté — un coût réel même DANS une seule exécution, cf. les
// commentaires ajoutés sur chacune de ces fonctions. Même principe déjà
// appliqué à `chargerSemaine_` (qui reçoit `pers`/`lc`/`lr` de son
// appelant), étendu ici au niveau du classeur entier.
//
// `formulairesRapides` a disparu de cette réponse : cette donnée ne sert
// QUE dans le menu "Ajouter" d'un intervenant et la page "Entrée rapide",
// jamais pour afficher le planning lui-même — la charger à CHAQUE ouverture
// de l'appli, y compris pour aller directement au planning (le cas de très
// loin le plus fréquent), n'avait aucune raison d'être sur ce chemin
// critique. Chargée à part, en arrière-plan, juste après le premier rendu
// du planning (cf. Index.html, chargerFormulairesRapides — même principe
// que le compteur de tâches, §8.2 de ce fichier). `statuts` et `feries`,
// eux, RESTENT ici : les deux colorent directement des cases du planning dès
// le premier affichage (pastilles de statut, teintes des jours fériés) — les
// différer aurait fait apparaître la grille dans une couleur transitoire
// fausse, corrigée un instant après (un "flash" plus gênant que le gain).
function apiDemarrer() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = feuillePlanning_(ss);
  var aujourdhui = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");

  // Complète le planning si besoin. Sous verrou (deux personnes qui ouvrent
  // l'appli en même temps ne doivent pas créer les mêmes semaines deux fois),
  // et sous try/catch : un problème ici ne doit JAMAIS empêcher l'appli de
  // s'ouvrir — au pire elle démarre sans les semaines en plus, et le dit.
  var creation = null;
  try {
    creation = avecVerrou_(function () { return assurerSemainesAvance_(aujourdhui, sh); });
  } catch (err) {
    creation = { creees: 0, erreur: String(err && err.message ? err.message : err) };
  }

  var semaines = listerSemainesPlanning(sh).map(function (s) {
    return { labG: s.labG, num: s.num, debut: isoJour(s.dateDebut), fin: isoJour(s.dateFin) };
  });
  if (semaines.length === 0) {
    return {
      semaines: [], aujourdhui: aujourdhui, index: -1, chantiers: [], semaine: null, creation: creation,
      statuts: apiListerStatuts(ss), feries: listerFeriesV3_(ss), categoriesFeries: apiListerCategoriesFeries(ss)
    };
  }

  var index = indexSemaineDuJour_(semaines, aujourdhui);
  // sh/lc/lr/pers déjà connus ci-dessus (lc/lr relus APRÈS
  // assurerSemainesAvance_, qui a pu ajouter des colonnes de semaine) :
  // chargerSemaine_ directement, jamais apiChargerSemaine (qui referait
  // exactement cette même recherche pour rien, cf. son propre commentaire).
  var lc = sh.getLastColumn(), lr = sh.getLastRow();
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  return {
    semaines: semaines,
    aujourdhui: aujourdhui,
    index: index,
    chantiers: apiListerChantiers(ss),
    palette: CHANTIER_PALETTE.slice(), // couleurs proposées pour un nouveau chantier
    semaine: chargerSemaine_(sh, semaines[index].labG, lc, lr, pers),
    creation: creation,
    statuts: apiListerStatuts(ss),
    feries: listerFeriesV3_(ss), // jamais apiListerFeries : nom écrasable, cf. r16
    categoriesFeries: apiListerCategoriesFeries(ss)
  };
}

// Semaine contenant aujourd'hui ; sinon la première à venir ; sinon la
// dernière du planning (cas d'un planning qui s'arrête dans le passé).
function indexSemaineDuJour_(semaines, iso) {
  var i;
  for (i = 0; i < semaines.length; i++) if (iso >= semaines[i].debut && iso <= semaines[i].fin) return i;
  for (i = 0; i < semaines.length; i++) if (semaines[i].debut >= iso) return i;
  return semaines.length - 1;
}

// ==== ÉCRITURE : jalon / note ====
// kind = "jalon" | "note". Comme pour une saisie manuelle (onEditPlanning
// ignore explicitement les lignes 1-5), aucun reformatage n'est nécessaire
// ici : le fond de ces deux lignes est posé une fois pour toutes par
// formaterPlanning()/creerSemaine() et n'a pas besoin d'être reposé à
// chaque frappe.
function apiEnregistrerJalonNote(labG, kind, jourIdx, texte, demi) {
  if (jourIdx < 0 || jourIdx > 4) throw new Error("Jour invalide.");
  if (kind !== "jalon" && kind !== "note") throw new Error("Type de case invalide.");
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var row = (kind === "jalon") ? 4 : CONFIG.LIGNE_NOTES;
    var cellule = sh.getRange(row, labG + 1 + jourIdx);
    var nouveauTexte = String(texte == null ? "" : texte).trim();
    if (kind === "jalon") {
      // Une frappe directe dans la case (ce chemin-ci — plus simple que la
      // fiche d'édition avec sa portée de série) ne doit pas faire
      // disparaître le lien avec une série éventuelle (round "idem pour les
      // modifications de série", 01.09.2026) : le tag [Série:xxxxxx] déjà
      // présent, s'il y en a un, est relu puis reposé tel quel autour du
      // nouveau texte. Un texte vidé efface aussi le tag (plus rien à
      // rattacher à une série).
      var ancienBrut = String(cellule.getValue() == null ? "" : cellule.getValue());
      var serieId = decoderLigneTache_(ancienBrut).serieId;
      // jalon : pas de demi-journee (cf. chargerSemaine_), le parametre demi est ignore ici.
      cellule.setValue(encoderLigneTache_({ texte: nouveauTexte, serieId: serieId }) || "");
    } else {
      cellule.setValue(nouveauTexte);
    }
    SpreadsheetApp.flush();
    // La semaine relue est renvoyée avec la réponse : le client n'a plus
    // besoin d'un deuxième aller-retour pour se rafraîchir (cf. note sur
    // apiDemarrer — c'est le même gain, appliqué à chaque enregistrement).
    return { ok: true, semaine: apiChargerSemaine(labG) };
  });
}

// Demi-journée du jour `iso` au sein d'une plage [b1, b2] dont les bords
// portent demiB1/demiB2 (round du 03.09.2026, cf. apiEnregistrerPlage
// ci-dessous) : les bords ont chacun la leur, tout jour STRICTEMENT ENTRE
// les deux est toujours une journée entière. Une plage d'un seul jour
// (b1 === b2) retombe sur demiB1 (le client garantit demiB1 === demiB2 dans
// ce cas). Fonction PURE, top-level pour rester testable indépendamment de
// toute feuille (cf. test_backend_pures.js).
function demiPourJourDePlage_(iso, b1, b2, demiB1, demiB2) {
  if (!b1) return null;
  if (iso === b1) return demiB1;
  if (iso === b2) return demiB2;
  return null;
}

// ==== ÉCRITURE : jalon / note sur une PLAGE DE DATES ====
// Pose le même texte sur tous les jours OUVRÉS compris entre isoDebut et
// isoFin (bornes incluses), même si la plage traverse plusieurs semaines.
// Une seule date (isoFin vide ou identique) = un seul jour. Les jours qui
// n'existent pas encore dans le planning sont simplement ignorés.
//
// La ligne entière (4 = jalons, 5 = notes) est lue puis réécrite en un seul
// aller-retour, quelle que soit la longueur de la plage : les colonnes
// concernées ne sont pas forcément contiguës (les week-ends sont sautés).
// labGCourant sert seulement à renvoyer la semaine affichée rafraîchie.
//
// mode = "ajout" : le texte est AJOUTÉ À LA LIGNE sous ce qui existe déjà ce
//                   jour-là, rien n'est écrasé (c'est le bouton +). Un jour
//                   qui contient déjà exactement cette ligne n'est pas doublé.
//        "remplacement" : le contenu du jour est remplacé (modification d'une
//                   plage existante, ouverte depuis la grille).
//
// origine (facultatif, mode remplacement) = { debut, fin, texte, important } :
// la plage telle qu'elle était AVANT modification. Les jours qui en sortaient
// (plage raccourcie) et qui portent toujours l'ancien texte sont vidés — sans
// ça, raccourcir un jalon de 3 à 2 jours laisserait le 3e jour orphelin. Un
// jour dont le texte a changé entre-temps n'est jamais touché.
//
// important (facultatif, kind === "note" uniquement — round du 28.08.2026,
// tag manuel "Important" demandé par Lionel pour faire ressortir une note en
// rouge) : s'applique à CHAQUE ligne posée par cet appel (texte peut être
// multi-ligne : chaque ligne devient sa propre note, cf. decoderNotesJour_/
// encoderNotesJour_). origine.important décrit l'état de la note d'ORIGINE
// (nécessaire pour reconnaître exactement la ligne à vider si la plage est
// raccourcie). Sans objet pour un jalon (kind === "jalon"), qui garde son
// texte brut, sans tag ni couleur, exactement comme avant.
// demi (round du 02.09.2026, étendu le 03.09.2026) : "matin" | "aprem" |
// rien = journée entière. NOTES UNIQUEMENT (précision de Lionel,
// 02.09.2026) : un jalon est toujours posé sur la journée entière, les
// valeurs reçues sont ignorées pour kind="jalon". Écrit sous forme
// d'étiquette [M]/[A] en tête de l'entrée, exactement comme [S]/[D] pour le
// week-end (cf. decoderLigneTache_). Absence d'étiquette = journée entière :
// tout l'existant est donc inchangé, sans migration.
//
// demiDebut / demiFin (round du 03.09.2026, Lionel : "je peux réduire de 1
// jour à 1 demi jour, mais je ne peux pas augmenter à 1 jour et demi") :
// AVANT ce round, une seule valeur `demi` s'appliquait à TOUS les jours de
// la plage — impossible de représenter "lundi après-midi + tout mardi"
// (1,5 jour). Chaque EXTRÉMITÉ de la plage a désormais sa propre
// demi-journée ; tout jour STRICTEMENT ENTRE les deux est toujours une
// journée entière (pas de demi-journée "au milieu" — cf. FRONTEND-CHANGELOG
// pour le raisonnement complet). Pour une plage d'un seul jour (d1 === d2),
// demiDebut et demiFin décrivent le MÊME jour et doivent être égaux (c'est
// le client qui garantit cet invariant, cf. Index.html). Un client resté sur
// l'ancien appel à un seul paramètre `demi` envoie `demiFin === undefined` :
// on retombe alors sur demiDebut pour les deux bords, comportement
// identique à avant ce round (filet de sécurité pendant la transition).
function apiEnregistrerPlage(kind, isoDebut, isoFin, texte, labGCourant, origine, mode, important, demiDebut, demiFin) {
  if (kind !== "jalon" && kind !== "note") throw new Error("Type de case invalide.");
  if (demiFin === undefined) demiFin = demiDebut;
  var d1 = String(isoDebut || "").trim();
  var d2 = String(isoFin || "").trim() || d1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d1)) throw new Error("Choisis une date de début.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d2)) throw new Error("Date de fin invalide.");
  if (d2 < d1) { var tmp = d1; d1 = d2; d2 = tmp; var tmpD = demiDebut; demiDebut = demiFin; demiFin = tmpD; } // dates inversées : on remet dans l'ordre (les bords aussi)
  var estNote = kind === "note";
  // Demi-journee : NOTES uniquement (cf. chargerSemaine_). Pour un jalon, la
  // valeur recue est ignoree, jamais ecrite.
  var demiPropreDebut = (estNote && (demiDebut === "matin" || demiDebut === "aprem")) ? demiDebut : null;
  var demiPropreFin = (estNote && (demiFin === "matin" || demiFin === "aprem")) ? demiFin : null;
  var texteTrim = String(texte == null ? "" : texte).trim();
  // Note : chaque ligne tapée devient sa propre entrée encodée (avec son tag
  // [Important] commun à tout cet enregistrement). Jalon : comportement
  // strictement inchangé, un simple trim, texte multi-ligne conservé tel quel.
  // Ce `contenu` ne sert plus qu'à la validation "texte vide" juste en
  // dessous pour une note (mode ajout) : la demi-journée, potentiellement
  // différente par jour, est recalculée PAR COLONNE plus bas
  // (demiPourJourDePlage_) — elle n'a pas sa place dans ce calcul unique.
  var contenu = estNote
    ? encoderNotesJour_(lignesDe_(texteTrim).map(function (l) { return { texte: l, important: !!important }; }))
    : (encoderLigneTache_({ texte: texteTrim }) || ""); // jalon : jamais d'etiquette de demi-journee
  var ajout = (mode === "ajout");
  if (ajout && contenu === "") throw new Error("Écris un texte.");
  var o1 = origine && origine.debut ? String(origine.debut) : null;
  var o2 = origine && origine.fin ? String(origine.fin) : null;
  // demiDebut/demiFin de l'ORIGINE (round du 03.09.2026) : nécessaires pour
  // ne retirer, jour par jour, que l'entrée qui portait vraiment CETTE
  // demi-journée-là — sans ça, sur un jour qui contiendrait par coïncidence
  // 2 notes au texte et à l'importance identiques mais des demi-journées
  // différentes, on risquerait de retirer la mauvaise (ou les deux).
  // origine.demiDebut/demiFin sont absents pour un ancien appel : on retombe
  // alors sur origine.demi (compatibilité du round du 02.09.2026) puis sur
  // null (journée entière), jamais une exception.
  var oDemiDebut = origine ? (origine.demiDebut !== undefined ? origine.demiDebut : (origine.demi || null)) : null;
  var oDemiFin = origine ? (origine.demiFin !== undefined ? origine.demiFin : (origine.demi || null)) : null;
  // oTexteBrut identifie l'entrée d'origine (comparaison texte à texte, cf.
  // branche notes ci-dessous) ; oTexte reste la comparaison CELLULE ENTIÈRE,
  // désormais utile pour les jalons uniquement (une case = un texte unique,
  // inchangé). Avant ce round, les notes réutilisaient aussi oTexte via une
  // ré-encodage à la volée — obsolète depuis qu'une case peut contenir
  // plusieurs notes indépendantes : comparer la cellule ENTIÈRE à une seule
  // entrée n'a plus de sens dès qu'une autre note partage le même jour.
  var oTexteBrut = origine ? String(origine.texte == null ? "" : origine.texte).trim() : "";
  var oTexte = oTexteBrut;

  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var lc = sh.getLastColumn();
    var row = (kind === "jalon") ? 4 : CONFIG.LIGNE_NOTES;
    var colMap = construireCarteColonnes(sh, lc); // ligne 3 lue une seule fois pour toute la feuille

    var ligne = sh.getRange(row, 1, 1, lc).getValues()[0];
    var poses = 0, remplaces = 0, liberes = 0, ajoutes = 0, modifie = false;
    for (var c = 1; c <= lc; c++) {
      var info = colMap[c];
      if (!info || !info.date || info.we) continue; // colonne label, week-end, ou sans date
      var iso = isoJour(info.date);
      var ancien = String(ligne[c - 1] == null ? "" : ligne[c - 1]).trim();
      var dansNouvelle = (iso >= d1 && iso <= d2);

      if (estNote) {
        // Une case peut désormais contenir PLUSIEURS notes indépendantes
        // (round du 28.08.2026, demande de Lionel) : contrairement au jalon
        // ci-dessous, on ne peut plus comparer/écraser la cellule ENTIÈRE —
        // une autre note, sans rapport avec celle qu'on modifie, peut très
        // bien partager le même jour (c'est justement tout l'intérêt de la
        // demande). On raisonne donc entrée par entrée : décoder, retirer
        // l'entrée d'ORIGINE si ce jour en faisait partie, ajouter les
        // nouvelles lignes tapées si ce jour est dans la plage visée,
        // ré-encoder — en laissant toute AUTRE entrée du jour intacte.
        var dansOrigine = !!(o1 && iso >= o1 && iso <= o2);
        if (!dansNouvelle && !dansOrigine) continue;

        var entrees = decoderNotesJour_(ancien);
        var retire = false;
        if (dansOrigine && oTexteBrut !== "") {
          // La demi-journée de CE jour-là dans la plage d'origine (bords
          // demiDebut/demiFin, milieu toujours journée entière) — on ne
          // retire que l'entrée qui portait vraiment cette demi-journée,
          // sinon un jour avec 2 notes au texte/importance identiques mais
          // des demi-journées différentes risquerait de perdre la mauvaise.
          var demiOrigineIci = demiPourJourDePlage_(iso, o1, o2, oDemiDebut, oDemiFin);
          var avantRetrait = entrees.length;
          entrees = entrees.filter(function (e) {
            return !(e.texte === oTexteBrut && !!e.important === !!(origine && origine.important) && (e.demi || null) === demiOrigineIci);
          });
          retire = entrees.length < avantRetrait;
        }
        var ajouteIci = false;
        if (dansNouvelle) {
          poses++;
          // Demi-journée de CE jour-là dans la NOUVELLE plage (mêmes bords).
          var demiIci = demiPourJourDePlage_(iso, d1, d2, demiPropreDebut, demiPropreFin);
          // Le doublon se juge sur (texte + demi-journée) : "Livraison" le
          // matin et "Livraison" l'après-midi sont deux notes distinctes, pas
          // une répétition à écarter.
          var dejaLaNote = entrees.map(function (e) { return e.texte + "|" + (e.demi || ""); });
          lignesDe_(texteTrim).forEach(function (l) {
            var cle = l + "|" + (demiIci || "");
            if (dejaLaNote.indexOf(cle) === -1) { entrees.push({ texte: l, important: !!important, demi: demiIci }); dejaLaNote.push(cle); ajouteIci = true; }
          });
        }
        var nouveauJour = encoderNotesJour_(entrees);
        if (nouveauJour !== ancien) {
          ligne[c - 1] = nouveauJour;
          modifie = true;
          if (dansNouvelle) { if (retire && ajouteIci) remplaces++; else if (ajouteIci) ajoutes++; }
          else if (retire) liberes++;
        }
        continue;
      }

      // Jalon : INCHANGÉ — une case = un texte unique, comparé et écrasé tel
      // quel (comportement historique préservé à l'identique). Limite
      // connue : contrairement à apiEnregistrerJalonNote (round "idem pour
      // les modifications de série", 01.09.2026), cette branche n'est pas
      // consciente d'un éventuel tag [Série:xxxxxx] déjà posé sur la case —
      // un écrasement par CE chemin-ci perdrait le lien avec la série. Pas
      // corrigé ici faute d'usage réel actuel (aucun appel client avec
      // kind==="jalon" à ce jour, cf. grep sur apiEnregistrerPlage dans
      // Index.html) ; à traiter si ce chemin est un jour rebranché.
      if (dansNouvelle) {
        poses++;
        if (ajout) {
          // Ajout à la ligne : on ne remplace jamais, on complète — sauf si
          // la ligne est déjà présente telle quelle ce jour-là.
          if (ancien === "") { ligne[c - 1] = contenu; ajoutes++; modifie = true; continue; }
          var dejaLa = lignesDe_(ancien);
          var aAjouter = lignesDe_(contenu).filter(function (l) { return dejaLa.indexOf(l) === -1; });
          if (aAjouter.length > 0) { ligne[c - 1] = ancien + "\n" + aAjouter.join("\n"); ajoutes++; modifie = true; }
          continue;
        }
        if (ancien === contenu) continue;
        if (ancien !== "") remplaces++;
        ligne[c - 1] = contenu;
        modifie = true;
      } else if (o1 && iso >= o1 && iso <= o2 && oTexte !== "" && ancien === oTexte) {
        ligne[c - 1] = ""; // jour sorti de la plage : on retire l'ancien texte
        liberes++; modifie = true;
      }
    }
    if (poses === 0) throw new Error("Aucun jour ouvré de cette plage n'existe dans le planning.");
    if (modifie) {
      // Comme pour une saisie manuelle, les lignes 1-5 ne demandent aucun
      // reformatage (cf. apiEnregistrerJalonNote). Le rouge d'une note
      // [Important] n'est plus posé ici non plus depuis le 28.08.2026 au soir
      // (la feuille n'est plus peinte à chaque saisie, cf.
      // ecrireDemiJournee_) : l'appli l'affiche côté client depuis le tag, et
      // le PDF le recalcule ligne par ligne depuis le texte au moment
      // d'imprimer (preparerLignesImpression_, Planning_Format.gs).
      sh.getRange(row, 1, 1, lc).setValues([ligne]);
      SpreadsheetApp.flush();
    }
    return { ok: true, jours: poses, remplaces: remplaces, liberes: liberes, ajoutes: ajoutes, semaine: apiChargerSemaine(labGCourant) };
  });
}

// Lignes non vides d'une cellule multi-ligne, comparées sans le tiret que
// tirets() (Planning_Format.gs) ajoute automatiquement — sinon un même jalon
// réajouté après un reformatage passerait pour différent et serait doublé.
function lignesDe_(txt) {
  return String(txt == null ? "" : txt).split("\n").map(function (l) {
    return l.trim().replace(/^-\s+/, "");
  }).filter(function (l) { return l !== ""; });
}

// ==== RENOMMER UNE LIGNE (et corriger sa section au besoin) ====
// portee = "semaine"    : ne change que la colonne de la semaine affichée
//                          (c'est ainsi que la feuille gère déjà un remplaçant
//                          ponctuel — imprimerSemaine lit le nom dans la
//                          colonne de la semaine imprimée, pas en colonne 1) ;
//          "suivantes"   : la semaine affichée ET toutes celles d'après.
// Les semaines PASSÉES ne sont jamais modifiées, dans aucun des deux cas.
// sousTraitant force la section ; le marqueur n'est écrit que si la ligne
// dit le contraire (cf. encoderNom_).
function apiRenommerPersonne(labG, ancre, nom, sousTraitant, portee) {
  var nomPropre = String(nom == null ? "" : nom).trim();
  if (nomPropre === "") throw new Error("Nom vide.");
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var lc = sh.getLastColumn(), lr = sh.getLastRow();
    var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
    var bloc = trouverBloc_(pers, ancre);
    var texte = encoderNom_(nomPropre, !!sousTraitant, bloc.startRow);
    var cibles = (portee === "suivantes") ? colonnesLabelDepuis_(lc, labG) : [labG];

    // Une RangeList pose la même valeur sur toutes les colonnes visées en un
    // seul appel, quel que soit leur nombre.
    var refs = cibles.map(function (c) { return refA1(bloc.startRow, c, 1, 1); });
    parLots(sh, refs, function (rl) { rl.setValue(texte); });

    if (cibles.indexOf(1) !== -1) {
      bloc.nom = texte; // colonne 1 mise à jour : le bloc reste "occupé" au reformatage
    } else if (bloc.nom === "") {
      // Filet : si la colonne 1 (repère "ligne occupée" de formaterPlanning)
      // était restée vide sur cette ligne, on la renseigne — sans quoi le bloc
      // perdrait sa mise en forme et sa liste déroulante Chantier au prochain
      // reformatage, sur TOUTES les semaines.
      sh.getRange(bloc.startRow, 1).setValue(texte);
      bloc.nom = texte;
    }
    reformaterZone(sh, bloc.startRow, 1, bloc.endRow - bloc.startRow + 1, lc, lc, lr, pers);
    SpreadsheetApp.flush();
    return { ok: true, semaines: cibles.length, semaine: chargerSemaine_(sh, labG, lc, lr, pers) };
  });
}

// ==== ÉCRITURE D'UNE DEMI-JOURNÉE (valeurs seules — plus aucune peinture) ====
// Historique, pour comprendre pourquoi cette fonction est devenue si courte :
// enregistrer une case a d'abord coûté un reformaterZone() complet (~20
// appels Sheets), ramené au round 8 à une repeinte ciblée (~4 appels : 1
// lecture de date + 1 écriture de valeurs + 2 écritures de format). Depuis le
// 28.08.2026 au soir (demande de Lionel : "je n'ai théoriquement plus besoin
// des mises en forme sur ce fichier"), la peinture au fil de l'eau est
// supprimée entièrement : il ne reste que l'écriture des valeurs, 1 appel.
//
// C'est sans conséquence sur ce qui se voit vraiment :
//  - l'APPLI colore sa grille elle-même, côté client, depuis la liste des
//    chantiers — elle n'a jamais lu la peinture de la feuille ;
//  - le PDF recalcule TOUTES ses couleurs depuis les valeurs au moment
//    d'imprimer (cf. imprimerSemaine/fondImpressionJourOuvre_ dans
//    Planning_Format.gs, rendu autonome à ce même round) ;
//  - la vraie feuille, elle, reste remise en couleurs à chaque création de
//    semaine (formaterPlanning dans creerSemaineWeb_, environ une fois par
//    semaine) et par le menu 🔧 desktop — simplement plus à chaque saisie.
//    Entre deux, une case fraîchement saisie peut donc rester blanche dans
//    Google Sheets : assumé, la feuille brute ne sert plus de vue de travail.
// valDetail est attendu DÉJÀ normalisé par tirets() — la valeur écrite ici
// est celle qui restera en place et que la relecture renvoie au client.
function ecrireDemiJournee_(sh, rowChantier, col, valChantier, valDetail) {
  sh.getRange(rowChantier, col, 2, 1).setValues([[valChantier], [valDetail]]);
}

// ==== ÉCRITURE : case d'une personne (chantier + détail + statut) ====
// ancre = bloc.startRow (cf. detecterPersonnes) — TOUJOURS revalidée ici
// contre un état frais de la feuille, jamais fait confiance aveuglément à
// ce que renvoie le client (une autre session a pu modifier la feuille
// entre-temps).
// jourIdx 6 (Samedi) et 7 (Dimanche) — round transfert V3, §2 — sont TOUS
// LES DEUX routés vers la MÊME colonne physique (jj=6, l'ancre de la cellule
// fusionnée) : `demi` n'a aucun sens pour le week-end (une seule cellule pour
// tout le bloc personne, pas de ligne "Chantier"/"détail" séparée par
// demi-journée — cf. note en tête de "CELLULE WEEK-END" plus haut) et n'est
// donc jamais utilisé dans cette branche ; il reste néanmoins EXIGÉ et validé
// dans l'appel (le client V3 le fournit par construction, ne serait-ce que
// pour la branche 1-5) pour ne garder qu'une seule forme d'appel.
function apiEnregistrerCellulePersonne(labG, ancre, demi, jourIdx, payload) {
  if (jourIdx < 0 || jourIdx > 7) throw new Error("Jour invalide.");
  if (demi !== "matin" && demi !== "aprem") throw new Error("Demi-journée invalide.");
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var lc = sh.getLastColumn(), lr = sh.getLastRow();
    var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
    var bloc = trouverBloc_(pers, ancre);

    if (jourIdx === 6 || jourIdx === 7) {
      var jourEcrit = (jourIdx === 6) ? "S" : "D";
      // BUGFIX (vérif transfert V3) : la colonne physique porteuse de valeur
      // est labG+6 (jj=6, Samedi — cf. tous les sites de LECTURE : chargerSemaine_
      // lit zVals[iAncre][6] / entete[1][6], donc colonne absolue labG+6, PAS
      // labG+7). L'ancien calcul "labG + 1 + 6" = labG+7 visait la colonne de
      // Dimanche, la non-ancre de la fusion Sam/Dim (toujours vide en lecture
      // Sheets pour une cellule fusionnée) : toute écriture week-end partait
      // dans le vide, invisible à la relecture. Corrigé.
      var colWE = labG + 6; // jj=6 : seule colonne physique porteuse de valeur (cf. note "CELLULE WEEK-END")
      var celluleWE = sh.getRange(bloc.startRow, colWE);
      var ancienBrutWE = String(celluleWE.getValue() == null ? "" : celluleWE.getValue());
      var nouveauBrutWE = fusionnerRemplacementWeekend_(ancienBrutWE, jourEcrit, payload && payload.chantier, payload && payload.taches);
      celluleWE.setValue(nouveauBrutWE);
      SpreadsheetApp.flush();
      return { ok: true, semaine: chargerSemaine_(sh, labG, lc, lr, pers) };
    }

    var chantierRow = bloc.startRow + (demi === "matin" ? 0 : 2);
    var col = labG + 1 + jourIdx;

    // tirets() est appliqué ici plutôt que laissé au reformatage : c'est la
    // valeur définitive de la cellule, celle que la relecture juste en dessous
    // doit renvoyer au client (sinon la grille afficherait le texte sans ses
    // tirets jusqu'au prochain rechargement).
    var valChantier = payload && payload.chantier ? String(payload.chantier).trim() : "";
    var valDetail = tirets(encoderTaches_(payload && payload.taches));
    ecrireDemiJournee_(sh, chantierRow, col, valChantier, valDetail);

    SpreadsheetApp.flush();
    return { ok: true, semaine: chargerSemaine_(sh, labG, lc, lr, pers) };
  });
}

// Colonnes label de la semaine affichée et de TOUTES LES SUIVANTES. Le
// planning est chronologique de gauche à droite : « les suivantes » = les
// colonnes label à droite de labG. Les semaines passées ne sont jamais
// touchées — c'est tout l'intérêt par rapport à « toutes les semaines ».
function colonnesLabelDepuis_(lc, labG) {
  var out = [];
  for (var c = labG; c <= lc; c++) if (isLabelCol(c)) out.push(c);
  return out;
}

function trouverBloc_(pers, ancre) {
  for (var i = 0; i < pers.length; i++) if (pers[i].startRow === ancre) return pers[i];
  throw new Error("Cette ligne n'existe plus — recharge la semaine.");
}

// Noms de la semaine visée pour tous les blocs, en UN SEUL appel (avant :
// un getValue par personne, soit autant d'allers-retours que de lignes).
function lireLabelsSemaine_(sh, pers, labG) {
  if (pers.length === 0) return [];
  var r1 = pers[0].startRow, r2 = pers[pers.length - 1].endRow;
  var vals = sh.getRange(r1, labG, r2 - r1 + 1, 1).getValues();
  return pers.map(function (b) { return String(v_(vals[b.startRow - r1], 0)).trim(); });
}

// Ligne de début du premier bloc situé dans la zone "sous-traitants"
// (null s'il n'y en a aucun).
function premierBlocSousTraitant_(pers) {
  for (var i = 0; i < pers.length; i++) {
    if (pers[i].startRow >= PREMIERE_LIGNE_SOUS_TRAITANT) return pers[i].startRow;
  }
  return null;
}

// ==== DÉCALAGE EN MASSE (round du 28.08.2026) ====
//
// "décaler le planning d'un nombre X de jours ouvrable. En cas d'annulation
// ou de non respect du planning ça permettrait de tout décaler sans devoir
// tout reprendre." — demande de Lionel, affinée le même jour : portée
// choisie à chaque utilisation (une ligne / tout le monde), point de départ
// = le jour cliqué dans l'en-tête de colonne, aperçu obligatoire avant toute
// écriture avec VALIDATION CASE PAR CASE des cases déjà occupées (ne rien
// faire / écraser / ajouter — même sémantique que le déplacement d'une case
// ci-dessus, cf. fusionnerCellules_ côté client). Jalons et notes sont
// VOLONTAIREMENT hors de cette fonctionnalité (Lionel ne les impose pas) —
// ils ont leur propre raccourci "+N jours ouvrables" dans la fiche
// jalon/note (Index.html, openPlageSheet). Les récurrences n'ont besoin
// d'AUCUN traitement particulier : elles sont ancrées sur un jour de
// semaine, jamais sur une date, et Lionel a confirmé qu'elles ne doivent
// justement pas suivre le décalage — leur contenu déjà posé, lui, est une
// case comme une autre et peut tout à fait se faire prendre dans le
// décalage (Lionel garde la main dessus via la validation case par cas).
//
// Toujours 2 appels : apiApercuDecalage() calcule et NE MODIFIE RIEN,
// apiAppliquerDecalage() écrit une fois les résolutions connues. Les deux
// repartent du MÊME calcul (calculerPlanDecalage_) pour ne jamais diverger
// et pour toujours revalider contre l'état réel de la feuille (jamais
// confiance aveugle en ce que le client a affiché, même principe que
// apiEnregistrerCellulePersonne) — y compris si la feuille a changé entre
// l'aperçu et la confirmation (autre session, ou juste le temps qui passe).

// Liste ORDONNÉE des colonnes "jour ouvré" (jamais une colonne label, jamais
// un week-end) sur toute la largeur utile — le décalage avance/recule d'un
// nombre de PLACES dans cette liste, jamais d'un nombre brut de colonnes.
// Un jour férié compte comme un jour ouvré normal (même convention que la
// plage jalon/note : "Samedis et dimanches ignorés", rien sur les fériés —
// cf. decalerJoursOuvrables_ côté client, qui suit la même règle).
function colonnesJoursOuvres_(colMap, lc) {
  var out = [];
  for (var c = 1; c <= lc; c++) {
    if (isLabelCol(c)) continue;
    if (colMap[c].we || !colMap[c].date) continue;
    out.push({ col: c, iso: isoJour(colMap[c].date) });
  }
  return out;
}

// Fusionne le contenu qui ARRIVE dans une case déjà occupée, sans jamais
// rien perdre — jumeau serveur de fusionnerCellules_ (Index.html), MÊME
// sémantique exactement (chantier déjà en place jamais remplacé, tâches
// combinées sans doublon exact) : les deux doivent rester identiques, cf.
// remarque équivalente pour creerSemaine()/creerSemaineWeb_ dans ce fichier.
function fusionnerCellulesServeur_(existant, venant) {
  var taches = (existant.taches || []).slice();
  (venant.taches || []).forEach(function (t) {
    if (!t || !t.texte) return;
    var dejaLa = taches.some(function (u) { return u.texte === t.texte; });
    if (!dejaLa) taches.push(t);
  });
  return { chantier: existant.chantier || venant.chantier || null, taches: taches };
}

function celluleVide_(c) { return !c.chantier && (!c.taches || c.taches.length === 0); }

// Calcule le plan complet d'un décalage — PARTAGÉ par l'aperçu et
// l'application, pour que les deux ne puissent jamais diverger. Crée les
// semaines manquantes si le décalage (vers l'avant) en a besoin — jamais de
// contenu poussé "hors planning" pour une raison aussi évitable que "la
// semaine suivante n'existait pas encore", même réflexe que partout
// ailleurs dans l'appli (récurrences, jalons/notes).
function calculerPlanDecalage_(sh, labG, jourIdx, portee, ancre, sens, nJours) {
  if (jourIdx < 0 || jourIdx > 4) throw new Error("Jour de départ invalide.");
  if (portee !== "ligne" && portee !== "tous") throw new Error("Portée invalide.");
  var n = parseInt(nJours, 10);
  if (!n || n < 1) throw new Error("Nombre de jours invalide.");
  var pas = (sens === "reculer") ? -n : n;

  var ss = sh.getParent();
  var lr = sh.getLastRow();
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  var cible = (portee === "ligne") ? [trouverBloc_(pers, ancre)] : pers.filter(function (b) { return b.nom; });
  if (cible.length === 0) throw new Error("Personne à décaler — la portée choisie est vide.");

  var lc = sh.getLastColumn();
  var feries = feriesMemo_(ss);
  var colMap = construireCarteColonnes(sh, lc, feries);
  var jours = colonnesJoursOuvres_(colMap, lc);

  var colDepart = labG + 1 + jourIdx;
  var iStart = -1;
  for (var i = 0; i < jours.length; i++) if (jours[i].col === colDepart) { iStart = i; break; }
  if (iStart === -1) throw new Error("Jour de départ introuvable — recharge la semaine.");

  var aujourdhuiIso = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");

  // Lecture groupée par (personne, demi) : chantier + détail de TOUTES les
  // colonnes concernées (source ET destination, pour reculer) en 1 appel
  // chacun, plutôt qu'un aller-retour par case. Fenêtre commune à tout le
  // monde : du plus petit index nécessaire (départ, ou départ - n si on
  // recule) jusqu'à la toute dernière colonne EXISTANTE — l'extension
  // éventuelle (avancer au-delà de la dernière semaine) est traitée à part,
  // juste en dessous, une fois qu'on sait EXACTEMENT ce qu'il y a à décaler.
  var iMin = Math.max(0, iStart + Math.min(0, pas));
  var cDebut = jours[iMin].col, cFin = jours[jours.length - 1].col;
  var largeur = cFin - cDebut + 1;

  function lireCol_(vals, col) {
    var idx = col - cDebut;
    return { chantier: String(v_(vals[0], idx)).trim() || null, taches: decoderTaches_(v_(vals[1], idx)) };
  }

  var simples = [], conflits = [], impossibles = [], enAttente = [];
  cible.forEach(function (bloc) {
    ["matin", "aprem"].forEach(function (demi) {
      var rowChantier = bloc.startRow + (demi === "matin" ? 0 : 2);
      var vals = sh.getRange(rowChantier, cDebut, 2, largeur).getValues();
      for (var si = iStart; si < jours.length; si++) {
        var source = lireCol_(vals, jours[si].col);
        if (celluleVide_(source)) continue; // rien à déplacer depuis une case vide
        var di = si + pas;
        var id = bloc.startRow + "|" + demi + "|" + jours[si].iso;
        if (di < 0 || (pas < 0 && jours[di].iso < aujourdhuiIso)) {
          impossibles.push({ id: id, ancre: bloc.startRow, nom: bloc.nom, demi: demi, jourSourceIso: jours[si].iso });
          continue;
        }
        if (di >= jours.length) {
          // Dépasse la dernière semaine ACTUELLE : mis de côté, résolu juste
          // en dessous une fois qu'on connaît la case la plus lointaine à
          // atteindre — jamais classé "impossible" pour une raison aussi
          // évitable que "la semaine suivante n'existe pas encore" (même
          // réflexe que partout ailleurs dans l'appli).
          enAttente.push({ id: id, ancre: bloc.startRow, nom: bloc.nom, demi: demi, rowChantier: rowChantier, di: di, jourSourceIso: jours[si].iso, source: source });
          continue;
        }
        var dest = lireCol_(vals, jours[di].col);
        var entree = {
          id: id, ancre: bloc.startRow, nom: bloc.nom, demi: demi,
          jourSourceIso: jours[si].iso, jourDestIso: jours[di].iso,
          source: source
        };
        if (celluleVide_(dest)) {
          simples.push(entree);
        } else {
          entree.dest = dest;
          conflits.push(entree);
        }
      }
    });
  });

  // Des cases en attente = il faut créer des semaines — EXACTEMENT assez
  // pour la plus lointaine d'entre elles, jamais plus. Provisionner d'après
  // la largeur brute de la feuille (au lieu du contenu réel) créerait des
  // semaines vides à CHAQUE aperçu/confirmation, y compris quand rien n'a
  // besoin d'autant de place — et ça s'aggrave à chaque appel, puisque ces
  // semaines vides deviennent à leur tour "la dernière colonne existante"
  // pour le calcul suivant (bug trouvé et corrigé au moment d'écrire les
  // tests de cette fonction, avant toute mise en production — cf. remarque
  // équivalente pour Utilities.formatDate dans test_semaines.js).
  if (enAttente.length > 0) {
    var diMax = enAttente.reduce(function (m, e) { return Math.max(m, e.di); }, 0);
    var creees = 0;
    while (jours.length - 1 < diMax) {
      if (creees >= 10) throw new Error("Décalage trop grand — plus de 10 semaines à créer d'un coup, vérifie le nombre de jours.");
      creerSemaineWeb_(sh);
      creees++;
      lc = sh.getLastColumn();
      colMap = construireCarteColonnes(sh, lc, feries);
      jours = colonnesJoursOuvres_(colMap, lc);
    }
    if (creees > 0) formaterPlanning(true); // 1 seule fois pour toutes les semaines créées, cf. creerSemaineWeb_

    // Relecture CIBLÉE des seules cases destination désormais disponibles —
    // jamais un 2e aller-retour sur toute la largeur déjà lue plus haut.
    enAttente.forEach(function (e) {
      var col = jours[e.di].col;
      var v = sh.getRange(e.rowChantier, col, 2, 1).getValues();
      var dest = { chantier: String(v_(v[0], 0)).trim() || null, taches: decoderTaches_(v_(v[1], 0)) };
      var entree = { id: e.id, ancre: e.ancre, nom: e.nom, demi: e.demi, jourSourceIso: e.jourSourceIso, jourDestIso: jours[e.di].iso, source: e.source };
      if (celluleVide_(dest)) { simples.push(entree); } else { entree.dest = dest; conflits.push(entree); }
    });
  }

  return { jours: jours, iStart: iStart, simples: simples, conflits: conflits, impossibles: impossibles };
}

function apiApercuDecalage(labG, jourIdx, portee, ancre, sens, nJours) {
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var plan = calculerPlanDecalage_(sh, labG, jourIdx, portee, ancre, sens, nJours);
    SpreadsheetApp.flush();
    return {
      nbSimples: plan.simples.length,
      conflits: plan.conflits.map(function (e) {
        return { id: e.id, nom: e.nom, demi: e.demi, jourSourceIso: e.jourSourceIso, jourDestIso: e.jourDestIso, source: e.source, dest: e.dest };
      }),
      impossibles: plan.impossibles.map(function (e) {
        return { nom: e.nom, demi: e.demi, jourSourceIso: e.jourSourceIso };
      })
    };
  });
}

// resolutions = { [id]: "ecraser"|"ajouter" } — un id ABSENT de cet objet
// est traité comme "ne rien faire" (défaut le plus sûr), cf. Index.html.
function apiAppliquerDecalage(labG, jourIdx, portee, ancre, sens, nJours, resolutions) {
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var plan = calculerPlanDecalage_(sh, labG, jourIdx, portee, ancre, sens, nJours);
    resolutions = resolutions || {};

    var nDeplaces = 0, nEcrases = 0, nAjoutes = 0, nIgnores = plan.impossibles.length;

    function executer_(e, payloadDest) {
      var rowChantier = e.ancre + (e.demi === "matin" ? 0 : 2);
      var colSource = labG_pourIso_(plan.jours, e.jourSourceIso);
      var colDest = labG_pourIso_(plan.jours, e.jourDestIso);
      // Destination d'abord, source vidée SEULEMENT une fois cette 1re
      // écriture faite — même principe que le déplacement d'une case
      // (jamais l'inverse, cf. Index.html/deplacerCellule_).
      ecrireDemiJournee_(sh, rowChantier, colDest, payloadDest.chantier || "", tirets(encoderTaches_(payloadDest.taches)));
      ecrireDemiJournee_(sh, rowChantier, colSource, "", "");
    }

    plan.simples.forEach(function (e) { executer_(e, e.source); nDeplaces++; });
    plan.conflits.forEach(function (e) {
      var choix = resolutions[e.id];
      if (choix === "ecraser") { executer_(e, e.source); nEcrases++; }
      else if (choix === "ajouter") { executer_(e, fusionnerCellulesServeur_(e.dest, e.source)); nAjoutes++; }
      else { /* "ne rien faire" (défaut) : la paire n'est pas touchée */ nIgnores++; }
    });

    SpreadsheetApp.flush();
    var lc = sh.getLastColumn(), lr = sh.getLastRow();
    var persFinal = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
    return {
      ok: true, deplaces: nDeplaces, ecrases: nEcrases, ajoutes: nAjoutes, ignores: nIgnores,
      semaine: chargerSemaine_(sh, labG, lc, lr, persFinal)
    };
  });
}
function labG_pourIso_(jours, iso) {
  for (var i = 0; i < jours.length; i++) if (jours[i].iso === iso) return jours[i].col;
  throw new Error("Colonne introuvable pour " + iso + " — recharge la semaine.");
}

// ==== AJOUT D'UNE PERSONNE (scopé à la semaine affichée, cf. note en tête du fichier) ====
// L'emplacement choisi respecte les deux sections : une personne va sur une
// ligne libre AU-DESSUS du seuil, un sous-traitant sur une ligne libre EN
// DESSOUS (cf. PREMIERE_LIGNE_SOUS_TRAITANT). Sans emplacement libre du bon
// côté, un nouveau bloc de 4 lignes est créé — au bon endroit lui aussi :
// juste avant le premier sous-traitant pour du personnel, tout en bas pour
// un sous-traitant.
function apiAjouterPersonne(labG, nom, sousTraitant) {
  var nomPropre = String(nom == null ? "" : nom).trim();
  if (nomPropre === "") throw new Error("Nom vide.");
  var veutSousTraitant = !!sousTraitant;

  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var lc = sh.getLastColumn(), lr = sh.getLastRow();
    var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
    var labelsSemaine = lireLabelsSemaine_(sh, pers, labG);

    // 1) Réutiliser un emplacement libre (colonne 1 ET la semaine visée
    //    toutes deux vides à cette ligne), dans la bonne section.
    for (var i = 0; i < pers.length; i++) {
      if (pers[i].nom !== "") continue;
      if (labelsSemaine[i] !== "") continue; // déjà occupé pour cette semaine précisément (rare, on ignore par sécurité)
      var estZoneSousTraitant = pers[i].startRow >= PREMIERE_LIGNE_SOUS_TRAITANT;
      if (estZoneSousTraitant !== veutSousTraitant) continue; // ne jamais mélanger les deux sections
      var bloc = pers[i];
      var texte = encoderNom_(nomPropre, veutSousTraitant, bloc.startRow);
      sh.getRange(bloc.startRow, 1).setValue(texte);      // colonne 1 : repère "occupé" pour le formatage
      sh.getRange(bloc.startRow, labG).setValue(texte);   // semaine affichée
      // Le bloc n'est plus "vide" : sans cette mise à jour en mémoire,
      // reformaterZone le traiterait encore comme un emplacement libre et
      // lui retirerait sa mise en forme au lieu de la lui poser.
      bloc.nom = texte;
      // Reformatage CIBLÉ sur ce seul bloc (mêmes étapes que onEditPlanning
      // quand un nom change), au lieu d'un formaterPlanning() complet qui
      // repassait sur toute l'année à chaque ajout — c'était la lenteur
      // la plus visible de l'appli.
      appliquerHauteursBloc(sh, bloc);
      reformaterZone(sh, bloc.startRow, 1, bloc.endRow - bloc.startRow + 1, lc, lc, lr, pers);
      appliquerValidationChantier(sh, [bloc], lc);
      SpreadsheetApp.flush();
      // chargerSemaine_ (pas apiChargerSemaine) : seules des VALEURS ont
      // changé ici (aucune ligne/colonne insérée), pers reste valide — même
      // optimisation que apiRenommerPersonne/apiSupprimerPersonne/
      // apiAttribuerChantierGroupe, qui évitent déjà le getSheetByName +
      // getLastColumn + getLastRow + detecterPersonnes complet
      // qu'apiChargerSemaine referait pour rien (round audit perf, 02.09.2026).
      return { ok: true, ancre: bloc.startRow, reutilise: true, semaine: chargerSemaine_(sh, labG, lc, lr, pers) };
    }

    // 2) Sinon, nouveau bloc de lignes — apparaît dans toutes les semaines,
    //    exactement comme le fait déjà "👤 Ajouter du personnel" au menu.
    //    Ici on garde formaterPlanning() complet : insérer des lignes décale
    //    tout ce qui est en dessous, une passe globale est plus sûre (et ce
    //    cas est rare, contrairement à la réutilisation ci-dessus).
    var insertRow;
    if (veutSousTraitant) {
      insertRow = pers.length > 0 ? pers[pers.length - 1].endRow + 1 : CONFIG.PREMIERE_LIGNE_PERSO;
    } else {
      insertRow = premierBlocSousTraitant_(pers); // le personnel reste au-dessus des sous-traitants
      if (insertRow === null) insertRow = pers.length > 0 ? pers[pers.length - 1].endRow + 1 : CONFIG.PREMIERE_LIGNE_PERSO;
    }
    sh.insertRowsAfter(insertRow - 1, CONFIG.LIGNES_PAR_PERSONNE);
    var texteNouveau = encoderNom_(nomPropre, veutSousTraitant, insertRow);
    // parLots/refA1 (comme apiRenommerPersonne) plutôt qu'un setValue() par
    // colonne label — 1 seul appel Sheets au lieu d'un par semaine existante
    // (round audit perf, 02.09.2026).
    var refsLabels = [];
    for (var c = 1; c <= lc; c++) { if (isLabelCol(c)) refsLabels.push(refA1(insertRow, c, 1, 1)); }
    parLots(sh, refsLabels, function (rl) { rl.setValue(texteNouveau); });
    SpreadsheetApp.flush();
    formaterPlanning(true);
    return { ok: true, ancre: insertRow, reutilise: false, semaine: apiChargerSemaine(labG) };
  });
}

// ==== SUPPRESSION D'UNE PERSONNE ====
// Vide (ne supprime jamais la ligne) — cf. note en tête du fichier.
// portee = "semaine" : la semaine affichée seulement.
//          "suivantes" : la semaine affichée et toutes celles d'après. Les
//          semaines passées gardent la personne et son contenu, toujours.
function apiSupprimerPersonne(labG, ancre, portee) {
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var lc = sh.getLastColumn(), lr = sh.getLastRow();
    var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
    var bloc = trouverBloc_(pers, ancre);

    // De labG jusqu'où il faut : les semaines étant des blocs de colonnes
    // contigus, « à partir de cette semaine » est un simple rectangle — vidé
    // en un seul appel, colonnes label comprises.
    var largeur = (portee === "suivantes") ? (lc - labG + 1) : Math.min(8, lc - labG + 1);
    if (largeur < 1) largeur = 1;
    var vide = [];
    for (var r = 0; r < 4; r++) { var l = []; for (var d = 0; d < largeur; d++) l.push(""); vide.push(l); }
    sh.getRange(bloc.startRow, labG, 4, largeur).setValues(vide);
    if (labG === 1) bloc.nom = ""; // la colonne 1 vient d'être vidée : le bloc redevient un emplacement libre

    reformaterZone(sh, bloc.startRow, labG, 4, largeur, lc, lr, pers);
    SpreadsheetApp.flush();
    var nbSemaines = (portee === "suivantes") ? colonnesLabelDepuis_(lc, labG).length : 1;
    return { ok: true, semaines: nbSemaines, semaine: chargerSemaine_(sh, labG, lc, lr, pers) };
  });
}

// ==== "TÂCHES EN COURS" PAR PERSONNE (round audit, 02.09.2026) ====
// cf. V3-spec-suite.md point 101 : chaque fiche Personnel/Intervenants doit
// afficher son nombre de tâches en cours, et Supprimer doit prévenir
// explicitement si la personne en a (ex. "Supprimer « Armature / Béton » et
// ses 3 tâches ?"), puisqu'elles sont supprimées avec elle (cascade delete).
// Gap trouvé lors de l'audit du 02.09.2026 : ce morceau du point 101 n'avait
// jamais été reporté depuis le prototype vers le vrai backend —
// ligneFichePersonne/supprimerPersonneServeur (Index.html) n'avaient tout
// simplement pas cette donnée. Cf. FRONTEND-CHANGELOG.md/BACKEND-CHANGELOG.md.
//
// "Tâches en cours" = jamais les semaines passées (même convention que le
// reste du projet pour renommer/retirer une ligne, cf. apiRenommerPersonne/
// apiSupprimerPersonne ci-dessus), depuis la semaine courante jusqu'à la fin
// de la feuille. Une même tâche reconduite sur plusieurs jours ouvrés
// consécutifs (même texte/statut/important/chantier) — y compris quand elle
// enjambe un week-end, cf. le correctif spanColonnes() côté client — ne
// compte qu'UNE fois : même logique de fusion que côté client
// (construireVueDepuisCache), pour que le nombre affiché corresponde à ce
// que Lionel voit comme "une tâche" dans la grille plutôt qu'à un nombre de
// cases. Le week-end lui-même (case isolée, jamais de plage, cf.
// construireVueDepuisCache) ne fusionne jamais : chaque ligne y compte pour
// une tâche.
//
// PERFORMANCE : toute la zone personnel, de la semaine courante à la fin de
// la feuille, est lue en UN SEUL appel (même principe que chargerSemaine_
// plus haut) — jamais un appel par personne.
function compterTachesParPersonne_(sh, lc, lr, pers, labGDepart) {
  var out = {};
  if (pers.length === 0) return out;
  pers.forEach(function (b) { out[b.startRow] = 0; });
  if (labGDepart > lc) return out;

  var r1 = pers[0].startRow, r2 = pers[pers.length - 1].endRow;
  var largeur = lc - labGDepart + 1;
  var zVals = sh.getRange(r1, labGDepart, r2 - r1 + 1, largeur).getValues();

  pers.forEach(function (bloc) {
    var iAncre = bloc.startRow - r1;
    var total = 0;

    ["matin", "aprem"].forEach(function (demi, di) {
      var iC = iAncre + di * 2, iD = iC + 1;
      // actifs[s] = la ligne encore "ouverte" au jour ouvré précédent, à ce
      // même index de pile (une case peut contenir plusieurs tâches
      // empilées) -> ne compte qu'une fois une tâche reconduite sur
      // plusieurs jours. jamais réinitialisé sur une colonne label/week-end :
      // Vendredi -> Lundi reste "consécutif" pour la fusion (cf. commentaire
      // au-dessus).
      var actifs = [];
      for (var ci = 0; ci < largeur; ci++) {
        var offset = ci % 8;
        if (offset < 1 || offset > 5) continue; // colonne label ou week-end : traitée à part plus bas
        var chantier = String(zVals[iC][ci] == null ? "" : zVals[iC][ci]).trim();
        var lignes = decoderTaches_(zVals[iD][ci]);
        var n = Math.max(lignes.length, actifs.length);
        for (var s = 0; s < n; s++) {
          var l = lignes[s] || null;
          var a = actifs[s] || null;
          var suite = !!(l && a && l.texte === a.texte && !!l.important === !!a.important && (l.statut || null) === (a.statut || null) && chantier === a.chantier);
          if (l && !suite) total++;
          actifs[s] = l ? { texte: l.texte, statut: l.statut || null, important: !!l.important, chantier: chantier } : null;
        }
        actifs.length = lignes.length;
      }
    });

    // Week-end (colonne fusionnée, offset 6 = Samedi, seule à porter la
    // valeur) : jamais de fusion multi-jours, cf. commentaire plus haut.
    for (var ci = 0; ci < largeur; ci++) {
      if ((ci % 8) !== 6) continue;
      var lignesWE = decoderCelluleWeekend_(zVals[iAncre][ci]);
      total += vueJourWeekend_(lignesWE, "S").taches.length;
      total += vueJourWeekend_(lignesWE, "D").taches.length;
    }

    out[bloc.startRow] = total;
  });

  return out;
}

// Appelée à part, jamais depuis apiDemarrer : coûteuse par nature (elle doit
// lire toute la zone personnel jusqu'à la fin de la feuille), et seulement
// utile quand une des 2 pages Personnel/Intervenants est réellement ouverte
// (cf. Index.html, chargerCompteursTaches — chargé une fois par ouverture de
// page, jamais sur le chemin critique de l'ouverture de l'appli/la
// navigation dans le planning).
function apiCompterTachesPersonnes() {
  var sh = feuillePlanning_();
  var lc = sh.getLastColumn(), lr = sh.getLastRow();
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  var semaines = listerSemainesPlanning(sh);
  if (semaines.length === 0) return compterTachesParPersonne_(sh, lc, lr, pers, lc + 1); // rien à compter
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aujourdhui = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
  var index = indexSemaineDuJour_(semaines, aujourdhui);
  return compterTachesParPersonne_(sh, lc, lr, pers, semaines[index].labG);
}

// ==== ASSIGNATION GROUPÉE (un chantier à tout le personnel, en 1 clic) ====
// Ne concerne QUE le personnel (jamais les sous-traitants — un sous-traitant
// se planifie via son statut de réservation, pas en le rattachant au
// chantier du jour comme le reste de l'équipe). Saute systématiquement
// toute case déjà en congé/absence/vacances (estAbsence(), déjà dans
// Planning_Format.gs) : ne jamais écraser une absence avec un chantier.
// N'écrit QUE la ligne "Chantier" — le détail éventuel de chacun (tâche
// précise, etc.) n'est jamais touché.
// jours = tableau d'indices de jour (0=Lun .. 4=Ven), un ou plusieurs.
function apiAttribuerChantierGroupe(labG, chantier, jours) {
  var nomChantier = String(chantier == null ? "" : chantier).trim();
  if (!nomChantier) throw new Error("Choisis un chantier.");
  if (!jours || !jours.length) throw new Error("Choisis un jour, ou toute la semaine.");
  for (var k = 0; k < jours.length; k++) if (jours[k] < 0 || jours[k] > 4) throw new Error("Jour invalide.");

  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var lc = sh.getLastColumn(), lr = sh.getLastRow();
    var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
    if (pers.length === 0) return { ok: true, personnes: 0, cellules: 0, semaine: apiChargerSemaine(labG) };

    // Toute la zone personnel de la semaine lue en UN appel, modifiée en
    // mémoire, réécrite en UN appel — avant, c'était un getValue + un
    // setValue par demi-journée et par personne, soit des dizaines
    // d'allers-retours pour une seule attribution.
    var r1 = pers[0].startRow, r2 = pers[pers.length - 1].endRow, nR = r2 - r1 + 1;
    var nJours = Math.max(0, Math.min(5, lc - labG));
    if (nJours === 0) throw new Error("Cette semaine n'a aucun jour à remplir.");
    var vals = sh.getRange(r1, labG, nR, nJours + 1).getValues(); // colonne label + jours

    var cible = [], nCellules = 0;
    for (var i = 0; i < pers.length; i++) {
      var bloc = pers[i], iA = bloc.startRow - r1;
      var nomVise = String(v_(vals[iA], 0)).trim();
      if (nomVise === "") continue; // personne à cette ligne, pour cette semaine précisément
      if (decoderNom_(nomVise, bloc.startRow).sousTraitant) continue; // jamais les sous-traitants
      cible.push(bloc);

      for (var k = 0; k < jours.length; k++) {
        var ic = jours[k] + 1;
        if (ic > nJours) continue; // jour absent de cette semaine (fin de feuille)
        for (var d = 0; d < 2; d++) { // matin puis après-midi
          var iC = iA + d * 2, iD = iC + 1;
          if (iC >= nR || iD >= nR) continue;
          if (estAbsence(String(v_(vals[iD], ic)).toLowerCase())) continue; // ne touche jamais une absence
          if (String(v_(vals[iC], ic)).trim() === nomChantier) continue;    // déjà ce chantier
          vals[iC][ic] = nomChantier;
          nCellules++;
        }
      }
    }

    if (nCellules > 0) {
      // Seules les colonnes de jours sont réécrites : la colonne label
      // (fusionnée sur la hauteur du bloc) n'est jamais touchée.
      var joursVals = [];
      for (var rIdx = 0; rIdx < nR; rIdx++) joursVals.push(vals[rIdx].slice(1, nJours + 1));
      sh.getRange(r1, labG + 1, nR, nJours).setValues(joursVals);
      // Plus de reformaterZone ici (28.08.2026 au soir) : c'était ~11 appels
      // Sheets uniquement pour peindre les couleurs de chantier sur la vraie
      // feuille, que plus rien ne lit (cf. ecrireDemiJournee_ — l'appli et le
      // PDF calculent leurs couleurs eux-mêmes). L'écriture groupée seule
      // suffit ; ni les valeurs ni la structure n'ont besoin d'autre chose.
      SpreadsheetApp.flush();
    }
    return { ok: true, personnes: cible.length, cellules: nCellules, semaine: chargerSemaine_(sh, labG, lc, lr, pers) };
  });
}

// ==== PDF (réutilise imprimerSemaine() telle quelle — même résultat que le menu desktop) ====
// L'onglet "📋 S<n>" créé pour l'export n'encombre plus le fichier une fois
// le PDF généré avec succès — demande de Lionel, 28.08.2026. D'abord posé
// UNIQUEMENT ici (1er passage, l'appli web n'a jamais besoin de garder
// l'onglet, contrairement au menu desktop/au trigger mobile qui invitaient
// l'utilisateur à l'ouvrir pour l'imprimer lui-même) ; généralisé depuis aux
// 2 autres appelants (3e passage : "aussi supprimer une impression sur la
// feuille de calcul quand le pdf est généré"). La suppression elle-même vit
// maintenant DANS imprimerSemaine() (Planning_Format.gs), au même endroit
// pour les 3 appelants — plus rien à faire ici.
function apiGenererPdf(labG) {
  return avecVerrou_(function () {
    var r = imprimerSemaine(labG); // crée l'onglet, exporte vers Drive > Boulot > plannings, le supprime si l'export a réussi
    return { ok: true, feuille: r.nom, pdf: r.pdf, supprimee: r.supprimee };
  });
}

// ==== RÉCURRENCES : tâches qui reviennent chaque semaine ====
// (demande de Lionel, 27.08.2026 : "avoir la possibilité d'ajouter des
// détails/tâches récurrentes, ex. séance de chantier, congé, école toutes
// les semaines").
//
// Stockées dans une feuille dédiée, créée toute seule au premier besoin —
// aucune migration de la feuille "Planning" elle-même. Une récurrence porte
// UN texte sur UN jour de la semaine (lundi..vendredi), de l'un de ces
// 3 types :
//   - "jalon"    : ligne 4 (jalons d'architecte)
//   - "note"     : ligne 5 (notes libres)
//   - "personne" : le détail d'une case précise (ancre = ligne de la
//                  personne dans "Planning", demi = "matin"/"aprem")
//
// Enregistrer une récurrence l'applique IMMÉDIATEMENT à la semaine affichée
// et à toutes celles à venir (jamais les passées, même convention que le
// renommage/la suppression d'une ligne — cf. colonnesLabelDepuis_), puis à
// chaque nouvelle semaine créée automatiquement (cf. creerSemaineWeb_).
//
// Une récurrence "jalon"/"note" s'AJOUTE à la ligne (jamais d'écrasement,
// même logique que apiEnregistrerPlage en mode "ajout"). Une récurrence
// "personne" ne remplit une case QUE SI elle est entièrement vide (aucun
// chantier, aucun détail) ce jour-là sur cette semaine — un remplacement
// manuel n'est jamais recouvert.
//
// Supprimer une récurrence retire aussi, sur la semaine affichée et celles
// à venir, le texte qu'elle avait posé — MAIS seulement là où il est encore
// identique à ce qu'elle avait écrit (une case modifiée depuis n'est jamais
// touchée). Mettre en pause (case "Actif" décochée) n'y touche pas : ça
// arrête seulement les applications futures.
var FEUILLE_RECURRENCES = "Récurrences";
var REC_COL_ID = 1, REC_COL_ACTIF = 2, REC_COL_TYPE = 3, REC_COL_JOUR = 4,
  REC_COL_ANCRE = 5, REC_COL_DEMI = 6, REC_COL_TEXTE = 7, REC_COL_REPERE = 8;

function feuilleRecurrences_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FEUILLE_RECURRENCES);
  if (sh) return sh;
  sh = ss.insertSheet(FEUILLE_RECURRENCES);
  sh.getRange(1, 1, 1, 8)
    .setValues([["ID", "Actif", "Type", "Jour (0=lundi)", "Ligne personne", "Demi-journée", "Texte", "Repère"]])
    .setFontWeight("bold");
  sh.setColumnWidths(1, 8, 130);
  sh.setFrozenRows(1);
  return sh;
}

function ligneRecurrences_(sh) {
  var lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, 8).getValues();
}

function recurrenceDepuisLigne_(ligne) {
  return {
    id: String(v_(ligne, REC_COL_ID - 1)),
    actif: v_(ligne, REC_COL_ACTIF - 1) === true || String(v_(ligne, REC_COL_ACTIF - 1)).toLowerCase() === "true",
    type: String(v_(ligne, REC_COL_TYPE - 1)),
    jour: parseInt(v_(ligne, REC_COL_JOUR - 1), 10),
    ancre: v_(ligne, REC_COL_ANCRE - 1) === "" ? null : parseInt(v_(ligne, REC_COL_ANCRE - 1), 10),
    demi: v_(ligne, REC_COL_DEMI - 1) || null,
    texte: String(v_(ligne, REC_COL_TEXTE - 1)),
    repere: String(v_(ligne, REC_COL_REPERE - 1))
  };
}

function apiListerRecurrences() {
  var sh = feuilleRecurrences_();
  return ligneRecurrences_(sh).map(recurrenceDepuisLigne_).filter(function (r) { return r.id !== ""; });
}

function apiEnregistrerRecurrence(rec, labGCourant) {
  var type = String(rec && rec.type || "");
  if (["jalon", "note", "personne"].indexOf(type) === -1) throw new Error("Type de récurrence invalide.");
  var jour = parseInt(rec.jour, 10);
  if (isNaN(jour) || jour < 0 || jour > 4) throw new Error("Choisis un jour de la semaine.");
  var texte = String(rec.texte == null ? "" : rec.texte).trim();
  if (texte === "") throw new Error("Écris un texte.");
  var ancre = null, demi = null, repere;
  if (type === "personne") {
    ancre = parseInt(rec.ancre, 10);
    if (!ancre) throw new Error("Choisis une personne.");
    demi = (rec.demi === "aprem" || rec.demi === "journee") ? rec.demi : "matin";
    repere = String(rec.nomPersonne || "").trim() || ("ligne " + ancre);
  } else {
    repere = (type === "jalon") ? "Jalon" : "Note";
  }

  return avecVerrou_(function () {
    var sh = feuilleRecurrences_();
    var lignes = ligneRecurrences_(sh);
    var idRec = rec.id ? String(rec.id) : ("r" + new Date().getTime());
    var ligneIdx = -1;
    for (var i = 0; i < lignes.length; i++) { if (String(lignes[i][REC_COL_ID - 1]) === idRec) { ligneIdx = i; break; } }
    var valeurs = [idRec, true, type, jour, ancre || "", demi || "", texte, repere];
    if (ligneIdx === -1) sh.getRange(sh.getLastRow() + 1, 1, 1, 8).setValues([valeurs]);
    else sh.getRange(2 + ligneIdx, 1, 1, 8).setValues([valeurs]);

    var recEnreg = { id: idRec, actif: true, type: type, jour: jour, ancre: ancre, demi: demi, texte: texte, repere: repere };
    var joursTouches = appliquerRecurrenceDepuis_(recEnreg, labGCourant);
    return { ok: true, jours: joursTouches, recurrences: apiListerRecurrences(), semaine: apiChargerSemaine(labGCourant) };
  });
}

// Met en pause / réactive une récurrence SANS toucher à ce qu'elle a déjà
// posé (contrairement à la suppression, cf. plus bas) : ça arrête seulement
// les applications futures (nouvelles semaines, ou "cette semaine et les
// suivantes" si réenregistrée ensuite).
function apiBasculerRecurrence(id, actif, labGCourant) {
  return avecVerrou_(function () {
    var sh = feuilleRecurrences_();
    var lignes = ligneRecurrences_(sh);
    var trouve = false;
    for (var i = 0; i < lignes.length; i++) {
      if (String(lignes[i][REC_COL_ID - 1]) === String(id)) {
        sh.getRange(2 + i, REC_COL_ACTIF).setValue(!!actif);
        trouve = true;
        break;
      }
    }
    if (!trouve) throw new Error("Récurrence introuvable — recharge la page.");
    return { ok: true, recurrences: apiListerRecurrences(), semaine: apiChargerSemaine(labGCourant) };
  });
}

// Supprime la règle ET retire, sur la semaine affichée et celles à venir
// (jamais les passées), le texte qu'elle avait posé — seulement là où il
// est encore identique à ce qu'elle avait écrit (cf. retirerRecurrenceDepuis_).
function apiSupprimerRecurrence(id, labGCourant) {
  return avecVerrou_(function () {
    var sh = feuilleRecurrences_();
    var lignes = ligneRecurrences_(sh);
    var idx = -1, rec = null;
    for (var i = 0; i < lignes.length; i++) {
      if (String(lignes[i][REC_COL_ID - 1]) === String(id)) { idx = i; rec = recurrenceDepuisLigne_(lignes[i]); break; }
    }
    if (idx === -1) throw new Error("Récurrence introuvable — recharge la page.");
    sh.deleteRow(2 + idx);
    var joursTouches = rec ? retirerRecurrenceDepuis_(rec, labGCourant) : 0;
    return { ok: true, jours: joursTouches, recurrences: apiListerRecurrences(), semaine: apiChargerSemaine(labGCourant) };
  });
}

// Applique UNE récurrence à la semaine affichée et à toutes celles à venir
// (jamais les passées, cf. colonnesLabelDepuis_). Renvoie le nombre de jours
// effectivement modifiés (une case déjà à jour ou hors plage ne compte pas).
function appliquerRecurrenceDepuis_(rec, labGDepart) {
  var sh = feuillePlanning_();
  var lc = sh.getLastColumn();
  var cibles = colonnesLabelDepuis_(lc, labGDepart);
  var z = zoneRecurrence_(sh, rec, labGDepart, lc);
  if (!z) return 0;
  var touches = 0;
  cibles.forEach(function (labG) { if (appliquerDansZone_(z, rec, labG)) touches++; });
  if (touches > 0) { z.rng.setValues(z.vals); SpreadsheetApp.flush(); }
  return touches;
}

// ==== ZONE DE TRAVAIL D'UNE RÉCURRENCE ====
// Poser une récurrence sur les semaines à venir se faisait cellule par
// cellule : pour chaque semaine, 1 à 3 lectures puis 1 écriture — soit une
// quarantaine d'appels Sheets pour une récurrence « personne · journée »
// étendue à une dizaine de semaines, l'action la plus lente de toute l'appli.
//
// Les colonnes visées ne sont pas contiguës (une par semaine, tous les 8),
// mais elles tiennent TOUTES dans un seul rectangle : de la semaine de départ
// jusqu'au bout du planning, sur les lignes concernées par le type de
// récurrence. Une lecture, tout le calcul en mémoire, une écriture — le
// principe suivi partout ailleurs dans le projet (cf. note PERFORMANCE en tête
// de Planning_Format.gs), qui manquait seulement ici.
//
// Lignes couvertes :
//   - jalon  -> la ligne 4 seule ;
//   - note   -> la ligne CONFIG.LIGNE_NOTES seule ;
//   - personne -> les 4 lignes du bloc, à partir de rec.ancre. La 1ère ligne
//     du bloc porte aussi le NOM dans la colonne label de chaque semaine
//     (cellule fusionnée, dont rec.ancre est justement l'ancrage) : la même
//     lecture sert donc à vérifier que la personne a bien une ligne cette
//     semaine-là, sans appel supplémentaire.
function zoneRecurrence_(sh, rec, colDebut, colFin) {
  var largeur = colFin - colDebut + 1;
  if (largeur < 1) return null;
  var ligne1 = (rec.type === "personne") ? rec.ancre
             : ((rec.type === "jalon") ? 4 : CONFIG.LIGNE_NOTES);
  var nbLignes = (rec.type === "personne") ? 4 : 1;
  var rng = sh.getRange(ligne1, colDebut, nbLignes, largeur);
  return { rng: rng, vals: rng.getValues(), col0: colDebut, largeur: largeur };
}

// Applique la récurrence à UNE semaine, EN MÉMOIRE dans la zone déjà lue.
// Renvoie true si quelque chose a changé. Règles de non-écrasement inchangées.
function appliquerDansZone_(z, rec, labG) {
  var ic = labG + 1 + rec.jour - z.col0; // colonne du jour visé, dans la zone
  if (ic < 0 || ic >= z.largeur) return false;

  if (rec.type === "personne") {
    var iLab = labG - z.col0; // colonne label de cette semaine, dans la zone
    if (iLab < 0 || iLab >= z.largeur) return false;
    if (String(z.vals[0][iLab] || "").trim() === "") return false; // pas de ligne cette semaine-là
    var touche = false;
    decalagesDemi_(rec.demi).forEach(function (dec) {
      // Chaque demi-journée garde sa propre règle : on ne recouvre jamais un
      // chantier ni un texte déjà présent.
      if (String(z.vals[dec][ic] || "").trim() !== "") return;
      if (String(z.vals[dec + 1][ic] || "").trim() !== "") return;
      z.vals[dec + 1][ic] = rec.texte;
      touche = true;
    });
    return touche;
  }

  var ancien = String(z.vals[0][ic] || "").trim();
  if (ancien === "") { z.vals[0][ic] = rec.texte; return true; }
  if (lignesDe_(ancien).indexOf(rec.texte) !== -1) return false; // déjà présent, rien à ajouter
  z.vals[0][ic] = ancien + "\n" + rec.texte;
  return true;
}

// Retrait de la récurrence sur UNE semaine, en mémoire. Ne touche que ce que
// la récurrence avait elle-même écrit : une case modifiée depuis est laissée
// telle quelle.
function retirerDansZone_(z, rec, labG) {
  var ic = labG + 1 + rec.jour - z.col0;
  if (ic < 0 || ic >= z.largeur) return false;

  if (rec.type === "personne") {
    var touche = false;
    decalagesDemi_(rec.demi).forEach(function (dec) {
      var brut = String(z.vals[dec + 1][ic] || "").trim().replace(/^-\s+/, "");
      if (brut !== rec.texte) return; // modifié depuis l'application : on ne touche pas
      z.vals[dec + 1][ic] = "";
      touche = true;
    });
    return touche;
  }

  var ancien = String(z.vals[0][ic] || "").trim();
  if (ancien === "") return false;
  var nouveau = lignesDe_(ancien).filter(function (l) { return l !== rec.texte; }).join("\n");
  if (nouveau === ancien) return false; // cette ligne n'y était déjà plus
  z.vals[0][ic] = nouveau;
  return true;
}

// Décalages de ligne (par rapport à "ancre", la ligne "chantier matin" du
// bloc de 4) pour une demi-journée matin / après-midi / journée entière.
// "journee" (demande de Lionel, 27.08.2026) traite les 2 demi-journées
// INDÉPENDAMMENT — chacune garde sa propre règle de non-écrasement, donc une
// case déjà occupée d'un seul côté n'empêche jamais l'autre de recevoir le
// texte.
function decalagesDemi_(demi) {
  if (demi === "aprem") return [2];
  if (demi === "journee") return [0, 2];
  return [0];
}

// Applique une récurrence à UNE SEULE semaine — utilisé ci-dessus, et juste
// après la création d'une nouvelle semaine (cf. creerSemaineWeb_). Renvoie
// true si quelque chose a été écrit.
// Une seule semaine : même règle, même code — juste une zone réduite à ce
// bloc de 8 colonnes. Garder UNE implémentation de la règle (appliquerDansZone_)
// évite que les deux chemins divergent avec le temps.
function appliquerRecurrenceSurSemaine_(sh, rec, labG) {
  var z = zoneRecurrence_(sh, rec, labG, Math.min(labG + 7, sh.getLastColumn()));
  if (!z) return false;
  if (!appliquerDansZone_(z, rec, labG)) return false;
  z.rng.setValues(z.vals);
  return true;
}

// Retire ce qu'une récurrence avait posé, sur la semaine affichée et celles
// à venir (jamais les passées). Renvoie le nombre de jours modifiés.
function retirerRecurrenceDepuis_(rec, labGDepart) {
  var sh = feuillePlanning_();
  var lc = sh.getLastColumn();
  var cibles = colonnesLabelDepuis_(lc, labGDepart);
  var z = zoneRecurrence_(sh, rec, labGDepart, lc);
  if (!z) return 0;
  var touches = 0;
  cibles.forEach(function (labG) { if (retirerDansZone_(z, rec, labG)) touches++; });
  if (touches > 0) { z.rng.setValues(z.vals); SpreadsheetApp.flush(); }
  return touches;
}

// ==== SÉRIE (round transfert V3, §4) : occurrences matérialisées, PAS de règle "live" ====
//
// Contrairement à "Récurrences" ci-dessus (hebdomadaire fixe, sans fin, sans
// intervalle — modèle totalement différent, laissé tel quel, non touché),
// une SÉRIE est immédiatement développée en occurrences CONCRÈTES : chaque
// occurrence est une ligne de tâche/jalon/note normale, écrite comme
// n'importe quelle autre, simplement taguée [Série:xxxxxx] (cf. section
// "CONVENTIONS TEXTE" en tête de fichier, decoderLigneTache_/encoderLigneTache_
// déjà étendues pour ce tag). Reprend TEL QUEL le modèle V3 (approche déjà
// validée, cf. TRANSFERT-V3-SPEC.md §4) plutôt que de faire évoluer
// "Récurrences" vers ce modèle.
//
// Les dates d'occurrence, elles, ne reprennent PAS l'espace `gi` de grille
// affichée de V3 (window-relative, cf. §1 du contrat) : le serveur travaille
// en dates RÉELLES directement (pasCalendaire_ ci-dessous), plus simple —
// pas de fenêtre affichée à raisonner ici, juste du calendrier.
var MAX_OCCURRENCES_SERIE = 366;
// Une série peut viser des dates bien au-delà des SEMAINES_AVANCE semaines
// gardées d'avance par apiDemarrer (ex. "chaque semaine, 52 occurrences" =
// un an) : on crée donc les semaines manquantes au fur et à mesure, comme
// calculerPlanDecalage_ le fait déjà pour un décalage — mais avec un plafond
// plus généreux (14 mois de plus, contre 10 semaines pour un décalage, qui
// lui ne vise jamais qu'un horizon proche). Au-delà, une occurrence trop
// lointaine est simplement IGNORÉE (best-effort, jamais bloquant pour les
// occurrences qui, elles, rentrent dans le plafond — même philosophie que
// les récurrences hebdomadaires, cf. creerSemaineWeb_).
var SERIE_MAX_SEMAINES_CREEES = 60;

function genererSerieId_() {
  var alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  var s = "";
  for (var i = 0; i < 6; i++) s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return "s" + s;
}

// Arithmétique de Date RÉELLE (cf. §4 du contrat — pas de logique d'espace de
// grille façon V3, le serveur n'a pas de fenêtre affichée à raisonner) :
//  - "jour"    : dateDébut + index*intervalle jours calendaires.
//  - "semaine" : dateDébut + index*intervalle*7 jours.
//  - "mois"    : dateDébut avec setMonth(mois + index*intervalle) — même
//                gestion de fin de mois par débordement naturel de Date que
//                "ajouterMois" du prototype V3 (ex. 31 janvier + 1 mois
//                déborde proprement sur début mars si février n'a pas 31
//                jours, comportement JS natif, assumé tel quel).
//  - "annee"   : setFullYear(année + index*intervalle).
function pasCalendaire_(dateDebutIso, frequence, intervalle, index) {
  var d = dateDepuisIso_(dateDebutIso);
  if (!d) throw new Error("Date de départ de série invalide.");
  var n = (parseInt(intervalle, 10) || 1) * index;
  if (frequence === "jour") d.setDate(d.getDate() + n);
  else if (frequence === "semaine") d.setDate(d.getDate() + n * 7);
  else if (frequence === "mois") d.setMonth(d.getMonth() + n);
  else if (frequence === "annee") d.setFullYear(d.getFullYear() + n);
  else throw new Error("Fréquence de série invalide.");
  return d;
}

// Développe la définition d'une série en tableau de Date, borné à
// MAX_OCCURRENCES_SERIE (garde-fou, comme V3).
function genererDatesSerie_(dateDebutIso, frequence, intervalle, finType, finValeur) {
  var dates = [];
  if (finType === "occurrences") {
    var total = Math.max(1, Math.min(parseInt(finValeur, 10) || 1, MAX_OCCURRENCES_SERIE));
    for (var i = 0; i < total; i++) dates.push(pasCalendaire_(dateDebutIso, frequence, intervalle, i));
  } else if (finType === "date") {
    var finIso = String(finValeur || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finIso)) throw new Error("Date de fin de série invalide.");
    for (var j = 0; j < MAX_OCCURRENCES_SERIE; j++) {
      var d = pasCalendaire_(dateDebutIso, frequence, intervalle, j);
      if (isoJour(d) > finIso) break;
      dates.push(d);
    }
  } else {
    throw new Error("Type de fin de série invalide.");
  }
  if (dates.length === 0) throw new Error("Cette définition de série ne produit aucune occurrence.");
  return dates;
}

// Localise une date ISO dans le planning : { labG, offset } (offset 0=Lundi
// .. 6=Dimanche), ou null si cette date n'est dans AUCUNE semaine existante.
// Réutilise listerSemainesPlanning (Planning_Format.gs) — jamais de nouvelle
// recherche de colonne réinventée ici, cf. §4 du contrat.
function positionSemaine_(sh, iso) {
  var semaines = listerSemainesPlanning(sh);
  for (var i = 0; i < semaines.length; i++) {
    var debutIso = isoJour(semaines[i].dateDebut), finIso = isoJour(semaines[i].dateFin);
    if (iso < debutIso || iso > finIso) continue;
    var d = dateDepuisIso_(iso);
    var offset = Math.round((d.getTime() - semaines[i].dateDebut.getTime()) / 86400000);
    return { labG: semaines[i].labG, offset: offset };
  }
  return null;
}

// Écrit UNE occurrence de série (déjà positionnée : labG connu, offset
// 0=Lundi..6=Dimanche déjà calculé) — AJOUT, jamais remplacement (une série
// vient s'ajouter au contenu déjà présent ce jour-là, comme une récurrence,
// jamais l'écraser). Renvoie true si effectivement écrite (false = ignorée,
// cf. note ci-dessous pour jalon/note en week-end).
function ecrireOccurrenceSerie_(sh, type, bloc, payload, labG, offset, texte, serieId) {
  var ligne = { texte: texte, statut: payload.statut || null, important: !!payload.important, serieId: serieId };

  if (type === "tache") {
    var demi = (payload.demi === "aprem") ? "aprem" : "matin";
    if (offset <= 4) {
      var chantierRow = bloc.startRow + (demi === "matin" ? 0 : 2);
      var col = labG + 1 + offset;
      var celluleDetail = sh.getRange(chantierRow + 1, col);
      var taches = decoderTaches_(celluleDetail.getValue());
      taches.push(ligne);
      celluleDetail.setValue(tirets(encoderTaches_(taches)));
      // Chantier : posé une fois, JAMAIS écrasé (même logique que les
      // récurrences "personne" — cf. appliquerDansZone_ : "ne recouvre
      // jamais un chantier déjà présent"). Pas de tag [Série:xxxxxx] sur
      // cette valeur (c'est un champ simple, pas une ligne de tâche) :
      // apiModifierSerie/apiSupprimerSerie ne la touchent donc jamais — cf.
      // BACKEND-CHANGELOG.md.
      if (payload.chantier) {
        var celluleChantier = sh.getRange(chantierRow, col);
        if (String(celluleChantier.getValue() || "").trim() === "") celluleChantier.setValue(String(payload.chantier).trim());
      }
      return true;
    }
    // Week-end (offset 5=Samedi, 6=Dimanche) : cf. section "CELLULE
    // WEEK-END" en tête de fichier — une seule cellule physique (jj=6),
    // AJOUT taggé explicitement [S]/[D] (ajouterLigneWeekend_ : une
    // occurrence de série est par construction propre à SON jour, jamais
    // fusionnée avec l'autre par la règle "même chose les 2 jours", qui ne
    // vaut que pour une édition manuelle depuis la fiche personne).
    var jourTag = (offset === 5) ? "S" : "D";
    // BUGFIX (vérif transfert V3, même correction qu'apiEnregistrerCellulePersonne
    // ci-dessus) : colonne physique = labG+6 (jj=6, Samedi), pas labG+1+6.
    var colWE = labG + 6;
    var celluleWE = sh.getRange(bloc.startRow, colWE);
    var ancienWE = celluleWE.getValue();
    var nouveauWE = ajouterLigneWeekend_(ancienWE, jourTag, ligne);
    if (payload.chantier) {
      var chantierDeja = vueJourWeekend_(decoderCelluleWeekend_(nouveauWE), jourTag).chantier;
      if (!chantierDeja) {
        var ligneEncodee = encoderLigneTache_(ligneChantierWE_(jourTag, payload.chantier));
        nouveauWE = tirets((nouveauWE.trim() === "") ? ligneEncodee : (nouveauWE + "\n" + ligneEncodee));
      }
    }
    celluleWE.setValue(nouveauWE);
    return true;
  }

  // jalon/note : le week-end (offset 5/6) est HORS SCOPE ici — la ligne 4
  // (jalons) comme la ligne 5 (notes) n'ont, pour le week-end, aucune
  // convention établie côté apiEnregistrerJalonNote/apiEnregistrerPlage
  // (toutes deux restrictent déjà 0<=jourIdx<=4, non touchées par ce round —
  // cf. TRANSFERT-V3-SPEC.md §2, qui ne parle QUE des cases personnel). Une
  // occurrence de série "jalon"/"note" tombant un samedi/dimanche est donc
  // ignorée plutôt que d'inventer une convention non demandée.
  if (offset > 4) return false;
  var row = (type === "jalon") ? 4 : CONFIG.LIGNE_NOTES;
  var col2 = labG + 1 + offset;
  var cellule = sh.getRange(row, col2);

  if (type === "jalon") {
    // Jalon : case à VALEUR UNIQUE (comme apiEnregistrerJalonNote/
    // apiEnregistrerPlage, non touchées) — pas de liste d'entrées possible
    // ici contrairement aux notes juste en dessous. Une occurrence de série
    // n'est donc posée QUE si la case est encore vide ce jour-là (jamais
    // deux jalons le même jour ; cohérent avec le principe "jamais
    // d'écrasement" des autres écritures de série). Le tag [Série:xxxxxx]
    // est ajouté en tête via encoderLigneTache_ (round "idem pour les
    // modifications de série", 01.09.2026), désormais décodé
    // symétriquement par apiChargerSemaine — AVANT ce correctif, rien ne le
    // décodait à la lecture et le tag s'affichait tel quel en texte visible
    // côté client, cf. BACKEND-CHANGELOG.md.
    var ancienJ = String(cellule.getValue() == null ? "" : cellule.getValue());
    if (ancienJ.trim() !== "") return false; // jour déjà occupé : occurrence ignorée, jamais écrasée
    cellule.setValue(encoderLigneTache_({ texte: texte, serieId: serieId }) || "");
    return true;
  }

  // Note : décodée/réencodée via decoderNotesJour_/encoderNotesJour_, qui
  // décode n'importe quel texte brut existant sans le déformer (aucun
  // crochet reconnu -> chaque ligne devient une entrée telle quelle) : 100%
  // rétrocompatible, cf. BACKEND-CHANGELOG.md.
  var entrees = decoderNotesJour_(cellule.getValue());
  entrees.push({ texte: texte, important: !!payload.important, serieId: serieId, jour: null });
  cellule.setValue(encoderNotesJour_(entrees));
  return true;
}

function apiEnregistrerSerie(payload, labGCourant) {
  if (!payload) throw new Error("Série invalide.");
  var type = String(payload.type || "");
  if (["tache", "jalon", "note"].indexOf(type) === -1) throw new Error("Type de série invalide.");
  var texteBase = String(payload.texte == null ? "" : payload.texte).trim();
  if (texteBase === "") throw new Error("Écris un texte.");
  if (type === "tache" && !payload.ancre) throw new Error("Choisis une case.");

  var dates = genererDatesSerie_(payload.dateDebutIso, payload.frequence, payload.intervalle, payload.finType, payload.finValeur);
  var serieId = genererSerieId_();

  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var lr = sh.getLastRow();
    var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
    var bloc = (type === "tache") ? trouverBloc_(pers, payload.ancre) : null;

    var semainesTouchees = {}, semainesCreees = 0;
    dates.forEach(function (d) {
      var iso = isoJour(d);
      var pos = positionSemaine_(sh, iso);
      while (!pos && semainesCreees < SERIE_MAX_SEMAINES_CREEES) {
        creerSemaineWeb_(sh);
        semainesCreees++;
        pos = positionSemaine_(sh, iso);
      }
      if (!pos) return; // trop loin au-delà du plafond de création : ignorée, best-effort
      if (ecrireOccurrenceSerie_(sh, type, bloc, payload, pos.labG, pos.offset, texteBase, serieId)) {
        semainesTouchees[pos.labG] = true;
      }
    });

    if (semainesCreees > 0) formaterPlanning(true); // une seule passe pour toutes les semaines créées, cf. creerSemaineWeb_
    SpreadsheetApp.flush();

    return {
      semaine: apiChargerSemaine(labGCourant),
      semainesTouchees: Object.keys(semainesTouchees).map(function (s) { return parseInt(s, 10); }),
      serieId: serieId
    };
  });
}

// Semaines à parcourir pour une action modifier/supprimer, bornées quand la
// portée le permet (cf. §4 du contrat : "pas la peine de scanner au-delà de
// la plage réellement générée" — faute de connaître cette plage exacte sans
// la stocker séparément, cf. BACKEND-CHANGELOG.md, on borne au moins par la
// portée elle-même, qui donne déjà de vraies limites dans 2 cas sur 3) :
//  - "unique"  : seulement la semaine contenant dateRefIso.
//  - "suivant" : cette semaine et toutes celles d'après (comme
//                colonnesLabelDepuis_, même principe).
//  - "serie"   : TOUTES les semaines existantes — une portée "toute la
//                série" doit pouvoir atteindre une occurrence passée.
function semainesACriblePourSerie_(sh, portee, dateRefIso) {
  var toutes = listerSemainesPlanning(sh);
  if (portee === "serie") return toutes;
  var pos = -1;
  for (var i = 0; i < toutes.length; i++) {
    var debut = isoJour(toutes[i].dateDebut), fin = isoJour(toutes[i].dateFin);
    if (dateRefIso >= debut && dateRefIso <= fin) { pos = i; break; }
  }
  if (pos === -1) return toutes; // date de référence hors planning (rare) : par prudence, on ne prend aucun raccourci
  return (portee === "unique") ? [toutes[pos]] : toutes.slice(pos);
}
function occurrenceEstDansPortee_(iso, portee, dateRefIso) {
  if (portee === "unique") return iso === dateRefIso;
  if (portee === "suivant") return iso >= dateRefIso;
  return true; // "serie"
}

// Cœur PARTAGÉ d'apiModifierSerie/apiSupprimerSerie : parcourt les blocs de
// semaine (bornés par semainesACriblePourSerie_), décode chaque cellule
// candidate (jalon/note lignes 4-5, cases de tâche personnel jours 1-5 +
// week-end), filtre les lignes taguées `serieId` ET dans la portée demandée,
// applique `transformer` à CHACUNE (retourne l'entrée modifiée, ou null pour
// la retirer), ré-encode, écrit. Ne réinvente pas la recherche de colonne
// (listerSemainesPlanning, réutilisé via semainesACriblePourSerie_) ni le
// découpage en blocs personne (detecterPersonnes). Renvoie la liste des labG
// effectivement modifiés.
function traiterOccurrencesSerie_(sh, serieId, portee, dateRefIso, transformer, chantierAAppliquer) {
  var lc = sh.getLastColumn(), lr = sh.getLastRow();
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  var semaines = semainesACriblePourSerie_(sh, portee, dateRefIso);
  var touchees = {};

  semaines.forEach(function (sem) {
    var labG = sem.labG;
    var largeur = Math.min(8, lc - labG + 1);
    var debut = sem.dateDebut;
    function isoDecale_(off) { return isoJour(new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + off)); }

    // --- jalon (ligne 4) : case à VALEUR UNIQUE (round "idem pour les
    //     modifications de série", 01.09.2026 — contrairement aux notes
    //     juste après, jamais de liste d'entrées indépendantes sur une même
    //     case, cf. ecrireOccurrenceSerie_/apiEnregistrerJalonNote). Jours
    //     1-5 uniquement (cf. note dans ecrireOccurrenceSerie_ : pas de
    //     week-end pour jalon/note).
    (function () {
      var rng = sh.getRange(4, labG, 1, largeur);
      var vals = rng.getValues()[0];
      var modifie = false;
      for (var off = 0; off <= 4 && off + 1 < largeur; off++) {
        var iso = isoDecale_(off);
        var entree = decoderLigneTache_(String(v_(vals, off + 1) || ""));
        if (entree.serieId !== serieId || !occurrenceEstDansPortee_(iso, portee, dateRefIso)) continue;
        var t = transformer(entree);
        vals[off + 1] = t ? (encoderLigneTache_(t) || "") : "";
        modifie = true;
      }
      if (modifie) { rng.setValues([vals]); touchees[labG] = true; }
    })();

    // --- note (ligne 5) : plusieurs entrées indépendantes possibles par case.
    (function () {
      var rng = sh.getRange(CONFIG.LIGNE_NOTES, labG, 1, largeur);
      var vals = rng.getValues()[0];
      var modifie = false;
      for (var off = 0; off <= 4 && off + 1 < largeur; off++) {
        var iso = isoDecale_(off);
        var entrees = decoderNotesJour_(v_(vals, off + 1));
        var localeModif = false, restantes = [];
        entrees.forEach(function (e) {
          if (e.serieId !== serieId || !occurrenceEstDansPortee_(iso, portee, dateRefIso)) { restantes.push(e); return; }
          localeModif = true;
          var t = transformer(e);
          if (t) restantes.push(t);
        });
        if (localeModif) { vals[off + 1] = encoderNotesJour_(restantes); modifie = true; }
      }
      if (modifie) { rng.setValues([vals]); touchees[labG] = true; }
    })();

    // --- personnel : cases de tâche (jours 1-5) + cellule week-end (jj=6).
    if (pers.length > 0) {
      var r1 = pers[0].startRow, r2 = pers[pers.length - 1].endRow;
      var zone = sh.getRange(r1, labG, r2 - r1 + 1, largeur);
      var zVals = zone.getValues();
      var zoneModifiee = false;

      pers.forEach(function (bloc) {
        var iAncre = bloc.startRow - r1;
        [0, 2].forEach(function (decDemi) {
          var iD = iAncre + decDemi + 1;
          if (iD < 0 || iD >= zVals.length) return;
          for (var off = 0; off <= 4 && off + 1 < largeur; off++) {
            var iso = isoDecale_(off);
            var taches = decoderTaches_(v_(zVals[iD], off + 1));
            var localeModif = false, restantes = [];
            taches.forEach(function (t) {
              if (t.serieId !== serieId || !occurrenceEstDansPortee_(iso, portee, dateRefIso)) { restantes.push(t); return; }
              localeModif = true;
              var nt = transformer(t);
              if (nt) restantes.push(nt);
            });
            if (localeModif) {
              zVals[iD][off + 1] = tirets(encoderTaches_(restantes));
              zoneModifiee = true;
              // Chantier (round "idem pour les modifications de série",
              // 01.09.2026) : contrairement à l'AJOUT d'une nouvelle
              // occurrence (ecrireOccurrenceSerie_, "jamais écrasé"), une
              // MODIFICATION explicite de série écrase le chantier du jour
              // touché — même sémantique qu'une case normale
              // (apiEnregistrerCellulePersonne, remplacement intégral). Champ
              // simple, non tagué par ligne : appliqué à la case entière du
              // jour, pas par tâche individuelle.
              if (chantierAAppliquer !== null && chantierAAppliquer !== undefined) {
                zVals[iAncre + decDemi][off + 1] = chantierAAppliquer;
              }
            }
          }
        });

        if (largeur >= 7) {
          var brutWE = String(v_(zVals[iAncre], 6));
          if (brutWE !== "") {
            var lignesWE = decoderCelluleWeekend_(brutWE);
            var isoSam = isoDecale_(5), isoDim = isoDecale_(6);
            var localeModifWE = false, restantesWE = [];
            lignesWE.forEach(function (l) {
              if (l.estChantier || l.serieId !== serieId) { restantesWE.push(l); return; }
              var isoOcc = (l.jour === "D") ? isoDim : isoSam; // écrite par une série : toujours taguée S ou D, cf. ecrireOccurrenceSerie_
              if (!occurrenceEstDansPortee_(isoOcc, portee, dateRefIso)) { restantesWE.push(l); return; }
              localeModifWE = true;
              var nl = transformer(l);
              if (nl) restantesWE.push(nl);
            });
            if (localeModifWE) {
              zVals[iAncre][6] = tirets(restantesWE.map(encoderLigneTache_).filter(function (x) { return x !== null; }).join("\n"));
              zoneModifiee = true;
            }
          }
        }
      });

      if (zoneModifiee) { zone.setValues(zVals); touchees[labG] = true; }
    }
  });

  return Object.keys(touchees).map(function (s) { return parseInt(s, 10); });
}

// portee = 'unique' (seule l'occurrence à dateRefIso) | 'suivant' (dateRefIso
// et toutes les occurrences ultérieures de cette série) | 'serie' (toutes).
// modifs = {texte, statut, important, chantier} (sous-ensemble, undefined =
// inchangé). Le champ `chantier` (round "idem pour les modifications de
// série", 01.09.2026 — AVANT ce correctif, silencieusement ignoré, cf.
// FRONTEND-CHANGELOG.md) s'applique désormais aux occurrences de type
// "tache" en semaine (jours 1-5) : le chantier n'étant pas une ligne taguée
// [Série:xxxxxx] mais un champ simple partagé par la case du jour (comme une
// case normale, cf. apiEnregistrerCellulePersonne), il est écrasé sur
// CHAQUE jour où au moins une tâche de cette série a été effectivement
// touchée par cette modification — même sémantique de remplacement intégral
// qu'une case éditée normalement. Toujours PAS appliqué au week-end (le
// chantier y est lui aussi un champ simple non tagué, cf.
// ecrireOccurrenceSerie_) ni aux jalons/notes (sans chantier) — limite
// documentée dans BACKEND-CHANGELOG.md.
function apiModifierSerie(serieId, portee, dateRefIso, modifs, labGCourant) {
  if (!serieId) throw new Error("Série invalide.");
  if (["unique", "suivant", "serie"].indexOf(portee) === -1) throw new Error("Portée invalide.");
  var chantierAAppliquer = null;
  if (modifs && modifs.chantier !== undefined && modifs.chantier !== null) {
    var c = String(modifs.chantier).trim();
    if (c !== "") chantierAAppliquer = c;
  }
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var touchees = traiterOccurrencesSerie_(sh, serieId, portee, dateRefIso, function (t) {
      var nt = { statut: t.statut, texte: t.texte, important: t.important, serieId: t.serieId, jour: t.jour };
      if (modifs) {
        if (modifs.texte !== undefined) nt.texte = String(modifs.texte == null ? "" : modifs.texte).trim();
        if (modifs.statut !== undefined) nt.statut = modifs.statut || null;
        if (modifs.important !== undefined) nt.important = !!modifs.important;
      }
      return nt;
    }, chantierAAppliquer);
    SpreadsheetApp.flush();
    return { semaine: apiChargerSemaine(labGCourant), semainesTouchees: touchees };
  });
}

function apiSupprimerSerie(serieId, portee, dateRefIso, labGCourant) {
  if (!serieId) throw new Error("Série invalide.");
  if (["unique", "suivant", "serie"].indexOf(portee) === -1) throw new Error("Portée invalide.");
  return avecVerrou_(function () {
    var sh = feuillePlanning_();
    var touchees = traiterOccurrencesSerie_(sh, serieId, portee, dateRefIso, function () { return null; });
    SpreadsheetApp.flush();
    return { semaine: apiChargerSemaine(labGCourant), semainesTouchees: touchees };
  });
}

// ==== AJOUT LOINTAIN — poser une entrée à une date éloignée ================
// Round du 02.09.2026, demande de Lionel : « j'ai besoin d'un bouton pour un
// formulaire qui me permettrait d'entrer une note/jalon/tâche/congé à
// n'importe qui […] plus loin dans le temps sans défiler tout le calendrier,
// avec durée. Exemple : un ouvrier prend congé 1 semaine au mois de novembre. »
//
// Deux obstacles, tous deux traités ici :
//
// 1. LES SEMAINES VISÉES N'EXISTENT PAS ENCORE. Le planning n'est créé qu'à
//    SEMAINES_AVANCE (5) semaines devant, donc novembre n'a aucune colonne en
//    septembre. assurerSemainesJusqua_ les crée à la demande, puis lance UNE
//    seule passe de mise en forme (même principe qu'assurerSemainesAvance_).
//
// 2. TOUT SE FAIT EN UN SEUL APPEL. Une semaine de congé sur les 2 demi-
//    journées, c'est 10 cases : les écrire une par une depuis le client ferait
//    10 allers-retours. Le client envoie donc l'intention (qui, quoi, quand,
//    combien de temps) et le serveur pose tout.
//
// Jalons et notes réutilisent apiEnregistrerPlage, qui savait déjà écrire un
// même texte sur une plage de dates traversant plusieurs semaines — rien à
// réinventer, juste les semaines à faire exister d'abord.

// Crée les semaines manquantes jusqu'à couvrir isoCible. Retourne le nombre
// créé. Plafonné : une saisie erronée (année 2199) ne doit pas partir en
// boucle et faire expirer le script.
var MAX_CREATIONS_AJOUT_LOINTAIN = 60; // ~14 mois d'avance, largement au-delà d'un usage normal
function assurerSemainesJusqua_(sh, isoCible) {
  var semaines = listerSemainesPlanning(sh);
  if (semaines.length === 0) throw new Error("Le planning ne contient encore aucune semaine.");
  var creees = 0;
  while (creees < MAX_CREATIONS_AJOUT_LOINTAIN) {
    var derniere = semaines[semaines.length - 1];
    if (isoJour(derniere.dateFin) >= isoCible) break; // la cible est déjà couverte
    creerSemaineWeb_(sh);
    creees++;
    semaines = listerSemainesPlanning(sh);
  }
  if (creees > 0) formaterPlanning(true); // UNE seule mise en forme pour toutes les semaines créées
  return creees;
}

// Les nbJours premiers jours OUVRÉS à partir d'isoDebut (samedi/dimanche
// sautés, jamais comptés). Un congé "d'une semaine" = 5 jours ouvrés.
function joursOuvresDepuis_(isoDebut, nbJours) {
  var d = dateDepuisIso_(isoDebut);
  if (!d) throw new Error("Date de début invalide.");
  var out = [], garde = 0;
  while (out.length < nbJours && garde < 400) {
    var jour = d.getDay(); // 0 = dimanche, 6 = samedi
    if (jour !== 0 && jour !== 6) out.push(isoJour(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    garde++;
  }
  return out;
}

// (labG, jourIdx 0..4) de la date donnée, ou null si aucune semaine ne la
// couvre (ne devrait plus arriver après assurerSemainesJusqua_, mais on ne
// suppose jamais : une date de week-end, elle, n'a légitimement pas de place).
function positionDuJour_(semaines, iso) {
  for (var i = 0; i < semaines.length; i++) {
    var s = semaines[i];
    if (iso < isoJour(s.dateDebut) || iso > isoJour(s.dateFin)) continue;
    var d = dateDepuisIso_(iso), jour = d.getDay();
    if (jour === 0 || jour === 6) return null;
    return { labG: s.labG, jourIdx: (jour + 6) % 7 }; // lundi=0 … vendredi=4
  }
  return null;
}

// Pose UNE ligne de tâche/absence dans la case (personne, demi, jour), sans
// rien écraser : la ligne s'ajoute à celles déjà présentes, exactement comme
// une occurrence de série (cf. ecrireOccurrenceSerie_). Le chantier n'est posé
// que si la case n'en a pas déjà un — jamais recouvert.
function ajouterLignePersonne_(sh, bloc, labG, jourIdx, demi, ligne, chantier) {
  var chantierRow = bloc.startRow + (demi === "aprem" ? 2 : 0);
  var col = labG + 1 + jourIdx;
  var celluleDetail = sh.getRange(chantierRow + 1, col);
  var taches = decoderTaches_(celluleDetail.getValue());
  taches.push(ligne);
  celluleDetail.setValue(tirets(encoderTaches_(taches)));
  if (chantier) {
    var celluleChantier = sh.getRange(chantierRow, col);
    if (String(celluleChantier.getValue() || "").trim() === "") celluleChantier.setValue(String(chantier).trim());
  }
}

// payload = { type: "tache"|"absence"|"note"|"jalon", ancre, demi:
// "matin"|"aprem"|"jour", isoDebut, nbJours, texte, chantier, statut,
// important }. labGCourant sert seulement à renvoyer la semaine AFFICHÉE
// rafraîchie, pour que le client n'ait pas à la redemander.
function apiAjoutLointain(payload, labGCourant) {
  payload = payload || {};
  var type = String(payload.type || "").trim();
  if (["tache", "absence", "note", "jalon"].indexOf(type) === -1) throw new Error("Type d'entrée invalide.");
  var texte = String(payload.texte == null ? "" : payload.texte).trim();
  if (texte === "") throw new Error("Écris un texte.");
  var isoDebut = String(payload.isoDebut || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDebut)) throw new Error("Choisis une date de début.");
  var nbJours = Math.max(1, Math.min(60, parseInt(payload.nbJours, 10) || 1));

  var jours = joursOuvresDepuis_(isoDebut, nbJours);
  if (!jours.length) throw new Error("Aucun jour ouvré dans cette période.");
  var isoFin = jours[jours.length - 1];

  // ATTENTION — JAMAIS DE VERROU IMBRIQUÉ ICI. avecVerrou_ prend le verrou de
  // script ; apiEnregistrerPlage (branche note/jalon) le prend elle aussi.
  // Les emboîter ferait attendre à cette exécution un verrou qu'elle détient
  // déjà : échec systématique au bout de 15 s, sur une fonction qui a l'air
  // correcte. Les étapes sont donc SÉQUENTIELLES, chacune avec son verrou.
  // L'ensemble n'est pas atomique, ce qui est sans conséquence ici (un seul
  // utilisateur, et chaque étape est cohérente pour elle-même).

  // --- Étape 1 : faire exister les semaines visées (sous verrou) ---
  var creation = avecVerrou_(function () {
    var sh = feuillePlanning_();
    var creees = assurerSemainesJusqua_(sh, isoFin);
    var semaines = listerSemainesPlanning(sh);
    var derniereFin = isoJour(semaines[semaines.length - 1].dateFin);
    if (derniereFin < isoFin) {
      throw new Error("Cette date est trop éloignée : le planning ne peut pas être étendu jusque-là en une fois (" +
        MAX_CREATIONS_AJOUT_LOINTAIN + " semaines maximum). Choisis une date plus proche.");
    }
    return { creees: creees, semaines: semaines };
  });

  // --- Étape 2 : écrire (verrou pris par l'étape elle-même) ---
  var joursEcrits = 0;
  if (type === "note" || type === "jalon") {
    // apiEnregistrerPlage savait déjà écrire un même texte sur tous les jours
    // ouvrés d'une plage, à travers plusieurs semaines, sans rien écraser
    // (mode "ajout"). Elle prend son propre verrou : appelée ici HORS du
    // nôtre, jamais dedans.
    apiEnregistrerPlage(type, isoDebut, isoFin, texte, labGCourant, null, "ajout", !!payload.important,
      (payload.demi === "matin" || payload.demi === "aprem") ? payload.demi : null);
    joursEcrits = jours.length;
  } else {
    var ancre = parseInt(payload.ancre, 10);
    if (!ancre) throw new Error("Choisis une personne.");
    joursEcrits = avecVerrou_(function () {
      var sh = feuillePlanning_();
      var lr = sh.getLastRow();
      var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
      var bloc = trouverBloc_(pers, ancre);
      var demis = (payload.demi === "matin" || payload.demi === "aprem") ? [payload.demi] : ["matin", "aprem"];
      var ligne = {
        texte: texte,
        statut: (type === "tache" && payload.statut) ? payload.statut : null,
        important: !!payload.important,
        serieId: null
      };
      var chantier = (type === "tache" && payload.chantier) ? payload.chantier : null;
      var n = 0;
      jours.forEach(function (iso) {
        var pos = positionDuJour_(creation.semaines, iso);
        if (!pos) return; // jour hors planning (ne devrait plus arriver après l'étape 1)
        demis.forEach(function (demi) {
          ajouterLignePersonne_(sh, bloc, pos.labG, pos.jourIdx, demi, ligne, chantier);
        });
        n++;
      });
      SpreadsheetApp.flush();
      if (chantier) recolorerChantiers(); // le chantier posé doit prendre sa couleur
      return n;
    });
  }

  return {
    ok: true,
    joursEcrits: joursEcrits,
    semainesCreees: creation.creees,
    debut: isoDebut,
    fin: isoFin,
    // Liste des semaines à jour : sans elle, le client ignorerait l'existence
    // des semaines qui viennent d'être créées et ne pourrait pas naviguer
    // jusqu'à ce qu'il vient de poser.
    semaines: creation.semaines.map(function (s) {
      return { labG: s.labG, num: s.num, debut: isoJour(s.dateDebut), fin: isoJour(s.dateFin) };
    })
  };
}
