/**
 * Test de l'ajout lointain — round du 02.09.2026.
 *
 * Demande de Lionel : « un bouton pour un formulaire qui me permettrait
 * d'entrer une note/jalon/tâche/congé à n'importe qui […] plus loin dans le
 * temps sans défiler tout le calendrier, avec durée. Exemple : un ouvrier
 * prend congé 1 semaine au mois de novembre. »
 *
 * Ce fichier teste les deux fonctions de DATES, qui sont l'endroit où ce genre
 * de fonctionnalité se casse silencieusement : compter des jours ouvrés à
 * travers des week-ends, et retrouver la bonne colonne dans la bonne semaine.
 * Elles sont extraites du vrai `WebApp.gs`, pas recopiées.
 *
 * Lancer : node test_ajout_lointain.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'WebApp.gs'), 'utf8');

function extraireFonction(nom) {
  const re = new RegExp('\\nfunction ' + nom + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fonction introuvable dans WebApp.gs : ' + nom);
  let i = SRC.indexOf('{', m.index + m[0].length - 1);
  let profondeur = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') profondeur++;
    else if (SRC[j] === '}') { profondeur--; if (profondeur === 0) return SRC.slice(m.index + 1, j + 1); }
  }
  throw new Error('accolades non équilibrées pour ' + nom);
}

// isoJour vit dans Planning_Format.gs (fichier séparé) : repris à l'identique.
const sandbox = {
  Date, Math, String, parseInt,
  isoJour: function (d) {
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
};
vm.createContext(sandbox);
vm.runInContext(
  extraireFonction('dateDepuisIso_') + '\n' +
  extraireFonction('joursOuvresDepuis_') + '\n' +
  extraireFonction('positionDuJour_'),
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
// 1) Compter des jours OUVRÉS — le cas de Lionel : "1 semaine de congé"
// =======================================================================
// Lundi 2 novembre 2026.
assertEqual(sandbox.joursOuvresDepuis_('2026-11-02', 5),
  ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
  '« 1 semaine de congé » à partir d’un lundi = les 5 jours ouvrés, samedi et dimanche exclus');

// Départ un MERCREDI : la semaine de congé déborde sur la suivante, en
// sautant le week-end. C'est le cas qui casse une implémentation naïve.
assertEqual(sandbox.joursOuvresDepuis_('2026-11-04', 5),
  ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'],
  'départ en milieu de semaine : les 5 jours ouvrés enjambent le week-end et débordent sur la semaine suivante');

// Départ un SAMEDI : le samedi et le dimanche ne comptent pas, le congé
// commence réellement le lundi.
assertEqual(sandbox.joursOuvresDepuis_('2026-11-07', 3),
  ['2026-11-09', '2026-11-10', '2026-11-11'],
  'départ un samedi : les jours de week-end ne sont jamais comptés, ça démarre au lundi');

assertEqual(sandbox.joursOuvresDepuis_('2026-11-02', 1), ['2026-11-02'],
  'durée 1 jour : un seul jour posé');
assertEqual(sandbox.joursOuvresDepuis_('2026-11-02', 10),
  ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06',
   '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
  '« 2 semaines » = 10 jours ouvrés répartis sur 2 semaines calendaires');

// =======================================================================
// 2) Retrouver la bonne colonne dans la bonne semaine
// =======================================================================
// 3 semaines simulées, telles que listerSemainesPlanning les renvoie
// (dateDebut = lundi, dateFin = dimanche).
function sem(labG, num, y, m, d) {
  const debut = new Date(y, m - 1, d);
  const fin = new Date(y, m - 1, d + 6);
  return { labG: labG, num: String(num), dateDebut: debut, dateFin: fin };
}
const semaines = [
  sem(1, 45, 2026, 11, 2),   // 02 → 08 novembre
  sem(9, 46, 2026, 11, 9),   // 09 → 15 novembre
  sem(17, 47, 2026, 11, 16)  // 16 → 22 novembre
];

assertEqual(sandbox.positionDuJour_(semaines, '2026-11-02'), { labG: 1, jourIdx: 0 },
  'lundi de la 1ère semaine : bonne colonne label, jour 0');
assertEqual(sandbox.positionDuJour_(semaines, '2026-11-06'), { labG: 1, jourIdx: 4 },
  'vendredi de la 1ère semaine : jour 4');
assertEqual(sandbox.positionDuJour_(semaines, '2026-11-09'), { labG: 9, jourIdx: 0 },
  'lundi suivant : on bascule bien sur la semaine d’après (labG 9), pas sur le jour 5 de la précédente');
assertEqual(sandbox.positionDuJour_(semaines, '2026-11-18'), { labG: 17, jourIdx: 2 },
  'mercredi de la 3e semaine : bonne semaine, bon jour');

assertEqual(sandbox.positionDuJour_(semaines, '2026-11-07'), null,
  'un samedi ne reçoit rien : le planning n’a pas de colonne de jour ouvré pour lui');
assertEqual(sandbox.positionDuJour_(semaines, '2026-11-08'), null, 'un dimanche non plus');
assertEqual(sandbox.positionDuJour_(semaines, '2026-12-25'), null,
  'une date hors des semaines connues renvoie null au lieu d’écrire dans une colonne au hasard');

// =======================================================================
// 3) Le scénario complet de Lionel, bout à bout : congé d'une semaine en
//    novembre, posé sur 2 semaines de planning différentes.
// =======================================================================
(function () {
  const jours = sandbox.joursOuvresDepuis_('2026-11-05', 5); // départ un jeudi
  const positions = jours.map(iso => sandbox.positionDuJour_(semaines, iso));
  assertEqual(positions.every(p => p !== null), true,
    'scénario complet : chacun des 5 jours du congé trouve sa place dans le planning');
  assertEqual(positions.map(p => p.labG), [1, 1, 9, 9, 9],
    'scénario complet : le congé s’étale bien sur 2 semaines (2 jours dans la 1ère, 3 dans la 2e)');
  assertEqual(positions.map(p => p.jourIdx), [3, 4, 0, 1, 2],
    'scénario complet : jeudi, vendredi, puis lundi/mardi/mercredi de la semaine suivante');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
