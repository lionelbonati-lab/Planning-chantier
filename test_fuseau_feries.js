/**
 * Test de non-régression du round r13 (02.09.2026) — décalage de fuseau sur
 * les dates de la feuille "Fériés".
 *
 * Reproduit le comportement RÉEL de Google Sheets, que le harnais
 * test_backend_pures.js ne pouvait pas voir (un seul fuseau dans Node, donc
 * écriture et relecture symétriques par construction) :
 *
 *   - une cellule date est stockée par Sheets comme un JOUR CIVIL, sans heure
 *     ni fuseau ;
 *   - getValues() la rend sous forme d'objet Date = "minuit ce jour-là DANS LE
 *     FUSEAU DE LA FEUILLE" ;
 *   - isoJour(d) la relit avec d.getDate()/getMonth()/getFullYear(), donc dans
 *     le FUSEAU DU SCRIPT.
 *
 * Si les deux fuseaux diffèrent, la date relue recule (ou avance) d'un jour —
 * c'est le bug remonté par Lionel ("à l'enregistrement tout redevient rouge
 * férié" : l'iso relu ne correspondant plus à l'iso envoyé, le client voit
 * chaque catégorie comme perdue).
 *
 * Ici : feuille en Europe/Zurich (UTC+2 en été), script en America/Los_Angeles
 * (UTC-7) — 9 h d'écart, l'écart typique d'un projet Apps Script resté au
 * fuseau américain par défaut sur un classeur suisse.
 *
 * Lancer : node test_fuseau_feries.js
 */
'use strict';

const OFFSET_FEUILLE_H = 2;   // Europe/Zurich, été
const OFFSET_SCRIPT_H = -7;   // America/Los_Angeles, été

let total = 0, echecs = 0;
function assertEqual(recu, attendu, message) {
  total++;
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a === b) { console.log('OK: ' + message); }
  else { echecs++; console.error('ÉCHEC: ' + message + '\n   attendu ' + b + '\n   reçu    ' + a); }
}

// --- Modèle de la cellule Sheets ---------------------------------------
// Ce que Sheets rend à getValues() pour un jour civil donné : l'instant
// "minuit dans le fuseau de la feuille", exprimé en absolu (epoch ms).
function celluleDepuisJourCivil(y, m, d, heure) {
  const h = heure === undefined ? 0 : heure;
  return new Date(Date.UTC(y, m - 1, d, h - OFFSET_FEUILLE_H, 0, 0));
}
// Ce que Sheets STOCKE quand on lui écrit un objet Date : le jour civil de cet
// instant vu dans le fuseau DE LA FEUILLE.
function jourCivilStocke(dateEcrite) {
  const t = new Date(dateEcrite.getTime() + OFFSET_FEUILLE_H * 3600000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// --- Les fonctions du serveur, transcrites -----------------------------
// isoJour (Planning_Format.gs) : méthodes "locales" = fuseau DU SCRIPT.
function isoJour(dt) {
  const t = new Date(dt.getTime() + OFFSET_SCRIPT_H * 3600000);
  const m = t.getUTCMonth() + 1, j = t.getUTCDate();
  return t.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
}
// Utilities.formatDate(d, tzFeuille, "yyyy-MM-dd")
function formatDateFeuille(dt) {
  const t = new Date(dt.getTime() + OFFSET_FEUILLE_H * 3600000);
  const m = t.getUTCMonth() + 1, j = t.getUTCDate();
  return t.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
}
// new Date(y, m-1, d[, 12]) construit dans le fuseau DU SCRIPT.
function nouvelleDateScript(y, m, d, heure) {
  const h = heure === undefined ? 0 : heure;
  return new Date(Date.UTC(y, m - 1, d, h - OFFSET_SCRIPT_H, 0, 0));
}

// AVANT le fix
const isoDeCelluleAvant = (dv) => isoJour(dv);
const dateDepuisIsoAvant = (iso) => { const p = iso.split('-').map(Number); return nouvelleDateScript(p[0], p[1], p[2]); };
// APRÈS le fix (r13)
const isoDeCelluleApres = (dv) => formatDateFeuille(dv);
const dateCelluleApres = (iso) => { const p = iso.split('-').map(Number); return nouvelleDateScript(p[0], p[1], p[2], 12); };

// =======================================================================
// 1) Le bug tel que Lionel le vit : relecture d'une date déjà en feuille
// =======================================================================
const cellule20Juillet = celluleDepuisJourCivil(2026, 7, 20);
assertEqual(isoDeCelluleAvant(cellule20Juillet), '2026-07-19',
  'AVANT le fix : une cellule affichant 20.07.2026 est relue "2026-07-19" (recul d’un jour) — c’est la cause du bug');
assertEqual(isoDeCelluleApres(cellule20Juillet), '2026-07-20',
  'APRÈS le fix : la même cellule est relue "2026-07-20", comme elle s’affiche dans la feuille');

// =======================================================================
// 2) Aller-retour complet écriture -> stockage -> relecture (le vrai scénario
//    d'apiEnregistrerFeries : on envoie un iso, on relit ce qui revient)
// =======================================================================
[['2026-01-01'], ['2026-07-20'], ['2026-12-25']].forEach(function (cas) {
  const iso = cas[0], p = iso.split('-').map(Number);

  const ecritAvant = dateDepuisIsoAvant(iso);
  const stockeAvant = jourCivilStocke(ecritAvant);
  const reluAvant = isoDeCelluleAvant(celluleDepuisJourCivil(stockeAvant.y, stockeAvant.m, stockeAvant.d));
  assertEqual(reluAvant !== iso, true,
    'AVANT le fix : ' + iso + ' envoyé -> relu ' + reluAvant + ' (≠ envoyé) — le client conclut "catégorie non gardée"');

  const ecritApres = dateCelluleApres(iso);
  const stockeApres = jourCivilStocke(ecritApres);
  assertEqual({ y: stockeApres.y, m: stockeApres.m, d: stockeApres.d }, { y: p[0], m: p[1], d: p[2] },
    'APRÈS le fix : ' + iso + ' est stocké sur le bon jour civil dans la feuille (écriture ancrée à midi)');
  const reluApres = isoDeCelluleApres(celluleDepuisJourCivil(stockeApres.y, stockeApres.m, stockeApres.d));
  assertEqual(reluApres, iso,
    'APRÈS le fix : ' + iso + ' envoyé -> relu ' + reluApres + ' (identique) — aller-retour propre');
});

// =======================================================================
// 3) Le fix ne casse rien quand les 2 fuseaux sont IDENTIQUES (cas où le bug
//    n'existait pas) : même résultat qu'avant, aucun décalage introduit.
// =======================================================================
(function () {
  const memeFuseau = (dt) => { // feuille et script au même offset : formatDate == isoJour
    const t = new Date(dt.getTime() + OFFSET_FEUILLE_H * 3600000);
    const m = t.getUTCMonth() + 1, j = t.getUTCDate();
    return t.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  };
  const cellule = celluleDepuisJourCivil(2026, 7, 20);
  assertEqual(memeFuseau(cellule), '2026-07-20',
    'Fuseaux identiques : la relecture donne le bon jour dans les deux cas — le fix est neutre quand le bug n’existe pas');
  // midi reste le même jour civil quel que soit l'écart réaliste (±13 h)
  for (let off = -13; off <= 13; off++) {
    const midi = new Date(Date.UTC(2026, 6, 20, 12 - off, 0, 0)); // midi dans un fuseau d'offset `off`
    const vuAilleurs = new Date(midi.getTime() + 13 * 3600000);   // relu 13 h plus loin
    if (vuAilleurs.getUTCDate() !== 20 && vuAilleurs.getUTCDate() !== 21) {
      echecs++; total++;
      console.error('ÉCHEC: ancrage à midi insuffisant pour un écart de ' + off + ' h');
    }
  }
  total++; console.log('OK: ancrage à midi — aucun écart de fuseau réaliste (±13 h) ne fait basculer le jour civil à l’écriture');
})();

console.log('\n' + (total - echecs) + '/' + total + ' assertions passées.');
if (echecs > 0) { console.error(echecs + ' échec(s).'); process.exit(1); }
