/**
 * Test de l'assignation des formulaires "Entrée rapide" — round du 02.09.2026.
 *
 * Modèle final, précisé en deux temps par Lionel :
 *   1. « les ajouts rapides doivent être pour le personnel en général, pas une
 *      seule personne »
 *   2. « tout le monde, personnel, et ensuite chaque intervenant séparé.
 *      L'électricien n'a pas besoin des ajouts béton. »
 * Soit : le personnel interne en UN SEUL groupe (même métier), mais CHAQUE
 * intervenant à part (chacun est un corps de métier différent). La première
 * version, entièrement nominative, était une sur-interprétation de la demande
 * d'origine (« les entrées rapides par intervenant ou ouvrier ").
 *
 * Complété le 03.09.2026 (section 4) avec `appliquerStatutsEtFormulaires` :
 * Lionel a signalé « menu ajout rapide a des absences en double ». Cause
 * racine : cette fonction reconstruit le tableau GLOBAL `FORMULAIRES_RAPIDES`
 * (celui que lit le menu "Ajouter" de la grille) via un .map() qui ne gardait
 * que {nom, champs} — perdant typeEntree/assigneA au passage, pourtant bien
 * renvoyés par apiListerFormulairesRapides (WebApp.gs) et déjà couverts par
 * les sections 1 à 3 ci-dessus. La page "Formulaires" (admin), elle, lit
 * `etat.formulairesRapidesServeur` directement (jamais ce .map()) — d'où un
 * bug invisible depuis cette page-là, mais bien réel dans le menu "Ajouter".
 *
 * Comme test_grille_compacte.js, ce fichier extrait la fonction RÉELLE de
 * l'appli (`js/*.js`) plutôt que d'en tester une copie.
 *
 * Lancer : node test_formulaires_assignation.js
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
// Les constantes ASSIGNE_* sont déclarées sur une seule ligne : on la reprend
// telle quelle depuis la source, pour tester les VRAIES valeurs sérialisées
// en feuille (une faute de frappe ici casserait tout en silence).
const ligneConstantes = /\n\s*(var ASSIGNE_TOUS = .*?;)/.exec(SRC);
if (!ligneConstantes) throw new Error('constantes ASSIGNE_* introuvables');

// PERSONNES : 2 maçons (ancres 6 et 10) + 2 intervenants de corps de métier
// différents (14 = électricien, 18 = peintre) — le cas exact décrit par
// Lionel : « l'électricien n'a pas besoin des ajouts béton ».
const sandbox = {
  PERSONNES: [
    { id: '6', nom: 'Bus', sousTraitant: false },
    { id: '10', nom: 'Marco', sousTraitant: false },
    { id: '14', nom: 'Électricien', sousTraitant: true },
    { id: '18', nom: 'Peintre', sousTraitant: true }
  ],
  String: String
};
vm.createContext(sandbox);
vm.runInContext(
  ligneConstantes[1] + '\n' +
  extraireFonction('personneParAncre') + '\n' +
  extraireFonction('secteurPersonne') + '\n' +
  extraireFonction('formulaireVisiblePour') + '\n' +
  extraireFonction('nomAssigneAffiche'),
  sandbox
);

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a === b) console.log('OK: ' + message);
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + b + '\n   reçu    ' + a); }
}
// Qui voit ce formulaire ? -> liste des noms, dans l'ordre de PERSONNES.
function visiblePour(assigneA) {
  return sandbox.PERSONNES
    .filter(p => sandbox.formulaireVisiblePour({ assigneA: assigneA }, p.id))
    .map(p => p.nom);
}

// =======================================================================
// 1) Le modèle voulu par Lionel : tout le monde / le personnel en bloc /
//    chaque intervenant séparément.
// =======================================================================
assertEqual(visiblePour(''), ['Bus', 'Marco', 'Électricien', 'Peintre'],
  '"Tout le monde" : le formulaire apparaît pour le personnel ET tous les intervenants');
assertEqual(visiblePour('@personnel'), ['Bus', 'Marco'],
  '"Personnel" : les maçons seulement — les ajouts béton cessent d’encombrer les intervenants');
assertEqual(visiblePour('14'), ['Électricien'],
  'un intervenant en particulier : seul l’électricien voit ce formulaire, pas le peintre ni le personnel');
assertEqual(visiblePour('18'), ['Peintre'],
  'un autre intervenant : chaque corps de métier a bien sa propre liste');

// Le cas concret cité par Lionel, vérifié de bout en bout.
assertEqual(visiblePour('@personnel').indexOf('Électricien'), -1,
  'cas cité : un formulaire "Béton" réglé sur Personnel n’apparaît JAMAIS chez l’électricien');

// =======================================================================
// 2) Rétrocompatibilité : les réglages déjà enregistrés doivent continuer à
//    fonctionner, même quand l'interface ne propose plus de les créer.
//    Sans ça, un formulaire déjà réglé disparaîtrait sans prévenir.
// =======================================================================
assertEqual(visiblePour('@intervenants'), ['Électricien', 'Peintre'],
  '"tous les intervenants" (proposé un temps, retiré de la liste) : toujours honoré s’il a été enregistré');
assertEqual(visiblePour('10'), ['Marco'],
  'assignation à une personne du personnel : toujours honorée, le formulaire reste chez Marco');
assertEqual(visiblePour('999'), [],
  'assignation vers une personne disparue : le formulaire n’apparaît nulle part, mais ne fait planter personne');

// =======================================================================
// 3) Libellé affiché sur la carte de la page "Entrée rapide"
// =======================================================================
assertEqual(sandbox.nomAssigneAffiche({ assigneA: '' }), 'Tout le monde', 'libellé : vide -> "Tout le monde"');
assertEqual(sandbox.nomAssigneAffiche({ assigneA: '@personnel' }), 'Personnel', 'libellé : catégorie Personnel');
assertEqual(sandbox.nomAssigneAffiche({ assigneA: '@intervenants' }), 'Intervenants', 'libellé : ancien réglage "tous les intervenants", toujours lisible');
assertEqual(sandbox.nomAssigneAffiche({ assigneA: '6' }), 'Bus', 'libellé : ancienne assignation individuelle -> le nom de la personne');
assertEqual(sandbox.nomAssigneAffiche({ assigneA: '999' }), '#999',
  'libellé : personne disparue -> l’identifiant brut, pour que l’info ne soit pas masquée en silence');

// =======================================================================
// 4) appliquerStatutsEtFormulaires — régression du 03.09.2026 : le tableau
//    global FORMULAIRES_RAPIDES doit conserver typeEntree ET assigneA, pas
//    seulement nom/champs, sinon le menu "Ajouter" de la grille (qui lit CE
//    tableau, cf. boutonsMenuAjout dans index.html) ne peut plus reconnaître
//    une absence configurée ni respecter son assignation.
// =======================================================================
(function () {
  const sandbox2 = {
    etat: {
      statutsServeur: [{ cle: 'urgent', nom: 'Urgent', couleur: '#f00', ordre: 1 }],
      formulairesRapidesServeur: [
        { nom: 'Congé', ordre: 1, assigneA: '@personnel', typeEntree: 'absence', champs: [] },
        { nom: 'Béton', ordre: 2, assigneA: '', typeEntree: 'tache', champs: [{ cle: 'qte', label: 'Quantité', type: 'texte' }] }
      ]
    },
    STATUTS: {}, STATUTS_ORDRE: [], FORMULAIRES_RAPIDES: []
  };
  vm.createContext(sandbox2);
  vm.runInContext(extraireFonction('appliquerStatutsEtFormulaires'), sandbox2);
  sandbox2.appliquerStatutsEtFormulaires();

  const conge = sandbox2.FORMULAIRES_RAPIDES.find(f => f.nom === 'Congé');
  const beton = sandbox2.FORMULAIRES_RAPIDES.find(f => f.nom === 'Béton');
  assertEqual(sandbox2.FORMULAIRES_RAPIDES.length, 2, 'les 2 formulaires du serveur sont bien repris, aucun perdu ni dupliqué');
  assertEqual(conge && conge.typeEntree, 'absence',
    'typeEntree survit à appliquerStatutsEtFormulaires (sinon le menu "Ajouter" propose le Congé configuré EN PLUS du Congé codé en dur -> doublon signalé par Lionel)');
  assertEqual(conge && conge.assigneA, '@personnel', 'assigneA survit aussi : le menu doit continuer à respecter à qui ce formulaire est réservé');
  assertEqual(beton && beton.typeEntree, 'tache', 'un formulaire de type tâche reste bien "tache", pas confondu avec "absence"');
  assertEqual(sandbox2.STATUTS.urgent && sandbox2.STATUTS.urgent.nom, 'Urgent', 'les statuts, traités par la même fonction, ne sont pas touchés par ce correctif');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
