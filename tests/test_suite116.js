const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 116). Lionel : « Continue avec replier les
// lignes et la largeur des jours ».
// Vérifie :
//   1. menu du nom : « Replier la ligne » → fine bande (18 px), bulles
//      cachées, les autres lignes inchangées, retenu par l'appareil ;
//   2. clic sur le nom d'une ligne repliée : dépliée, sans la choisir ;
//   3. plusieurs lignes choisies : « Replier les 2 lignes », puis
//      « Déplier toutes les lignes » ;
//   4. la ligne Jalons se replie aussi ;
//   5. téléphone : repli retenu à part (clé .tel).
//
// Lancer : node test_suite116.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, texte) => ({ id, personne_id: pid, date: '2026-09-24', demi: 'matin', ordre: 0, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS, taches: [T(1, 1, 'Un'), T(2, 2, 'Deux'), T(3, 3, 'Trois')],
  jalons: [{ id: 1, date: '2026-09-24', demi: 'matin', texte: 'Réception', chantier_id: 1 }] });

const etat = (page) => page.evaluate(() => {
  const l = (id) => document.querySelector('#racine .grille > [data-ligne="' + id + '"]');
  const bulle = (t) => [...document.querySelectorAll('#racine .bulle')].find((b) => b.textContent.includes(t));
  const vis = (b) => !!b && b.getClientRects().length > 0;
  return {
    h: ['p1', 'p2', 'p3', 'jalon'].map((id) => Math.round(l(id).getBoundingClientRect().height)),
    repl: ['p1', 'p2', 'p3', 'jalon'].map((id) => l(id).classList.contains('ligne-repliee')),
    bulles: ['Un', 'Deux', 'Trois', 'Réception'].map((t) => vis(bulle(t))),
    ls: localStorage.getItem('planning.lignesRepliees'), lsTel: localStorage.getItem('planning.lignesRepliees.tel'),
    choisies: document.querySelectorAll('#racine .ligne-choisie').length,
  };
});
const centre = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
async function menu(page, id, action) {
  const c = await centre(page, id);
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(150);
  const libelle = await page.evaluate((a) => { const b = document.querySelector('.menu-hauteur-ligne [data-a="' + a + '"]'); return b ? b.textContent : null; }, action);
  if (libelle) await page.click('.menu-hauteur-ligne [data-a="' + action + '"]');
  await page.waitForTimeout(200);
  return libelle;
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    const e0 = await etat(page);

    // --- 1. Replier une ligne ------------------------------------------------------
    let lib = await menu(page, 'p1', 'replier');
    let e = await etat(page);
    verifier(lib === 'Replier la ligne', 'menu du nom : « Replier la ligne » (' + lib + ')');
    verifier(e.repl[0] && e.h[0] === 18 && !e.bulles[0], 'ligne repliée : 18 px, bulle cachée ' + JSON.stringify(e));
    verifier(!e.repl[1] && e.h[1] === e0.h[1] && e.bulles[1] && e.bulles[2], 'les autres lignes ne bougent pas ' + JSON.stringify(e));
    verifier(e.ls === '["p1"]', 'repli retenu par l\'appareil (' + e.ls + ')');

    // --- 2. Clic sur le nom : déplier ---------------------------------------------
    const c = await centre(page, 'p1');
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(250);
    e = await etat(page);
    verifier(!e.repl[0] && e.h[0] === e0.h[0] && e.bulles[0] && e.choisies === 0 && e.ls === '[]',
      'clic sur une ligne repliée : dépliée, pas choisie ' + JSON.stringify(e));

    // --- 3. Plusieurs lignes ---------------------------------------------------------
    await page.keyboard.down('Control');
    for (const id of ['p2', 'p3']) { const k = await centre(page, id); await page.mouse.click(k.x, k.y); await page.waitForTimeout(150); }
    await page.keyboard.up('Control');
    lib = await menu(page, 'p2', 'replier');
    e = await etat(page);
    verifier(lib === 'Replier les 2 lignes' && e.repl[1] && e.repl[2] && !e.repl[0], '« Replier les 2 lignes » (' + lib + ', ' + JSON.stringify(e.repl) + ')');

    // --- 4. Jalons ------------------------------------------------------------------
    lib = await menu(page, 'jalon', 'replier');
    e = await etat(page);
    verifier(e.repl[3] && e.h[3] === 18 && !e.bulles[3], 'ligne Jalons repliée, jalon caché ' + JSON.stringify(e));

    lib = await menu(page, 'p1', 'toutDeplier');
    e = await etat(page);
    verifier(lib === 'Déplier toutes les lignes (3)' && !e.repl.some(Boolean) && e.bulles.every(Boolean) && e.ls === '[]',
      '« Déplier toutes les lignes (3) » ' + JSON.stringify(e) + ' ' + lib);
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 5. Téléphone ----------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD(), localStorage: { 'planning.lignesRepliees': '["p2"]' } });
    let e = await etat(page);
    verifier(!e.repl[1], 'téléphone : le repli de l\'ordinateur ne s\'applique pas ' + JSON.stringify(e.repl));
    await page.evaluate(() => { ouvrirMenuHauteurLigne(document.querySelector('#racine .grille > [data-ligne="p1"]'), 100, 100); });
    await page.click('.menu-hauteur-ligne [data-a="replier"]');
    await page.waitForTimeout(300);
    e = await etat(page);
    verifier(e.repl[0] && e.h[0] === 18 && e.lsTel === '["p1"]' && e.ls === '["p2"]', 'téléphone : repli retenu à part ' + JSON.stringify(e));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
