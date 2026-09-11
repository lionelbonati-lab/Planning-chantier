/**
 * Test de la logique pure de la fonction serveur gerer-serie
 * (functions/gerer-serie/logic.js) — port de apiModifierSerie ET
 * apiSupprimerSerie (WebApp.gs). La portée (unique/suivant/serie) est déjà
 * appliquée comme filtre SQL par index.ts avant d'appeler ces fonctions
 * (cf. commentaire en tête de logic.js) : ce test ne porte donc que sur "que
 * fait-on des lignes déjà sélectionnées", jamais sur la sélection elle-même.
 *
 * Comme tous les test_*.js de ce projet, ce fichier extrait les VRAIES
 * fonctions du fichier source (regex + équilibrage d'accolades) plutôt que
 * d'en tester une copie.
 *
 * Lancer : node test_gerer_serie.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'functions/gerer-serie/logic.js'), 'utf8');

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
  ['planSupprimerSerie', 'planModifierSerie'].map(extraireFonction).join('\n'),
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
// 1) planSupprimerSerie — chaque ligne matchée est retirée, rien d'autre.
// =======================================================================
assertEqual(
  sandbox.planSupprimerSerie('taches', [{ id: 11 }, { id: 12 }]),
  { ops: [{ type: 'delete', table: 'taches', id: 11 }, { type: 'delete', table: 'taches', id: 12 }] },
  'suppression : une ligne "delete" par ligne matchée, jamais touché aux assignations');

assertEqual(sandbox.planSupprimerSerie('jalons', []), { ops: [] },
  'suppression : aucune ligne matchée -> aucune opération');

// =======================================================================
// 2) planModifierSerie — applique modifs à chaque ligne matchée.
// =======================================================================
assertEqual(
  sandbox.planModifierSerie('taches', [{ id: 1, personne_id: 12, date: '2026-09-07', demi: 'matin' }], { texte: '  Nouveau texte  ' }),
  { ops: [{ type: 'update', table: 'taches', id: 1, champs: { texte: 'Nouveau texte' } }] },
  'modif texte seul -> texte trimé, statut/important non touchés');

assertEqual(
  sandbox.planModifierSerie('taches', [{ id: 1, personne_id: 12, date: '2026-09-07', demi: 'matin' }], { statutId: 4, important: true }),
  { ops: [{ type: 'update', table: 'taches', id: 1, champs: { important: true, statut_id: 4 } }] },
  'modif statut+important sur une tâche -> les deux colonnes appliquées');

assertEqual(
  sandbox.planModifierSerie('jalons', [{ id: 1, date: '2026-09-07' }], { statutId: 4, important: true }),
  { ops: [{ type: 'update', table: 'jalons', id: 1, champs: { important: true } }] },
  'modif statut sur un JALON -> ignoré (pas de colonne statut_id sur jalons), important quand même appliqué');

assertEqual(
  sandbox.planModifierSerie('notes', [{ id: 1, date: '2026-09-07' }], { statutId: 4 }),
  { ops: [] },
  'modif statut seul sur une NOTE -> aucune opération (rien à appliquer : statut ignoré, rien d\'autre fourni)');

assertEqual(
  sandbox.planModifierSerie('taches', [{ id: 1, personne_id: 12, date: '2026-09-07', demi: 'matin' }], { texte: '   ' }),
  { ops: [{ type: 'delete', table: 'taches', id: 1 }] },
  'texte vidé (blanc) -> la ligne est SUPPRIMÉE plutôt que mise à jour avec un texte vide');

assertEqual(
  sandbox.planModifierSerie('taches', [], { texte: 'x' }),
  { ops: [] },
  'aucune ligne matchée -> aucune opération, même avec des modifs fournies');

// --- chantier : remplacement intégral de l'assignation, par (personne, date, demi) distinct ---
(function () {
  const lignes = [
    { id: 1, personne_id: 12, date: '2026-09-07', demi: 'matin' },
    { id: 2, personne_id: 12, date: '2026-09-08', demi: 'matin' },
  ];
  const plan = sandbox.planModifierSerie('taches', lignes, { chantierId: 9 });
  assertEqual(plan.ops, [
    { type: 'replace_assignation', personne_id: 12, date: '2026-09-07', demi: 'matin', chantier_id: 9 },
    { type: 'replace_assignation', personne_id: 12, date: '2026-09-08', demi: 'matin', chantier_id: 9 },
  ],
  'chantier seul (rien d\'autre à modifier sur la tâche elle-même) -> un replace_assignation par jour touché, aucun update de tâche vide');
})();

(function () {
  // Deux tâches de la série le même jour à la même demi -> une SEULE
  // opération d'assignation pour ce (personne, date, demi), pas une par tâche.
  const lignes = [
    { id: 1, personne_id: 12, date: '2026-09-07', demi: 'matin' },
    { id: 2, personne_id: 12, date: '2026-09-07', demi: 'matin' },
  ];
  const plan = sandbox.planModifierSerie('taches', lignes, { chantierId: 9 });
  const opsAssignation = plan.ops.filter(function (o) { return o.type === 'replace_assignation'; });
  assertEqual(opsAssignation.length, 1, 'deux tâches même jour/demi -> une seule assignation remplacée, pas de doublon');
})();

assertEqual(
  sandbox.planModifierSerie('jalons', [{ id: 1, date: '2026-09-07' }], { chantierId: 9 }),
  { ops: [] },
  'chantier fourni pour un JALON -> ignoré (assignations n\'a de sens que pour une tâche)');

assertEqual(
  sandbox.planModifierSerie('taches', [{ id: 1, personne_id: 12, date: '2026-09-07', demi: 'matin' }], { chantierId: null }),
  { ops: [] },
  'chantierId explicitement null -> ignoré (comme l\'ancien code : jamais de "retrait" de chantier via une série)');

console.log('\n' + (total - echecs) + '/' + total + ' assertions réussies.');
if (echecs > 0) process.exit(1);
