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
 *  - prochainJourOuvreIso_ : jour ouvré suivant (reste utilisé par « À
 *    réserver »). compterTachesParPersonne_ (« N tâches en cours ») a été
 *    retiré à la suite 54, avec le compteur des pages Personnel/Intervenants.
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
  ['prochainJourOuvreIso_', 'slugifierStatut_', 'genererCleStatut_']
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
// 1) prochainJourOuvreIso_ — arithmétique de jours ouvrés (sert à « À
//    réserver »). Round du 26.09.2026 (suite 54) : estIsoWeekend_ et
//    compterTachesParPersonne_ retirés avec le compteur « N tâches en
//    cours » des pages Personnel/Intervenants (Lionel : « Enlever le nombre
//    de taches attribuée, cela n'a aucune valeur. »).
// =======================================================================
assertEqual(sandbox.prochainJourOuvreIso_('2026-09-04'), '2026-09-07', 'vendredi -> lundi suivant (saute le week-end)');
assertEqual(sandbox.prochainJourOuvreIso_('2026-09-07'), '2026-09-08', 'lundi -> mardi (jour ouvré normal)');

// =======================================================================
// 2) slugifierStatut_ / genererCleStatut_ — clé technique + dédoublonnage.
// =======================================================================
assertEqual(sandbox.slugifierStatut_('À réserver'), 'areserver', 'accents/espaces retirés, minuscules');
assertEqual(sandbox.slugifierStatut_('Confirmé !'), 'confirme', 'ponctuation retirée');
assertEqual(sandbox.slugifierStatut_(''), 'statut', 'nom vide -> repli "statut" (jamais une clé vide)');
assertEqual(sandbox.genererCleStatut_('Confirmé', []), 'confirme', 'aucune collision : clé = slug direct');
assertEqual(sandbox.genererCleStatut_('Réservé', ['reserve']), 'reserve2', 'collision avec une clé existante -> suffixe numérique');
assertEqual(sandbox.genererCleStatut_('Reserve', ['reserve', 'reserve2']), 'reserve3', 'plusieurs collisions -> incrémente jusqu\'à trouver une clé libre');

console.log('\n' + (total - echecs) + '/' + total + ' assertions réussies.');
if (echecs > 0) process.exit(1);
