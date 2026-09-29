const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 104). Lionel : « Clic droit sur le nom
// modifier le nom. Clic gauche pour le menu ».
// Vérifie :
//   1. ordinateur : clic droit sur un nom = fenêtre « Modifier » (nom
//      prérempli), sans menu ; enregistrer renomme la ligne ;
//   2. clic gauche = menu de la ligne, qui propose aussi « Modifier le
//      nom… » ; clic droit sur Jalons : rien ;
//   3. le clic qui termine un trait glissé n'ouvre pas le menu, mais le
//      clic suivant, aussitôt après, l'ouvre ;
//   4. téléphone : appui long = modifier le nom, toucher = menu.
//
// Lancer : node test_suite104.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const BD = () => ({ personnes: PERS.map((p) => Object.assign({}, p)), taches: [] });

const nom = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
const trait = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 2 }; }, id);
const etat = (page) => page.evaluate(() => {
  const f = document.querySelector('.form-pop .f-nom'), m = document.querySelector('.menu-hauteur-ligne');
  return { nom: f ? f.value : null, menu: m ? [...m.querySelectorAll('button[data-a]')].map((b) => b.dataset.a) : null };
});
const fermer = (page) => page.evaluate(() => document.querySelectorAll('.menu-hauteur-ligne, .form-pop').forEach((p) => p.remove()));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 3. Ordinateur -----------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    let n2 = await nom(page, 'p2');
    await page.mouse.click(n2.x, n2.y, { button: 'right' });
    await page.waitForTimeout(150);
    let e = await etat(page);
    verifier(e.nom === 'Personne 2' && e.menu === null, 'clic droit : fenêtre « Modifier » (nom prérempli), sans menu ' + JSON.stringify(e));
    await page.fill('.form-pop .f-nom', 'Marc');
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(300);
    const txt = await page.evaluate(() => document.querySelector('#racine .grille > [data-ligne="p2"] b').textContent.trim());
    const ecr = await page.evaluate(() => window.__ECRITURES.filter((x) => x.startsWith('personnes:update')).length);
    verifier(txt === 'Marc' && ecr === 1, 'enregistré : la ligne s\'appelle « Marc » (' + txt + ', ' + ecr + ' écriture)');

    n2 = await nom(page, 'p2');
    await page.mouse.click(n2.x, n2.y);
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.nom === null && e.menu && e.menu[0] === 'nom' && e.menu.includes('ok') && e.menu.includes('defaut'),
      'clic gauche : menu de la ligne, « Modifier le nom… » en tête ' + JSON.stringify(e));
    await page.click('.menu-hauteur-ligne [data-a="nom"]');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.nom === 'Marc' && e.menu === null, '« Modifier le nom… » : fenêtre « Modifier » à la place du menu ' + JSON.stringify(e));
    await page.click('.form-pop .f-annuler');
    await fermer(page);

    const nj = await nom(page, 'jalon');
    await page.mouse.click(nj.x, nj.y, { button: 'right' });
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.nom === null && e.menu === null, 'clic droit sur Jalons : rien ' + JSON.stringify(e));

    // 3. trait glissé qui finit sur le nom : pas de menu ; clic suivant : menu
    const t3 = await trait(page, 'p3');
    await page.mouse.move(t3.x, t3.y);
    await page.mouse.down();
    await page.mouse.move(t3.x, t3.y - 20, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    e = await etat(page);
    verifier(e.menu === null && e.nom === null, 'trait glissé qui finit sur le nom : aucun menu ' + JSON.stringify(e));
    const n3 = await nom(page, 'p3');
    await page.mouse.click(n3.x, n3.y);
    await page.waitForTimeout(100);
    e = await etat(page);
    verifier(e.menu !== null, 'clic aussitôt après : menu ' + JSON.stringify(e));
    await fermer(page);
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Téléphone ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    const cdp = await page.context().newCDPSession(page);
    const n1 = await nom(page, 'p1');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: n1.x, y: n1.y }] });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    let e = await etat(page);
    const nbPop = await page.evaluate(() => document.querySelectorAll('.form-pop').length);
    verifier(e.nom === 'Personne 1' && e.menu === null && nbPop === 1, 'appui long : une seule fenêtre « Modifier », sans menu ' + JSON.stringify(e) + ' ' + nbPop);
    await fermer(page);

    const n3 = await nom(page, 'p3');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: n3.x, y: n3.y }] });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    e = await etat(page);
    verifier(e.menu !== null && e.nom === null, 'toucher : menu de la ligne ' + JSON.stringify(e));
    await cdp.detach();
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
