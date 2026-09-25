const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, glisserDoigt } = require('./aide_tests');

// Lionel (24.09.2026) : « Le changement de semaine en suivant gauche/droite
// ne fonctionne pas sur ordinateur et tablettes, fonctionne sur mobile. »
// Tablette tactile (820 px, donc jamais le mode « 1 jour » téléphone), vue
// « 1 semaine » : le détecteur de glissement au bord (touchstart/touchmove/
// touchend sur .scroller, js/grille-rendu.js) n'agissait qu'en mode 1 jour.
// Au bord de fin, glisser vers la gauche passe à la semaine suivante ; au
// bord de début, glisser vers la droite revient à la précédente.
//
// Réécrit à la suite 24 (Lionel : « Réécrire les 4 tests périmés ») : vraie
// page + faux Supabase (aide_tests.js), vérifications explicites.
//
// Lancer : node test_swipe_tablette_1semaine.js

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1100 }, hasTouch: true });
  const { verifier, bilan } = verificateur();
  const etatVue = () => page.evaluate(() => ({ index: etat.indexSemaine, deux: deuxSemaines, jour: modeJourMobileActif() }));

  const avant = await etatVue();
  verifier(!avant.deux && !avant.jour, 'tablette : vue « 1 semaine », pas le mode 1 jour (' + JSON.stringify(avant) + ')');

  await page.evaluate(() => { var el = document.querySelector('.scroller'); el.scrollLeft = el.scrollWidth - el.clientWidth; });
  await glisserDoigt(page, 700, 100, 400);
  const apres = await etatVue();
  verifier(apres.index === avant.index + 1, 'glisser vers la gauche au bord de fin : semaine suivante (' + avant.index + ' → ' + apres.index + ')');

  await page.evaluate(() => { document.querySelector('.scroller').scrollLeft = 0; });
  await glisserDoigt(page, 100, 700, 400);
  const retour = await etatVue();
  verifier(retour.index === avant.index, 'glisser vers la droite au bord de début : retour à la semaine d\'origine (' + apres.index + ' → ' + retour.index + ')');

  await browser.close();
  process.exit(bilan(erreurs));
})();
