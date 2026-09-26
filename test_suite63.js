const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 63). Lionel :
//   « Le menu setting vient se placer à la place du menu principal en haut
//     de l'écran quand badge activé. Même format visuel que le menu
//     principal et même comportement. Une croix fermer pour refermer le
//     menu. »
// Vérifie :
//   1. ordinateur : la pastille remplace la rangée d'onglets par celle des
//      réglages (mêmes onglets, même taille), la croix prend la place de la
//      pastille ; onglet → page ; croix ou Échap → retour à la page quittée ;
//      la pastille rouvre la dernière page de réglages vue ;
//   2. fenêtre étroite : les onglets des réglages passent en icônes seules
//      comme la rangée principale, rien ne déborde ;
//   3. téléphone : même bascule dans la barre du bas (sélecteur « Réglages »,
//      croix à la place de la pastille) ;
//   4. plus de petit menu ni de rangée dans les pages de réglages.
//
// Lancer : node test_suite63.js

const REGLAGES = 'Mon compte|Affichage|Couleurs|Mise en page d’impression|Raccourcis clavier|Sauvegardes';
const presser = async (page, touche) => { await page.keyboard.press(touche); await page.waitForTimeout(150); };
const etat = (page) => page.evaluate(() => {
  const vis = (e) => !!e && e.offsetWidth > 0 && getComputedStyle(e).visibility !== 'hidden';
  const listes = [...document.querySelectorAll('#ongletsNav .onglets-liste')].filter(vis);
  return {
    page: (document.querySelector('.page.actif') || { id: '' }).id.replace('page-', ''),
    rangee: listes.map((l) => [...l.querySelectorAll('.onglet')].map((b) => b.textContent.trim() || b.title).join('|')).join(' / '),
    actif: listes.map((l) => (l.querySelector('.onglet.actif') || { dataset: {} }).dataset.page).join(),
    pastille: vis(document.getElementById('lienDeconnexionNav')),
    croix: vis(document.getElementById('btnFermerReglages')),
    pastilleBas: vis(document.getElementById('lienDeconnexionNavBas')),
    croixBas: vis(document.getElementById('btnFermerReglagesBas')),
    switcher: document.getElementById('switcherNom').textContent,
    deborde: document.documentElement.scrollWidth > innerWidth + 1
  };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Ordinateur ----------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 } });
    const e0 = await etat(page);
    verifier(e0.page === 'planning' && /^Planning\|Jalons/.test(e0.rangee) && e0.pastille && !e0.croix, 'au départ : rangée principale et pastille, pas de croix (' + e0.rangee + ')');
    const dimsPrincipal = await page.evaluate(() => { const b = document.querySelector('#ongletsNav .onglet.actif'), r = b.getBoundingClientRect(), s = getComputedStyle(b);
      return [Math.round(r.height), s.fontSize, s.fontWeight, s.borderRadius, s.backgroundColor, s.color].join(); });
    const hNav0 = await page.evaluate(() => document.getElementById('ongletsNav').getBoundingClientRect().height);

    await page.click('#lienDeconnexionNav'); await page.waitForTimeout(200);
    const e1 = await etat(page);
    verifier(e1.page === 'compte' && e1.rangee === REGLAGES && e1.actif === 'compte' && !e1.pastille && e1.croix,
      'pastille → la rangée des réglages remplace la rangée principale, « Mon compte » ouvert, croix à la place de la pastille (' + JSON.stringify(e1) + ')');
    const dimsReglage = await page.evaluate(() => { const b = document.querySelector('#ongletsReglages .onglet.actif'), r = b.getBoundingClientRect(), s = getComputedStyle(b);
      return [Math.round(r.height), s.fontSize, s.fontWeight, s.borderRadius, s.backgroundColor, s.color].join(); });
    const hNav1 = await page.evaluate(() => document.getElementById('ongletsNav').getBoundingClientRect().height);
    verifier(dimsReglage === dimsPrincipal && Math.abs(hNav1 - hNav0) < 0.5, 'même format que la rangée principale (' + dimsReglage + ' / ' + dimsPrincipal + ', barre ' + hNav0 + '→' + hNav1 + ')');
    const croix = await page.evaluate(() => { const c = document.getElementById('btnFermerReglages').getBoundingClientRect(), n = document.getElementById('ongletsNav').getBoundingClientRect();
      return { taille: Math.round(c.width) + 'x' + Math.round(c.height), droite: Math.round(n.right - c.right), label: document.getElementById('btnFermerReglages').getAttribute('aria-label') }; });
    verifier(croix.taille === '28x28' && croix.droite <= 14 && croix.label === 'Fermer les réglages', 'croix ronde en bout de barre, à la place de la pastille (' + JSON.stringify(croix) + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s63-reglages-1400.png' });

    await page.click('#ongletsReglages .onglet[data-page="affichage"]'); await page.waitForTimeout(200);
    const e2 = await etat(page);
    verifier(e2.page === 'affichage' && e2.actif === 'affichage' && e2.croix, 'onglet « Affichage » → sa page, onglet teinté (' + e2.page + ')');
    const rangeesPages = await page.evaluate(() => document.querySelectorAll('.reglages-nav, #menuCompte').length);
    verifier(rangeesPages === 0, 'plus de rangée dans les pages ni de petit menu (' + rangeesPages + ')');

    await page.click('#btnFermerReglages'); await page.waitForTimeout(200);
    const e3 = await etat(page);
    verifier(e3.page === 'planning' && /^Planning\|Jalons/.test(e3.rangee) && e3.actif === 'planning' && e3.pastille && !e3.croix, 'croix → retour au planning, rangée principale et pastille (' + JSON.stringify(e3) + ')');

    // Depuis Jalons : la pastille rouvre Affichage (dernière vue), Échap ramène à Jalons.
    await page.click('#ongletsNav .onglet[data-page="jalons"]'); await page.waitForTimeout(200);
    await page.click('#lienDeconnexionNav'); await page.waitForTimeout(200);
    const e4 = await etat(page);
    verifier(e4.page === 'affichage' && e4.actif === 'affichage', 'la pastille rouvre la dernière page de réglages vue (' + e4.page + ')');
    await page.click('#ongletsReglages .onglet[data-page="compte"]'); await page.waitForTimeout(200);
    await page.focus('#compteNom').catch(() => {});
    const champ = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    await presser(page, 'Escape');
    const e5 = await etat(page);
    verifier(champ !== 'INPUT' || e5.page === 'compte', 'Échap dans un champ : les réglages restent ouverts (' + champ + ', ' + e5.page + ')');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await presser(page, 'Escape');
    const e6 = await etat(page);
    verifier(e6.page === 'jalons' && e6.actif === 'jalons' && e6.pastille && !e6.croix, 'Échap → retour à Jalons, la page quittée (' + e6.page + ')');

    // Raccourci / impression : afficherPage d'une page de réglages bascule aussi la barre.
    await page.evaluate(() => afficherPage('mise-en-page')); await page.waitForTimeout(200);
    const e7 = await etat(page);
    verifier(e7.page === 'mise-en-page' && e7.actif === 'mise-en-page' && e7.croix, 'ouverture directe de « Mise en page d’impression » : barre des réglages (' + e7.actif + ')');
    await page.click('#btnFermerReglages'); await page.waitForTimeout(200);
    verifier((await etat(page)).page === 'jalons', 'puis croix → Jalons');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Fenêtre étroite : icônes seules, sans débordement --------------
  for (const largeur of [700, 1024]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 800 } });
    await page.click('#lienDeconnexionNav'); await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const l = document.getElementById('ongletsReglages'), c = document.getElementById('btnFermerReglages').getBoundingClientRect();
      return { compacts: document.getElementById('ongletsNav').classList.contains('onglets-compacts'),
        tient: l.scrollWidth <= l.clientWidth + 1, croixDedans: c.right <= innerWidth && c.width > 0,
        noms: [...l.querySelectorAll('.onglet-nom')].filter((n) => n.offsetWidth > 0).map((n) => n.textContent).join('|') };
    });
    const e = await etat(page);
    verifier(r.tient && r.croixDedans && !e.deborde && (!r.compacts || r.noms === 'Mon compte'),
      largeur + ' px : les onglets des réglages tiennent (icônes seules si besoin, l\'onglet actif garde son nom), croix visible (' + JSON.stringify(r) + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s63-reglages-' + largeur + '.png' });
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone : barre du bas ----------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    const e0 = await etat(page);
    verifier(e0.pastilleBas && !e0.croixBas && e0.switcher === 'Planning', 'téléphone : pastille en bas, pas de croix');
    await page.click('#lienDeconnexionNavBas'); await page.waitForTimeout(200);
    const e1 = await etat(page);
    verifier(e1.page === 'compte' && e1.switcher === 'Mon compte' && !e1.pastilleBas && e1.croixBas && !e1.deborde, 'pastille → Mon compte, la croix remplace la pastille (' + JSON.stringify(e1) + ')');
    await page.click('#switcherBtn'); await page.waitForTimeout(150);
    const liste = await page.evaluate(() => [...document.querySelectorAll('#switcherPanneau .switcher-titre, #switcherPanneau .switcher-item')].filter((e) => e.offsetWidth > 0)
      .map((e) => (e.classList.contains('actif') ? '*' : '') + e.textContent.trim()).join('|'));
    verifier(liste === 'Réglages|*' + REGLAGES, 'sélecteur du bas : la liste « Réglages » à la place de « Pages » (' + liste + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s63-telephone-liste.png' });
    await page.click('#switcherPanneau .switcher-item[data-page="couleurs"]'); await page.waitForTimeout(200);
    const e2 = await etat(page);
    verifier(e2.page === 'couleurs' && e2.switcher === 'Couleurs' && e2.croixBas, 'liste → Couleurs (' + e2.switcher + ')');
    if (process.env.CAPTURES) await page.screenshot({ path: process.env.CAPTURES + '/s63-telephone-couleurs.png' });
    await page.click('#btnFermerReglagesBas'); await page.waitForTimeout(200);
    const e3 = await etat(page);
    await page.click('#switcherBtn'); await page.waitForTimeout(150);
    const liste2 = await page.evaluate(() => [...document.querySelectorAll('#switcherPanneau .switcher-titre')].filter((e) => e.offsetWidth > 0).map((e) => e.textContent).join('|'));
    verifier(e3.page === 'planning' && e3.switcher === 'Planning' && e3.pastilleBas && !e3.croixBas && liste2 === 'Pages', 'croix du bas → retour au planning, liste « Pages » (' + liste2 + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
