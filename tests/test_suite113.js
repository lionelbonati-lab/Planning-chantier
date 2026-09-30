const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 113). Lionel : « L'espace sous les bulles est
// trop grand. ajoute un réglage qui permet d'adapter l'espace qu'on
// souhaite entre chaque bulles et fond de case ».
// Vérifie :
//   1. ordinateur : 2 bulles courtes d'une case l'une sous l'autre à leur
//      hauteur réelle, 3 px entre elles et au-dessus (plus la place d'une
//      carte pleine) ;
//   2. « Espace entre les bulles » à 10 puis 0 px : pile refaite tout de
//      suite, sans reconstruire la grille ; curseur sur la page Affichage
//      (le panneau Hauteur de la barre est retiré à la suite 122) ;
//   3. téléphone : son propre réglage.
//
// Lancer : node test_suite113.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, ordre, texte) => ({ id, personne_id: pid, date, demi, ordre, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS, taches: [T(1, 1, '2026-09-24', 'matin', 0, 'Haut'), T(2, 1, '2026-09-24', 'matin', 1, 'Bas')] });
const pile = (page) => page.evaluate(() => {
  const c = (t) => [...document.querySelectorAll('#racine .scroller .bulle')].find((b) => b.querySelector('.b-txt').textContent.trim() === t).querySelector('.b-carte').getBoundingClientRect();
  const l = document.querySelector('#racine .grille > [data-ligne="p1"]').getBoundingClientRect();
  const a = c('Haut'), b = c('Bas');
  return { dessus: Math.round((a.top - l.top) * 10) / 10, entre: Math.round((b.top - a.bottom) * 10) / 10, hA: Math.round(a.height), u: parseFloat(getComputedStyle(racineEl).getPropertyValue('--mob-carte-pers')) };
});
const proche = (a, b) => Math.abs(a - b) <= 1;

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 et 2. Ordinateur -------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    let p = await pile(page);
    verifier(proche(p.dessus, 3) && proche(p.entre, 3) && p.hA < p.u - 10, 'par défaut : 3 px au-dessus et entre les bulles, à leur hauteur réelle ' + JSON.stringify(p));
    await page.evaluate(() => { document.querySelector('#racine .scroller .grille').dataset.marque = '1'; });
    // Suite 122 : plus de panneau Hauteur dans la barre ; le curseur de la
    // page Affichage fait le même appel (changerOptionAffichage, léger).
    const tirer = (v) => page.evaluate((v) => changerOptionAffichage('espaceBullesOrdi', v, profilAppareil_(), true), v);
    verifier(await page.evaluate(() => !document.getElementById('btnHauteurs')), 'suite 122 : plus de bouton « Hauteur des lignes » dans la barre');
    await tirer('10');
    await page.waitForTimeout(150);
    p = await pile(page);
    const marque = await page.evaluate(() => document.querySelector('#racine .scroller .grille').dataset.marque === '1');
    verifier(proche(p.dessus, 10) && proche(p.entre, 10) && marque, 'curseur à 10 px : 10 px au-dessus et entre, sans reconstruire la grille ' + JSON.stringify(p));
    await tirer('0');
    await page.waitForTimeout(150);
    p = await pile(page);
    verifier(proche(p.dessus, 0) && proche(p.entre, 0), 'curseur à 0 : bulles collées ' + JSON.stringify(p));
    await page.evaluate(() => afficherPage('affichage'));
    await page.waitForTimeout(200);
    const lib = await page.evaluate(() => [optionAffichage('espaceBullesOrdi'), document.querySelector('#page-affichage .curseur-valeur[data-pour="espaceBullesOrdi"]').textContent]);
    verifier(lib[0] === '0' && lib[1] === '0 px', 'valeur retenue et libellé ' + JSON.stringify(lib));
    const ligne = await page.evaluate(() => { const l = document.querySelector('#page-affichage .reglage-ligne[data-option="espaceBullesOrdi"]'); return l && !l.hidden && l.offsetHeight > 0; });
    verifier(ligne, 'page Affichage : réglage « Espace entre les bulles » de l\'ordinateur');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone ---------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.evaluate(() => changerOptionAffichage('espaceBullesOrdi', '12', 'ordi'));
    await page.waitForTimeout(200);
    let p = await pile(page);
    verifier(proche(p.dessus, 3) && proche(p.entre, 3), 'téléphone : réglage de l\'ordinateur sans effet ' + JSON.stringify(p));
    await page.evaluate(() => changerOptionAffichage('espaceBullesTel', '8', undefined, true));
    await page.waitForTimeout(200);
    p = await pile(page);
    verifier(proche(p.dessus, 8) && proche(p.entre, 8), 'téléphone : son réglage à 8 px ' + JSON.stringify(p));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
