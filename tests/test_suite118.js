const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 118). Lionel : « En vue un jour, le pliage et
// le dépliage de l'équipe ne fonctionnent pas. »
// Vérifie :
//   1. vue « 1 jour » : équipe repliée, le membre qui n'a rien CE jour-là
//      est caché, même s'il a une tâche un autre jour des 2 semaines
//      chargées (avant : toujours affiché, ▸/▾ sans effet) ;
//   2. ▸ le montre, ▾ le cache ;
//   3. changement de jour par défilement : sur le jour de sa tâche, il
//      réapparaît sous l'équipe repliée (bulle comprise), le jour reste
//      posé ; de retour sur le jour d'avant, il est de nouveau caché ;
//   4. ordinateur, « 1 semaine » : inchangé (tâche dans la semaine =
//      membre affiché sous l'équipe repliée).
//
// Lancer : node test_suite118.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const BD = () => ({
  personnes: [P(1, 'Anne', 1), P(4, 'Membre', 2), P(10, 'Équipe A', 3, { equipe: true })],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-21', membres: [4] }],
  taches: [
    { id: 1, personne_id: 10, date: '2026-09-24', demi: 'matin', ordre: 0, texte: 'Coffrage', chantier_id: 1 },
    { id: 2, personne_id: 4, date: '2026-09-25', demi: 'matin', ordre: 0, texte: 'Ailleurs', chantier_id: 1 }
  ]
});

const etat = (page) => page.evaluate(() => ({
  lignes: [...document.querySelectorAll('#racine .grille > .lbl[data-ligne^="p"]')].map((l) => l.dataset.ligne).join(','),
  jour: jourMobileIso,
  ailleurs: [...document.querySelectorAll('#racine .bulle')].some((b) => b.textContent.includes('Ailleurs') && b.getClientRects().length > 0 && !b.classList.contains('hors-jour'))
}));
async function fleche(page) {
  const b = await page.evaluate(() => { const r = document.querySelector('#racine .equipe-repli').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(b.x, b.y);
  await page.waitForTimeout(400);
}
// Défilement natif jusqu'au jour `iso`, puis arrêt (200 ms) et reconstruction.
async function defilerVers(page, iso) {
  await page.evaluate((iso) => {
    const G = grilleCourante_;
    const th = [...G.grilleEntete.querySelectorAll('.th[data-gi]')].find((t) => isoDeGi(+t.dataset.gi) === iso);
    G.scroller.scrollLeft = decalerSurColonne_(G, th);
  }, iso);
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, bd: BD() });
    // --- 1. Équipe repliée, membre sans rien ce jour-là ------------------------
    let e = await etat(page);
    verifier(e.jour === '2026-09-24' && e.lignes === 'p10,p1', 'vue « 1 jour », équipe repliée : membre caché (tâche un autre jour) ' + JSON.stringify(e));

    // --- 2. ▸ / ▾ --------------------------------------------------------------------
    await fleche(page);
    e = await etat(page);
    verifier(e.lignes === 'p10,p4,p1', '▸ : le membre apparaît (' + e.lignes + ')');
    await fleche(page);
    e = await etat(page);
    verifier(e.lignes === 'p10,p1', '▾ : le membre est de nouveau caché (' + e.lignes + ')');

    // --- 3. Changement de jour -----------------------------------------------------
    await defilerVers(page, '2026-09-25');
    e = await etat(page);
    verifier(e.jour === '2026-09-25' && e.lignes === 'p10,p4,p1' && e.ailleurs, 'jour de sa tâche : le membre réapparaît avec sa bulle ' + JSON.stringify(e));
    await defilerVers(page, '2026-09-24');
    e = await etat(page);
    verifier(e.jour === '2026-09-24' && e.lignes === 'p10,p1', 'retour au jour d\'avant : membre caché ' + JSON.stringify(e));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Ordinateur : inchangé --------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    const e = await etat(page);
    verifier(e.lignes === 'p10,p4,p1', 'ordinateur, « 1 semaine » : membre avec une tâche dans la semaine affiché (' + e.lignes + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
