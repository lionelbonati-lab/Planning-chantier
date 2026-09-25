const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 37) — retours de Lionel, capture de son
// téléphone à l'appui (lundi 28, vue « 1 jour ») :
//   1. « Mets à jour les actions GitHub vers Node 24. » :
//      .github/workflows/tests.yml (checkout@v6, setup-node@v6, Node 24) ;
//   2. « Les poignées doivent s'afficher uniquement quand on clic dessus. » :
//      poignées invisibles et inactives tant que la bulle n'est pas
//      sélectionnée, jamais sur une bulle hors du jour affiché (style.css,
//      #racine.vue-jour-mobile ; .hors-jour posée par
//      ajusterLargeurBullesJourMobile, js/grille-rendu.js) ;
//   3. « Recalculer le texte lors de la fixation du jour. » : pendant le
//      glissement, une carte affichée garde sa largeur (donc son texte),
//      une carte qui entre reçoit sa largeur finale ; tout est recalculé à
//      l'arrêt (figerHauteursJourMobile) ;
//   4. « Vérifie la largeur des bulles en mobile. » : cartes de tâches
//      bridées par max-width (216 px au lieu de 230 à 360 px de large), et
//      colonne du jour 3 px plus large que la zone visible.
//
// Lancer : node test_suite37.js

const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const TELEPHONE = { width: 390, height: 844 };
const LUNDI = '2026-09-28T10:00:00';

// Doigt réel (CDP) : appui bref (tap).
async function tap(page, a) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  await cdp.detach();
}
const bulle = (texte) => [...document.querySelectorAll('.bulle')].find((e) => e.textContent.includes(texte));
const carte = (page, texte) => page.evaluate(([x, src]) => {
  const b = eval(src)(x); const c = b.querySelector('.b-carte'); const r = c.getBoundingClientRect();
  return { g: r.left, d: r.right, l: r.width, x: r.left + r.width / 2, y: r.top + r.height / 2, cachee: c.style.display === 'none',
    styleL: c.style.width, maxL: getComputedStyle(c).maxWidth };
}, [texte, '(' + bulle + ')']);
const poignees = (page, texte) => page.evaluate(([x, src]) => {
  const b = eval(src)(x);
  return [...b.querySelectorAll('.poignee')].map((p) => {
    const r = p.getBoundingClientRect(), cs = getComputedStyle(p);
    const sous = cs.display === 'none' ? null : document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { affichee: cs.display !== 'none', opacite: +getComputedStyle(p, '::after').opacity, actif: cs.pointerEvents !== 'none', touchee: sous === p };
  });
}, [texte, '(' + bulle + ')']);
const fenetre = (page) => page.evaluate(() => {
  const s = document.querySelector('.scroller'), r = s.getBoundingClientRect();
  return { g: r.left + s.clientLeft + largeurNoms(), d: r.left + s.clientLeft + s.clientWidth };
});
const pres = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1 : tol);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Actions GitHub sur Node 24 ---
  {
    const wf = fs.readFileSync(path.join(__dirname, '.github/workflows/tests.yml'), 'utf8');
    verifier(/uses: actions\/checkout@v6\b/.test(wf) && /uses: actions\/setup-node@v6\b/.test(wf) && !/uses: .*@v4\b/.test(wf),
      'workflow : actions/checkout@v6 et actions/setup-node@v6 (Node 24), plus aucune action en v4');
    verifier(/node-version: 24\b/.test(wf), 'workflow : tests lancés sous Node 24');
  }

  // --- 2. Largeur des bulles en vue « 1 jour » (capture de Lionel) ---
  for (const vp of [{ width: 360, height: 800 }, TELEPHONE]) {
    const TACHES = [
      T(1, 1, '2026-09-28', 'matin', 'Décoffrage tours de dalle, et piliers'), T(2, 1, '2026-09-28', 'aprem', 'Décoffrage tours de dalle, et piliers'),
      T(3, 2, '2026-09-28', 'matin', 'Gabarits')
    ];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: vp, hasTouch: true, date: LUNDI,
      bd: { taches: TACHES, jalons: [{ id: 1, date: '2026-09-28', demi: null, texte: 'Murs BA étage' }], notes: [{ id: 1, date: '2026-09-28', demi: null, texte: '28jours Dalle BINE' }] } });
    await page.waitForTimeout(400);
    const f = await fenetre(page);
    const th = await page.evaluate(() => { const r = document.querySelector('.entete-planning-figee .th.today').getBoundingClientRect(); return { g: r.left, d: r.right }; });
    verifier(pres(th.g, f.g) && pres(th.d, f.d), vp.width + ' px : la colonne du lundi fait exactement la zone visible (' + Math.round(th.g) + '–' + Math.round(th.d) + ' pour ' + Math.round(f.g) + '–' + Math.round(f.d) + ')');
    const t = await carte(page, 'Décoffrage'), j = await carte(page, 'Murs BA'), n = await carte(page, '28jours');
    verifier(pres(t.g, f.g) && pres(t.d, f.d), vp.width + ' px : carte de tâche d\'un jour entier de bord à bord (' + Math.round(t.g) + '–' + Math.round(t.d) + ', max-width ' + t.maxL + ')');
    verifier(pres(t.l, j.l) && pres(t.l, n.l), vp.width + ' px : même largeur que le jalon et la note du jour (' + Math.round(t.l) + ' / ' + Math.round(j.l) + ' / ' + Math.round(n.l) + ')');
    const m = await carte(page, 'Gabarits');
    verifier(pres(m.g, f.g) && pres(m.l, (f.d - f.g - 1) / 2), vp.width + ' px : tâche du matin sur la case du matin (' + Math.round(m.l) + ' px)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Poignées affichées seulement sur la bulle sélectionnée ---
  {
    const TACHES = [
      T(1, 1, '2026-09-28', 'matin', 'Décoffrage'), T(2, 1, '2026-09-28', 'aprem', 'Décoffrage'),
      T(3, 2, '2026-09-28', 'matin', 'Gabarits'), T(4, 2, '2026-09-25', 'aprem', 'Vendredi')
    ];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: TELEPHONE, hasTouch: true, date: LUNDI,
      bd: { taches: TACHES, notes: [{ id: 1, date: '2026-09-28', demi: null, texte: 'Grue' }] } });
    await page.waitForTimeout(400);
    let p = await poignees(page, 'Décoffrage');
    verifier(p.length === 2 && p.every((x) => x.opacite === 0 && !x.actif && !x.touchee), 'avant sélection : poignées invisibles et inactives (' + JSON.stringify(p) + ')');
    const v = await poignees(page, 'Vendredi');
    verifier(v.every((x) => !x.affichee), 'bulle du vendredi (hors du jour affiché) : aucune poignée au bord de la colonne des noms');
    const n = await poignees(page, 'Grue');
    verifier(n.every((x) => x.opacite === 0 && !x.actif), 'note du jour non sélectionnée : poignées invisibles aussi');
    await tap(page, await carte(page, 'Décoffrage'));
    verifier(await page.evaluate(() => Object.keys(bullesSelectionnees).length === 1 && document.querySelector('.bulle.selectionnee').textContent.includes('Décoffrage')), 'tap sur la bulle : sélectionnée');
    p = await poignees(page, 'Décoffrage');
    verifier(p.every((x) => x.affichee && x.opacite > 0.3 && x.actif && x.touchee), 'bulle sélectionnée : ses 2 poignées apparaissent et répondent au doigt (' + JSON.stringify(p) + ')');
    const g = await poignees(page, 'Gabarits');
    verifier(g.every((x) => x.opacite === 0 && !x.actif && !x.touchee), 'l\'autre bulle, non sélectionnée : poignées toujours cachées');
    await tap(page, await carte(page, 'Décoffrage'));
    p = await poignees(page, 'Décoffrage');
    verifier(p.every((x) => x.opacite === 0 && !x.actif), 'nouveau tap (désélection) : poignées de nouveau cachées');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Texte recalculé à la fixation du jour, pas pendant le glissement ---
  {
    const TACHES = [
      T(1, 1, '2026-09-28', 'matin', 'Décoffrage'), T(2, 1, '2026-09-28', 'aprem', 'Décoffrage'),
      T(3, 1, '2026-09-29', 'matin', 'Décoffrage'), T(4, 1, '2026-09-29', 'aprem', 'Décoffrage'),
      T(5, 2, '2026-09-28', 'matin', 'Livraison armature murs étage'), T(6, 2, '2026-09-29', 'aprem', 'Gabarits et contrôle des niveaux dalle')
    ];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: TELEPHONE, hasTouch: true, date: LUNDI, bd: { taches: TACHES } });
    await page.waitForTimeout(400);
    const f = await fenetre(page);
    const jour = f.d - f.g + 1;
    const avant = { dec: await carte(page, 'Décoffrage'), liv: await carte(page, 'Livraison') };
    const s0 = await page.evaluate(() => {
      const s = document.querySelector('.scroller');
      s.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: s, clientX: 200, clientY: 400 })] }));
      s.style.scrollSnapType = 'none';
      return s.scrollLeft;
    });
    const aller = (fr) => page.evaluate(async ([s0, x]) => {
      document.querySelector('.scroller').scrollLeft = s0 + x;
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    }, [s0, fr * jour]);
    await aller(0.4);
    let liv = await carte(page, 'Livraison'), dec = await carte(page, 'Décoffrage');
    verifier(liv.styleL === avant.liv.styleL && !liv.cachee, 'doigt posé, 40 % du glissement : la carte du lundi matin garde sa largeur (' + liv.styleL + '), son texte ne se ré-enroule pas');
    verifier(dec.styleL === avant.dec.styleL, 'carte lundi → mardi : largeur inchangée pendant le geste (' + dec.styleL + ')');
    await aller(0.9);
    const gab = await carte(page, 'Gabarits');
    verifier(!gab.cachee && pres(gab.l, (jour - 2) / 2), 'carte du mardi après-midi qui entre : directement à sa largeur finale (' + Math.round(gab.l) + ' px), pas une lamelle qui grandit');
    await page.evaluate(async ([s0, x]) => {
      const s = document.querySelector('.scroller'); s.scrollLeft = s0 + x;
      s.dispatchEvent(new TouchEvent('touchend', { touches: [] }));
    }, [s0, jour]);
    await page.waitForTimeout(600);
    liv = await carte(page, 'Livraison'); dec = await carte(page, 'Décoffrage');
    const gab2 = await carte(page, 'Gabarits');
    // Suite 41 : la veille garde sa carte, prête hors écran (« faire les
    // calcul de texte et bulles sur le jour avant et après le jour affiché »).
    verifier(!liv.cachee && liv.d <= f.g - 1 && pres(liv.l, (jour - 2) / 2), 'mardi posé : la carte du lundi (veille) sort de l\'écran, gardée à sa largeur du lundi (' + Math.round(liv.l) + ' px)');
    verifier(pres(dec.g, f.g) && pres(dec.d, f.d) && pres(gab2.d, f.d) && pres(gab2.l, (jour - 2) / 2), 'mardi posé : largeurs recalculées pour le jour fixé (' + Math.round(dec.l) + ' / ' + Math.round(gab2.l) + ' px)');
    const pistes = await page.evaluate(() => document.querySelector('.scroller .grille').classList.contains('hauteurs-figees'));
    verifier(pistes, 'mardi posé : hauteurs de lignes refigées pour ce jour');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
