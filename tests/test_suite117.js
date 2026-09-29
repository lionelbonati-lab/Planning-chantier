const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 117). Lionel : « Continue avec replier les
// lignes et la largeur des jours ».
// Vérifie :
//   1. « 1 semaine » : glisser le bord droit du lundi de 100 px — un trait
//      suit le pointeur, le lundi s'élargit d'autant, les autres jours
//      rétrécissent, la bulle du lundi suit ; le jour n'est pas choisi ;
//      largeur retenue par l'appareil (tous les lundis) ;
//   2. double-clic sur ce bord : largeur par défaut ;
//   3. week-end : samedi élargi ;
//   4. jours voisins : lundi 1,5 fois plus large que mardi, semaine
//      entière à l'écran, vendredi d'avant et lundi d'après aux bords ;
//   5. téléphone (vue « 1 jour ») : pas de poignée.
//
// Lancer : node test_suite117.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const BD = () => ({ personnes: PERS, taches: [{ id: 1, personne_id: 1, date: '2026-09-21', demi: 'matin', ordre: 0, texte: 'Lundi', chantier_id: 1 }] });

const ths = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .entete-planning-figee .th[data-gi]:not(.th-demi)')]
  .map((t) => ({ iso: isoDeGi(+t.dataset.gi), w: Math.round(t.getBoundingClientRect().width), g: Math.round(t.getBoundingClientRect().left), d: Math.round(t.getBoundingClientRect().right) })));
const jour = (l, iso) => l.find((t) => t.iso === iso);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    const avant = await ths(page);
    const lun0 = jour(avant, '2026-09-21'), mar0 = jour(avant, '2026-09-22');

    // --- 1. Glisser le bord du lundi ------------------------------------------------
    const pg = await page.evaluate(() => {
      const th = [...document.querySelectorAll('#racine .entete-planning-figee .th[data-gi]:not(.th-demi)')].find((t) => isoDeGi(+t.dataset.gi) === '2026-09-21');
      const r = th.querySelector('.poignee-jour').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(pg.x, pg.y);
    await page.mouse.down();
    for (let k = 1; k <= 5; k++) await page.mouse.move(pg.x + 20 * k, pg.y);
    const trait = await page.evaluate(() => { const t = document.querySelector('.trait-largeur-jour'); return t ? Math.round(t.getBoundingClientRect().left) : null; });
    await page.mouse.up();
    await page.waitForTimeout(400);
    let apres = await ths(page);
    const lun1 = jour(apres, '2026-09-21'), mar1 = jour(apres, '2026-09-22');
    const bulle = await page.evaluate(() => Math.round([...document.querySelectorAll('#racine .bulle')].find((b) => b.textContent.includes('Lundi')).getBoundingClientRect().width));
    const etat = await page.evaluate(() => ({ ls: localStorage.getItem('planning.largeursJours'), choisi: document.querySelectorAll('#racine .th.jour-choisi').length }));
    verifier(trait != null && Math.abs(trait - (lun0.d + 100)) <= 3, 'un trait suit le pointeur (' + trait + ' pour ' + (lun0.d + 100) + ')');
    verifier(Math.abs(lun1.w - (lun0.w + 100)) <= 4, 'lundi élargi de 100 px (' + lun0.w + ' → ' + lun1.w + ')');
    verifier(mar1.w < mar0.w - 15 && Math.abs(apres[apres.length - 1].d - avant[avant.length - 1].d) <= 2, 'les autres jours rétrécissent, la semaine garde sa largeur (' + mar0.w + ' → ' + mar1.w + ')');
    verifier(bulle > 60 && etat.choisi === 0, 'la bulle suit, le jour n\'est pas choisi (bulle ' + bulle + ' px, ' + etat.choisi + ')');
    verifier(/^\{"0":[\d.]+\}$/.test(etat.ls || ''), 'largeur retenue pour les lundis (' + etat.ls + ')');

    // --- 2. Double-clic : largeur par défaut ----------------------------------------------
    const pg2 = await page.evaluate(() => {
      const th = [...document.querySelectorAll('#racine .entete-planning-figee .th[data-gi]:not(.th-demi)')].find((t) => isoDeGi(+t.dataset.gi) === '2026-09-21');
      const r = th.querySelector('.poignee-jour').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.dblclick(pg2.x, pg2.y);
    await page.waitForTimeout(400);
    apres = await ths(page);
    const ls2 = await page.evaluate(() => localStorage.getItem('planning.largeursJours'));
    verifier(Math.abs(jour(apres, '2026-09-21').w - lun0.w) <= 1 && ls2 === '{}', 'double-clic : largeur par défaut (' + jour(apres, '2026-09-21').w + ', ' + ls2 + ')');

    // --- 3. Week-end ---------------------------------------------------------------------------
    await page.evaluate(() => { afficherWeekends = true; changerLargeurJour(5, 2); });
    await page.waitForTimeout(300);
    apres = await ths(page);
    const sam = jour(apres, '2026-09-26'), dim = jour(apres, '2026-09-27');
    verifier(sam && dim && Math.abs(sam.w - 92) <= 2 && Math.abs(dim.w - 46) <= 2, 'samedi élargi (92 px), dimanche 46 px (' + (sam && sam.w) + ', ' + (dim && dim.w) + ')');
    await page.evaluate(() => { afficherWeekends = false; changerLargeurJour(5, null); });

    // --- 4. Jours voisins ------------------------------------------------------------------------
    await page.evaluate(() => { changerLargeurJour(0, 1.5); basculerModeVue(); });
    await page.waitForTimeout(500);
    apres = await ths(page);
    const geo = await page.evaluate(() => {
      const sc = document.querySelector('#racine .scroller').getBoundingClientRect();
      const noms = document.querySelector('#racine .grille > [data-ligne="p1"]').getBoundingClientRect();
      return { gauche: Math.round(noms.right), droite: Math.round(sc.right), vue: vueBordsRendue_ };
    });
    const lunV = jour(apres, '2026-09-21'), marV = jour(apres, '2026-09-22'), venV = jour(apres, '2026-09-25'), lunApres = jour(apres, '2026-09-28');
    verifier(geo.vue && Math.abs(lunV.w / marV.w - 1.5) < 0.05, 'jours voisins : lundi 1,5 fois mardi (' + lunV.w + ' / ' + marV.w + ')');
    verifier(lunV.g >= geo.gauche - 1 && venV.d <= geo.droite && lunApres.g < geo.droite && lunApres.d >= geo.droite - 3,
      'jours voisins : semaine entière à l\'écran, lundi d\'après au bord droit ' + JSON.stringify({ geo, lunV, venV, lunApres }));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Téléphone ---------------------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    const n = await page.evaluate(() => document.querySelectorAll('.poignee-jour').length);
    verifier(n === 0, 'téléphone, vue « 1 jour » : pas de poignée (' + n + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
