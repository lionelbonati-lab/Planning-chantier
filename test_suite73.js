const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 73). Lionel :
//   « Je remarque que certaine bulle montent et descendent dans leur case
//     lors du switch alors que c'est inutile. Entre lundi 05 et mardi 06
//     octobre dans mon cas. Induit par une absence du vendredi car en
//     mettant l'absence du vendredi 09 sous la tâche qui dure la semaine, ce
//     phénomène ne se passe plus. »
// Sa ligne, reprise telle quelle : lundi 05 Décoffrage ; mardi 06 →
// vendredi 09 Maçonnerie ; vendredi 09, congé AU-DESSUS (ordre 0) ; lundi
// 12, pareil. Vérifie, téléphone, vue 1 jour :
//   1. mardi posé : Maçonnerie (seule ce jour-là) en haut de sa case, à la
//      hauteur de Décoffrage du lundi — la piste du congé, vide le mardi,
//      ne la pousse plus vers le bas ; ligne de même hauteur ;
//   2. image par image, lundi → mardi et retour : aucune bulle à l'écran ne
//      monte ni ne descend ;
//   3. jeudi → vendredi : Maçonnerie passe bien sous le congé (ordre de la
//      case respecté) ;
//   4. rien d'un autre jour ne se voit entre deux noms (suite 59).
//
// Lancer : node test_suite73.js

const PERS = [1, 2].map((id) => ({ id, nom: ['Lionel', 'Mathis'][id - 1], sous_traitant: false, ordre: id, actif: true }));
const TACHES = [];
let id = 1;
const jour = (d, texte, ordre, abs) => { for (const demi of ['matin', 'aprem']) TACHES.push({ id: id++, personne_id: 1, date: '2026-10-' + d, demi, ordre, texte, est_absence: !!abs, chantier_id: abs ? null : 1 }); };
jour('02', 'Bétonnage', 0); jour('05', 'Décoffrage', 0);
for (const d of ['06', '07', '08']) jour(d, 'Maçonnerie', 0);
jour('09', 'Congé', 0, true); jour('09', 'Maçonnerie', 1);
jour('12', 'Congé', 0, true); jour('12', 'Maçonnerie', 1);

let horloge = Date.parse('2026-09-24T10:00:00');
async function balayer(page, dx) {
  horloge += 1000;
  await page.clock.setFixedTime(new Date(horloge));
  const de = await page.evaluate(() => { const r = document.querySelectorAll('.scroller .lbl-compacte')[1].getBoundingClientRect(); return { x: 250, y: r.top + r.height / 2 }; });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + dx * i / 4, y: de.y }] });
    await page.waitForTimeout(10);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
// Bulles de la ligne de Lionel à l'écran (au moins 20 px visibles à droite
// des noms) : haut de la carte, relatif au haut de la ligne.
const releve = () => {
  const sc = document.querySelector('.scroller'), rs = sc.getBoundingClientRect(), LN = largeurNoms();
  const lbl = sc.querySelector('.lbl-compacte'), rl = lbl.getBoundingClientRect();
  const o = { ligne: Math.round(rl.height) };
  sc.querySelectorAll('.bulle').forEach((b) => {
    // .piste-nulle : entièrement rognée, donc invisible (suite 73).
    const c = b.querySelector('.b-carte'); if (!c || b.classList.contains('piste-nulle')) return;
    const r = c.getBoundingClientRect();
    if (r.top < rl.top - 1 || r.top > rl.bottom) return;
    const vis = Math.min(r.right, rs.right) - Math.max(r.left, rs.left + LN);
    if (vis >= 20 && r.height >= 4) o[b.textContent.trim()] = Math.round((r.top - rl.top) * 10) / 10;
  });
  return o;
};
const journaliser = (page) => page.evaluate((src) => {
  const f0 = eval('(' + src + ')');
  window.__j = [];
  const t0 = performance.now();
  const f = () => { window.__j.push(f0()); if (performance.now() - t0 < 1400) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}, releve.toString());
const mouvements = (j) => {
  const par = {};
  j.forEach((x) => Object.keys(x).forEach((k) => { if (k !== 'ligne') (par[k] = par[k] || []).push(x[k]); }));
  return Object.keys(par).map((k) => [k, Math.round((Math.max(...par[k]) - Math.min(...par[k])) * 10) / 10]);
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: { personnes: PERS, taches: TACHES } });
  await page.evaluate(() => allerAuJour('2026-10-05')); await page.waitForTimeout(800);
  const lundi = await page.evaluate(releve);

  // --- 2. Lundi → mardi, image par image ---
  await journaliser(page);
  await balayer(page, -150);
  await page.waitForTimeout(1500);
  let j = await page.evaluate(() => window.__j);
  const mardi = await page.evaluate(releve);
  const iso = await page.evaluate(() => jourMobileIso);
  // --- 1. Mardi posé ---
  verifier(iso === '2026-10-06' && lundi['Décoffrage'] !== undefined && mardi['Maçonnerie'] !== undefined && Math.abs(mardi['Maçonnerie'] - lundi['Décoffrage']) <= 1.5 && mardi.ligne === lundi.ligne,
    'mardi 06 posé : Maçonnerie en haut de sa case, comme Décoffrage le lundi (' + JSON.stringify({ lundi, mardi }) + ')');
  let m = mouvements(j);
  verifier(m.length >= 2 && m.every(([, d]) => d <= 1.5), 'lundi → mardi : aucune bulle à l\'écran ne monte ni ne descend (écart haut/bas par bulle : ' + JSON.stringify(m) + ')');

  await journaliser(page);
  await balayer(page, 150);
  await page.waitForTimeout(1500);
  j = await page.evaluate(() => window.__j);
  m = mouvements(j);
  verifier(await page.evaluate(() => jourMobileIso) === '2026-10-05' && m.every(([, d]) => d <= 1.5), 'retour mardi → lundi : pareil (' + JSON.stringify(m) + ')');

  // --- 3. Jeudi → vendredi : sous le congé ---
  await page.evaluate(() => allerAuJour('2026-10-08')); await page.waitForTimeout(800);
  const jeudi = await page.evaluate(releve);
  await balayer(page, -150);
  await page.waitForTimeout(1500);
  const vendredi = await page.evaluate(releve);
  verifier(await page.evaluate(() => jourMobileIso) === '2026-10-09' && vendredi['Congé'] < vendredi['Maçonnerie'] && jeudi['Maçonnerie'] < vendredi['Maçonnerie'],
    'vendredi 09 : Maçonnerie passe sous le congé, ordre de la case gardé (' + JSON.stringify({ jeudi, vendredi }) + ')');

  // --- 4. Rien d'un autre jour entre deux noms ---
  await page.evaluate(() => allerAuJour('2026-10-06')); await page.waitForTimeout(800);
  const fuites = await page.evaluate(() => {
    const LN = largeurNoms(), out = [];
    for (let y = 150; y < 700; y++) for (const x of [5, LN / 2, LN - 3]) {
      const el = document.elementFromPoint(x, y), b = el && el.closest('.bulle');
      if (b) out.push(Math.round(x) + ',' + y + ' ' + b.textContent.trim());
    }
    return out.slice(0, 5);
  });
  verifier(fuites.length === 0, 'mardi posé : aucune bulle d\'un autre jour visible sous la colonne des noms (' + JSON.stringify(fuites) + ')');

  toutesErreurs.push(...erreurs);
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
