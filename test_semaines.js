// Teste creerSemaineWeb_() et assurerSemainesAvance_() de WebApp.gs contre une
// FAUSSE feuille de calcul (Apps Script n'est pas exécutable ici). Le code
// testé est bien celui du fichier livré : WebApp.gs est lu sur le disque et
// évalué tel quel dans un contexte où SpreadsheetApp & co sont simulés.
//
// C'est la fonction la plus sensible du projet : elle modifie la STRUCTURE du
// planning réel (insertion de colonnes) automatiquement à chaque ouverture de
// l'appli. Elle ne part pas en production sans ces vérifications.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ============ FAUSSE FEUILLE ============ */
function creerFausseFeuille(nbLignes, nbColonnes, nom) {
  const grille = [];
  for (let r = 0; r < nbLignes; r++) {
    const l = [];
    for (let c = 0; c < nbColonnes; c++) l.push("");
    grille.push(l);
  }
  // Couleurs de police, en parallèle de `grille` : uniquement pour pouvoir
  // VÉRIFIER après coup ce que setFontColors() a réellement posé (round du
  // 28.08.2026 : couleur des notes selon le tag [Important]) — avant, seul le
  // NOMBRE d'appels était compté, jamais la valeur posée.
  const couleursPolice = [];
  for (let r = 0; r < nbLignes; r++) {
    const l = [];
    for (let c = 0; c < nbColonnes; c++) l.push("#000000");
    couleursPolice.push(l);
  }
  const fusions = [];      // {row, col, numRows, numCols}
  const largeurs = {};
  const appels = { setValues: 0, setValue: 0, getValues: 0, insertColumnsAfter: 0 };

  // Compteur d'appels API : dans le vrai Apps Script, CHACUNE de ces méthodes
  // est un aller-retour réseau vers Sheets, au coût quasi identique quelle que
  // soit la quantité de données échangée (cf. note PERFORMANCE en tête de
  // Planning_Format.gs). C'est donc le nombre d'appels — pas le volume — qui
  // fait la lenteur ressentie, et c'est ce que ce compteur mesure pour pouvoir
  // CHIFFRER une optimisation au lieu de l'affirmer.
  const api = { total: 0, parNom: {} };
  function compter(nom) {
    api.total++;
    api.parNom[nom] = (api.parNom[nom] || 0) + 1;
  }

  // noop compté : un setBackground/setBorder/... ne fait rien ici, mais coûte
  // un vrai appel en production — l'ignorer fausserait complètement la mesure.
  function noopCompte(nom) {
    return function () { compter(nom); return this; };
  }
  const noop = function () { return this; };

  function Range(row, col, numRows, numCols) {
    return {
      _r: row, _c: col, _nr: numRows, _nc: numCols,
      getRow: () => row, getColumn: () => col, getNumRows: () => numRows, getNumColumns: () => numCols,
      getValues() {
        appels.getValues++; compter("getValues");
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const l = [];
          for (let c = 0; c < numCols; c++) l.push(lire(row + r, col + c));
          out.push(l);
        }
        return out;
      },
      getValue() { compter("getValue"); return lire(row, col); },
      setValues(vals) {
        appels.setValues++; compter("setValues");
        if (vals.length !== numRows) throw new Error("setValues : " + vals.length + " lignes pour une plage de " + numRows);
        for (let r = 0; r < numRows; r++) {
          if (vals[r].length !== numCols) throw new Error("setValues : " + vals[r].length + " colonnes pour une plage de " + numCols);
          for (let c = 0; c < numCols; c++) ecrire(row + r, col + c, vals[r][c]);
        }
        return this;
      },
      setValue(v) { appels.setValue++; compter("setValue"); ecrire(row, col, v); return this; },
      getBackgrounds() { compter("getBackgrounds"); return matriceDe("#ffffff"); },
      getFontColors() {
        compter("getFontColors");
        const out = [];
        for (let r = 0; r < numRows; r++) { const l = []; for (let c = 0; c < numCols; c++) l.push(lireCouleur(row + r, col + c)); out.push(l); }
        return out;
      },
      getFontSizes() { compter("getFontSizes"); return matriceDe(9); },
      getHorizontalAlignments() { compter("getHorizontalAlignments"); return matriceDe("left"); },
      getFontWeights() { compter("getFontWeights"); return matriceDe("normal"); },
      getMergedRanges() {
        compter("getMergedRanges");
        return fusions
          .filter((f) => f.col === col && f.row >= row && f.row + f.numRows - 1 <= row + numRows - 1)
          .map((f) => ({ getRow: () => f.row, getNumRows: () => f.numRows, getColumn: () => f.col, getNumColumns: () => f.numCols }));
      },
      merge() {
        compter("merge");
        if (!fusions.some((f) => f.row === row && f.col === col && f.numRows === numRows && f.numCols === numCols)) {
          fusions.push({ row, col, numRows, numCols });
        }
        return this;
      },
      breakApart() { compter("breakApart"); return this; },
      isPartOfMerge() { compter("isPartOfMerge"); return fusions.some((f) => f.row === row && f.col === col); },
      setBackground: noopCompte("setBackground"), setBackgrounds: noopCompte("setBackgrounds"),
      setBorder: noopCompte("setBorder"), setNumberFormat: noopCompte("setNumberFormat"),
      setNotes: noopCompte("setNotes"), setHorizontalAlignment: noopCompte("setHorizontalAlignment"),
      setVerticalAlignment: noopCompte("setVerticalAlignment"),
      setFontWeight: noopCompte("setFontWeight"), setFontFamily: noopCompte("setFontFamily"),
      setFontSize: noopCompte("setFontSize"),
      setFontColors(vals) {
        compter("setFontColors");
        for (let r = 0; r < numRows; r++) for (let c = 0; c < numCols; c++) ecrireCouleur(row + r, col + c, vals[r][c]);
        return this;
      },
      setFontSizes: noopCompte("setFontSizes"), setHorizontalAlignments: noopCompte("setHorizontalAlignments"),
      setFontWeights: noopCompte("setFontWeights"), setTextRotation: noopCompte("setTextRotation"),
      setDataValidations: noopCompte("setDataValidations"), setWrap: noopCompte("setWrap"),
      clearContent: noopCompte("clearContent")
    };
    function matriceDe(v) {
      const out = [];
      for (let r = 0; r < numRows; r++) { const l = []; for (let c = 0; c < numCols; c++) l.push(v); out.push(l); }
      return out;
    }
  }

  function lire(r, c) {
    if (r < 1 || c < 1 || r > grille.length || c > grille[0].length) return "";
    return grille[r - 1][c - 1];
  }
  function ecrire(r, c, v) {
    while (grille.length < r) { const l = []; for (let i = 0; i < grille[0].length; i++) l.push(""); grille.push(l); }
    if (c > grille[0].length) throw new Error("écriture hors grille, colonne " + c);
    grille[r - 1][c - 1] = v;
  }
  function lireCouleur(r, c) {
    if (r < 1 || c < 1 || r > couleursPolice.length || c > couleursPolice[0].length) return "#000000";
    return couleursPolice[r - 1][c - 1];
  }
  function ecrireCouleur(r, c, v) {
    while (couleursPolice.length < r) { const l = []; for (let i = 0; i < couleursPolice[0].length; i++) l.push("#000000"); couleursPolice.push(l); }
    if (c > couleursPolice[0].length) return; // hors grille (ex. feuille Chantier) : rien à stocker
    couleursPolice[r - 1][c - 1] = v;
  }

  return {
    _grille: grille, _couleursPolice: couleursPolice, _fusions: fusions, _largeurs: largeurs, _appels: appels, _api: api,
    getName: () => nom || "Planning",
    getParent: () => faussSS,
    getLastRow: () => { compter("getLastRow"); return grille.length; },
    deleteRow(r) { compter("deleteRow"); grille.splice(r - 1, 1); return this; },
    getLastColumn() {
      compter("getLastColumn");
      let max = 0;
      for (let r = 0; r < grille.length; r++) {
        for (let c = grille[0].length; c >= 1; c--) {
          if (grille[r][c - 1] !== "" && grille[r][c - 1] != null) { if (c > max) max = c; break; }
        }
      }
      return max;
    },
    getRange(a, b, c, d) {
      if (typeof a === "string") throw new Error("notation A1 non simulée");
      return Range(a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
    },
    insertColumnsAfter(apres, combien) {
      appels.insertColumnsAfter++;
      for (const l of grille) {
        const insert = [];
        for (let i = 0; i < combien; i++) insert.push("");
        l.splice(apres, 0, ...insert);
      }
      for (const l of couleursPolice) {
        const insert = [];
        for (let i = 0; i < combien; i++) insert.push("#000000");
        l.splice(apres, 0, ...insert);
      }
      for (const f of fusions) if (f.col > apres) f.col += combien;
      return this;
    },
    setColumnWidth(c, w) { compter("setColumnWidth"); largeurs[c] = w; return this; },
    setColumnWidths: noopCompte("setColumnWidths"), setRowHeight: noopCompte("setRowHeight"),
    setRowHeights: noopCompte("setRowHeights"), setHiddenGridlines: noopCompte("setHiddenGridlines"),
    setFrozenRows: noopCompte("setFrozenRows"),
    getColumnWidth: (c) => { compter("getColumnWidth"); return largeurs[c] || 100; },
    getRowHeight: () => { compter("getRowHeight"); return 20; },
    getRangeList: () => { compter("getRangeList"); return { setBorder: noopCompte("rl.setBorder"), setTextRotation: noopCompte("rl.setTextRotation") }; },
    getSheetId: () => 1
  };
}

let faussSS = null;

/* ============ FIXTURE : un planning de départ ============ */
// 2 semaines (36 et 37), 3 personnes + 1 sous-traitant (lignes 6, 10, 14, 22
// — la ligne 18 reste libre, comme un emplacement vide du planning réel).
function planningDeDepart() {
  const NB_LIGNES = 25, NB_COLS = 16; // 2 semaines de 8 colonnes
  const sh = creerFausseFeuille(NB_LIGNES, NB_COLS);
  const MOIS = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  [{ labG: 1, num: 36, lundi: new Date(2026, 7, 31) },
   { labG: 9, num: 37, lundi: new Date(2026, 8, 7) }].forEach((sem) => {
    sh.getRange(1, sem.labG).setValue("Mois");
    sh.getRange(2, sem.labG).setValue("Sem");
    sh.getRange(3, sem.labG).setValue("Date");
    for (let d = 0; d < 7; d++) {
      const j = new Date(sem.lundi.getFullYear(), sem.lundi.getMonth(), sem.lundi.getDate() + d);
      sh.getRange(1, sem.labG + 1 + d).setValue(MOIS[j.getMonth() + 1]);
      sh.getRange(2, sem.labG + 1 + d).setValue(sem.num);
      sh.getRange(3, sem.labG + 1 + d).setValue(j);
    }
    // Noms (colonne label de CHAQUE semaine) + un chantier lundi matin.
    [[6, "Lionel"], [10, "Mathis"], [14, "Bastien"], [22, "Armature / Béton"]].forEach(([ligne, nom]) => {
      sh.getRange(ligne, sem.labG).setValue(nom);
    });
  });
  // Semaine 37 : du contenu, pour vérifier ce qui se reporte et ce qui ne se
  // reporte pas. Ligne 6 = chantier matin, ligne 7 = détail matin.
  sh.getRange(6, 10).setValue("BINE");        // chantier lundi matin
  sh.getRange(7, 10).setValue("- Coffrage");  // détail lundi matin
  sh.getRange(8, 10).setValue("BINE");        // chantier lundi après-midi
  sh.getRange(9, 10).setValue("- Congé");     // détail lundi après-midi (ne doit PAS se reporter)
  sh.getRange(4, 10).setValue("Contrôle");    // jalon
  sh.getRange(5, 10).setValue("Note test");   // note
  return sh;
}

/* ============ CONTEXTE D'EXÉCUTION ============ */
// Fonctions de Planning_Format.gs dont WebApp.gs a besoin, reprises à
// l'identique (elles ne sont pas l'objet du test : elles doivent juste se
// comporter comme les vraies).
const PRELUDE = `
var CONFIG = {
  NOM_FEUILLE: "Planning", FEUILLE_FERIES: "Fériés", FEUILLE_CHANTIER: "Chantier",
  LARGEUR_DATE: 200, LARGEUR_WEEKEND: 20, LARGEUR_LABEL_DATE: 40,
  PREMIERE_LIGNE_PERSO: 6, LIGNES_PAR_PERSONNE: 4,
  HAUTEUR_LIGNE_CHANTIER: 15, HAUTEUR_LIGNE_DEFAUT: 30,
  GRIS_CLAIR: "#f3f3f3", GRIS_FONCE_WE: "#999999", ORANGE_CLAIR_3: "#f9cb9c",
  GRIS_JALONS: "#d9d9d9", LIGNE_NOTES: 5, JAUNE_NOTES: "#fff2cc",
  BLANC: "#ffffff", CHANTIER_COL_NOM: 1, CHANTIER_COL_COULEUR: 2, CHANTIER_HEADER_ROWS: 1,
  ROUGE_TEXTE: "#ff0000", VERT_TEXTE: "#38761d", NOIR_TEXTE: "#000000"
};
function isLabelCol(col) { return col > 0 && (col - 1) % 8 === 0; }
// Reprise à l'identique de Planning_Format.gs — nécessaire depuis que ce
// harnais teste aussi apiEnregistrerPlage() (round du 28.08.2026), qui s'en
// sert pour repérer, en une seule lecture de la ligne 3, quelles colonnes
// sont des jours ouvrés (par opposition aux colonnes label et week-end).
function construireCarteColonnes(sheet, lc, feries) {
  var vals = sheet.getRange(3, 1, 1, lc).getValues()[0];
  var map = new Array(lc + 1);
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
function isoJour(d) {
  var m = d.getMonth() + 1, j = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (j < 10 ? "0" : "") + j;
}
function fmtDK(d) { return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear(); }
function lireFeries() { return {}; }
function listerSemainesPlanning(sh) {
  var lc = sh.getLastColumn();
  var r2 = sh.getRange(2, 1, 1, lc).getValues()[0];
  var r3 = sh.getRange(3, 1, 1, lc).getValues()[0];
  var semaines = [];
  for (var c = 1; c <= lc; c++) {
    if (!isLabelCol(c)) continue;
    var fin = Math.min(c + 7, lc), dates = [];
    for (var cc = c + 1; cc <= fin; cc++) if (r3[cc - 1] instanceof Date) dates.push(r3[cc - 1]);
    if (dates.length === 0) continue;
    semaines.push({ labG: c, num: String(r2[c]).trim(), dateDebut: dates[0], dateFin: dates[dates.length - 1] });
  }
  return semaines;
}
function detecterPersonnes(sh, fr, lr) {
  var lignesPar = CONFIG.LIGNES_PAR_PERSONNE;
  if (lr < fr) return [];
  var colA = sh.getRange(fr, 1, lr - fr + 1, 1);
  var noms = colA.getValues();
  function nomDe(row) { var i = row - fr; return (i >= 0 && i < noms.length) ? String(noms[i][0]).trim() : ""; }
  var p = [], mg = colA.getMergedRanges();
  if (mg.length > 0) {
    mg.sort(function (a, b) { return a.getRow() - b.getRow(); });
    for (var i = 0; i < mg.length; i++) { var m = mg[i], ms = m.getRow(), me = ms + m.getNumRows() - 1; if (ms >= fr) p.push({ nom: nomDe(ms), startRow: ms, endRow: me }); }
    var cv = {}; for (var i2 = 0; i2 < p.length; i2++) for (var r = p[i2].startRow; r <= p[i2].endRow; r++) cv[r] = true;
    var gs = null;
    for (var r2 = fr; r2 <= lr + 1; r2++) {
      if (r2 <= lr && !cv[r2]) { if (gs === null) gs = r2; continue; }
      if (gs !== null) { var g = gs; while (g + lignesPar - 1 <= r2 - 1) { p.push({ nom: nomDe(g), startRow: g, endRow: g + lignesPar - 1 }); g += lignesPar; } gs = null; }
    }
    p.sort(function (a, b) { return a.startRow - b.startRow; });
  }
  if (p.length === 0) { var cr = fr; while (cr + lignesPar - 1 <= lr) { p.push({ nom: nomDe(cr), startRow: cr, endRow: cr + lignesPar - 1 }); cr += lignesPar; } }
  return p;
}
var NB_FORMATAGES = 0;
function formaterPlanning(sil) { NB_FORMATAGES++; }
// reformaterZone est un bouchon (elle appartient à Planning_Format.gs, pas à
// WebApp.gs), mais elle est COMPTÉE : dans le vrai script c'est de très loin
// l'opération la plus coûteuse de tout le projet — une vingtaine d'appels
// Sheets à elle seule (lireFeries, lireCouleursChantier,
// construireCarteColonnes sur toute la largeur de la feuille, lireCahier =
// 6 lectures, ecrireCahier = 6 écritures, rotation, fusions, puis bordBloc
// sur toute la largeur). Compter ses invocations est donc la mesure la plus
// parlante de la lenteur ressentie, et le garde-fou contre son retour dans
// un chemin où elle n'a rien à faire.
var NB_REFORMATAGES = 0;
function reformaterZone() { NB_REFORMATAGES++; }
function appliquerHauteursBloc() {}
function appliquerValidationChantier() {}
function estAbsence(vl) { return vl.indexOf("absent") !== -1 || vl.indexOf("congé") !== -1 || vl.indexOf("conge") !== -1 || vl.indexOf("vacances") !== -1; }
// Reprises À L'IDENTIQUE de Planning_Format.gs : depuis le round 8, WebApp.gs
// les appelle directement pour repeindre une demi-journée sans passer par
// reformaterZone. Ce ne sont donc plus des fonctions "hors sujet" pour ce
// test : si l'une d'elles manquait, l'enregistrement d'une case planterait en
// production — c'est exactement ce que ce harnais doit attraper.
function tirets(v) {
  var s = String(v).trim(); if (s === "") return s;
  var l = s.split("\\n");
  for (var i = 0; i < l.length; i++) { var li = l[i].trim(); if (li !== "" && li.charAt(0) !== "-") l[i] = "- " + li; }
  return l.join("\\n");
}
function couleurTexteDetail(vl) {
  // béton/beton -> vert RETIRÉ ici aussi (demande de Lionel, 28.08.2026) : ce
  // PRELUDE doit rester le miroir exact de Planning_Format.gs, sans quoi ce
  // test validerait un comportement que le vrai fichier n'a plus.
  if (vl.indexOf("important") !== -1 || vl.indexOf("urgent") !== -1) return CONFIG.ROUGE_TEXTE;
  return CONFIG.NOIR_TEXTE;
}
function calcFondChantier(val, isWE, couleursChantier, vlDetail) {
  if (isWE) return CONFIG.GRIS_FONCE_WE;
  if (vlDetail && estAbsence(vlDetail)) return CONFIG.ORANGE_CLAIR_3;
  var nom = String(val).trim().toLowerCase();
  if (nom === "") return CONFIG.BLANC;
  return couleursChantier[nom] || CONFIG.BLANC;
}
function lireCouleursChantier(ss) {
  var map = {}, sh = ss.getSheetByName(CONFIG.FEUILLE_CHANTIER);
  if (!sh) return map;
  var lr = sh.getLastRow();
  if (lr <= CONFIG.CHANTIER_HEADER_ROWS) return map;
  var nRows = lr - CONFIG.CHANTIER_HEADER_ROWS;
  var noms = sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_NOM, nRows, 1).getValues();
  var fonds = sh.getRange(CONFIG.CHANTIER_HEADER_ROWS + 1, CONFIG.CHANTIER_COL_COULEUR, nRows, 1).getBackgrounds();
  for (var i = 0; i < noms.length; i++) {
    var nom = String(noms[i][0]).trim(), coul = String(fonds[i][0]).trim().toLowerCase();
    if (nom === "" || coul === "" || coul === CONFIG.BLANC) continue;
    map[nom.toLowerCase()] = coul;
  }
  return map;
}
// Stub qui SE COMPORTE comme la vraie fonction (Planning_Format.gs) : crée
// un onglet "📋 S<n>", "exporte" (simulé), puis le supprime UNIQUEMENT si
// l'export a réussi. Round du 28.08.2026 : cette suppression conditionnelle
// vivait avant dans apiGenererPdf() (WebApp.gs) ; elle est désormais
// centralisée ICI, dans imprimerSemaine(), pour ses 3 appelants (desktop,
// mobile, appli web) — ce stub simule donc cette même règle au lieu de la
// laisser à WebApp.gs, qui ne fait plus que la relayer telle quelle.
// IMPRESSION_ECHEC_PDF (remise à false par défaut) permet de simuler un
// échec d'export Drive et de vérifier que la feuille est alors GARDÉE
// (filet de sécurité) au lieu d'être supprimée à l'aveugle — c'est
// exactement le bug latent corrigé par cette centralisation (l'ancienne
// suppression, dans apiGenererPdf(), était inconditionnelle : elle aurait
// supprimé l'onglet même après un export Drive raté).
var NB_IMPRESSIONS = 0;
var IMPRESSION_ECHEC_PDF = false;
function imprimerSemaine(labGForce) {
  NB_IMPRESSIONS++;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nom = "📋 S" + labGForce;
  var ex = ss.getSheetByName(nom); if (ex) ss.deleteSheet(ex);
  var ts = ss.insertSheet(nom);
  var pdf = IMPRESSION_ECHEC_PDF
    ? { ok: false, msg: "Échec export Drive (simulé)" }
    : { ok: true, msg: "" };
  var supprimee = false;
  if (pdf.ok) { ss.deleteSheet(ts); supprimee = true; }
  return { nom: nom, pdf: pdf, supprimee: supprimee };
}
`;

// feuillesSupp (facultatif) : autres feuilles pré-créées à enregistrer dans
// le faux classeur avant exécution (ex. "Récurrences" pré-remplie), pour
// tester des fonctions qui en dépendent sans passer par insertSheet().
function nouveauContexte(sh, feuillesSupp) {
  const feuilles = Object.assign({ "Planning": sh }, feuillesSupp || {});
  faussSS = {
    getSheetByName: (n) => feuilles[n] || null,
    insertSheet: (n) => { const nf = creerFausseFeuille(1, 8, n); feuilles[n] = nf; return nf; },
    // demande de Lionel, 28.08.2026 : imprimerSemaine() supprime maintenant
    // la feuille d'impression après un export PDF réussi (cf. PRELUDE
    // ci-dessus, qui simule cette règle) — sans cette méthode, n'importe
    // quel test qui l'exerce planterait avec "ss.deleteSheet is not a
    // function", jamais avec un vrai échec de logique.
    deleteSheet: (feuille) => { delete feuilles[feuille.getName()]; },
    getSpreadsheetTimeZone: () => "Europe/Zurich",
    getId: () => "fake",
    getActiveSheet: () => sh,
    toast: () => {}
  };
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Array,
    Object,
    RegExp,
    Error,
    isNaN,
    parseInt,
    parseFloat,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => faussSS,
      flush: () => {},
      BorderStyle: { SOLID: "SOLID", SOLID_MEDIUM: "SOLID_MEDIUM", DOTTED: "DOTTED" },
      newDataValidation: () => ({
        requireValueInRange: function () { return this; },
        setAllowInvalid: function () { return this; },
        setHelpText: function () { return this; },
        build: function () { return {}; }
      })
    },
    // "yyyy-MM-dd" formaté pour de vrai (round 9, 6e passage — le décalage en
    // masse compare des dates ISO pour repérer un décalage qui reculerait
    // dans le passé) ; tout autre format garde l'ancien stub "" (personne ne
    // teste "HH:mm" ici).
    Utilities: {
      formatDate: (d, tz, fmt) => {
        if (fmt !== "yyyy-MM-dd") return "";
        var mm = d.getMonth() + 1, dd = d.getDate();
        return d.getFullYear() + "-" + (mm < 10 ? "0" : "") + mm + "-" + (dd < 10 ? "0" : "") + dd;
      }
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle: function () { return this; }, addMetaTag: function () { return this; }, setXFrameOptionsMode: function () { return this; } }), XFrameOptionsMode: { DEFAULT: 0 } }
  };
  vm.createContext(sandbox);
  vm.runInContext(PRELUDE, sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "WebApp.gs"), "utf8"), sandbox);
  return sandbox;
}

/* ============ ASSERTIONS ============ */
let echecs = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { echecs++; console.log("ÉCHEC  " + label + "\n  attendu : " + w + "\n  obtenu  : " + g); }
  else console.log("ok     " + label);
}
// Assertion booléenne, quand ce qui compte est une borne et non une valeur
// exacte (« reste sous N appels ») : le détail mesuré est affiché dans tous
// les cas, pour qu'un chiffre qui dérive se voie même sans échec.
function ok(label, condition, detail) {
  if (!condition) { echecs++; console.log("ÉCHEC  " + label + (detail ? "\n  mesuré : " + detail : "")); }
  else console.log("ok     " + label + (detail ? "  (" + detail + ")" : ""));
}
const iso = (d) => (d instanceof Date ? d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) : String(d));

/* ============ TESTS ============ */
console.log("--- création d'une semaine (creerSemaineWeb_) ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  const r = ctx.creerSemaineWeb_();

  eq("numéro de la nouvelle semaine (après la 37)", r.num, "38");
  eq("colonne label de la nouvelle semaine", r.labG, 17);
  eq("lundi de la nouvelle semaine", r.debut, "2026-09-14");

  const lire = (row, col) => sh.getRange(row, col).getValue();
  eq("en-tête ligne 1 colonne label", lire(1, 17), "Mois");
  eq("en-tête ligne 2 colonne label", lire(2, 17), "Sem");
  eq("en-tête ligne 3 colonne label", lire(3, 17), "Date");
  eq("n° de semaine posé sur les 7 jours", [1, 2, 3, 4, 5, 6, 7].map((d) => lire(2, 17 + d)), [38, 38, 38, 38, 38, 38, 38]);
  eq("dates des 7 jours", [1, 2, 3, 4, 5, 6, 7].map((d) => iso(lire(3, 17 + d))),
    ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);
  eq("mois affiché", lire(1, 18), "septembre");

  eq("jalons de la nouvelle semaine vides", [1, 2, 3, 4, 5].map((d) => lire(4, 17 + d)), ["", "", "", "", ""]);
  eq("notes de la nouvelle semaine vides", [1, 2, 3, 4, 5].map((d) => lire(5, 17 + d)), ["", "", "", "", ""]);

  eq("noms repris de la semaine précédente", [6, 10, 14, 22].map((l) => lire(l, 17)), ["Lionel", "Mathis", "Bastien", "Armature / Béton"]);
  eq("ligne libre reste libre", lire(18, 17), "");

  // Demande du 27.08.2026 : les chantiers ne se reportent plus du tout sur
  // une semaine créée automatiquement — seuls les noms le sont.
  eq("chantier du matin NON repris (ligne paire)", lire(6, 18), "");
  eq("chantier de l'après-midi NON repris", lire(8, 18), "");
  eq("détail du matin NON repris", lire(7, 18), "");
  eq("détail de l'après-midi (congé) NON repris", lire(9, 18), "");

  eq("semaine précédente intacte — nom", lire(6, 9), "Lionel");
  eq("semaine précédente intacte — jalon", lire(4, 10), "Contrôle");
  eq("semaine précédente intacte — congé", lire(9, 10), "- Congé");

  eq("le planning compte maintenant 3 semaines", ctx.listerSemainesPlanning(sh).map((s) => s.num), ["36", "37", "38"]);
}

console.log("\n--- 5 semaines d'avance (assurerSemainesAvance_) ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  // Aujourd'hui = mercredi 09.09.2026, dans la semaine 37 : il n'existe
  // AUCUNE semaine après celle en cours -> il en faut 5.
  const r = ctx.assurerSemainesAvance_("2026-09-09");
  eq("nombre de semaines créées", r.creees, 5);
  eq("numéros créés", r.numeros, ["38", "39", "40", "41", "42"]);
  eq("plafond non atteint", r.incomplet, false);
  eq("une seule mise en forme complète pour les 5 semaines", ctx.NB_FORMATAGES, 1);
  eq("semaines du planning", ctx.listerSemainesPlanning(sh).map((s) => s.num), ["36", "37", "38", "39", "40", "41", "42"]);
  eq("lundis des semaines créées", ctx.listerSemainesPlanning(sh).slice(2).map((s) => iso(s.dateDebut)),
    ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);

  // Deuxième ouverture le même jour : plus rien à créer.
  const r2 = ctx.assurerSemainesAvance_("2026-09-09");
  eq("2e ouverture : aucune création", r2.creees, 0);
  eq("2e ouverture : aucune mise en forme relancée", ctx.NB_FORMATAGES, 1);

  // Ouverture la semaine suivante : il en manque une (celle qui vient d'être dépassée).
  const r3 = ctx.assurerSemainesAvance_("2026-09-16");
  eq("semaine suivante : 1 seule création", r3.creees, 1);
  eq("numéro créé", r3.numeros, ["43"]);
}

console.log("\n--- planning laissé de côté : plafond de sécurité ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  // Aujourd'hui = 3 mois après la dernière semaine du planning.
  const r = ctx.assurerSemainesAvance_("2026-12-09");
  eq("création plafonnée", r.creees, ctx.MAX_CREATIONS_PAR_OUVERTURE);
  eq("l'appli signale qu'il en manque encore", r.incomplet, true);
  eq("aucune semaine créée dans le futur pour l'instant (rattrapage en cours)",
    ctx.listerSemainesPlanning(sh).filter((s) => iso(s.dateDebut) > "2026-12-07").length, 0);
  // Ouvertures suivantes : le rattrapage se poursuit puis se termine.
  let tours = 1;
  while (ctx.assurerSemainesAvance_("2026-12-09").creees > 0 && tours < 20) tours++;
  eq("rattrapage terminé en un nombre raisonnable d'ouvertures", tours <= 6, true);
  const futures = ctx.listerSemainesPlanning(sh).filter((s) => iso(s.dateDebut) > "2026-12-07").length;
  eq("au final, 5 semaines d'avance", futures, 5);
}

console.log("\n--- passage d'une année à l'autre (le piège de creerSemaine) ---");
{
  const sh = creerFausseFeuille(25, 8);
  const MOIS = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const lundi = new Date(2026, 11, 21); // semaine 52 de 2026
  sh.getRange(1, 1).setValue("Mois"); sh.getRange(2, 1).setValue("Sem"); sh.getRange(3, 1).setValue("Date");
  for (let d = 0; d < 7; d++) {
    const j = new Date(2026, 11, 21 + d);
    sh.getRange(1, 2 + d).setValue(MOIS[j.getMonth() + 1]);
    sh.getRange(2, 2 + d).setValue(52);
    sh.getRange(3, 2 + d).setValue(j);
  }
  sh.getRange(6, 1).setValue("Lionel");
  const ctx = nouveauContexte(sh);

  const a = ctx.creerSemaineWeb_();
  eq("après la semaine 52 de 2026 vient la 53 (2026 compte 53 semaines ISO)", a.num, "53");
  eq("lundi de la 53", a.debut, "2026-12-28");

  const b = ctx.creerSemaineWeb_();
  eq("puis la semaine 1 de 2027", b.num, "1");
  eq("lundi de la semaine 1 de 2027", b.debut, "2027-01-04");

  const c = ctx.creerSemaineWeb_();
  eq("puis la semaine 2 de 2027", c.num, "2");
  eq("lundi de la semaine 2 de 2027", c.debut, "2027-01-11");
  eq("les dates restent strictement croissantes (le bug de l'année serait ici)",
    ctx.listerSemainesPlanning(sh).map((s) => iso(s.dateDebut)),
    ["2026-12-21", "2026-12-28", "2027-01-04", "2027-01-11"]);
}

console.log("\n--- numéro de semaine ISO (numeroSemaineIso_) ---");
{
  const ctx = nouveauContexte(planningDeDepart());
  eq("lundi 07.09.2026 -> semaine 37", ctx.numeroSemaineIso_(new Date(2026, 8, 7)), 37);
  eq("jeudi 01.01.2026 -> semaine 1", ctx.numeroSemaineIso_(new Date(2026, 0, 1)), 1);
  eq("lundi 29.12.2025 -> semaine 1 de 2026", ctx.numeroSemaineIso_(new Date(2025, 11, 29)), 1);
  eq("lundi 04.01.2027 -> semaine 1", ctx.numeroSemaineIso_(new Date(2027, 0, 4)), 1);
  eq("lundi de la date du milieu de semaine", iso(ctx.lundiDe_("2026-09-09")), "2026-09-07");
  eq("lundi d'un dimanche", iso(ctx.lundiDe_("2026-09-13")), "2026-09-07");
  eq("lundi d'un lundi", iso(ctx.lundiDe_("2026-09-07")), "2026-09-07");
}

console.log("\n--- récurrences : creerSemaineWeb_() applique les tâches actives ---");
{
  const sh = planningDeDepart();
  // Feuille "Récurrences" pré-remplie : en-tête + 4 récurrences actives
  // (jalon, note, personne-matin, personne-journée) — les 3 premières posées
  // le lundi (jour 0), la 4e (journée entière) le mardi (jour 1) sur Mathis.
  const recSheet = creerFausseFeuille(5, 8, "Récurrences");
  recSheet.getRange(1, 1, 1, 8).setValues([["ID", "Actif", "Type", "Jour (0=lundi)", "Ligne personne", "Demi-journée", "Texte", "Repère"]]);
  recSheet.getRange(2, 1, 1, 8).setValues([["j1", true, "jalon", 0, "", "", "Séance de chantier", "Jalon"]]);
  recSheet.getRange(3, 1, 1, 8).setValues([["n1", true, "note", 0, "", "", "RAS", "Note"]]);
  recSheet.getRange(4, 1, 1, 8).setValues([["p1", true, "personne", 0, 6, "matin", "École", "Lionel"]]);
  recSheet.getRange(5, 1, 1, 8).setValues([["p2", true, "personne", 1, 10, "journee", "Congé", "Mathis"]]);

  const ctx = nouveauContexte(sh, { "Récurrences": recSheet });
  const r = ctx.creerSemaineWeb_();
  eq("nouvelle semaine créée (récurrences)", r.num, "38");

  const labG = r.labG, lundi = labG + 1, mardi = labG + 2;
  eq("jalon récurrent posé le lundi de la nouvelle semaine", sh.getRange(4, lundi).getValue(), "Séance de chantier");
  eq("note récurrente posée le lundi de la nouvelle semaine", sh.getRange(5, lundi).getValue(), "RAS");
  eq("chantier du matin (Lionel) non touché par la récurrence personne", sh.getRange(6, lundi).getValue(), "");
  eq("détail du matin (Lionel) reçoit le texte de la récurrence personne", sh.getRange(7, lundi).getValue(), "École");

  // Récurrence "journée" (Mathis, ligne 10, mardi) : les 2 demi-journées
  // doivent recevoir le texte, chacune indépendamment (decalagesDemi_).
  eq("chantier du matin (Mathis, journée) non touché", sh.getRange(10, mardi).getValue(), "");
  eq("détail du matin (Mathis, journée) reçoit le texte", sh.getRange(11, mardi).getValue(), "Congé");
  eq("chantier de l'après-midi (Mathis, journée) non touché", sh.getRange(12, mardi).getValue(), "");
  eq("détail de l'après-midi (Mathis, journée) reçoit aussi le texte", sh.getRange(13, mardi).getValue(), "Congé");

  // apiListerRecurrences() doit retrouver les 4 récurrences enregistrées.
  const liste = ctx.apiListerRecurrences();
  eq("nombre de récurrences relues depuis la feuille", liste.length, 4);
  eq("types relus", liste.map((x) => x.type).sort(), ["jalon", "note", "personne", "personne"]);
  eq("demi-journée « journée » relue telle quelle", liste.filter((x) => x.id === "p2")[0].demi, "journee");
}

console.log("\n--- récurrences : feuille absente à la première ouverture ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh); // pas de feuillesSupp : "Récurrences" n'existe pas encore
  let leve = false, liste = null;
  try { liste = ctx.apiListerRecurrences(); } catch (ex) { leve = true; }
  eq("apiListerRecurrences() ne plante pas quand la feuille n'existe pas encore", leve, false);
  eq("liste vide tant qu'aucune récurrence n'a été créée", liste, []);
  // La feuille doit avoir été auto-créée (insertSheet) au passage.
  eq("la feuille Récurrences a été auto-créée", !!faussSS.getSheetByName("Récurrences"), true);

  // Et creerSemaineWeb_() doit continuer à fonctionner normalement (aucune
  // récurrence active => rien à appliquer, mais pas d'exception).
  const r = ctx.creerSemaineWeb_();
  eq("création de semaine toujours OK sans récurrence", r.num, "38");
}

// Un appel à l'API Sheets coûte cher quel que soit le volume échangé (cf. note
// PERFORMANCE en tête de Planning_Format.gs) : c'est leur NOMBRE qui fait la
// lenteur ressentie, pas la quantité de données. Ces plafonds sont donc des
// garde-fous chiffrés — ils échouent si une évolution future réintroduit une
// lecture ou une écriture cellule par cellule, ou remet reformaterZone sur un
// chemin où elle n'a rien à faire.
console.log("\n--- coût en appels Sheets (garde-fous de performance) ---");
{
  // Planning de nbSem semaines, pour vérifier qu'une récurrence ne coûte pas
  // plus cher parce que le planning s'allonge.
  function planningLarge(nbSem) {
    const sh = creerFausseFeuille(25, nbSem * 8, "Planning");
    const MOIS = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    for (let i = 0; i < nbSem; i++) {
      const labG = 1 + i * 8, lundi = new Date(2026, 7, 31 + i * 7);
      sh.getRange(1, labG).setValue("Mois"); sh.getRange(2, labG).setValue("Sem"); sh.getRange(3, labG).setValue("Date");
      for (let d = 0; d < 7; d++) {
        const j = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + d);
        sh.getRange(1, labG + 1 + d).setValue(MOIS[j.getMonth() + 1]);
        sh.getRange(2, labG + 1 + d).setValue(36 + i);
        sh.getRange(3, labG + 1 + d).setValue(j);
      }
      [[6, "Lionel"], [10, "Mathis"], [14, "Bastien"], [22, "Armature / Béton"]].forEach(([l, n]) => sh.getRange(l, labG).setValue(n));
    }
    return sh;
  }
  // Exécute `action` sur un planning neuf et renvoie ce qu'elle a coûté —
  // y compris, depuis le 28.08.2026 au soir, le détail des appels de
  // PEINTURE (fonds/couleurs), qui doivent rester à zéro sur tous les
  // chemins chauds : la feuille n'est plus repeinte à chaque saisie.
  function cout(nbSem, action) {
    const sh = planningLarge(nbSem);
    const chantier = creerFausseFeuille(5, 3, "Chantier");
    chantier.getRange(2, 1).setValue("BINE");
    const ctx = nouveauContexte(sh, { "Récurrences": creerFausseFeuille(10, 8, "Récurrences"), "Chantier": chantier });
    const apiAvant = sh._api.total, reformAvant = ctx.NB_REFORMATAGES;
    const peintureAvant = (sh._api.parNom.setBackgrounds || 0) + (sh._api.parNom.setFontColors || 0) + (sh._api.parNom.setBackground || 0);
    action(ctx, sh);
    return {
      appels: sh._api.total - apiAvant,
      reformatages: ctx.NB_REFORMATAGES - reformAvant,
      peinture: (sh._api.parNom.setBackgrounds || 0) + (sh._api.parNom.setFontColors || 0) + (sh._api.parNom.setBackground || 0) - peintureAvant
    };
  }

  const uneCase = cout(6, (ctx) => ctx.apiEnregistrerCellulePersonne(
    9, 6, "matin", 1, { chantier: "BINE", taches: [{ texte: "Coffrage", statut: null }] }));
  // reformaterZone remet d'aplomb une zone ENTIÈRE (~20 appels Sheets à elle
  // seule) : indispensable quand la structure bouge, inutile — et de loin le
  // plus gros coût de l'appli — quand seul le texte d'une case a changé.
  eq("enregistrer une case ne déclenche AUCUN reformatage de zone", uneCase.reformatages, 0);
  eq("enregistrer une case ne peint plus rien (28.08.2026)", uneCase.peinture, 0);
  // Décomposition attendue : getLastColumn + getLastRow + 2 lectures de
  // detecterPersonnes (valeurs colonne A + fusions) + 1 setValues + 2
  // lectures de chargerSemaine_ (en-tête + zone) = 7. Était ~10 avec la
  // peinture (lecture de date + fonds + couleurs), et ~20+ avant le round 8.
  ok("enregistrer une case reste sous 8 appels Sheets", uneCase.appels <= 8, uneCase.appels + " appels");

  // Assignation groupée : l'écriture reste UNE écriture groupée, et le
  // reformaterZone qui suivait (le plus gros coût restant de ce chemin, ~11
  // appels rien que pour peindre) a disparu avec le reste de la peinture.
  const groupe = cout(6, (ctx) => ctx.apiAttribuerChantierGroupe(9, "BINE", [0, 1, 2, 3, 4]));
  eq("assignation groupée : plus aucun reformatage de zone (28.08.2026)", groupe.reformatages, 0);
  eq("assignation groupée : aucune peinture", groupe.peinture, 0);
  ok("assignation groupée (5 jours, tout le personnel) reste sous 9 appels Sheets", groupe.appels <= 9, groupe.appels + " appels");

  // Une récurrence balaie la semaine affichée et TOUTES celles à venir. Avant,
  // chaque semaine coûtait ses propres lectures/écritures ; la zone entière
  // étant désormais lue puis réécrite en un seul aller-retour, le coût ne doit
  // plus dépendre du nombre de semaines concernées.
  const recPersonne = (ctx) => ctx.apiEnregistrerRecurrence(
    { type: "personne", jour: 2, ancre: 6, demi: "journee", texte: "École", nomPersonne: "Lionel" }, 1);
  const rec3 = cout(3, recPersonne), rec12 = cout(12, recPersonne);
  eq("poser une récurrence coûte pareil sur 3 semaines et sur 12", rec12.appels, rec3.appels);
  ok("poser une récurrence reste sous 12 appels Sheets", rec12.appels <= 12, rec12.appels + " appels sur 12 semaines");

  const recJalon = cout(12, (ctx) => ctx.apiEnregistrerRecurrence({ type: "jalon", jour: 0, texte: "Séance" }, 1));
  ok("poser une récurrence « jalon » sur 12 semaines reste sous 12 appels", recJalon.appels <= 12, recJalon.appels + " appels");
}

// Depuis le 28.08.2026 au soir (demande de Lionel : "je n'ai théoriquement
// plus besoin des mises en forme sur ce fichier"), enregistrer une case
// n'écrit plus AUCUNE couleur sur la vraie feuille — ni fond de chantier, ni
// orange d'absence, ni rouge de mot-clé. Ce bloc (qui vérifiait jusqu'ici la
// couleur écrite : plus de vert sur « béton », rouge sur « important »)
// verrouille désormais l'absence totale de peinture : si un setFontColors ou
// un setBackgrounds réapparaît sur ce chemin, c'est une régression de
// performance à attraper ici. Les couleurs restent calculées côté client
// (index.html) et côté impression (preparerLignesImpression_ /
// fondImpressionJourOuvre_, Planning_Format.gs — cf. test dédié plus bas).
console.log("\n--- enregistrer une case : plus AUCUNE couleur écrite sur la feuille (28.08.2026) ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  ctx.apiEnregistrerCellulePersonne(9, 6, "matin", 0, { chantier: "BINE", taches: [{ texte: "Coulage béton important", statut: null }] });
  // Compteurs relevés AVANT toute lecture de contrôle (les getValue de
  // vérification ci-dessous compteraient sinon dans « getValue »).
  eq("aucune couleur de police écrite", sh._api.parNom.setFontColors || 0, 0);
  eq("aucun fond écrit", sh._api.parNom.setBackgrounds || 0, 0);
  eq("aucune lecture de date pour peindre (l'ancien fondJourCalendrier_ a disparu)", sh._api.parNom.getValue || 0, 0);
  // ligne 6/7 (chantier/détail matin, bloc Lionel), colonne 10 (lundi semaine 37, labG=9).
  eq("valeur chantier écrite", sh.getRange(6, 10).getValue(), "BINE");
  eq("valeur détail écrite (normalisée par tirets)", sh.getRange(7, 10).getValue(), "- Coulage béton important");
}

// imprimerSemaine() supprime la feuille d'impression juste après un export
// PDF réussi — centralisé là (Planning_Format.gs) pour ses 3 appelants
// (desktop, mobile, appli web) depuis le 28.08.2026 : "aussi supprimer une
// impression sur la feuille de calcul quand le pdf est généré", étendu à
// "Partout" sur choix de Lionel. apiGenererPdf() (WebApp.gs, testé ici) ne
// fait plus que relayer nom/pdf/supprimee — le stub PRELUDE simule la règle
// elle-même (cf. commentaire au-dessus de imprimerSemaine() en tête de fichier).
console.log("\n--- génération du PDF (apiGenererPdf) : suppression de la feuille d'impression ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  eq("aucune feuille d'impression avant génération", !!faussSS.getSheetByName("📋 S9"), false);

  const r = ctx.apiGenererPdf(9);
  eq("réponse ok", r.ok, true);
  eq("nom de la feuille d'impression renvoyé (pour info au client)", r.feuille, "📋 S9");
  eq("supprimee bien relayée (export réussi)", r.supprimee, true);
  eq("imprimerSemaine() appelée une seule fois", ctx.NB_IMPRESSIONS, 1);
  eq("la feuille d'impression est supprimée juste après (n'encombre plus le Google Sheet)",
    !!faussSS.getSheetByName("📋 S9"), false);

  // Une 2e génération (l'utilisateur reclique) ne doit rien laisser traîner
  // non plus, et ne doit pas planter sur un onglet déjà absent.
  const r2 = ctx.apiGenererPdf(9);
  eq("2e génération : toujours ok", r2.ok, true);
  eq("2e génération : toujours rien qui traîne", !!faussSS.getSheetByName("📋 S9"), false);
  eq("2e génération : imprimerSemaine() rappelée", ctx.NB_IMPRESSIONS, 2);
}

// Corollaire du bug latent corrigé par cette centralisation : avant le
// 28.08.2026, apiGenererPdf() supprimait l'onglet SANS condition, même si
// l'export Drive avait échoué — au risque de perdre le PDF ET la feuille de
// secours. Depuis, la suppression est conditionnée à un export réussi.
console.log("\n--- génération du PDF : échec d'export → feuille d'impression conservée ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  ctx.IMPRESSION_ECHEC_PDF = true;

  const r = ctx.apiGenererPdf(9);
  eq("réponse ok (un échec d'export PDF ne fait pas planter apiGenererPdf)", r.ok, true);
  eq("supprimee bien relayée (export en échec)", r.supprimee, false);
  eq("la feuille d'impression reste présente (filet de sécurité)",
    !!faussSS.getSheetByName("📋 S9"), true);
}

// Notes : une case peut désormais contenir plusieurs entrées indépendantes
// (demande de Lionel, 28.08.2026). Testé ici contre le VRAI apiEnregistrerPlage
// / apiChargerSemaine de WebApp.gs (pas le port de test_markers.js) : c'est le
// seul harnais qui exécute réellement ce fichier.
console.log("\n--- notes : plusieurs entrées et tag Important (apiEnregistrerPlage / apiChargerSemaine réels) ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  const labG = 9; // semaine 37 : lundi = colonne 10 (2026-09-07), mardi = colonne 11 (2026-09-08)

  // La fixture pose déjà "Note test" le lundi. On y AJOUTE une 2e note
  // indépendante et importante — exactement le cas que Lionel veut démêler.
  const r1 = ctx.apiEnregistrerPlage("note", "2026-09-07", "2026-09-07", "Retard livraison", labG, null, "ajout", true);
  eq("ajout d'une 2e note : ok", r1.ok, true);
  eq("ajout d'une 2e note : 1 jour touché", r1.jours, 1);
  eq("cellule notes : les 2 lignes coexistent, seule la nouvelle est taguée",
    sh.getRange(5, 10).getValue(), "Note test\n[Important] Retard livraison");
  // Depuis le 28.08.2026 au soir, le rouge d'une note [Important] n'est PLUS
  // écrit sur la feuille (plus aucune peinture au fil de l'eau, cf. bloc
  // « plus AUCUNE couleur écrite » plus haut) : le tag DANS LA VALEUR est la
  // seule source de vérité — l'appli et le PDF recalculent le rouge depuis
  // lui. Verrouillé ici sur tout le scénario notes (ajout + déplacement +
  // suppressions ci-dessous compris, le compteur étant relu tout en bas).
  eq("aucune couleur écrite pour autant", sh._api.parNom.setFontColors || 0, 0);

  const sem1 = ctx.apiChargerSemaine(labG);
  eq("notes du lundi décodées en 2 entrées indépendantes", sem1.notes[0],
    [{ texte: "Note test", important: false, serieId: null, jour: null, demi: null },
     { texte: "Retard livraison", important: true, serieId: null, jour: null, demi: null }]);
  eq("notes du mardi vides", sem1.notes[1], []);

  // On DÉPLACE la note importante du lundi au mardi (comme le ferait
  // ouvrirEditeurNote() en rouvrant cette note précise et en changeant sa
  // date). L'autre note du lundi ("Note test") ne doit PAS bouger.
  const r2 = ctx.apiEnregistrerPlage("note", "2026-09-08", "2026-09-08", "Retard livraison", labG,
    { debut: "2026-09-07", fin: "2026-09-08", texte: "Retard livraison", important: true }, "remplacement", true);
  eq("déplacement d'une note importante : ok", r2.ok, true);
  eq("le lundi garde SEULEMENT l'autre note, intacte", sh.getRange(5, 10).getValue(), "Note test");
  eq("le mardi reçoit la note déplacée, toujours importante (le tag suit la valeur)", sh.getRange(5, 11).getValue(), "[Important] Retard livraison");

  // Piège corrigé ce round : SUPPRIMER une note (bouton de la liste, cf.
  // index.html #notesListWrap) ne doit retirer QU'ELLE — avant la correction,
  // le code comparait la cellule ENTIÈRE à l'ancien texte et effaçait tout,
  // y compris une note sans rapport partageant le même jour.
  const r3 = ctx.apiEnregistrerPlage("note", "2026-09-08", "", "", labG,
    { debut: "2026-09-08", fin: "2026-09-08", texte: "Retard livraison", important: true }, "remplacement", false);
  eq("suppression de la note du mardi : ok", r3.ok, true);
  eq("le mardi redevient vide", sh.getRange(5, 11).getValue(), "");

  // Même piège, vérifié dans l'autre sens : supprimer "Note test" (non
  // importante) du lundi ne doit PAS toucher une autre note du même jour.
  const r4 = ctx.apiEnregistrerPlage("note", "2026-09-07", "2026-09-07", "Une autre note", labG, null, "ajout", false);
  eq("ajout d'une 3e note (non importante) sur le lundi : ok", r4.ok, true);
  const r5 = ctx.apiEnregistrerPlage("note", "2026-09-07", "", "", labG,
    { debut: "2026-09-07", fin: "2026-09-07", texte: "Note test", important: false }, "remplacement", false);
  eq("suppression de « Note test » seule : ok", r5.ok, true);
  eq("« Une autre note » survit, seule sur la case", sh.getRange(5, 10).getValue(), "Une autre note");
  const sem2 = ctx.apiChargerSemaine(labG);
  eq("relecture : une seule entrée restante le lundi", sem2.notes[0], [{ texte: "Une autre note", important: false, serieId: null, jour: null, demi: null }]);
  eq("zéro peinture sur TOUT le scénario notes (ajouts, déplacement, suppressions)", sh._api.parNom.setFontColors || 0, 0);
}

// Demi-journée : NOTES uniquement (précision de Lionel, 02.09.2026 — "pour
// les jalons pas de demi-journée, pour les notes par contre j'aimerais
// pouvoir le mettre en demi-journée"). Vérifié contre les VRAIS
// apiEnregistrerPlage / apiEnregistrerJalonNote / apiChargerSemaine : une
// demi-journée envoyée pour un jalon doit être ignorée SILENCIEUSEMENT — pas
// d'erreur, mais aucune étiquette [M]/[A] écrite dans la feuille et aucun
// champ demi remonté au client. Sans ça, un client resté sur une ancienne
// version d'index.html pourrait continuer à poser des jalons de demi-journée.
console.log("\n--- demi-journée : notes oui, jalons non (apiEnregistrerPlage / apiEnregistrerJalonNote réels) ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  const labG = 9; // lundi = colonne 10 (2026-09-07), mardi = colonne 11

  // --- Note : la demi-journée est bien conservée ---
  const rn = ctx.apiEnregistrerPlage("note", "2026-09-08", "2026-09-08", "Livraison ciment", labG, null, "ajout", false, "matin");
  eq("note du matin : ok", rn.ok, true);
  eq("note du matin : l'étiquette [M] est écrite dans la feuille",
    sh.getRange(5, 11).getValue(), "[M] Livraison ciment");
  const semN = ctx.apiChargerSemaine(labG);
  eq("note du matin : la demi-journée remonte au client", semN.notes[1][0].demi, "matin");
  eq("note du matin : le texte reste propre, sans l'étiquette", semN.notes[1][0].texte, "Livraison ciment");

  // --- Jalon posé par la fiche d'édition (apiEnregistrerPlage) ---
  const rj = ctx.apiEnregistrerPlage("jalon", "2026-09-08", "2026-09-08", "Réception", labG, null, "ajout", false, "matin");
  eq("jalon avec demi=matin : ok (pas d'erreur, la valeur est simplement ignorée)", rj.ok, true);
  eq("jalon : AUCUNE étiquette [M] dans la feuille, le texte est nu",
    sh.getRange(4, 11).getValue(), "Réception");

  // --- Jalon posé par la frappe directe dans la case (apiEnregistrerJalonNote) ---
  const rj2 = ctx.apiEnregistrerJalonNote(labG, "jalon", 0, "Coulage", "aprem");
  eq("jalon frappé directement avec demi=aprem : ok", rj2.ok, true);
  eq("jalon frappé directement : aucune étiquette [A] écrite",
    sh.getRange(4, 10).getValue(), "Coulage");

  // --- Relecture : un jalon ne remonte JAMAIS de champ demi ---
  const semJ = ctx.apiChargerSemaine(labG);
  eq("jalon relu : pas de champ demi du tout", "demi" in semJ.jalons[1], false);
  eq("jalon relu : texte intact", semJ.jalons[1].texte, "Réception");

  // --- Compatibilité descendante : un jalon qui porterait déjà une étiquette
  // [M] (posé avant cette précision) est relu NETTOYÉ, pas avec "[M]" affiché
  // en clair dans son texte. C'est le seul effet visible sur l'existant.
  sh.getRange(4, 12).setValue("[M] Ancien jalon");
  const semJ2 = ctx.apiChargerSemaine(labG);
  eq("vieux jalon étiqueté [M] : relu sans l'étiquette, texte propre", semJ2.jalons[2].texte, "Ancien jalon");
  eq("vieux jalon étiqueté [M] : toujours pas de champ demi", "demi" in semJ2.jalons[2], false);
}

// "1 jour et demi" (round du 03.09.2026, "je peux reduire de 1 jour à 1 demi
// jour, mais je ne peux pas augmenter à 1 jour et demi") : apiEnregistrerPlage
// prend désormais 2 paramètres de demi-journée (demiDebut, demiFin), un par
// bord de la plage, plutôt qu'un seul appliqué uniformément à tous les jours
// — sinon "1 jour et demi" (lundi entier + mardi matin, ou l'inverse) restait
// tout simplement impossible à écrire. Vérifié ici contre le VRAI
// apiEnregistrerPlage / apiChargerSemaine, feuille réelle.
console.log("\n--- demiDebut/demiFin : \"1 jour et demi\" (apiEnregistrerPlage réel) ---");
{
  const sh = planningDeDepart();
  const ctx = nouveauContexte(sh);
  const labG = 9; // lundi = colonne 10 (2026-09-07), mardi = colonne 11, mercredi = colonne 12 (2026-09-09)

  // --- Lundi entier + mardi matin seulement ---
  const r1 = ctx.apiEnregistrerPlage("note", "2026-09-07", "2026-09-08", "Coffrage", labG, null, "ajout", false, null, "matin");
  eq("lundi entier + mardi matin : ok", r1.ok, true);
  eq("lundi : aucune étiquette, texte nu (bord de départ = journée entière)",
    sh.getRange(5, 10).getValue().split("\n").filter((l) => l.indexOf("Coffrage") !== -1)[0], "Coffrage");
  eq("mardi : étiquette [M] écrite (bord de fin = matin)", sh.getRange(5, 11).getValue(), "[M] Coffrage");
  const sem1 = ctx.apiChargerSemaine(labG);
  eq("relecture lundi : demi null (journée entière)", sem1.notes[0].filter((n) => n.texte === "Coffrage")[0].demi, null);
  eq("relecture mardi : demi matin", sem1.notes[1].filter((n) => n.texte === "Coffrage")[0].demi, "matin");

  // --- Modification (remplacement) : on étend la même note à 3 jours,
  // toujours "matin" sur le dernier jour seulement — l'origine (lundi->mardi,
  // demiDebut=null/demiFin=matin) doit être proprement retirée des 2 jours
  // qu'elle occupait, sans laisser de résidu ni toucher au jour du milieu.
  const origine1 = { debut: "2026-09-07", fin: "2026-09-08", texte: "Coffrage", important: false, demiDebut: null, demiFin: "matin" };
  const r2 = ctx.apiEnregistrerPlage("note", "2026-09-07", "2026-09-09", "Coffrage", labG, origine1, "remplacement", false, null, "matin");
  eq("extension à 3 jours (2,5 jours) : ok", r2.ok, true);
  eq("lundi : toujours journée entière",
    sh.getRange(5, 10).getValue().split("\n").filter((l) => l.indexOf("Coffrage") !== -1)[0], "Coffrage");
  eq("mardi (désormais jour du MILIEU) : redevenu journée entière, plus d'étiquette [M]", sh.getRange(5, 11).getValue(), "Coffrage");
  eq("mercredi (nouveau bord de fin) : étiquette [M]", sh.getRange(5, 12).getValue(), "[M] Coffrage");
  const sem2 = ctx.apiChargerSemaine(labG);
  eq("relecture lundi : toujours demi null", sem2.notes[0].filter((n) => n.texte === "Coffrage")[0].demi, null);
  eq("relecture mardi : demi null (jour du milieu, plus jamais une demi-journée)", sem2.notes[1].filter((n) => n.texte === "Coffrage")[0].demi, null);
  eq("relecture mercredi : demi matin", sem2.notes[2].filter((n) => n.texte === "Coffrage")[0].demi, "matin");

  // --- Symétrique : lundi après-midi seulement + mardi entier ---
  const r3 = ctx.apiEnregistrerPlage("note", "2026-09-07", "2026-09-08", "Livraison", labG, null, "ajout", false, "aprem", null);
  eq("lundi après-midi + mardi entier : ok", r3.ok, true);
  eq("lundi : étiquette [A] écrite (bord de départ = après-midi)",
    sh.getRange(5, 10).getValue().split("\n").filter((l) => l.indexOf("Livraison") !== -1)[0], "[A] Livraison");
  eq("mardi : aucune étiquette pour cette note (bord de fin = journée entière)",
    sh.getRange(5, 11).getValue().split("\n").filter((l) => l.indexOf("Livraison") !== -1)[0], "Livraison");
}

// Décalage en masse (round du 28.08.2026) : calculerPlanDecalage_() /
// apiApercuDecalage() / apiAppliquerDecalage() réels de WebApp.gs, contre
// une fixture DÉDIÉE (pas planningDeDepart, pour ne rien risquer sur les
// tests ci-dessus) — 3 semaines dont les dates sont calculées à l'EXÉCUTION
// à partir d'aujourd'hui (semaine précédente / courante / suivante), et non
// figées en 2026, pour que le test « reculer dans le passé » reste correct
// quel que soit le jour où la suite tourne (même principe que le stub
// Utilities.formatDate ci-dessus). 2 personnes (Lionel ligne 6, Mathis ligne
// 10) suffisent à couvrir les portées "ligne" et "tous".
console.log("\n--- décalage en masse : calculerPlanDecalage_ / apiApercuDecalage / apiAppliquerDecalage (réels) ---");
function lundiSemaine_dec(d) {
  var dow = d.getDay(); // 0 = dimanche
  var diff = (dow === 0) ? -6 : (1 - dow);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}
const LUNDI_COURANT_DEC = lundiSemaine_dec(new Date());
const LUNDIS_DEC = {
  A: new Date(LUNDI_COURANT_DEC.getFullYear(), LUNDI_COURANT_DEC.getMonth(), LUNDI_COURANT_DEC.getDate() - 7),
  B: LUNDI_COURANT_DEC,
  C: new Date(LUNDI_COURANT_DEC.getFullYear(), LUNDI_COURANT_DEC.getMonth(), LUNDI_COURANT_DEC.getDate() + 7)
};
const LABG_DEC = { A: 1, B: 9, C: 17 };
const MOIS_DEC = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function planningDecalage() {
  const sh = creerFausseFeuille(13, 24, "Planning"); // 3 semaines de 8 colonnes, 2 personnes (lignes 6-9 et 10-13)
  ["A", "B", "C"].forEach((k) => {
    const labG = LABG_DEC[k], lundi = LUNDIS_DEC[k];
    sh.getRange(1, labG).setValue("Mois"); sh.getRange(2, labG).setValue("Sem"); sh.getRange(3, labG).setValue("Date");
    for (let d = 0; d < 7; d++) {
      const j = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + d);
      sh.getRange(1, labG + 1 + d).setValue(MOIS_DEC[j.getMonth() + 1]);
      sh.getRange(2, labG + 1 + d).setValue(36);
      sh.getRange(3, labG + 1 + d).setValue(j);
    }
    [[6, "Lionel"], [10, "Mathis"]].forEach(([l, n]) => sh.getRange(l, labG).setValue(n));
  });
  return sh;
}
// jourIdx : 0 = lundi … 4 = vendredi. semaine : "A" | "B" | "C".
function colDecalage(semaine, jourIdx) { return LABG_DEC[semaine] + 1 + jourIdx; }
function jourDecalage(semaine, jourIdx) {
  const l = LUNDIS_DEC[semaine];
  return new Date(l.getFullYear(), l.getMonth(), l.getDate() + jourIdx);
}

// IMPORTANT, découvert en écrivant ce test : le balayage part du jour cliqué
// et va jusqu'à la toute dernière colonne existante — TOUTE case non vide
// dans cette zone est une source qui décale elle aussi, y compris une case
// qui sert par ailleurs de destination à une AUTRE case (cf. remarque au
// début de la section "DÉCALAGE EN MASSE" dans WebApp.gs : chaque case
// occupée est un conflit à valider, qu'elle bouge ou non elle-même ailleurs
// dans le même lot). Un « conflit isolé » n'existe donc que si la case qui
// bloque est ELLE-MÊME hors du balayage — c'est-à-dire avant le jour cliqué
// (seulement possible en reculant). Les scénarios ci-dessous en tiennent
// compte : le cas "simple + conflit" (avancer) assume la cascade et vérifie
// où elle atterrit ; les 3 scénarios de résolution (ne rien faire / écraser
// / ajouter), qui veulent un conflit isolé pour rester lisibles, reculent
// depuis un jour situé APRÈS la case bloquante, qui reste ainsi hors zone.
console.log("  · aperçu : 1 cas simple + 1 conflit — la case qui bloque n'est pas épargnée pour autant, elle décale aussi");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  // Matin : un cas simple, isolé (mercredi B a du contenu, jeudi B est vide).
  sh.getRange(6, colDecalage("B", 2)).setValue("ABC"); // mercredi, chantier
  // Aprem : lundi B ("BINE") veut avancer d'1 jour sur mardi B, déjà occupé
  // ("XYZ") -> conflit. XYZ, lui, n'est pas exempté : c'est une case comme
  // une autre depuis le jour cliqué (lundi), elle avance donc AUSSI d'1 jour,
  // vers mercredi B (vide) -> un 2e cas, simple celui-là.
  sh.getRange(8, colDecalage("B", 0)).setValue("BINE"); // lundi, chantier
  sh.getRange(8, colDecalage("B", 1)).setValue("XYZ");  // mardi, chantier (déjà occupé)

  const r = ctx.apiApercuDecalage(LABG_DEC.B, 0, "ligne", 6, "avancer", 1);
  eq("aperçu : 2 déplacements simples (mercredi matin direct + mardi->mercredi aprem, en cascade)", r.nbSimples, 2);
  eq("aperçu : 1 conflit (lundi aprem -> mardi aprem, déjà occupé)", r.conflits.length, 1);
  eq("aperçu : aucun cas impossible", r.impossibles.length, 0);
  const c = r.conflits[0];
  eq("conflit : bon jour source", c.jourSourceIso, iso(LUNDIS_DEC.B));
  eq("conflit : bonne demi-journée", c.demi, "aprem");
  eq("conflit : contenu qui arrive (source)", c.source, { chantier: "BINE", taches: [] });
  eq("conflit : contenu déjà là (dest)", c.dest, { chantier: "XYZ", taches: [] });
  eq("aperçu : lecture seule, rien n'a bougé", sh.getRange(8, colDecalage("B", 1)).getValue(), "XYZ");
}

// Les 3 scénarios suivants veulent UN SEUL conflit, bien isolé, pour rester
// lisibles : on recule depuis le jour même de la source (mardi C), ce qui
// laisse la case bloquante (lundi C, avant le jour cliqué) hors du balayage
// — elle ne peut donc pas décaler à son tour (cf. remarque ci-dessus).
console.log("  · application : conflit non résolu -> « ne rien faire » par défaut");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  sh.getRange(6, colDecalage("C", 1)).setValue("BINE");        // mardi C, chantier (source)
  sh.getRange(7, colDecalage("C", 1)).setValue("- Coffrage");  // mardi C, détail
  sh.getRange(6, colDecalage("C", 0)).setValue("XYZ");         // lundi C, chantier (déjà occupé — conflit)

  const r = ctx.apiAppliquerDecalage(LABG_DEC.C, 1, "ligne", 6, "reculer", 1, {});
  eq("application : ok", r.ok, true);
  eq("application : rien de déplacé/écrasé/ajouté", [r.deplaces, r.ecrases, r.ajoutes], [0, 0, 0]);
  eq("application : 1 ignoré (conflit non résolu)", r.ignores, 1);
  eq("source intacte (rien n'a bougé)", sh.getRange(6, colDecalage("C", 1)).getValue(), "BINE");
  eq("détail source intact", sh.getRange(7, colDecalage("C", 1)).getValue(), "- Coffrage");
  eq("destination intacte", sh.getRange(6, colDecalage("C", 0)).getValue(), "XYZ");
}

console.log("  · application : conflit résolu « écraser »");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  sh.getRange(6, colDecalage("C", 1)).setValue("BINE");
  sh.getRange(7, colDecalage("C", 1)).setValue("- Coffrage");
  sh.getRange(6, colDecalage("C", 0)).setValue("XYZ");        // sera écrasé
  sh.getRange(7, colDecalage("C", 0)).setValue("- Ancien");

  const id = "6|matin|" + iso(jourDecalage("C", 1));
  const r = ctx.apiAppliquerDecalage(LABG_DEC.C, 1, "ligne", 6, "reculer", 1, { [id]: "ecraser" });
  eq("application : 1 écrasé", r.ecrases, 1);
  eq("application : 0 ignoré", r.ignores, 0);
  eq("destination reçoit le contenu source (écrasé)", sh.getRange(6, colDecalage("C", 0)).getValue(), "BINE");
  eq("détail destination écrasé", sh.getRange(7, colDecalage("C", 0)).getValue(), "- Coffrage");
  eq("source vidée (chantier) après écrasement", sh.getRange(6, colDecalage("C", 1)).getValue(), "");
  eq("source vidée (détail) après écrasement", sh.getRange(7, colDecalage("C", 1)).getValue(), "");
}

console.log("  · application : conflit résolu « ajouter » (fusion, sans doublon exact)");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  sh.getRange(6, colDecalage("C", 1)).setValue("BINE");
  sh.getRange(7, colDecalage("C", 1)).setValue("- Coffrage\n- Trait");
  // Destination : chantier vide, mais détail déjà occupé (donc pas "vide" au
  // sens celluleVide_ malgré l'absence de chantier) -> doit rester un conflit.
  sh.getRange(7, colDecalage("C", 0)).setValue("- Trait\n- Autre");

  const id = "6|matin|" + iso(jourDecalage("C", 1));
  const r = ctx.apiAppliquerDecalage(LABG_DEC.C, 1, "ligne", 6, "reculer", 1, { [id]: "ajouter" });
  eq("application : 1 ajouté (fusionné)", r.ajoutes, 1);
  eq("chantier de la destination : repris de la source (celui du dest était vide)",
    sh.getRange(6, colDecalage("C", 0)).getValue(), "BINE");
  eq("détail fusionné : existant d'abord, doublon exact écarté, nouveauté ajoutée",
    sh.getRange(7, colDecalage("C", 0)).getValue(), "- Trait\n- Autre\n- Coffrage");
  eq("source vidée après fusion (contenu déplacé, pas dupliqué)", sh.getRange(6, colDecalage("C", 1)).getValue(), "");
  eq("détail source vidé", sh.getRange(7, colDecalage("C", 1)).getValue(), "");
}

// Bug trouvé (et corrigé dans WebApp.gs) en écrivant CE test : la 1re version
// provisionnait les semaines à créer d'après la LARGEUR de la feuille plutôt
// que d'après la case la plus lointaine ayant réellement du contenu à
// déplacer — un aperçu suivi d'une confirmation (2 appels séparés, chacun
// recalculant tout depuis zéro) créait alors le double de semaines vides
// nécessaires, et ça s'aggravait à chaque nouvel appel. Ce test verrouille
// le comportement corrigé : exactement assez de semaines, et jamais plus au
// 2e appel si le 1er en a déjà créé assez.
console.log("  · aperçu puis application : décalage qui dépasse la dernière semaine -> création automatique, SANS création en double");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  sh.getRange(6, colDecalage("C", 0)).setValue("Test-Extension"); // lundi de la dernière semaine existante

  eq("avant : aucune mise en forme", ctx.NB_FORMATAGES, 0);
  const r = ctx.apiApercuDecalage(LABG_DEC.C, 0, "ligne", 6, "avancer", 11); // dépasse la semaine C de plus d'1 semaine
  eq("2 semaines créées (assez pour la case la plus lointaine, pas plus)", sh.getLastColumn(), 24 + 2 * 8);
  eq("une seule mise en forme malgré plusieurs semaines créées", ctx.NB_FORMATAGES, 1);
  eq("le cas se résout en déplacement simple (nouvelle semaine forcément vide)", r.nbSimples, 1);
  eq("aucun conflit", r.conflits.length, 0);

  // apiAppliquerDecalage() recalcule tout depuis zéro (même fonction
  // partagée que l'aperçu, jamais confiance aveugle dans un état mis en
  // cache) : la case tombe maintenant DANS la fenêtre déjà créée -> aucune
  // semaine supplémentaire, aucune 2e mise en forme.
  const r2 = ctx.apiAppliquerDecalage(LABG_DEC.C, 0, "ligne", 6, "avancer", 11, {});
  eq("application : 1 déplacé", r2.deplaces, 1);
  eq("aucune semaine de plus créée au 2e appel", sh.getLastColumn(), 24 + 2 * 8);
  eq("mise en forme toujours à 1 (pas une 2e)", ctx.NB_FORMATAGES, 1);
  eq("source vidée", sh.getRange(6, colDecalage("C", 0)).getValue(), "");
  // Semaine E créée automatiquement (5e semaine : labG = 1 + 4*8 = 33), mardi
  // (di = 21, soit l'indice 1 dans cette semaine) : LABG + 1 (label) + 1 (mardi).
  eq("contenu arrivé sur la semaine créée automatiquement", sh.getRange(6, 33 + 1 + 1).getValue(), "Test-Extension");
}

console.log("  · reculer dans le passé : détecté comme impossible (hors bornes ET date déjà passée)");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  sh.getRange(6, colDecalage("B", 0)).setValue("ADeplacer"); // matin, lundi B -> reculer d'1 = vendredi A (passé)
  sh.getRange(8, colDecalage("A", 0)).setValue("TropTot");   // aprem, lundi A -> reculer d'1 = hors bornes (index -1)

  const r = ctx.apiApercuDecalage(LABG_DEC.A, 0, "ligne", 6, "reculer", 1);
  eq("2 cas impossibles (aucun simple, aucun conflit)", [r.nbSimples, r.conflits.length, r.impossibles.length], [0, 0, 2]);
  const parDemi = {}; r.impossibles.forEach((im) => { parDemi[im.demi] = im; });
  eq("matin : impossible car la destination serait dans le passé", parDemi.matin.jourSourceIso, iso(LUNDIS_DEC.B));
  eq("aprem : impossible car la destination sortirait du planning (avant la 1ère semaine)", parDemi.aprem.jourSourceIso, iso(LUNDIS_DEC.A));

  const r2 = ctx.apiAppliquerDecalage(LABG_DEC.A, 0, "ligne", 6, "reculer", 1, {});
  eq("application : rien de possible -> rien de déplacé/écrasé/ajouté", [r2.deplaces, r2.ecrases, r2.ajoutes], [0, 0, 0]);
  eq("application : 2 ignorés (impossibles)", r2.ignores, 2);
  eq("le contenu impossible à reculer reste en place (matin)", sh.getRange(6, colDecalage("B", 0)).getValue(), "ADeplacer");
  eq("le contenu impossible à reculer reste en place (aprem)", sh.getRange(8, colDecalage("A", 0)).getValue(), "TropTot");
}

console.log("  · portée « tous » : chaque personne de la feuille est traitée, pas seulement l'ancre cliquée");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  sh.getRange(6, colDecalage("B", 1)).setValue("Lionel-mardi");     // Lionel, mardi B
  sh.getRange(10, colDecalage("B", 2)).setValue("Mathis-mercredi"); // Mathis, mercredi B

  const r = ctx.apiApercuDecalage(LABG_DEC.B, 0, "tous", null, "avancer", 5);
  eq("portée tous : 2 déplacements simples (1 par personne)", r.nbSimples, 2);
  eq("portée tous : aucun conflit", r.conflits.length, 0);

  const r2 = ctx.apiAppliquerDecalage(LABG_DEC.B, 0, "tous", null, "avancer", 5, {});
  eq("portée tous : 2 déplacés", r2.deplaces, 2);
  eq("Lionel : contenu arrivé sur le mardi de la semaine suivante", sh.getRange(6, colDecalage("C", 1)).getValue(), "Lionel-mardi");
  eq("Mathis : contenu arrivé sur le mercredi de la semaine suivante", sh.getRange(10, colDecalage("C", 2)).getValue(), "Mathis-mercredi");
}

// Coût du décalage (28.08.2026 au soir) : chaque case déplacée = 2 écritures
// de valeurs (destination puis source vidée), et PLUS AUCUNE peinture — la
// version livrée le jour même repeignait encore chaque écriture (4 appels
// l'une : lecture de date + valeurs + fonds + couleurs), soit 8 appels par
// case au lieu de 2. Sur un vrai décalage de chantier (des dizaines de
// cases), c'est LE chemin où la peinture coûtait le plus cher.
console.log("  · coût : 2 écritures par case déplacée, zéro peinture");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  sh.getRange(6, colDecalage("B", 1)).setValue("Lionel-mardi");
  sh.getRange(10, colDecalage("B", 2)).setValue("Mathis-mercredi");

  const setValuesAvant = sh._api.parNom.setValues || 0;
  const peintureAvant = (sh._api.parNom.setBackgrounds || 0) + (sh._api.parNom.setFontColors || 0);
  const getValueAvant = sh._api.parNom.getValue || 0;
  const r = ctx.apiAppliquerDecalage(LABG_DEC.B, 0, "tous", null, "avancer", 5, {});
  eq("2 cases déplacées", r.deplaces, 2);
  eq("2 écritures de valeurs par case déplacée, pas une de plus", (sh._api.parNom.setValues || 0) - setValuesAvant, 4);
  eq("zéro appel de peinture", (sh._api.parNom.setBackgrounds || 0) + (sh._api.parNom.setFontColors || 0) - peintureAvant, 0);
  eq("zéro lecture de date par case (l'ancien fondJourCalendrier_ a disparu)", (sh._api.parNom.getValue || 0) - getValueAvant, 0);
}

console.log("  · validation des paramètres");
{
  const sh = planningDecalage();
  const ctx = nouveauContexte(sh);
  function messageErreurDec_(fn) { try { fn(); return null; } catch (e) { return e.message; } }
  eq("jourIdx > 4 rejeté", messageErreurDec_(() => ctx.apiApercuDecalage(LABG_DEC.B, 5, "ligne", 6, "avancer", 1)), "Jour de départ invalide.");
  eq("jourIdx négatif rejeté", messageErreurDec_(() => ctx.apiApercuDecalage(LABG_DEC.B, -1, "ligne", 6, "avancer", 1)), "Jour de départ invalide.");
  eq("portée inconnue rejetée", messageErreurDec_(() => ctx.apiApercuDecalage(LABG_DEC.B, 0, "toutes", 6, "avancer", 1)), "Portée invalide.");
  eq("nJours à 0 rejeté", messageErreurDec_(() => ctx.apiApercuDecalage(LABG_DEC.B, 0, "ligne", 6, "avancer", 0)), "Nombre de jours invalide.");
  eq("nJours négatif rejeté", messageErreurDec_(() => ctx.apiApercuDecalage(LABG_DEC.B, 0, "ligne", 6, "avancer", -3)), "Nombre de jours invalide.");
  eq("ancre inconnue rejetée (portée ligne)", messageErreurDec_(() => ctx.apiApercuDecalage(LABG_DEC.B, 0, "ligne", 999, "avancer", 1)), "Cette ligne n'existe plus — recharge la semaine.");
}

// Fonds de la feuille d'IMPRESSION recalculés depuis les valeurs (28.08.2026
// au soir) : imprimerSemaine() ne copie plus les fonds peints sur le Planning
// (getBackgrounds), elle les recalcule via fondImpressionJourOuvre_ — sans
// quoi arrêter de peindre la vraie feuille aurait fait perdre leurs couleurs
// aux PDF. Le VRAI code de Planning_Format.gs est extrait ici par équilibrage
// d'accolades et exécuté tel quel (estAbsence + calcFondChantier +
// fondImpressionJourOuvre_) — pas une copie à la main qui pourrait diverger,
// contrairement au PRELUDE ci-dessus, cantonné à ce que WebApp.gs appelle.
console.log("\n--- impression : fonds recalculés depuis les valeurs (fondImpressionJourOuvre_ réelle) ---");
{
  const srcPF = fs.readFileSync(path.join(__dirname, "Planning_Format.gs"), "utf8");
  function extraireFonctionPF(nom) {
    const i0 = srcPF.indexOf("function " + nom);
    if (i0 === -1) throw new Error("fonction " + nom + " introuvable dans Planning_Format.gs");
    let prof = 0;
    for (let j = srcPF.indexOf("{", i0); j < srcPF.length; j++) {
      if (srcPF[j] === "{") prof++;
      else if (srcPF[j] === "}") { prof--; if (prof === 0) return srcPF.slice(i0, j + 1); }
    }
    throw new Error("accolades non équilibrées pour " + nom);
  }
  const ctxImp = {};
  vm.createContext(ctxImp);
  vm.runInContext(
    'var CONFIG = { GRIS_FONCE_WE: "#999999", ORANGE_CLAIR_3: "#f9cb9c", BLANC: "#ffffff" };\n' +
    extraireFonctionPF("estAbsence") + "\n" +
    extraireFonctionPF("calcFondChantier") + "\n" +
    extraireFonctionPF("fondImpressionJourOuvre_"),
    ctxImp
  );
  const fond = ctxImp.fondImpressionJourOuvre_;
  const COULEURS = { "bine": "#ff9900" }; // clés en minuscules, comme lireCouleursChantier()
  eq("couleur du chantier (insensible casse/espaces, comme la vraie feuille)", fond(null, "  Bine ", "- Coffrage", COULEURS), "#ff9900");
  eq("orange d'absence prioritaire sur la couleur du chantier", fond(null, "BINE", "- Congé", COULEURS), "#f9cb9c");
  eq("couleur de jour férié prioritaire sur tout le reste", fond("#b6d7a8", "BINE", "- Congé", COULEURS), "#b6d7a8");
  eq("case vide -> blanc", fond(null, "", "", COULEURS), "#ffffff");
  eq("chantier inconnu de la feuille Chantier -> blanc", fond(null, "Xyz", "- Divers", COULEURS), "#ffffff");
  eq("détail absent (null) toléré", fond(null, "BINE", null, COULEURS), "#ff9900");
}

console.log("\n" + (echecs === 0 ? "TOUT PASSE" : "ÉCHECS : " + echecs));
process.exit(echecs === 0 ? 0 : 1);
