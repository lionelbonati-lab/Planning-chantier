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
// Round du 28.09.2026 (suite 89) — Lionel : « balayage depuis côté droit
// avance une semaine, depuis côté gauche recule une semaine. défilement au
// centre ». Le geste part donc de la bande du bord droit (790 px) ou du
// bord gauche (30 px) ; parti du centre, il ne fait que défiler, même en
// butée.
//
// Round du 29.09.2026 (suite 121) — Lionel : « sur tablette quand je veux
// défiler gauche/droite, ça me change les pages involontairement » ; règle
// retenue : « glisser sur le vide = défiler, jamais autre chose ». Le
// balayage au doigt ne change plus jamais de semaine (bords compris) : ce
// test vérifie désormais qu'il la garde.
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
  await glisserDoigt(page, 500, 100, 400);
  const centre = await etatVue();
  verifier(centre.index === avant.index, 'parti du centre, même en butée de fin : pas de changement de semaine (' + avant.index + ' → ' + centre.index + ')');
  await glisserDoigt(page, 790, 100, 400);
  const apres = await etatVue();
  verifier(apres.index === avant.index, 'glisser vers la gauche depuis le bord droit : même semaine (suite 121) (' + avant.index + ' → ' + apres.index + ')');

  await page.evaluate(() => { document.querySelector('.scroller').scrollLeft = 0; });
  await glisserDoigt(page, 30, 700, 400);
  const retour = await etatVue();
  verifier(retour.index === avant.index, 'glisser vers la droite depuis le bord gauche : même semaine (suite 121) (' + apres.index + ' → ' + retour.index + ')');

  await browser.close();
  process.exit(bilan(erreurs));
})();
