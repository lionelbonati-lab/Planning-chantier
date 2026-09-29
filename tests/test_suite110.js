const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 110). Lionel : « sur portable la selection de
// ligne selectionne toute la semaine, elle ne doit selectionner que ce qu'il
// y a à l'ecran » ; « en mode jour voisin elle sélectionne les 3 semaines. »
// Vérifie :
//   1. téléphone (vue 1 jour) : toucher un nom ne sélectionne que les
//      bulles du jour affiché ;
//   2. ordinateur, « Jours voisins » (3 semaines chargées) : clic sur un nom
//      = les bulles de la semaine à l'écran, pas celles des semaines
//      d'avant et d'après hors de l'écran ;
//   3. ordinateur, « 1 semaine » : toute la semaine, comme avant.
//
// Lancer : node test_suite110.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS, taches: [
  T(1, 1, '2026-09-16', 'matin', 'SemaineAvant'), T(2, 1, '2026-09-22', 'matin', 'Mardi'),
  T(3, 1, '2026-09-24', 'matin', 'Jeudi'), T(4, 1, '2026-09-30', 'matin', 'SemaineApres'),
  T(5, 2, '2026-09-24', 'matin', 'AutreLigne')] });

const nom = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
const selection = (page) => page.evaluate(() => TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort().join(','));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Téléphone ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    const n1 = await nom(page, 'p1');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: n1.x, y: n1.y }] });
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(500);
    const s = await selection(page);
    verifier(s === 'Jeudi', 'téléphone : toucher le nom = seulement la bulle du jour affiché (' + s + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2 et 3. Ordinateur --------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    let n1 = await nom(page, 'p1');
    await page.mouse.click(n1.x, n1.y);
    await page.waitForTimeout(200);
    let s = await selection(page);
    verifier(s === 'Jeudi,Mardi', '« 1 semaine » : clic sur le nom = toute la semaine (' + s + ')');
    await page.evaluate(() => { quitterModeSelection(); render(false); });

    await page.evaluate(() => basculerModeVue()); // 1 semaine -> Jours voisins
    await page.waitForTimeout(400);
    const vue = await page.evaluate(() => ({ dom: document.querySelectorAll('#racine .cell[data-kind="personne"][data-personne="1"][data-demi="matin"]').length }));
    n1 = await nom(page, 'p1');
    await page.waitForTimeout(450);
    await page.mouse.click(n1.x, n1.y);
    await page.waitForTimeout(200);
    s = await selection(page);
    verifier(s.includes('Jeudi') && s.includes('Mardi') && !s.includes('SemaineAvant') && !s.includes('SemaineApres') && !s.includes('AutreLigne'),
      '« Jours voisins » : clic sur le nom = la semaine à l\'écran, pas les semaines hors écran (' + s + ', ' + vue.dom + ' cases chargées)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
