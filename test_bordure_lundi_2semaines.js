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
// Round du 26.09.2026 (suite 61) — Lionel : « Entre 2 semaines, il y a une
// bordure épaisse. A remplacer par un petite espace de quelque pixel. » La
// bordure de 3 px est remplacée par un espace de 8 px posé par-dessus la
// grille (.sep-semaines, js/grille-rendu.js) : on vérifie désormais que
// l'espace tombe au bord gauche du lundi MATIN, jamais au milieu du lundi.
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
      // Espace entre semaines (suite 61) dont le bord gauche du jour tombe
      // dans la bande : centre à ±4 px du bord de la cellule.
      var x = el.getBoundingClientRect().left;
      var espace = [].slice.call(document.querySelectorAll('.sep-semaines.sep-bas')).some(function (s) {
        if (s.hidden) return false;
        var r = s.getBoundingClientRect();
        return Math.abs((r.left + r.width / 2) - x) <= 4;
      });
      return { frontiere: el.classList.contains('sem-frontiere'), bordure: parseFloat(getComputedStyle(el).borderLeftWidth), espace: espace };
    }
    return { m5: info(5, 'matin'), a5: info(5, 'aprem'), m0: info(0, 'matin'), a0: info(0, 'aprem'), m3: info(3, 'matin') };
  });
  verifier(cellules.m5 && cellules.a5, '2 semaines affichées : les cellules du lundi de la 2e semaine existent');
  verifier(cellules.m5 && cellules.m5.frontiere && cellules.m5.espace, 'lundi 2e semaine, matin : espace de semaine à son bord gauche (' + JSON.stringify(cellules.m5) + ')');
  verifier(cellules.a5 && !cellules.a5.frontiere && !cellules.a5.espace && cellules.a5.bordure < 3, 'lundi 2e semaine, après-midi : PAS d\'espace ni de bordure de semaine au milieu du lundi (' + JSON.stringify(cellules.a5) + ')');
  verifier(cellules.a0 && !cellules.a0.frontiere && !cellules.a0.espace, 'lundi 1re semaine, après-midi : pas de séparation de semaine');
  verifier(cellules.m3 && !cellules.m3.frontiere && !cellules.m3.espace, 'jeudi : pas de séparation de semaine');

  await browser.close();
  process.exit(bilan(erreurs));
})();
