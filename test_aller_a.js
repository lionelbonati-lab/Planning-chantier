/**
 * Test de `isoAffiche` — round du 03.09.2026, retour de Lionel sur la popup
 * "Aller à…" : les dates de chaque semaine y étaient affichées au format ISO
 * brut reçu du serveur ("2026-09-01"), à changer pour le format
 * suisse/français "dd.mm.aaaa" ("01.09.2026").
 *
 * Comme les autres test_*.js, ce fichier extrait la fonction RÉELLE
 * d'`index.html` plutôt que d'en tester une copie.
 *
 * Lancer : node test_aller_a.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extraireFonction(nom) {
  const re = new RegExp('\\n(\\s*)function ' + nom + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('fonction introuvable dans index.html : ' + nom);
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
vm.runInContext(extraireFonction('isoAffiche'), sandbox);

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  if (recu === attendu) console.log('OK: ' + message);
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + JSON.stringify(attendu) + '\n   reçu    ' + JSON.stringify(recu)); }
}

assertEqual(sandbox.isoAffiche('2026-09-01'), '01.09.2026', 'date ISO classique -> dd.mm.aaaa');
assertEqual(sandbox.isoAffiche('2026-12-31'), '31.12.2026', 'fin d’année, aucun zéro à gauche perdu');
assertEqual(sandbox.isoAffiche('2026-01-05'), '05.01.2026', 'jour ET mois à 1 chiffre -> les 2 zéros restent');
assertEqual(sandbox.isoAffiche(''), '', 'chaîne vide -> chaîne vide, jamais une exception');
assertEqual(sandbox.isoAffiche(null), '', 'null -> chaîne vide, jamais une exception');
assertEqual(sandbox.isoAffiche(undefined), '', 'undefined -> chaîne vide, jamais une exception');
assertEqual(sandbox.isoAffiche('pas une date'), 'pas une date', 'entrée déjà mal formée -> rendue telle quelle plutôt que tronquée n’importe comment');

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
