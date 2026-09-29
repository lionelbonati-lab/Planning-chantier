const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 108). Lionel : « Pour éviter une sélection
// indésirable de bulles, on pourrait faire une fenêtre de sélection plutôt
// qu'une sélection par case, comme les rectangles bleus qu'on fait
// actuellement. »
// Vérifie :
//   1. ordinateur : glisser depuis une case vide jusque dans une bulle =
//      seule cette bulle est sélectionnée, pas sa voisine de la même case ;
//      le rectangle bleu suit le pointeur pendant le geste ;
//   2. Ctrl+glisser ajoute, glisser seul remplace ;
//   3. un rectangle qui ne touche aucune bulle ne sélectionne rien, même
//      s'il passe dans des cases qui en contiennent ;
//   4. téléphone : appui long puis glisser = même fenêtre libre.
//
// Lancer : node test_suite108.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: id, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS, taches: [
  T(1, 1, '2026-09-23', 'matin', 'Haut'), T(2, 1, '2026-09-23', 'matin', 'Bas'),
  T(3, 1, '2026-09-24', 'matin', 'Jeudi'), T(4, 2, '2026-09-23', 'matin', 'Autre'),
  T(5, 1, '2026-09-24', 'matin', 'Jeudi2')] });

// Rectangles (écran) des cartes visibles, par texte de bulle.
const cartes = (page) => page.evaluate(() => {
  const o = {};
  document.querySelectorAll('#racine .bulle[data-id]').forEach((b) => {
    const t = TACHES.find((x) => String(x.id) === b.dataset.id);
    b.querySelectorAll(':scope > .b-carte').forEach((c) => {
      if (!c.offsetWidth) return;
      const r = c.getBoundingClientRect();
      (o[t.texte] = o[t.texte] || []).push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    });
  });
  return o;
});
// Point d'une case vide (la case elle-même sous le pointeur) à la hauteur y.
const pointCase = (page, pid, iso, demi, y) => page.evaluate(([pid, iso, demi, y]) => {
  let gi = -1;
  for (let g = 0; g < 80; g++) if (isoDeGi(g) === iso) { gi = g; break; }
  const c = document.querySelector('.cell[data-kind="personne"][data-personne="' + pid + '"][data-demi="' + demi + '"][data-jour="' + gi + '"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    const x = r.x + r.width * fx;
    if (document.elementFromPoint(x, y) === c) return { x, y };
  }
  return null;
}, [pid, iso, demi, y]);
const selection = (page) => page.evaluate(() => TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort().join(','));
const touche = (r, y) => y >= r.top && y <= r.bottom;
// Hauteur y dans la carte `texte` mais hors des cartes `autres` (même colonne).
function yLibre(c, texte, autres) {
  const r = c[texte][0];
  for (let y = r.top + 2; y < r.bottom - 1; y++) if (!autres.some((a) => (c[a] || []).some((ra) => touche(ra, y)))) return y;
  return null;
}
async function glisser(page, de, vers, options) {
  options = options || {};
  await page.mouse.move(de.x, de.y);
  if (options.ctrl) await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move((de.x + vers.x) / 2, (de.y + vers.y) / 2, { steps: 5 });
  const pendant = await page.evaluate(() => {
    const o = document.getElementById('selection-overlay');
    if (!o || o.style.display === 'none') return null;
    const r = o.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, classe: o.className };
  });
  await page.mouse.move(vers.x, vers.y, { steps: 5 });
  await page.mouse.up();
  if (options.ctrl) await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  return pendant;
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 3. Ordinateur -----------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    let c = await cartes(page);
    const y = yLibre(c, 'Haut', ['Bas']);
    const de = y !== null && await pointCase(page, 1, '2026-09-22', 'matin', y);
    verifier(!!de, 'ordinateur : point de départ sur une case vide, à la hauteur de « Haut » seule ' + JSON.stringify({ y, de }));
    const vers = { x: (c.Haut[0].left + c.Haut[0].right) / 2, y };
    const pendant = await glisser(page, de, vers);
    const mx = (de.x + vers.x) / 2;
    verifier(pendant && pendant.classe === 'actif-defaut' && Math.abs(pendant.left - de.x) < 2 && Math.abs(pendant.right - mx) < 2,
      'le rectangle bleu va du point d\'appui au pointeur ' + JSON.stringify({ pendant, de, mx }));
    verifier((await selection(page)) === 'Haut', 'fenêtre qui ne touche que « Haut » : « Bas » (même case) non sélectionnée (' + await selection(page) + ')');
    const cache = await page.evaluate(() => { const o = document.getElementById('selection-overlay'); return !o || o.style.display === 'none'; });
    verifier(cache, 'rectangle masqué au relâcher');

    // 2. Ctrl+glisser ajoute « Autre », glisser seul remplace par « Jeudi… ».
    c = await cartes(page);
    const yA = (c.Autre[0].top + c.Autre[0].bottom) / 2;
    const deA = await pointCase(page, 2, '2026-09-22', 'matin', yA);
    await glisser(page, deA, { x: (c.Autre[0].left + c.Autre[0].right) / 2, y: yA }, { ctrl: true });
    verifier((await selection(page)) === 'Autre,Haut', 'Ctrl+glisser : « Autre » ajoutée (' + await selection(page) + ')');
    c = await cartes(page);
    const yJ = yLibre(c, 'Jeudi', ['Jeudi2']) !== null ? yLibre(c, 'Jeudi', ['Jeudi2']) : null;
    const deJ = yJ !== null && await pointCase(page, 1, '2026-09-25', 'matin', yJ);
    verifier(!!deJ, 'point de départ à droite de « Jeudi » seule ' + JSON.stringify({ yJ, deJ }));
    await glisser(page, deJ, { x: (c.Jeudi[0].left + c.Jeudi[0].right) / 2, y: yJ });
    verifier((await selection(page)) === 'Jeudi', 'glisser seul (de droite à gauche) : la fenêtre remplace la sélection (' + await selection(page) + ')');

    // 3. Fenêtre dans des cases pleines, sans toucher de carte.
    await page.evaluate(() => { quitterModeSelection(); render(false); });
    c = await cartes(page);
    const vide = await page.evaluate((c) => {
      let gi = -1;
      for (let g = 0; g < 80; g++) if (isoDeGi(g) === '2026-09-23') { gi = g; break; }
      const cell = document.querySelector('.cell[data-kind="personne"][data-personne="1"][data-demi="matin"][data-jour="' + gi + '"]');
      const r = cell.getBoundingClientRect();
      const toutes = Object.values(c).flat();
      for (let y = r.bottom - 2; y > r.top; y--) for (let x = r.left + 2; x < r.right - 12; x++) {
        const libre = (xx, yy) => !toutes.some((q) => xx >= q.left && xx <= q.right && yy >= q.top && yy <= q.bottom);
        if (document.elementFromPoint(x, y) === cell && libre(x, y) && libre(x + 8, y)) return { x, y };
      }
      return null;
    }, c);
    if (vide) {
      await glisser(page, vide, { x: vide.x + 8, y: vide.y });
      verifier((await selection(page)) === '', 'fenêtre dans la case de « Haut » et « Bas » sans les toucher : rien de sélectionné (' + await selection(page) + ')');
    } else verifier(true, 'case pleine sans coin libre : vérification 3 sans objet');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Téléphone ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD() });
    const c = await cartes(page);
    const bas = c.Jeudi && c.Jeudi2 ? (c.Jeudi[0].bottom > c.Jeudi2[0].bottom ? 'Jeudi' : 'Jeudi2') : null;
    const haut = bas === 'Jeudi' ? 'Jeudi2' : 'Jeudi';
    const cible = bas && { x: (c[bas][0].left + c[bas][0].right) / 2, y: c[bas][0].bottom - 2 };
    // Départ : case vide de la personne 2, plus bas.
    const de = await page.evaluate(() => {
      let gi = -1;
      for (let g = 0; g < 80; g++) if (isoDeGi(g) === '2026-09-24') { gi = g; break; }
      const cell = document.querySelector('.cell[data-kind="personne"][data-personne="2"][data-demi="matin"][data-jour="' + gi + '"]');
      const r = cell.getBoundingClientRect();
      for (const fy of [0.5, 0.8, 0.2]) { const x = r.x + r.width * 0.5, y = r.y + r.height * fy; if (document.elementFromPoint(x, y) === cell) return { x, y }; }
      return null;
    });
    verifier(!!cible && !!de && c[haut][0].bottom < cible.y, 'téléphone : « ' + bas + ' » sous « ' + haut + ' », départ sur une case vide ' + JSON.stringify({ cible, de }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
    await page.waitForTimeout(500);
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + (cible.x - de.x) * i / 10, y: de.y + (cible.y - de.y) * i / 10 }] });
      await page.waitForTimeout(30);
    }
    const visible = await page.evaluate(() => { const o = document.getElementById('selection-overlay'); return !!o && o.style.display !== 'none'; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(250);
    verifier(visible, 'téléphone : rectangle bleu visible pendant le geste');
    verifier((await selection(page)) === bas, 'téléphone : appui long + glisser jusqu\'au bas de « ' + bas + ' » : elle seule (' + await selection(page) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
