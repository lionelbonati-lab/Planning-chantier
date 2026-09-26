const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 26.09.2026 (suite 58). Lionel, sur son téléphone, après la
// suite 57 :
//   « L'affichage des jalons a disparu, il ne s'affiche que sur le premier
//     jour et parfois disparaît aussi du 1er jour. »
//   « Cas d'une bulle de 1.5j, quand une hauteur de bulle change, il faudrait
//     que ce soit progressif, durant le switch. »
//   « Il y a encore des calculs et recalculs car des bulles font encore
//     l'accordéon. Surtout en cas de jour entier suivi de demi-jour. »
// Vérifie, téléphone 390 px, vue « 1 jour » :
//   1. jalon et note de plusieurs jours lisibles chaque jour, collés au bord
//      des noms (la bande Jalons/Notes est hors de .scroller) ;
//   2. image par image : hauteurs de lignes qui suivent le glissement de
//      page, déjà arrivées au jour posé, plus rien ne bouge ensuite ;
//      carte de 1,5 jour sans aller-retour de largeur à l'arrivée ;
//   3. carte posée l'après-midi qui continue le lendemain : elle grandit
//      avec la part qui entre à l'écran, sans doubler d'un coup ;
//   4. glissé trop court (retour sur le même jour) : hauteurs exactes du
//      jour, rien de « suivi » qui traîne.
//
// Lancer : node test_suite58.js

const PERS = [1, 2, 3, 4].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
let tid = 1;
const T = (pid, date, demi, texte, ordre) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const LONG = 'Coffrage des voiles du sous-sol niveau moins un';
const TACHES = [
  // Personne 1 : bulle de 1,5 jour (jeudi entier + vendredi matin), puis
  // 2 bulles empilées vendredi après-midi (ligne bien plus haute vendredi).
  T(1, '2026-09-24', 'matin', LONG), T(1, '2026-09-24', 'aprem', LONG), T(1, '2026-09-25', 'matin', LONG),
  T(1, '2026-09-25', 'aprem', 'Nettoyage', 0), T(1, '2026-09-25', 'aprem', 'Rangement dépôt', 1),
  // Personne 2 : jour entier jeudi, puis deux demi-journées vendredi.
  T(2, '2026-09-24', 'matin', 'Ferraillage dalle haute'), T(2, '2026-09-24', 'aprem', 'Ferraillage dalle haute'),
  T(2, '2026-09-25', 'matin', 'Réception des matériaux'), T(2, '2026-09-25', 'aprem', 'Nettoyage'),
  // Personne 3 : mercredi après-midi + jeudi entier.
  T(3, '2026-09-23', 'aprem', LONG), T(3, '2026-09-24', 'matin', LONG), T(3, '2026-09-24', 'aprem', LONG)
];
const JALONS = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map((d, i) => ({ id: 900 + i, date: d, texte: 'Coulage dalle', serie_id: null }));
const NOTES = ['2026-09-23', '2026-09-24'].map((d, i) => ({ id: 800 + i, date: d, texte: 'Livraison grue', important: false, serie_id: null, demi: null }));

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
// Case vide de la personne 4 (sans bulle) entièrement visible.
const caseVide = (page) => page.evaluate(() => {
  const c = [...document.querySelectorAll('.cell[data-kind="personne"]')].reverse().find((x) => {
    const r = x.getBoundingClientRect();
    return r.left >= 110 && r.right <= 395 && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === x;
  });
  const r = c.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
// Journal image par image : position, hauteurs des 4 lignes de personnes,
// largeur et bords des cartes (par texte + rang).
const journaliser = (page, duree) => page.evaluate((duree) => {
  window.__j = [];
  const t0 = performance.now();
  const f = () => {
    const sc = document.querySelector('.scroller');
    const lbl = [...document.querySelectorAll('.scroller .lbl')].slice(0, 4).map((l) => Math.round(l.getBoundingClientRect().height * 10) / 10);
    const cartes = [...document.querySelectorAll('.scroller .bulle .b-carte')].map((c) => {
      const r = c.getBoundingClientRect();
      return c.style.display === 'none' ? null : { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
    });
    window.__j.push({ t: performance.now() - t0, g: sc.scrollLeft, lbl, cartes, suivies: sc.querySelector('.grille').classList.contains('hauteurs-suivies') });
    if (performance.now() - t0 < duree) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}, duree);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Jalon et note de plusieurs jours, lisibles chaque jour ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES, jalons: JALONS, notes: NOTES } });
    await page.waitForTimeout(500);
    const de = await caseVide(page);
    const releve = () => page.evaluate(() => {
      const LN = largeurNoms();
      const carte = (txt) => {
        const b = [...document.querySelectorAll('.entete-planning-figee .bulle')].find((x) => x.textContent.includes(txt));
        const c = b && b.querySelector('.b-carte');
        if (!c || c.style.display === 'none') return null;
        const r = c.getBoundingClientRect();
        return { l: Math.round(r.left), w: Math.round(r.width) };
      };
      return { iso: jourMobileIso, LN, jalon: carte('Coulage'), note: carte('Livraison grue'), jour: Math.round(document.querySelector('.scroller').clientWidth - LN) };
    });
    const vus = [];
    vus.push(await releve()); // jeudi 24
    for (const dx of [150, 150, -150, -150, -150, -150]) { await balayer(page, de, dx, 4, 10); await page.waitForTimeout(1000); vus.push(await releve()); }
    const parJour = {};
    vus.forEach((v) => { parJour[v.iso] = v; });
    const colle = (c, v) => c && Math.abs(c.l - v.LN) <= 1 && Math.abs(c.w - v.jour) <= 2;
    const jalonsOk = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].every((d) => parJour[d] && colle(parJour[d].jalon, parJour[d]));
    verifier(jalonsOk, 'jalon du mardi au vendredi : lisible chaque jour, au bord des noms, sur tout le jour (' + JSON.stringify(Object.values(parJour).map((v) => [v.iso.slice(8), v.jalon])) + ')');
    verifier(colle(parJour['2026-09-23'].note, parJour['2026-09-23']) && colle(parJour['2026-09-24'].note, parJour['2026-09-24']), 'note du mercredi au jeudi : lisible les deux jours, au bord des noms');
    const lundi = parJour['2026-09-28'];
    verifier(lundi && !colle(lundi.jalon, lundi) && !colle(lundi.note, lundi), 'lundi 28 : ni le jalon ni la note (finis le vendredi / le jeudi) à l\'écran');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Jeudi → vendredi : hauteurs qui suivent, rien après l'arrivée ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(500);
    const de = await caseVide(page);
    const hJeudi = await page.evaluate(() => Math.round(document.querySelectorAll('.scroller .lbl')[0].getBoundingClientRect().height));
    await journaliser(page, 1400);
    await balayer(page, de, -150, 6, 16);
    await page.waitForTimeout(1500);
    const j = await page.evaluate(() => window.__j);
    const cible = await page.evaluate(() => Math.round(document.querySelector('.scroller').scrollLeft));
    const iArrivee = j.findIndex((x) => Math.round(x.g) === cible);
    const h1 = j.map((x) => x.lbl[0]);
    const hVendredi = h1[h1.length - 1];
    const avantArrivee = h1.slice(0, iArrivee + 1);
    const monte = avantArrivee.every((h, i) => i === 0 || h >= avantArrivee[i - 1] - 0.2);
    const intermediaires = [...new Set(avantArrivee.filter((h) => h > hJeudi + 0.5 && h < hVendredi - 0.5))];
    verifier(hVendredi > hJeudi + 20 && monte && intermediaires.length >= 3, 'personne 1, jeudi → vendredi : sa ligne grandit PENDANT le glissement, par ' + intermediaires.length + ' valeurs (' + hJeudi + ' → ' + hVendredi + ')');
    verifier(iArrivee > 0 && Math.abs(h1[iArrivee] - hVendredi) < 0.5 && h1.slice(iArrivee).every((h) => Math.abs(h - hVendredi) < 0.5), 'arrivée sur vendredi : hauteurs déjà en place, plus aucune ne bouge ensuite');
    const lignesApres = j.slice(iArrivee).map((x) => x.lbl.join(','));
    verifier(new Set(lignesApres).size === 1, 'jour entier suivi de demi-journées (personne 2) : aucune ligne ne bouge après l\'arrivée (' + [...new Set(lignesApres)].join(' | ') + ')');
    // Carte de 1,5 jour (1re carte) : rétrécit sans jamais repartir en arrière.
    const w1 = j.map((x) => x.cartes[0] && x.cartes[0].w);
    const sansRebond = w1.every((w, i) => i === 0 || w <= w1[i - 1] + 0.5);
    verifier(sansRebond && Math.abs(w1[w1.length - 1] - 149) <= 2, 'carte de 1,5 jour : 298 → 149 px sans aller-retour, même à l\'arrivée (' + [...new Set(w1)].join(' ') + ')');
    // Les dernières images du glissement arrondissent déjà à l'arrivée :
    // la fixation suit à la fin de la courbe, moins de 100 ms après.
    verifier(j.filter((x) => x.t > j[iArrivee].t + 100).every((x) => !x.suivies), 'jour posé : grille rendue aux hauteurs mesurées (plus de hauteurs « suivies »)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Mercredi → jeudi : carte d'après-midi qui continue le lendemain ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(500);
    const de = await caseVide(page);
    await balayer(page, de, 150, 4, 10);
    await page.waitForTimeout(1000);
    const mercredi = await page.evaluate(() => jourMobileIso);
    // Carte de la personne 3 : la dernière de .scroller (ordre du DOM).
    await journaliser(page, 1200);
    await balayer(page, de, -150, 6, 16);
    await page.waitForTimeout(1300);
    const j = await page.evaluate(() => window.__j);
    const c3 = j.map((x) => x.cartes[x.cartes.length - 1]).filter(Boolean);
    const ecran = 390;
    const dansEcran = c3.every((c) => c.r <= ecran + 1);
    const croissante = c3.every((c, i) => i === 0 || c.w >= c3[i - 1].w - 0.5);
    const premierPas = c3.length > 1 ? c3[1].w - c3[0].w : 0;
    verifier(mercredi === '2026-09-23' && dansEcran && croissante, 'personne 3, mercredi après-midi → jeudi : la carte grandit avec la part à l\'écran, sans déborder (' + [...new Set(c3.map((c) => c.w))].join(' ') + ')');
    verifier(premierPas < 100, 'pas de carte qui double d\'un coup au départ du geste (premier pas ' + premierPas + ' px, avant : +149)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Glissé trop court : retour exact sur le jour ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(500);
    const de = await caseVide(page);
    const avant = await page.evaluate(() => [...document.querySelectorAll('.scroller .grille, .entete-planning-figee .grille')].map((g) => g.style.gridTemplateRows).join(' / '));
    await balayer(page, de, -50, 5, 80);
    await page.waitForTimeout(900);
    const apres = await page.evaluate(() => ({
      iso: jourMobileIso,
      rows: [...document.querySelectorAll('.scroller .grille, .entete-planning-figee .grille')].map((g) => g.style.gridTemplateRows).join(' / '),
      suivies: document.querySelectorAll('.grille.hauteurs-suivies').length
    }));
    verifier(apres.iso === '2026-09-24' && apres.rows === avant && apres.suivies === 0, 'glissé de 50 px puis retour sur jeudi : hauteurs du jeudi au pixel près, rien de « suivi » qui reste');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan());
})();
