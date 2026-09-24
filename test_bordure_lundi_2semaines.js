const { chromium } = require('playwright');

// Round du 24.09.2026 — Lionel : « En mode 2 semaines, j'ai une mauvaise
// bordure au niveau du lundi midi. » Repro : en mode compact (modeCompact
// est une constante = true, cf. core.js), chaque jour d'une ligne
// Personnel/Intervenants est rendu en 2 CELLULES DOM cote a cote (matin +
// aprem, ligneGroupePersonnesCompact) — creerCell() y pose la classe
// "sem-frontiere" (bordure de FRONTIERE DE SEMAINE, .cell.sem-frontiere en
// border-left) uniquement a partir de `gi` (index de jour), sans jamais
// regarder `extra.demi`. Resultat : le 1er jour de la 2e semaine (gi=5)
// recoit "sem-frontiere" sur SES DEUX cellules (matin ET aprem) au lieu de
// la seule cellule du matin — la bordure de semaine, censee marquer la
// frontiere ENTRE Ven(gi4) et Lun(gi5), se retrouve dupliquee au milieu du
// lundi (entre ses colonnes matin/aprem), exactement le symptome decrit.
const SEED = function () {
  etat.aujourdhui = '2026-09-21'; // lundi
  etat.semaines = genererSemaines(etat.aujourdhui, 0, 1);
  etat.indexSemaine = indexSemaineAujourdhui_();
  etat.chantiers = []; etat.statutsServeur = []; etat.feriesServeur = []; etat.categoriesFeriesServeur = [];
  etat.semaines.slice(etat.indexSemaine, etat.indexSemaine + 2).forEach(function (s) {
    var lundi = dateUTCDepuisIso_(s.debut);
    var isoDates = [], dates = [], mois = [];
    for (var j = 0; j < 5; j++) {
      var d = ajouterJoursUTC_(lundi, j);
      isoDates.push(isoDepuisDateUTC_(d)); dates.push(d.getUTCDate());
      mois.push(['', 'jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'][d.getUTCMonth() + 1]);
    }
    etat.cache[s.labG] = {
      labG: s.labG, personnes: [], taches: [],
      jalons: [null, null, null, null, null],
      notes: [[], [], [], [], []],
      isoDates: isoDates, dates: dates, mois: mois,
    };
    etat.cacheTs[s.labG] = Date.now();
  });
  PERSONNES.push({ id: 'p0', nom: 'Personne Test', sousTraitant: false, actif: true, ordre: 0 });
  CHANTIERS['Chantier Test'] = { nom: 'Chantier Test', couleur: '#4a90d9', ligne: 1, actif: true };
  chantierParDefaut = 'Chantier Test';
  deuxSemaines = true;
  render(false);
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const erreurs = [];
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  await page.goto('file:///home/claude/work/testenv/index.html');
  await page.waitForTimeout(200);
  await page.evaluate(SEED);
  await page.waitForTimeout(150);

  const diag = await page.evaluate(() => {
    // gi=5 = lundi de la 2e semaine (1er jour non-weekend de la semaine 2).
    var matin = document.querySelector('.cell[data-kind="personne"][data-personne="p0"][data-jour="5"][data-demi="matin"]');
    var aprem = document.querySelector('.cell[data-kind="personne"][data-personne="p0"][data-jour="5"][data-demi="aprem"]');
    var jour0Matin = document.querySelector('.cell[data-kind="personne"][data-personne="p0"][data-jour="0"][data-demi="matin"]');
    var jour0Aprem = document.querySelector('.cell[data-kind="personne"][data-personne="p0"][data-jour="0"][data-demi="aprem"]');
    function info(el) {
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return {
        semFrontiere: el.classList.contains('sem-frontiere'),
        borderLeftWidth: getComputedStyle(el).borderLeftWidth,
        borderLeftColor: getComputedStyle(el).borderLeftColor,
        left: Math.round(r.left),
      };
    }
    return {
      matinGi5: info(matin), apremGi5: info(aprem),
      matinGi0: info(jour0Matin), apremGi0: info(jour0Aprem),
    };
  });
  console.log('Cellules lundi (gi=5, debut semaine 2) et lundi (gi=0, debut semaine 1) :', JSON.stringify(diag, null, 2));

  const bugPresent = diag.apremGi5 && diag.apremGi5.semFrontiere;
  console.log('BUG (aprem du lundi porte "sem-frontiere") present ?', bugPresent, '- attendu APRES correctif : false');
  console.log('Matin du lundi doit, lui, toujours porter "sem-frontiere" :', diag.matinGi5 && diag.matinGi5.semFrontiere, '- attendu : true');

  await page.screenshot({ path: 'shot_bordure_lundi_2semaines.png' });
  console.log('ERREURS JS:', JSON.stringify(erreurs, null, 2));
  await browser.close();
})();
