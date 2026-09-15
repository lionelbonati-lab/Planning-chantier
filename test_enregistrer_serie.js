/**
 * Test de la logique pure de la fonction serveur enregistrer-serie
 * (functions/enregistrer-serie/logic.js) — port de apiEnregistrerSerie
 * (WebApp.gs) vers le nouveau schéma Supabase (une table `series` qui garde
 * la définition, des occurrences taguées serie_id dans taches/jalons/notes,
 * au lieu de cases de feuille tagguées [Série:xxxxxx]).
 *
 * Comme tous les test_*.js de ce projet, ce fichier extrait les VRAIES
 * fonctions du fichier source (regex + équilibrage d'accolades) plutôt que
 * d'en tester une copie.
 *
 * Lancer : node test_enregistrer_serie.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'functions/enregistrer-serie/logic.js'), 'utf8');

function extraireFonction(nom) {
  const re = new RegExp('\\n(\\s*)function ' + nom + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fonction introuvable dans logic.js : ' + nom);
  let i = SRC.indexOf('{', m.index + m[0].length - 1);
  let profondeur = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') profondeur++;
    else if (SRC[j] === '}') { profondeur--; if (profondeur === 0) return SRC.slice(m.index + 1, j + 1); }
  }
  throw new Error('accolades non équilibrées pour ' + nom);
}
function extraireVar(nom) {
  const re = new RegExp('\\nvar ' + nom + ' = [^;]+;');
  const m = re.exec(SRC);
  if (!m) throw new Error('constante introuvable dans logic.js : ' + nom);
  return m[0];
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extraireVar('MAX_OCCURRENCES_SERIE') + '\n' +
  ['pasCalendaire', 'joursOuvresDepuisCompte', 'demisTacheParJour', 'demiJalonNoteParJour',
   'genererDatesSerie', 'champsSerie', 'construireOccurrencesSerie']
    .map(extraireFonction).join('\n'),
  sandbox
);

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a === b) console.log('OK: ' + message);
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + b + '\n   reçu    ' + a); }
}
function assertThrows(fn, messageAttendu, message) {
  total++;
  try {
    fn();
    echecs++; console.error('ÉCHEC: ' + message + '\n   attendu une exception (' + messageAttendu + '), rien n\'a été levé');
  } catch (e) {
    if (String(e.message) === messageAttendu) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu message "' + messageAttendu + '"\n   reçu    "' + e.message + '"'); }
  }
}

// =======================================================================
// 1) genererDatesSerie — développe une définition de série en dates ISO.
// =======================================================================
assertEqual(
  sandbox.genererDatesSerie('2026-09-07', 'jour', 1, 'occurrences', 3),
  ['2026-09-07', '2026-09-08', '2026-09-09'],
  'jour x3 occurrences -> 3 jours consécutifs (pas de saut de week-end, contrairement à une plage)');

assertEqual(
  sandbox.genererDatesSerie('2026-09-07', 'jour', 1, 'date', '2026-09-10'),
  ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'],
  'jour jusqu\'à une date de fin incluse');

assertEqual(
  sandbox.genererDatesSerie('2026-09-07', 'semaine', 2, 'occurrences', 3),
  ['2026-09-07', '2026-09-21', '2026-10-05'],
  'semaine x intervalle 2 -> tous les 14 jours');

assertEqual(
  sandbox.genererDatesSerie('2026-01-31', 'mois', 1, 'occurrences', 2),
  ['2026-01-31', '2026-03-03'],
  'mois : 31 janvier + 1 mois déborde sur début mars (février 2026 n\'a que 28 jours)');

assertEqual(
  sandbox.genererDatesSerie('2028-02-29', 'annee', 1, 'occurrences', 2),
  ['2028-02-29', '2029-03-01'],
  'année : 29 février (bissextile) + 1 an déborde sur le 1er mars (2029 non bissextile)');

assertEqual(
  sandbox.genererDatesSerie('2026-09-07', 'jour', 1, 'occurrences', 1000).length,
  366,
  'occurrences bornées à MAX_OCCURRENCES_SERIE (366), même si finValeur en demande plus');

assertThrows(function () { sandbox.genererDatesSerie('2026-09-10', 'jour', 1, 'date', '2026-09-05'); },
  'Cette définition de série ne produit aucune occurrence.',
  'date de fin déjà dépassée dès la première occurrence -> aucune date produite');

assertThrows(function () { sandbox.genererDatesSerie('2026-09-07', 'quinzaine', 1, 'occurrences', 3); },
  'Fréquence de série invalide.',
  'fréquence inconnue -> erreur');

assertThrows(function () { sandbox.genererDatesSerie('2026-09-07', 'jour', 1, 'jamais', 3); },
  'Type de fin de série invalide.',
  'finType inconnu -> erreur');

assertThrows(function () { sandbox.genererDatesSerie('2026-09-07', 'jour', 1, 'date', 'pas-une-date'); },
  'Date de fin de série invalide.',
  'date de fin mal formée -> erreur');

// =======================================================================
// 2) champsSerie — validation + construction de la future ligne `series`.
// =======================================================================
assertThrows(function () { sandbox.champsSerie({ type: 'autre', texte: 'x' }); },
  'Type de série invalide.',
  'type inconnu -> erreur');

assertThrows(function () { sandbox.champsSerie({ type: 'note', texte: '   ' }); },
  'Écris un texte.',
  'texte vide (ou blanc) -> erreur');

assertThrows(function () { sandbox.champsSerie({ type: 'tache', texte: 'Pose de dalle' }); },
  'Choisis une case.',
  'série de tâche sans personneId -> erreur');

assertEqual(
  sandbox.champsSerie({
    type: 'tache', texte: '  Pose de dalle  ', personneId: 12, demi: 'aprem',
    statutId: 4, important: true, chantierId: 7,
    dateDebutIso: '2026-09-07', frequence: 'semaine', intervalle: 2, finType: 'occurrences', finValeur: 5,
  }),
  {
    type: 'tache', cible_personne_id: 12, cible_demi: 'aprem', texte: 'Pose de dalle',
    statut_id: 4, important: true, chantier_id: 7,
    date_debut: '2026-09-07', frequence: 'semaine', intervalle: 2, fin_type: 'occurrences', fin_valeur: '5',
  },
  'série de tâche complète -> champs construits fidèlement (texte trimé, fin_valeur en texte)');

assertEqual(
  sandbox.champsSerie({ type: 'tache', texte: 'Nuit sur chantier', personneId: 3, statutId: 4, chantierId: 7, dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 1 }).cible_demi,
  'matin',
  'demi non fourni (ou différent de "aprem") pour une tâche -> "matin" par défaut');

assertEqual(
  sandbox.champsSerie({
    type: 'jalon', texte: 'Visite architecte', statutId: 4, important: true, chantierId: 7,
    dateDebutIso: '2026-09-07', frequence: 'mois', finType: 'occurrences', finValeur: 3,
  }),
  {
    type: 'jalon', cible_personne_id: null, cible_demi: null, texte: 'Visite architecte',
    statut_id: null, important: true, chantier_id: null,
    date_debut: '2026-09-07', frequence: 'mois', intervalle: 1, fin_type: 'occurrences', fin_valeur: '3',
  },
  'série de jalon -> statut/chantier/cible forcés à null (colonnes sans objet pour un jalon), important conservé');

assertEqual(
  sandbox.champsSerie({ type: 'note', texte: 'Livraison béton', dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 1 }).intervalle,
  1,
  'intervalle non fourni -> 1 par défaut');

// =======================================================================
// 3) construireOccurrencesSerie — le cœur métier : dates + existant -> ops.
// =======================================================================

// --- tache ---
(function () {
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Coffrage', personneId: 12, demi: 'matin', statutId: null, important: false, chantierId: 7,
    dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 2,
  });
  const dates = ['2026-09-07', '2026-09-08'];
  const plan = sandbox.construireOccurrencesSerie(champs, dates, 501, [], []);
  assertEqual(plan.ops, [
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-07', demi: 'matin', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: 501 },
    { type: 'insert', table: 'assignations', personne_id: 12, date: '2026-09-07', demi: 'matin', chantier_id: 7 },
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-08', demi: 'matin', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: 501 },
    { type: 'insert', table: 'assignations', personne_id: 12, date: '2026-09-08', demi: 'matin', chantier_id: 7 },
  ], 'tâche sans existant -> une tâche + une assignation par date, ordre 0');
  assertEqual([plan.posees, plan.ignorees], [2, 0], 'tâche : 2 posées, 0 ignorée (jamais ignorée)');
})();

(function () {
  // Un chantier est déjà assigné le 08 (posé par autre chose que cette
  // série) -> jamais écrasé, mais la tâche elle-même est quand même ajoutée.
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Coffrage', personneId: 12, demi: 'matin', chantierId: 7,
    dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 2,
  });
  const dates = ['2026-09-07', '2026-09-08'];
  const existantesAssignations = [{ date: '2026-09-08', personne_id: 12, demi: 'matin' }];
  const plan = sandbox.construireOccurrencesSerie(champs, dates, 501, [], existantesAssignations);
  const opsAssignation = plan.ops.filter(function (o) { return o.table === 'assignations'; });
  assertEqual(opsAssignation.length, 1, 'chantier déjà assigné le 08 -> une seule assignation posée (celle du 07)');
  assertEqual(opsAssignation[0].date, '2026-09-07', 'l\'assignation posée est bien celle du jour libre');
})();

(function () {
  // Une tâche existe déjà le 07 à cette (personne, date, demi) -> la
  // nouvelle s'AJOUTE (ordre suivant), jamais de remplacement.
  const champs = sandbox.champsSerie({ type: 'tache', texte: 'Nettoyage', personneId: 12, demi: 'aprem', dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 1 });
  const existantes = [{ date: '2026-09-07', personne_id: 12, demi: 'aprem' }, { date: '2026-09-07', personne_id: 12, demi: 'aprem' }];
  const plan = sandbox.construireOccurrencesSerie(champs, ['2026-09-07'], 501, existantes, []);
  assertEqual(plan.ops[0].ordre, 2, 'deux tâches déjà présentes ce jour -> la nouvelle prend ordre 2 (ajoutée en fin de liste)');
})();

// --- absence en série (round du 14.09.2026, sql/0009_taches_est_absence.sql) ---
// Bug Lionel : une absence en série retombait "tâche" au premier
// rechargement, faute de colonne dédiée. estAbsence (6e paramètre) doit
// poser est_absence:true sur chaque ligne `taches` insérée, sans toucher aux
// lignes `assignations` (une absence n'a jamais de chantier).
(function () {
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Congés été', personneId: 12, demi: 'matin',
    dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 2,
  });
  const dates = ['2026-09-07', '2026-09-08'];
  const plan = sandbox.construireOccurrencesSerie(champs, dates, 501, [], [], true);
  assertEqual(plan.ops, [
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-07', demi: 'matin', ordre: 0, texte: 'Congés été', statut_id: null, important: false, serie_id: 501, est_absence: true },
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-08', demi: 'matin', ordre: 0, texte: 'Congés été', statut_id: null, important: false, serie_id: 501, est_absence: true },
  ], 'estAbsence=true -> est_absence:true sur chaque ligne taches, aucune assignation (pas de chantierId fourni)');
})();

// --- estAbsence omis/false : forme des ops STRICTEMENT inchangée (pas de
// clé est_absence ajoutée) — non-régression explicite pour toute série de
// tâche normale déjà couverte par les tests ci-dessus.
(function () {
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Coffrage', personneId: 12, demi: 'matin', chantierId: 7,
    dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 1,
  });
  const plan = sandbox.construireOccurrencesSerie(champs, ['2026-09-07'], 501, [], []);
  assertEqual('est_absence' in plan.ops[0], false, 'estAbsence non fourni -> pas de clé est_absence dans l\'op (le défaut colonne false suffit)');
})();

// --- jalon ---
(function () {
  const champs = sandbox.champsSerie({ type: 'jalon', texte: 'Visite architecte', dateDebutIso: '2026-09-07', frequence: 'semaine', finType: 'occurrences', finValeur: 2 });
  const dates = ['2026-09-07', '2026-09-14'];
  // Un jalon existe déjà le 14 (peu importe son texte) -> occurrence ignorée ce jour-là.
  const existantes = [{ date: '2026-09-14', texte: 'Autre jalon déjà là' }];
  const plan = sandbox.construireOccurrencesSerie(champs, dates, 9, existantes, []);
  assertEqual(plan.ops, [
    { type: 'insert', table: 'jalons', date: '2026-09-07', texte: 'Visite architecte', serie_id: 9 },
  ], 'jalon : jour libre -> posé (sans champ "important", fidèle à l\'ancien code) ; jour déjà occupé -> ignoré');
  assertEqual([plan.posees, plan.ignorees], [1, 1], 'jalon : 1 posé, 1 ignoré');
})();

// --- note ---
(function () {
  const champs = sandbox.champsSerie({ type: 'note', texte: 'Livraison', important: true, dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 2 });
  const dates = ['2026-09-07', '2026-09-08'];
  // Une note existe déjà le 07 -> n'empêche PAS l'ajout (pas de règle
  // "un seul jalon par jour" pour une note, plusieurs notes coexistent).
  const existantes = [{ date: '2026-09-07' }];
  const plan = sandbox.construireOccurrencesSerie(champs, dates, 9, existantes, []);
  assertEqual(plan.ops, [
    { type: 'insert', table: 'notes', date: '2026-09-07', texte: 'Livraison', important: true, serie_id: 9 },
    { type: 'insert', table: 'notes', date: '2026-09-08', texte: 'Livraison', important: true, serie_id: 9 },
  ], 'note : toujours posée, même si une note existe déjà ce jour-là (jamais ignorée, jamais dédupliquée)');
  assertEqual([plan.posees, plan.ignorees], [2, 0], 'note : 2 posées, jamais ignorée');
})();

// =======================================================================
// 4) Round du 15.09.2026 — bug Lionel : « si je sélectionne 2 case ou
//    plus, la bulle vient uniquement dans la première case de chaque
//    répétition ». joursOuvresDepuisCompte/demisTacheParJour/
//    demiJalonNoteParJour + construireOccurrencesSerie(..., duree,
//    demiDebut, demiFin) : chaque occurrence doit désormais reproduire
//    TOUTE la largeur de la sélection d'origine, pas seulement son ancre.
// =======================================================================

assertEqual(
  sandbox.joursOuvresDepuisCompte('2026-09-07', 3),
  ['2026-09-07', '2026-09-08', '2026-09-09'],
  'joursOuvresDepuisCompte : 3 jours sans week-end dans la plage -> 3 jours consécutifs');

assertEqual(
  sandbox.joursOuvresDepuisCompte('2026-09-10', 5),
  ['2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16'],
  'joursOuvresDepuisCompte : jeudi + 5 jours ouvrés -> jeudi, vendredi, puis lundi/mardi/mercredi (saute le week-end, même scénario que test_ajout_lointain.js)');

assertEqual(
  sandbox.joursOuvresDepuisCompte('2026-09-12', 1),
  ['2026-09-12'],
  'joursOuvresDepuisCompte : le 1er jour est toujours inclus tel quel, même un samedi (cas limite d\'une occurrence de série retombée un week-end)');

assertEqual(sandbox.demisTacheParJour(0, 1, undefined, undefined, 'aprem'), ['aprem'],
  'demisTacheParJour : 1 seul jour, bords non fournis -> repli sur cible_demi (compat ancien appel à 1 seule demi)');
assertEqual(sandbox.demisTacheParJour(0, 1, null, null, 'matin'), ['matin', 'aprem'],
  'demisTacheParJour : 1 seul jour, bords fournis mais nuls -> journée entière (les 2 cases, PAS juste cible_demi) — exactement le bug de Lionel (matin+aprem d\'un même jour sélectionnés)');
assertEqual(sandbox.demisTacheParJour(0, 1, 'matin', 'matin', 'aprem'), ['matin'],
  'demisTacheParJour : 1 seul jour, une vraie demi -> elle seule');
assertEqual(sandbox.demisTacheParJour(0, 3, 'aprem', 'matin', null), ['aprem'],
  'demisTacheParJour : 1er jour d\'une plage de plusieurs jours, bord "aprem" -> seulement aprem');
assertEqual(sandbox.demisTacheParJour(0, 3, null, 'matin', null), ['matin', 'aprem'],
  'demisTacheParJour : 1er jour sans bord -> journée entière');
assertEqual(sandbox.demisTacheParJour(2, 3, 'aprem', 'matin', null), ['matin'],
  'demisTacheParJour : dernier jour, bord "matin" -> seulement matin');
assertEqual(sandbox.demisTacheParJour(2, 3, 'aprem', null, null), ['matin', 'aprem'],
  'demisTacheParJour : dernier jour sans bord -> journée entière');
assertEqual(sandbox.demisTacheParJour(1, 3, 'aprem', 'matin', null), ['matin', 'aprem'],
  'demisTacheParJour : jour du MILIEU d\'une plage -> toujours journée entière, quels que soient les bords');

assertEqual(sandbox.demiJalonNoteParJour(0, 1, undefined, undefined), null,
  'demiJalonNoteParJour : 1 seul jour, bords non fournis -> null (comportement historique, aucune clé demi)');
assertEqual(sandbox.demiJalonNoteParJour(0, 1, null, null), null,
  'demiJalonNoteParJour : 1 seul jour, bords fournis mais nuls -> null (journée entière, explicite)');
assertEqual(sandbox.demiJalonNoteParJour(0, 1, 'matin', 'matin'), 'matin',
  'demiJalonNoteParJour : 1 seul jour, une vraie demi -> elle');
assertEqual(sandbox.demiJalonNoteParJour(0, 3, 'aprem', 'matin'), 'aprem',
  'demiJalonNoteParJour : 1er jour d\'une plage -> son bord');
assertEqual(sandbox.demiJalonNoteParJour(2, 3, 'aprem', 'matin'), 'matin',
  'demiJalonNoteParJour : dernier jour d\'une plage -> son bord');
assertEqual(sandbox.demiJalonNoteParJour(1, 3, 'aprem', 'matin'), null,
  'demiJalonNoteParJour : jour du milieu -> toujours journée entière (null)');

// --- tache, LE bug de Lionel : 2 cases du même jour (matin+aprem), en série ---
(function () {
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Coffrage', personneId: 12, demi: 'matin', chantierId: 7,
    dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 2,
  });
  const dates = ['2026-09-07', '2026-09-08'];
  // duree=1 mais demiDebut/demiFin tous deux null : le cas exact décrit par
  // Lionel (matin ET aprem du même jour sélectionnés au glissé, cf.
  // bornesDepuisDemiSlots côté client, PAS un jour de plus).
  const plan = sandbox.construireOccurrencesSerie(champs, dates, 501, [], [], false, 1, null, null);
  assertEqual(plan.ops, [
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-07', demi: 'matin', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: 501 },
    { type: 'insert', table: 'assignations', personne_id: 12, date: '2026-09-07', demi: 'matin', chantier_id: 7 },
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-07', demi: 'aprem', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: 501 },
    { type: 'insert', table: 'assignations', personne_id: 12, date: '2026-09-07', demi: 'aprem', chantier_id: 7 },
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-08', demi: 'matin', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: 501 },
    { type: 'insert', table: 'assignations', personne_id: 12, date: '2026-09-08', demi: 'matin', chantier_id: 7 },
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-08', demi: 'aprem', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: 501 },
    { type: 'insert', table: 'assignations', personne_id: 12, date: '2026-09-08', demi: 'aprem', chantier_id: 7 },
  ], 'BUG Lionel corrigé : matin+aprem sélectionnés -> CHAQUE répétition pose bien les 2 demis, pas seulement la 1ère (matin)');
})();

// --- tache, plage de plusieurs jours, entièrement pleine (2ème forme du même bug) ---
(function () {
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Coffrage', personneId: 12, demi: 'matin',
    dateDebutIso: '2026-09-07', frequence: 'semaine', finType: 'occurrences', finValeur: 1,
  });
  // 3 jours ouvrés (lun-mer), aucun bord -> journée entière chaque jour.
  const plan = sandbox.construireOccurrencesSerie(champs, ['2026-09-07'], 501, [], [], false, 3, null, null);
  const dates = plan.ops.filter(o => o.table === 'taches').map(o => o.date + '/' + o.demi);
  assertEqual(dates, [
    '2026-09-07/matin', '2026-09-07/aprem',
    '2026-09-08/matin', '2026-09-08/aprem',
    '2026-09-09/matin', '2026-09-09/aprem',
  ], 'plage de 3 jours entiers -> les 6 cases (3 jours x 2 demis) posées pour cette occurrence, pas seulement le 1er jour');
})();

// --- tache, plage à cheval sur le week-end (jeudi + 5 jours ouvrés) ---
(function () {
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Congés', personneId: 12, demi: 'matin',
    dateDebutIso: '2026-09-10', frequence: 'jour', finType: 'occurrences', finValeur: 1,
  });
  const plan = sandbox.construireOccurrencesSerie(champs, ['2026-09-10'], 501, [], [], true, 5, null, null);
  const dates = [...new Set(plan.ops.filter(o => o.table === 'taches').map(o => o.date))];
  assertEqual(dates, ['2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16'],
    'plage de 5 jours ouvrés à partir d\'un jeudi -> saute le week-end (10,11 puis 14,15,16), comme une plage non-série (test_ajout_lointain.js)');
})();

// --- tache, bords "aprem"/"matin" sur une plage de 3 jours (1er/dernier
// jour partiels, jour du milieu entier) ---
(function () {
  const champs = sandbox.champsSerie({
    type: 'tache', texte: 'Coffrage', personneId: 12, demi: 'matin',
    dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 1,
  });
  const plan = sandbox.construireOccurrencesSerie(champs, ['2026-09-07'], 501, [], [], false, 3, 'aprem', 'matin');
  const dates = plan.ops.filter(o => o.table === 'taches').map(o => o.date + '/' + o.demi);
  assertEqual(dates, [
    '2026-09-07/aprem',
    '2026-09-08/matin', '2026-09-08/aprem',
    '2026-09-09/matin',
  ], 'bords aprem (1er jour) / matin (dernier jour) -> 1er et dernier jour partiels, jour du milieu entier');
})();

// --- jalon, plage de plusieurs jours avec bords ---
(function () {
  const champs = sandbox.champsSerie({ type: 'jalon', texte: 'Visite architecte', dateDebutIso: '2026-09-07', frequence: 'jour', finType: 'occurrences', finValeur: 1 });
  const plan = sandbox.construireOccurrencesSerie(champs, ['2026-09-07'], 9, [], [], false, 3, 'aprem', 'matin');
  assertEqual(plan.ops, [
    { type: 'insert', table: 'jalons', date: '2026-09-07', texte: 'Visite architecte', serie_id: 9, demi: 'aprem' },
    { type: 'insert', table: 'jalons', date: '2026-09-08', texte: 'Visite architecte', serie_id: 9 },
    { type: 'insert', table: 'jalons', date: '2026-09-09', texte: 'Visite architecte', serie_id: 9, demi: 'matin' },
  ], 'jalon sur 3 jours, bords aprem/matin -> 1 ligne par jour, demi seulement sur les bords (jour du milieu sans clé demi, comme avant)');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions réussies.');
if (echecs > 0) process.exit(1);
