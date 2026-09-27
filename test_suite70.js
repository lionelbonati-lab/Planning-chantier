const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 70). Lionel :
//   « En mode mobile, le mois affiché dans la case en haut à gauche ne peut
//     pas être septembre-octobre car il n'affiche qu'un jour. »
// Vérifie :
//   1. téléphone, vue 1 jour : la case coin porte le mois et l'année du
//      jour affiché (ouverture, « Aller à », changement d'année) ;
//   2. glissement vers le jour suivant : la case suit (« oct. » dès que le
//      jeudi 1er est à l'écran, « sept. » au retour) ;
//   3. ordinateur : la case garde les mois de la fenêtre affichée
//      (« sept. – oct. » sur la semaine du 28).
//
// Lancer : node test_suite70.js

const coin = (page) => page.evaluate(() => {
  const m = document.querySelector('#racine .th.coin .coin-mois'), a = document.querySelector('#racine .th.coin .coin-annee');
  return (m ? m.textContent : '') + ' ' + (a ? a.textContent : '');
});
// Défilement natif amené sur la colonne d'un jour (comme un glissement du
// doigt), puis 2 images : la case est mise à jour à l'image du défilement.
const defilerSur = (page, iso, fraction) => page.evaluate(async ([iso, fraction]) => {
  const sc = document.querySelector('#racine .scroller');
  const th = document.querySelector('#racine .entete-planning-figee .th[data-gi="' + giDepuisIso(iso) + '"]');
  const g = th.parentElement.getBoundingClientRect(), r = th.getBoundingClientRect();
  sc.style.scrollSnapType = 'none';
  const cible = Math.round(r.left - g.left - largeurNoms() - (1 - fraction) * r.width);
  const defile = new Promise((ok) => { const t = setTimeout(ok, 500); sc.addEventListener('scroll', () => { clearTimeout(t); ok(); }, { once: true }); });
  sc.scrollLeft = cible;
  await defile;
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
}, [iso, fraction]);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 et 2. Téléphone ---------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.waitForTimeout(400);
    const fenetre = await page.evaluate(() => [...document.querySelectorAll('#racine .th[data-gi]')].map((th) => isoDeGi(+th.dataset.gi)).sort());
    verifier(fenetre.some((d) => d < '2026-10-01') && fenetre.some((d) => d >= '2026-10-01'), 'téléphone : la grille chargée couvre septembre et octobre (' + fenetre[0] + ' → ' + fenetre[fenetre.length - 1] + ')');
    let c = await coin(page);
    verifier(/^sept\.? 2026$/i.test(c), 'ouverture (jeudi 24) : le mois du jour seul, « sept. 2026 » (' + c + ')');

    await page.evaluate(() => allerAuJour('2026-09-30')); await page.waitForTimeout(500);
    c = await coin(page);
    verifier(/^sept\.? 2026$/i.test(c), 'mercredi 30 : « sept. 2026 », jamais « sept. – oct. » (' + c + ')');

    await defilerSur(page, '2026-10-01', 0.6);
    c = await coin(page);
    verifier(/^oct\.? 2026$/i.test(c), 'glissement : jeudi 1er majoritaire à l\'écran, la case passe à « oct. » (' + c + ')');
    await defilerSur(page, '2026-10-01', 0.3);
    c = await coin(page);
    verifier(/^sept\.? 2026$/i.test(c), 'retour : mercredi 30 majoritaire, la case revient à « sept. » (' + c + ')');
    await defilerSur(page, '2026-10-01', 1);
    await page.waitForTimeout(800);
    c = await coin(page);
    const pose = await page.evaluate(() => jourMobileIso);
    verifier(pose === '2026-10-01' && /^oct\.? 2026$/i.test(c), 'jour posé sur le jeudi 1er (et grille recentrée) : « oct. 2026 » (' + pose + ', ' + c + ')');

    await page.evaluate(() => allerAuJour('2026-12-31')); await page.waitForTimeout(500);
    c = await coin(page);
    verifier(/^déc\.? 2026$/i.test(c), 'jeudi 31 décembre : « déc. 2026 » (' + c + ')');
    await page.evaluate(() => allerAuJour('2027-01-04')); await page.waitForTimeout(500);
    c = await coin(page);
    verifier(/^janv?\.? 2027$/i.test(c), 'lundi 4 janvier : « jan. 2027 », une seule année (' + c + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 3. Ordinateur : les mois de la fenêtre -------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 } });
    await page.evaluate(() => allerAuJour('2026-09-30')); await page.waitForTimeout(500);
    const c = await coin(page);
    verifier(/sept.*oct/i.test(c) && /2026$/.test(c), 'ordinateur, semaine du 28 : les deux mois, « sept. – oct. » (' + c + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
