const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur } = require('./aide_tests');

// Round du 24.09.2026 — Lionel : « En mode 2 semaines, j'ai une mauvaise
// bordure au niveau du lundi midi. » Chaque jour d'une ligne de personne
// est rendu en 2 cellules côte à côte (matin + aprem) ; la classe
// "sem-frontiere" (bordure épaisse de début de semaine) était posée d'après
// le seul jour, donc sur LES DEUX cellules du lundi de la 2e semaine : la
// bordure réapparaissait au milieu du lundi. Seule la cellule du matin doit
// la porter.
//
// Réécrit à la suite 24 (Lionel : « Réécrire les 4 tests périmés ») : vraie
// page du dépôt + faux Supabase (aide_tests.js) au lieu d'un index.html de
// test local et d'un état fabriqué à la main.
//
// Lancer : node test_bordure_lundi_2semaines.js

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1600, height: 900 } });
  const { verifier, bilan } = verificateur();
  await page.evaluate(() => { if (!deuxSemaines) basculerDeuxSemaines(); });
  await page.waitForTimeout(300);

  const cellules = await page.evaluate(() => {
    function info(gi, demi) {
      var el = document.querySelector('.cell[data-kind="personne"][data-personne="1"][data-jour="' + gi + '"][data-demi="' + demi + '"]');
      if (!el) return null;
      return { frontiere: el.classList.contains('sem-frontiere'), bordure: parseFloat(getComputedStyle(el).borderLeftWidth) };
    }
    return { m5: info(5, 'matin'), a5: info(5, 'aprem'), m0: info(0, 'matin'), a0: info(0, 'aprem'), m3: info(3, 'matin') };
  });
  verifier(cellules.m5 && cellules.a5, '2 semaines affichées : les cellules du lundi de la 2e semaine existent');
  verifier(cellules.m5 && cellules.m5.frontiere && cellules.m5.bordure >= 3, 'lundi 2e semaine, matin : bordure de semaine (' + JSON.stringify(cellules.m5) + ')');
  verifier(cellules.a5 && !cellules.a5.frontiere && cellules.a5.bordure < 3, 'lundi 2e semaine, après-midi : PAS de bordure de semaine au milieu du lundi (' + JSON.stringify(cellules.a5) + ')');
  verifier(cellules.a0 && !cellules.a0.frontiere, 'lundi 1re semaine, après-midi : pas de bordure de semaine');
  verifier(cellules.m3 && !cellules.m3.frontiere, 'jeudi : pas de bordure de semaine');

  await browser.close();
  process.exit(bilan(erreurs));
})();
