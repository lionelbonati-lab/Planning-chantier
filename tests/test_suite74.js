const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 74). Lionel :
//   « On pourrait envisager une vue ou l'on voit le vendredi de la semaine
//     avant à gauche de l'écran et le lundi de la semaine suivante à droite,
//     coller au bord de l'écran comme si la suite était cachée en dehors de
//     l'écran. On retrouverai le petit espace entre les semaine. Les nom
//     seraient affiché que sur la partie centrale. »
// Ses choix : les noms « entre le vendredi et la semaine », et une option
// de la page Affichage, éteinte à l'origine. Vérifie, sur ordinateur :
//   1. éteinte à l'origine : 1 semaine chargée, vue normale ;
//   2. allumée (interrupteur de la page Affichage) : semaine d'avant et
//      d'après chargées ; à l'écran, de gauche à droite, un bord du
//      vendredi 18, la bande entre semaines, les noms, lundi 21 → vendredi
//      25, la bande, un bord du lundi 28, aussi large que celui du vendredi ;
//      case du mois : septembre seul ; rien du vendredi sous les noms ;
//   3. molette horizontale : semaine suivante, glissement où les 2 photos
//      ont chacune leur pas (l'ancienne jusqu'à ce que son vendredi arrive
//      dans le bord gauche) ; même disposition à l'arrivée, défilement tenu ;
//   4. une bulle glissée dans le bord gauche : posée le vendredi d'avant ;
//   5. fenêtre rétrécie : colonnes recalculées, bords toujours égaux ;
//   6. 2 semaines : 4 semaines chargées, bords autour des 2 (suite 82 : un
//      seul mode à la fois, 2 semaines sans bords) ;
//   7. téléphone : jamais (vue « 1 jour » normale) ; éteinte : 1 semaine.
// Round du 27.09.2026 (suite 75) — Lionel : « Pas de samedi-dimanche dans les
// semaines adjacentes. pas de bordure sur le bord de l'écran pour les
// semaines adjacentes. Ça doit être collé au bord de la fenêtre. » :
//   2b. planning de bord à bord de la fenêtre, sans bord ni coin arrondi
//       sur les côtés (la barre d'outils garde sa marge) ;
//   8. week-ends affichés : le vendredi 18 dans le bord gauche (pas le
//      dimanche 20), aucun samedi/dimanche des semaines voisines, ceux de
//      la semaine affichée présents ; glissement : l'ancienne photo va
//      jusqu'à mettre son vendredi (pas son dimanche) dans le bord gauche.
//
// Round du 28.09.2026 (suite 90) — Lionel, retour sur la suite 89 : « Je
// voulais que seule la première colonne et les séparations s'adaptent. Le
// planning glisse mais ne modifie pas ses hauteurs de ligne. » Le
// glissement de toute la semaine (View Transitions) est rétabli : ce test
// reprend ses vérifications d'avant la suite 89.
//
// Lancer : node test_suite74.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: ['Lionel', 'Mathis', 'Béton/Armature'][id - 1], sous_traitant: false, ordre: id, actif: true }));
const TACHES = [];
let id = 1;
const t = (p, d, texte) => { for (const demi of ['matin', 'aprem']) TACHES.push({ id: id++, personne_id: p, date: d, demi, ordre: 0, texte, est_absence: false, chantier_id: 1 }); };
t(1, '2026-09-17', 'Coffrage long'); t(1, '2026-09-18', 'Coffrage long'); t(1, '2026-09-21', 'Coffrage long'); t(1, '2026-09-22', 'Coffrage long');
t(2, '2026-09-18', 'Vendredi avant'); t(2, '2026-09-22', 'Mardi');
t(3, '2026-09-25', 'Ven'); t(3, '2026-09-28', 'Lundi après');
TACHES.push({ id: id++, personne_id: 2, date: '2026-09-19', demi: 'matin', ordre: 0, texte: 'Samedi 19', est_absence: false, chantier_id: 1 });
TACHES.push({ id: id++, personne_id: 2, date: '2026-09-26', demi: 'matin', ordre: 0, texte: 'Samedi 26', est_absence: false, chantier_id: 1 });

// Disposition à l'écran, dans le repère du .scroller.
const dispo = (page) => page.evaluate(() => {
  const sc = document.querySelector('.scroller'), rs = sc.getBoundingClientRect(), g = rs.left + sc.clientLeft;
  const th = (gi) => document.querySelector('.entete-planning-figee .th[data-gi="' + gi + '"]');
  const lbl = sc.querySelector('.lbl[data-vt]').getBoundingClientRect();
  const n = nbJoursAffiches();
  const ven = th(4).getBoundingClientRect(), lun = th(5).getBoundingClientRect(), lunS = th(n - 5).getBoundingClientRect();
  const seps = [...document.querySelectorAll('#racine > .sep-semaines.sep-bas')].filter((s) => !s.hidden).map((s) => Math.round(s.getBoundingClientRect().left - g));
  return {
    labs: fenetreLabGs().length, bords: document.querySelector('#racine').classList.contains('vue-bords'),
    venIso: isoDeGi(4), lunIso: isoDeGi(5), lunSIso: isoDeGi(n - 5),
    bordG: Math.round(ven.right - g), noms: Math.round(lbl.left - g), nomsD: Math.round(lbl.right - g),
    lundi: Math.round(lun.left - g), lundiS: Math.round(lunS.left - g), largeur: sc.clientWidth,
    bordD: Math.round(sc.clientWidth - (lunS.left - g)), seps, sl: sc.scrollLeft, jour: Math.round(lun.width), venL: Math.round(ven.left - g),
    coin: document.querySelector('.th.coin').textContent.trim()
  };
});
const carte = (page, texte) => page.evaluate((x) => {
  const b = [...document.querySelectorAll('.scroller .bulle[data-id]')].find((e) => e.querySelector('.b-txt') && e.querySelector('.b-txt').textContent === x);
  const r = b.querySelector('.b-carte').getBoundingClientRect();
  return { cx: r.left + Math.min(40, r.width / 2), cy: r.top + r.height / 2 };
}, texte);
const tache = (page, texte) => page.evaluate((x) => { const y = TACHES.find((z) => z.texte === x); return y ? isoDeGi(y.giDebut) + ' ' + (y.demiDebut || '-') : null; }, texte);
// Suite 79 : bouton de la barre d'outils. Suite 82 : bouton de vue unique
// (1 semaine > jours voisins > 2 semaines > 1 semaine) — allumer : 1 clic
// depuis « 1 semaine » ; éteindre : jusqu'à revenir sur « 1 semaine ».
const interrupteur = async (page) => {
  const mode = await page.evaluate(() => modeVueCourant());
  await page.click('#btnModeVue');
  await page.waitForTimeout(500);
  if (mode === 'bords') { await page.click('#btnModeVue'); await page.waitForTimeout(500); }
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 700 }, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(400);
    // --- 1. Éteinte à l'origine ---
    let d = await page.evaluate(() => ({ opt: vueBords ? 'oui' : 'non', labs: fenetreLabGs().length, bords: !!document.querySelector('.vue-bords') }));
    verifier(d.opt === 'non' && d.labs === 1 && !d.bords, 'éteinte à l\'origine : 1 semaine chargée, vue normale (' + JSON.stringify(d) + ')');

    // --- 2. Allumée ---
    await interrupteur(page);
    d = await dispo(page);
    // Suite 82 — « Jour voisins n'affichent qu'une demi journée. » : un jour
    // entier de chaque côté (le vendredi commence au bord de l'écran).
    const bordOk = (x) => Math.abs(x.bordG - x.jour) <= 3 && x.venL >= -1 && x.venL <= 3 && Math.abs(x.bordG - x.bordD) <= 3;
    verifier(d.labs === 3 && d.bords && d.venIso === '2026-09-18' && d.lunIso === '2026-09-21' && d.lunSIso === '2026-09-28',
      'allumée : semaine d\'avant et d\'après chargées (' + JSON.stringify(d) + ')');
    verifier(bordOk(d) && d.noms === d.bordG + 4 && d.lundi === d.nomsD + 1 && d.lundiS > d.lundi,
      'à l\'écran : bord du vendredi 18 (' + d.bordG + ' px), bande, noms, lundi 21 contre les noms, bord du lundi 28 (' + d.bordD + ' px)');
    verifier(d.seps.length === 2 && Math.abs(d.seps[0] - (d.bordG - 4)) <= 1 && Math.abs(d.seps[1] - (d.lundiS - 5)) <= 1,
      'bandes entre semaines : entre le vendredi et les noms, entre vendredi 25 et lundi 28 (' + JSON.stringify(d.seps) + ')');
    const cote = await page.evaluate(() => {
      const sc = document.querySelector('.scroller').getBoundingClientRect(), bar = document.querySelector('.toolbar, #legendeBarre').getBoundingClientRect();
      const st = (sel) => { const c = getComputedStyle(document.querySelector(sel)); return c.borderLeftWidth + ' ' + c.borderRightWidth + ' ' + c.borderTopLeftRadius + ' ' + c.borderBottomRightRadius; };
      return { g: Math.round(sc.left), d: Math.round(innerWidth - sc.right), barre: Math.round(bar.left), cadre: st('.grille-cadre'), entete: st('.entete-planning-scroll') };
    });
    verifier(cote.g === 0 && cote.d <= 1 && cote.barre > 0 && cote.cadre === '0px 0px 0px 0px' && cote.entete === '0px 0px 0px 0px',
      'collé aux bords de la fenêtre : ni marge, ni bord, ni coin arrondi sur les côtés ; la barre garde sa marge (' + JSON.stringify(cote) + ')');
    verifier(/sept/i.test(d.coin) && !/oct/i.test(d.coin), 'case du mois : septembre seul, pas le lundi 28 (« ' + d.coin + ' »)');
    const visibles = await page.evaluate(() => {
      const sc = document.querySelector('.scroller'), lbl = sc.querySelector('.lbl[data-vt="p1"]').getBoundingClientRect(), out = [];
      for (const b of sc.querySelectorAll('.bulle')) {
        const r = b.querySelector('.b-carte').getBoundingClientRect(), y = r.top + r.height / 2;
        for (let x = lbl.left + 2; x < lbl.right - 1; x += 6) { const e = document.elementFromPoint(x, y); if (e && e.closest('.bulle') === b) { out.push(b.textContent.trim()); break; } }
      }
      const g = [...sc.querySelectorAll('.bulle')].find((b) => b.textContent.includes('Vendredi avant')).querySelector('.b-carte').getBoundingClientRect();
      const e = document.elementFromPoint(sc.getBoundingClientRect().left + 10, g.top + g.height / 2);
      return { sousNoms: out, bordGauche: !!(e && e.closest('.bulle') && e.closest('.bulle').textContent.includes('Vendredi avant')) };
    });
    verifier(visibles.sousNoms.length === 0 && visibles.bordGauche, 'rien sous les noms ; « Vendredi avant » visible dans le bord gauche (' + JSON.stringify(visibles) + ')');
    verifier(await page.evaluate(() => { const sc = document.querySelector('.scroller'); const x = sc.scrollLeft; sc.scrollLeft = x - 200; return new Promise((ok) => setTimeout(() => ok(Math.abs(sc.scrollLeft - x) < 1), 100)); }),
      'défilement tenu : la grille revient d\'elle-même à sa place');

    // --- 3. Molette horizontale : semaine suivante, glissement ---
    const avant = d;
    const sc = await page.evaluate(() => { const r = document.querySelector('.scroller').getBoundingClientRect(); return { x: r.left + 400, y: r.top + 200 }; });
    await page.mouse.move(sc.x, sc.y);
    await page.mouse.wheel(120, 0);
    const vt = await page.evaluate(async () => {
      const t0 = performance.now(); let a;
      for (;;) { a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::view-transition-old(semaine)'); if (a || performance.now() - t0 > 3000) break; await new Promise((ok) => requestAnimationFrame(ok)); }
      if (!a) return null;
      const anims = document.getAnimations().filter((x) => x.effect && /view-transition/.test(x.effect.pseudoElement || ''));
      anims.forEach((x) => { x.pause(); x.currentTime = 340; });
      await new Promise((ok) => requestAnimationFrame(ok));
      const html = document.documentElement, tx = (ps) => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(html, ps).transform); return m ? Math.round(+m[1].split(',')[4]) : 0; };
      const r = { bords: html.classList.contains('vt-bords'), vieille: tx('::view-transition-old(semaine)'), nouvelle: tx('::view-transition-new(semaine)'),
        masque: getComputedStyle(html, '::view-transition-old(semaine)').maskImage || getComputedStyle(html, '::view-transition-old(semaine)').webkitMaskImage };
      anims.forEach((x) => x.play());
      return r;
    });
    await page.waitForTimeout(700);
    d = await dispo(page);
    // Pas attendu de l'ancienne photo : du bord du vendredi d'avant (bande
    // de gauche) à la bande de droite ; de la nouvelle : un lundi au suivant.
    const pasAncienne = avant.lundiS - (avant.bordG + 1), pasNouvelle = avant.lundiS - avant.lundi;
    verifier(vt && vt.bords && Math.abs(vt.vieille + pasAncienne) <= 2 && Math.abs(vt.nouvelle) <= 1 && /gradient/.test(vt.masque || ''),
      'glissement : l\'ancienne semaine va jusqu\'à mettre son vendredi dans le bord gauche (' + (vt && vt.vieille) + ' px, attendu ' + -pasAncienne + '), la nouvelle arrive à sa place (' + JSON.stringify(vt) + ')');
    verifier(d.lunIso === '2026-09-28' && d.venIso === '2026-09-25' && d.lunSIso === '2026-10-05' && bordOk(d) && d.lundi === avant.lundi && d.noms === avant.noms,
      'arrivée : bord du vendredi 25, noms, lundi 28 à la même place, bord du lundi 5 (' + JSON.stringify(d) + ')');
    verifier(pasNouvelle > 0 && await page.evaluate(() => !document.documentElement.classList.contains('vt-bords') && !document.documentElement.classList.contains('vt-semaine')), 'glissement rangé');
    await page.mouse.wheel(-120, 0);
    await page.waitForTimeout(900);
    d = await dispo(page);
    verifier(d.lunIso === '2026-09-21', 'molette dans l\'autre sens : retour au lundi 21 (' + d.lunIso + ')');

    // --- 4. Bulle glissée dans le bord gauche ---
    const de = await carte(page, 'Mardi');
    const vers = await page.evaluate(() => {
      const sc = document.querySelector('.scroller'), rs = sc.getBoundingClientRect();
      const c = sc.querySelector('.cell[data-kind="personne"][data-personne="2"][data-jour="4"][data-demi="aprem"]').getBoundingClientRect();
      return { cx: rs.left + 20, cy: c.top + c.height / 2 };
    });
    await page.mouse.move(de.cx, de.cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(de.cx + (vers.cx - de.cx) * i / 10, de.cy + (vers.cy - de.cy) * i / 10); await page.waitForTimeout(25); }
    await page.mouse.up();
    await page.waitForTimeout(500);
    d = await dispo(page);
    verifier(/^2026-09-18 /.test(await tache(page, 'Mardi')) && d.lunIso === '2026-09-21' && bordOk(d),
      'bulle glissée dans le bord gauche : posée le vendredi 18, rien n\'a défilé (' + await tache(page, 'Mardi') + ')');

    // --- 5. Fenêtre rétrécie ---
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForTimeout(700);
    d = await dispo(page);
    verifier(d.largeur === 1000 && bordOk(d) && d.noms === d.bordG + 4 && d.lundi === d.nomsD + 1 && d.lundiS + d.bordD === d.largeur,
      'fenêtre rétrécie à 1000 px : planning sur toute la largeur, colonnes recalculées, bords égaux (' + d.bordG + ' / ' + d.bordD + ')');

    // --- 6. 2 semaines ---
    await page.setViewportSize({ width: 1400, height: 700 });
    await page.waitForTimeout(500);
    // Suite 82 : un seul mode à la fois — « Jours voisins » puis « 2
    // semaines » au clic suivant, sans bords.
    await page.click('#btnModeVue');
    await page.waitForTimeout(900);
    const deux = await page.evaluate(() => ({ labs: fenetreLabGs().length, bords: document.querySelector('#racine').classList.contains('vue-bords'), deux: deuxSemaines, opt: vueBords ? 'oui' : 'non', n: nbJoursAffiches() }));
    verifier(deux.labs === 2 && !deux.bords && deux.deux && deux.opt === 'non' && deux.n === 10,
      '2 semaines : les 2 semaines seules, sans bords (' + JSON.stringify(deux) + ')');
    await page.click('#btnModeVue'); await page.waitForTimeout(700); // 1 semaine
    await page.click('#btnModeVue'); await page.waitForTimeout(900); // jours voisins

    // --- 8. Week-ends affichés ---
    await page.evaluate(() => changerOptionAffichage('weekends', 'oui'));
    await page.waitForTimeout(700);
    d = await dispo(page);
    const we = () => page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).display !== 'none'; };
      const ths = [...document.querySelectorAll('.entete-planning-figee .th.th-weekend[data-gi]')].filter(vis).map((e) => isoDeGi(+e.dataset.gi).slice(8));
      const bulles = [...document.querySelectorAll('.scroller .bulle')].filter(vis).map((b) => b.textContent.trim()).filter((x) => /^Samedi/.test(x));
      const n = nbJoursAffiches(), fin = document.querySelector('.entete-planning-figee .th[data-gi="' + (n - 6) + '"]').getBoundingClientRect();
      return { ths, bulles, finVen: Math.round(fin.right - document.querySelector('.scroller').getBoundingClientRect().left) };
    });
    let w = await we();
    verifier(d.venIso === '2026-09-18' && bordOk(d) && d.noms === d.bordG + 4 && d.lundi === d.nomsD + 1 && JSON.stringify(w.ths) === '["26","27"]' && JSON.stringify(w.bulles) === '["Samedi 26"]',
      'week-ends : vendredi 18 dans le bord gauche, samedi/dimanche seulement pour la semaine affichée (' + JSON.stringify({ d, w }) + ')');
    const avantWe = d, finVen = w.finVen;
    await page.mouse.move(sc.x, sc.y);
    await page.mouse.wheel(120, 0);
    const vtWe = await page.evaluate(async () => {
      const t0 = performance.now(); let a;
      for (;;) { a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::view-transition-old(semaine)'); if (a || performance.now() - t0 > 3000) break; await new Promise((ok) => requestAnimationFrame(ok)); }
      if (!a) return null;
      const anims = document.getAnimations().filter((x) => x.effect && /view-transition/.test(x.effect.pseudoElement || ''));
      anims.forEach((x) => { x.pause(); x.currentTime = 340; });
      await new Promise((ok) => requestAnimationFrame(ok));
      const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.documentElement, '::view-transition-old(semaine)').transform);
      anims.forEach((x) => x.play());
      return m ? Math.round(+m[1].split(',')[4]) : 0;
    });
    await page.waitForTimeout(800);
    d = await dispo(page); w = await we();
    verifier(vtWe !== null && Math.abs(vtWe + (finVen - avantWe.bordG)) <= 2,
      'week-ends, glissement : l\'ancienne semaine met son vendredi 25 (pas son dimanche) dans le bord gauche (' + vtWe + ' px, attendu ' + -(finVen - avantWe.bordG) + ')');
    verifier(d.venIso === '2026-09-25' && d.lunIso === '2026-09-28' && bordOk(d) && d.lundi === avantWe.lundi && JSON.stringify(w.ths) === '["03","04"]' && w.bulles.length === 0,
      'week-ends, arrivée : vendredi 25 au bord gauche, samedi 26 caché, week-end du 3-4 octobre seul (' + JSON.stringify({ d, w }) + ')');
    await page.mouse.wheel(-120, 0);
    await page.waitForTimeout(900);
    await page.evaluate(() => changerOptionAffichage('weekends', 'non'));
    await page.waitForTimeout(500);

    // --- 7b. Éteinte ---
    await interrupteur(page);
    d = await page.evaluate(() => ({ labs: fenetreLabGs().length, bords: !!document.querySelector('.vue-bords'), noms: getComputedStyle(document.querySelector('.lbl')).left }));
    verifier(d.labs === 1 && !d.bords && d.noms === '0px', 'éteinte : 1 semaine, noms au bord (' + JSON.stringify(d) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 7. Téléphone : jamais ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(400);
    // Suite 84 : plus d'option « bords », l'état de la session vueBords.
    await page.evaluate(() => { vueBords = true; assurerFenetreChargee(() => { construireVueDepuisCache(); render(false); }); });
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => ({ labs: fenetreLabGs().length, bords: !!document.querySelector('.vue-bords'), jour: modeJourMobileActif() }));
    verifier(d.labs === 2 && !d.bords && d.jour, 'téléphone, jours voisins allumés : vue « 1 jour » normale (' + JSON.stringify(d) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
