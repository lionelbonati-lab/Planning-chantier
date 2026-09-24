const { chromium } = require('playwright');

// Lionel (24.09.2026) : « Le changement de semaine en suivant gauche/droite
// ne fonctionne pas sur ordinateur et tablettes, fonctionne sur mobile. »
// Reproduction : une tablette (largeur > 600px, donc enModeJourMobile
// toujours faux quel que soit vueJourMobile, cf. matchMedia dans
// construireGrille) avec un ECRAN TACTILE (hasTouch), en vue "1 semaine"
// normale (PAS le mode "1 jour" mobile). Le detecteur de swipe de bord
// (touchstart/touchmove/touchend sur .scroller) etait jusqu'ici
// entierement conditionne a enModeJourMobile -- donc inerte ici.

const SEED = function () {
  etat.aujourdhui = '2026-09-23'; // mercredi
  etat.semaines = genererSemaines(etat.aujourdhui, 2, 2);
  etat.indexSemaine = indexSemaineAujourdhui_();
  etat.chantiers = []; etat.statutsServeur = []; etat.feriesServeur = []; etat.categoriesFeriesServeur = [];
  etat.semaines.forEach(function (s) {
    var lundi = dateUTCDepuisIso_(s.debut);
    var isoDates = [], dates = [], mois = [];
    for (var j = 0; j < 5; j++) {
      var d = ajouterJoursUTC_(lundi, j);
      isoDates.push(isoDepuisDateUTC_(d)); dates.push(d.getUTCDate());
      mois.push(['', 'jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'][d.getUTCMonth() + 1]);
    }
    etat.cache[s.labG] = { labG: s.labG, personnes: [], taches: [], jalons: [null, null, null, null, null], notes: [[], [], [], [], []], isoDates: isoDates, dates: dates, mois: mois };
    etat.cacheTs[s.labG] = Date.now();
  });
  vueJourMobile = false; // vue "1 semaine" -- pas le mode "1 jour" mobile
  construireVueDepuisCache();
  render(false);
};

async function simulerSwipe(page, startX, endX, y) {
  await page.evaluate(([sx, sy]) => {
    var el = document.querySelector('.scroller');
    var t = new Touch({ identifier: 1, target: el, clientX: sx, clientY: sy });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
  }, [startX, y]);
  await page.waitForTimeout(30);
  var steps = 6;
  for (var i = 1; i <= steps; i++) {
    var x = startX + (endX - startX) * (i / steps);
    await page.evaluate(([cx, cy]) => {
      var el = document.querySelector('.scroller');
      var t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    }, [x, y]);
    await page.waitForTimeout(15);
  }
  await page.evaluate(([ex, ey]) => {
    var el = document.querySelector('.scroller');
    var t = new Touch({ identifier: 1, target: el, clientX: ex, clientY: ey });
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true }));
  }, [endX, y]);
  await page.waitForTimeout(150);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const erreurs = [];
  const page = await browser.newPage({ viewport: { width: 820, height: 1100 }, hasTouch: true }); // tablette (iPad-like), tactile
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  page.on('console', (msg) => { if (msg.type() === 'error') erreurs.push('console: ' + msg.text()); });
  await page.goto('file:///home/claude/work/testenv/index.html');
  await page.waitForTimeout(200);
  await page.evaluate(SEED);
  await page.waitForTimeout(150);

  const avant = await page.evaluate(() => ({
    indexSemaine: etat.indexSemaine, semaineNum: etat.semaines[etat.indexSemaine].num,
    scrollLeft: document.querySelector('.scroller').scrollLeft,
    maxScroll: document.querySelector('.scroller').scrollWidth - document.querySelector('.scroller').clientWidth,
  }));
  console.log('AVANT (sem.', avant.semaineNum, '), maxScroll =', avant.maxScroll, JSON.stringify(avant));

  await page.evaluate(() => { var el = document.querySelector('.scroller'); el.scrollLeft = el.scrollWidth - el.clientWidth; });
  await simulerSwipe(page, 700, 100, 400); // swipe vers la gauche, au bord de fin
  const apres = await page.evaluate(() => ({
    indexSemaine: etat.indexSemaine, semaineNum: etat.semaines[etat.indexSemaine].num,
    scrollLeft: document.querySelector('.scroller').scrollLeft,
  }));
  console.log('APRES swipe au bord (tablette, vue 1 semaine) -- doit passer semaine suivante :', JSON.stringify(apres));
  console.log('  -> semaine changee ?', apres.indexSemaine !== avant.indexSemaine);

  console.log('ERREURS JS:', JSON.stringify(erreurs, null, 2));
  await browser.close();
})();
