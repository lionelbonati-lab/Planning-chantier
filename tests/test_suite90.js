const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 28.09.2026 (suite 90). Lionel, retour sur la suite 89 :
//   « "Changement de semaine : seules les dates de l'en-tête glissent. Le
//     quadrillage et les bulles ne sont plus animés, ils changent sur
//     place." Ce n'est pas ce que je voulais. Je voulais que seule la
//     première colonne et les séparations s'adaptent. Le planning glisse
//     mais ne modifie pas ses hauteurs de ligne. Étant donné qu'on a une
//     bordure entre chaque jour, un décalage de hauteur entre 2 jours n'est
//     pas grave car on ne le verra plus une fois aimanté. »
// Réponses : téléphone et ordinateur ; noms et séparations « Suivent le
// doigt » ; ordinateur : « Appliquer le nouveau principe ».
// Vérifie :
//   1. téléphone, vue 1 jour, doigt posé qui glisse : page photographiée
//      (View Transitions) — photos du jeudi et du vendredi jointives, qui
//      suivent le doigt ; la grille ne prend que 2 jeux de hauteurs (jeudi
//      puis vendredi), jamais de valeur intermédiaire ; case « Personne 2 »
//      et bande « Intervenants » entre leurs 2 places, au prorata du doigt ;
//   2. lâcher après 40 % : vendredi posé, tout rangé, hauteurs du vendredi ;
//   3. glissé lent de 15 % : retour au jeudi, ses hauteurs exactes ;
//   4. vers la droite : mercredi ; 1,6 jour sans lever le doigt : 2 jours ;
//   5. temps réel pendant la page : relecture remise après elle ;
//   6. « réduire les animations » : pas de photos (défilement réel) ;
//   7. ordinateur, › : toute la semaine glisse (photos), cases des noms et
//      bandes Personnel / Intervenants à part ; bande collée sous l'en-tête
//      toujours collée après ; un rendu ne ramène plus la page en haut.
//
// Lancer : node test_suite90.js

const PERS = [1, 2, 3, 4, 5].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: id > 3, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
// Jeudi 24 : une bulle (personne 1). Vendredi 25 : 3 bulles empilées pour
// la personne 2, 2 pour la personne 4 (lignes plus hautes, bande
// « Intervenants » plus bas).
const TACHES = [T(1, 1, '2026-09-24', 'matin', 'Jeudi'), T(2, 2, '2026-09-25', 'matin', 'A'), T(3, 2, '2026-09-25', 'matin', 'B'),
  T(4, 2, '2026-09-25', 'matin', 'C'), T(5, 4, '2026-09-25', 'matin', 'X'), T(6, 4, '2026-09-25', 'matin', 'Y')];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

let horloge = Date.parse('2026-09-24T10:00:00');
// Doigt posé, déplacé par pas, sans le lever (doigt.lever() à la fin).
async function poserDoigt(page, de) {
  horloge += 1000;
  await page.clock.setFixedTime(new Date(horloge));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
  let x = de.x;
  return {
    async aller(dx, n, attente) {
      const x0 = x;
      for (let i = 1; i <= n; i++) { x = x0 + dx * i / n; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: de.y }] }); await page.waitForTimeout(attente); }
    },
    async lever() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); }
  };
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
// État à l'écran : jour, lignes de la grille, cases et bande, et — pendant
// une page — position des photos et des groupes.
const etat = (page) => page.evaluate(() => {
  const html = document.documentElement, sc = document.querySelector('.scroller'), g = sc.querySelector('.grille');
  const tx = (ps) => { const t = getComputedStyle(html, ps).transform; const m = /matrix\(([^)]+)\)/.exec(t); return m ? Math.round(+m[1].split(',')[4]) : (t === 'none' ? 0 : null); };
  const ty = (ps) => { const t = getComputedStyle(html, ps).transform; const m = /matrix\(([^)]+)\)/.exec(t); return m ? Math.round(+m[1].split(',')[5]) : null; };
  const lbl2 = sc.querySelector('.lbl[data-vt="p2"]'), bande = sc.querySelector('.section-row-intervenants .section-row-sticky');
  const pg = pageJourEnCours;
  return {
    iso: jourMobileIso, x: sc.scrollLeft, page: !!pg, prog: pg ? Math.round(pg.prog * 100) / 100 : null,
    classe: html.classList.contains('vt-page'), rows: g.style.gridTemplateRows,
    h2: Math.round(lbl2.getBoundingClientRect().height), yBande: Math.round(bande.getBoundingClientRect().top),
    vieille: pg ? tx('::view-transition-old(semaine)') : null, nouvelle: pg ? tx('::view-transition-new(semaine)') : null,
    gh2: pg ? Math.round(parseFloat(getComputedStyle(html, '::view-transition-group(vt-p2)').height)) : null,
    gyBande: pg ? ty('::view-transition-group(vt-section-intervenants)') : null,
    enPause: pg && pg.anims ? pg.anims.every((a) => a.playState === 'paused') : null,
    noms: document.querySelectorAll('[style*="view-transition-name"]').length,
    calage: !!calageJourEnCours, snap: sc.style.scrollSnapType
  };
});
const range = (e) => !e.page && !e.classe && e.noms === 0 && !e.calage && e.snap === '';

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. à 3. Téléphone : page du jour au doigt ------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(600);
    const de = await caseVide(page);
    const e0 = await etat(page);
    // Hauteurs du vendredi, mesurées d'avance (veille/lendemain, suite 58).
    const rowsVendredi = await page.evaluate(() => {
      const sc = document.querySelector('.scroller'), R = reperesJour_(sc);
      return R[R.indexOf(Math.round(sc.scrollLeft)) + 1];
    });
    // Journal de la grille image par image : ses lignes ne doivent prendre
    // que 2 valeurs (jeudi, vendredi).
    await page.evaluate(() => {
      window.__rows = new Set(); window.__stop = false;
      const g = document.querySelector('.scroller .grille');
      const f = () => { window.__rows.add(g.style.gridTemplateRows); if (!window.__stop) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
    const d = await poserDoigt(page, de);
    await d.aller(-60, 4, 30);
    await page.waitForTimeout(150);
    const e1 = await etat(page);
    await d.aller(-60, 4, 30);
    await page.waitForTimeout(150);
    const e2 = await etat(page);
    const pas = e2.nouvelle - e2.vieille;
    verifier(e1.page && e1.classe && e1.enPause && e0.iso === '2026-09-24', 'doigt qui glisse : page photographiée, animations en pause (' + JSON.stringify({ page: e1.page, classe: e1.classe, pause: e1.enPause }) + ')');
    verifier(e1.prog > 0.1 && e2.prog > e1.prog + 0.1 && e2.vieille < e1.vieille && e2.nouvelle < e1.nouvelle,
      'les photos suivent le doigt (' + e1.prog + ' → ' + e2.prog + ' ; ancienne ' + e1.vieille + ' → ' + e2.vieille + ')');
    verifier(pas > 250 && Math.abs(e2.vieille + e2.prog * pas) <= 3, 'photos du jeudi et du vendredi jointives, décalées d\'un jour (' + e2.vieille + ' / ' + e2.nouvelle + ', pas ' + pas + ')');
    verifier(e2.x === rowsVendredi && e2.h2 > e0.h2 + 40, 'sous les photos, la grille est déjà sur le vendredi, à ses hauteurs (' + e0.h2 + ' → ' + e2.h2 + ' px)');
    const attenduH2 = e0.h2 + (e2.h2 - e0.h2) * e2.prog;
    verifier(Math.abs(e2.gh2 - attenduH2) <= 3, 'case « Personne 2 » : entre sa hauteur du jeudi et celle du vendredi, au prorata du doigt (' + e2.gh2 + ' px, attendu ' + Math.round(attenduH2) + ')');
    const attenduY = e0.yBande + (e2.yBande - e0.yBande) * e2.prog;
    verifier(e2.yBande > e0.yBande + 40 && Math.abs(e2.gyBande - attenduY) <= 3, 'bande « Intervenants » : entre ses 2 places, au prorata du doigt (' + e2.gyBande + ', attendu ' + Math.round(attenduY) + ')');
    await d.lever();
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__stop = true; });
    const e3 = await etat(page);
    const vus = await page.evaluate(() => [...window.__rows]);
    verifier(e3.iso === '2026-09-25' && e3.x === rowsVendredi && range(e3), 'lâcher après ' + Math.round(e2.prog * 100) + ' % : vendredi posé, photos et noms rangés (' + JSON.stringify(e3) + ')');
    verifier(vus.length <= 2 && vus.includes(e0.rows) && vus.includes(e3.rows), 'la grille n\'a pris que les hauteurs du jeudi puis du vendredi, jamais entre les deux (' + vus.length + ' valeurs)');

    // 3. Glissé lent de 15 % : retour au vendredi (jour de départ).
    const d2 = await poserDoigt(page, de);
    await d2.aller(-45, 6, 60);
    await page.waitForTimeout(150);
    const e4 = await etat(page);
    await d2.lever();
    await page.waitForTimeout(900);
    const e5 = await etat(page);
    verifier(e4.page && e4.iso === '2026-09-25' && e5.iso === '2026-09-25' && e5.x === e3.x && e5.rows === e3.rows && range(e5),
      'glissé lent de ' + Math.round(e4.prog * 100) + ' % : retour au vendredi, ses hauteurs exactes (' + JSON.stringify([e4.prog, e5.x, e5.iso]) + ')');

    // 4. Vers la droite : jeudi ; puis 1,6 jour d'un trait : 2 jours.
    const d3 = await poserDoigt(page, de);
    await d3.aller(150, 5, 20);
    await d3.lever();
    await page.waitForTimeout(900);
    const e6 = await etat(page);
    verifier(e6.iso === '2026-09-24' && e6.rows === e0.rows && range(e6), 'balayage vers la droite : jeudi, à ses hauteurs (' + e6.iso + ')');
    const d4 = await poserDoigt(page, de);
    await d4.aller(-Math.round(1.6 * pas), 16, 40);
    await page.waitForTimeout(150);
    const e7 = await etat(page);
    await d4.lever();
    await page.waitForTimeout(1200);
    const e8 = await etat(page);
    verifier(e7.page && e7.iso === '2026-09-24' && e8.iso === '2026-09-28' && range(e8), '1,6 jour sans lever le doigt : jour d\'après gardé en chemin, lundi 28 au lâcher (' + e8.iso + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Temps réel pendant la page -------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(600);
    const de = await caseVide(page);
    await page.evaluate(() => { window.__grille0 = document.querySelector('.scroller .grille'); });
    const d = await poserDoigt(page, de);
    await d.aller(-100, 4, 30);
    await page.waitForTimeout(150);
    const pendant = await page.evaluate(() => { relireFenetre_(true); return [!!pageJourEnCours, document.querySelector('.scroller .grille') === window.__grille0]; });
    await d.lever();
    await page.waitForTimeout(3500);
    const apres = await page.evaluate(() => [jourMobileIso, !!pageJourEnCours]);
    verifier(pendant[0] && pendant[1], 'relecture temps réel pendant la page : remise à plus tard, grille intacte sous les photos');
    verifier(apres[0] === '2026-09-25' && !apres[1], 'après la page : vendredi, relecture faite (' + apres.join(' ') + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. « Réduire les animations » : défilement réel ---------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(600);
    const de = await caseVide(page);
    const x0 = await page.evaluate(() => document.querySelector('.scroller').scrollLeft);
    const d = await poserDoigt(page, de);
    await d.aller(-100, 4, 30);
    await page.waitForTimeout(100);
    const pendant = await page.evaluate(() => [!!pageJourEnCours, document.querySelector('.scroller').scrollLeft]);
    await d.lever();
    await page.waitForTimeout(700);
    verifier(!pendant[0] && pendant[1] <= x0 + 100 && pendant[1] > x0 + 40 && await page.evaluate(() => jourMobileIso) === '2026-09-25',
      'animations réduites : pas de photos, la grille défile sous le doigt (' + x0 + ' → ' + pendant[1] + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 7. Ordinateur : toute la semaine glisse, noms et bandes à part -----------
  {
    const P = [];
    for (let i = 1; i <= 16; i++) P.push({ id: i, nom: 'Personne ' + i, sous_traitant: i > 12, ordre: i, actif: true });
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 700 }, bd: { personnes: P, taches: [] } });
    await page.waitForTimeout(500);
    // Page descendue : bande « Personnel » collée sous l'en-tête (suite 89).
    await page.evaluate(() => { document.getElementById('app').scrollTop = 250; });
    await page.waitForTimeout(200);
    const colleeAvant = await page.evaluate(() => document.querySelector('.section-row-personnel').classList.contains('section-collee'));
    // Rendu (relecture temps réel, enregistrement) : la page ne remonte plus
    // en haut (construireGrille vidait #racine).
    const hautRendu = await page.evaluate(() => { render(false); return document.getElementById('app').scrollTop; });
    verifier(hautRendu === 250, 'rendu de la grille : la page reste où elle était (' + hautRendu + ' px, attendu 250)');
    await page.evaluate(() => document.getElementById('btnSemaineSuiv').click());
    const g = await page.evaluate(async () => {
      const t0 = performance.now();
      for (;;) {
        const a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === '::view-transition-new(semaine)');
        if (a && a.currentTime >= 110) break;
        if (performance.now() - t0 > 3000) break;
        await new Promise((ok) => requestAnimationFrame(ok));
      }
      return document.getAnimations().map((a) => a.effect && a.effect.pseudoElement).filter(Boolean);
    });
    const attendus = ['::view-transition-old(semaine)', '::view-transition-new(semaine)', '::view-transition-group(vt-p1)', '::view-transition-group(vt-section-personnel)', '::view-transition-group(vt-section-intervenants)'];
    verifier(attendus.every((p) => g.includes(p)), '› : toute la semaine glisse (photos), cases des noms et bandes Personnel / Intervenants à part (manque : ' + attendus.filter((p) => !g.includes(p)).join(', ') + ')');
    await page.waitForTimeout(700);
    const apres = await page.evaluate(() => ({
      collee: document.querySelector('.section-row-personnel').classList.contains('section-collee'),
      range: !document.documentElement.classList.contains('vt-semaine') && !document.querySelector('[style*="view-transition-name"]')
    }));
    verifier(colleeAvant && apres.collee && apres.range, '› fini : bande « Personnel » toujours collée sous l\'en-tête, rien qui traîne (' + JSON.stringify([colleeAvant, apres]) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
