/**
 * Test de la logique pure de la fonction serveur decalage-masse
 * (functions/decalage-masse/logic.js) — port de calculerPlanDecalage_/
 * apiApercuDecalage/apiAppliquerDecalage (WebApp.gs) vers le nouveau schéma
 * Supabase (une ligne par date au lieu d'une colonne de semaine).
 *
 * Comme tous les test_*.js de ce projet, ce fichier extrait les VRAIES
 * fonctions du fichier source (regex + équilibrage d'accolades) plutôt que
 * d'en tester une copie.
 *
 * Lancer : node test_decalage_masse.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'functions/decalage-masse/logic.js'), 'utf8');

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

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  ['dateUTC', 'estJourOuvre', 'decalerJourOuvre', 'cleCase', 'celluleVide', 'fusionnerCellules', 'calculerPlanDecalage', 'opsPourDeplacement', 'construireOpsDecalage']
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
// 1) estJourOuvre / decalerJourOuvre
// =======================================================================
assertEqual(sandbox.estJourOuvre('2026-09-07'), true, '2026-09-07 (lundi) est un jour ouvré');
assertEqual(sandbox.estJourOuvre('2026-09-05'), false, '2026-09-05 (samedi) n\'est pas un jour ouvré');
assertEqual(sandbox.estJourOuvre('2026-09-06'), false, '2026-09-06 (dimanche) n\'est pas un jour ouvré');

assertEqual(sandbox.decalerJourOuvre('2026-09-07', 1), '2026-09-08', 'lundi + 1 jour ouvré -> mardi');
assertEqual(sandbox.decalerJourOuvre('2026-09-11', 1), '2026-09-14', 'vendredi + 1 jour ouvré -> lundi suivant (week-end sauté)');
assertEqual(sandbox.decalerJourOuvre('2026-09-07', -1), '2026-09-04', 'lundi - 1 jour ouvré -> vendredi précédent (week-end sauté)');
assertEqual(sandbox.decalerJourOuvre('2026-09-07', 5), '2026-09-14', 'lundi + 5 jours ouvrés -> lundi de la semaine suivante');
assertThrows(function () { sandbox.decalerJourOuvre('pas-une-date', 1); }, 'Date invalide.', 'date mal formée -> erreur');

// =======================================================================
// 2) celluleVide / fusionnerCellules
// =======================================================================
assertEqual(sandbox.celluleVide({ taches: [], assignations: [] }), true, 'ni tâche ni assignation -> vide');
assertEqual(sandbox.celluleVide({ taches: [{ id: 1 }], assignations: [] }), false, 'une tâche -> pas vide');
assertEqual(sandbox.celluleVide({ taches: [], assignations: [{ id: 1 }] }), false, 'une assignation seule -> pas vide');
assertEqual(sandbox.celluleVide(undefined), true, 'case absente -> vide');

assertEqual(
  sandbox.fusionnerCellules({ taches: [{ texte: 'Coffrage' }], assignations: [] }, { taches: [{ texte: 'Coffrage' }, { texte: 'Nettoyage' }], assignations: [{ chantier_id: 9 }] }),
  { taches: [{ texte: 'Coffrage' }, { texte: 'Nettoyage' }], assignations: [{ chantier_id: 9 }] },
  'fusion : tâche en double (même texte) non répétée, tâche nouvelle ajoutée, destination sans chantier -> chantier du source repris');

assertEqual(
  sandbox.fusionnerCellules({ taches: [], assignations: [{ chantier_id: 3 }] }, { taches: [{ texte: 'Nettoyage' }], assignations: [{ chantier_id: 9 }] }),
  { taches: [{ texte: 'Nettoyage' }], assignations: [{ chantier_id: 3 }] },
  'fusion : destination avait déjà un chantier -> celui du source jamais ajouté (règle reprise à l\'identique de l\'ancien code)');

// =======================================================================
// 3) calculerPlanDecalage
// =======================================================================
assertThrows(function () { sandbox.calculerPlanDecalage({ personneIds: [], dateDepartIso: '2026-09-07', sens: 'avancer', nJours: 1 }, [], {}, '2026-01-01'); },
  'Personne à décaler — la portée choisie est vide.', 'aucune personne ciblée -> erreur');

assertThrows(function () { sandbox.calculerPlanDecalage({ personneIds: [12], dateDepartIso: '2026-09-05', sens: 'avancer', nJours: 1 }, [], {}, '2026-01-01'); },
  'Jour de départ invalide.', 'date de départ un samedi -> erreur');

assertThrows(function () { sandbox.calculerPlanDecalage({ personneIds: [12], dateDepartIso: '2026-09-07', sens: 'avancer', nJours: 0 }, [], {}, '2026-01-01'); },
  'Nombre de jours invalide.', 'nJours = 0 -> erreur');

(function () {
  // Déplacement simple : destination vide.
  const sourcesCandidates = [{ personneId: 12, date: '2026-09-07', demi: 'matin' }];
  const cellesParCle = { '12|2026-09-07|matin': { taches: [{ id: 1, texte: 'Coffrage' }], assignations: [] } };
  const plan = sandbox.calculerPlanDecalage({ personneIds: [12], dateDepartIso: '2026-09-07', sens: 'avancer', nJours: 1 }, sourcesCandidates, cellesParCle, '2026-01-01');
  assertEqual(plan.simples.length, 1, 'destination vide -> déplacement simple');
  assertEqual(plan.simples[0].dateDest, '2026-09-08', 'destination calculée à 1 jour ouvré de distance');
  assertEqual(plan.conflits.length, 0, 'aucun conflit');
})();

(function () {
  // Conflit : destination déjà occupée.
  const sourcesCandidates = [{ personneId: 12, date: '2026-09-07', demi: 'matin' }];
  const cellesParCle = {
    '12|2026-09-07|matin': { taches: [{ id: 1, texte: 'Coffrage' }], assignations: [] },
    '12|2026-09-08|matin': { taches: [{ id: 2, texte: 'Déjà là' }], assignations: [] },
  };
  const plan = sandbox.calculerPlanDecalage({ personneIds: [12], dateDepartIso: '2026-09-07', sens: 'avancer', nJours: 1 }, sourcesCandidates, cellesParCle, '2026-01-01');
  assertEqual(plan.simples.length, 0, 'destination occupée -> pas un déplacement simple');
  assertEqual(plan.conflits.length, 1, 'destination occupée -> un conflit');
  assertEqual(plan.conflits[0].id, '12|2026-09-07|matin', 'id du conflit = clé de la case source');
})();

(function () {
  // Impossible : reculer ferait atterrir avant aujourd'hui.
  const sourcesCandidates = [{ personneId: 12, date: '2026-09-07', demi: 'matin' }];
  const cellesParCle = { '12|2026-09-07|matin': { taches: [{ id: 1, texte: 'Coffrage' }], assignations: [] } };
  const plan = sandbox.calculerPlanDecalage({ personneIds: [12], dateDepartIso: '2026-09-07', sens: 'reculer', nJours: 1 }, sourcesCandidates, cellesParCle, '2026-09-07');
  assertEqual(plan.impossibles, [{ personneId: 12, demi: 'matin', dateSource: '2026-09-07' }],
    'reculer d\'un jour ouvré depuis aujourd\'hui atterrirait avant aujourd\'hui -> impossible');
  assertEqual(plan.simples.length, 0, 'impossible -> ni simple ni conflit');
  assertEqual(plan.conflits.length, 0, 'impossible -> ni simple ni conflit');
})();

(function () {
  // Case vide dans sourcesCandidates (défensif) -> ignorée silencieusement.
  const sourcesCandidates = [{ personneId: 12, date: '2026-09-07', demi: 'matin' }];
  const plan = sandbox.calculerPlanDecalage({ personneIds: [12], dateDepartIso: '2026-09-07', sens: 'avancer', nJours: 1 }, sourcesCandidates, {}, '2026-01-01');
  assertEqual([plan.simples.length, plan.conflits.length, plan.impossibles.length], [0, 0, 0], 'case listée en source mais vide en base -> aucune opération');
})();

// =======================================================================
// 4) opsPourDeplacement
// =======================================================================
(function () {
  const entree = {
    personneId: 12, demi: 'matin', dateDest: '2026-09-08',
    source: { taches: [{ id: 1, texte: 'Coffrage', statut_id: null, important: false, serie_id: null }], assignations: [{ id: 5, chantier_id: 7 }] },
  };
  const ops = sandbox.opsPourDeplacement(entree, entree.source);
  assertEqual(ops, [
    { type: 'insert', table: 'taches', personne_id: 12, date: '2026-09-08', demi: 'matin', ordre: 0, texte: 'Coffrage', statut_id: null, important: false, serie_id: null },
    { type: 'insert', table: 'assignations', personne_id: 12, date: '2026-09-08', demi: 'matin', chantier_id: 7 },
    { type: 'delete', table: 'taches', id: 1 },
    { type: 'delete', table: 'assignations', id: 5 },
  ], 'déplacement simple (pas de dest) : insertions à la destination puis suppressions à la source, dans cet ordre');
})();

(function () {
  // Écrasement : la destination avait du contenu -> supprimé aussi (après les insertions).
  const entree = {
    personneId: 12, demi: 'matin', dateDest: '2026-09-08',
    source: { taches: [{ id: 1, texte: 'Coffrage', statut_id: null, important: false, serie_id: null }], assignations: [] },
    dest: { taches: [{ id: 9, texte: 'Ancien' }], assignations: [{ id: 8, chantier_id: 2 }] },
  };
  const ops = sandbox.opsPourDeplacement(entree, entree.source);
  const types = ops.map(function (o) { return o.type + ':' + o.table + ':' + (o.id || ''); });
  assertEqual(types, ['insert:taches:', 'delete:taches:9', 'delete:assignations:8', 'delete:taches:1'],
    'écrasement : nouveau contenu inséré, PUIS ancien contenu de la destination supprimé, PUIS source vidée');
})();

// =======================================================================
// 5) construireOpsDecalage — compteurs et résolutions.
// =======================================================================
(function () {
  const plan = {
    simples: [{ id: 's1', personneId: 12, demi: 'matin', dateDest: '2026-09-08', source: { taches: [], assignations: [] } }],
    conflits: [
      { id: 'c1', personneId: 12, demi: 'aprem', dateDest: '2026-09-08', source: { taches: [], assignations: [] }, dest: { taches: [], assignations: [] } },
      { id: 'c2', personneId: 13, demi: 'matin', dateDest: '2026-09-08', source: { taches: [], assignations: [] }, dest: { taches: [], assignations: [] } },
      { id: 'c3', personneId: 14, demi: 'matin', dateDest: '2026-09-08', source: { taches: [], assignations: [] }, dest: { taches: [], assignations: [] } },
    ],
    impossibles: [{ personneId: 15, demi: 'matin', dateSource: '2026-09-07' }],
  };
  const resolutions = { c1: 'ecraser', c2: 'ajouter' }; // c3 absent -> "ne rien faire"
  const resultat = sandbox.construireOpsDecalage(plan, resolutions);
  assertEqual([resultat.deplaces, resultat.ecrases, resultat.ajoutes, resultat.ignores], [1, 1, 1, 2],
    '1 simple déplacé, 1 écrasé, 1 ajouté, 2 ignorés (1 impossible + 1 conflit sans résolution)');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions réussies.');
if (echecs > 0) process.exit(1);
