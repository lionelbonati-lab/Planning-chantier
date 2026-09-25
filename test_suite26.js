const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 26) — Lionel : « Améliore le défilement tactile
// latéral et horizontal pour qu'il n'agisse que dans un sens à la fois. pour
// éviter de changer de jour sans faire exprès alors qu'on veut juste défiler
// verticalement. »
//
// Chaque glissé choisit UN axe (axeDuGeste, core.js) : horizontal seulement
// si le déplacement horizontal dépasse 1,5 fois le vertical. Vérifié avec de
// vrais événements tactiles (CDP) sur une case vide :
//   - téléphone (vue 1 jour) : un défilement vertical qui dérive de côté ne
//     touche plus scrollLeft (même jour), un swipe horizontal qui dérive un
//     peu ne défile plus verticalement ;
//   - tablette (vue 1 semaine) : un défilement vertical qui dérive de plus
//     de 46 px de côté ne change plus de semaine ; un vrai swipe, si.
//
// Lancer : node test_suite26.js

// 12 personnes : assez de lignes pour que #app défile verticalement.
const PERSONNES = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, nom: 'Personne ' + (i + 1), sous_traitant: false, ordre: i + 1, actif: true }));

// Glissé rapide au doigt (pas d'appui long : les mouvements partent tout de
// suite, comme un vrai défilement). Relève scrollLeft à mi-parcours.
async function glisser(page, de, dx, dy) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
  let milieu = null;
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + dx * i / 10, y: de.y + dy * i / 10 }] });
    await page.waitForTimeout(16);
    if (i === 5) milieu = await position(page);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1500); // inertie + calage sur le jour
  await cdp.detach();
  return milieu;
}
const position = (page) => page.evaluate(() => ({ gauche: Math.round(document.querySelector('.scroller').scrollLeft), haut: Math.round(app.scrollTop), semaine: etat.indexSemaine }));
// Centre d'une case vide réellement touchable (visible, pas sous l'en-tête figé).
const caseVide = (page) => page.evaluate(() => {
  const sc = document.querySelector('.scroller').getBoundingClientRect();
  const c = [...document.querySelectorAll('.cell[data-kind="personne"]')].find((x) => {
    const r = x.getBoundingClientRect();
    return r.left >= sc.left + 120 && r.right <= sc.right + 5 && r.bottom < window.innerHeight - 250 &&
      document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === x; // pas sous l'en-tête figé
  });
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Téléphone (390 px, vue 1 jour) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERSONNES } });
    verifier(await page.evaluate(() => modeJourMobileActif()), 'téléphone : vue 1 jour active');

    // Défilement vertical vers le bas, le pouce dérive de 90 px vers la droite.
    const avant = await position(page);
    const milieu = await glisser(page, await caseVide(page), 90, -260);
    const apres = await position(page);
    verifier(milieu.gauche === avant.gauche, 'vertical avec dérive : scrollLeft immobile PENDANT le geste (' + avant.gauche + ' → ' + milieu.gauche + ')');
    verifier(apres.gauche === avant.gauche, 'vertical avec dérive : même jour après le lâcher et l\'inertie (' + avant.gauche + ' → ' + apres.gauche + ')');
    verifier(apres.haut > avant.haut + 100, 'vertical avec dérive : la page a bien défilé vers le bas (' + avant.haut + ' → ' + apres.haut + ')');

    // Swipe horizontal vers la gauche (jour suivant), léger mouvement vertical.
    const avantH = await position(page);
    await glisser(page, await caseVide(page), -200, 60);
    const apresH = await position(page);
    verifier(apresH.gauche > avantH.gauche, 'horizontal avec dérive : passe au jour suivant (' + avantH.gauche + ' → ' + apresH.gauche + ')');
    verifier(apresH.haut === avantH.haut, 'horizontal avec dérive : aucun défilement vertical (' + avantH.haut + ' → ' + apresH.haut + ')');

    // Diagonale franche (45°, vers le haut : la page est déjà en bas) :
    // tranchée en vertical, pas de changement de jour.
    const avantD = await position(page);
    await glisser(page, await caseVide(page), -150, 150);
    const apresD = await position(page);
    verifier(apresD.gauche === avantD.gauche && apresD.haut !== avantD.haut, 'diagonale à 45° : défilement vertical seul (' + JSON.stringify([avantD, apresD]) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Tablette (820 px, vue 1 semaine) : swipe de semaine ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 700 }, hasTouch: true, bd: { personnes: PERSONNES } });
    const avant = await position(page);
    await glisser(page, await caseVide(page), 80, -250);
    const apres = await position(page);
    verifier(apres.semaine === avant.semaine, 'tablette, vertical avec 80 px de dérive : même semaine (' + avant.semaine + ' → ' + apres.semaine + ')');
    verifier(apres.haut > avant.haut, 'tablette, vertical avec dérive : la page a défilé (' + avant.haut + ' → ' + apres.haut + ')');

    await glisser(page, await caseVide(page), 200, 20);
    await page.waitForTimeout(500);
    const apresSwipe = await position(page);
    verifier(apresSwipe.semaine === avant.semaine - 1, 'tablette, vrai swipe vers la droite : semaine précédente (' + avant.semaine + ' → ' + apresSwipe.semaine + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  bilan(toutesErreurs);
})();
