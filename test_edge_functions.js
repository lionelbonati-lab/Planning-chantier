/**
 * Test de la logique pure ajoutée pour brancher les 4 Edge Functions déjà
 * déployées (phase 4, étape 4 du §6bis — migration hors Google,
 * MIGRATION-GITHUB-PLAN.md). La quasi-totalité de cette étape est de la
 * plomberie fine (construire un `body`, appeler
 * sbClient.functions.invoke(), gérer le résultat) sans logique à tester —
 * conforme aux instructions de la tâche, on ne force pas de test dessus.
 * Trois morceaux ont une vraie logique de transformation, extraits ici
 * comme test_chargement.js/test_config_simple.js le font déjà :
 *
 *  - isoDeLabGJourIdx : traduit la coordonnée (labG, jourIdx) du moteur de
 *    diff (calculerEtatLocal/diffsJalons) en date ISO, au point d'appel de
 *    enregistrer-plage (synchroniser()) — jourIdx y est toujours 0..4
 *    (lundi..vendredi), jamais un jour de week-end.
 *  - joursOuvresDepuis : liste des jours ouvrés à partir d'une date de
 *    départ, pour l'ajout lointain (tâche/absence, qui n'a pas d'Edge
 *    Function dédiée) — port fidèle de l'ancien joursOuvresDepuis_
 *    (WebApp.gs).
 *  - construireLignesAjoutLointain : lignes taches/assignations à insérer
 *    pour la branche tâche/absence de l'ajout lointain — même règle
 *    "chantier posé une fois, jamais écrasé" que construireOccurrencesSerie
 *    (functions/enregistrer-serie/logic.js), reprise ici pour rester
 *    cohérent avec le reste du projet plutôt que de la réinventer.
 *
 * Lancer : node test_edge_functions.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const blocs = [...HTML.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)];
if (blocs.length === 0) throw new Error('aucun <script> trouvé dans index.html');
const SRC = blocs[blocs.length - 1][1];

function extraireFonction(nom) {
  const re = new RegExp('\\n(\\s*)function ' + nom + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fonction introuvable dans le <script> d\'index.html : ' + nom);
  let i = SRC.indexOf('{', m.index + m[0].length - 1);
  let profondeur = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') profondeur++;
    else if (SRC[j] === '}') { profondeur--; if (profondeur === 0) return SRC.slice(m.index + 1, j + 1); }
  }
  throw new Error('accolades non équilibrées pour ' + nom);
}
function extraireVar(nom) {
  const re = new RegExp('\\n\\s*var ' + nom + '\\s*=\\s*(\\[[\\s\\S]*?\\]);');
  const m = re.exec(SRC);
  if (!m) throw new Error('variable introuvable dans le <script> d\'index.html : ' + nom);
  return 'var ' + nom + ' = ' + m[1] + ';';
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extraireVar('MOIS_ABBR_WEB') + '\n' +
  ['pad2_', 'dateUTCDepuisIso_', 'isoDepuisDateUTC_', 'ajouterJoursUTC_', 'labGVersIso_', 'isoVersLabG',
    'infosSemaineDepuisLabG', 'isoDeLabGJourIdx', 'joursOuvresDepuis', 'construireLignesAjoutLointain']
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

// ============ isoDeLabGJourIdx ============
// labG 20260907 = lundi 7 septembre 2026 (cf. test_chargement.js).
assertEqual(sandbox.isoDeLabGJourIdx(20260907, 0), '2026-09-07', 'isoDeLabGJourIdx : jourIdx 0 = lundi');
assertEqual(sandbox.isoDeLabGJourIdx(20260907, 4), '2026-09-11', 'isoDeLabGJourIdx : jourIdx 4 = vendredi');
assertEqual(sandbox.isoDeLabGJourIdx(20260928, 2), '2026-09-30', 'isoDeLabGJourIdx : autre semaine, mercredi');
// À cheval sur un changement de mois (labG = lundi 28.09, jourIdx 4 = vendredi 02.10).
assertEqual(sandbox.isoDeLabGJourIdx(20260928, 4), '2026-10-02', 'isoDeLabGJourIdx : à cheval sur un changement de mois');

// ============ joursOuvresDepuis ============
assertEqual(sandbox.joursOuvresDepuis('2026-09-07', 5), // lundi -> vendredi
  ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'],
  'joursOuvresDepuis : 5 jours à partir d\'un lundi = la semaine entière');
assertEqual(sandbox.joursOuvresDepuis('2026-09-07', 1), ['2026-09-07'], 'joursOuvresDepuis : 1 jour = juste le jour de départ');
// isoDebut un samedi (2026-09-12) : le week-end ne compte pas, décale juste le départ.
assertEqual(sandbox.joursOuvresDepuis('2026-09-12', 2), ['2026-09-14', '2026-09-15'],
  'joursOuvresDepuis : départ un samedi, saute au lundi suivant sans consommer de jour');
// À cheval sur un week-end : 3 jours ouvrés à partir d'un jeudi = jeu, ven, lun (sam/dim sautés).
assertEqual(sandbox.joursOuvresDepuis('2026-09-10', 3), ['2026-09-10', '2026-09-11', '2026-09-14'],
  'joursOuvresDepuis : traverse un week-end sans le compter');

// ============ construireLignesAjoutLointain ============
(function () {
  const r = sandbox.construireLignesAjoutLointain(7, null, 'Congé', ['matin', 'aprem'], ['2026-09-07'], [], []);
  assertEqual(r.lignesTaches.length, 2, 'construireLignesAjoutLointain : 1 jour x 2 demis = 2 lignes taches');
  assertEqual(r.lignesTaches[0], { personne_id: 7, date: '2026-09-07', demi: 'matin', ordre: 0, texte: 'Congé', statut_id: null, important: false, serie_id: null },
    'construireLignesAjoutLointain : forme exacte d\'une ligne tache (ordre 0, rien d\'existant)');
  assertEqual(r.lignesAssignations, [], 'construireLignesAjoutLointain : pas de chantier -> aucune ligne assignation');
})();
(function () {
  // ordre tient compte à la fois de l'existant EN BASE et des lignes déjà
  // construites dans CET appel (2 jours -> même personne/demi, la 2e tâche
  // du jour doit suivre celle déjà posée par un appel précédent).
  const existantes = [{ date: '2026-09-07', demi: 'matin' }];
  const r = sandbox.construireLignesAjoutLointain(7, null, 'Congé', ['matin'], ['2026-09-07', '2026-09-08'], existantes, []);
  assertEqual(r.lignesTaches.map(function (l) { return l.ordre; }), [1, 0],
    'construireLignesAjoutLointain : ordre = nb de tâches déjà là ce jour-là (existantes + déjà construites)');
})();
(function () {
  // Chantier : posé si rien n'existe déjà sur ce (personne, date, demi)...
  const r1 = sandbox.construireLignesAjoutLointain(7, 42, 'Congé', ['matin'], ['2026-09-07'], [], []);
  assertEqual(r1.lignesAssignations, [{ personne_id: 7, date: '2026-09-07', demi: 'matin', chantier_id: 42 }],
    'construireLignesAjoutLointain : chantier posé quand le créneau est libre');
  // ...mais JAMAIS écrasé si une assignation existe déjà (même règle que
  // construireOccurrencesSerie, enregistrer-serie/logic.js).
  const r2 = sandbox.construireLignesAjoutLointain(7, 42, 'Congé', ['matin'], ['2026-09-07'], [], [{ date: '2026-09-07', demi: 'matin' }]);
  assertEqual(r2.lignesAssignations, [], 'construireLignesAjoutLointain : chantier jamais écrasé si le créneau est déjà assigné');
})();

console.log('\n' + total + ' vérifications, ' + echecs + ' échec(s).');
if (echecs > 0) process.exit(1);
