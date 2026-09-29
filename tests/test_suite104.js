const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 104). Lionel : « Clic droit sur le nom
// modifier le nom. Clic gauche pour le menu ». Puis (suite 106) : « Clic
// double clique gauche sur le nom modifier le nom (double touch). Clic
// droit pour le menu (touche long). touche ou clic gauche simple pour
// sélection. » Suite 106 : gestes inversés, assertions adaptées.
// Vérifie :
//   1. ordinateur : double-clic sur un nom = fenêtre « Modifier » (nom
//      prérempli), sans menu ; enregistrer renomme la ligne ;
//   2. clic droit = menu de la ligne, qui propose aussi « Modifier le
//      nom… » ; double-clic sur Jalons : pas de fenêtre ;
//   3. le clic qui termine un trait glissé ne choisit pas la ligne, mais
//      le clic suivant, aussitôt après, la choisit ;
//   4. téléphone : double toucher = modifier le nom, appui long = menu,
//      toucher = choisir la ligne.
//
// Lancer : node test_suite104.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const BD = () => ({ personnes: PERS.map((p) => Object.assign({}, p)), taches: [] });

const nom = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
const trait = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 2 }; }, id);
const etat = (page) => page.evaluate(() => {
  const f = document.querySelector('.form-pop .f-nom'), m = document.querySelector('.menu-hauteur-ligne');
  return { nom: f ? f.value : null, menu: m ? [...m.querySelectorAll('button[data-a]')].map((b) => b.dataset.a) : null,
    choix: [...document.querySelectorAll('#racine .grille > .ligne-choisie')].map((l) => l.dataset.ligne).join(',') };
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
    await page.mouse.dblclick(n2.x, n2.y);
    await page.waitForTimeout(150);
    let e = await etat(page);
    verifier(e.nom === 'Personne 2' && e.menu === null, 'double-clic : fenêtre « Modifier » (nom prérempli), sans menu ' + JSON.stringify(e));
    await page.fill('.form-pop .f-nom', 'Marc');
    await page.click('.form-pop .f-ok');
    await page.waitForTimeout(300);
    const txt = await page.evaluate(() => document.querySelector('#racine .grille > [data-ligne="p2"] b').textContent.trim());
    const ecr = await page.evaluate(() => window.__ECRITURES.filter((x) => x.startsWith('personnes:update')).length);
    verifier(txt === 'Marc' && ecr === 1, 'enregistré : la ligne s\'appelle « Marc » (' + txt + ', ' + ecr + ' écriture)');

    n2 = await nom(page, 'p2');
    await page.mouse.click(n2.x, n2.y, { button: 'right' });
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.nom === null && e.menu && e.menu[0] === 'nom' && e.menu.includes('ok') && e.menu.includes('defaut'),
      'clic droit : menu de la ligne, « Modifier le nom… » en tête ' + JSON.stringify(e));
    await page.click('.menu-hauteur-ligne [data-a="nom"]');
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.nom === 'Marc' && e.menu === null, '« Modifier le nom… » : fenêtre « Modifier » à la place du menu ' + JSON.stringify(e));
    await page.click('.form-pop .f-annuler');
    await fermer(page);

    const nj = await nom(page, 'jalon');
    await page.mouse.dblclick(nj.x, nj.y);
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.nom === null && e.menu === null, 'double-clic sur Jalons : pas de fenêtre ' + JSON.stringify(e));
    await page.keyboard.press('Escape');

    // 3. trait glissé qui finit sur le nom : pas de menu ; clic suivant : menu
    const t3 = await trait(page, 'p3');
    await page.mouse.move(t3.x, t3.y);
    await page.mouse.down();
    await page.mouse.move(t3.x, t3.y - 20, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    e = await etat(page);
    verifier(e.menu === null && e.nom === null && e.choix === '', 'trait glissé qui finit sur le nom : ni menu ni ligne choisie ' + JSON.stringify(e));
    const n3 = await nom(page, 'p3');
    await page.mouse.click(n3.x, n3.y);
    await page.waitForTimeout(100);
    e = await etat(page);
    verifier(e.choix === 'p3' && e.menu === null, 'clic aussitôt après : ligne choisie ' + JSON.stringify(e));
    await fermer(page);
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Téléphone ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    const cdp = await page.context().newCDPSession(page);
    const toucher = async (p, ms) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
      await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    // Suite 106 : appui long = menu (suite 104 : modifier le nom).
    const n1 = await nom(page, 'p1');
    await toucher(n1, 700);
    await page.waitForTimeout(300);
    let e = await etat(page);
    const nbMenus = await page.evaluate(() => document.querySelectorAll('.menu-hauteur-ligne').length);
    verifier(e.menu !== null && e.nom === null && nbMenus === 1 && e.choix === '', 'appui long : un seul menu de la ligne, rien de choisi ' + JSON.stringify(e) + ' ' + nbMenus);
    await fermer(page);

    // Suite 106 : toucher = choisir la ligne (suite 104 : menu).
    const n3 = await nom(page, 'p3');
    await toucher(n3, 60);
    await page.waitForTimeout(500);
    e = await etat(page);
    verifier(e.choix === 'p3' && e.menu === null && e.nom === null, 'toucher : ligne choisie, sans menu ' + JSON.stringify(e));

    // Double toucher = modifier le nom.
    const n2 = await nom(page, 'p2');
    await toucher(n2, 40);
    await page.waitForTimeout(120);
    await toucher(n2, 40);
    await page.waitForTimeout(300);
    e = await etat(page);
    const nbPop = await page.evaluate(() => document.querySelectorAll('.form-pop').length);
    verifier(e.nom === 'Personne 2' && e.menu === null && nbPop === 1, 'double toucher : une seule fenêtre « Modifier » ' + JSON.stringify(e) + ' ' + nbPop);
    await fermer(page);
    await cdp.detach();
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
