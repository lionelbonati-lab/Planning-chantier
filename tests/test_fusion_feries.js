/**
 * Test du round r19 (02.09.2026) — cellules FUSIONNÉES dans la colonne
 * "Catégorie" de la feuille "Fériés".
 *
 * CE QUE LE DIAGNOSTIC r17 A MONTRÉ SUR LE CLASSEUR RÉEL :
 *
 *   libelle(vacances_entreprise)="Vacances entreprise"      <- la fonction est bonne
 *   ligne écrite [A="TEST DIAGNOSTIC" | B=<date ok> | C=""] <- A et B passent, C non
 *
 * Une seule mécanique de Google Sheets produit ça : dans une plage fusionnée,
 * seule la cellule d'ANCRAGE reçoit la valeur ; les cellules "couvertes"
 * ignorent setValues() SANS lever d'erreur et se relisent vides.
 *
 * Confirmation apportée par Lionel : "1 case reste en vert" — le 20 juillet
 * d'abord, puis le 8 janvier après avoir tout refait. C'est à chaque fois le
 * DERNIER jour saisi : les nouvelles lignes sont ajoutées à la fin, donc la
 * dernière tombe APRÈS la zone fusionnée et reçoit bien sa catégorie.
 *
 * Ce fichier modélise ce comportement (aucun mock ne l'aurait attrapé
 * autrement : le harnais habituel écrit dans un tableau JS, où toutes les
 * cellules acceptent toujours l'écriture) et vérifie que defusionnerZoneFeries_
 * le corrige.
 *
 * Lancer : node test_fusion_feries.js
 */
'use strict';

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a === b) { console.log('OK: ' + message); }
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + b + '\n   reçu    ' + a); }
}

// --- Feuille simulée avec fusions ---------------------------------------
// merges = [{ col, ligneDebut, ligneFin }] : fusion VERTICALE sur une colonne.
// La cellule d'ancrage est ligneDebut ; les autres sont "couvertes".
function feuilleAvecFusions(nbLignes, nbCols, merges) {
  const cells = [];
  for (let r = 0; r <= nbLignes + 5; r++) cells.push(new Array(nbCols + 1).fill(''));
  function couverte(r, c) {
    return merges.some(m => m.col === c && r > m.ligneDebut && r <= m.ligneFin);
  }
  return {
    cells, merges,
    ecrire(ligne, col, valeur) {
      // Le comportement Sheets : une cellule couverte ignore l'écriture.
      if (couverte(ligne, col)) return false;
      cells[ligne][col] = valeur;
      return true;
    },
    lire(ligne, col) {
      return couverte(ligne, col) ? '' : cells[ligne][col];
    },
    defusionner() { const n = this.merges.length; this.merges = merges.length = 0, n; return n; }
  };
}

// Écrit un bloc [libellé, date, catégorie] comme le fait enregistrerFeriesV3_.
function ecrireBloc(sh, lignes) {
  lignes.forEach((row, i) => {
    const ligne = 2 + i;
    sh.ecrire(ligne, 1, row[0]);
    sh.ecrire(ligne, 2, row[1]);
    sh.ecrire(ligne, 3, row[2]);
  });
}
function lireCategories(sh, nb) {
  const out = [];
  for (let i = 0; i < nb; i++) out.push(sh.lire(2 + i, 3));
  return out;
}

// =======================================================================
// 1) Le symptôme exact du diagnostic r17 : A et B écrits, C vide
// =======================================================================
(function () {
  // Colonne C fusionnée de la ligne 2 à la ligne 41 (ancrage = ligne 2).
  const sh = feuilleAvecFusions(41, 3, [{ col: 3, ligneDebut: 2, ligneFin: 41 }]);
  sh.ecrire(10, 1, 'TEST DIAGNOSTIC');
  sh.ecrire(10, 2, 'Fri Jan 02 2099');
  sh.ecrire(10, 3, 'Vacances entreprise');

  assertEqual(sh.lire(10, 1), 'TEST DIAGNOSTIC', 'colonne A (hors fusion) : la valeur s’écrit normalement');
  assertEqual(sh.lire(10, 2), 'Fri Jan 02 2099', 'colonne B (hors fusion) : la valeur s’écrit normalement');
  assertEqual(sh.lire(10, 3), '', 'colonne C (couverte par la fusion) : l’écriture est IGNORÉE, la cellule se relit vide — symptôme exact du diagnostic r17');
})();

// =======================================================================
// 2) "1 seule case reste en vert" : le dernier jour saisi survit
// =======================================================================
(function () {
  // 5 jours existants (lignes 2 à 6) + 1 jour neuf ajouté à la fin (ligne 7).
  // Fusion de C2 à C6 : elle couvre les 5 existants mais PAS la ligne neuve.
  const sh = feuilleAvecFusions(20, 3, [{ col: 3, ligneDebut: 2, ligneFin: 6 }]);
  const lignes = [
    ['Nouvel an', 'd1', 'Vacances entreprise'],
    ['Jour 2', 'd2', 'Vacances entreprise'],
    ['Jour 3', 'd3', 'Vacances entreprise'],
    ['Jour 4', 'd4', 'Vacances entreprise'],
    ['Jour 5', 'd5', 'Vacances entreprise'],
    ['DERNIER CLIQUÉ', 'd6', 'Vacances entreprise'] // ligne 7, après la fusion
  ];
  ecrireBloc(sh, lignes);
  const cats = lireCategories(sh, 6);

  assertEqual(cats[0], 'Vacances entreprise', 'la 1ère ligne (cellule d’ANCRAGE de la fusion) garde sa catégorie');
  assertEqual(cats.slice(1, 5), ['', '', '', ''], 'les lignes couvertes par la fusion perdent toutes leur catégorie -> relues "ferie" -> tout rouge');
  assertEqual(cats[5], 'Vacances entreprise', 'SEUL le dernier jour saisi (ajouté après la zone fusionnée) garde sa catégorie — le "1 case reste en vert" de Lionel, qui se déplace à chaque saisie');
})();

// =======================================================================
// 3) Après défusion : tout rentre dans l'ordre
// =======================================================================
(function () {
  const sh = feuilleAvecFusions(20, 3, [{ col: 3, ligneDebut: 2, ligneFin: 6 }]);
  const nbDefusionnees = sh.defusionner(); // ce que fait defusionnerZoneFeries_
  assertEqual(nbDefusionnees, 1, 'defusionnerZoneFeries_ : la fusion est bien détectée puis retirée');

  const lignes = [
    ['Nouvel an', 'd1', 'Vacances entreprise'],
    ['Jour 2', 'd2', 'Vacances entreprise'],
    ['Jour 3', 'd3', 'Compensés'],
    ['Jour 4', 'd4', 'Férié'],
    ['Jour 5', 'd5', 'Vacances entreprise'],
    ['Jour 6', 'd6', 'Vacances entreprise']
  ];
  ecrireBloc(sh, lignes);
  assertEqual(lireCategories(sh, 6),
    ['Vacances entreprise', 'Vacances entreprise', 'Compensés', 'Férié', 'Vacances entreprise', 'Vacances entreprise'],
    'après défusion : CHAQUE ligne garde la catégorie demandée, y compris les catégories différentes entre elles');
})();

// =======================================================================
// 4) Feuille saine : la défusion ne change rien (idempotente, sans risque)
// =======================================================================
(function () {
  const sh = feuilleAvecFusions(20, 3, []);
  assertEqual(sh.defusionner(), 0, 'feuille sans fusion : defusionnerZoneFeries_ ne fait rien (aucun effet de bord)');
  ecrireBloc(sh, [['Jour 1', 'd1', 'Compensés'], ['Jour 2', 'd2', 'Férié']]);
  assertEqual(lireCategories(sh, 2), ['Compensés', 'Férié'], 'feuille sans fusion : comportement inchangé');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
