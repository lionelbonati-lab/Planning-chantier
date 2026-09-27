const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 72). Lionel :
//   « Essaie d'améliorer la fluidité du passage d'un jour à l'autre sur
//     mobile, l'effet me plaît mais ça lag un peu sur mobile. La partie
//     en-tête avec les notes et jalons ne suis pas toujours le planning
//     (petit décalage). J'aimerai un effet similaire sur ordinateur lors du
//     passage d'une semaine à l'autre. »
// Vérifie :
//   1. téléphone, vue 1 jour, balayage au doigt : à chaque image, l'en-tête
//      des jours au même pixel entier que la grille (colonne du jour dans
//      l'en-tête et dans la grille alignées) ;
//   2. téléphone : jour posé au bord de la fenêtre de 2 semaines → le
//      recentrage (re-rendu de la grille) n'a plus lieu dans l'image
//      d'arrivée du glissement, mais juste après ; jour et mois justes ;
//   3. ordinateur, › : glissement de semaine (View Transitions) — ancienne
//      semaine qui sort à gauche, nouvelle qui entre par la droite, colonne
//      des noms fixe ; tout est rangé à la fin ;
//   4. ordinateur, ‹ : sens inverse ; 2 clics rapides : 2 semaines plus
//      loin, rien qui traîne ;
//   5. « réduire les animations », vue 1 jour du téléphone : pas de
//      glissement de semaine, rendu immédiat.
//
// Lancer : node test_suite72.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const TACHES = [T(1, 2, '2026-09-25', 'matin', 'A'), T(2, 2, '2026-09-25', 'matin', 'B'), T(3, 1, '2026-09-24', 'matin', 'Jeudi')];

let horloge = Date.parse('2026-09-24T10:00:00');
async function balayer(page, de, dx, n, attente) {
  horloge += 1000;
  await page.clock.setFixedTime(new Date(horloge));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
  for (let i = 1; i <= n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + dx * i / n, y: de.y }] });
    await page.waitForTimeout(attente);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const caseVide = (page) => page.evaluate(() => {
  const sc = document.querySelector('.scroller').getBoundingClientRect();
  const c = [...document.querySelectorAll('.cell[data-kind="personne"]')].find((x) => {
    const r = x.getBoundingClientRect();
    return r.left >= sc.left + 120 && r.right <= sc.right + 5 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === x;
  });
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
// Journal : à chaque événement "scroll" de la grille ET à chaque image,
// écart entre la colonne d'un jour dans l'en-tête et la même colonne dans
// la grille (cases matin), et les 2 scrollLeft.
const journaliserAlignement = (page) => page.evaluate(() => {
  window.__al = [];
  const sc = document.querySelector('#racine .scroller'), en = document.querySelector('#racine .entete-planning-scroll');
  const note = (ou) => {
    const ths = [...document.querySelectorAll('#racine .entete-planning-figee .th[data-gi]')];
    let pire = 0;
    for (const th of ths) {
      const c = sc.querySelector('.cell[data-kind="personne"][data-jour="' + th.dataset.gi + '"][data-demi="matin"]');
      if (c) pire = Math.max(pire, Math.abs(th.getBoundingClientRect().left - c.getBoundingClientRect().left));
    }
    window.__al.push({ ou, g: sc.scrollLeft, e: en.scrollLeft, pire });
  };
  sc.addEventListener('scroll', () => note('scroll'));
  let fin = performance.now() + 2500;
  const f = () => { note('image'); if (performance.now() < fin) requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
// Glissement de semaine en cours : pseudo-éléments animés et position
// horizontale (translateX) de l'ancienne et de la nouvelle photo.
// Attend que le glissement soit parti depuis ~110 ms (la semaine suivante
// peut d'abord être chargée : la photo d'avant n'est prise qu'ensuite).
const etatGlissement = (page) => page.evaluate(async () => {
  const html = document.documentElement;
  const t0 = performance.now();
  for (;;) {
    const a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::view-transition-new(semaine)');
    if (a && a.currentTime >= 110) break;
    if (performance.now() - t0 > 3000) break;
    await new Promise((ok) => requestAnimationFrame(ok));
  }
  const tx = (ps) => { const t = getComputedStyle(html, ps).transform; const m = /matrix\(([^)]+)\)/.exec(t); return m ? Math.round(+m[1].split(',')[4]) : (t === 'none' ? 0 : null); };
  const pseudos = document.getAnimations().map((a) => a.effect && a.effect.pseudoElement).filter(Boolean);
  const lbl = document.querySelector('#racine .lbl[data-vt="p1"]');
  return {
    classe: html.classList.contains('vt-semaine'),
    pseudos,
    vieille: tx('::view-transition-old(semaine)'), nouvelle: tx('::view-transition-new(semaine)'),
    groupeNom: tx('::view-transition-group(vt-p1)'), lblGauche: lbl ? Math.round(lbl.getBoundingClientRect().left) : null,
    dir: html.style.getPropertyValue('--vt-dir'), pas: parseFloat(html.style.getPropertyValue('--vt-pas'))
  };
});
const rangé = (page) => page.evaluate(() => !document.documentElement.classList.contains('vt-semaine')
  && !document.querySelector('[style*="view-transition-name"]') && document.getAnimations().every((a) => !(a.effect && /view-transition/.test(a.effect.pseudoElement || ''))));
const lundi = (page) => page.evaluate(() => isoDeGi(Math.min(...[...document.querySelectorAll('#racine .th[data-gi]')].map((t) => +t.dataset.gi))));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Téléphone : en-tête au pixel de la grille, image par image -------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(400);
    const de = await caseVide(page);
    await journaliserAlignement(page);
    await balayer(page, de, -150, 4, 10);
    await page.waitForTimeout(1000);
    await balayer(page, de, 150, 6, 30);
    await page.waitForTimeout(1000);
    const al = await page.evaluate(() => window.__al);
    const bouge = new Set(al.map((x) => x.g)).size;
    const decales = al.filter((x) => x.pire > 0.5 || x.e !== x.g || x.g !== Math.round(x.g));
    verifier(bouge > 10 && decales.length === 0,
      'balayages au doigt : ' + al.length + ' relevés sur ' + bouge + ' positions, en-tête toujours au même pixel entier que la grille (' + decales.length + ' décalés' + (decales.length ? ', ex. ' + JSON.stringify(decales.slice(0, 3)) : '') + ')');
    verifier(await page.evaluate(() => jourMobileIso) === '2026-09-24', 'aller-retour : revenu sur jeudi 24');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 2. Téléphone : recentrage après l'image d'arrivée --------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    // Mercredi 23 : fenêtre [semaine du 21, semaine du 28], 3e jour ;
    // mardi 22, 2e jour (bord) : sa pose recentre la fenêtre [14, 21].
    await page.evaluate(() => allerAuJour('2026-09-23')); await page.waitForTimeout(700);
    const fen0 = await page.evaluate(() => fenetreLabGs()[0]);
    await page.evaluate(() => {
      const sc = document.querySelector('#racine .scroller');
      window.__cale = null;
      // Écouteur posé après celui de l'appli : appelé juste après lui, dans
      // l'image d'arrivée. Avant la suite 72, la grille y était déjà
      // reconstruite (recentrage immédiat quand aucune hauteur ne glissait).
      sc.addEventListener('jour-cale', () => {
        window.__cale = { memeGrille: document.querySelector('#racine .scroller') === sc, attache: sc.isConnected };
      }, { once: true });
    });
    const de = await caseVide(page);
    await balayer(page, de, 150, 4, 10);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ cale: window.__cale, iso: jourMobileIso, fen: fenetreLabGs()[0], coin: document.querySelector('#racine .th.coin').textContent }));
    verifier(r.cale && r.cale.memeGrille && r.cale.attache,
      'mardi 22 (bord de la fenêtre) posé : la grille n\'est pas reconstruite dans l\'image d\'arrivée (' + JSON.stringify(r.cale) + ')');
    verifier(r.iso === '2026-09-22' && r.fen !== fen0 && /sept/i.test(r.coin),
      'puis fenêtre recentrée juste après, mardi 22 toujours affiché, « sept. » (' + r.iso + ', ' + fen0 + ' → ' + r.fen + ', ' + r.coin.trim() + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 3. et 4. Ordinateur : glissement de semaine ---------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(400);
    const l0 = await lundi(page);
    const lblAvant = await page.evaluate(() => Math.round(document.querySelector('#racine .lbl[data-vt="p1"]').getBoundingClientRect().left));
    await page.evaluate(() => document.getElementById('btnSemaineSuiv').click());
    let g = await etatGlissement(page);
    const attendus = ['::view-transition-old(semaine)', '::view-transition-new(semaine)', '::view-transition-group(vt-p1)', '::view-transition-group(vt-coin)'];
    verifier(attendus.every((p) => g.pseudos.includes(p)), '› : ancienne et nouvelle semaine animées, cases des noms à part (' + attendus.filter((p) => !g.pseudos.includes(p)).join(', ') + ')');
    verifier(g.dir === '1' && g.pas > 1000 && g.vieille < -20 && g.nouvelle > 20 && Math.abs(g.nouvelle - g.vieille - g.pas) <= 2,
      '› en cours : l\'ancienne semaine sort à gauche, la nouvelle entre par la droite, jointives (' + g.vieille + ' / ' + g.nouvelle + ', pas ' + g.pas + ')');
    verifier(g.groupeNom !== null && Math.abs(g.groupeNom - lblAvant) <= 1, '› en cours : la case « Personne 1 » ne bouge pas (' + g.groupeNom + ' / ' + lblAvant + ')');
    await page.waitForTimeout(600);
    const l1 = await lundi(page);
    verifier(l0 === '2026-09-21' && l1 === '2026-09-28' && await rangé(page), '› fini : semaine du 28, classe et noms retirés (' + l0 + ' → ' + l1 + ')');

    await page.evaluate(() => document.getElementById('btnSemainePrec').click());
    g = await etatGlissement(page);
    verifier(g.dir === '-1' && g.vieille > 20 && g.nouvelle < -20, '‹ en cours : sens inverse, l\'ancienne sort à droite (' + g.vieille + ' / ' + g.nouvelle + ')');
    await page.waitForTimeout(600);
    verifier(await lundi(page) === '2026-09-21' && await rangé(page), '‹ fini : retour semaine du 21, rien qui traîne');

    await page.evaluate(() => { document.getElementById('btnSemaineSuiv').click(); setTimeout(() => document.getElementById('btnSemaineSuiv').click(), 60); });
    await page.waitForTimeout(900);
    const l2 = await lundi(page);
    verifier(l2 === '2026-10-05' && await rangé(page), '› › rapides : 2 semaines plus loin (' + l2 + '), rien qui traîne');
    const clic = await page.evaluate(() => { const c = document.querySelector('#racine .cell[data-kind="personne"]'); const r = c.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === c; });
    verifier(clic, 'après le glissement : les cases de la grille reçoivent de nouveau le pointeur');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 5. Réduire les animations ; vue 1 jour du téléphone -----------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: { personnes: PERS, taches: TACHES } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { document.getElementById('btnSemaineSuiv').click(); return document.documentElement.classList.contains('vt-semaine'); });
    await page.waitForTimeout(200);
    verifier(!r && await lundi(page) === '2026-09-28' && await rangé(page), '« réduire les animations » : semaine suivante affichée sans glissement');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { naviguerSemaine(1); return document.documentElement.classList.contains('vt-semaine'); });
    await page.waitForTimeout(500);
    verifier(!r && await page.evaluate(() => jourMobileIso) === '2026-10-01' && await rangé(page), 'téléphone, vue 1 jour : semaine suivante sans glissement de semaine (le jour glisse déjà) — jeudi 1er');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
