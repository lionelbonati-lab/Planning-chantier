const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 85). Lionel : « Bloquer la rotation d'écran
// mobile. » (js/rotation.js)
// Vérifie :
//   1. téléphone en hauteur : planning normal, pas d'écran « Tourne ton
//      téléphone » ;
//   2. téléphone tourné en largeur : l'écran couvre toute la page (au-dessus
//      de tout, clics arrêtés) ; retour en hauteur : le planning revient,
//      toujours en vue « 1 jour » ;
//   3. tablette en largeur, ordinateur étroit sans tactile : jamais ;
//   4. page de consultation des ouvriers : même chose ;
//   5. manifeste : orientation toujours libre (tablettes).
//
// Lancer : node test_suite85.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const ecran = (page) => page.evaluate(() => {
  const e = document.getElementById('tournerTelephone');
  if (!e || getComputedStyle(e).display === 'none') return { visible: false, classe: document.documentElement.classList.contains('paysage-telephone') };
  const r = e.getBoundingClientRect(), dessus = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return { visible: true, couvre: r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight, dessus: !!dessus && e.contains(dessus),
    texte: e.textContent, classe: document.documentElement.classList.contains('paysage-telephone') };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.waitForTimeout(400);
    let e = await ecran(page);
    verifier(!e.visible && !e.classe, 'téléphone en hauteur : planning normal (' + JSON.stringify(e) + ')');
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(500);
    e = await ecran(page);
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s85-paysage.png' });
    verifier(e.visible && e.couvre && e.dessus && e.classe && e.texte.indexOf('Tourne ton téléphone') >= 0,
      'téléphone en largeur : « Tourne ton téléphone » couvre toute la page (' + JSON.stringify(e) + ')');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
    e = await ecran(page);
    const jour = await page.evaluate(() => modeJourMobileActif());
    verifier(!e.visible && !e.classe && jour, 'retour en hauteur : planning revenu, en vue « 1 jour » (' + JSON.stringify(e) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    // Ouvert directement en largeur.
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 844, height: 390 }, hasTouch: true });
    await page.waitForTimeout(400);
    const e = await ecran(page);
    verifier(e.visible && e.couvre, 'ouvert en largeur sur téléphone : écran « Tourne ton téléphone » (' + JSON.stringify(e) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  for (const [vp, touche, nom] of [[{ width: 1024, height: 768 }, true, 'tablette en largeur'], [{ width: 844, height: 390 }, false, 'ordinateur, fenêtre basse sans tactile']]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: vp, hasTouch: touche });
    await page.waitForTimeout(300);
    const e = await ecran(page);
    verifier(!e.visible && !e.classe, nom + ' : jamais d\'écran (' + JSON.stringify(e) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    // Page de consultation des ouvriers.
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const erreurs = [];
    page.on('pageerror', (x) => erreurs.push(String(x)));
    await page.route(/fonts\.googleapis|fonts\.gstatic|\/rest\/v1\//, (r) => r.abort());
    await page.goto('file://' + path.join(__dirname, '..', 'consultation.html') + '?j=x');
    await page.waitForTimeout(400);
    let e = await ecran(page);
    verifier(e.visible && e.couvre && e.dessus, 'consultation, téléphone en largeur : « Tourne ton téléphone » (' + JSON.stringify(e) + ')');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
    e = await ecran(page);
    verifier(!e.visible, 'consultation, en hauteur : page normale (' + JSON.stringify(e) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  const manifeste = require('../manifest.json');
  verifier(manifeste.orientation === 'any', 'manifeste : orientation libre, les tablettes tournent (' + manifeste.orientation + ')');
  verifier(toutesErreurs.length === 0, 'aucune erreur console (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
