/**
 * Test de la logique pure de la "config simple" (phase 4, étape 3 du §6bis)
 * — port de apiCompterTachesPersonnes/apiEnregistrerStatuts (WebApp.gs) vers
 * le nouveau schéma Supabase.
 *
 * La plupart des 14 apiXxx portés à cette étape sont du CRUD direct sur une
 * table (sbClient.from(...).insert/update/delete) — rien à en extraire, ce
 * serait tester le mock plutôt que le code (cf. instructions de la tâche).
 * Seules 2 fonctions ont une vraie logique de transformation, extraites ici
 * comme test_chargement.js le fait pour la section chargement :
 *
 *  - compterTachesParPersonne_ : reconstitue le "nombre de tâches en cours"
 *    par personne depuis des lignes `taches` brutes (chantier_id lu
 *    directement dessus, round du 16.09.2026 — sql/0010_taches_chantier_id.sql),
 *    en reproduisant la fusion "même tâche reconduite sur des jours ouvrés
 *    consécutifs ne compte qu'une fois" (cf. WebApp.gs,
 *    compterTachesParPersonne_, et js/donnees-sync.js, construireVueDepuisCache).
 *  - genererCleStatut_ (+ slugifierStatut_ dont elle dépend) : calcule la
 *    clé technique d'un nouveau statut, avec dédoublonnage si 2 noms
 *    différents se slugifient pareil (cle est UNIQUE en base, sql/0001).
 *
 * Lancer : node test_config_simple.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// index.html + js/*.js : le <script> inline principal d'index.html a été
// découpé en fichiers js/*.js le 17.09.2026 (cf. sourceApp, aide_tests.js).
const SRC = require('./aide_tests').sourceApp();

function extraireFonction(nom) {
  const re = new RegExp('\\n(\\s*)function ' + nom + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fonction introuvable dans le code de l\'appli : ' + nom);
  let i = SRC.indexOf('{', m.index + m[0].length - 1);
  let profondeur = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') profondeur++;
    else if (SRC[j] === '}') { profondeur--; if (profondeur === 0) return SRC.slice(m.index + 1, j + 1); }
  }
  throw new Error('accolades non équilibrées pour ' + nom);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  ['estIsoWeekend_', 'prochainJourOuvreIso_', 'compterTachesParPersonne_', 'slugifierStatut_', 'genererCleStatut_']
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

// =======================================================================
// 1) estIsoWeekend_ / prochainJourOuvreIso_ — arithmétique de jours ouvrés.
// =======================================================================
assertEqual(sandbox.estIsoWeekend_('2026-09-05'), true, 'samedi 05.09.2026 = week-end');
assertEqual(sandbox.estIsoWeekend_('2026-09-06'), true, 'dimanche 06.09.2026 = week-end');
assertEqual(sandbox.estIsoWeekend_('2026-09-07'), false, 'lundi 07.09.2026 = jour ouvré');
assertEqual(sandbox.prochainJourOuvreIso_('2026-09-04'), '2026-09-07', 'vendredi -> lundi suivant (saute le week-end)');
assertEqual(sandbox.prochainJourOuvreIso_('2026-09-07'), '2026-09-08', 'lundi -> mardi (jour ouvré normal)');

// =======================================================================
// 2) compterTachesParPersonne_ — fusion des tâches reconduites sur des
//    jours ouvrés consécutifs, week-end jamais fusionné, "depuis" exclut
//    le passé.
// =======================================================================
(function () {
  // Alice (id 100) : même tâche "Coffrage" Lundi+Mardi+Mercredi (07-09.09,
  // matin) -> 1 seule tâche "en cours". Jeudi (10.09) change de chantier ->
  // rupture, nouvelle tâche. Le Lundi précédent (31.08, avant "depuis") est
  // ignoré. Round du 16.09.2026 (sql/0010_taches_chantier_id.sql) :
  // chantier_id se lit directement sur chaque ligne `taches`, plus besoin
  // d'un tableau `assignations` séparé à croiser.
  const taches = [
    { personne_id: 100, date: '2026-08-31', demi: 'matin', texte: 'Coffrage', statut_id: null, important: false, chantier_id: 1 }, // avant "depuis" : ignoré
    { personne_id: 100, date: '2026-09-07', demi: 'matin', texte: 'Coffrage', statut_id: null, important: false, chantier_id: 1 },
    { personne_id: 100, date: '2026-09-08', demi: 'matin', texte: 'Coffrage', statut_id: null, important: false, chantier_id: 1 },
    { personne_id: 100, date: '2026-09-09', demi: 'matin', texte: 'Coffrage', statut_id: null, important: false, chantier_id: 1 },
    { personne_id: 100, date: '2026-09-10', demi: 'matin', texte: 'Coffrage', statut_id: null, important: false, chantier_id: 2 }, // même texte mais chantier différent -> rupture
    // Week-end : 2 tâches identiques Samedi/Dimanche, jamais fusionnées
    // (cf. §2 du plan — case isolée, contrairement aux jours ouvrés).
    { personne_id: 100, date: '2026-09-12', demi: 'matin', texte: 'Astreinte', statut_id: null, important: false, chantier_id: null },
    { personne_id: 100, date: '2026-09-13', demi: 'matin', texte: 'Astreinte', statut_id: null, important: false, chantier_id: null },
    // Bob (id 200), aprem : tâche isolée.
    { personne_id: 200, date: '2026-09-07', demi: 'aprem', texte: 'Nettoyage', statut_id: 5, important: true, chantier_id: null }
  ];
  const out = sandbox.compterTachesParPersonne_(taches, '2026-09-01');
  assertEqual(out['100'], 4, 'Alice : Lun-Mer fusionnées (1) + Jeu (chantier différent, 1) + Samedi (1) + Dimanche (jamais fusionné, 1) = 4');
  assertEqual(out['200'], 1, 'Bob : une seule tâche isolée');
})();
(function () {
  // depuisIso filtre bien le passé, y compris pour une personne qui n'a
  // plus rien après cette date (out ne doit même pas contenir sa clé si
  // aucune ligne ne passe le filtre).
  const taches = [{ personne_id: 300, date: '2026-01-01', demi: 'matin', texte: 'Vieux chantier', statut_id: null, important: false, chantier_id: null }];
  const out = sandbox.compterTachesParPersonne_(taches, '2026-09-01');
  assertEqual(out['300'], undefined, 'personne sans aucune tâche >= depuisIso : absente du résultat (jamais 0 inventé)');
})();
(function () {
  // Rupture sur le statut seul (texte identique, statut différent).
  const taches = [
    { personne_id: 400, date: '2026-09-07', demi: 'matin', texte: 'Pose', statut_id: 1, important: false, chantier_id: null },
    { personne_id: 400, date: '2026-09-08', demi: 'matin', texte: 'Pose', statut_id: 2, important: false, chantier_id: null }
  ];
  const out = sandbox.compterTachesParPersonne_(taches, '2026-09-01');
  assertEqual(out['400'], 2, 'même texte mais statut_id différent -> pas de fusion, 2 tâches');
})();

// =======================================================================
// 3) slugifierStatut_ / genererCleStatut_ — clé technique + dédoublonnage.
// =======================================================================
assertEqual(sandbox.slugifierStatut_('À réserver'), 'areserver', 'accents/espaces retirés, minuscules');
assertEqual(sandbox.slugifierStatut_('Confirmé !'), 'confirme', 'ponctuation retirée');
assertEqual(sandbox.slugifierStatut_(''), 'statut', 'nom vide -> repli "statut" (jamais une clé vide)');
assertEqual(sandbox.genererCleStatut_('Confirmé', []), 'confirme', 'aucune collision : clé = slug direct');
assertEqual(sandbox.genererCleStatut_('Réservé', ['reserve']), 'reserve2', 'collision avec une clé existante -> suffixe numérique');
assertEqual(sandbox.genererCleStatut_('Reserve', ['reserve', 'reserve2']), 'reserve3', 'plusieurs collisions -> incrémente jusqu\'à trouver une clé libre');

console.log('\n' + (total - echecs) + '/' + total + ' assertions réussies.');
if (echecs > 0) process.exit(1);
