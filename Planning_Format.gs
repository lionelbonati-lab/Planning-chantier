/**
 * SCRIPT UNIQUE — Planning + Chantier
 * A coller intégralement dans Extensions > Apps Script (remplace tout).
 *
 * Ce fichier fusionne :
 *  - la mise en forme automatique de la feuille "Planning" (4 lignes / personne :
 *    2 demi-journées, chacune avec sa propre ligne "Chantier" compacte suivie
 *    de sa ligne de détail)
 *  - la coloration automatique des chantiers dans la feuille "Chantier"
 *
 * Les deux fonctionnalités partagent la même feuille de calcul et doivent
 * donc vivre dans UN SEUL projet Apps Script : c'est pourquoi elles sont
 * réunies ici plutôt qu'en deux scripts séparés (deux fonctions onEdit dans
 * deux fichiers du même projet se marchent dessus, une seule survit).
 *
 * À l'ouverture du fichier, les semaines passées (dont le dernier jour est
 * avant aujourd'hui) sont automatiquement masquées (colonnes cachées) — cf.
 * masquerSemainesPassees(), appelée silencieusement depuis onOpen(). Le menu
 * 🔧 Planning > 👁️ Réafficher toutes les semaines permet de tout redémasquer
 * au besoin.
 *
 * Chaque feuille d'impression générée est aussi exportée en PDF dans
 * Drive > Boulot > plannings ("Planning sem. <n°>_<année>.pdf", remplacé à
 * chaque réimpression) — y compris depuis la cellule mobile, via un trigger
 * installable dédié (cf. section EXPORT PDF VERS DRIVE, avant imprimerSemaine()).
 *
 * PERFORMANCE — principe suivi partout dans ce fichier : un appel à l'API
 * Google Sheets coûte cher quelle que soit la quantité de données échangée.
 * Tout le calcul se fait donc EN MÉMOIRE (tableaux JS, coût nul), encadré par
 * quelques lectures/écritures groupées. Aucune fonction ne lit ni n'écrit
 * cellule par cellule.
 *
 * Structure fixe (feuille "Planning") :
 * - Colonnes label (noms) : 1, 9, 17, 25, 33... (chaque 8 colonnes)
 * - Entre chaque label : 7 colonnes (5 jours ouvrés + 2 WE)
 * - Lignes 1-3 : en-tête (Mois, Sem, Date) → NE PAS MODIFIER après création
 * - Ligne 4 : jalons du planning d'architecte (délais fixés par l'architecte),
 *   à remplir à la main, fond gris clair. Le nom d'un jour férié n'y est plus
 *   écrit : il apparaît en commentaire sur la date (ligne 3) et le jour se
 *   repère à la couleur de sa colonne (définie dans la feuille "Fériés").
 *   Toujours imprimée (même vide).
 * - Ligne 5 : ligne "notes" libre (choses importantes, à la main), fond
 *   jaune pâle. Contrairement à la ligne 4, elle disparaît de la feuille
 *   d'impression si elle est entièrement vide pour la semaine imprimée.
 * - Ligne 6+ : personnel, 4 lignes par personne (2 demi-journées) :
 *     • ligne 1 : "Chantier" matin (15px, fond = couleur du chantier saisi,
 *       cf. feuille "Chantier")
 *     • ligne 2 : détail de la matinée
 *     • ligne 3 : "Chantier" après-midi (15px, indépendant de la matinée —
 *       permet de changer de chantier à la demi-journée)
 *     • ligne 4 : détail de l'après-midi
 */

var CONFIG = {
  NOM_FEUILLE: "Planning",
  FEUILLE_FERIES: "Fériés",
  FEUILLE_CHANTIER: "Chantier",
  LARGEUR_DATE: 200, LARGEUR_WEEKEND: 20, LARGEUR_LABEL_DATE: 40,
  PREMIERE_LIGNE_PERSO: 6, LIGNES_PAR_PERSONNE: 4,
  HAUTEUR_LIGNE_CHANTIER: 15, HAUTEUR_LIGNE_DEFAUT: 30,
  GRIS_CLAIR: "#f3f3f3", GRIS_FONCE_WE: "#999999", ORANGE_CLAIR_3: "#f9cb9c",
  BLEU_CLAIR3: "#cfe2f3",
  // Ligne 4 = jalons du planning d'architecte (délais fixés par l'architecte,
  // notés jour par jour). Gris clair pour la distinguer des cases de saisie.
  GRIS_JALONS: "#d9d9d9",
  // Ligne 5 = ligne "notes" libre (choses importantes à signaler, à la
  // discrétion de l'équipe — distincte des jalons d'architecte de la ligne 4,
  // qui ne doit jamais servir à autre chose). Jaune pâle pour la distinguer
  // du gris de la ligne 4. Contrairement à la ligne 4 (toujours imprimée),
  // elle est omise de la feuille d'impression si elle est vide cette
  // semaine-là — cf. LIGNE_NOTES dans imprimerSemaine().
  LIGNE_NOTES: 5, JAUNE_NOTES: "#fff2cc",
  ROUGE_TEXTE: "#ff0000", VERT_TEXTE: "#38761d", NOIR_TEXTE: "#000000", BLANC: "#ffffff",
  // Feuille "Chantier"
  CHANTIER_COL_NOM: 1, CHANTIER_COL_COULEUR: 2, CHANTIER_HEADER_ROWS: 1,
  // Feuille "📱 Imprimer" (cellule déclencheur pour imprimer depuis mobile,
  // où les menus personnalisés n'apparaissent pas). Voir onEditMobile().
  FEUILLE_MOBILE: "📱 Imprimer",
  MOBILE_LIGNE_SAISIE: 4, MOBILE_COL_SAISIE: 2, MOBILE_LIGNE_STATUT: 7,
  // Dossier Drive où chaque feuille d'impression est exportée en PDF
  // (Drive > Boulot > plannings). Voir trouverDossierPdf().
  DOSSIER_PDF_RACINE: "Boulot", DOSSIER_PDF_SOUS: "plannings",
};

// Palette pour les chantiers (fond de cellule + lisibilité avec du texte
// noir). 20 teintes, 8 familles de couleurs bien distinctes (bleu, orange,
// turquoise, jaune, magenta, vert, violet, rouge) puis 2 déclinaisons plus
// claires des mêmes familles pour les chantiers en surnombre. Tons pastel,
// choisis à mi-chemin entre l'ancienne palette (trop pâle, disparaissait à
// l'impression) et un premier essai jugé trop soutenu — validé sur papier
// (test d'impression du 21.08.2026). Reste plus doux que ne l'exigerait un
// contraste d'impression maximal ; si ça redevient trop pâle une fois
// imprimé en conditions réelles, augmenter la saturation de chaque teinte
// (ex. mélanger avec moins de blanc) réglerait le problème sans autre
// changement de structure.
var CHANTIER_PALETTE = [
  '#adcbef', '#f8c8b5', '#aee3d0', '#fae5ba', '#f5c4d6', '#bcdebc', '#b8b2dd', '#f5c0c0',
  '#81afe7', '#f4ab8e', '#7bd1b2', '#f7d691', '#efa3c0', '#95cb95', '#938acb', '#f1a1a0',
  '#5493de', '#f08e67', '#3aba8c', '#f4c45f'
];

// ==== STRUCTURE ====
function isLabelCol(col) { return col > 0 && (col - 1) % 8 === 0; }

// --- Notation A1 ---
// Un appel API a un coût fixe important, quelle que soit la quantité de
// données échangée : tout l'enjeu est donc d'en faire le MOINS possible.
// Une RangeList applique un même réglage à des centaines de plages d'un coup ;
// elle se construit à partir de références A1, d'où ces deux helpers.
function colA1(n) {
  var s = "";
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}
function refA1(row, col, numRows, numCols) {
  return colA1(col) + row + ":" + colA1(col + numCols - 1) + (row + numRows - 1);
}
// Applique une opération à une liste de plages, par lots (une RangeList trop
// grosse est refusée) : 1 appel API par lot au lieu d'un appel par plage.
function parLots(sh, refs, fn) {
  for (var i = 0; i < refs.length; i += 200) fn(sh.getRangeList(refs.slice(i, i + 200)));
}

// Lit la ligne 3 (dates) UNE SEULE FOIS pour toute la largeur utile et
// retourne un tableau indexé par colonne { we: bool, date: Date|null,
// ferie: couleur|null } — évite des centaines de getRange(3, col).getValue()
// répétés (gain notable sur une feuille de plusieurs dizaines de semaines).
// feries (optionnel, cf. lireFeries) renseigne la couleur des jours fériés,
// que le formatage doit conserver au lieu de la repeindre en blanc.
function construireCarteColonnes(sheet, lc, feries) {
  var vals = sheet.getRange(3, 1, 1, lc).getValues()[0];
  var map = new Array(lc + 1); // index 1..lc, index 0 inutilisé
  for (var c = 1; c <= lc; c++) {
    if (isLabelCol(c)) { map[c] = { we: false, date: null, ferie: null }; continue; }
    var v = vals[c - 1];
    if (v instanceof Date) {
      var dow = v.getDay(), we = (dow === 0 || dow === 6);
      var f = (feries && !we) ? feries[fmtDK(v)] : null;
      map[c] = { we: we, date: v, ferie: (f && f.couleur) ? f.couleur : null };
    } else {
      map[c] = { we: false, date: null, ferie: null };
    }
  }
  return map;
}
// Largeur voulue pour une colonne (label / week-end / jour ouvré).
function largeurCol(c, colMap) {
  if (isLabelCol(c)) return CONFIG.LARGEUR_LABEL_DATE;
  return colMap[c].we ? CONFIG.LARGEUR_WEEKEND : CONFIG.LARGEUR_DATE;
}
// Applique la hauteur "Chantier" (compacte) aux lignes d'offset pair et la
// hauteur "Détail" (normale) aux lignes d'offset impair d'un bloc personne.
function appliquerHauteursBloc(sh, bloc) {
  for (var r = bloc.startRow; r <= bloc.endRow; r++) {
    sh.setRowHeight(r, ((r - bloc.startRow) % 2 === 0) ? CONFIG.HAUTEUR_LIGNE_CHANTIER : CONFIG.HAUTEUR_LIGNE_DEFAUT);
  }
}

// ==== TRIGGERS ====
// Un seul onEdit pour tout le projet : on distribue selon la feuille modifiée.
function onEdit(e) {
  if (!e || !e.range) return;
  var sheetName = e.range.getSheet().getName();
  if (sheetName === CONFIG.NOM_FEUILLE) {
    onEditPlanning(e);
  } else if (sheetName === CONFIG.FEUILLE_CHANTIER) {
    onEditChantier(e);
  }
  // La feuille "📱 Imprimer" n'est PAS traitée ici : onEditMobile() a besoin
  // de Drive (export PDF), interdit à un simple trigger comme celui-ci (cf.
  // note en tête d'onEditMobile). Elle est déclenchée par un trigger
  // INSTALLABLE séparé, ciblant la même fonction onEditMobile — la brancher
  // aussi ici la ferait tourner deux fois à chaque saisie mobile.
}

// ==== IMPRESSION DEPUIS MOBILE (cellule déclencheur) ====
// Les menus personnalisés (createMenu) n'apparaissent pas dans les appli
// Sheets Android/iOS : c'est une limitation connue de Google, pas un bug de
// ce script. Cette feuille contourne le problème avec une simple cellule :
// taper un n° de semaine dedans déclenche onEditMobile ci-dessous, qui crée
// la feuille d'impression ET l'export PDF (cf. section EXPORT PDF). Ensuite,
// sur la tablette : ouvrir cet onglet → Plus (⋮) > Partager et exporter >
// Imprimer.
//
// IMPORTANT — ceci tourne via un trigger INSTALLABLE dédié (PAS le onEdit(e)
// automatique tout en haut du fichier), créé une fois pour toutes par
// installerTriggerMobile() (menu 📱 Créer/réparer la feuille mobile). Un
// simple trigger classique ne peut pas accéder à Drive (cf. note en tête de
// la section EXPORT PDF) ; un trigger installable, lui, tourne avec les
// pleines autorisations de la personne qui l'a créé, PDF compris — d'où ce
// détour. Tant que ce trigger n'est pas installé, taper un numéro dans
// cette cellule ne fait rien : c'est le signe qu'il faut lancer 📱
// Créer/réparer la feuille mobile une fois depuis un ordinateur (onOpen()
// le rappelle par un toast tant que ce n'est pas fait).
function onEditMobile(e) {
  try {
    var range = e.range, sheet = range.getSheet();
    if (range.getRow() !== CONFIG.MOBILE_LIGNE_SAISIE || range.getColumn() !== CONFIG.MOBILE_COL_SAISIE) return;
    var brut = String(range.getValue()).trim();
    if (brut === "") return; // cellule vidée (par l'utilisateur ou par ce script) : rien à faire

    var ss = sheet.getParent(), sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
    if (!sh) { ecrireStatutMobile(sheet, '❌ Feuille "Planning" introuvable.'); return; }

    var n = parseInt(brut, 10);
    if (isNaN(n)) { ecrireStatutMobile(sheet, "❌ « " + brut + " » n'est pas un numéro de semaine valide."); return; }

    var candidats = listerSemainesPlanning(sh).filter(function (s) { return parseInt(s.num, 10) === n; });
    if (candidats.length === 0) { ecrireStatutMobile(sheet, "❌ Semaine " + n + " introuvable dans le planning."); return; }

    // Si le n° de semaine existe sur plusieurs années, on prend celle dont
    // le début est le plus proche d'aujourd'hui — la plus probable.
    var choisie = candidats[0];
    if (candidats.length > 1) {
      var aujourdhui = new Date();
      candidats.sort(function (a, b) { return Math.abs(a.dateDebut - aujourdhui) - Math.abs(b.dateDebut - aujourdhui); });
      choisie = candidats[0];
    }

    // Trigger installable (cf. note ci-dessus) : Drive est disponible ici,
    // export PDF tenté comme depuis le menu (tenterPdf par défaut = true).
    var resultat = imprimerSemaine(choisie.labG);
    range.clearContent(); // prêt pour la prochaine saisie
    // Onglet supprimé si le PDF a été exporté avec succès (round du
    // 28.08.2026, 3e passage) : plus rien à ouvrir dans ce cas, le message
    // ne doit donc plus le proposer. Gardé (et l'instruction "ouvre l'onglet"
    // reste valable) si l'export a échoué.
    var msg;
    if (resultat.supprimee) {
      msg = "✅ Semaine " + n + " imprimée. " + resultat.pdf.msg;
    } else {
      msg = "✅ Semaine " + n + ' imprimée → onglet "' + resultat.nom + '". Ouvre-le, puis Plus (⋮) > Partager et exporter > Imprimer.';
      if (resultat.pdf) msg += " " + resultat.pdf.msg;
    }
    ecrireStatutMobile(sheet, msg);
  } catch (err) {
    console.error(err);
    try { ecrireStatutMobile(e.range.getSheet(), "❌ Erreur : " + err.message); } catch (e2) { }
  }
}

function ecrireStatutMobile(sheet, texte) {
  var heure = Utilities.formatDate(new Date(), sheet.getParent().getSpreadsheetTimeZone(), "HH:mm");
  sheet.getRange(CONFIG.MOBILE_LIGNE_STATUT, 1).setValue("[" + heure + "] " + texte);
}

// Crée la feuille "📱 Imprimer" si elle n'existe pas encore (appelée
// silencieusement depuis onOpen). N'y retouche jamais si elle existe déjà :
// l'utilisateur a pu la renommer, la déplacer, ou personnaliser sa mise en
// forme sans que ça casse quoi que ce soit.
function assurerFeuilleMobile(ss) {
  if (ss.getSheetByName(CONFIG.FEUILLE_MOBILE)) return;
  var sh = ss.insertSheet(CONFIG.FEUILLE_MOBILE);
  var LS = CONFIG.MOBILE_LIGNE_SAISIE, CS = CONFIG.MOBILE_COL_SAISIE, LST = CONFIG.MOBILE_LIGNE_STATUT;

  sh.getRange("A1:D1").merge().setValue("🖨️ Imprimer une semaine — depuis le mobile")
    .setFontSize(13).setFontWeight("bold").setBackground(CONFIG.GRIS_JALONS).setVerticalAlignment("middle");
  sh.getRange("A3:D3").merge()
    .setValue("Tape un numéro de semaine ci-dessous puis valide (✓ ou Entrée).")
    .setWrap(true).setFontColor("#5f6368");

  sh.getRange(LS, 1).setValue("N° de semaine").setFontWeight("bold").setVerticalAlignment("middle");
  var saisie = sh.getRange(LS, CS);
  saisie.setBackground("#e8f0fe").setFontSize(20).setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle")
    .setBorder(true, true, true, true, null, null, "#1a73e8", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(LS, 44);

  sh.getRange(LST - 1, 1).setValue("Statut").setFontWeight("bold").setVerticalAlignment("middle");
  sh.getRange(LST, 1, 1, 4).merge()
    .setValue("En attente d'une saisie…")
    .setWrap(true).setVerticalAlignment("middle").setFontColor("#5f6368");
  sh.setRowHeight(LST, 44);

  sh.setColumnWidth(1, 140); sh.setColumnWidth(2, 90); sh.setColumnWidth(3, 90); sh.setColumnWidth(4, 90);
  sh.setTabColor("#1a73e8");
  sh.setHiddenGridlines(true);
}
// Installe le trigger INSTALLABLE qui permet à onEditMobile() d'accéder à
// Drive (export PDF) — un simple trigger classique ne le peut pas (cf. note
// en tête d'onEditMobile). Idempotent : ne crée rien si déjà en place.
// Doit être lancé depuis le menu (donc pleinement autorisé) ; impossible à
// faire automatiquement depuis onOpen(), lui-même un simple trigger, qui n'a
// pas le droit de créer des triggers.
function installerTriggerMobile() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditMobile' && triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT) {
      return false; // déjà en place
    }
  }
  ScriptApp.newTrigger('onEditMobile').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();
  return true; // vient d'être créé
}
function assurerFeuilleMobileManuel() {
  assurerFeuilleMobile(SpreadsheetApp.getActiveSpreadsheet());
  var vientDetreInstalle = installerTriggerMobile();
  var msg = '✅ Feuille "' + CONFIG.FEUILLE_MOBILE + '" prête (créée si elle manquait).';
  msg += vientDetreInstalle
    ? "\n✅ Impression + export PDF activés depuis le mobile."
    : "\n(Déjà activé précédemment — rien à refaire.)";
  SpreadsheetApp.getUi().alert(msg);
}

function onEditPlanning(e) {
  var s = e.range.getSheet();
  var row = e.range.getRow();
  if (row < CONFIG.PREMIERE_LIGNE_PERSO) return; // Ne pas toucher les lignes 1-5 (dont la ligne 5 "notes")
  var lastRow = s.getLastRow(), lastCol = s.getLastColumn();
  var col = e.range.getColumn();

  if (isLabelCol(col)) {
    // Le nom a changé (ajouté, modifié ou effacé) : on refait tout le bloc
    // de cette personne pour que la couleur/validation apparaisse ou
    // disparaisse immédiatement. Les hauteurs et bordures, elles, restent
    // identiques que le bloc ait un nom ou non (cf. bordBloc / étape 1b).
    var pers = detecterPersonnes(s, CONFIG.PREMIERE_LIGNE_PERSO, lastRow);
    for (var p = 0; p < pers.length; p++) {
      if (row < pers[p].startRow || row > pers[p].endRow) continue;
      var bloc = pers[p];
      appliquerHauteursBloc(s, bloc);
      reformaterZone(s, bloc.startRow, 1, bloc.endRow - bloc.startRow + 1, lastCol, lastCol, lastRow, pers);
      appliquerValidationChantier(s, [bloc], lastCol);
      break;
    }
    return;
  }

  reformaterZone(s, row, col, e.range.getNumRows(), e.range.getNumColumns(), lastCol, lastRow);
}

// ==== CŒUR DU FORMATAGE (en mémoire, aucun appel API) ====
// Un "cahier" regroupe les 6 tableaux d'une zone rectangulaire du planning,
// lus en bloc et réécrits en bloc. Le calcul se fait entièrement dessus : le
// formatage complet et le reformatage à la volée (onEdit) partagent donc
// EXACTEMENT la même logique, et rendent donc exactement le même résultat.
function lireCahier(range) {
  return {
    v: range.getValues(), b: range.getBackgrounds(), f: range.getFontColors(),
    s: range.getFontSizes(), h: range.getHorizontalAlignments(), w: range.getFontWeights()
  };
}
function ecrireCahier(range, z, valeursModifiees) {
  if (valeursModifiees) range.setValues(z.v);
  range.setBackgrounds(z.b);
  range.setFontColors(z.f);
  range.setFontSizes(z.s);
  range.setHorizontalAlignments(z.h);
  range.setFontWeights(z.w);
}
// graisse = null : on laisse la graisse existante (le script ne gère le gras
// que pour les noms — un mot mis en gras à la main dans une case jour n'est
// donc pas écrasé au reformatage).
function poser(z, ri, ci, bg, fc, taille, align, graisse) {
  if (ri < 0 || ri >= z.v.length || ci < 0 || ci >= z.v[ri].length) return;
  z.b[ri][ci] = bg; z.f[ri][ci] = fc; z.s[ri][ci] = taille; z.h[ri][ci] = align;
  if (graisse !== null) z.w[ri][ci] = graisse;
}
// Couleur du texte d'une ligne de détail (déjà passée en minuscules). Rouge
// si "important"/"urgent" apparaît dans le texte — y compris le tag manuel
// [Important] posé depuis la fiche de l'appli web (round du 28.08.2026,
// demande de Lionel : "tag important pour faire ressortir le texte d'une
// tâche") : son crochet contient déjà ce mot, la même condition le reconnaît
// donc sans rien ajouter ici. Le vert automatique pour "béton"/"beton" a été
// retiré (demande de Lionel, 28.08.2026 : "supprimer les colorisations de
// texte béton en vert").
function couleurTexteDetail(vl) {
  if (vl.indexOf("important") !== -1 || vl.indexOf("urgent") !== -1) return CONFIG.ROUGE_TEXTE;
  return CONFIG.NOIR_TEXTE;
}

// ==== IMPRESSION : rouge PAR LIGNE, jamais pour la cellule entière ====
// (round du 28.08.2026, 2e passage — capture d'écran à l'appui : « certaines
// tâches qui ne sont pas importantes se colorient en rouge lors de
// l'impression car il y a une règle de mise en couleur pour la cellule
// entière... le texte rouge doit rester uniquement pour la tâche ou note
// importante »). Avant ce correctif, imprimerSemaine() copiait tel quel le
// getFontColors() de la vraie cellule Planning — UNE seule couleur pour
// toute la case, correct pour l'ancien modèle « 1 statut par case » mais faux
// dès qu'une case contient plusieurs tâches/notes indépendantes (round du
// 28.08.2026, 1er passage) : si une seule ligne est importante, toute la
// case virait rouge à l'impression, y compris les lignes qui n'ont rien
// d'important.
//
// Corrigé en recalculant la couleur À L'IMPRESSION, ligne par ligne,
// directement depuis le texte déjà en mémoire — jamais depuis la couleur
// existante de la vraie cellule (qui ne connaît qu'UNE couleur par cellule,
// cf. couleurTexteDetail ci-dessus, volontairement inchangée : elle reste
// utilisée telle quelle pour la vraie feuille Planning, hors du champ de ce
// correctif). Une ligne est rouge si ELLE-MÊME contient "important"/"urgent"
// — le tag manuel [Important] contient déjà ce mot, même test que
// couleurTexteDetail, appliqué ligne par ligne plutôt qu'à la cellule
// entière. La mention "[Important]" est en plus retirée du texte affiché à
// l'impression (elle ne sert qu'à piloter la couleur ; le rouge suffit,
// demande explicite de Lionel) — les AUTRES crochets ([Réservé] etc.) ne
// sont PAS concernés, ils continuent à s'afficher tels quels, comme avant.
//
// N'affecte QUE la feuille d'impression (jetable, recréée à chaque
// génération) : la vraie cellule du Planning n'est jamais modifiée par ces
// fonctions, ni sa valeur ni sa couleur.

// Retire UNIQUEMENT le tag [Important] parmi les crochets en tête de ligne —
// ne touche ni au tiret de tirets() ni aux autres crochets ([Réservé] etc.),
// quel que soit leur ordre. Volontairement simple (ne recoupe pas la liste
// des statuts connus, définie côté WebApp.gs — Planning_Format.gs doit
// pouvoir fonctionner seul, comme avant la webapp) : en pratique, seuls
// [Important] et les statuts apparaissent en tête de ligne, jamais un autre
// crochet arbitraire.
function retirerTagImportant_(ligne) {
  var s = String(ligne == null ? "" : ligne);
  var tiret = "";
  var mTiret = /^-\s+/.exec(s);
  if (mTiret) { tiret = mTiret[0]; s = s.slice(mTiret[0].length); }
  var gardes = "";
  var m;
  while ((m = /^\[([^\]]+)\][ \t]*/.exec(s))) {
    if (!/^Important$/i.test(m[1])) gardes += m[0];
    s = s.slice(m[0].length);
  }
  return tiret + gardes + s;
}

// brut = valeur BRUTE (multi-ligne) d'une cellule détail/notes, telle que
// stockée dans le Planning. Retourne { texte, rouges } : texte = même
// contenu, tag [Important] retiré ligne par ligne ; rouges = plages
// [début,fin[ (index caractère dans "texte") à colorer en rouge — une par
// ligne importante, prêtes pour texteRicheImpression_ ci-dessous. Cellule
// vide -> { texte: "", rouges: [] }, jamais d'erreur.
function preparerLignesImpression_(brut) {
  var s = String(brut == null ? "" : brut);
  if (s === "") return { texte: "", rouges: [] };
  var lignesIn = s.split("\n");
  var lignesOut = [], rouges = [], pos = 0;
  for (var i = 0; i < lignesIn.length; i++) {
    var ligne = lignesIn[i];
    var estRouge = /important|urgent/i.test(ligne);
    var ligneAffichee = retirerTagImportant_(ligne);
    lignesOut.push(ligneAffichee);
    if (estRouge && ligneAffichee !== "") rouges.push([pos, pos + ligneAffichee.length]);
    pos += ligneAffichee.length + 1; // +1 : le "\n" qui suit dans le texte reconstruit
  }
  return { texte: lignesOut.join("\n"), rouges: rouges };
}

// Construit le RichTextValue correspondant : noir partout, rouge sur les
// plages données. N'est appelé que pour les cellules ayant au moins une
// ligne importante (rouges.length > 0) — une cellule entièrement noire n'a
// pas besoin de texte riche, un simple setFontColor() suffit et coûte moins
// cher.
function texteRicheImpression_(texte, rouges) {
  var b = SpreadsheetApp.newRichTextValue().setText(texte);
  b.setTextStyle(0, texte.length, SpreadsheetApp.newTextStyle().setForegroundColor(CONFIG.NOIR_TEXTE).build());
  for (var i = 0; i < rouges.length; i++) {
    var deb = rouges[i][0], fin = rouges[i][1];
    if (fin > deb) b.setTextStyle(deb, fin, SpreadsheetApp.newTextStyle().setForegroundColor(CONFIG.ROUGE_TEXTE).build());
  }
  return b.build();
}

// Remplit le cahier pour les personnes données. r0/c0 = ligne/colonne de la
// 1ère cellule du cahier dans la feuille. Retourne true si des valeurs ont
// été normalisées (tirets) et doivent donc être réécrites.
function appliquerFormatZone(z, pers, colMap, couleursChantier, r0, c0, nR, nC) {
  var modifie = false;
  for (var p = 0; p < pers.length; p++) {
    var bloc = pers[p], vide = (bloc.nom === "");
    var s = Math.max(bloc.startRow, r0), e = Math.min(bloc.endRow, r0 + nR - 1);
    if (e < s) continue;

    for (var c = c0; c < c0 + nC; c++) {
      var ic = c - c0;

      // Colonne label (nom de la personne)
      if (isLabelCol(c)) {
        for (var r = s; r <= e; r++) poser(z, r - r0, ic, CONFIG.BLANC, CONFIG.NOIR_TEXTE, 9, "center", "bold");
        continue;
      }

      // Fond imposé par le calendrier, quel que soit le contenu de la case :
      // week-end en gris, jour férié dans la couleur de la feuille "Fériés".
      // null = la couleur dépend du contenu (chantier, absence, vide).
      var isWE = colMap[c].we;
      var fondJour = isWE ? CONFIG.GRIS_FONCE_WE : colMap[c].ferie;

      // Bloc vide (aucun nom) : toute mise en forme spéciale disparaît
      if (vide) {
        for (var r = s; r <= e; r++) poser(z, r - r0, ic, fondJour || CONFIG.BLANC, CONFIG.NOIR_TEXTE, 9, "left", null);
        continue;
      }

      // Traitement par PAIRE (ligne "Chantier" + sa ligne de détail) : la
      // couleur de la ligne "Chantier" dépend d'une éventuelle absence
      // saisie sur la ligne de détail juste en dessous.
      for (var r = bloc.startRow; r <= bloc.endRow; r += 2) {
        var iC = r - r0, iD = iC + 1;

        // --- Ligne de détail (traitée d'abord, pour connaître l'absence) ---
        var vlDetail = "";
        if (iD >= 0 && iD < nR) {
          var brut = String(z.v[iD][ic]), norm = tirets(brut);
          if (norm !== brut) { z.v[iD][ic] = norm; modifie = true; }
          vlDetail = norm.toLowerCase();
          poser(z, iD, ic,
            fondJour || (estAbsence(vlDetail) ? CONFIG.ORANGE_CLAIR_3 : CONFIG.BLANC),
            couleurTexteDetail(vlDetail), 9, "left", null);
        }

        // --- Ligne "Chantier" : couleur du chantier, orange si absence ---
        if (iC >= 0 && iC < nR) {
          poser(z, iC, ic,
            fondJour || calcFondChantier(z.v[iC][ic], false, couleursChantier, vlDetail),
            CONFIG.NOIR_TEXTE, 7, "center", null);
        }
      }
    }
  }
  return modifie;
}

// ==== REFORMATAGE ZONE (onEdit "Planning") ====
// Reformate les blocs "personne" touchés par une modification. Comme le
// formatage complet, tout est calculé en mémoire puis écrit en quelques
// appels groupés : une saisie (ou un collage de plusieurs cellules) ne
// déclenche plus des dizaines d'appels API cellule par cellule.
function reformaterZone(sheet, startRow, startCol, numRows, numCols, lastCol, lastRow, persConnues) {
  var pers = persConnues || detecterPersonnes(sheet, CONFIG.PREMIERE_LIGNE_PERSO, lastRow);

  // La zone est élargie aux blocs "personne" COMPLETS : la couleur d'une
  // ligne "Chantier" dépend de sa ligne de détail, et inversement.
  var r1 = Math.max(startRow, CONFIG.PREMIERE_LIGNE_PERSO), r2 = startRow + numRows - 1;
  var touches = [];
  for (var p = 0; p < pers.length; p++) {
    if (pers[p].endRow < r1 || pers[p].startRow > r2) continue;
    touches.push(pers[p]);
    if (pers[p].startRow < r1) r1 = pers[p].startRow;
    if (pers[p].endRow > r2) r2 = pers[p].endRow;
  }
  if (touches.length === 0) return;
  if (r2 > lastRow) r2 = lastRow;

  var c1 = Math.max(1, startCol), c2 = Math.min(lastCol, startCol + numCols - 1);
  var nR = r2 - r1 + 1, nC = c2 - c1 + 1;
  if (nR < 1 || nC < 1) return;

  var colMap = construireCarteColonnes(sheet, lastCol, lireFeries(sheet.getParent()));
  var couleursChantier = lireCouleursChantier(sheet.getParent());
  var zone = sheet.getRange(r1, c1, nR, nC);
  var z = lireCahier(zone);
  var modifie = appliquerFormatZone(z, touches, colMap, couleursChantier, r1, c1, nR, nC);
  ecrireCahier(zone, z, modifie);
  zone.setVerticalAlignment("middle").setFontFamily("Arial");

  // Colonnes label présentes dans la zone : rotation + fusion du nom.
  var refsLabel = [];
  for (var c = c1; c <= c2; c++) if (isLabelCol(c)) refsLabel.push(refA1(r1, c, nR, 1));
  if (refsLabel.length > 0) {
    parLots(sheet, refsLabel, function (rl) { rl.setTextRotation(90); });
    for (var c = c1; c <= c2; c++) if (isLabelCol(c)) fusionnerNomsColonne(sheet, c, touches, r1, nR);
  }

  // Bordures — tracées même pour les blocs vides
  for (var i = 0; i < touches.length; i++) bordBloc(sheet, touches[i], lastCol);
}

// ==== HELPERS ====
// Détecte un texte d'absence (congé/vacances) dans une valeur déjà passée en
// minuscules — utilisé à la fois pour la ligne de détail et, désormais, pour
// forcer la couleur de la ligne "Chantier" de la même demi-journée.
function estAbsence(vl) {
  return vl.indexOf("absent") !== -1 || vl.indexOf("congé") !== -1 || vl.indexOf("conge") !== -1 || vl.indexOf("vacances") !== -1;
}

// Fond de la ligne "Chantier" : orange si la ligne de détail de la même
// demi-journée signale une absence (congé/vacances), sinon couleur du
// chantier tapé (recherché dans la feuille "Chantier", correspondance
// exacte insensible à la casse/espaces) — weekend toujours prioritaire,
// vide = blanc. vlDetail (optionnel) est le texte de la ligne de détail
// associée, déjà en minuscules.
function calcFondChantier(val, isWE, couleursChantier, vlDetail) {
  if (isWE) return CONFIG.GRIS_FONCE_WE;
  if (vlDetail && estAbsence(vlDetail)) return CONFIG.ORANGE_CLAIR_3;
  var nom = String(val).trim().toLowerCase();
  if (nom === "") return CONFIG.BLANC;
  return couleursChantier[nom] || CONFIG.BLANC;
}

// Fond d'une case jour ouvré de la feuille d'IMPRESSION, recalculé depuis les
// VALEURS (round du 28.08.2026) : couleur de jour férié si la colonne en a
// une, sinon exactement la même règle que la vraie feuille (orange absence >
// couleur du chantier > blanc, via calcFondChantier ci-dessus). Avant ce
// round, l'impression COPIAIT les fonds déjà peints sur le Planning
// (getBackgrounds) — dépendance qui empêchait d'arrêter de peindre la vraie
// feuille à chaque saisie (cf. WebApp.gs, ecrireDemiJournee_), et qui
// imprimait déjà un fond faux dès que la feuille n'était pas à jour (ex. une
// absence posée par une récurrence, jamais repeinte avant la mise en forme
// suivante). Recalculer depuis la donnée brute est le même principe que la
// couleur de police par ligne (cf. preparerLignesImpression_).
function fondImpressionJourOuvre_(couleurFerie, valChantier, valDetail, couleursChantier) {
  if (couleurFerie) return couleurFerie;
  return calcFondChantier(valChantier, false, couleursChantier, String(valDetail == null ? "" : valDetail).toLowerCase());
}

// Lit la feuille "Chantier" (colonne A = nom, colonne B = code hexa écrit
// par le script de coloration automatique) et construit une map nom -> hexa.
// La couleur d'un chantier, c'est le FOND de sa case en colonne B — jamais
// son texte. C'est ce qui permet de la choisir soi-même au pot de peinture :
// un changement de fond ne déclenche aucun onEdit (Sheets ne prévient le
// script que pour un changement de VALEUR), donc rien à intercepter ; c'est
// pour ça que la case est relue à chaque passage ici plutôt que mémorisée
// au moment de la saisie. La colonne B n'affiche donc plus de code hexa :
// juste la couleur elle-même (cf. onEditChantier() et recolorAllChantiers(),
// qui vident systématiquement ce texte pour éviter qu'il devienne trompeur
// après un choix manuel).
function lireCouleursChantier(ss) {
  var map = {};
  var sh = ss.getSheetByName(CONFIG.FEUILLE_CHANTIER);
  if (!sh) return map;
  var lr = sh.getLastRow();
  if (lr <= CONFIG.CHANTIER_HEADER_ROWS) return map;
  var nRows = lr - CONFIG.CHANTIER_HEADER_ROWS;
  var noms = sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, nRows, 1).getValues();
  var fonds = sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_COULEUR, nRows, 1).getBackgrounds();
  for (var i = 0; i < noms.length; i++) {
    var nom = String(noms[i][0]).trim();
    var coul = String(fonds[i][0]).trim().toLowerCase();
    if (nom === "" || coul === "" || coul === CONFIG.BLANC) continue;
    map[nom.toLowerCase()] = coul;
  }
  return map;
}

// Pose (ou retire) une liste déroulante sur CHAQUE ligne "Chantier" de
// chaque personne (une par demi-journée), alimentée par la colonne A de la
// feuille "Chantier" (plage dynamique : toute nouvelle ligne ajoutée
// là-bas apparaît automatiquement dans la liste, sans avoir à relancer
// cette fonction). Blocs vides → la validation est retirée si elle existait.
// Les colonnes week-end (fusionnées, sans saisie de chantier au jour le
// jour) n'ont JAMAIS de liste déroulante, même sur un bloc non vide.
// colMap (optionnel) évite de relire la ligne 3 — passe celui déjà calculé
// par formaterPlanning() si disponible.
function appliquerValidationChantier(sh, pers, lc, colMap) {
  if (pers.length === 0) return;
  var shChantier = sh.getParent().getSheetByName(CONFIG.FEUILLE_CHANTIER);
  var rule = null;
  if (shChantier) {
    var plageChantiers = shChantier.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, 500, 1);
    rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(plageChantiers, true)
      .setAllowInvalid(false)
      .setHelpText('Choisis un chantier dans la liste (feuille "Chantier").')
      .build();
  }
  colMap = colMap || construireCarteColonnes(sh, lc);

  // Zone couverte = de la 1ère à la dernière ligne des personnes concernées.
  var r1 = pers[0].startRow, r2 = pers[0].endRow;
  for (var p = 1; p < pers.length; p++) {
    if (pers[p].startRow < r1) r1 = pers[p].startRow;
    if (pers[p].endRow > r2) r2 = pers[p].endRow;
  }
  var nR = r2 - r1 + 1;

  // La grille de règles est construite EN MÉMOIRE (null = aucune liste), puis
  // posée en UN SEUL setDataValidations() — auparavant c'était un appel par
  // ligne "Chantier" et par série de colonnes, soit des milliers d'appels sur
  // un planning d'une année.
  var grille = [];
  for (var i = 0; i < nR; i++) { var l = []; for (var c = 0; c < lc; c++) l.push(null); grille.push(l); }

  for (var p = 0; p < pers.length; p++) {
    if (pers[p].nom === "" || !rule) continue; // bloc vide → tout reste à null
    for (var row = pers[p].startRow; row <= pers[p].endRow; row += 2) { // une ligne "Chantier" sur deux
      var ir = row - r1;
      if (ir < 0 || ir >= nR) continue;
      for (var c = 2; c <= lc; c++) {
        // Ni les colonnes label, ni les week-ends (fusionnés, sans saisie de
        // chantier au jour le jour) n'ont de liste déroulante.
        if (isLabelCol(c) || colMap[c].we) continue;
        grille[ir][c - 1] = rule;
      }
    }
  }
  sh.getRange(r1, 1, nR, lc).setDataValidations(grille);
}

// Fusionne la cellule "nom" de chaque personne sur toute la hauteur de son
// bloc. L'état des fusions est lu en UN appel pour toute la colonne : sur une
// feuille déjà formatée (le cas courant), plus aucun appel n'est nécessaire
// ensuite — avant, c'était isPartOfMerge() + merge() par personne.
function fusionnerNomsColonne(sh, col, pers, r1, nR) {
  var deja = {}, mgs = sh.getRange(r1, col, nR, 1).getMergedRanges();
  for (var i = 0; i < mgs.length; i++) deja[mgs[i].getRow() + ":" + mgs[i].getNumRows()] = true;
  for (var p = 0; p < pers.length; p++) {
    var s = pers[p].startRow, n = pers[p].endRow - s + 1;
    if (n < 2 || deja[s + ":" + n]) continue;
    var rng = sh.getRange(s, col, n, 1);
    if (rng.isPartOfMerge()) rng.breakApart();
    rng.merge();
  }
}

function tirets(v) {
  var s = String(v).trim(); if (s === "") return s;
  var l = s.split("\n");
  for (var i = 0; i < l.length; i++) { var li = l[i].trim(); if (li !== "" && li.charAt(0) !== "-") l[i] = "- " + li; }
  return l.join("\n");
}

// Bordures horizontales d'un bloc "personne" — tracées pour TOUS les blocs,
// y compris les blocs vides (réservés, sans nom), qui reçoivent EXACTEMENT
// le même contour qu'un bloc avec nom :
//  - contour épais en haut/bas du bloc = séparation entre personnes ;
//  - pointillé entre les 2 demi-journées (après la ligne de détail du
//    matin, avant la ligne "Chantier" de l'après-midi) ;
//  - AUCUNE bordure autour des lignes "Chantier" elles-mêmes (rien entre
//    une ligne "Chantier" et sa ligne de détail).
// Une fois imprimée, une ligne vide se remplit à la main comme une ligne
// occupée.
// Le bloc entier est traité d'un coup : effacement des traits internes,
// contour haut+bas (le paramètre top/bottom d'une plage multi-lignes ne
// dessine que son PÉRIMÈTRE), puis pointillé. 3 appels par personne au lieu
// d'un ou deux par ligne, et plus besoin de rechercher la personne à chaque
// ligne.
function bordBloc(sheet, bloc, lc) {
  var s = bloc.startRow, n = bloc.endRow - s + 1;
  var rng = sheet.getRange(s, 1, n, lc);
  if (n > 1) rng.setBorder(null, null, null, null, null, false, null, null); // rien autour des lignes "Chantier"
  rng.setBorder(true, null, true, null, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM); // séparation entre personnes
  for (var r = s + 1; r < bloc.endRow; r += 2) {
    sheet.getRange(r, 1, 1, lc).setBorder(null, null, true, null, null, null, "#aaaaaa", SpreadsheetApp.BorderStyle.DOTTED); // entre les 2 demi-journées
  }
}

// Fusionne chaque paire de colonnes week-end (2 colonnes consécutives) PAR
// PERSONNE, sur tout son bloc (4 lignes) : une seule cellule 2×4 au lieu de
// 2 colonnes étroites répétées sur 4 lignes. S'applique à tous les blocs,
// y compris les blocs vides (même traitement qu'une personne, cf. bordBloc).
// Comme pour les noms, l'état des fusions est lu en UN appel par semaine :
// sur une feuille déjà formatée, rien n'est réécrit.
function fusionnerWeekends(sh, lc, pers, colMap, r1, nR) {
  for (var c = 1; c <= lc; c++) {
    if (!isLabelCol(c)) continue;
    var weekendCols = [];
    for (var cc = c + 1; cc <= c + 7 && cc <= lc; cc++) {
      if (colMap[cc].we) weekendCols.push(cc);
    }
    if (weekendCols.length !== 2 || weekendCols[1] !== weekendCols[0] + 1) continue;
    var c1 = weekendCols[0];

    var deja = {}, mgs = sh.getRange(r1, c1, nR, 2).getMergedRanges();
    for (var i = 0; i < mgs.length; i++) {
      var m = mgs[i];
      if (m.getColumn() === c1 && m.getNumColumns() === 2) deja[m.getRow() + ":" + m.getNumRows()] = true;
    }
    for (var p = 0; p < pers.length; p++) {
      var s = pers[p].startRow, n = pers[p].endRow - s + 1;
      if (deja[s + ":" + n]) continue; // fusion déjà correcte
      var rng = sh.getRange(s, c1, n, 2);
      // On casse d'abord toute fusion existante qui chevauche la zone (ex :
      // anciennes fusions par ligne d'une version précédente du script) —
      // sinon isPartOfMerge() renvoie true et on saute la vraie fusion 2×N.
      if (rng.isPartOfMerge()) rng.breakApart();
      rng.merge();
    }
  }
}

// ==== DÉTECTION PERSONNES ====
function detecterPersonnes(sh, fr, lr) {
  var lignesPar = CONFIG.LIGNES_PAR_PERSONNE;
  if (lr < fr) return [];
  var colA = sh.getRange(fr, 1, lr - fr + 1, 1);
  // Colonne A lue UNE seule fois : avant, chaque personne détectée coûtait un
  // getValue() supplémentaire.
  var noms = colA.getValues();
  function nomDe(row) { var i = row - fr; return (i >= 0 && i < noms.length) ? String(noms[i][0]).trim() : ""; }

  var p = [], mg = colA.getMergedRanges();
  if (mg.length > 0) {
    mg.sort(function (a, b) { return a.getRow() - b.getRow(); });
    for (var i = 0; i < mg.length; i++) { var m = mg[i], ms = m.getRow(), me = ms + m.getNumRows() - 1; if (ms >= fr) p.push({ nom: nomDe(ms), startRow: ms, endRow: me }); }
    // Les intervalles non couverts par une fusion sont découpés en blocs de
    // LIGNES_PAR_PERSONNE lignes (personnes sans nom / lignes réservées).
    var cv = {}; for (var i = 0; i < p.length; i++) for (var r = p[i].startRow; r <= p[i].endRow; r++) cv[r] = true;
    var gs = null;
    for (var r = fr; r <= lr + 1; r++) {
      if (r <= lr && !cv[r]) { if (gs === null) gs = r; continue; }
      if (gs !== null) { var g = gs; while (g + lignesPar - 1 <= r - 1) { p.push({ nom: nomDe(g), startRow: g, endRow: g + lignesPar - 1 }); g += lignesPar; } gs = null; }
    }
    p.sort(function (a, b) { return a.startRow - b.startRow; });
  }
  if (p.length === 0) { var cr = fr; while (cr + lignesPar - 1 <= lr) { p.push({ nom: nomDe(cr), startRow: cr, endRow: cr + lignesPar - 1 }); cr += lignesPar; } }
  return p;
}

// ==== FORMATAGE COMPLET ====
function formaterPlanning(sil) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) { if (!sil) SpreadsheetApp.getUi().alert("❌ Feuille introuvable."); return; }
  sh.setHiddenGridlines(true); // quadrillage désactivé : seules nos propres bordures s'impriment
  var lc = sh.getLastColumn(), lr = sh.getLastRow();
  if (lr < CONFIG.PREMIERE_LIGNE_PERSO) { SpreadsheetApp.flush(); return; }

  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  var dsr = CONFIG.PREMIERE_LIGNE_PERSO, dr = lr - dsr + 1;
  // Carte des colonnes (WE / date / jour férié) lue une seule fois,
  // réutilisée par toutes les étapes ci-dessous.
  var colMap = construireCarteColonnes(sh, lc, lireFeries(ss));

  var MEDIUM = SpreadsheetApp.BorderStyle.SOLID_MEDIUM, SOLID = SpreadsheetApp.BorderStyle.SOLID;

  // 1. Largeurs des colonnes — regroupées par séries de colonnes de même
  //    largeur (setColumnWidths) : 3 appels par semaine au lieu de 8.
  var wDeb = 1, wVal = largeurCol(1, colMap);
  for (var c = 2; c <= lc + 1; c++) {
    var v = (c <= lc) ? largeurCol(c, colMap) : null;
    if (v !== wVal) { sh.setColumnWidths(wDeb, c - wDeb, wVal); wDeb = c; wVal = v; }
  }

  // 1a. Ligne 4 = jalons du planning d'architecte, ligne 5 = notes libres :
  //     fond posé sur toute la largeur, pour que les semaines déjà créées
  //     soient mises à jour et pas seulement les nouvelles (2 appels).
  sh.getRange(4, 1, 1, lc).setBackground(CONFIG.GRIS_JALONS);
  sh.getRange(CONFIG.LIGNE_NOTES, 1, 1, lc).setBackground(CONFIG.JAUNE_NOTES);

  // 1b. Hauteurs de lignes : une ligne "Chantier" compacte (15px) suivie
  //     d'une ligne de détail (30px) par demi-journée — identique pour les
  //     blocs vides, pour qu'une feuille imprimée puisse être remplie à la
  //     main sans que les lignes réservées soient visuellement différentes.
  for (var p = 0; p < pers.length; p++) appliquerHauteursBloc(sh, pers[p]);

  // 1c. Liste déroulante "Chantier" sur chaque ligne "Chantier" de chaque
  //     personne (source = feuille "Chantier"), retirée pour les blocs vides
  //     et pour les colonnes week-end.
  appliquerValidationChantier(sh, pers, lc, colMap);

  // 2. Zone personnel : réglages uniformes (la taille de police, la couleur
  //    et l'alignement varient d'une ligne à l'autre — ils sont traités en
  //    une seule passe à l'étape 5).
  var zone = sh.getRange(dsr, 1, dr, lc);
  zone.setVerticalAlignment("middle").setFontFamily("Arial");

  // 3. Fusion des week-ends (2 colonnes × 4 lignes → 1 cellule par personne).
  //    Le fond gris des week-ends n'est plus posé ici : l'étape 5 s'en charge
  //    en même temps que tout le reste (l'ancienne étape faisait doublon).
  fusionnerWeekends(sh, lc, pers, colMap, dsr, dr);

  // 4. Bordures — toutes les colonnes label en UNE RangeList, et les
  //    séparateurs de jours d'une semaine en UN appel grâce au paramètre
  //    "vertical" de setBorder (avant : un appel par colonne, soit des
  //    centaines sur un planning d'une année).
  var refsLabelPleine = [], refsDebutSem = [];
  for (var c = 1; c <= lc; c++) {
    if (!isLabelCol(c)) continue;
    refsLabelPleine.push(refA1(1, c, lr, 1));
    var fin = Math.min(c + 7, lc);
    if (fin <= c) continue;
    refsDebutSem.push(refA1(dsr, c + 1, dr, 1));
    if (fin > c + 1) sh.getRange(dsr, c + 1, dr, fin - c).setBorder(null, null, null, null, true, null, "#000000", SOLID);
  }
  parLots(sh, refsLabelPleine, function (rl) { rl.setBorder(null, true, true, true, null, null, "#000000", MEDIUM); });
  parLots(sh, refsDebutSem, function (rl) { rl.setBorder(null, true, null, null, null, null, "#000000", MEDIUM); });

  // 4b. Contour des blocs "personne" (y compris les blocs vides).
  for (var p = 0; p < pers.length; p++) bordBloc(sh, pers[p], lc);

  // 5. Couleurs, tailles de police et alignements de TOUTE la zone personnel
  //    en une seule passe : 6 lectures + 6 écritures pour la feuille entière,
  //    au lieu de 10 appels par colonne. C'est de loin le plus gros gain du
  //    formatage complet. Le calcul lui-même est partagé avec le reformatage
  //    à la volée (appliquerFormatZone), donc rendu strictement identique.
  var couleursChantier = lireCouleursChantier(ss);
  var z = lireCahier(zone);
  var modifie = appliquerFormatZone(z, pers, colMap, couleursChantier, dsr, 1, dr, lc);
  ecrireCahier(zone, z, modifie);

  // 6. Colonnes label : rotation du texte (une seule RangeList) puis fusion
  //    du nom sur la hauteur de chaque bloc.
  var refsLabelZone = [];
  for (var c = 1; c <= lc; c++) if (isLabelCol(c)) refsLabelZone.push(refA1(dsr, c, dr, 1));
  parLots(sh, refsLabelZone, function (rl) { rl.setTextRotation(90); });
  for (var c = 1; c <= lc; c++) if (isLabelCol(c)) fusionnerNomsColonne(sh, c, pers, dsr, dr);

  SpreadsheetApp.flush();
  if (!sil) SpreadsheetApp.getUi().alert("✅ Mise en forme terminée !\nPersonnes : " + pers.length);
}

// Recolorie UNIQUEMENT les fonds des lignes "Chantier" du planning, sans
// refaire toute la mise en forme. C'est ce qui suffit après une modification
// de la feuille "Chantier" (seules les couleurs changent) : ~5 appels API au
// lieu du formatage complet, qui était relancé à chaque frappe là-bas.
function recolorerChantiers() {
  SpreadsheetApp.flush(); // la couleur qui vient d'être écrite doit être lisible
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) return;
  var lc = sh.getLastColumn(), lr = sh.getLastRow(), dsr = CONFIG.PREMIERE_LIGNE_PERSO;
  if (lr < dsr || lc < 1) return;

  var pers = detecterPersonnes(sh, dsr, lr);
  var colMap = construireCarteColonnes(sh, lc, lireFeries(ss));
  var couleursChantier = lireCouleursChantier(ss);
  var dr = lr - dsr + 1;
  var zone = sh.getRange(dsr, 1, dr, lc);
  var zV = zone.getValues(), zB = zone.getBackgrounds();

  for (var p = 0; p < pers.length; p++) {
    if (pers[p].nom === "") continue;
    for (var c = 2; c <= lc; c++) {
      // Week-ends et jours fériés gardent leur couleur de calendrier.
      if (isLabelCol(c) || colMap[c].we || colMap[c].ferie) continue;
      var ic = c - 1;
      for (var r = pers[p].startRow; r <= pers[p].endRow; r += 2) {
        var iC = r - dsr, iD = iC + 1;
        if (iC < 0 || iC >= dr) continue;
        var vlDetail = (iD >= 0 && iD < dr) ? String(zV[iD][ic]).toLowerCase() : "";
        zB[iC][ic] = calcFondChantier(zV[iC][ic], false, couleursChantier, vlDetail);
      }
    }
  }
  zone.setBackgrounds(zB);
  SpreadsheetApp.flush();
}

// ==== SEMAINE ACTIVE ====
// Repère la semaine de la cellule active : sa colonne label (labG) et ses
// colonnes de jours (labG+1 .. semE, contiguës). Partagé par l'impression et
// le récapitulatif, pour que les deux parlent toujours de la même semaine.
function semaineDepuisLabel(sh, labG, lc) {
  var semE = Math.min(labG + 7, lc);
  return {
    labG: labG, semS: labG + 1, semE: semE,
    nc: semE - labG + 1,
    num: String(sh.getRange(2, labG + 1).getValue()).trim()
  };
}
function semaineActive(ss, sh, lc) {
  var colAct = ss.getActiveSheet().getActiveCell().getColumn();
  var labG = 1;
  for (var c = colAct; c >= 1; c--) { if (isLabelCol(c)) { labG = c; break; } }
  return semaineDepuisLabel(sh, labG, lc);
}

// ==== SÉLECTEUR DE SEMAINE (dialogue avec calendrier) ====
// Ouvre une petite fenêtre : calendrier mensuel où chaque ligne = une semaine
// (cliquable uniquement si elle existe dans le planning), champ "N° semaine",
// et raccourcis "Cette semaine" / "Suivante".
function ouvrirSelecteurSemaine() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CONFIG.NOM_FEUILLE)) { SpreadsheetApp.getUi().alert("❌ Feuille introuvable."); return; }
  var html = HtmlService.createHtmlOutput(htmlSelecteurSemaine()).setWidth(440).setHeight(390);
  SpreadsheetApp.getUi().showModalDialog(html, "🖨️ Imprimer une semaine");
}

// Toutes les semaines présentes dans le planning : colonne label, numéro et
// dates de début/fin (objets Date). Partagé par apiListerSemaines() (dialogue
// desktop + page web mobile) et onEditMobile() (cellule déclencheur).
function listerSemainesPlanning(sh) {
  var lc = sh.getLastColumn();
  var r2 = sh.getRange(2, 1, 1, lc).getValues()[0];
  var r3 = sh.getRange(3, 1, 1, lc).getValues()[0];

  var semaines = [];
  for (var c = 1; c <= lc; c++) {
    if (!isLabelCol(c)) continue;
    var fin = Math.min(c + 7, lc), dates = [];
    for (var cc = c + 1; cc <= fin; cc++) if (r3[cc - 1] instanceof Date) dates.push(r3[cc - 1]);
    if (dates.length === 0) continue; // bloc sans date lisible
    semaines.push({
      labG: c,
      num: String(r2[c]).trim(), // n° de semaine : cellule fusionnée ancrée en c+1
      dateDebut: dates[0],
      dateFin: dates[dates.length - 1]
    });
  }
  return semaines;
}

// Appelée par le dialogue : les semaines, dates encodées en texte ISO (un
// objet Date ne survit pas le passage au client).
function apiListerSemaines() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) return { semaines: [], actifLabG: 0, aujourdhui: "" };
  var lc = sh.getLastColumn();
  var semaines = listerSemainesPlanning(sh).map(function (s) {
    return { labG: s.labG, num: s.num, debut: isoJour(s.dateDebut), fin: isoJour(s.dateFin) };
  });

  // Présélection : la semaine de la cellule active, uniquement si l'utilisateur
  // est bien sur la feuille "Planning" (sinon la colonne active ne veut rien dire).
  var actifLabG = 0;
  if (ss.getActiveSheet().getName() === CONFIG.NOM_FEUILLE) actifLabG = semaineActive(ss, sh, lc).labG;

  return {
    semaines: semaines,
    actifLabG: actifLabG,
    aujourdhui: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd")
  };
}
function isoJour(d) {
  var m = d.getMonth() + 1, j = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (j < 10 ? "0" : "") + j;
}

// Appelée par le dialogue : imprime la semaine dont la colonne label est labG.
function apiImprimerSemaine(labG) { return imprimerSemaine(labG); }

// ==== EXPORT PDF VERS DRIVE ====
// À chaque feuille d'impression générée, une copie PDF est enregistrée dans
// Drive > Boulot > plannings, nommée "Planning sem. <n°>_<année>.pdf". Une
// réimpression de la même semaine remplace le PDF existant (pas de doublon).
//
// IMPORTANT — DriveApp et UrlFetchApp sont des services "autorisés",
// indisponibles depuis un simple trigger (même restriction que getUi()).
// Fonctionne depuis le menu et le dialogue calendrier (déclenchés par un
// clic, donc pleinement autorisés) SANS rien à faire. Fonctionne aussi
// depuis la cellule mobile, mais seulement via le trigger INSTALLABLE
// dédié — cf. notes en tête d'onEditMobile et d'installerTriggerMobile()
// pour pourquoi, et le menu 📱 Créer/réparer la feuille mobile pour
// l'activer une fois pour toutes. Au tout premier essai (menu, ou install
// du trigger mobile), Google demande d'autoriser l'accès à Drive — normal,
// à accepter une fois pour toutes.
function trouverDossierPdf() {
  var racine = DriveApp.getFoldersByName(CONFIG.DOSSIER_PDF_RACINE);
  if (!racine.hasNext()) throw new Error('dossier Drive "' + CONFIG.DOSSIER_PDF_RACINE + '" introuvable');
  var boulot = racine.next();
  var sous = boulot.getFoldersByName(CONFIG.DOSSIER_PDF_SOUS);
  if (!sous.hasNext()) throw new Error('dossier Drive "' + CONFIG.DOSSIER_PDF_RACINE + ' > ' + CONFIG.DOSSIER_PDF_SOUS + '" introuvable');
  return sous.next();
}
function exporterPdfDrive(ss, ts, nomFichier) {
  var url = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export"
    + "?format=pdf&gid=" + ts.getSheetId()
    + "&size=A4&portrait=false&fitw=true"
    + "&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false&fzr=false"
    + "&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3";
  var reponse = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (reponse.getResponseCode() !== 200) throw new Error("export PDF HTTP " + reponse.getResponseCode());
  var blob = reponse.getBlob().setName(nomFichier);

  var dossier = trouverDossierPdf();
  var existants = dossier.getFilesByName(nomFichier);
  while (existants.hasNext()) existants.next().setTrashed(true); // remplace, ne duplique pas
  dossier.createFile(blob);
}
// Jamais bloquante : la feuille d'impression est déjà créée quoi qu'il
// arrive ici. Retourne un petit texte à ajouter au message de confirmation.
function essayerExporterPdfDrive(ss, ts, nomFichier) {
  try {
    exporterPdfDrive(ss, ts, nomFichier);
    return { ok: true, msg: "📁 PDF enregistré dans Boulot > plannings." };
  } catch (err) {
    console.error(err);
    return { ok: false, msg: "⚠️ PDF non enregistré sur Drive (" + err.message + ")." };
  }
}

// ==== IMPRESSION ====
// Génère une feuille imprimable "📋 S<n>" pour la semaine en cours (celle de
// la cellule active). Par rapport au Planning, la feuille imprimée :
//  - fusionne les colonnes week-end par personne (comme sur le Planning) ;
//  - n'affiche PAS les lignes "Chantier" : chaque demi-journée tient sur une
//    seule ligne (le détail), coloriée avec la couleur du chantier de cette
//    demi-journée ;
//  - saute entièrement les personnes dont la semaine est vide (chantier +
//    détail, jours ouvrés) : ni nom, ni cases vides imprimés pour elles ;
//  - insère une ligne vide de 3px entre chaque personne effectivement
//    imprimée ;
//  - reprend la ligne "notes" dans l'en-tête UNIQUEMENT si elle contient
//    quelque chose cette semaine-là (sinon l'en-tête s'arrête à la ligne 4,
//    comme avant), séparée des jalons par un espacement de 5px, avec fond
//    jaune + fin encadré SEULEMENT sur les jours renseignés (jamais toute
//    la ligne, jamais fusionnée) ;
//  - TOUTES les couleurs du corps (fonds ET police) sont RECALCULÉES depuis
//    les valeurs brutes — couleur du chantier, orange d'absence, couleur de
//    jour férié, rouge d'une ligne [Important] — plus jamais copiées depuis
//    ce qui est peint sur le Planning (round du 28.08.2026 : la vraie
//    feuille n'est plus repeinte à chaque saisie, cf. fondImpressionJourOuvre_
//    et preparerLignesImpression_) ;
//  - ajoute en bas de page une légende (couleur + nom) des chantiers utilisés
//    cette semaine (jours ouvrés uniquement) ;
//  - déclenche l'export PDF vers Drive (voir section EXPORT PDF ci-dessus).
// labGForce (optionnel) : colonne label de la semaine à imprimer, transmise
// par le sélecteur de semaine. Sans elle, on imprime la semaine de la cellule
// active (entrée de menu directe).
// tenterPdf (optionnel, défaut true) : passer false pour sauter l'export PDF
// (filet de sécurité si jamais cette fonction est un jour appelée depuis un
// contexte sans Drive — aujourd'hui les 3 appelants, y compris onEditMobile
// via son trigger installable, laissent tous la valeur par défaut).
// Retourne { nom, pdf, supprimee } où pdf est { ok, msg } ou null si non
// tenté ; supprimee (round du 28.08.2026, 3e passage — demande de Lionel :
// "aussi supprimer une impression sur la feuille de calcul quand le pdf est
// généré") indique si l'onglet "📋 S<n>" a été retiré juste après (VRAI
// seulement si le PDF a été exporté avec SUCCÈS — sur échec ou si tenterPdf
// vaut false, l'onglet reste, filet de secours pour imprimer/exporter à la
// main). Ce round généralise à TOUS les appelants (menu desktop,
// déclencheur mobile, appli web) ce qui n'était jusque-là posé que côté
// appli web (apiGenererPdf, WebApp.gs) : géré ici, au même endroit pour les
// 3, afin de ne jamais diverger.
function imprimerSemaine(labGForce, tenterPdf) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) { if (!labGForce) SpreadsheetApp.getUi().alert("❌ Feuille introuvable."); return; }
  var lc = sh.getLastColumn(), lr = sh.getLastRow();
  var sa = labGForce ? semaineDepuisLabel(sh, labGForce, lc) : semaineActive(ss, sh, lc);
  var labG = sa.labG, nc = sa.nc; // colonne label + jours ; labG..semE est CONTIGU
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  var nom = "📋 S" + sa.num;
  var ex = ss.getSheetByName(nom); if (ex) ss.deleteSheet(ex);
  var ts = ss.insertSheet(nom);
  ts.setHiddenGridlines(true); // quadrillage désactivé : seules nos propres bordures s'impriment
  var BLACK = "#000000", MEDIUM = SpreadsheetApp.BorderStyle.SOLID_MEDIUM, SOLID = SpreadsheetApp.BorderStyle.SOLID, DOTTED = SpreadsheetApp.BorderStyle.DOTTED;

  // Colonnes week-end côté destination (1 seule lecture de la ligne 3, au
  // lieu d'un test par colonne).
  var row3Vals = sh.getRange(3, labG, 1, nc).getValues()[0];
  var weekendDestCols = [];
  for (var i = 1; i < nc; i++) {
    var v = row3Vals[i];
    if (v instanceof Date && (v.getDay() === 0 || v.getDay() === 6)) weekendDestCols.push(i + 1);
  }

  // Couleur de jour férié par colonne (index 0-based, aligné sur row3Vals) :
  // relue depuis la feuille "Fériés" pour recalculer les fonds du corps plus
  // bas (cf. fondImpressionJourOuvre_) — remplace la copie getBackgrounds()
  // de la zone personnel, supprimée à ce round.
  var feriesImp = lireFeries(ss);
  var couleurFerieDest = [];
  for (var i = 0; i < nc; i++) {
    var vf = row3Vals[i], cf = null;
    if (vf instanceof Date && vf.getDay() !== 0 && vf.getDay() !== 6) {
      var fj = feriesImp[fmtDK(vf)];
      if (fj && fj.couleur) cf = fj.couleur;
    }
    couleurFerieDest.push(cf);
  }

  // 1. En-tête, lignes 1-4 (Mois/Sem/Date + jalons, TOUJOURS imprimées,
  //    jamais vides à l'affichage même sans contenu) : un seul aller-retour
  //    (valeurs + format) au lieu d'une copie colonne par colonne, puisque
  //    labG..semE est un bloc de colonnes contigu. La ligne "notes" (ligne 5
  //    sur le Planning) est traitée séparément juste après : elle n'est
  //    reprise que si elle contient quelque chose cette semaine-là, et
  //    seules ses cellules non vides sont mises en forme — jamais la ligne
  //    entière comme les jalons — d'où un traitement à part, qui ne se prête
  //    pas au copyTo(FORMAT) global utilisé ici pour le reste de l'en-tête.
  var srcHead4 = sh.getRange(1, labG, 4, nc), dstHead4 = ts.getRange(1, 1, 4, nc);
  var headVals4 = srcHead4.getValues();
  dstHead4.setValues(headVals4);
  srcHead4.copyTo(dstHead4, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  for (var i = 0; i < nc; i++) ts.setColumnWidth(i + 1, sh.getColumnWidth(labG + i));
  for (var r = 1; r <= 4; r++) ts.setRowHeight(r, sh.getRowHeight(r));
  // Bordure épaisse tout autour du bloc titre (AVANT les fusions ci-dessous :
  // posée après, sur une cellule "couverte" par une fusion, elle ne
  // s'afficherait pas). Sur une plage multi-lignes/colonnes, top/left/
  // bottom/right ne dessinent que le PÉRIMÈTRE extérieur — exactement ce
  // qu'il faut ici, en un seul appel. Toujours limitée aux 4 lignes jalons :
  // la ligne "notes", quand elle existe, est délibérément EN DEHORS de ce
  // cadre (séparée par un espacement, cf. juste en dessous).
  ts.getRange(1, 1, 4, nc).setBorder(true, true, true, true, null, null, BLACK, MEDIUM);
  if (nc > 2) { try { ts.getRange(1, 2, 1, nc - 1).merge(); } catch (ex) {} try { ts.getRange(2, 2, 1, nc - 1).merge(); } catch (ex) {} }
  // Ligne 4 = jalons d'architecte : elle n'est fusionnée sur toute la largeur
  // que si elle ne contient au plus qu'une seule information (cas d'un simple
  // titre). Dès qu'il y a un délai noté sur plusieurs jours, on garde une
  // cellule par jour — sinon la fusion ne conserverait que la 1ère valeur.
  var nbJalons = 0;
  for (var i = 0; i < nc; i++) if (String(headVals4[3][i]).trim() !== "") nbJalons++;
  if (nbJalons <= 1) { try { ts.getRange(4, 1, 1, nc).merge(); } catch (ex) {} }

  // Ligne "notes" : reprise UNIQUEMENT si elle contient quelque chose cette
  // semaine-là (sinon omise, en-tête arrêté à la ligne 4 comme avant). Quand
  // elle est reprise : un espacement de 5px la sépare des jalons (jamais
  // fusionnée ni mélangée avec eux — la ligne jalons ne doit jamais servir
  // à autre chose), jamais fusionnée entre jours non plus (contrairement aux
  // jalons) et SEULES les cellules non vides reçoivent le fond jaune pâle +
  // un fin encadré ; les jours sans note restent blancs, sans cadre. La
  // couleur de police (noir, ou rouge ligne par ligne pour une note
  // [Important]) est recalculée depuis le texte, jamais copiée du Planning.
  var notesRangeSrc = sh.getRange(CONFIG.LIGNE_NOTES, labG, 1, nc);
  var notesVals = notesRangeSrc.getValues()[0];
  var nbNotes = 0;
  for (var i = 0; i < nc; i++) if (String(notesVals[i]).trim() !== "") nbNotes++;
  var headerRows = 4;
  // Cellules à repasser en texte riche après les écritures groupées
  // ci-dessous (cf. preparerLignesImpression_/texteRicheImpression_ plus
  // haut) : { row, col, texte, rouges }, remplie ici ET plus bas pour le
  // corps personnel/sous-traitant, appliquée en une seule passe avant le
  // flush()/export PDF.
  var richARappliquer = [];
  if (nbNotes > 0) {
    var notesRow = 6; // 4 (jalons) + 1 (espacement 5px) + cette ligne
    ts.setRowHeight(5, 5);
    ts.setRowHeight(notesRow, sh.getRowHeight(CONFIG.LIGNE_NOTES));
    var notesRowVals = [], notesRowBg = [], notesRowFc = [];
    for (var i = 0; i < nc; i++) {
      var videCol = String(notesVals[i]).trim() === "";
      var prepNote = videCol ? { texte: "", rouges: [] } : preparerLignesImpression_(notesVals[i]);
      notesRowVals.push(prepNote.texte);
      notesRowBg.push(videCol ? CONFIG.BLANC : CONFIG.JAUNE_NOTES);
      notesRowFc.push(CONFIG.NOIR_TEXTE); // couleur de base ; le rouge par ligne est reposé plus bas si besoin
      if (prepNote.rouges.length > 0) richARappliquer.push({ row: notesRow, col: i + 1, texte: prepNote.texte, rouges: prepNote.rouges });
    }
    var notesRange = ts.getRange(notesRow, 1, 1, nc);
    notesRange.setValues([notesRowVals]);
    notesRange.setBackgrounds([notesRowBg]);
    notesRange.setFontColors([notesRowFc]);
    notesRange.setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle").setWrap(true);
    for (var i = 0; i < nc; i++) {
      if (String(notesVals[i]).trim() === "") continue;
      ts.getRange(notesRow, i + 1).setBorder(true, true, true, true, null, null, BLACK, SOLID);
    }
    headerRows = notesRow;
  }

  // 2. Personnel : 2 lignes par personne (1 par demi-journée). La ligne
  //    "Chantier" n'est pas copiée ; sa couleur est reportée sur la ligne de
  //    détail correspondante. Toute la zone est d'abord construite EN
  //    MÉMOIRE (tableaux JS), puis écrite en 3 appels au total (valeurs,
  //    fonds, couleurs de police) au lieu de plusieurs centaines d'appels
  //    cellule par cellule — c'est ce qui rendait la génération lente.
  var couleursChantier = lireCouleursChantier(ss);
  var chantiersUtilises = {}; // nom de chantier (tel que saisi) -> true
  var dsr = CONFIG.PREMIERE_LIGNE_PERSO;
  var zoneRows = Math.max(0, lr - dsr + 1);
  var zVals = zoneRows > 0 ? sh.getRange(dsr, labG, zoneRows, nc).getValues() : [];
  // Plus de getFontColors() NI de getBackgrounds() ici : couleur de police
  // (round précédent) ET fonds (ce round) sont recalculés plus bas
  // directement depuis zVals — plus rien de ce qui s'imprime ne dépend de ce
  // qui est peint sur la vraie feuille, qui n'est d'ailleurs plus repeinte à
  // chaque saisie depuis l'appli (cf. WebApp.gs, ecrireDemiJournee_).

  // Personnes dont TOUTE la semaine est vide (les 2 demi-journées, chantier
  // + détail, jours ouvrés uniquement — le week-end n'entre pas en compte,
  // comme pour la légende ci-dessous) : pas imprimées du tout, ni leur nom
  // ni des cases vides. pers[] garde la détection complète (utilisée par
  // d'autres fonctions) ; persAImprimer est le sous-ensemble réellement mis
  // en page ci-dessous, dans le même ordre.
  var persAImprimer = [];
  for (var pp = 0; pp < pers.length; pp++) {
    var blocPP = pers[pp], rempli = false;
    for (var rr = blocPP.startRow; rr <= blocPP.endRow && !rempli; rr++) {
      var iRow = rr - dsr;
      if (iRow < 0 || iRow >= zoneRows) continue;
      for (var ci = 1; ci < nc; ci++) {
        if (weekendDestCols.indexOf(ci + 1) !== -1) continue;
        if (String(zVals[iRow][ci]).trim() !== "") { rempli = true; break; }
      }
    }
    if (rempli) persAImprimer.push(blocPP);
  }

  var outVals = [], outBg = [], outFc = [];
  var blockRows = []; // { rowMatin, rowAM } par personne, même ordre que persAImprimer[]
  var destRow = headerRows + 2; // headerRows+1 = ligne vide entre le bloc titre et la 1ère personne

  // Ligne vide entre le bloc titre et la 1ère personne — comme les autres
  // lignes d'espacement, aucune bordure n'y est jamais posée.
  var titleSpacerVals = [], titleSpacerBg = [], titleSpacerFc = [];
  for (var i = 0; i < nc; i++) { titleSpacerVals.push(""); titleSpacerBg.push(CONFIG.BLANC); titleSpacerFc.push(CONFIG.NOIR_TEXTE); }
  outVals.push(titleSpacerVals); outBg.push(titleSpacerBg); outFc.push(titleSpacerFc);

  for (var p = 0; p < persAImprimer.length; p++) {
    var bloc = persAImprimer[p];
    var chantierRows = [bloc.startRow, bloc.startRow + 2];
    var detailRows = [bloc.startRow + 1, bloc.startRow + 3];
    var rowMatin = destRow, rowAM = destRow + 1;
    blockRows.push({ rowMatin: rowMatin, rowAM: rowAM });

    for (var h = 0; h < 2; h++) {
      var srcChantier = chantierRows[h], srcDetail = detailRows[h];
      var ziD = srcDetail - dsr, ziC = srcChantier - dsr;
      var rowVals = [], rowBg = [], rowFc = [];

      for (var i = 0; i < nc; i++) {
        var dc = i + 1;
        if (i === 0) { // colonne label : nom sur la 1ère ligne du bloc seulement
          // Lu depuis la colonne d'étiquette DE CETTE SEMAINE (labG), à la
          // ligne d'ancrage du bloc — jamais bloc.nom (qui vient toujours de
          // la colonne 1 via detecterPersonnes). Si un remplacement a été
          // saisi uniquement dans la colonne de la semaine imprimée (ex :
          // "Stadou" au lieu de "Bus"), bloc.nom reste l'ancien nom et
          // affichait le mauvais texte à l'impression.
          rowVals.push(h === 0 ? String(zVals[bloc.startRow - dsr][0]).trim() : "");
          rowBg.push(CONFIG.BLANC);
          rowFc.push(CONFIG.NOIR_TEXTE);
        } else if (weekendDestCols.indexOf(dc) !== -1) {
          // Week-end : une seule valeur pour tout le bloc, lue depuis la
          // cellule d'ANCRAGE de la fusion source (bloc.startRow) — jamais
          // une ligne de détail, qui est "couverte" par cette même fusion
          // et renverrait une valeur/un fond vides. Toujours grisée.
          var ziAnchor = bloc.startRow - dsr;
          rowVals.push(h === 0 ? zVals[ziAnchor][i] : "");
          rowBg.push(CONFIG.GRIS_FONCE_WE);
          rowFc.push(CONFIG.NOIR_TEXTE);
        } else {
          // Jour ouvré : texte de la ligne détail, fond RECALCULÉ depuis les
          // valeurs (férié > orange absence > couleur chantier > blanc, cf.
          // fondImpressionJourOuvre_) — plus jamais copié depuis la vraie
          // cellule, comme la couleur du texte, recalculée ligne par ligne
          // (cf. preparerLignesImpression_ plus haut) : destRow/dc désignent
          // bien la cellule de LA FEUILLE D'IMPRESSION où cette ligne va
          // atterrir (destRow pas encore incrémenté pour ce h).
          var prepDetail = preparerLignesImpression_(zVals[ziD][i]);
          rowVals.push(prepDetail.texte);
          rowBg.push(fondImpressionJourOuvre_(couleurFerieDest[i], zVals[ziC][i], zVals[ziD][i], couleursChantier));
          rowFc.push(CONFIG.NOIR_TEXTE);
          if (prepDetail.rouges.length > 0) richARappliquer.push({ row: destRow, col: dc, texte: prepDetail.texte, rouges: prepDetail.rouges });
        }
      }
      outVals.push(rowVals); outBg.push(rowBg); outFc.push(rowFc);

      // Chantiers utilisés cette demi-journée (jours ouvrés uniquement),
      // pour la légende — calculé en mémoire à partir du tableau déjà lu.
      for (var i = 1; i < nc; i++) {
        if (weekendDestCols.indexOf(i + 1) !== -1) continue;
        var valChantier = String(zVals[ziC][i]).trim();
        if (valChantier !== "") chantiersUtilises[valChantier] = true;
      }

      destRow++;
    }

    if (p < persAImprimer.length - 1) {
      var spacerVals = [], spacerBg = [], spacerFc = [];
      for (var i = 0; i < nc; i++) { spacerVals.push(""); spacerBg.push(CONFIG.BLANC); spacerFc.push(CONFIG.NOIR_TEXTE); }
      outVals.push(spacerVals); outBg.push(spacerBg); outFc.push(spacerFc);
      destRow++;
    }
  }

  if (outVals.length > 0) {
    var zonePerso = ts.getRange(headerRows + 1, 1, outVals.length, nc);
    zonePerso.setValues(outVals);
    zonePerso.setBackgrounds(outBg);
    zonePerso.setFontColors(outFc);
    zonePerso.setFontSize(9).setFontFamily("Arial").setHorizontalAlignment("left").setVerticalAlignment("middle").setWrap(true);
    ts.setRowHeight(headerRows + 1, 5); // ligne vide sous le bloc titre
    // Colonne label : format propre au nom (écrase le réglage générique
    // ci-dessus juste pour cette colonne).
    ts.getRange(headerRows + 1, 1, outVals.length, 1).setFontWeight("bold").setHorizontalAlignment("center").setTextRotation(90);
  }

  // 2b. Bordures + fusions par personne (posées AVANT toute fusion : une
  //     bordure sur la ligne "couverte" par une fusion à venir ne s'affiche
  //     pas une fois la fusion faite). Le paramètre "vertical" de setBorder
  //     permet de tracer TOUS les séparateurs de jours en 1 seul appel au
  //     lieu d'1 appel par colonne.
  var weekdayStart = 2, weekdayEnd = weekendDestCols.length > 0 ? weekendDestCols[0] - 1 : nc;
  for (var p = 0; p < persAImprimer.length; p++) {
    var rowMatin = blockRows[p].rowMatin, rowAM = blockRows[p].rowAM;
    ts.setRowHeights(rowMatin, 2, CONFIG.HAUTEUR_LIGNE_DEFAUT);

    ts.getRange(rowMatin, 1, 1, nc).setBorder(true, null, null, null, null, null, BLACK, MEDIUM); // haut du bloc
    ts.getRange(rowAM, 1, 1, nc).setBorder(null, null, true, null, null, null, BLACK, MEDIUM); // bas du bloc
    if (weekdayEnd >= weekdayStart) {
      ts.getRange(rowMatin, weekdayStart, 1, weekdayEnd - weekdayStart + 1).setBorder(null, null, true, null, null, null, "#aaaaaa", DOTTED); // matin/après-midi
    }
    ts.getRange(rowMatin, 1, 2, 1).setBorder(null, true, null, true, null, null, BLACK, MEDIUM); // colonne label, gauche+droite
    if (nc > 1) ts.getRange(rowMatin, 2, 2, 1).setBorder(null, true, null, null, null, null, BLACK, MEDIUM); // début de semaine
    if (nc > 2) ts.getRange(rowMatin, 2, 2, nc - 1).setBorder(null, null, null, null, true, null, BLACK, SOLID); // séparateurs de jours (internes, 1 appel)
    ts.getRange(rowMatin, nc, 2, 1).setBorder(null, null, null, true, null, null, BLACK, MEDIUM); // ferme le tableau à droite

    try { ts.getRange(rowMatin, 1, 2, 1).merge(); } catch (ex) {}
    if (weekendDestCols.length === 2 && weekendDestCols[1] === weekendDestCols[0] + 1) {
      try {
        var rngWE = ts.getRange(rowMatin, weekendDestCols[0], 2, 2);
        if (rngWE.isPartOfMerge()) rngWE.breakApart();
        rngWE.merge();
      } catch (ex) {}
    }

    // Ligne vide entre chaque personne (pas après la dernière) — AUCUNE
    // bordure n'y est jamais posée : doit rester un espace vide.
    if (p < persAImprimer.length - 1) ts.setRowHeight(rowAM + 1, 5);
  }

  // Rouge PAR LIGNE (jamais par cellule entière), pour les cases — notes ou
  // détail — qui contiennent au moins une ligne importante. Collecté plus
  // haut (ligne notes + corps personnel/sous-traitant) dans richARappliquer,
  // appliqué ici en une seule passe, AVANT le flush()/export PDF plus bas.
  // Quelques cellules seulement en pratique (peu de tâches/notes marquées
  // Important par semaine) : un setRichTextValue() individuel par cellule
  // concernée suffit largement, sur une feuille jetable qui n'a de toute
  // façon aucune validation de données à préserver.
  for (var ri = 0; ri < richARappliquer.length; ri++) {
    var entreeRiche = richARappliquer[ri];
    ts.getRange(entreeRiche.row, entreeRiche.col).setRichTextValue(texteRicheImpression_(entreeRiche.texte, entreeRiche.rouges));
  }

  var destRowAfterPers = headerRows + 1 + outVals.length;

  // 3. Légende des chantiers utilisés cette semaine (jours ouvrés) : une
  //    petite case colorée + le nom du chantier, une ligne par chantier.
  var nomsChantiers = Object.keys(chantiersUtilises).sort(function (a, b) { return a.localeCompare(b); });
  var destRow2 = destRowAfterPers;
  if (nomsChantiers.length > 0) {
    ts.setRowHeight(destRow2, 20); // espace avant la légende
    destRow2++;
    ts.getRange(destRow2, 1, 1, nc).merge();
    ts.getRange(destRow2, 1)
      .setValue("Légende chantiers")
      .setFontWeight("bold").setFontSize(9).setHorizontalAlignment("left").setVerticalAlignment("middle")
      .setBorder(true, null, null, null, null, null, BLACK, SOLID);
    ts.setRowHeight(destRow2, 18);
    destRow2++;
    for (var i = 0; i < nomsChantiers.length; i++) {
      var nomC = nomsChantiers[i];
      var couleurC = couleursChantier[nomC.toLowerCase()] || CONFIG.BLANC;
      ts.getRange(destRow2, 1).setBackground(couleurC)
        .setBorder(true, true, true, true, null, null, "#999999", SOLID);
      var texteRng = ts.getRange(destRow2, 2, 1, nc - 1);
      try { texteRng.merge(); } catch (ex) {}
      texteRng.setValue(nomC).setFontSize(9).setHorizontalAlignment("left").setVerticalAlignment("middle").setWrap(true);
      ts.setRowHeight(destRow2, 18);
      destRow2++;
    }
  }

  var plrFinal = destRow2 - 1;
  if (ts.getMaxColumns() > nc) ts.deleteColumns(nc + 1, ts.getMaxColumns() - nc);
  if (ts.getMaxRows() > plrFinal) ts.deleteRows(plrFinal + 1, ts.getMaxRows() - plrFinal);

  SpreadsheetApp.flush(); ss.setActiveSheet(ts);

  // Export PDF vers Drive (voir section EXPORT PDF ci-dessus). Tous les
  // appelants le tentent aujourd'hui (tenterPdf laissé à sa valeur par
  // défaut) : desktop, mobile ET appli web y ont maintenant accès.
  var pdfInfo = null;
  if (tenterPdf !== false) {
    var anneeSemaine = new Date().getFullYear();
    for (var iy = 1; iy < nc; iy++) { if (headVals4[2][iy] instanceof Date) { anneeSemaine = headVals4[2][iy].getFullYear(); break; } }
    var nomPdf = "Planning sem. " + sa.num + "_" + anneeSemaine + ".pdf";
    pdfInfo = essayerExporterPdfDrive(ss, ts, nomPdf);
  }

  // Onglet "📋 S<n>" supprimé juste après un export RÉUSSI, quel que soit
  // l'appelant (cf. commentaire d'en-tête, round du 28.08.2026, 3e passage)
  // — gardé si l'export échoue ou n'a pas été tenté, pour rester
  // imprimable/exportable à la main (Ctrl+P desktop, Partager > Imprimer
  // mobile).
  var supprimee = false;
  if (pdfInfo && pdfInfo.ok) { ss.deleteSheet(ts); supprimee = true; }

  // Lancée depuis le dialogue ou le mobile : un toast (une alerte s'ouvrirait
  // par-dessus la fenêtre modale, ou ne s'affiche de toute façon jamais
  // depuis un simple trigger). Lancée depuis le menu : alerte classique.
  if (labGForce) {
    var msgToast;
    if (supprimee) {
      msgToast = "✅ PDF généré. " + pdfInfo.msg;
    } else {
      msgToast = "Feuille \"" + nom + "\" créée → Ctrl+P, paysage";
      if (pdfInfo) msgToast += pdfInfo.ok ? " + PDF Drive ✅" : " (PDF Drive : échec)";
    }
    ss.toast(msgToast, "✅ Impression prête", 8);
  } else {
    var msgAlert;
    if (supprimee) {
      msgAlert = "✅ PDF généré !\n" + pdfInfo.msg;
    } else {
      msgAlert = "✅ \"" + nom + "\" créée ! → Ctrl+P paysage";
      if (pdfInfo) msgAlert += "\n" + pdfInfo.msg;
    }
    SpreadsheetApp.getUi().alert(msgAlert);
  }
  return { nom: nom, pdf: pdfInfo, supprimee: supprimee };
}
// Supprime toutes les feuilles d'impression "📋 S<n>" générées jusqu'ici.
function supprimerFeuillesImpression() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheets(), n = 0;
  for (var i = sh.length - 1; i >= 0; i--) {
    if (sh[i].getName().indexOf("📋") === 0) { ss.deleteSheet(sh[i]); n++; }
  }
  SpreadsheetApp.getUi().alert(n > 0 ? "✅ " + n + " feuille(s) supprimée(s)." : "Aucune feuille.");
}

// ==== CRÉATION SEMAINE ====
function creerSemaine() {
  var ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) { ui.alert("❌ Feuille introuvable."); return; }
  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();

  var dernSem = null;
  var r2 = sh.getRange(2, 1, 1, lastCol).getValues()[0];
  for (var c = lastCol - 1; c >= 0; c--) { var sv = String(r2[c]).trim(); if (sv !== "" && !isNaN(parseInt(sv))) { dernSem = parseInt(sv); break; } }
  if (dernSem === null) { ui.alert("❌ Aucune semaine trouvée."); return; }

  var numSem = dernSem + 1, annee = new Date().getFullYear();
  if (numSem > 52) { var t = getLundiSem(annee, numSem); if (t.getFullYear() > annee) { numSem = 1; annee++; } }

  var lundi = getLundiSem(annee, numSem);
  var jours = []; for (var d = 0; d < 7; d++) { var j = new Date(lundi.getTime()); j.setDate(lundi.getDate() + d); jours.push(j); }

  var insertCol = lastCol;
  if (!isLabelCol(lastCol)) { insertCol = lastCol + 1; }

  sh.insertColumnsAfter(insertCol - 1, 8);

  var NM = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var feries = lireFeries(ss);
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lastRow);

  var labelCol = insertCol;
  // Noms repris de la semaine précédente (dont la colonne label est restée en
  // place : les 8 nouvelles colonnes ont été insérées APRÈS elle).
  var prevLabelCol = insertCol - 8;
  var nbLignesPerso = lastRow - CONFIG.PREMIERE_LIGNE_PERSO + 1;
  var nomsSource = (prevLabelCol >= 1 && nbLignesPerso > 0)
    ? sh.getRange(CONFIG.PREMIERE_LIGNE_PERSO, prevLabelCol, nbLignesPerso, 1).getValues()
    : [];

  // En-tête (5 lignes × 8 colonnes) et fonds de tout le bloc construits en
  // mémoire, puis écrits en 2 appels — au lieu d'un appel par cellule.
  // Les LIGNES 4 et 5 sont laissées vides : réservées aux jalons du planning
  // d'architecte (ligne 4) et aux notes libres (ligne 5). Le nom du jour
  // férié va en commentaire sur la date (ligne 3) et le jour se repère à la
  // couleur de sa colonne, posée par formaterPlanning.
  var entete = [];
  for (var l = 0; l < 5; l++) { var lg = []; for (var d = 0; d < 8; d++) lg.push(""); entete.push(lg); }
  entete[0][0] = "Mois"; entete[1][0] = "Sem"; entete[2][0] = "Date";

  var fonds = [];
  for (var r = 0; r < lastRow; r++) { var lf = []; for (var d = 0; d < 8; d++) lf.push(CONFIG.BLANC); fonds.push(lf); }

  var notesDates = [[]];
  for (var d = 0; d < 7; d++) {
    var jour = jours[d], jourSem = jour.getDay();
    entete[0][d + 1] = NM[jour.getMonth() + 1];
    entete[1][d + 1] = numSem;
    entete[2][d + 1] = jour;
    sh.setColumnWidth(insertCol + 1 + d, (jourSem === 0 || jourSem === 6) ? CONFIG.LARGEUR_WEEKEND : CONFIG.LARGEUR_DATE);

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

  // Chantiers repris de la semaine précédente : uniquement les lignes
  // "Chantier" (décalage PAIR depuis PREMIERE_LIGNE_PERSO — 0, 2, 4… — vrai
  // pour tout le monde puisque les blocs de LIGNES_PAR_PERSONNE lignes sont
  // contigus, cf. detecterPersonnes), jamais les lignes de détail (absences,
  // congés...) qui ne doivent pas se reproduire automatiquement. Un point de
  // départ modifiable, sur les 7 colonnes du jour (comme les noms, repris
  // depuis le même bloc précédent via prevLabelCol).
  var chantiersSource = [];
  if (prevLabelCol >= 1 && nbLignesPerso > 0) {
    var chantiersBrut = sh.getRange(CONFIG.PREMIERE_LIGNE_PERSO, prevLabelCol + 1, nbLignesPerso, 7).getValues();
    for (var ri = 0; ri < nbLignesPerso; ri++) {
      if (ri % 2 === 0) {
        chantiersSource.push(chantiersBrut[ri]);
      } else {
        var videRow = []; for (var cc = 0; cc < 7; cc++) videRow.push("");
        chantiersSource.push(videRow);
      }
    }
  }
  if (chantiersSource.length > 0) {
    sh.getRange(CONFIG.PREMIERE_LIGNE_PERSO, labelCol + 1, chantiersSource.length, 7).setValues(chantiersSource);
  }

  sh.getRange(1, insertCol, 5, 8).setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(1, labelCol, lastRow, 1).setBorder(null, true, null, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange(4, insertCol, 1, 8).setBackground(CONFIG.GRIS_JALONS);
  sh.getRange(CONFIG.LIGNE_NOTES, insertCol, 1, 8).setBackground(CONFIG.JAUNE_NOTES);
  sh.getRange(1, insertCol, 3, 8).setHorizontalAlignment("center").setVerticalAlignment("middle");
  var moisStart = 0;
  for (var d = 1; d <= 7; d++) {
    if (d === 7 || jours[d].getMonth() !== jours[moisStart].getMonth()) {
      var sc = insertCol + 1 + moisStart, nb = d - moisStart;
      if (nb > 1) try { sh.getRange(1, sc, 1, nb).merge(); } catch (ex) {}
      moisStart = d;
    }
  }
  try { sh.getRange(2, insertCol + 1, 1, 7).merge(); } catch (ex) {}

  SpreadsheetApp.flush();
  formaterPlanning(true);
  ui.alert("✅ Semaine " + numSem + " créée !\nDu " + fmtD(jours[0]) + " au " + fmtD(jours[6]));
}

// ==== MASQUAGE DES SEMAINES PASSÉES ====
// Masque chaque bloc semaine (colonne label + 7 jours) dont le dernier jour
// est strictement avant aujourd'hui, et réaffiche les blocs en cours/à venir
// (utile pour relancer la fonction après avoir avancé dans le temps, sans
// devoir démasquer manuellement). sil=true (appel automatique depuis onOpen)
// masque sans alerte ; sil absent/false (appel depuis le menu) affiche un
// résumé.
function masquerSemainesPassees(sil) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) { if (!sil) SpreadsheetApp.getUi().alert("❌ Feuille introuvable."); return; }
  var lc = sh.getLastColumn();
  if (lc < 2) return;

  var aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
  var dates = sh.getRange(3, 1, 1, lc).getValues()[0];
  var nMasquees = 0, nAffichees = 0;

  for (var c = 1; c <= lc; c++) {
    if (!isLabelCol(c)) continue;
    var finBloc = Math.min(c + 7, lc);
    // Dernière date exploitable du bloc (on part de la fin, au cas où la
    // dernière colonne — dimanche — serait vide).
    var derniereDate = null;
    for (var cc = finBloc; cc > c; cc--) {
      var v = dates[cc - 1];
      if (v instanceof Date) { derniereDate = v; break; }
    }
    if (!derniereDate) continue; // bloc sans date lisible : on n'y touche pas

    var d = new Date(derniereDate.getFullYear(), derniereDate.getMonth(), derniereDate.getDate());
    var nbCols = finBloc - c + 1;
    if (d.getTime() < aujourdhui.getTime()) {
      sh.hideColumns(c, nbCols);
      nMasquees++;
    } else {
      sh.showColumns(c, nbCols);
      nAffichees++;
    }
  }

  SpreadsheetApp.flush();
  if (!sil) SpreadsheetApp.getUi().alert("✅ Semaines passées masquées.\n" + nMasquees + " semaine(s) masquée(s), " + nAffichees + " semaine(s) affichée(s) (en cours/à venir).");
}
function masquerSemainesPasseesManuel() { masquerSemainesPassees(false); }

// Réaffiche toutes les colonnes de la feuille Planning (filet de sécurité au
// cas où le masquage automatique cacherait une semaine dont on a encore
// besoin).
function reafficherSemaines() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) { ui.alert("❌ Feuille introuvable."); return; }
  var lc = sh.getLastColumn();
  if (lc >= 1) sh.showColumns(1, lc);
  SpreadsheetApp.flush();
  ui.alert("✅ Toutes les semaines sont réaffichées.");
}

function lireFeries(ss) {
  var f = {}, shF = ss.getSheetByName(CONFIG.FEUILLE_FERIES); if (!shF) return f;
  var lr = shF.getLastRow(); if (lr < 2) return f;
  var data = shF.getRange(2, 1, lr - 1, 2).getValues(), bgs = shF.getRange(2, 1, lr - 1, 1).getBackgrounds();
  for (var i = 0; i < data.length; i++) {
    var label = String(data[i][0]).trim(), dv = data[i][1]; if (label === "" || !dv) continue;
    var d; if (dv instanceof Date) d = dv; else { var parts = String(dv).split("/"); if (parts.length === 3) d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])); else continue; }
    var bg = bgs[i][0].toLowerCase(), couleur = (bg !== "#ffffff" && bg !== "white" && bg !== "") ? bgs[i][0] : null;
    f[fmtDK(d)] = { label: label, couleur: couleur };
  }
  return f;
}
function fmtDK(d) { return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear(); }
function getLundiSem(a, s) { var j4 = new Date(a, 0, 4), dj = (j4.getDay() + 6) % 7; var l1 = new Date(j4.getTime()); l1.setDate(j4.getDate() - dj); var l = new Date(l1.getTime()); l.setDate(l1.getDate() + (s - 1) * 7); return l; }
function fmtD(d) { var m = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"]; return d.getDate() + " " + m[d.getMonth()]; }

// ==== AJOUT PERSONNEL ====
function ajouterPersonnel() {
  var ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) { ui.alert("❌ Feuille introuvable."); return; }
  var rep = ui.prompt("👤 Ajouter du personnel", "Nom :", ui.ButtonSet.OK_CANCEL);
  if (rep.getSelectedButton() !== ui.Button.OK) return;
  var nom = rep.getResponseText().trim(); if (nom === "") { ui.alert("❌ Nom vide."); return; }
  var lc = sh.getLastColumn(), lr = sh.getLastRow();
  var pers = detecterPersonnes(sh, CONFIG.PREMIERE_LIGNE_PERSO, lr);
  var insertRow = null;
  for (var p = 0; p < pers.length; p++) { if (pers[p].nom === "") { insertRow = pers[p].startRow; break; } }
  if (insertRow === null) { var d = pers[pers.length - 1]; insertRow = d ? d.endRow + 1 : CONFIG.PREMIERE_LIGNE_PERSO; }
  sh.insertRowsAfter(insertRow - 1, CONFIG.LIGNES_PAR_PERSONNE);
  for (var c = 1; c <= lc; c++) {
    if (!isLabelCol(c)) continue;
    sh.getRange(insertRow, c).setValue(nom);
    if (CONFIG.LIGNES_PAR_PERSONNE > 1) sh.getRange(insertRow, c, CONFIG.LIGNES_PAR_PERSONNE, 1).merge();
  }
  SpreadsheetApp.flush(); formaterPlanning(true);
  ui.alert("✅ \"" + nom + "\" ajouté !");
}

// ==== CHANTIER : coloration automatique (feuille "Chantier") ====
function onEditChantier(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    if (range.getColumn() !== CONFIG.CHANTIER_COL_NOM) return;
    if (range.getRow() <= CONFIG.CHANTIER_HEADER_ROWS) return;

    var row = range.getRow();
    var nameCell = sheet.getRange(row, CONFIG.CHANTIER_COL_NOM);
    var colorCell = sheet.getRange(row, CONFIG.CHANTIER_COL_COULEUR);
    var name = nameCell.getValue();

    if (!name || name.toString().trim() === '') {
      colorCell.setBackground(null);
      colorCell.setValue('');
      // Le chantier disparaît de la liste : le Planning doit perdre sa
      // couleur immédiatement, sans passer par le menu manuel.
      recolorerChantiers();
      return;
    }

    // Une case déjà colorée — automatiquement ou choisie à la main au pot de
    // peinture — n'est JAMAIS écrasée ici : seule une case encore vierge
    // reçoit une couleur automatique. Voir note en tête de
    // lireCouleursChantier() sur pourquoi c'est le FOND qui fait foi.
    var current = (colorCell.getBackground() || '').toLowerCase();
    if (current !== '' && current !== CONFIG.BLANC) return;

    var usedColors = getUsedColorsChantier(sheet);
    var nextColor = pickNextColorChantier(usedColors);
    colorCell.setBackground(nextColor);
    colorCell.setValue(''); // la case n'affiche que la couleur, jamais son code

    // Répercute automatiquement la nouvelle couleur sur le Planning, sans
    // avoir besoin de relancer "Recolorer tous les chantiers" à la main.
    recolorerChantiers();
  } catch (err) {
    console.error(err);
  }
}

function getUsedColorsChantier(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.CHANTIER_HEADER_ROWS) return [];
  var names = sheet.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, lastRow - CONFIG.CHANTIER_HEADER_ROWS, 1).getValues();
  var backgrounds = sheet.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_COULEUR, lastRow - CONFIG.CHANTIER_HEADER_ROWS, 1).getBackgrounds();
  var used = [];
  for (var i = 0; i < names.length; i++) {
    if (names[i][0] && names[i][0].toString().trim() !== '') {
      used.push((backgrounds[i][0] || '').toLowerCase());
    }
  }
  return used;
}

function pickNextColorChantier(usedColors) {
  for (var i = 0; i < CHANTIER_PALETTE.length; i++) {
    if (usedColors.indexOf(CHANTIER_PALETTE[i]) === -1) return CHANTIER_PALETTE[i];
  }
  return CHANTIER_PALETTE[usedColors.length % CHANTIER_PALETTE.length];
}

// Remet à plat la feuille "Chantier" d'un coup, PUIS répercute les couleurs
// sur le Planning (menu 🔧 Planning > 🎨 Recolorer tous les chantiers).
// NE TOUCHE JAMAIS une case déjà colorée (auto ou choisie à la main au pot
// de peinture) : seules les cases encore vierges reçoivent une couleur
// automatique. C'est aussi l'action à lancer après avoir recoloré une case
// à la main, pour répercuter ce choix sur le Planning — repeindre une case
// ne déclenche aucun événement que le script pourrait intercepter tout
// seul (cf. note en tête de lireCouleursChantier()).
function recolorAllChantiers() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.FEUILLE_CHANTIER);
  if (!sheet) { ui.alert('❌ Feuille "Chantier" introuvable.'); return; }
  var lastRow = sheet.getLastRow();
  if (lastRow <= CONFIG.CHANTIER_HEADER_ROWS) { ui.alert("Aucun chantier à recolorer (feuille \"Chantier\" vide)."); return; }
  var nRows = lastRow - CONFIG.CHANTIER_HEADER_ROWS;
  var names = sheet.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, nRows, 1).getValues();
  var colorRange = sheet.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_COULEUR, nRows, 1);
  var backgrounds = colorRange.getBackgrounds();
  var usedColors = [];
  var nAuto = 0;

  for (var i = 0; i < names.length; i++) {
    var name = names[i][0];
    if (!name || name.toString().trim() === '') { backgrounds[i][0] = null; continue; }
    var current = (backgrounds[i][0] || '').toLowerCase();
    if (current !== '' && current !== CONFIG.BLANC) { usedColors.push(current); continue; } // déjà coloré : intouché
    var color = pickNextColorChantier(usedColors);
    backgrounds[i][0] = color;
    usedColors.push(color);
    nAuto++;
  }
  colorRange.setBackgrounds(backgrounds);
  colorRange.setValue(''); // la case n'affiche que la couleur, jamais son code
  recolorerChantiers(); // applique les couleurs (auto + choisies à la main) sur le Planning

  var msg = "✅ Planning mis à jour avec les couleurs actuelles.";
  if (nAuto > 0) msg += "\n" + nAuto + " nouveau(x) chantier(s) coloré(s) automatiquement.";
  ui.alert(msg);
}


// Contenu du dialogue de sélection de semaine. Le HTML est embarqué ici
// pour que TOUT le projet tienne dans un seul fichier à coller.
function htmlSelecteurSemaine() {
  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<style>",
    "  * { box-sizing: border-box; }",
    "  body {",
    "    font-family: Roboto, Arial, sans-serif; font-size: 13px; color: #202124;",
    "    margin: 0; padding: 14px 16px 12px; background: #fff;",
    "  }",
    "  .barre { display: flex; gap: 6px; align-items: center; margin-bottom: 12px; }",
    "  .barre label { color: #5f6368; white-space: nowrap; }",
    "  #numSem {",
    "    width: 58px; padding: 5px 6px; font-size: 13px; font-family: inherit;",
    "    border: 1px solid #dadce0; border-radius: 4px; text-align: center;",
    "  }",
    "  button {",
    "    font-family: inherit; font-size: 13px; padding: 6px 10px; cursor: pointer;",
    "    border: 1px solid #dadce0; border-radius: 4px; background: #fff; color: #202124;",
    "  }",
    "  button:hover:not(:disabled) { background: #f1f3f4; }",
    "  button:disabled { color: #bdc1c6; cursor: default; }",
    "  .pousse { margin-left: auto; }",
    "",
    "  .nav { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 6px; }",
    "  .nav button { border: none; font-size: 17px; line-height: 1; padding: 3px 9px; color: #5f6368; }",
    "  #mois { font-weight: 500; min-width: 150px; text-align: center; text-transform: capitalize; }",
    "",
    "  table { border-collapse: collapse; width: 100%; table-layout: fixed; }",
    "  th { font-weight: 500; color: #5f6368; font-size: 11px; padding: 5px 0; }",
    "  th.cs { width: 34px; }",
    "  td { text-align: center; padding: 0; }",
    "  tbody tr { cursor: pointer; }",
    "  tbody tr.off { cursor: default; }",
    "  tbody tr td { border-top: 1px solid transparent; border-bottom: 1px solid transparent; }",
    "  tbody tr:not(.off):hover td { background: #f1f3f4; }",
    "  tbody tr.sel td { background: #e8f0fe; border-top-color: #1a73e8; border-bottom-color: #1a73e8; }",
    "  tbody tr.sel td:first-child { border-left: 1px solid #1a73e8; }",
    "  tbody tr.sel td:last-child { border-right: 1px solid #1a73e8; }",
    "  .num { display: block; padding: 7px 0; }",
    "  tbody tr.off .num { color: #dadce0; }",
    "  td.hors .num { color: #bdc1c6; }",
    "  tbody tr.off td.hors .num { color: #ebedef; }",
    "  td.sem { font-size: 11px; color: #5f6368; background: #f8f9fa; }",
    "  tbody tr.sel td.sem { background: #d2e3fc; color: #1967d2; font-weight: 500; }",
    "  tbody tr.off td.sem { color: #dadce0; }",
    "  .auj .num {",
    "    background: #1a73e8; color: #fff; border-radius: 50%;",
    "    width: 24px; height: 24px; line-height: 24px; padding: 0; margin: 3px auto;",
    "  }",
    "  tbody tr.sel .auj .num { background: #1a73e8; color: #fff; }",
    "",
    "  .pied {",
    "    margin-top: 14px; padding-top: 12px; border-top: 1px solid #e8eaed;",
    "    display: flex; align-items: center; gap: 10px;",
    "  }",
    "  #sel { flex: 1; color: #5f6368; line-height: 1.35; }",
    "  #sel b { color: #202124; }",
    "  #go {",
    "    background: #1a73e8; color: #fff; border-color: #1a73e8; font-weight: 500; padding: 8px 18px;",
    "  }",
    "  #go:hover:not(:disabled) { background: #1765cc; }",
    "  #go:disabled { background: #f1f3f4; border-color: #f1f3f4; color: #bdc1c6; }",
    "  .vide { padding: 30px 10px; text-align: center; color: #5f6368; }",
    "</style>",
    "</head>",
    "<body>",
    "",
    "<div class=\"barre\">",
    "  <label for=\"numSem\">N° semaine</label>",
    "  <input id=\"numSem\" type=\"number\" min=\"1\" max=\"53\" placeholder=\"34\">",
    "  <button id=\"btnAuj\" class=\"pousse\">Cette semaine</button>",
    "  <button id=\"btnSuiv\">Suivante</button>",
    "</div>",
    "",
    "<div class=\"nav\">",
    "  <button id=\"prev\" title=\"Mois précédent\">&#8249;</button>",
    "  <span id=\"mois\"></span>",
    "  <button id=\"next\" title=\"Mois suivant\">&#8250;</button>",
    "</div>",
    "",
    "<table>",
    "  <thead><tr><th class=\"cs\">Sem</th><th>L</th><th>M</th><th>M</th><th>J</th><th>V</th><th>S</th><th>D</th></tr></thead>",
    "  <tbody id=\"corps\"></tbody>",
    "</table>",
    "",
    "<div class=\"pied\">",
    "  <div id=\"sel\">Choisis une semaine dans le calendrier.</div>",
    "  <button id=\"go\" disabled>Imprimer</button>",
    "</div>",
    "",
    "<script>",
    "var MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];",
    "var semaines = [], parLundi = {}, aujourdhui = null, sel = null, curY = 0, curM = 0;",
    "",
    "function iso(d) {",
    "  var m = d.getMonth() + 1, j = d.getDate();",
    "  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;",
    "}",
    "function deIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }",
    "function lundiDe(d) { var x = new Date(d.getTime()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }",
    "// Numéro de semaine ISO, pour les semaines absentes du planning.",
    "function semIso(d) {",
    "  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());",
    "  x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7));",
    "  var j4 = new Date(x.getFullYear(), 0, 4);",
    "  return 1 + Math.round(((x - j4) / 86400000 - 3 + ((j4.getDay() + 6) % 7)) / 7);",
    "}",
    "function jourCourt(d) { return ['dim','lun','mar','mer','jeu','ven','sam'][d.getDay()]; }",
    "",
    "function init(data) {",
    "  semaines = data.semaines || [];",
    "  aujourdhui = data.aujourdhui ? deIso(data.aujourdhui) : new Date();",
    "  for (var i = 0; i < semaines.length; i++) parLundi[semaines[i].debut] = semaines[i];",
    "",
    "  if (semaines.length === 0) {",
    "    document.body.innerHTML = '<div class=\"vide\">Aucune semaine trouvée dans la feuille « Planning ».</div>';",
    "    return;",
    "  }",
    "  // Présélection : la semaine de la cellule active, sinon celle d'aujourd'hui.",
    "  var depart = null;",
    "  for (var i = 0; i < semaines.length; i++) if (semaines[i].labG === data.actifLabG) depart = semaines[i];",
    "  if (!depart) depart = semaineDuJour(aujourdhui);",
    "  if (!depart) depart = semaines[0];",
    "  var d0 = deIso(depart.debut);",
    "  curY = d0.getFullYear(); curM = d0.getMonth();",
    "  choisir(depart);",
    "  rendre();",
    "}",
    "",
    "function semaineDuJour(d) {",
    "  var cle = iso(lundiDe(d));",
    "  return parLundi[cle] || null;",
    "}",
    "",
    "function choisir(s) {",
    "  sel = s;",
    "  var go = document.getElementById('go');",
    "  if (!s) { document.getElementById('sel').textContent = 'Choisis une semaine dans le calendrier.'; go.disabled = true; return; }",
    "  var a = deIso(s.debut), b = deIso(s.fin);",
    "  var txt = jourCourt(a) + ' ' + a.getDate() + ' ' + MOIS[a.getMonth()] +",
    "            ' – ' + jourCourt(b) + ' ' + b.getDate() + ' ' + MOIS[b.getMonth()] + ' ' + b.getFullYear();",
    "  document.getElementById('sel').innerHTML = '<b>Semaine ' + s.num + '</b><br>' + txt;",
    "  document.getElementById('numSem').value = s.num;",
    "  go.disabled = false;",
    "}",
    "",
    "function rendre() {",
    "  document.getElementById('mois').textContent = MOIS[curM] + ' ' + curY;",
    "  var debut = lundiDe(new Date(curY, curM, 1));",
    "  var corps = document.getElementById('corps');",
    "  corps.innerHTML = '';",
    "  var isoAuj = iso(aujourdhui);",
    "",
    "  for (var l = 0; l < 6; l++) {",
    "    var lundi = new Date(debut.getTime());",
    "    lundi.setDate(debut.getDate() + l * 7);",
    "    if (l > 0 && lundi.getMonth() !== curM && lundi > new Date(curY, curM + 1, 0)) break;",
    "",
    "    var s = parLundi[iso(lundi)];",
    "    var tr = document.createElement('tr');",
    "    if (!s) tr.className = 'off';",
    "    else if (sel && s.labG === sel.labG) tr.className = 'sel';",
    "",
    "    var td = document.createElement('td');",
    "    td.className = 'sem';",
    "    td.textContent = s ? s.num : semIso(lundi);",
    "    tr.appendChild(td);",
    "",
    "    for (var j = 0; j < 7; j++) {",
    "      var d = new Date(lundi.getTime());",
    "      d.setDate(lundi.getDate() + j);",
    "      var c = document.createElement('td');",
    "      if (d.getMonth() !== curM) c.className = 'hors';",
    "      if (iso(d) === isoAuj) c.className += ' auj';",
    "      var sp = document.createElement('span');",
    "      sp.className = 'num';",
    "      sp.textContent = d.getDate();",
    "      c.appendChild(sp);",
    "      tr.appendChild(c);",
    "    }",
    "    if (s) tr.onclick = (function (w) { return function () { choisir(w); rendre(); }; })(s);",
    "    corps.appendChild(tr);",
    "  }",
    "}",
    "",
    "function allerAuMois(d) { curY = d.getFullYear(); curM = d.getMonth(); rendre(); }",
    "",
    "document.getElementById('prev').onclick = function () { allerAuMois(new Date(curY, curM - 1, 1)); };",
    "document.getElementById('next').onclick = function () { allerAuMois(new Date(curY, curM + 1, 1)); };",
    "",
    "document.getElementById('btnAuj').onclick = function () {",
    "  var s = semaineDuJour(aujourdhui);",
    "  if (!s) { document.getElementById('sel').textContent = \"La semaine en cours n'est pas dans le planning.\"; return; }",
    "  choisir(s); allerAuMois(deIso(s.debut));",
    "};",
    "document.getElementById('btnSuiv').onclick = function () {",
    "  var base = sel ? deIso(sel.debut) : lundiDe(aujourdhui);",
    "  var suiv = new Date(base.getTime()); suiv.setDate(base.getDate() + 7);",
    "  var s = parLundi[iso(suiv)];",
    "  if (!s) { document.getElementById('sel').textContent = \"La semaine suivante n'existe pas encore dans le planning.\"; return; }",
    "  choisir(s); allerAuMois(deIso(s.debut));",
    "};",
    "document.getElementById('numSem').oninput = function () {",
    "  var v = String(this.value).trim();",
    "  if (v === '') return;",
    "  for (var i = 0; i < semaines.length; i++) {",
    "    if (semaines[i].num === v) { choisir(semaines[i]); allerAuMois(deIso(semaines[i].debut)); return; }",
    "  }",
    "};",
    "",
    "document.getElementById('go').onclick = function () {",
    "  if (!sel) return;",
    "  var b = this;",
    "  b.disabled = true; b.textContent = 'Génération…';",
    "  google.script.run",
    "    .withSuccessHandler(function () { google.script.host.close(); })",
    "    .withFailureHandler(function (e) {",
    "      b.disabled = false; b.textContent = 'Imprimer';",
    "      document.getElementById('sel').textContent = 'Erreur : ' + e.message;",
    "    })",
    "    .apiImprimerSemaine(sel.labG);",
    "};",
    "",
    "google.script.run.withSuccessHandler(init).apiListerSemaines();",
    "</script>",
    "</body>",
    "</html>"
  ].join("\n");
}

// ==== MIGRATION SCHÉMA (ligne "notes") ====
// Migration faite une fois pour toutes (planning "Planning 2026") : plus
// dans le menu, pour ne pas l'encombrer avec une entrée qui ne resservira
// plus. Fonctions gardées ici au cas où (ex : un nouvel onglet créé à
// partir d'une ancienne copie du planning) — se relancent depuis l'éditeur
// Apps Script (sélecteur de fonction ▶ en haut, choisir migrerLigneNotes).
// Avant cette version, le personnel commençait ligne 5, juste après les
// jalons d'architecte (ligne 4). Cette version ajoute une ligne "notes"
// libre en ligne 5 et décale donc tout le personnel d'une ligne (il
// commence maintenant ligne 6, cf. CONFIG.PREMIERE_LIGNE_PERSO). Sur un
// planning déjà en service, ce décalage doit être fait UNE FOIS dans la
// feuille elle-même (insertion d'une ligne), sinon la 1ère personne de
// CHAQUE semaine serait mal interprétée par le reste du script (nom
// perdu, lignes "Chantier"/détail mélangées).
// Détection : sur un planning "ancien" (jamais migré), la ligne 5 contient
// encore les vraies données de la 1ère personne, donc un nom en colonne 1
// ligne 5. Sur un planning déjà migré (ou un planning tout neuf, encore
// vide), cette cellule est vide. Filet de sécurité si ce test se trompe
// dans ce 2e cas : réinsérer une ligne dans une zone déjà vide ne casse
// rien, ça décale juste des cases vides d'une ligne de plus.
function ligneNotesAMigrer(sh) {
  if (sh.getLastRow() < 5) return false;
  return String(sh.getRange(5, 1).getValue()).trim() !== "";
}
function migrerLigneNotes() {
  var ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.NOM_FEUILLE);
  if (!sh) { ui.alert("❌ Feuille introuvable."); return; }
  if (!ligneNotesAMigrer(sh)) { ui.alert("✅ Déjà à jour — rien à migrer."); return; }
  sh.insertRowsBefore(5, 1);
  SpreadsheetApp.flush();
  formaterPlanning(true);
  ui.alert("✅ Migration terminée !\nLa ligne 5 est réservée aux notes libres ; tout le personnel a été décalé d'une ligne (ligne 6 et suivantes).");
}

// ==== MENU ====
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔧 Planning')
    .addItem('Formater le planning', 'formaterPlanningManuel')
    .addSeparator()
    .addItem('➕ Ajouter semaine suivante', 'creerSemaine')
    .addItem('👤 Ajouter du personnel', 'ajouterPersonnel')
    .addSeparator()
    .addItem('🎨 Recolorer tous les chantiers', 'recolorAllChantiers')
    .addSeparator()
    .addItem('🖨️ Imprimer une semaine…', 'ouvrirSelecteurSemaine')
    .addItem('🖨️ Imprimer la semaine active', 'imprimerSemaine')
    .addItem('📱 Créer/réparer la feuille mobile', 'assurerFeuilleMobileManuel')
    .addItem('🗑️ Supprimer feuilles impression', 'supprimerFeuillesImpression')
    .addSeparator()
    .addItem('🙈 Masquer les semaines passées', 'masquerSemainesPasseesManuel')
    .addItem('👁️ Réafficher toutes les semaines', 'reafficherSemaines')
    .addToUi();

  // Masquage automatique des semaines passées, création de la feuille mobile
  // si elle manque, et rappel si le trigger mobile n'est pas encore installé
  // — à chaque ouverture du fichier (silencieux : pas d'alerte, juste un
  // toast pour le rappel, pour ne pas gêner l'ouverture). Chacun dans son
  // propre try/catch pour qu'un problème sur l'un n'empêche pas les autres
  // ni le menu de s'afficher.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { masquerSemainesPassees(true); } catch (err) { console.error(err); }
  try { assurerFeuilleMobile(ss); } catch (err) { console.error(err); }
  try {
    var dejaInstalle = false, triggers = ScriptApp.getProjectTriggers();
    for (var ti = 0; ti < triggers.length; ti++) {
      if (triggers[ti].getHandlerFunction() === 'onEditMobile' && triggers[ti].getEventType() === ScriptApp.EventType.ON_EDIT) { dejaInstalle = true; break; }
    }
    if (!dejaInstalle) {
      ss.toast('Menu 🔧 Planning > 📱 Créer/réparer la feuille mobile (une fois) pour activer l\'impression + PDF depuis le mobile.', '⚠️ Configuration mobile à faire', 10);
    }
  } catch (err) { console.error(err); }
}
function formaterPlanningManuel() { formaterPlanning(false); }
// Outil de dépannage bas niveau (efface toutes les bordures de la feuille
// active) : plus dans le menu, "Formater le planning" suffit dans tous les
// cas normaux. Gardé pour un dépannage ponctuel depuis l'éditeur Apps
// Script (sélecteur de fonction ▶, choisir resetBordures) si jamais des
// bordures se retrouvent dans un état incohérent.
function resetBordures() { var s = SpreadsheetApp.getActiveSheet(); s.getRange(1, 1, s.getLastRow(), s.getLastColumn()).setBorder(false, false, false, false, false, false); }
