const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 142). Lionel : « Un clic dans la case de la
// colonne à gauche des horaires sélectionne toutes les lignes. Un clic sur
// une ligne de séparation sélectionne tout le groupe ».
// Vérifie :
//   1. clic sur la case du coin sous le mois : toutes les lignes choisies,
//      toutes les bulles de la semaine sélectionnées ;
//   2. clic sur la bande « Personnel » : ses lignes seules (pas Intervenants,
//      pas Machines), leurs bulles seules ;
//   3. Ctrl + clic sur la bande « Intervenants » : ses lignes s'ajoutent ;
//   4. au doigt (téléphone) : toucher la bande « Intervenants » la choisit ;
//   5. aucune erreur JS.
//
// Lancer : node test_suite142.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const T = (id, pid) => ({ id, personne_id: pid, date: '2026-09-21', demi: 'matin', ordre: 0, texte: 'T' + id, chantier_id: 1, statut_id: null, important: false, serie_id: null, est_absence: false });
const BD = {
  personnes: [P(1, 'Paul', 1), P(2, 'Anne', 2), P(3, 'Béton SA', 3, { sous_traitant: true }), P(20, 'Machines', 5, { groupe_id: 1 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }],
  taches: [T(1, 1), T(2, 2), T(3, 3), T(4, 20)],
  elements_groupes: []
};
const choix = (page) => page.evaluate(() => ({
  lignes: [...document.querySelectorAll('#racine .grille > .ligne-choisie')].map((l) => l.dataset.ligne).sort().join(),
  bulles: Object.keys(bullesSelectionnees).sort().join()
}));
const centre = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 }; }, sel);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
    await page.waitForTimeout(600);
    // --- 1. Coin : toutes les lignes ----------------------------------------------------
    const tous = await page.evaluate(() => [...document.querySelectorAll('#racine .grille > [data-ligne]')].map((l) => l.dataset.ligne).sort().join());
    const c = await centre(page, '#racine .th.coin.th-demi');
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(400);
    const t = await choix(page);
    verifier(t.lignes === tous && /p1/.test(tous) && /jalon|note/.test(tous) && t.bulles === 'b1,b2,b3,b4',
      'coin sous le mois : toutes les lignes et toutes les bulles (' + JSON.stringify([tous, t]) + ')');

    // --- 2. Bande Personnel -------------------------------------------------------------
    const b1 = await centre(page, '#racine .grille > .section-row[data-section="personnel"]');
    await page.mouse.click(b1.x, b1.y);
    await page.waitForTimeout(400);
    const p = await choix(page);
    verifier(p.lignes === 'p1,p2' && p.bulles === 'b1,b2', 'bande Personnel : Paul et Anne seuls (' + JSON.stringify(p) + ')');

    // --- 3. Ctrl + bande Intervenants ------------------------------------------------------
    const b2 = await centre(page, '#racine .grille > .section-row[data-section="intervenants"]');
    await page.keyboard.down('Control');
    await page.mouse.click(b2.x, b2.y);
    await page.keyboard.up('Control');
    await page.waitForTimeout(400);
    const pi = await choix(page);
    verifier(pi.lignes === 'p1,p2,p3' && pi.bulles === 'b1,b2,b3', 'Ctrl + bande Intervenants : Béton SA ajouté, pas Machines (' + JSON.stringify(pi) + ')');
    verifier(!erreurs.length, 'ordinateur : aucune erreur JS (' + erreurs.join(' | ') + ')');
    await page.close();
  }
  {
    // --- 4. Téléphone --------------------------------------------------------------------
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD, viewport: { width: 390, height: 800 }, hasTouch: true, date: '2026-09-21T10:00:00' });
    await page.waitForTimeout(700);
    // Le libellé collant : la bande, elle, court sur toute la semaine défilée.
    const b = await centre(page, '#racine .grille > .section-row[data-section="intervenants"] > .section-row-sticky');
    await page.touchscreen.tap(b.x, b.y);
    await page.waitForTimeout(500);
    const ti = await choix(page);
    verifier(ti.lignes === 'p3' && ti.bulles === 'b3', 'téléphone : toucher la bande Intervenants choisit Béton SA (' + JSON.stringify(ti) + ')');
    verifier(!erreurs.length, 'téléphone : aucune erreur JS (' + erreurs.join(' | ') + ')');
    await page.close();
  }
  await browser.close();
  bilan();
})();
