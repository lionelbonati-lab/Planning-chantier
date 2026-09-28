const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 42) — Lionel, captures du jeudi 01 et du
// mardi 22 (tâches d'un jour et demi) : « Lors d'un balayage à droite pour
// reculer d'un jour, la bulle ne fait que 1/2 journée avant fixation. […]
// Est-ce possible que pendant le balayage le bord droit s'accroche à la fin
// du jour où l'on se dirige pour faire une sorte de transition. »
// ajusterLargeurBullesJourMobile (js/grille-rendu.js) : pendant le geste,
// la carte passe de sa largeur du jour posé à celle du jour visé.
// Suite 91 (28.09.2026) — lignes de hauteur fixe : une bulle de plusieurs
// jours a une carte par jour couvert, chacune à la largeur de sa part,
// posées bout à bout (decouperBullesJourMobile_) ; plus rien ne change
// pendant le geste. Le bord droit « accroché à la fin du jour » vient de
// là : la carte du mercredi finit à la fin du mercredi.
//
// Lancer : node test_suite42.js

const PERSONNES = [1, 2, 3, 4].map((id) => ({ id, nom: 'P' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const TACHES = [
  // Mercredi entier + jeudi matin : s'élargit en reculant.
  T(1, 1, '2026-09-23', 'matin', 'Fermeture'), T(2, 1, '2026-09-23', 'aprem', 'Fermeture'), T(3, 1, '2026-09-24', 'matin', 'Fermeture'),
  // Mercredi après-midi + jeudi entier : rétrécit en reculant.
  T(4, 2, '2026-09-23', 'aprem', 'Decoffrage'), T(5, 2, '2026-09-24', 'matin', 'Decoffrage'), T(6, 2, '2026-09-24', 'aprem', 'Decoffrage'),
  // Jeudi après-midi + vendredi entier : s'élargit en avançant.
  T(7, 3, '2026-09-24', 'aprem', 'Montage'), T(8, 3, '2026-09-25', 'matin', 'Montage'), T(9, 3, '2026-09-25', 'aprem', 'Montage'),
  // Jeudi matin seul : sort de l'écran en reculant, largeur gardée.
  T(10, 4, '2026-09-24', 'matin', 'Seul')
];
// Suite 91 : l = largeur de la carte la plus visible (celle du jour posé),
// d = bord droit à l'écran de la dernière carte, parts = [gauche, droite]
// de chaque carte, dans l'ordre des jours.
const cartes = (page) => page.evaluate(() => {
  const rs = document.querySelector('.scroller').getBoundingClientRect(), o = {};
  document.querySelectorAll('.scroller .bulle').forEach((b) => {
    const rects = [...b.querySelectorAll(':scope > .b-carte')].map((c) => c.getBoundingClientRect());
    const vu = (r) => Math.min(r.right, rs.right) - Math.max(r.left, rs.left);
    const r = rects.reduce((a, x) => (vu(x) > vu(a) ? x : a));
    o[b.querySelector('.b-txt').textContent.trim()] = { l: Math.round(r.width), d: Math.round(Math.min(rects[rects.length - 1].right, rs.right)), bord: Math.round(rs.right),
      parts: rects.map((x) => [Math.round(x.left), Math.round(x.right)]) };
  });
  return o;
});
// Round du 27.09.2026 (suite 69) — CI de la PR #63 : « Montage […] (359/360,
// 280/360, 360/360) », mesure prise une image trop tôt sur une machine
// chargée. L'appli ajuste les cartes à l'image QUI SUIT l'événement
// "scroll" (planifierAjustLargeurBulles, rAF) : on attend donc cet
// événement (écouteur posé après celui de l'appli, donc appelé après lui),
// puis 2 images — plus un délai fixe qui peut tomber avant l'ajustement.
const aller = (page, s0, x) => page.evaluate(async ([s0, x]) => {
  const s = document.querySelector('.scroller');
  const cible = s0 + x;
  const defile = Math.round(s.scrollLeft) !== Math.round(cible) ? new Promise((ok) => {
    const t = setTimeout(ok, 500);
    s.addEventListener('scroll', () => { clearTimeout(t); ok(); }, { once: true });
  }) : Promise.resolve();
  s.scrollLeft = cible;
  await defile;
  await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
}, [s0, x]);
const poser = async (page) => {
  const s0 = await page.evaluate(() => {
    const s = document.querySelector('.scroller');
    s.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: s, clientX: 200, clientY: 400 })] }));
    s.style.scrollSnapType = 'none';
    return s.scrollLeft;
  });
  return s0;
};
const lever = (page) => page.evaluate(() => document.querySelector('.scroller').dispatchEvent(new TouchEvent('touchend', { touches: [] })));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // Recul jeudi → mercredi.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true, bd: { personnes: PERSONNES, taches: TACHES } });
    await page.waitForTimeout(400);
    const jour = await page.evaluate(() => document.querySelector('.th[data-gi]').getBoundingClientRect().width);
    let c = await cartes(page);
    const demi = c.Fermeture.l, plein = c.Decoffrage.l;
    verifier(Math.abs(demi - jour / 2) <= 2 && Math.abs(plein - jour) <= 2, 'jeudi posé : Fermeture demi-journée (' + demi + ' px), Decoffrage journée (' + plein + ' px)');
    const s0 = await poser(page);
    const suivi = [];
    for (const p of [0.2, 0.45, 0.7, 0.9]) {
      await aller(page, s0, -p * jour);
      await page.waitForTimeout(30);
      c = await cartes(page);
      suivi.push([p, c.Fermeture.parts, c.Decoffrage.d, c.Seul.parts[0][1] - c.Seul.parts[0][0]]);
    }
    // Suite 91 : carte du mercredi (journée) et carte du jeudi (matin) bout
    // à bout, largeurs inchangées d'un bout à l'autre du geste.
    verifier(suivi.every(([, pts]) => pts.length === 2 && Math.abs(pts[0][1] - pts[0][0] - jour) <= 2 && Math.abs(pts[1][1] - pts[1][0] - demi) <= 1 && Math.abs(pts[1][0] - pts[0][1]) <= 2),
      'Fermeture (mercredi entier) : carte du mercredi finie à la fin du mercredi, carte du jeudi à la suite, largeurs fixes — ' + suivi.map(([p, pts]) => Math.round(p * 100) + ' % : ' + pts.map((x) => x[1] - x[0]).join('+') + ' px').join(', '));
    verifier(suivi.filter(([p]) => p <= 0.45).every(([, , d]) => d >= c.Decoffrage.bord - 2),
      'Decoffrage (mercredi après-midi seulement) : couvre toujours l\'écran jusqu\'au bord droit tant que le jeudi en occupe la fin');
    verifier(suivi.every(([, , , l]) => l === demi), 'Seul (jeudi matin, absent du mercredi) : largeur gardée pendant le geste (' + suivi.map((x) => x[3]).join(', ') + ')');
    // Retour au jour de départ sans lever le doigt : largeurs d'origine.
    await aller(page, s0, 0);
    await page.waitForTimeout(30);
    c = await cartes(page);
    verifier(c.Fermeture.l === demi && c.Decoffrage.l === plein, 'retour au jeudi sans lever le doigt : largeurs d\'origine (' + c.Fermeture.l + ' / ' + c.Decoffrage.l + ')');
    await aller(page, s0, -jour);
    await lever(page);
    await page.waitForTimeout(700);
    c = await cartes(page);
    verifier(Math.abs(c.Fermeture.l - jour) <= 2 && Math.abs(c.Decoffrage.l - jour / 2) <= 2, 'mercredi posé : Fermeture journée (' + c.Fermeture.l + '), Decoffrage demi-journée (' + c.Decoffrage.l + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // Avance jeudi → vendredi.
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true, bd: { personnes: PERSONNES, taches: TACHES } });
    await page.waitForTimeout(400);
    const jour = await page.evaluate(() => document.querySelector('.th[data-gi]').getBoundingClientRect().width);
    const s0 = await poser(page);
    const suivi = [];
    for (const p of [0.2, 0.6, 0.9]) {
      await aller(page, s0, p * jour);
      await page.waitForTimeout(30);
      const c = await cartes(page);
      suivi.push([c.Montage.d, c.Montage.bord]);
    }
    verifier(suivi.every(([d, bord]) => d >= bord - 2), 'Montage (vendredi entier) : la carte va jusqu\'au bord droit pendant le geste (' + suivi.map((x) => x[0] + '/' + x[1]).join(', ') + ')');
    await aller(page, s0, jour);
    await lever(page);
    await page.waitForTimeout(700);
    const c = await cartes(page);
    verifier(Math.abs(c.Montage.l - jour) <= 2, 'vendredi posé : Montage journée (' + c.Montage.l + ' px)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
