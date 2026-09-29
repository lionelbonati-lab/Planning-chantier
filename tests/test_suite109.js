const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 109). Lionel : « la sélection en mode ajout
// est encore possible en appuyant sur les en-têtes de colonnes et de
// lignes, ainsi qu'en clic droit avec la souris ».
// Vérifie, en mode ajout (« + » appuyé) :
//   1. clic sur un nom, Ctrl+clic, clic sur un jour : rien de choisi ni
//      de sélectionné ; double-clic sur un nom : toujours « Modifier » ;
//   2. clic droit sur un nom : menu sans « Sélectionner la ligne » ;
//   3. clic droit + glisser sur les cases : rien de sélectionné ;
//   4. téléphone : toucher un nom ou un jour, double toucher une case :
//      rien de sélectionné ;
//   5. mode sélection : le clic sur un nom et sur un jour choisit toujours.
//
// Lancer : node test_suite109.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS.map((p) => Object.assign({}, p)), taches: [T(1, 1, '2026-09-23', 'matin', 'Un'), T(2, 2, '2026-09-24', 'matin', 'Deux')] });

const centre = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const nom = (page, id) => centre(page, '#racine .grille > [data-ligne="' + id + '"]');
const jour = (page, iso) => page.evaluate((iso) => {
  const th = [...document.querySelectorAll('#racine .entete-planning-figee .th[data-gi]:not(.th-demi)')].find((t) => isoDeGi(+t.dataset.gi) === iso);
  if (!th) return null;
  const r = th.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, curseur: getComputedStyle(th).cursor };
}, iso);
// Point d'une case où la case elle-même est sous le pointeur.
const kase = (page, pid, iso, demi) => page.evaluate(([pid, iso, demi]) => {
  let gi = -1;
  for (let g = 0; g < 80; g++) if (isoDeGi(g) === iso) { gi = g; break; }
  const c = document.querySelector('.cell[data-kind="personne"][data-personne="' + pid + '"][data-demi="' + demi + '"][data-jour="' + gi + '"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  for (const fy of [0.85, 0.5, 0.15]) for (const fx of [0.85, 0.5, 0.15]) {
    const x = r.x + r.width * fx, y = r.y + r.height * fy;
    if (document.elementFromPoint(x, y) === c) return { x, y };
  }
  return null;
}, [pid, iso, demi]);
const etat = (page) => page.evaluate(() => ({
  sel: TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort().join(','),
  lignes: [...document.querySelectorAll('#racine .grille > .ligne-choisie')].length,
  jours: [...document.querySelectorAll('#racine .th.jour-choisi')].length,
  modif: !!document.querySelector('.form-pop .f-nom'),
  menu: (() => { const m = document.querySelector('.menu-hauteur-ligne'); return m ? [...m.querySelectorAll('button[data-a]')].map((b) => b.dataset.a) : null; })(),
}));
const rien = (e) => e.sel === '' && e.lignes === 0 && e.jours === 0;
const fermer = (page) => page.evaluate(() => document.querySelectorAll('.menu-hauteur-ligne, .form-pop, .menu-pop').forEach((p) => p.remove()));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 à 3, puis 5. Ordinateur -------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), localStorage: { 'planning.modeAjout': '1' } });
    const n1 = await nom(page, 'p1'), n2 = await nom(page, 'p2');
    await page.mouse.click(n1.x, n1.y);
    await page.waitForTimeout(450);
    await page.keyboard.down('Control');
    await page.mouse.click(n2.x, n2.y);
    await page.keyboard.up('Control');
    await page.waitForTimeout(150);
    let e = await etat(page);
    verifier(rien(e) && !e.modif, 'mode ajout : clic et Ctrl+clic sur les noms : rien de choisi ' + JSON.stringify(e));
    const j = await jour(page, '2026-09-23');
    verifier(j && j.curseur === 'default', 'mode ajout : curseur normal sur les jours (' + (j && j.curseur) + ')');
    await page.mouse.click(j.x, j.y);
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(rien(e), 'mode ajout : clic sur un jour : rien de choisi ' + JSON.stringify(e));
    await page.mouse.dblclick(n1.x, n1.y);
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.modif && rien(e), 'mode ajout : double-clic sur un nom = « Modifier » ' + JSON.stringify(e));
    await fermer(page);

    await page.waitForTimeout(450);
    await page.mouse.click(n2.x, n2.y, { button: 'right' });
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.menu && !e.menu.includes('choix') && e.menu.includes('ok') && rien(e), 'mode ajout : clic droit sur un nom = menu sans « Sélectionner la ligne » ' + JSON.stringify(e));
    await fermer(page);

    const de = await kase(page, 1, '2026-09-22', 'matin'), vers = await kase(page, 2, '2026-09-24', 'aprem');
    await page.mouse.move(de.x, de.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(vers.x, vers.y, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(200);
    e = await etat(page);
    const pop = await page.evaluate(() => !!document.querySelector('.menu-pop, .form-pop'));
    verifier(rien(e) && !pop, 'mode ajout : clic droit + glisser sur les cases : rien de sélectionné ni ouvert ' + JSON.stringify(e));

    // 5. Mode sélection : les en-têtes choisissent toujours.
    await page.click('#btnAjoutElement');
    await page.waitForTimeout(450);
    await page.mouse.click(n1.x, n1.y);
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.lignes === 1 && e.sel === 'Un', 'mode sélection : clic sur un nom = ligne choisie ' + JSON.stringify(e));
    await page.mouse.click(j.x, j.y);
    await page.waitForTimeout(150);
    e = await etat(page);
    verifier(e.jours === 1 && e.lignes === 0 && e.sel === 'Un', 'mode sélection : clic sur un jour = jour choisi ' + JSON.stringify(e));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Téléphone ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD(), localStorage: { 'planning.modeAjout': '1' } });
    const cdp = await page.context().newCDPSession(page);
    const toucher = async (p, ms) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
      await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const n2 = await nom(page, 'p2');
    await toucher(n2, 60);
    await page.waitForTimeout(500);
    let e = await etat(page);
    verifier(rien(e), 'téléphone, mode ajout : toucher un nom : rien de choisi ' + JSON.stringify(e));
    const j = await jour(page, '2026-09-24');
    if (j) {
      await toucher(j, 60);
      await page.waitForTimeout(500);
      e = await etat(page);
      verifier(rien(e), 'téléphone, mode ajout : toucher un jour : rien de choisi ' + JSON.stringify(e));
    }
    const c = await kase(page, 2, '2026-09-24', 'matin');
    await toucher(c, 40);
    await page.waitForTimeout(120);
    await toucher(c, 40);
    await page.waitForTimeout(400);
    e = await etat(page);
    verifier(e.sel === '', 'téléphone, mode ajout : double toucher une case : rien de sélectionné ' + JSON.stringify(e));
    await cdp.detach();
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
