/**
 * Test du "chantier par défaut des formulaires" — round du 03.09.2026,
 * demande de Lionel : « pouvoir sélectionner un chantier dans la légende
 * pour qu'il soit sélectionné par défaut dans les formulaires ».
 *
 * Complété le même jour (suite) avec `chantierExistantDansCase` : Lionel a
 * signalé que poser une 2e tâche sur une case en occupant déjà une change
 * silencieusement le chantier de la 1ère (« lorsque je pose une tache sur
 * une demi journée, l'autre tâche prend le chantier de la nouvelle créée »).
 * Retirée le 26.09.2026 (suite 67) : cf. section 3.
 *
 * Comme test_grille_compacte.js / test_formulaires_assignation.js, ce
 * fichier extrait les fonctions RÉELLES de l'appli (`js/*.js`) plutôt que d'en
 * tester une copie.
 *
 * Lancer : node test_chantier_defaut.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// index.html + js/*.js : le code est sorti d'index.html le 17.09.2026 (cf.
// sourceApp, aide_tests.js).
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

const NOMS = ['esc', 'esc2', 'chantierParDefautValide', 'optionSansChantierHTML_', 'champChantierHTML'];

const sandbox = { LIBELLE_SANS_CHANTIER: 'Aucun chantier', CHANTIERS: {}, chantierParDefaut: null, TACHES: [], String: String, Math: Math };
vm.createContext(sandbox);
vm.runInContext(NOMS.map(extraireFonction).join('\n'), sandbox);

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a === b) console.log('OK: ' + message);
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + b + '\n   reçu    ' + a); }
}
function assertTrue(cond, message) {
  total++;
  if (cond) console.log('OK: ' + message);
  else { echecs++; console.error('ÉCHEC: ' + message); }
}

// =======================================================================
// 1) chantierParDefautValide() — jamais une valeur périmée.
// =======================================================================
sandbox.CHANTIERS = { 'Villa Rossi': { nom: 'Villa Rossi', couleur: '#abc' }, 'École primaire': { nom: 'École primaire', couleur: '#def' } };

sandbox.chantierParDefaut = null;
assertEqual(sandbox.chantierParDefautValide(), null, 'rien choisi -> null (comportement d’avant, inchangé)');

sandbox.chantierParDefaut = 'Villa Rossi';
assertEqual(sandbox.chantierParDefautValide(), 'Villa Rossi', 'chantier choisi et toujours présent -> renvoyé tel quel');

sandbox.chantierParDefaut = 'Chantier renommé ou supprimé depuis';
assertEqual(sandbox.chantierParDefautValide(), null,
  'chantier choisi puis renommé/supprimé entre-temps -> null (JAMAIS une valeur périmée qui pointerait sur du vide)');

// =======================================================================
// 2) champChantierHTML(...) — l'option correspondante porte bien "selected",
//    et une seule.
// =======================================================================
sandbox.chantierParDefaut = 'École primaire';
(function () {
  const defaut = sandbox.chantierParDefautValide() || Object.keys(sandbox.CHANTIERS)[0];
  const html = sandbox.champChantierHTML(defaut);
  const nbSelected = (html.match(/selected/g) || []).length;
  assertEqual(nbSelected, 1, 'une seule option "selected" dans le select');
  assertTrue(/value="École primaire"[^>]*selected/.test(html),
    'le chantier choisi dans la légende ("École primaire") est bien celui pré-coché, pas le 1er de la liste');
})();

// Rien choisi dans la légende : on retombe sur le tout premier chantier de
// CHANTIERS (comportement du tout début, jamais cassé par cette fonctionnalité).
sandbox.chantierParDefaut = null;
(function () {
  const premier = Object.keys(sandbox.CHANTIERS)[0]; // 'Villa Rossi'
  const defaut = sandbox.chantierParDefautValide() || premier;
  assertEqual(defaut, premier, 'aucun chantier choisi dans la légende -> repli sur le 1er chantier (identique à avant ce round)');
  const html = sandbox.champChantierHTML(defaut);
  assertTrue(new RegExp('value="' + premier + '"[^>]*selected').test(html), 'le 1er chantier porte bien "selected" dans ce cas');
})();

// =======================================================================
// 3) chantierExistantDansCase — retirée le 26.09.2026 (suite 67), Lionel :
//    « chantier par défaut désélectionner mais un chantier est attribué à
//    l'ouverture du formulaire. » Chaque tâche porte son chantier depuis la
//    RPC remplacer_case_personne : plus rien à reprendre de la case.
// =======================================================================

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
