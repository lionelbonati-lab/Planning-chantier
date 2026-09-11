/**
 * Test de la logique pure de la fonction serveur enregistrer-plage
 * (functions/enregistrer-plage/logic.js) — port de apiEnregistrerPlage
 * (WebApp.gs) vers le nouveau schéma Supabase (une ligne par date au lieu
 * d'une case de feuille par semaine).
 *
 * Comme tous les test_*.js de ce projet, ce fichier extrait les VRAIES
 * fonctions du fichier source (regex + équilibrage d'accolades) plutôt que
 * d'en tester une copie.
 *
 * Lancer : node test_enregistrer_plage.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'functions/enregistrer-plage/logic.js'), 'utf8');

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
  ['joursOuvresDeLaPlage', 'demiPourJourDePlage', 'lignesDe', 'normaliserPlage', 'planPlage']
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
// 1) joursOuvresDeLaPlage — jours ouvrés (lundi-vendredi) entre 2 dates.
// =======================================================================
assertEqual(sandbox.joursOuvresDeLaPlage('2026-09-07', '2026-09-07'), ['2026-09-07'],
  'un seul jour, un lundi -> lui-même');
assertEqual(sandbox.joursOuvresDeLaPlage('2026-09-05', '2026-09-05'), [],
  'un seul jour, un samedi -> aucun jour ouvré');
assertEqual(sandbox.joursOuvresDeLaPlage('2026-09-04', '2026-09-08'),
  ['2026-09-04', '2026-09-07', '2026-09-08'],
  'plage à cheval sur un week-end (ven 04 -> mar 08) -> le week-end est sauté');
assertEqual(sandbox.joursOuvresDeLaPlage('2026-09-07', '2026-09-11'),
  ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'],
  'une semaine ouvrée complète (lun-ven)');

// =======================================================================
// 2) demiPourJourDePlage — demi-journée sur les bords d'une plage.
// =======================================================================
assertEqual(sandbox.demiPourJourDePlage('2026-09-07', null, null, null, null), null,
  'pas de borne (b1 null) -> toujours journée entière');
assertEqual(sandbox.demiPourJourDePlage('2026-09-07', '2026-09-07', '2026-09-09', 'matin', 'aprem'), 'matin',
  'jour de début -> demi du début');
assertEqual(sandbox.demiPourJourDePlage('2026-09-09', '2026-09-07', '2026-09-09', 'matin', 'aprem'), 'aprem',
  'jour de fin -> demi de fin');
assertEqual(sandbox.demiPourJourDePlage('2026-09-08', '2026-09-07', '2026-09-09', 'matin', 'aprem'), null,
  'jour du milieu -> toujours journée entière, jamais une demi des bords');

// =======================================================================
// 3) lignesDe / normaliserPlage
// =======================================================================
assertEqual(sandbox.lignesDe('Livraison\n\nArmature\n  '), ['Livraison', 'Armature'],
  'lignes vides ignorées, texte trimé');
assertEqual(sandbox.normaliserPlage('2026-09-10', '2026-09-07', 'aprem', 'matin'),
  { d1: '2026-09-07', d2: '2026-09-10', demi1: 'matin', demi2: 'aprem' },
  'dates inversées -> remises dans l\'ordre, les bords aussi (round du 03.09.2026 côté ancienne appli)');
assertEqual(sandbox.normaliserPlage('2026-09-07', '', null, null),
  { d1: '2026-09-07', d2: '2026-09-07', demi1: null, demi2: null },
  'date de fin vide -> un seul jour');

// =======================================================================
// 4) planPlage — jalon (une ligne par date, texte unique).
// =======================================================================
(function () {
  const base = { kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-08', texte: 'Séance chantier', mode: 'remplacement' };
  const r = sandbox.planPlage(base, []);
  assertEqual(r.poses, 2, 'jalon remplacement sur 2 jours vides -> 2 jours posés');
  assertEqual(r.ops, [
    { type: 'insert', table: 'jalons', date: '2026-09-07', texte: 'Séance chantier', demi: null },
    { type: 'insert', table: 'jalons', date: '2026-09-08', texte: 'Séance chantier', demi: null },
  ], 'jalon remplacement sur 2 jours vides -> 2 insertions, aucune mise à jour ni suppression');
  assertEqual(r.remplaces, 0, 'rien n\'existait avant -> 0 remplacement compté');
})();

(function () {
  const existantes = [{ id: 1, date: '2026-09-07', texte: 'Ancien texte' }];
  const r = sandbox.planPlage({ kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Nouveau texte', mode: 'remplacement' }, existantes);
  assertEqual(r.ops, [{ type: 'update', table: 'jalons', id: 1, texte: 'Nouveau texte', demi: null }],
    'jalon remplacement sur une case déjà occupée -> mise à jour de la ligne existante, pas une nouvelle insertion');
  assertEqual(r.remplaces, 1, 'un texte en remplace un autre -> comptabilisé comme un remplacement');
})();

(function () {
  const existantes = [{ id: 1, date: '2026-09-07', texte: 'Même texte' }];
  const r = sandbox.planPlage({ kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Même texte', mode: 'remplacement' }, existantes);
  assertEqual(r.ops, [], 'jalon remplacement par le texte déjà présent -> aucune opération (rien ne change réellement)');
})();

(function () {
  const existantes = [{ id: 1, date: '2026-09-07', texte: 'À effacer' }];
  const r = sandbox.planPlage({ kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: '', mode: 'remplacement' }, existantes);
  assertEqual(r.ops, [{ type: 'delete', table: 'jalons', id: 1 }],
    'jalon remplacement par un texte vide sur une case occupée -> suppression de la ligne');
  assertEqual(r.liberes, 1, 'case vidée -> comptée comme "libérée"');
})();

(function () {
  // Jour sorti de la plage d'origine : ancien texte retrouvé -> effacé ;
  // texte déjà modifié entre-temps -> jamais touché (garde de sécurité).
  const existantesInchangees = [{ id: 5, date: '2026-09-09', texte: 'Séance chantier' }];
  const r1 = sandbox.planPlage({
    kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Séance chantier', mode: 'remplacement',
    origine: { dateDebut: '2026-09-07', dateFin: '2026-09-09', texte: 'Séance chantier' },
  }, existantesInchangees);
  assertEqual(r1.ops.some(o => o.type === 'delete' && o.id === 5), true,
    'jalon raccourci (3 jours -> 1) : le jour sorti de la plage, texte inchangé depuis, est libéré');

  const existantesModifiees = [{ id: 5, date: '2026-09-09', texte: 'Un autre texte tapé entre-temps' }];
  const r2 = sandbox.planPlage({
    kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Séance chantier', mode: 'remplacement',
    origine: { dateDebut: '2026-09-07', dateFin: '2026-09-09', texte: 'Séance chantier' },
  }, existantesModifiees);
  assertEqual(r2.ops.some(o => o.id === 5), false,
    'même raccourci, mais le jour sorti de la plage a été modifié depuis -> jamais touché (pas d\'écrasement silencieux)');
})();

assertThrows(function () {
  sandbox.planPlage({ kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: '', mode: 'ajout' }, []);
}, 'Écris un texte.', 'mode ajout avec un texte vide -> refusé (rien à ajouter)');

(function () {
  const existantes = [{ id: 1, date: '2026-09-07', texte: 'Ligne existante' }];
  const r = sandbox.planPlage({ kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Nouvelle ligne', mode: 'ajout' }, existantes);
  assertEqual(r.ops, [{ type: 'update', table: 'jalons', id: 1, texte: 'Ligne existante\nNouvelle ligne', demi: null }],
    'mode ajout sur une case déjà remplie -> la ligne s\'ajoute en dessous, rien n\'est écrasé');
})();

(function () {
  const existantes = [{ id: 1, date: '2026-09-07', texte: 'Ligne existante' }];
  const r = sandbox.planPlage({ kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Ligne existante', mode: 'ajout' }, existantes);
  assertEqual(r.ops, [], 'mode ajout d\'une ligne déjà présente telle quelle -> jamais dupliquée');
})();

assertThrows(function () {
  sandbox.planPlage({ kind: 'jalon', dateDebut: '2026-09-05', dateFin: '2026-09-05', texte: 'x', mode: 'remplacement' }, []);
}, 'Aucun jour ouvré de cette plage n\'existe dans le planning.', 'plage réduite à un seul samedi -> refusée, aucun jour ouvré dedans');

assertThrows(function () {
  sandbox.planPlage({ kind: 'autre', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'x', mode: 'remplacement' }, []);
}, 'Type de case invalide.', 'kind ni jalon ni note -> refusé');

// =======================================================================
// 4bis) planPlage — jalon avec demi-journée sur les bords (round du
//    08.09.2026, §47 du FRONTEND-CHANGELOG : "je veux que le jalon utilise
//    aussi la demi journée, comme ça toutes les bulles se comportent de la
//    même manière"). Même règle des 2 bords que pour une note (le jour du
//    MILIEU reste toujours une journée entière), mais un jalon garde son
//    modèle "une ligne par jour" — donc `demi` porte directement sur CETTE
//    ligne, jamais un tableau de plusieurs entrées comme pour les notes.
// =======================================================================
(function () {
  const r = sandbox.planPlage({
    kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-09', texte: 'Coulage dalle',
    mode: 'remplacement', demiDebut: 'matin', demiFin: 'aprem',
  }, []);
  assertEqual(r.ops, [
    { type: 'insert', table: 'jalons', date: '2026-09-07', texte: 'Coulage dalle', demi: 'matin' },
    { type: 'insert', table: 'jalons', date: '2026-09-08', texte: 'Coulage dalle', demi: null },
    { type: 'insert', table: 'jalons', date: '2026-09-09', texte: 'Coulage dalle', demi: 'aprem' },
  ], 'jalon sur 3 jours avec demi de bord (matin le 1er jour, aprem le dernier, journée entière au milieu)');
})();

(function () {
  // Même texte, mais une demi-journée différente : ce n'est PAS un no-op —
  // exactement le raisonnement déjà appliqué aux notes ci-dessous, mais ici
  // sur la ligne UNIQUE du jour (modèle jalon), pas une nouvelle ligne.
  const existantes = [{ id: 30, date: '2026-09-07', texte: 'Réunion chantier', demi: null }];
  const r = sandbox.planPlage({
    kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Réunion chantier',
    mode: 'remplacement', demiDebut: 'matin', demiFin: 'matin',
  }, existantes);
  assertEqual(r.ops, [{ type: 'update', table: 'jalons', id: 30, texte: 'Réunion chantier', demi: 'matin' }],
    'jalon : même texte mais demi-journée différente -> mise à jour (pas un no-op), la ligne reste unique');
})();

(function () {
  // Même texte ET même demi -> vraiment rien à faire.
  const existantes = [{ id: 31, date: '2026-09-07', texte: 'Réunion chantier', demi: 'aprem' }];
  const r = sandbox.planPlage({
    kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Réunion chantier',
    mode: 'remplacement', demiDebut: 'aprem', demiFin: 'aprem',
  }, existantes);
  assertEqual(r.ops, [], 'jalon : même texte et même demi-journée -> aucune opération');
})();

(function () {
  // Mode ajout : aucune ligne de texte nouvelle, mais la demi-journée
  // change quand même -> ça doit tout de même produire une mise à jour
  // (sinon un simple changement de demi passerait inaperçu en mode ajout).
  const existantes = [{ id: 32, date: '2026-09-07', texte: 'Livraison béton', demi: null }];
  const r = sandbox.planPlage({
    kind: 'jalon', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Livraison béton',
    mode: 'ajout', demiDebut: 'matin', demiFin: 'matin',
  }, existantes);
  assertEqual(r.ops, [{ type: 'update', table: 'jalons', id: 32, texte: 'Livraison béton', demi: 'matin' }],
    'jalon, mode ajout : aucune ligne nouvelle mais demi changée -> mise à jour quand même');
})();

// =======================================================================
// 5) planPlage — note (plusieurs entrées indépendantes possibles par jour,
//    chacune avec sa propre demi-journée sur les bords d'une plage).
// =======================================================================
(function () {
  const r = sandbox.planPlage({
    kind: 'note', dateDebut: '2026-09-07', dateFin: '2026-09-09', texte: 'Livraison sable',
    important: true, mode: 'remplacement', demiDebut: 'matin', demiFin: 'aprem',
  }, []);
  assertEqual(r.ops, [
    { type: 'insert', table: 'notes', date: '2026-09-07', texte: 'Livraison sable', important: true, demi: 'matin' },
    { type: 'insert', table: 'notes', date: '2026-09-08', texte: 'Livraison sable', important: true, demi: null },
    { type: 'insert', table: 'notes', date: '2026-09-09', texte: 'Livraison sable', important: true, demi: 'aprem' },
  ], 'note sur 3 jours avec demi de bord (matin le 1er jour, aprem le dernier, journée entière au milieu)');
})();

(function () {
  // Un jour avec 2 notes indépendantes déjà présentes : n'en modifier/retirer
  // qu'UNE, sans toucher à l'autre — le scénario exact qui a motivé la
  // réécriture entrée-par-entrée côté ancienne appli (round du 28.08.2026).
  const existantes = [
    { id: 10, date: '2026-09-07', texte: 'Note A (sans rapport)', important: false, demi: null },
    { id: 11, date: '2026-09-07', texte: 'Note à déplacer', important: false, demi: null },
  ];
  const r = sandbox.planPlage({
    kind: 'note', dateDebut: '2026-09-08', dateFin: '2026-09-08', texte: 'Note à déplacer',
    important: false, mode: 'remplacement',
    origine: { dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Note à déplacer', important: false },
  }, existantes);
  assertEqual(r.ops, [
    { type: 'delete', table: 'notes', id: 11 },
    { type: 'insert', table: 'notes', date: '2026-09-08', texte: 'Note à déplacer', important: false, demi: null },
  ], 'déplacement d\'une note du 07 au 08 : seule "Note à déplacer" bouge, "Note A" reste intacte sur le 07');
})();

(function () {
  const existantes = [{ id: 20, date: '2026-09-07', texte: 'Déjà là', important: false, demi: null }];
  const r = sandbox.planPlage({ kind: 'note', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Déjà là', important: false, mode: 'remplacement' }, existantes);
  assertEqual(r.ops, [], 'reposer exactement la même note (même texte, même importance, même demi) -> jamais un doublon');
})();

(function () {
  // Même texte, mais une demi-journée différente : ce n'est PAS un doublon.
  const existantes = [{ id: 21, date: '2026-09-07', texte: 'Livraison', important: false, demi: 'matin' }];
  const r = sandbox.planPlage({
    kind: 'note', dateDebut: '2026-09-07', dateFin: '2026-09-07', texte: 'Livraison', important: false,
    mode: 'remplacement', demiDebut: 'aprem', demiFin: 'aprem',
  }, existantes);
  assertEqual(r.ops, [{ type: 'insert', table: 'notes', date: '2026-09-07', texte: 'Livraison', important: false, demi: 'aprem' }],
    '"Livraison" le matin et "Livraison" l\'après-midi sont 2 notes distinctes, pas une répétition');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
