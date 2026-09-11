/**
 * Harnais de test Node autonome — fonctions PURES du backend V3 (WebApp.gs).
 *
 * Objectif : tester en isolation, SANS mock complet de SpreadsheetApp, les
 * fonctions les plus délicates du round de transfert V3 (cf.
 * TRANSFERT-V3-SPEC.md §2 et §4) :
 *   - pasCalendaire_            (arithmétique de dates réelle pour les séries)
 *   - decoderLigneTache_ / decoderTaches_ / encoderTaches_ / encoderLigneTache_
 *     (tags [S]/[D]/statut/[Important]/[Série:xxxxxx], tous ordres, round-trip)
 *   - decoderNotesJour_ / encoderNotesJour_
 *   - compterTachesParPersonne_ (round audit, 02.09.2026, V3-spec-suite.md
 *     point 101) — seule exception "pas tout à fait pure" du fichier : elle
 *     lit une feuille, testée ici via un stub minimal en mémoire
 *     (fakeSheet(), tout en bas) plutôt qu'un vrai mock SpreadsheetApp.
 *
 * Méthode : le fichier WebApp.gs entier est chargé dans un contexte Node `vm`
 * avec des stubs MINIMAUX pour SpreadsheetApp/LockService/Utilities/HtmlService
 * (juste ce qu'il faut pour que le fichier se charge et pour que
 * decoderLigneTache_/encoderLigneTache_ puissent résoudre la liste des statuts
 * via apiListerStatuts() -> feuilleStatuts_(false) -> une feuille "absente" ->
 * repli sur les 4 valeurs par défaut, EXACTEMENT le chemin qu'emprunterait un
 * classeur réel qui n'a pas encore la feuille "Statuts"). La plupart des
 * fonctions testées ici n'ont besoin de rien de plus : elles ne touchent
 * jamais à la feuille "Planning" elle-même.
 *
 * Lancer : node test_backend_pures.js
 * Sort avec un code non-nul si une assertion échoue.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'WebApp.gs'), 'utf8');

// ---- Stubs minimaux Apps Script --------------------------------------
// feuilleStatuts_(false) doit renvoyer null (feuille "Statuts" absente) pour
// qu'apiListerStatuts() retombe sur STATUT_ORDER_WEB_DEFAUT/STATUTS_WEB_DEFAUT
// — c'est tout ce dont decoderLigneTache_/encoderLigneTache_ ont besoin.
const stubSheet = { getSheetByName: function () { return null; } };
const sandbox = {
  SpreadsheetApp: {
    getActiveSpreadsheet: function () { return stubSheet; }
  },
  LockService: {
    getScriptLock: function () {
      return { waitLock: function () {}, releaseLock: function () {} };
    }
  },
  Utilities: {
    formatDate: function (d, tz, fmt) { return d.toISOString(); }
  },
  HtmlService: {
    createHtmlOutputFromFile: function () {
      return { setTitle: function () { return this; }, addMetaTag: function () { return this; }, setXFrameOptionsMode: function () { return this; } };
    },
    XFrameOptionsMode: { DEFAULT: 'DEFAULT' }
  },
  // isoJour() vit dans Planning_Format.gs (pas WebApp.gs), appelée par
  // isoDeCelluleFerie_ (round du 02.09.2026, suite, test §9 ci-dessous) —
  // copiée ici à l'identique (formatage pur, aucune dépendance Sheets) plutôt
  // que de charger tout Planning_Format.gs, même principe que tirets() ci-dessous.
  isoJour: function (d) {
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  },
  // tirets() vit dans Planning_Format.gs (pas WebApp.gs) mais est appelée par
  // fusionnerRemplacementWeekend_/ajouterLigneWeekend_ (cellule week-end).
  // Copiée ici À L'IDENTIQUE (fonction pure, aucune dépendance Sheets) plutôt
  // que de charger tout Planning_Format.gs (qui, lui, exécute des choses liées
  // à l'UI desktop hors de portée de ce harnais) — cf. Planning_Format.gs
  // ligne ~702 pour l'original, à garder synchronisé si jamais tirets()
  // change de comportement.
  tirets: function (v) {
    var s = String(v).trim(); if (s === '') return s;
    var l = s.split('\n');
    for (var i = 0; i < l.length; i++) { var li = l[i].trim(); if (li !== '' && li.charAt(0) !== '-') l[i] = '- ' + li; }
    return l.join('\n');
  },
  console: console
};
vm.createContext(sandbox);
vm.runInContext(SRC, sandbox, { filename: 'WebApp.gs' });

// ---- Petit framework d'assertions --------------------------------------
let total = 0, echecs = 0;
// Comparaison structurelle, clés triées, INDIFFÉRENTE à (a) l'ordre des
// propriétés d'un objet (l'ordre de déclaration dans decoderLigneTache_ n'a
// aucune signification contractuelle) et (b) au "royaume" JS d'origine —
// util.isDeepStrictEqual échoue systématiquement ici car les objets renvoyés
// par les fonctions chargées via `vm` ont un Object.prototype distinct de
// celui de ce module (2 royaumes JS différents) ; on compare donc une forme
// canonique (clés triées récursivement) sérialisée en JSON, qui ne dépend ni
// de l'ordre ni du royaume.
function canon(x) {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') {
    var o = {};
    Object.keys(x).sort().forEach(function (k) { o[k] = canon(x[k]); });
    return o;
  }
  return x;
}
function assertEqual(actuel, attendu, libelle) {
  total++;
  const a = JSON.stringify(canon(actuel)), b = JSON.stringify(canon(attendu));
  if (a !== b) {
    echecs++;
    console.error('ÉCHEC: ' + libelle);
    console.error('  attendu : ' + b);
    console.error('  obtenu  : ' + a);
  } else {
    console.log('OK: ' + libelle);
  }
}
function assertTrue(cond, libelle) {
  total++;
  if (!cond) { echecs++; console.error('ÉCHEC: ' + libelle); }
  else console.log('OK: ' + libelle);
}

// =========================================================================
// 1) pasCalendaire_(dateDebutIso, frequence, intervalle, index) — §4
// =========================================================================
function iso(d) {
  var m = d.getMonth() + 1, j = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
}

assertEqual(iso(sandbox.pasCalendaire_('2026-09-01', 'jour', 1, 0)), '2026-09-01', 'pasCalendaire_ jour intervalle=1 index=0 (date de départ inchangée)');
assertEqual(iso(sandbox.pasCalendaire_('2026-09-01', 'jour', 1, 5)), '2026-09-06', 'pasCalendaire_ jour intervalle=1 index=5 (+5 jours)');
assertEqual(iso(sandbox.pasCalendaire_('2026-09-01', 'jour', 3, 2)), '2026-09-07', 'pasCalendaire_ jour intervalle=3 index=2 (+6 jours)');
assertEqual(iso(sandbox.pasCalendaire_('2026-09-01', 'semaine', 1, 2)), '2026-09-15', 'pasCalendaire_ semaine intervalle=1 index=2 (+14 jours)');
assertEqual(iso(sandbox.pasCalendaire_('2026-09-01', 'semaine', 2, 3)), '2026-10-13', 'pasCalendaire_ semaine intervalle=2 index=3 (+42 jours, franchit un mois)');
assertEqual(iso(sandbox.pasCalendaire_('2026-01-15', 'mois', 1, 1)), '2026-02-15', 'pasCalendaire_ mois intervalle=1 index=1 (+1 mois simple)');
assertEqual(iso(sandbox.pasCalendaire_('2026-01-31', 'mois', 1, 1)), '2026-03-03', 'pasCalendaire_ mois : 31 janvier + 1 mois déborde sur mars (février 2026 = 28 jours, débordement JS natif assumé par le contrat)');
assertEqual(iso(sandbox.pasCalendaire_('2026-01-15', 'annee', 1, 2)), '2028-01-15', 'pasCalendaire_ annee intervalle=1 index=2 (+2 ans)');
assertEqual(iso(sandbox.pasCalendaire_('2024-02-29', 'annee', 1, 1)), '2025-03-01', 'pasCalendaire_ annee : 29 février bissextile + 1 an déborde sur le 1er mars (2025 non bissextile)');
assertTrue((function () { try { sandbox.pasCalendaire_('2026-09-01', 'quinzaine', 1, 0); return false; } catch (e) { return true; } })(), 'pasCalendaire_ rejette une fréquence inconnue');

// =========================================================================
// 2) decoderLigneTache_ / decoderTaches_ / encoderLigneTache_ / encoderTaches_
//    Tags [S]/[D]/statut/[Important]/[Série:xxxxxx] — §2 et §4
// =========================================================================

// -- Décodage, tags dans l'ordre canonique (jour -> statut -> important -> série)
assertEqual(
  sandbox.decoderLigneTache_('[S] [Confirmé] [Important] [Série:s1a2b3] Livraison béton'),
  { statut: 'confirme', texte: 'Livraison béton', important: true, serieId: 's1a2b3', jour: 'S', demi: null },
  'decoderLigneTache_ : tous les tags, dans l\'ordre canonique'
);

// -- Décodage, MÊMES tags mais dans un ordre DIFFÉRENT (rétrocompatibilité §2/§4 : "reconnus dans n'importe quel ordre à la RELECTURE")
assertEqual(
  sandbox.decoderLigneTache_('[Série:s1a2b3] [Important] [D] [Confirmé] Livraison béton'),
  { statut: 'confirme', texte: 'Livraison béton', important: true, serieId: 's1a2b3', jour: 'D', demi: null },
  'decoderLigneTache_ : mêmes tags, ordre inversé — reconnus quand même'
);
assertEqual(
  sandbox.decoderLigneTache_('[Important] [S] Coulage'),
  { statut: null, texte: 'Coulage', important: true, serieId: null, jour: 'S', demi: null },
  'decoderLigneTache_ : [Important] avant [S] — reconnu quand même'
);

// -- Tiret ajouté par tirets() (Planning_Format.gs) : retiré avant de lire les crochets
assertEqual(
  sandbox.decoderLigneTache_('- [Confirmé] Béton radier'),
  { statut: 'confirme', texte: 'Béton radier', important: false, serieId: null, jour: null, demi: null },
  'decoderLigneTache_ : tiret de tirets() en tête, retiré avant les crochets'
);

// -- Ligne sans aucun tag (saisie libre historique) : 100% rétrocompatible
assertEqual(
  sandbox.decoderLigneTache_('Livraison armature 8h'),
  { statut: null, texte: 'Livraison armature 8h', important: false, serieId: null, jour: null, demi: null },
  'decoderLigneTache_ : texte libre sans crochet, rétrocompatible'
);

// -- Crochet inconnu (faute de frappe / texte libre) : la boucle s'arrête, rien n'est perdu
assertEqual(
  sandbox.decoderLigneTache_('[Peut-être] Terrassement'),
  { statut: null, texte: '[Peut-être] Terrassement', important: false, serieId: null, jour: null, demi: null },
  'decoderLigneTache_ : crochet non reconnu conservé tel quel dans le texte, jamais perdu'
);

// -- encoderLigneTache_ : ordre d'ÉCRITURE fixé par le contrat (jour -> statut -> important -> série)
assertEqual(
  sandbox.encoderLigneTache_({ jour: 'S', statut: 'confirme', important: true, serieId: 's1a2b3', texte: 'Livraison béton' }),
  '[S] [Confirmé] [Important] [Série:s1a2b3] Livraison béton',
  'encoderLigneTache_ : ordre d\'écriture jour -> statut -> important -> série'
);
assertEqual(sandbox.encoderLigneTache_({ texte: '   ' }), null, 'encoderLigneTache_ : texte vide -> null (ligne ignorée)');

// -- Round-trip encode -> decode, plusieurs tâches combinées, plusieurs lignes
(function () {
  var taches = [
    { texte: 'Livraison béton', statut: 'confirme', important: true, serieId: 's1a2b3', jour: 'S', demi: null },
    { texte: 'Sans aucun tag', statut: null, important: false, serieId: null, jour: null, demi: null },
    { texte: 'Juste important', statut: null, important: true, serieId: null, jour: null, demi: null },
    { texte: 'Réservé et récurrent', statut: 'reserve', important: false, serieId: 'sz9y8x', jour: 'D', demi: null }
  ];
  var brut = sandbox.encoderTaches_(taches);
  assertEqual(
    brut,
    '[S] [Confirmé] [Important] [Série:s1a2b3] Livraison béton\nSans aucun tag\n[Important] Juste important\n[D] [Réservé] [Série:sz9y8x] Réservé et récurrent',
    'encoderTaches_ : 4 lignes combinées, texte brut attendu'
  );
  var relu = sandbox.decoderTaches_(brut);
  assertEqual(relu, taches, 'decoderTaches_(encoderTaches_(taches)) === taches (round-trip exact, 4 tâches combinées)');
})();

// -- Round-trip avec le tiret de tirets() appliqué entre les deux (comme en
//    production : ecrireDemiJournee_ écrit tirets(encoderTaches_(...)))
(function () {
  var taches = [{ texte: 'Ferraillage', statut: 'areserver', important: false, serieId: null, jour: null, demi: null }];
  var brut = sandbox.encoderTaches_(taches);
  var avecTirets = brut.split('\n').map(function (l) { return '- ' + l; }).join('\n'); // simule tirets()
  assertEqual(sandbox.decoderTaches_(avecTirets), taches, 'decoderTaches_ round-trip après passage par tirets() (tiret ajouté)');
})();

// =========================================================================
// 3) decoderNotesJour_ / encoderNotesJour_ — mêmes tags, sans statut
// =========================================================================
(function () {
  var notes = [
    { texte: 'RDV architecte 14h', important: true, serieId: null, jour: null, demi: null },
    { texte: 'Contrôle hebdo', important: false, serieId: 'sabc123', jour: null, demi: null }
  ];
  var brut = sandbox.encoderNotesJour_(notes);
  assertEqual(brut, '[Important] RDV architecte 14h\n[Série:sabc123] Contrôle hebdo', 'encoderNotesJour_ : [Important] et [Série:xxx], pas de statut');
  assertEqual(sandbox.decoderNotesJour_(brut), notes, 'decoderNotesJour_(encoderNotesJour_(notes)) === notes (round-trip)');
})();
assertEqual(sandbox.decoderNotesJour_(''), [], 'decoderNotesJour_ : cellule vide -> tableau vide');
assertEqual(sandbox.encoderNotesJour_([]), '', 'encoderNotesJour_ : tableau vide -> chaîne vide');

// =========================================================================
// 3bis) Jalon (round "idem pour les modifications de série", 01.09.2026) —
// case à VALEUR UNIQUE (pas de liste comme les notes ci-dessus) : décodée/
// réencodée via decoderLigneTache_/encoderLigneTache_ directement, cf.
// apiChargerSemaine/apiEnregistrerJalonNote/ecrireOccurrenceSerie_/
// traiterOccurrencesSerie_ dans WebApp.gs.
// =========================================================================
(function () {
  var jalon = { texte: 'Livraison ferraille', serieId: 'sxyz789' };
  var brut = sandbox.encoderLigneTache_(jalon);
  assertEqual(brut, '[Série:sxyz789] Livraison ferraille', 'encoderLigneTache_ (jalon) : tag [Série:xxx] seul en tête, pas de statut/important');
  var relu = sandbox.decoderLigneTache_(brut);
  assertEqual({ texte: relu.texte, serieId: relu.serieId }, jalon, 'decoderLigneTache_(encoderLigneTache_(jalon)) === jalon (round-trip, cf. apiChargerSemaine)');
})();
(function () {
  // Rétrocompatibilité : un jalon jamais issu d'une série (texte brut, aucun
  // tag) doit rester lisible tel quel — c'est le cas de TOUS les jalons
  // existants avant ce round, cf. commentaire dans apiChargerSemaine.
  var d = sandbox.decoderLigneTache_('Coulage dalle rez');
  assertEqual({ texte: d.texte, serieId: d.serieId }, { texte: 'Coulage dalle rez', serieId: null }, 'decoderLigneTache_ (jalon) : texte brut sans tag, rétrocompatible, serieId null');
})();
assertEqual(sandbox.decoderLigneTache_('').texte, '', "decoderLigneTache_ (jalon) : cellule vide -> texte vide");
assertEqual(sandbox.encoderLigneTache_({ texte: '', serieId: 'sabc' }), null, "encoderLigneTache_ (jalon) : texte vide -> null (cellule à vider), même avec un serieId résiduel");

// =========================================================================
// 3ter) apiListerFormulairesRapides — repli sur les 3 formulaires
// historiques (round "entrées rapides disparues", 01.09.2026) quand la
// feuille "Formulaires rapides" n'existe pas encore (getSheetByName -> null
// dans ce harnais, cf. stub en tête de fichier — même chemin qu'un classeur
// réel qui n'a encore jamais rien enregistré sur la page "Entrée rapide").
// =========================================================================
(function () {
  var liste = sandbox.apiListerFormulairesRapides();
  assertEqual(liste.map(function (f) { return f.nom; }), ['Armature', 'Béton', 'Livraison armature'],
    'apiListerFormulairesRapides() : repli par défaut sur les 3 formulaires historiques, dans l’ordre, feuille absente');
  assertTrue(liste.every(function (f) { return f.champs && f.champs.length === 1 && f.champs[0].cle === 'info'; }),
    'apiListerFormulairesRapides() : chaque formulaire par défaut porte un unique champ "info" (jamais lu par son interface dédiée)');
})();

// =========================================================================
// 4) Cellule week-end — fusionnerRemplacementWeekend_ (§2) : le scénario
//    EXACT donné dans la consigne de vérification.
// =========================================================================
(function () {
  // Cellule contenant déjà "[D] Dimanche existant" (Dimanche taggé explicitement).
  // On écrit Samedi seul avec un texte différent : le Dimanche doit être
  // intégralement préservé, le Samedi doit être tagué [S] (distinct du [D]).
  var ancien = '[D] Dimanche existant';
  var resultat = sandbox.fusionnerRemplacementWeekend_(ancien, 'S', '', [{ texte: 'nouveau texte', statut: null, important: false, serieId: null }]);
  var lignes = resultat.split('\n').map(function (l) { return l.replace(/^-\s+/, ''); });
  assertTrue(lignes.indexOf('[D] Dimanche existant') !== -1, 'fusionnerRemplacementWeekend_ : le Dimanche existant est préservé tel quel');
  assertTrue(lignes.indexOf('[S] nouveau texte') !== -1, 'fusionnerRemplacementWeekend_ : le nouveau Samedi est tagué [S] (distinct du Dimanche)');
  assertEqual(lignes.length, 2, 'fusionnerRemplacementWeekend_ : exactement 2 lignes au total, rien perdu ni doublé');
})();
(function () {
  // Cellule vide -> écrire Samedi seul : reste SANS tag (cas "même chose les
  // 2 jours", §2 — rien n'existe côté Dimanche pour distinguer).
  var resultat = sandbox.fusionnerRemplacementWeekend_('', 'S', '', [{ texte: 'Ponçage', statut: null, important: false, serieId: null }]);
  assertEqual(resultat.replace(/^-\s+/, ''), 'Ponçage', 'fusionnerRemplacementWeekend_ : première écriture (cellule vide) -> sans tag (les 2 jours)');
})();
(function () {
  // Écriture SÉQUENTIELLE depuis une cellule vide : Samedi "Ponçage" (untagged,
  // §2, rien à distinguer), PUIS Dimanche avec le MÊME texte "Ponçage" — le
  // résultat final doit rester UNE seule ligne untagged, pas de doublon, même
  // après ce 2e passage (caractérise le comportement documenté §2 : une ligne
  // untagged est traitée comme "à remplacer" par toute écriture day-specific
  // suivante, ce qui est sans danger ici puisque le texte réécrit est identique).
  var apresSamedi = sandbox.fusionnerRemplacementWeekend_('', 'S', '', [{ texte: 'Ponçage', statut: null, important: false, serieId: null }]);
  var apresDimanche = sandbox.fusionnerRemplacementWeekend_(apresSamedi, 'D', '', [{ texte: 'Ponçage', statut: null, important: false, serieId: null }]);
  var lignes = apresDimanche.split('\n').map(function (l) { return l.replace(/^-\s+/, ''); });
  assertEqual(lignes, ['Ponçage'], 'fusionnerRemplacementWeekend_ : écritures séquentielles S puis D avec le même texte -> toujours 1 seule ligne untagged, pas de doublon');
})();
// -- Limite connue, documentée telle quelle (PAS un bug au sens du contrat,
//    cf. §2 : "toutes les autres lignes [untagged] ... sont remplacées") :
//    si le Samedi et le Dimanche sont D'ABORD rendus explicitement distincts
//    (tagués [S]/[D] chacun), puis que le Dimanche est réécrit avec un texte
//    qui COÏNCIDE avec le Samedi déjà tagué [S], la ligne [S] préservée n'est
//    PAS rétroactivement fusionnée avec la nouvelle ligne untagged : la case
//    contient alors 2 lignes ("[S] X" + "X" untagged), et le Samedi affiche
//    ce texte en double à la lecture (vueJourWeekend_ inclut les 2, jour="S"
//    ET jour=null). Cf. BACKEND-CHANGELOG.md — cas rare (coïncidence de texte
//    après une distinction déjà actée), non corrigé ici : le contrat §2 ne
//    spécifie que le comportement des NOUVELLES lignes écrites, jamais une
//    fusion rétroactive des lignes préservées, et ce comportement improviser
//    une règle non demandée serait plus risqué qu'utile pour ce round.
(function () {
  // Part d'une cellule où Samedi ET Dimanche sont DÉJÀ explicitement distincts
  // (tag [S]/[D] réel, pas un cas "untagged" — cf. le tout premier test de
  // cette section pour obtenir ce point de départ) : "[S] X" + "[D] Autre chose".
  var depart = 'Autre chose'; // sera taggé [D] en écrivant S distinct dessus juste après
  var apresSamedi = sandbox.fusionnerRemplacementWeekend_('[D] ' + depart, 'S', '', [{ texte: 'Distinct au départ', statut: null, important: false, serieId: null }]);
  // apresSamedi = "[D] Autre chose\n[S] Distinct au départ" (2 lignes explicitement taguées).
  var apresDimancheCoincide = sandbox.fusionnerRemplacementWeekend_(apresSamedi, 'D', '', [{ texte: 'Distinct au départ', statut: null, important: false, serieId: null }]);
  var lignes = apresDimancheCoincide.split('\n').map(function (l) { return l.replace(/^-\s+/, ''); });
  assertEqual(lignes.length, 2, 'fusionnerRemplacementWeekend_ : limite connue caractérisée (non corrigée) — coïncidence de texte après distinction déjà actée -> 2 lignes en cellule, cf. commentaire ci-dessus');
})();

// =========================================================================
// -- compterTachesParPersonne_ (round audit, 02.09.2026, cf. V3-spec-suite.md
//    point 101) : seule fonction de ce fichier qui LIT une "feuille" — un
//    stub minimal (`getRange(row,col,numRows,numCols).getValues()` sur un
//    objet en mémoire) suffit, elle ne fait rien d'autre avec `sh`.
function fakeSheet(rowsByIndex) {
  return {
    getRange: function (row, col, numRows, numCols) {
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < numRows; i++) {
            var rr = row + i, line = [];
            for (var j = 0; j < numCols; j++) line.push((rowsByIndex[rr] || [])[col - 1 + j]);
            out.push(line);
          }
          return out;
        }
      };
    }
  };
}
(function () {
  // Bloc "personne" = 4 lignes (CONFIG.LIGNES_PAR_PERSONNE) : matin-chantier,
  // matin-détail, aprem-chantier, aprem-détail. 2 semaines de 8 colonnes
  // (label + Lun-Ven + Sam + placeholder Dim), labG = 1 puis 9.
  var largeur = 16;
  var blank = function () { return new Array(largeur).fill(''); };
  var rows = { 6: blank(), 7: blank(), 8: blank(), 9: blank() }; // ancre = 6
  var c = function (col) { return col - 1; }; // colonne sheet 1-based -> index 0-based (labGDepart=1)

  rows[6][c(2)] = 'Chantier X'; rows[7][c(2)] = 'Autre chose';   // Lundi S1 : tâche isolée
  rows[6][c(6)] = 'Chantier X'; rows[7][c(6)] = 'Pose';           // Vendredi S1 : début d'une plage
  rows[6][c(10)] = 'Chantier X'; rows[7][c(10)] = 'Pose';         // Lundi S2 : même tâche -> fusionne avec Vendredi (across le week-end, cf. spanColonnes côté client)
  rows[6][c(11)] = 'Chantier X'; rows[7][c(11)] = 'Pose';         // Mardi S2 : fusionne encore
  rows[6][c(12)] = 'Chantier Y'; rows[7][c(12)] = 'Pose';         // Mercredi S2 : même texte, AUTRE chantier -> ne fusionne pas
  rows[6][c(7)] = 'Livraison';                                    // Samedi S1, sans tag [S]/[D] -> compte pour Samedi ET Dimanche

  var pers = [{ nom: 'Ancre 6', startRow: 6, endRow: 9 }, { nom: 'Ancre 10 (vide)', startRow: 10, endRow: 13 }];
  var res = sandbox.compterTachesParPersonne_(fakeSheet(rows), largeur, 13, pers, 1);
  assertEqual(res, { 6: 5, 10: 0 },
    'compterTachesParPersonne_ : "Autre chose" + "Pose/X" (fusionné Ven->Lun->Mar par-dessus le week-end) + "Pose/Y" + Samedi + Dimanche = 5 ; personne sans aucune case = 0');
})();
(function () {
  // Empilement (plusieurs tâches dans une même case, cf. decoderTaches_) :
  // chaque index de pile se fusionne/se ferme indépendamment des autres.
  var largeur = 8;
  var blank = function () { return new Array(largeur).fill(''); };
  var rows = { 6: blank(), 7: blank(), 8: blank(), 9: blank() };
  var c = function (col) { return col - 1; };
  rows[6][c(2)] = 'X'; rows[7][c(2)] = 'A\nB';   // Lundi : 2 tâches nouvelles -> +2
  rows[6][c(3)] = 'X'; rows[7][c(3)] = 'A\nC';   // Mardi : A suit, C nouvelle -> +1
  rows[6][c(4)] = 'X'; rows[7][c(4)] = 'A';       // Mercredi : A suit, B fermée -> +0
  rows[6][c(5)] = 'X'; rows[7][c(5)] = 'A\nB';   // Jeudi : A suit, B rouverte (nouvelle) -> +1

  var pers = [{ nom: 'Ancre 6', startRow: 6, endRow: 9 }];
  var res = sandbox.compterTachesParPersonne_(fakeSheet(rows), largeur, 9, pers, 1);
  assertEqual(res, { 6: 4 }, 'compterTachesParPersonne_ : empilement — 2+1+0+1 = 4, une pile fermée puis rouverte recompte comme une tâche neuve');
})();

// =========================================================================
// 8) normaliserCategorieFerie_ / apiListerCategoriesFeries — round du
//    02.09.2026 (suite), restauration des 3 catégories fériés + couleurs
//    éditables. apiListerCategoriesFeries(undefined) doit retomber sur les
//    3 valeurs par défaut (feuille "Catégories fériés" absente, cf. le stub
//    SpreadsheetApp.getActiveSpreadsheet() minimal en tête de fichier).
// =========================================================================
assertEqual(sandbox.normaliserCategorieFerie_('ferie'), 'ferie', 'normaliserCategorieFerie_ : valeur connue conservée telle quelle');
assertEqual(sandbox.normaliserCategorieFerie_('vacances_entreprise'), 'vacances_entreprise', 'normaliserCategorieFerie_ : "vacances_entreprise" conservée');
assertEqual(sandbox.normaliserCategorieFerie_('compenses'), 'compenses', 'normaliserCategorieFerie_ : 3e catégorie "compenses" (restaurée ce round) reconnue');
assertEqual(sandbox.normaliserCategorieFerie_('  COMPENSES  '), 'compenses', 'normaliserCategorieFerie_ : espaces + casse ignorés');
// CHANGEMENT DÉLIBÉRÉ au round r15 (02.09.2026) : cette assertion attendait
// auparavant 'ferie' ("vacances" = ancien id de maquette, jamais utilisé côté
// serveur, donc à traiter comme une valeur inconnue). C'était une erreur
// d'analyse : "Vacances" n'est pas un vestige de maquette, c'est le libellé
// que Lionel écrit LUI-MÊME dans la colonne C de la feuille "Fériés" depuis
// des années (cf. v2-backend-inventory.md) — et le renvoyer sur "ferie" est
// précisément ce qui repeignait tout son calendrier en rouge. Cf. §11.
assertEqual(sandbox.normaliserCategorieFerie_('vacances'), 'vacances_entreprise', 'normaliserCategorieFerie_ : "vacances" = libellé manuscrit de Lionel pour ses vacances d’entreprise (et non un id de maquette à jeter — corrigé r15)');
assertEqual(sandbox.normaliserCategorieFerie_(''), 'ferie', 'normaliserCategorieFerie_ : valeur vide -> "ferie" (repli historique, cellule pas encore migrée)');
assertEqual(sandbox.normaliserCategorieFerie_(null), 'ferie', 'normaliserCategorieFerie_ : null -> "ferie"');

assertEqual(
  sandbox.apiListerCategoriesFeries(),
  [
    { id: 'vacances_entreprise', nom: 'Vacances entreprise', couleur: '#a9c6ea' },
    { id: 'ferie', nom: 'Férié', couleur: '#e8a3a3' },
    { id: 'compenses', nom: 'Compensés', couleur: '#e8dba3' }
  ],
  'apiListerCategoriesFeries() : feuille "Catégories fériés" absente -> 3 valeurs par défaut, dans l’ordre de la maquette (Vacances entreprise, Férié, Compensés)'
);

// =========================================================================
// 9) isoDeCelluleFerie_ — round du 02.09.2026 (suite, bug remonté par
//    Lionel) : accepte aussi le séparateur "." (format suisse DD.MM.YYYY),
//    en plus du "/" déjà géré, sans rien casser pour les 2 formats
//    précédents (Date réelle, "DD/MM/YYYY").
// =========================================================================
// Testé uniquement via les 2 formats texte : une Date créée dans CE module
// Node n'est pas un Date du royaume `vm` du sandbox (`instanceof` y échoue
// systématiquement, cf. l'écueil déjà documenté plus haut pour
// dateDepuisIso_/pasCalendaire_) — la branche "vraie Date" n'est donc pas
// testable ici sans construire la Date DANS le sandbox (inutile : c'est un
// simple `instanceof Date ? isoJour(dv) : ...`, déjà exercé indirectement
// par tous les tests plus haut qui passent par de vraies cellules Date).
assertEqual(sandbox.isoDeCelluleFerie_('01/01/2026'), '2026-01-01', 'isoDeCelluleFerie_ : format "DD/MM/YYYY" (déjà géré avant ce round)');
assertEqual(sandbox.isoDeCelluleFerie_('25.12.2026'), '2026-12-25', 'isoDeCelluleFerie_ : format suisse "DD.MM.YYYY" (nouveau, round du 02.09.2026 suite)');
assertEqual(sandbox.isoDeCelluleFerie_('1.1.2026'), '2026-01-01', 'isoDeCelluleFerie_ : format suisse sans zéros de tête');
assertEqual(sandbox.isoDeCelluleFerie_(''), null, 'isoDeCelluleFerie_ : cellule vide -> null');
assertEqual(sandbox.isoDeCelluleFerie_('n’importe quoi'), null, 'isoDeCelluleFerie_ : texte non reconnu -> null');

// =========================================================================
// 10) apiListerFormulairesRapides — colonne "AssigneA" (8e colonne, round
//    "reverifie 1x que tu a tout fait" du 02.09.2026 : restauration de
//    l'"assigné à" du prototype, abandonné lors du portage V3, cf.
//    FRONTEND-CHANGELOG.md §2). Feuille peuplée simulée via un swap
//    temporaire de SpreadsheetApp.getActiveSpreadsheet() (restauré juste
//    après, pour ne pas perturber les tests suivants) — même stub minimal
//    que fakeSheet() plus haut, complété par getLastRow().
// =========================================================================
(function () {
  var rows = [
    // NomFormulaire, OrdreFormulaire, OrdreChamp, Cle, Label, Type, OptionsJSON, AssigneA
    ['Chape', 1, 1, 'zone', 'Zone', 'texte', '', '12'],       // assigné à la personne d'ancre 12
    ['Chape', 1, 2, 'quantite', 'Quantité', 'nombre', '', '12'],
    ['Étanchéité', 2, 1, '', '', '', '', ''],                  // ligne "porteuse" (formulaire sans champ) -> ne doit PAS apparaître dans champs[]
    ['Global', 3, 1, 'note', 'Note', 'texte', '', '']          // assigneA vide -> tout le monde
  ];
  var fakeSh = {
    getLastRow: function () { return 1 + rows.length; }, // 1 ligne d'en-tête
    getRange: function (row, col, numRows, numCols) {
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < numRows; i++) {
            var src = rows[(row - 2) + i]; // ligne 2 = rows[0]
            var line = [];
            for (var j = 0; j < numCols; j++) line.push(src ? src[col - 1 + j] : '');
            out.push(line);
          }
          return out;
        }
      };
    }
  };
  var ancienGetSS = sandbox.SpreadsheetApp.getActiveSpreadsheet;
  sandbox.SpreadsheetApp.getActiveSpreadsheet = function () {
    return { getSheetByName: function (nom) { return nom === 'Formulaires rapides' ? fakeSh : null; } };
  };
  var liste;
  try {
    liste = sandbox.apiListerFormulairesRapides();
  } finally {
    sandbox.SpreadsheetApp.getActiveSpreadsheet = ancienGetSS; // restauré même si l'appel jette
  }
  assertEqual(liste.map(function (f) { return f.nom; }), ['Chape', 'Étanchéité', 'Global'],
    'apiListerFormulairesRapides() : 3 formulaires distincts, dans l’ordre d’OrdreFormulaire');
  var chape = liste[0], etancheite = liste[1], global_ = liste[2];
  assertEqual(chape.assigneA, '12', 'apiListerFormulairesRapides() : AssigneA lu depuis la 8e colonne, formulaire assigné à une personne précise');
  assertEqual(chape.champs.map(function (c) { return c.cle; }), ['zone', 'quantite'], 'apiListerFormulairesRapides() : champs du formulaire assigné intacts, triés par OrdreChamp');
  assertEqual(etancheite.assigneA, '', 'apiListerFormulairesRapides() : AssigneA lu même sur la ligne "porteuse" d’un formulaire sans champ');
  assertEqual(etancheite.champs, [], 'apiListerFormulairesRapides() : la ligne "porteuse" (Cle vide) n’ajoute aucun faux champ à champs[]');
  assertEqual(global_.assigneA, '', 'apiListerFormulairesRapides() : AssigneA vide -> "tout le monde"');
})();

// =========================================================================
// 11) normaliserCategorieFerie_ / libelleCategorieFerie_ — round r15
//     (02.09.2026) : LA cause du "tout devient rouge". La colonne C de la
//     feuille "Fériés" est remplie à la main par Lionel depuis des années
//     avec ses propres libellés français (cf. v2-backend-inventory.md :
//     « Col C = catégorie visuelle libre ajoutée par Lionel (Compensés /
//     Fériés / Vacances) »). La whitelist stricte les renvoyait tous sur
//     "ferie" — d'où un calendrier intégralement rouge à chaque relecture.
// =========================================================================
[
  ['Vacances', 'vacances_entreprise', 'le libellé manuscrit « Vacances » de Lionel'],
  ['vacances', 'vacances_entreprise', 'même chose en minuscules'],
  ['Vacances entreprise', 'vacances_entreprise', 'libellé affiché par l’appli elle-même (ce qu’elle réécrit désormais)'],
  ['Compensés', 'compenses', 'le libellé manuscrit « Compensés » (accent + pluriel)'],
  ['Compensé', 'compenses', 'singulier sans pluriel'],
  ['Fériés', 'ferie', 'le libellé manuscrit « Fériés » (accents + pluriel)'],
  ['Férié', 'ferie', 'singulier accentué'],
  ['  COMPENSÉS  ', 'compenses', 'espaces + majuscules + accents ignorés'],
  ['Récupération', 'compenses', 'variante plausible d’une colonne tapée à la main'],
  ['ferie', 'ferie', 'identifiant technique toujours accepté (rétrocompatibilité)'],
  ['vacances_entreprise', 'vacances_entreprise', 'identifiant technique toujours accepté'],
  ['compenses', 'compenses', 'identifiant technique toujours accepté'],
  ['n’importe quoi', 'ferie', 'valeur inconnue -> "ferie", jamais bloquant (comportement conservé)'],
  ['', 'ferie', 'case vide -> "ferie" (comportement conservé)']
].forEach(function (cas) {
  assertEqual(sandbox.normaliserCategorieFerie_(cas[0]), cas[1], 'normaliserCategorieFerie_ : ' + cas[2]);
});

// Ce qui est ÉCRIT dans la feuille reste un libellé français lisible à la
// main, pas un identifiant technique — et se relit correctement (aller-retour).
assertEqual(sandbox.libelleCategorieFerie_('vacances_entreprise'), 'Vacances entreprise',
  'libelleCategorieFerie_ : écrit "Vacances entreprise" en toutes lettres, pas l’identifiant');
assertEqual(sandbox.libelleCategorieFerie_('compenses'), 'Compensés', 'libelleCategorieFerie_ : "Compensés"');
assertEqual(sandbox.libelleCategorieFerie_('ferie'), 'Férié', 'libelleCategorieFerie_ : "Férié"');
['ferie', 'vacances_entreprise', 'compenses'].forEach(function (id) {
  assertEqual(sandbox.normaliserCategorieFerie_(sandbox.libelleCategorieFerie_(id)), id,
    'aller-retour id -> libellé écrit en feuille -> id relu : ' + id + ' (ce que fait apiEnregistrerFeries puis apiListerFeries)');
});

// =========================================================================
// 12) Demi-journées pour les JALONS et les NOTES — round du 02.09.2026
//     (Lionel : "j'aimerais avoir la possibilité de mettre jalons et notes
//     sur des demi-journées aussi").
//
//     Une case de jalon/note = UN jour dans la feuille (lignes 4 et 5). Pour
//     y loger deux valeurs, on réutilise le procédé déjà en place pour le
//     week-end ([S]/[D] dans une seule cellule) avec les étiquettes [M] et
//     [A]. AUCUNE étiquette = la journée entière : tout ce qui existe déjà
//     est donc lu exactement comme avant, sans migration. C'est le point le
//     plus important de cette série de tests.
// =========================================================================
assertEqual(sandbox.decoderLigneTache_('Réunion de chantier').demi, null,
  'sans étiquette : journée entière — tout l\'existant reste lu comme avant (aucune migration)');
assertEqual(sandbox.decoderLigneTache_('[M] Réunion de chantier').demi, 'matin', '[M] -> matin');
assertEqual(sandbox.decoderLigneTache_('[A] Livraison').demi, 'aprem', '[A] -> après-midi');
assertEqual(sandbox.decoderLigneTache_('[M] Réunion de chantier').texte, 'Réunion de chantier',
  'l\'étiquette est retirée du texte affiché, jamais montrée à l\'utilisateur');

// L'étiquette de demi-journée cohabite avec les autres, dans n'importe quel ordre.
assertEqual(
  { demi: sandbox.decoderLigneTache_('[M] [Important] Béton').demi, imp: sandbox.decoderLigneTache_('[M] [Important] Béton').important },
  { demi: 'matin', imp: true }, '[M] + [Important] : les deux reconnus');
assertEqual(
  { demi: sandbox.decoderLigneTache_('[Important] [A] Béton').demi, imp: sandbox.decoderLigneTache_('[Important] [A] Béton').important },
  { demi: 'aprem', imp: true }, 'ordre inversé : reconnus quand même');
assertEqual(sandbox.decoderLigneTache_('[A] [Série:sabc12] Contrôle').serieId, 'sabc12',
  '[A] devant un tag de série : la série reste reconnue');

// Écriture
assertEqual(sandbox.encoderLigneTache_({ texte: 'Réunion', demi: 'matin' }), '[M] Réunion', 'encodage matin');
assertEqual(sandbox.encoderLigneTache_({ texte: 'Réunion', demi: 'aprem' }), '[A] Réunion', 'encodage après-midi');
assertEqual(sandbox.encoderLigneTache_({ texte: 'Réunion' }), 'Réunion',
  'aucune demi-journée : aucune étiquette écrite — une entrée "journée entière" reste un texte nu dans la feuille');
assertEqual(sandbox.encoderLigneTache_({ texte: 'Réunion', demi: 'jour' }), 'Réunion',
  'valeur "jour" traitée comme "pas de demi-journée" : pas d\'étiquette parasite');

// Aller-retour complet, y compris avec plusieurs notes dans la même case.
['matin', 'aprem', null].forEach(function (d) {
  var entree = { texte: 'Note test', important: false, serieId: null, jour: null, demi: d };
  assertEqual(sandbox.decoderNotesJour_(sandbox.encoderNotesJour_([entree]))[0].demi, d,
    'aller-retour note (demi = ' + (d || 'journée entière') + ') : la demi-journée survit à l\'écriture puis à la relecture');
});
(function () {
  // Le vrai cas d'usage : deux notes le même jour, une le matin, une l'après-midi.
  var entrees = [
    { texte: 'Livraison ciment', important: false, serieId: null, jour: null, demi: 'matin' },
    { texte: 'Visite architecte', important: true, serieId: null, jour: null, demi: 'aprem' }
  ];
  var relu = sandbox.decoderNotesJour_(sandbox.encoderNotesJour_(entrees));
  assertEqual(relu.map(function (e) { return [e.texte, e.demi, e.important]; }),
    [['Livraison ciment', 'matin', false], ['Visite architecte', 'aprem', true]],
    'deux notes le même jour, matin et après-midi : chacune garde sa demi-journée et son caractère important');
})();

// =========================================================================
// demiPourJourDePlage_ — round du 03.09.2026, "je peux reduire de 1 jour à 1
// demi jour, mais je ne peux pas augmenter à 1 jour et demi". Avant ce round,
// apiEnregistrerPlage écrivait UNE seule demi-journée uniformément sur TOUS
// les jours de la plage, rendant "1 jour et demi" impossible à représenter.
// Désormais chaque BORD (b1/b2) porte la sienne, tout jour strictement ENTRE
// les deux reste une journée entière — cette fonction pure encode cette
// règle, indépendamment de toute feuille (cf. son appel dans
// apiEnregistrerPlage, une fois par colonne).
console.log('\n--- demiPourJourDePlage_ (bords d\'une plage, round "1 jour et demi") ---');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-07', null, null, 'matin', 'matin'), null,
  'aucune plage d\'origine (b1 null) -> toujours null, jamais une exception');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-07', '2026-09-07', '2026-09-07', 'matin', 'matin'), 'matin',
  'plage d\'un seul jour : retombe sur demiB1 (le client garantit demiB1 === demiB2 dans ce cas)');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-07', '2026-09-07', '2026-09-08', null, 'matin'), null,
  '"1 jour et demi" : le 1er jour (bord de départ) est journée entière');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-08', '2026-09-07', '2026-09-08', null, 'matin'), 'matin',
  '"1 jour et demi" : le dernier jour (bord de fin) porte sa demi-journée');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-07', '2026-09-07', '2026-09-09', 'aprem', 'matin'), 'aprem',
  'plage de 3 jours : le 1er jour porte demiB1');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-08', '2026-09-07', '2026-09-09', 'aprem', 'matin'), null,
  'plage de 3 jours : le jour du MILIEU reste toujours une journée entière, même si les 2 bords sont en demi-journée');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-09', '2026-09-07', '2026-09-09', 'aprem', 'matin'), 'matin',
  'plage de 3 jours : le dernier jour porte demiB2');
assertEqual(sandbox.demiPourJourDePlage_('2026-09-10', '2026-09-07', '2026-09-09', 'aprem', 'matin'), null,
  'jour HORS de la plage (ni b1 ni b2) -> null (ne devrait de toute façon jamais être appelée pour ce cas)');
// Le scénario bout en bout contre le VRAI apiEnregistrerPlage (feuille
// réelle, via le harnais nouveauContexte()) vit dans test_semaines.js, pas
// ici — ce fichier ne teste que des fonctions pures sans feuille.

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
