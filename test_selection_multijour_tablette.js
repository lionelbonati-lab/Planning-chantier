const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, glisserDoigt } = require('./aide_tests');

// Non-régression du round du 24.09.2026 (détecteur tactile « glisser au bord
// → changer de semaine » étendu à toutes les vues, cf. js/grille-rendu.js) :
// sur tablette, une SÉLECTION glissée sur plusieurs jours (ex. lundi →
// vendredi pour poser une tâche sur la semaine) est un geste très
// horizontal qui dépasse facilement le seuil de 46 px, alors que la semaine
// entière tient à l'écran (défilement à la butée des deux côtés). Sans
// garde-fou, ce geste changeait AUSSI de semaine au relâchement.
// Le garde-fou : body.en-glissement, posée par cablerAjoutCellule/
// onPointerDownGroupeSelection/cablerPoigneeRedim dès qu'un geste est
// reconnu comme sélection/redimensionnement/déplacement. Playwright ne
// rejoue pas le double canal PointerEvent + TouchEvent d'un vrai doigt :
// le test pose donc la classe comme le ferait une sélection en cours.
//
// Réécrit à la suite 24 (Lionel : « Réécrire les 4 tests périmés ») : vraie
// page + faux Supabase (aide_tests.js), vérifications explicites.
//
// Lancer : node test_selection_multijour_tablette.js

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1100 }, hasTouch: true });
  const { verifier, bilan } = verificateur();
  const index = () => page.evaluate(() => etat.indexSemaine);
  const auBordDeFin = () => page.evaluate(() => { var el = document.querySelector('.scroller'); el.scrollLeft = el.scrollWidth - el.clientWidth; });

  // 1. Sélection en cours pendant le geste : la semaine ne change pas.
  await auBordDeFin();
  await page.evaluate(() => document.body.classList.add('en-glissement'));
  const avant1 = await index();
  await glisserDoigt(page, 700, 100, 400);
  verifier(await index() === avant1, 'sélection multi-jours en cours : la semaine NE change PAS (' + avant1 + ' → ' + await index() + ')');
  await page.evaluate(() => document.body.classList.remove('en-glissement'));

  // 2. Même geste sans sélection (simple panoramique) : semaine suivante.
  await auBordDeFin();
  const avant2 = await index();
  await glisserDoigt(page, 700, 100, 400);
  verifier(await index() === avant2 + 1, 'sans sélection : le même geste passe à la semaine suivante (' + avant2 + ' → ' + await index() + ')');

  await browser.close();
  process.exit(bilan(erreurs));
})();
