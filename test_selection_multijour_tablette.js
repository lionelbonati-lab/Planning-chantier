const { chromium } = require('playwright');

// Non-regression pour le round du 24.09.2026 (generalisation du detecteur
// tactile "swipe de bord -> changement de semaine" a tous les modes, pas
// seulement "1 jour" mobile, cf. js/grille-rendu.js) : en vue "1
// semaine"/"2 semaines" tablette, une plage de selection glissee sur
// PLUSIEURS JOURS ENTIERS (ex. Lundi -> Vendredi pour poser une tache sur
// toute la semaine) est un geste tres largement horizontal qui peut
// depasser les 46px de seuilBordSemaine facilement, alors que maxScroll=0
// (les 5 jours tiennent deja a l'ecran) rend le detecteur "a la butee" en
// permanence des les deux cotes a la fois. Sans garde-fou, ce geste de
// selection tout a fait normal aurait AUSSI declenche un changement de
// semaine au relachement.
//
// Le garde-fou ajoute verifie document.body.classList.contains
// ("en-glissement") -- deja posee par cablerAjoutCellule/
// onPointerDownGroupeSelection/cablerPoigneeRedim des qu'un geste est
// reconnu comme une selection/un redimensionnement/un deplacement de bulle
// (jamais pour un simple panoramique). Playwright ne peut pas rejouer le
// VRAI double-canal PointerEvent+TouchEvent d'un doigt physique via de purs
// evenements synthetiques (meme limite documentee dans test_swipe_semaine.js) ;
// ce test verifie donc directement le garde-fou en posant/retirant cette
// classe comme le ferait cablerAjoutCellule en pleine selection, et confirme
// que le meme geste de bord (swipe) est bloque quand elle est presente et
// fonctionne normalement quand elle est absente.

const SEED = function () {
  etat.aujourdhui = '2026-09-23'; // mercredi
  etat.semaines = genererSemaines(etat.aujourdhui, 1, 1);
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
  vueJourMobile = false; // vue "1 semaine" tablette
  construireVueDepuisCache();
  render(false);
};

async function simulerSwipe(page, startX, endX, y) {
  await page.evaluate(([sx, sy]) => {
    var el = document.querySelector('.scroller');
    var t = new Touch({ identifier: 1, target: el, clientX: sx, clientY: sy });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
  }, [startX, y]);
  await page.waitForTimeout(20);
  var steps = 6;
  for (var i = 1; i <= steps; i++) {
    var x = startX + (endX - startX) * (i / steps);
    await page.evaluate(([cx, cy]) => {
      var el = document.querySelector('.scroller');
      var t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    }, [x, y]);
    await page.waitForTimeout(10);
  }
  await page.evaluate(([ex, ey]) => {
    var el = document.querySelector('.scroller');
    var t = new Touch({ identifier: 1, target: el, clientX: ex, clientY: ey });
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true }));
  }, [endX, y]);
  await page.waitForTimeout(80);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const erreurs = [];
  const page = await browser.newPage({ viewport: { width: 820, height: 1100 }, hasTouch: true });
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  page.on('console', (msg) => { if (msg.type() === 'error') erreurs.push('console: ' + msg.text()); });
  await page.goto('file:///home/claude/work/testenv/index.html');
  await page.waitForTimeout(200);
  await page.evaluate(SEED);
  await page.waitForTimeout(150);

  // Scenario 1 : "en-glissement" DEJA posee (comme pendant une selection
  // multi-jours en cours) -- le swipe de bord ne doit RIEN declencher.
  await page.evaluate(() => { var el = document.querySelector('.scroller'); el.scrollLeft = el.scrollWidth - el.clientWidth; document.body.classList.add('en-glissement'); });
  const avant1 = await page.evaluate(() => etat.indexSemaine);
  await simulerSwipe(page, 700, 100, 400);
  const apres1 = await page.evaluate(() => etat.indexSemaine);
  console.log('Scenario 1 (en-glissement actif pendant le swipe) -- semaine INCHANGEE attendue :', avant1, '->', apres1, '- ok ?', avant1 === apres1);
  await page.evaluate(() => document.body.classList.remove('en-glissement'));

  // Scenario 2 : meme swipe, mais SANS "en-glissement" (panoramique normal)
  // -- doit changer de semaine comme avant ce round.
  await page.evaluate(() => { var el = document.querySelector('.scroller'); el.scrollLeft = el.scrollWidth - el.clientWidth; });
  const avant2 = await page.evaluate(() => etat.indexSemaine);
  await simulerSwipe(page, 700, 100, 400);
  const apres2 = await page.evaluate(() => etat.indexSemaine);
  console.log('Scenario 2 (aucune selection en cours) -- semaine DOIT changer :', avant2, '->', apres2, '- ok ?', apres2 === avant2 + 1);

  console.log('ERREURS JS:', JSON.stringify(erreurs, null, 2));
  await browser.close();
})();
