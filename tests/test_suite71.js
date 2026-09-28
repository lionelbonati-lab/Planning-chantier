const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 71). Lionel :
//   « Lorsque le numéro de mois est dans la case jour, l'enlever de la
//     colonne gauche. »
//   « L'espace entre semaines n'est pas visible lorsqu'on change de
//     semaine »
// Vérifie :
//   1. Date « 24.09 » (page Affichage) : case de gauche sans le mois,
//      l'année seule — planning et aperçu, ordinateur et téléphone ; le
//      mois revient avec « 24 » ;
//   2. téléphone, vue 1 jour : l'espace arrondi entre 2 semaines apparaît
//      pendant le glissement du vendredi au lundi, disparaît jour posé ;
//      rien avec « Entre 2 semaines : Rien ».
//
// Lancer : node test_suite71.js

const pastille = async (page, id, v) => { await page.click('#page-affichage .choix-pastille[data-option="' + id + '"][data-valeur="' + v + '"]'); await page.waitForTimeout(200); };
const coin = (page) => page.evaluate(() => {
  const m = document.querySelector('#racine .th.coin .coin-mois'), a = document.querySelector('#racine .th.coin .coin-annee');
  return (m ? m.textContent : '-') + ' ' + (a ? a.textContent : '-');
});
const seps = (page) => page.evaluate(() => [...document.querySelectorAll('#page-planning .sep-semaines')].map((s) => {
  const r = s.getBoundingClientRect();
  return { cote: s.classList.contains('sep-haut') ? 'haut' : 'bas', visible: !s.hidden && r.width > 0, l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
}));
// Glissement du doigt : défilement natif, doigt posé (le jour ne se pose
// pas), frontière du lundi 28 amenée à `px` du bord gauche des jours.
const glisser = (page, px) => page.evaluate(async (px) => {
  const sc = document.querySelector('#racine .scroller');
  sc.style.scrollSnapType = 'none';
  sc.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: sc, clientX: 200, clientY: 400 })] }));
  const th = document.querySelector('#racine .entete-planning-figee .th[data-gi="' + giDepuisIso('2026-09-28') + '"]');
  sc.scrollLeft += th.getBoundingClientRect().left - (sc.getBoundingClientRect().left + largeurNoms()) - px;
  await new Promise((ok) => setTimeout(ok, 100));
  return Math.round(th.getBoundingClientRect().left);
}, px);
const lever = async (page) => {
  await page.evaluate(() => { const sc = document.querySelector('#racine .scroller'); sc.dispatchEvent(new TouchEvent('touchend', { touches: [] })); sc.style.scrollSnapType = ''; });
  await page.waitForTimeout(900);
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Date « 24.09 » : l'année seule à gauche ---------------------------
  for (const [nom, opts] of [['ordinateur', { viewport: { width: 1400, height: 900 } }], ['téléphone', { viewport: { width: 390, height: 844 }, hasTouch: true }]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, opts);
    await page.waitForTimeout(300);
    const avant = await coin(page);
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    await pastille(page, 'formatDate', 'chiffres');
    const apercu = await page.evaluate(() => document.querySelector('#apercuAffichage .aa-coin').textContent);
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(400);
    const date = await page.evaluate(() => (document.querySelector('#racine .th[data-gi="3"] .th-date') || {}).textContent);
    const chiffres = await coin(page);
    verifier(/sept/.test(avant) && date === '24.09' && chiffres === '- 2026' && apercu === '2026',
      nom + ' : date « 24.09 », le mois retiré de la case de gauche, année seule (avant « ' + avant + ' », date ' + date + ', après « ' + chiffres + ' », aperçu « ' + apercu + ' »)');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    await pastille(page, 'formatDate', 'numero');
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(400);
    const numero = await coin(page);
    verifier(/sept/.test(numero) && /2026$/.test(numero), nom + ' : date « 24 », le mois revient à gauche (' + numero + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 2. Téléphone : espace entre semaines pendant le glissement ----------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.evaluate(() => allerAuJour('2026-09-25')); await page.waitForTimeout(600);
    let s = await seps(page);
    verifier(s.length === 2 && s.every((x) => !x.visible), 'vendredi 25 posé : la frontière est au bord droit, pas d\'espace à l\'écran (' + JSON.stringify(s) + ')');
    const x = await glisser(page, 150);
    s = await seps(page);
    const bas = s.find((e) => e.cote === 'bas'), haut = s.find((e) => e.cote === 'haut');
    verifier(bas && haut && bas.visible && haut.visible && bas.w === 8 && Math.abs(bas.l - (x - 5)) <= 1 && Math.abs(haut.l - bas.l) <= 1 && bas.h > 100,
      'glissement du vendredi au lundi : l\'espace arrondi de 8 px, en-tête et grille, sur la frontière (' + JSON.stringify(s) + ', lundi à ' + x + ')');
    const bord = await page.evaluate(() => getComputedStyle(document.querySelector('#racine .th.sem-frontiere')).borderLeftWidth);
    verifier(bord === '0px', 'pas de trait épais sous l\'espace (' + bord + ')');
    await glisser(page, 0);
    await lever(page);
    const pose = await page.evaluate(() => jourMobileIso);
    s = await seps(page);
    verifier(pose === '2026-09-28' && s.every((e) => !e.visible), 'lundi 28 posé : l\'espace sorti de l\'écran (' + pose + ', ' + JSON.stringify(s) + ')');

    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    await page.click('#page-affichage .reglage-ligne[data-option="separation"] .interrupteur'); await page.waitForTimeout(250);
    await page.evaluate(() => afficherPage('planning')); await page.waitForTimeout(400);
    await page.evaluate(() => allerAuJour('2026-09-25')); await page.waitForTimeout(600);
    await glisser(page, 150);
    s = await seps(page);
    verifier(s.length === 0, '« Entre 2 semaines : Rien » : pas d\'espace pendant le glissement (' + s.length + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
