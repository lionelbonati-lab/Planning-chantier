const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 93). Lionel :
//   « Sélectionner une bulle fait apparaître son texte en entier ainsi que
//     sa hauteur de bulle complète si tronquée. »
// Vérifie :
//   1. ordinateur : une bulle au texte long, coupée (hauteur fixe, 2
//      lignes), sélectionnée -> carte à la hauteur du texte entier, plus
//      de « … », devant les bulles de la cascade ; Échap -> retour à la
//      hauteur fixe ;
//   2. la dernière bulle d'une cascade, rognée au bas de la ligne,
//      sélectionnée -> plus rognée ; sur la dernière ligne du planning,
//      remontée pour tenir au-dessus du bas de la grille ; Échap -> à sa
//      place ; multi-sélection : chaque bulle sélectionnée dépliée ;
//   3. un jalon au texte long (1 ligne) sélectionné -> texte entier ;
//   4. téléphone, vue « 1 jour » : même chose sur la carte du jour.
//
// Lancer : node test_suite93.js

const PERS = ['Lionel', 'Mathis', 'Antoine'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }));
let tid = 1;
const T = (pid, date, demi, texte, ordre) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const LONG = 'Coffrage des voiles du sous-sol côté nord, reprise des banches, contrôle des aplombs et réservations des gaines électriques';
const TACHES = [
  // Antoine, jeudi matin : 4 bulles en cascade, la 1re et la dernière longues.
  T(3, '2026-09-24', 'matin', LONG, 0), T(3, '2026-09-24', 'matin', 'Y', 1), T(3, '2026-09-24', 'matin', 'Z', 2), T(3, '2026-09-24', 'matin', 'Dernière ' + LONG, 3),
  T(1, '2026-09-24', 'matin', 'Court')
];
const JALONS = [{ id: 900, date: '2026-09-24', texte: 'Coulage de la dalle du premier étage avec la pompe à béton et contrôle du ferraillage', serie_id: null }];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)), jalons: JALONS.map((j) => Object.assign({}, j)) });

// État d'une bulle (repérée par le début de son texte).
const etat = (page, debut) => page.evaluate((debut) => {
  const b = [...document.querySelectorAll('#racine .scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim().startsWith(debut));
  const cs = (v) => parseFloat(getComputedStyle(racineEl).getPropertyValue(v));
  const cartes = [...b.querySelectorAll(':scope > .b-carte')];
  const c = cartes.find((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden') || cartes[0];
  const t = c.querySelector('.b-txt'), r = c.getBoundingClientRect();
  const lbl = [...document.querySelectorAll('.scroller .lbl')].find((l) => l.textContent.includes('Antoine'));
  return {
    sel: b.classList.contains('selectionnee'), haut: r.height, bas: r.bottom, u: cs('--mob-carte-pers'), uJal: cs('--mob-carte-jal'),
    coupe: t.scrollHeight > t.clientHeight + 1, clip: getComputedStyle(b).clipPath,
    ligneBas: lbl ? lbl.getBoundingClientRect().bottom : null, scBas: b.closest('.scroller').getBoundingClientRect().bottom,
    // Le point au 3/4 de la carte tombe-t-il sur elle (devant la cascade) ?
    devant: (() => { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.75); return !!e && e.closest('.bulle') === b; })()
  };
}, debut);
const clicCarte = async (page, debut) => {
  const p = await page.evaluate((debut) => {
    const b = [...document.querySelectorAll('#racine .scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim().startsWith(debut));
    const c = [...b.querySelectorAll(':scope > .b-carte')].find((x) => x.getBoundingClientRect().width > 0) || b.querySelector('.b-carte');
    const r = c.getBoundingClientRect();
    return [r.left + Math.min(40, r.width / 2), r.top + 8];
  }, debut);
  await page.mouse.click(p[0], p[1]);
  await page.waitForTimeout(150);
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(500);
    // --- 1. Bulle longue en tête de cascade ---
    let e = await etat(page, 'Coffrage');
    verifier(!e.sel && Math.abs(e.haut - e.u) < 1 && e.coupe, 'avant : carte à la hauteur fixe, texte coupé (' + Math.round(e.haut) + ' px, U ' + e.u + ')');
    await clicCarte(page, 'Coffrage');
    e = await etat(page, 'Coffrage');
    verifier(e.sel && e.haut > e.u + 10 && !e.coupe, 'sélectionnée : carte à la hauteur du texte entier, plus coupé (' + Math.round(e.haut) + ' px)');
    verifier(e.devant && e.clip === 'none', 'sélectionnée : devant les bulles de la cascade, sans rognage (' + e.clip + ')');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    e = await etat(page, 'Coffrage');
    verifier(!e.sel && Math.abs(e.haut - e.u) < 1 && e.coupe, 'Échap : retour à la hauteur fixe (' + Math.round(e.haut) + ' px)');

    // --- 2. Dernière bulle de la cascade, rognée au bas de la ligne ---
    e = await etat(page, 'Dernière');
    const rogneeAvant = e.clip !== 'none';
    await clicCarte(page, 'Dernière');
    e = await etat(page, 'Dernière');
    // Dernière ligne du planning : la carte dépliée remonte pour tenir
    // au-dessus du bas de la grille (le reste serait coupé par .scroller).
    verifier(rogneeAvant && e.sel && e.clip === 'none' && !e.coupe && e.haut > e.u + 10 && e.bas <= e.scBas && e.devant,
      'dernière de la cascade, dernière ligne : rognée avant, entière et remontée une fois sélectionnée (bas ' + Math.round(e.bas) + ', planning ' + Math.round(e.scBas) + ')');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    e = await etat(page, 'Dernière');
    verifier(!e.sel && Math.abs(e.haut - e.u) < 1 && e.clip !== 'none' && await page.evaluate(() => !document.querySelector('.b-carte[data-remonte]')),
      'Échap : la dernière reprend sa place et sa hauteur');
    // Multi-sélection (deux bulles de lignes différentes) : les deux s'ouvrent.
    await clicCarte(page, 'Coffrage');
    await page.keyboard.down('Control');
    await clicCarte(page, 'Court');
    await page.keyboard.up('Control');
    const e1 = await etat(page, 'Coffrage'), e2 = await etat(page, 'Dernière');
    verifier(e1.sel && !e1.coupe && !e2.sel && await page.evaluate(() => Object.keys(bullesSelectionnees).length === 2), 'multi-sélection : la bulle longue reste dépliée');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // --- 3. Jalon long ---
    const jal = () => page.evaluate(() => {
      const b = document.querySelector('#racine .bulle-jalon'), c = b.querySelector('.b-carte'), t = c.querySelector('.b-txt');
      return { sel: b.classList.contains('selectionnee'), haut: c.getBoundingClientRect().height, coupe: t.scrollHeight > t.clientHeight + 1, u: parseFloat(getComputedStyle(racineEl).getPropertyValue('--mob-carte-jal')) };
    });
    let j = await jal();
    const jAvant = j;
    await page.evaluate(() => { const r = document.querySelector('#racine .bulle-jalon .b-carte').getBoundingClientRect(); window.__pj = [r.left + 20, r.top + r.height / 2]; });
    const pj = await page.evaluate(() => window.__pj);
    await page.mouse.click(pj[0], pj[1]);
    await page.waitForTimeout(150);
    j = await jal();
    verifier(jAvant.coupe && Math.abs(jAvant.haut - jAvant.u) < 1 && j.sel && !j.coupe && j.haut > j.u + 5,
      'jalon long : coupé à 1 ligne, entier une fois sélectionné (' + Math.round(jAvant.haut) + ' -> ' + Math.round(j.haut) + ' px)');
    await page.keyboard.press('Escape');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Téléphone, vue « 1 jour » ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(500);
    let e = await etat(page, 'Dernière');
    const avant = e;
    const p = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#racine .scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim().startsWith('Dernière'));
      const c = [...b.querySelectorAll(':scope > .b-carte')].find((x) => { const r = x.getBoundingClientRect(); return r.right > 120 && r.left < 390; });
      const r = c.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + 8];
    });
    await page.touchscreen.tap(p[0], p[1]);
    await page.waitForTimeout(300);
    e = await etat(page, 'Dernière');
    verifier(avant.coupe && e.sel && !e.coupe && e.haut > e.u + 10 && e.clip === 'none',
      'téléphone : la carte du jour sélectionnée montre tout son texte (' + Math.round(avant.haut) + ' -> ' + Math.round(e.haut) + ' px)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
