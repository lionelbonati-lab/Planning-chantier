const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 57). Lionel : « La transition entre les jours
// en mobile me dérange. Cherche une solution pour faire des transitions
// fluides. Exemple : page qui se tourne ou fondu enchaîné ou autre chose. »
// Avant : au lâcher, inertie qui rampait, puis recalage d'un coup sur le
// jour (74 px en une image), puis hauteurs de lignes qui sautaient 200 ms
// plus tard ; l'en-tête des jours ne bougeait qu'une image sur deux.
// Désormais (js/grille-interactions.js, glisserVersJour ; js/grille-
// rendu.js, figerHauteursJourMobile) : glissement de page jusqu'au jour
// d'arrivée, en décélérant, sans à-coup final ; hauteurs qui glissent ;
// en-tête dans la même image que la grille. Vérifie, téléphone 390 px :
//   1. le choix du jour d'arrivée (glissé lent / balayage vif / enchaîné) ;
//   2. image par image : pas de saut, en-tête collé à la grille ;
//   3. hauteurs qui glissent vers celles du jour posé ;
//   4. recentrage de la fenêtre de 2 semaines invisible ;
//   5. « réduire les animations » : arrivée directe ;
//   6. vue semaine (tablette) : pas de repère de jour, inertie libre.
//
// Lancer : node test_suite57.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
// Vendredi 25 : 2 bulles empilées pour la personne 2 (ligne plus haute).
const TACHES = [T(1, 2, '2026-09-25', 'matin', 'A'), T(2, 2, '2026-09-25', 'matin', 'B'), T(3, 1, '2026-09-24', 'matin', 'Jeudi')];

// Date.now() est figée par le test (ouvrirPlanning) : sans avancer
// l'horloge, deux touchers sur la même case compteraient comme un double tap.
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
const jour = (page) => page.evaluate(() => ({ iso: jourMobileIso, gauche: Math.round(document.querySelector('.scroller').scrollLeft), reperes: reperesJour_(document.querySelector('.scroller')) }));
// Journal image par image (requestAnimationFrame) pendant `duree` ms.
const journaliser = (page, duree) => page.evaluate((duree) => {
  window.__j = [];
  const t0 = performance.now();
  const f = () => {
    const sc = document.querySelector('.scroller'), en = document.querySelector('.entete-planning-scroll');
    const lbl = [...document.querySelectorAll('.scroller .lbl')].map((l) => Math.round(l.getBoundingClientRect().height * 10) / 10);
    const th = [...document.querySelectorAll('.entete-planning-figee .th[data-gi]')].find((t) => isoDeGi(+t.dataset.gi) === window.__jourSuivi);
    window.__j.push({ t: performance.now() - t0, g: sc.scrollLeft, e: en ? en.scrollLeft : null, lbl, th: th ? Math.round(th.getBoundingClientRect().left) : null, fen: fenetreLabGs()[0] });
    if (performance.now() - t0 < duree) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}, duree);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Choix du jour d'arrivée (règle, vitesses maîtrisées) ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const sc = document.querySelector('.scroller'), R = reperesJour_(sc), b = R.indexOf(Math.round(sc.scrollLeft)), L = R[b + 1] - R[b];
      const essai = (part, v, interrompu, depart) => { sc.style.scrollSnapType = 'none'; sc.scrollLeft = R[b] + part * L; const c = calageJourCible_(sc, depart === undefined ? R[b] : depart, v, interrompu); return R.indexOf(c) - b; };
      const o = {
        lent20: essai(0.2, 0.1), lent35: essai(0.35, 0.1), lentArriere35: essai(-0.35, -0.1),
        lent120: essai(1.2, 0.1), lent140: essai(1.4, 0.1), vifCourt: essai(0.05, 0.8), vifArriere: essai(-0.05, -0.8),
        vifLong: essai(0.5, 3), retourneAvant: essai(-0.2, 0.8), interrompu: essai(0.9, 0.8, true, R[b + 1])
      };
      sc.scrollLeft = R[b]; sc.style.scrollSnapType = '';
      return o;
    });
    verifier(r.lent20 === 0 && r.lent35 === 1 && r.lentArriere35 === -1, 'glissé lent : moins de 30 % d\'un jour → même jour, plus de 30 % → jour voisin (' + JSON.stringify(r) + ')');
    verifier(r.lent120 === 1 && r.lent140 === 2, 'glissé lent de plus d\'un jour : on compte depuis l\'arrivée (1,2 jour → +1, 1,4 jour → +2)');
    verifier(r.vifCourt === 1 && r.vifArriere === -1 && r.vifLong === 1, 'balayage vif : un jour dans son sens, un seul même très vif');
    verifier(r.retourneAvant === 0, 'parti en arrière puis balayé en avant : retour au jour de départ (comme un carrousel)');
    verifier(r.interrompu === 2, 'balayage qui coupe un glissement en cours : jour d\'après son arrivée (+2 en tout)');

    // Gestes réels au doigt (distances qui décident, quelle que soit la
    // vitesse mesurée sous charge).
    const de = await caseVide(page);
    const j0 = await jour(page);
    await balayer(page, de, -50, 5, 80); await page.waitForTimeout(900);
    const j1 = await jour(page);
    verifier(j1.iso === '2026-09-24' && j1.gauche === j0.gauche, 'doigt, glissé lent de 50 px : retour sur jeudi, calé au pixel (' + JSON.stringify([j0.gauche, j1.gauche]) + ')');
    await balayer(page, de, -150, 4, 10); await page.waitForTimeout(900);
    const j2 = await jour(page);
    verifier(j2.iso === '2026-09-25' && j2.reperes.includes(j2.gauche), 'doigt, balayage de 150 px : vendredi, un seul jour, calé sur son repère (' + j2.iso + ')');
    await balayer(page, de, 150, 4, 10); await page.waitForTimeout(60);
    await balayer(page, de, 150, 4, 10); await page.waitForTimeout(1200);
    const j3 = await jour(page);
    verifier(j3.iso === '2026-09-23', 'doigt, deux balayages enchaînés vers la droite : deux jours en arrière (' + j3.iso + ')');
    verifier(await page.evaluate(() => calageJourEnCours === null && document.querySelector('.scroller').style.scrollSnapType === ''), 'fin des glissements : rien en cours, aimantation CSS rétablie');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. et 3. Image par image : glissement sans saut, hauteurs qui glissent ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(400);
    const de = await caseVide(page);
    const avant = await jour(page);
    const hauteurJeudi = await page.evaluate(() => Math.round(document.querySelectorAll('.scroller .lbl')[1].getBoundingClientRect().height));
    await journaliser(page, 1300);
    await balayer(page, de, -150, 4, 10);
    await page.waitForTimeout(1400);
    const j = await page.evaluate(() => window.__j);
    const apres = await jour(page);
    const cible = apres.gauche;
    // Images du glissement : du lâcher (dernière position du doigt) à l'arrivée.
    const iArrivee = j.findIndex((x) => Math.round(x.g) === cible);
    let iLacher = iArrivee; while (iLacher > 0 && j[iLacher - 1].g < j[iLacher].g) iLacher--;
    const glissement = j.slice(iLacher, iArrivee + 1).map((x) => Math.round(x.g));
    const pas = glissement.slice(1).map((g, i) => g - glissement[i]);
    const monotone = pas.every((p) => p >= 0);
    const dernierPas = pas.length ? pas[pas.length - 1] : 999;
    const apresArrivee = j.slice(iArrivee).every((x) => Math.round(x.g) === cible);
    verifier(apres.iso === '2026-09-25' && iArrivee > 0 && monotone && apresArrivee, 'glissement vers vendredi : toujours dans le même sens, puis immobile une fois arrivé (' + glissement.join(' ') + ')');
    verifier(dernierPas <= 6 && glissement.length >= 6, 'arrivée en douceur : dernier pas de ' + dernierPas + ' px (avant : saut de 74 px), ' + glissement.length + ' images');
    verifier(j.every((x) => x.e === null || Math.abs(x.e - x.g) < 1), 'en-tête des jours collé à la grille à chaque image (plus une image de retard)');
    // Hauteurs : ligne de la personne 2, de jeudi (1 bulle) à vendredi (2 empilées).
    const h2 = j.map((x) => x.lbl[1]);
    const hVendredi = h2[h2.length - 1];
    const intermediaires = [...new Set(h2.filter((h) => h > hauteurJeudi + 0.5 && h < hVendredi - 0.5))];
    verifier(hVendredi > hauteurJeudi + 20 && intermediaires.length >= 3, 'hauteur de ligne qui glisse ' + hauteurJeudi + ' → ' + hVendredi + ' px, par ' + intermediaires.length + ' valeurs intermédiaires (avant : saut)');
    // Suite 58 — Lionel : « il faudrait que ce soit progressif, durant le
    // switch ». Les hauteurs suivent désormais le glissement de page lui-
    // même : elles bougent avant l'arrivée, et plus du tout après.
    const iPremiere = h2.findIndex((h) => h > hauteurJeudi + 0.5);
    verifier(iPremiere > 0 && iPremiere < iArrivee && h2.slice(iArrivee).every((h) => Math.abs(h - hVendredi) < 0.5), 'les hauteurs changent pendant le glissement, et plus une fois le jour atteint (suite 58)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Recentrage de la fenêtre de 2 semaines, invisible ---
  {
    const TACHES4 = [T(1, 2, '2026-10-01', 'matin', 'A'), T(2, 2, '2026-10-01', 'matin', 'B')];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES4 } });
    await page.waitForTimeout(400);
    const de = await caseVide(page);
    for (let k = 0; k < 4; k++) { await balayer(page, de, -150, 4, 10); await page.waitForTimeout(900); }
    const avant = await page.evaluate(() => [jourMobileIso, fenetreLabGs()[0]]);
    await page.evaluate(() => { window.__jourSuivi = '2026-10-01'; });
    await journaliser(page, 1500);
    await balayer(page, de, -150, 4, 10);
    await page.waitForTimeout(1600);
    const j = await page.evaluate(() => window.__j);
    const apres = await page.evaluate(() => [jourMobileIso, fenetreLabGs()[0], largeurNoms()]);
    const iArrivee = j.findIndex((x) => x.th === apres[2]);
    const fixe = iArrivee >= 0 && j.slice(iArrivee).every((x) => x.th === apres[2]);
    const recentre = j.some((x) => x.fen !== j[0].fen);
    const iRecentre = j.findIndex((x) => x.fen !== j[0].fen);
    const hFinale = j[j.length - 1].lbl[1];
    const hauteursStables = iRecentre > 0 && Math.abs(j[iRecentre - 1].lbl[1] - hFinale) < 0.5 && j.slice(iRecentre).every((x) => Math.abs(x.lbl[1] - hFinale) < 0.5);
    verifier(avant[0] === '2026-09-30' && apres[0] === '2026-10-01' && recentre, 'mercredi 30 → jeudi 1er : la fenêtre se recentre (' + avant[1] + ' → ' + apres[1] + ')');
    verifier(fixe, 'recentrage invisible : le jeudi reste au bord des noms à chaque image après son arrivée');
    verifier(hauteursStables, 'recentrage après le glissement des hauteurs : aucune hauteur ne change à la reconstruction');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. « Réduire les animations » ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    const de = await caseVide(page);
    await journaliser(page, 900);
    await balayer(page, de, -150, 4, 10);
    await page.waitForTimeout(1000);
    const j = await page.evaluate(() => window.__j);
    const apres = await jour(page);
    const g = [...new Set(j.map((x) => Math.round(x.g)))];
    const iMax = g.indexOf(Math.max(...g.filter((x) => x !== apres.gauche)));
    const transition = await page.evaluate(() => getComputedStyle(document.querySelector('.scroller .grille')).transitionDuration);
    verifier(apres.iso === '2026-09-25' && g[g.length - 1] === apres.gauche && g.length - 1 - iMax === 1, 'animations réduites : vendredi atteint sans glissement (' + g.join(' ') + ')');
    verifier(parseFloat(transition) < 0.01, 'animations réduites : hauteurs sans transition visible (' + transition + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Vue semaine (tablette) : pas de repère de jour ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 820, height: 1000 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ jour: modeJourMobileActif(), reperes: reperesJour_(document.querySelector('.scroller')).length, cible: calageJourCible_(document.querySelector('.scroller'), 0, 1, false) }));
    verifier(!r.jour && r.reperes === 0 && r.cible === null, 'tablette, vue semaine : aucun repère de jour, pas de glissement de page (inertie libre inchangée)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
