const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 28.09.2026 (suite 91). Lionel :
//   « Je pense qu'il serait judicieux de passer à des hauteur de ligne fixe
//     sur mobile. Plus de calculs de hauteur de ligne. Si pas assez de place
//     les bulles se chevaucheront telle des post'it. Ajouter un réglage
//     d'affichage mobile permettant de choisir sa hauteur de ligne. Réglage
//     différents pour hauteurs des lignes jalons/notes. Pour un réglage de
//     base partir sur une hauteur contenant 2 bulles de 2hauteurs de texte. »
// Réponses : réglage « en nombre de bulles », chevauchement « en cascade »,
// Jalons/Notes « 1 bulle d'1 ligne » par défaut, « téléphone seulement ».
// Vérifie, téléphone 390 px, vue « 1 jour » :
//   1. toutes les lignes de personnes à la même hauteur, 2 bulles de 2
//      lignes, identique d'un jour à l'autre ; Jalons/Notes : 1 bulle d'1
//      ligne ;
//   2. 2 bulles le même jour : l'une sous l'autre, sans se recouvrir ;
//   3. 4 bulles : en cascade, le haut de chacune visible, régulières ;
//   4. une bulle de plusieurs jours : une carte par jour, bout à bout ;
//   5. appui sur une bulle recouverte : sélectionnée, passée devant ;
//   6. réglages « Hauteur des lignes » (1 à 4) et « Lignes Jalons et
//      Notes » : hauteurs changées ; page Affichage : ces réglages
//      montrés pour le téléphone seulement, « Hauteur des lignes » de
//      l'ordinateur masqué ;
//   7. ordinateur et tablette : suite 92, hauteurs fixes et cascade aussi,
//      une seule carte par bulle.
//
// Lancer : node test_suite91.js

const PERS = ['Lionel', 'Mathis', 'Antoine'].map((nom, i) => ({ id: i + 1, nom, sous_traitant: false, ordre: i + 1, actif: true }));
let tid = 1;
const T = (pid, date, demi, texte, ordre) => ({ id: tid++, personne_id: pid, date, demi, ordre: ordre || 0, texte, chantier_id: 1 });
const LONG = 'Coffrage des voiles du sous-sol';
const TACHES = [
  // Lionel : mercredi après-midi → vendredi matin (3 cartes).
  T(1, '2026-09-23', 'aprem', LONG), T(1, '2026-09-24', 'matin', LONG), T(1, '2026-09-24', 'aprem', LONG), T(1, '2026-09-25', 'matin', LONG),
  // Mathis, jeudi matin : 2 bulles (la place de 2).
  T(2, '2026-09-24', 'matin', 'A', 0), T(2, '2026-09-24', 'matin', 'B', 1),
  // Antoine, jeudi matin : 4 bulles (en cascade).
  T(3, '2026-09-24', 'matin', 'X', 0), T(3, '2026-09-24', 'matin', 'Y', 1), T(3, '2026-09-24', 'matin', 'Z', 2), T(3, '2026-09-24', 'matin', 'W', 3)
];
const JALONS = [{ id: 900, date: '2026-09-24', texte: 'Coulage de la dalle du premier étage avec la pompe', serie_id: null }];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)), jalons: JALONS.map((j) => Object.assign({}, j)) });

// Lignes, cartes (haut relatif à leur ligne) et variables posées.
const releve = (page) => page.evaluate(() => {
  const sc = document.querySelector('.scroller'), rs = sc.getBoundingClientRect(), LN = largeurNoms();
  const lbl = (nom) => [...sc.querySelectorAll('.lbl')].find((l) => l.textContent.includes(nom)).getBoundingClientRect();
  const lignes = { Lionel: lbl('Lionel'), Mathis: lbl('Mathis'), Antoine: lbl('Antoine') };
  const cartes = {};
  document.querySelectorAll('#racine .bulle').forEach((b) => {
    const t = b.querySelector('.b-txt').textContent.trim().split(' ')[0];
    cartes[t] = [...b.querySelectorAll(':scope > .b-carte')].map((c) => {
      const r = c.getBoundingClientRect();
      return { g: Math.round(r.left), d: Math.round(r.right), h: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.width), jour: c.dataset.jour, vu: r.right > rs.left + LN + 1 && r.left < rs.right - 1 };
    });
  });
  const jal = [...document.querySelectorAll('.entete-planning-figee .lbl-speciale')].find((l) => /Jalon/i.test(l.textContent));
  const css = (v) => getComputedStyle(racineEl).getPropertyValue(v).trim();
  return {
    iso: jourMobileIso, lignes: Object.fromEntries(Object.entries(lignes).map(([k, r]) => [k, { h: Math.round(r.top), b: Math.round(r.bottom), hauteur: Math.round(r.height) }])),
    cartes, jal: jal ? Math.round(jal.getBoundingClientRect().height) : null,
    u: parseFloat(css('--mob-carte-pers')), H: parseFloat(css('--mob-h-pers')), uJal: parseFloat(css('--mob-carte-jal')), hJal: parseFloat(css('--mob-h-jal')), lignesJal: css('--mob-lignes-jal'),
    jour: Math.round(document.querySelector('.th[data-gi]').getBoundingClientRect().width)
  };
});
const vue = (c) => c.find((x) => x.vu) || c[0];
const M = 3; // MARGE_MOB_ (grille-rendu.js)

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(500);
    const r = await releve(page);

    // --- 1. Hauteurs fixes ---
    const hs = Object.values(r.lignes).map((l) => l.hauteur);
    verifier(r.u > 20 && Math.abs(r.H - (M + 2 * r.u + M + M)) < 0.5 && hs.every((h) => Math.abs(h - r.H) <= 1),
      'jeudi : lignes de personnes toutes à ' + r.H + ' px, la place de 2 bulles de 2 lignes (carte ' + r.u + ' px) (' + hs.join(', ') + ')');
    verifier(r.uJal < r.u && Math.abs(r.hJal - (M + r.uJal + M)) < 0.5 && r.lignesJal === '1' && Math.abs(r.jal - r.hJal) <= 1,
      'Jalons : 1 bulle d\'1 ligne (carte ' + r.uJal + ' px, ligne ' + r.jal + ' px)');
    const jalCarte = await page.evaluate(() => { const c = document.querySelector('.entete-planning-figee .bulle .b-carte'), t = c.querySelector('.b-txt'); return [Math.round(c.getBoundingClientRect().height), t.scrollHeight > t.clientHeight + 1]; });
    verifier(Math.abs(jalCarte[0] - r.uJal) <= 1 && jalCarte[1], 'jalon au texte long : coupé sur 1 ligne, carte de ' + jalCarte[0] + ' px');

    // --- 2. Deux bulles : l'une sous l'autre ---
    const a = vue(r.cartes.A), b = vue(r.cartes.B), lm = r.lignes.Mathis;
    verifier(a.h - lm.h === M && b.h >= a.b && b.b <= lm.b, 'Mathis, 2 bulles : A en haut, B dessous sans la recouvrir, toutes deux dans la ligne (' + [a.h - lm.h, b.h - lm.h, b.b - lm.h, lm.hauteur].join(' / ') + ')');

    // --- 3. Quatre bulles : cascade ---
    const la = r.lignes.Antoine, hauts = ['X', 'Y', 'Z', 'W'].map((t) => vue(r.cartes[t]).h - la.h);
    const pas = hauts.slice(1).map((h, i) => h - hauts[i]);
    verifier(hauts[0] === M && pas.every((p) => p >= 19 && Math.abs(p - pas[0]) <= 1) && hauts[3] < la.hauteur - 10,
      'Antoine, 4 bulles : en cascade, d\'un pas régulier, le haut de chacune dans la ligne (' + hauts.join(', ') + ' / ' + la.hauteur + ' px)');
    const visibles = await page.evaluate(() => ['X', 'Y', 'Z', 'W'].map((t) => {
      const b = [...document.querySelectorAll('.scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim() === t), c = b.querySelector('.b-carte'), rc = c.getBoundingClientRect();
      const el = document.elementFromPoint(rc.left + rc.width / 2, rc.top + 6);
      return !!el && el.closest('.bulle') === b;
    }));
    verifier(visibles.every(Boolean), 'le haut de chacune des 4 bulles est visible, au-dessus des autres (' + visibles.join(', ') + ')');
    const rogne = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim() === 'W'), c = b.querySelector('.b-carte').getBoundingClientRect();
      const l = [...document.querySelectorAll('.scroller .lbl')].find((x) => x.textContent.includes('Antoine')).getBoundingClientRect();
      const el = document.elementFromPoint(c.left + c.width / 2, l.bottom + 3);
      return { depasse: c.bottom > l.bottom, dessous: el ? el.className : null, bulle: !!(el && el.closest('.bulle') === b) };
    });
    verifier(rogne.depasse && !rogne.bulle, 'la dernière, plus longue que la place restante, est rognée au bas de la ligne (' + JSON.stringify(rogne) + ')');

    // --- 4. Plusieurs jours : une carte par jour ---
    const lio = r.cartes.Coffrage;
    const demi = Math.round((r.jour - 1) / 2);
    verifier(lio.length === 3 && +lio[1].jour === +lio[0].jour + 1 && +lio[2].jour === +lio[1].jour + 1,
      'Lionel, mercredi après-midi → vendredi matin : 3 cartes, une par jour (' + lio.map((c) => c.jour).join(',') + ')');
    verifier(Math.abs(lio[0].l - demi) <= 2 && Math.abs(lio[1].l - r.jour) <= 2 && Math.abs(lio[2].l - demi) <= 2 && Math.abs(lio[1].g - lio[0].d) <= 2 && Math.abs(lio[2].g - lio[1].d) <= 2,
      'cartes à la largeur de leur part (' + lio.map((c) => c.l).join(' + ') + ' px), bout à bout');
    verifier(lio[1].vu && lio[1].g >= 88 && lio[1].h === r.lignes.Lionel.h + M, 'jeudi posé : la carte du jeudi commence au bord des noms, en haut de la ligne');

    // --- Hauteurs identiques un autre jour ---
    await page.evaluate(() => allerAuJour('2026-09-25')); await page.waitForTimeout(600);
    const v = await releve(page);
    verifier(v.iso === '2026-09-25' && Object.keys(r.lignes).every((k) => v.lignes[k].hauteur === r.lignes[k].hauteur) && v.jal === r.jal,
      'vendredi : mêmes hauteurs de lignes que le jeudi (' + Object.values(v.lignes).map((l) => l.hauteur).join(', ') + ', jalons ' + v.jal + ')');
    const lv = vue(v.cartes.Coffrage);
    verifier(lv.jour === lio[2].jour && Math.abs(lv.l - demi) <= 2, 'vendredi : la carte du vendredi matin de Lionel à l\'écran (' + lv.l + ' px)');
    await page.evaluate(() => allerAuJour('2026-09-24')); await page.waitForTimeout(600);

    // --- 5. Appui sur une bulle recouverte : passée devant ---
    const x = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.scroller .bulle')].find((e) => e.querySelector('.b-txt').textContent.trim() === 'X'), c = b.querySelector('.b-carte').getBoundingClientRect();
      return { x: c.left + c.width / 2, y: c.top + 6, recouvert: c.bottom - 6 };
    });
    await page.touchscreen.tap(x.x, x.y);
    await page.waitForTimeout(400);
    const devant = await page.evaluate((y) => {
      const b = [...document.querySelectorAll('.scroller .bulle')].find((e) => e.querySelector('.b-txt').textContent.trim() === 'X'), c = b.querySelector('.b-carte').getBoundingClientRect();
      const el = document.elementFromPoint(c.left + c.width / 2, y);
      return { sel: b.classList.contains('selectionnee'), dessus: !!el && el.closest('.bulle') === b, z: getComputedStyle(b).zIndex };
    }, x.recouvert);
    verifier(devant.sel && devant.dessus, 'appui sur X (recouverte par Y) : sélectionnée et passée devant, bas de sa carte visible (' + JSON.stringify(devant) + ')');
    await page.evaluate(() => { if (typeof deselectionnerTout === 'function') deselectionnerTout(); });

    // --- 6. Réglages ---
    const par = {};
    for (const n of ['1', '2', '3', '4']) {
      await page.evaluate((n) => changerOptionAffichage('lignesTel', n), n);
      await page.waitForTimeout(400);
      const q = await releve(page);
      par[n] = { H: q.H, ligne: q.lignes.Mathis.hauteur, u: q.u, B: vue(q.cartes.B).h - q.lignes.Mathis.h, W: vue(q.cartes.W).h - q.lignes.Antoine.h };
    }
    const formule = (n, u) => M + n * u + (n - 1) * M + M;
    verifier(['1', '2', '3', '4'].every((n) => Math.abs(par[n].H - formule(+n, par[n].u)) < 0.5 && Math.abs(par[n].ligne - par[n].H) <= 1) && par['1'].H < par['2'].H && par['2'].H < par['3'].H && par['3'].H < par['4'].H,
      '« Hauteur des lignes » 1 à 4 bulles : ' + ['1', '2', '3', '4'].map((n) => par[n].ligne).join(' / ') + ' px');
    verifier(par['1'].B === M + 20 && par['2'].B === M + par['2'].u + M && par['4'].W === M + 3 * (par['4'].u + M),
      'cascade selon le réglage : 1 bulle → B décalée de 20 px ; 2 → B sous A ; 4 → les 4 d\'Antoine l\'une sous l\'autre (' + [par['1'].B, par['2'].B, par['4'].W].join(', ') + ')');
    await page.evaluate(() => changerOptionAffichage('lignesTel', '2'));
    const jal = {};
    for (const j of ['1x1', '1x2', '2x1', '2x2']) {
      await page.evaluate((j) => changerOptionAffichage('jalonsTel', j), j);
      await page.waitForTimeout(400);
      const q = await releve(page);
      jal[j] = { ligne: q.jal, u: q.uJal, n: q.lignesJal, H: q.lignes.Mathis.hauteur };
    }
    verifier(jal['1x1'].ligne < jal['1x2'].ligne && jal['1x1'].ligne < jal['2x1'].ligne && jal['2x1'].ligne < jal['2x2'].ligne && jal['1x2'].n === '2' && jal['2x1'].n === '1' && jal['1x2'].u > jal['1x1'].u
      && Object.values(jal).every((x) => x.H === jal['1x1'].H),
      '« Lignes Jalons et Notes » : ' + Object.entries(jal).map(([k, x]) => k + ' ' + x.ligne + ' px').join(', ') + ' ; lignes de personnes inchangées');
    await page.evaluate(() => changerOptionAffichage('jalonsTel', '1x1'));

    // Page Affichage : réglages du téléphone seulement.
    await page.evaluate(() => afficherPage('affichage'));
    await page.waitForTimeout(300);
    // Suite 92 : l'ancien « Hauteur des lignes » de l'ordinateur (hauteur)
    // est remplacé par son curseur (lignesOrdi).
    const cache = () => page.evaluate(() => Object.fromEntries(['lignesOrdi', 'lignesTel', 'jalonsTel'].map((id) => [id, document.querySelector('#page-affichage .reglage-ligne[data-option="' + id + '"]').hidden])));
    const tel = await cache();
    await page.click('#page-affichage .bascule-profil[data-profil="ordi"]');
    const ordi = await cache();
    verifier(tel.lignesOrdi && !tel.lignesTel && !tel.jalonsTel && !ordi.lignesOrdi && ordi.lignesTel && ordi.jalonsTel,
      'page Affichage : « Hauteur des lignes » et « Lignes Jalons et Notes » pour le téléphone, le curseur de l\'ordinateur pour l\'ordinateur (' + JSON.stringify({ tel, ordi }) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 7. Ordinateur et tablette ---
  // Suite 92 — Lionel : « La hauteur de ligne est fixe aussi sur
  // ordinateur. » Tablette : « comme l'ordinateur ». Hauteurs fixes et
  // cascade, mais une seule carte par bulle (pas de carte par jour).
  for (const [nom, opts] of [['ordinateur', { viewport: { width: 1400, height: 900 } }], ['tablette', { viewport: { width: 820, height: 1180 }, hasTouch: true }]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, Object.assign({ bd: BD() }, opts));
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => ({
      mob: [...document.querySelectorAll('#racine .grille')].some((g) => /--mob-h/.test(g.style.gridTemplateRows)),
      var: getComputedStyle(racineEl).getPropertyValue('--mob-h-pers').trim(),
      copies: document.querySelectorAll('.b-carte-jour').length,
      lionel: (() => { const b = [...document.querySelectorAll('.scroller .bulle')].find((x) => x.textContent.includes('Coffrage')); return b ? b.querySelectorAll(':scope > .b-carte').length : -1; })(),
      decale: [...document.querySelectorAll('.bulle .b-carte')].some((c) => c.style.translate && c.style.translate !== '0px 3px')
    }));
    verifier(o.mob && o.var !== '' && o.copies === 0 && o.lionel === 1 && o.decale, nom + ' : hauteur fixe et cascade, une seule carte par bulle (suite 92) (' + JSON.stringify(o) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
