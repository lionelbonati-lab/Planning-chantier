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
// Round du 28.09.2026 (suite 91) — Lionel : « Je pense qu'il serait
// judicieux de passer à des hauteur de ligne fixe sur mobile. Plus de
// calculs de hauteur de ligne. » Les photos du téléphone (points 1 à 6)
// disparaissent : lignes de hauteur fixe, changer de jour n'est plus
// qu'un défilement. Ces points vérifient désormais : aucune photo, la
// grille défile sous le doigt, ses lignes, la case « Personne 2 » et la
// bande « Intervenants » ne bougent pas d'un pixel (vendredi : 3 bulles en
// cascade dans la ligne de la personne 2) ; mêmes jours d'arrivée qu'avant.
// Le point 7 (ordinateur) est inchangé.
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
// État à l'écran : jour, lignes de la grille, case « Personne 2 » et bande
// « Intervenants », et ce qui restait de la page photographiée (suite 90 :
// classe vt-page, noms de transition) — plus jamais posé (suite 91).
const etat = (page) => page.evaluate(() => {
  const html = document.documentElement, sc = document.querySelector('.scroller'), g = sc.querySelector('.grille');
  const lbl2 = sc.querySelector('.lbl[data-vt="p2"]'), bande = sc.querySelector('.section-row-intervenants .section-row-sticky');
  return {
    iso: jourMobileIso, x: sc.scrollLeft, classe: html.classList.contains('vt-page'), rows: g.style.gridTemplateRows,
    h2: Math.round(lbl2.getBoundingClientRect().height), yBande: Math.round(bande.getBoundingClientRect().top),
    noms: document.querySelectorAll('[style*="view-transition-name"]').length,
    calage: !!calageJourEnCours, snap: sc.style.scrollSnapType
  };
});
const range = (e) => !e.classe && e.noms === 0 && !e.calage && e.snap === '';

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. à 4. Téléphone : la grille défile, rien ne change de hauteur -------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(600);
    const de = await caseVide(page);
    const e0 = await etat(page);
    const pas = await page.evaluate(() => document.querySelector('.th[data-gi]').getBoundingClientRect().width);
    const rowsVendredi = await page.evaluate(() => {
      const sc = document.querySelector('.scroller'), R = reperesJour_(sc);
      return R[R.indexOf(Math.round(sc.scrollLeft)) + 1];
    });
    // Journal image par image : lignes de la grille, case « Personne 2 »,
    // bande « Intervenants ».
    await page.evaluate(() => {
      window.__vus = new Set(); window.__stop = false;
      const sc = document.querySelector('.scroller'), g = sc.querySelector('.grille');
      const lbl2 = sc.querySelector('.lbl[data-vt="p2"]'), bande = sc.querySelector('.section-row-intervenants .section-row-sticky');
      const f = () => {
        window.__vus.add(g.style.gridTemplateRows + ' | ' + Math.round(lbl2.getBoundingClientRect().height) + ' | ' + Math.round(bande.getBoundingClientRect().top));
        if (!window.__stop) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    const d = await poserDoigt(page, de);
    await d.aller(-60, 4, 30);
    await page.waitForTimeout(150);
    const e1 = await etat(page);
    await d.aller(-60, 4, 30);
    await page.waitForTimeout(150);
    const e2 = await etat(page);
    verifier(!e1.classe && e1.noms === 0 && e0.iso === '2026-09-24', 'doigt qui glisse : aucune photo de la page (suite 91) (' + JSON.stringify({ classe: e1.classe, noms: e1.noms }) + ')');
    verifier(e1.x > e0.x + 30 && e2.x > e1.x + 30, 'la grille défile sous le doigt (' + [e0.x, e1.x, e2.x].map(Math.round).join(' → ') + ')');
    verifier(e2.h2 === e0.h2 && e2.yBande === e0.yBande && e2.rows === e0.rows, 'case « Personne 2 » et bande « Intervenants » immobiles, lignes inchangées (' + e0.h2 + ' / ' + e2.h2 + ' px, bande ' + e0.yBande + ' / ' + e2.yBande + ')');
    await d.lever();
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.__stop = true; });
    const e3 = await etat(page);
    const vus = await page.evaluate(() => [...window.__vus]);
    verifier(e3.iso === '2026-09-25' && e3.x === rowsVendredi && range(e3), 'lâcher après ' + Math.round((e2.x - e0.x) / pas * 100) + ' % : vendredi posé, rien qui traîne (' + JSON.stringify(e3) + ')');
    verifier(vus.length === 1 && e3.rows === e0.rows && e3.h2 === e0.h2, 'une seule hauteur de lignes, de la case « Personne 2 » et place de la bande, à chaque image, jeudi comme vendredi (' + vus.join(' ; ') + ')');
    // Vendredi : les 3 bulles de la personne 2 en cascade dans sa ligne.
    const cascade = await page.evaluate(() => {
      const sc = document.querySelector('.scroller'), l = sc.querySelector('.lbl[data-vt="p2"]').getBoundingClientRect();
      return ['A', 'B', 'C'].map((t) => {
        const r = [...sc.querySelectorAll('.bulle')].find((b) => b.querySelector('.b-txt').textContent.trim() === t).querySelector('.b-carte').getBoundingClientRect();
        return Math.round(r.top - l.top);
      }).concat(Math.round(l.height));
    });
    verifier(cascade[0] < cascade[1] && cascade[1] < cascade[2] && cascade[2] < cascade[3], 'vendredi : A, B et C en cascade dans la ligne de la personne 2 (hauts ' + cascade.slice(0, 3).join(', ') + ' px, ligne ' + cascade[3] + ' px)');

    // 3. Glissé lent de 15 % : retour au vendredi (jour de départ).
    const d2 = await poserDoigt(page, de);
    await d2.aller(-45, 6, 60);
    await page.waitForTimeout(150);
    const e4 = await etat(page);
    await d2.lever();
    await page.waitForTimeout(900);
    const e5 = await etat(page);
    verifier(e4.iso === '2026-09-25' && e5.iso === '2026-09-25' && e5.x === e3.x && e5.rows === e3.rows && range(e5),
      'glissé lent de ' + Math.round((e4.x - e3.x) / pas * 100) + ' % : retour au vendredi (' + JSON.stringify([e5.x, e5.iso]) + ')');

    // 4. Vers la droite : jeudi ; puis 1,6 jour d'un trait : 2 jours.
    const d3 = await poserDoigt(page, de);
    await d3.aller(150, 5, 20);
    await d3.lever();
    await page.waitForTimeout(900);
    const e6 = await etat(page);
    verifier(e6.iso === '2026-09-24' && e6.rows === e0.rows && range(e6), 'balayage vers la droite : jeudi, mêmes lignes (' + e6.iso + ')');
    const d4 = await poserDoigt(page, de);
    await d4.aller(-Math.round(1.6 * pas), 16, 40);
    await page.waitForTimeout(150);
    await d4.lever();
    await page.waitForTimeout(1200);
    const e8 = await etat(page);
    verifier(e8.iso === '2026-09-28' && range(e8), '1,6 jour sans lever le doigt : lundi 28 au lâcher (' + e8.iso + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Temps réel pendant le glissement ---------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(600);
    const de = await caseVide(page);
    const d = await poserDoigt(page, de);
    await d.aller(-100, 4, 30);
    await page.waitForTimeout(150);
    await page.evaluate(() => relireFenetre_(true));
    await d.lever();
    await page.waitForTimeout(3500);
    const apres = await etat(page);
    verifier(apres.iso === '2026-09-25' && range(apres), 'relecture temps réel pendant le glissement : vendredi atteint au lâcher, rien qui traîne (' + apres.iso + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. « Réduire les animations » : défilement réel ---------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(600);
    const de = await caseVide(page);
    const x0 = await page.evaluate(() => document.querySelector('.scroller').scrollLeft);
    const d = await poserDoigt(page, de);
    await d.aller(-100, 4, 30);
    await page.waitForTimeout(100);
    const pendant = await page.evaluate(() => [document.documentElement.classList.contains('vt-page'), document.querySelector('.scroller').scrollLeft]);
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
