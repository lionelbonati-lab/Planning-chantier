const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 102). Lionel : « Pour la sélection attention
// au geste de la souris clic droit/gauche suivi d'un glisser. Si on garde
// ta proposition de sélection on doit modifier l'utilisation du bouton "+",
// plus de menu mais un appuis sur le bouton met le planning en mode ajout
// au lieu de sélection (ancien clic souris gauche). Bouton non appuyer mode
// sélection. Attention à traiter aussi la partie tactile. »
// Vérifie :
//   1. ordinateur, mode sélection par défaut : « + » relâché, sans menu,
//      curseur « cell » ; simple clic sur une case vide = rien ; glisser
//      gauche = les bulles de la zone sélectionnées ; Ctrl+glisser =
//      ajoutées ; glisser seul = remplacent ; simple clic = sélection vidée ;
//   2. « + » appuyé : mode ajout retenu (localStorage), curseur « copy »,
//      clic = popup d'ajout, glisser = ajout sur la plage ; clic
//      droit + glisser sélectionne toujours ; rouvert : toujours appuyé ;
//      rappuyé : mode sélection ;
//   3. téléphone, mode sélection : appui long puis glisser = zone
//      sélectionnée ; appui long sans bouger = rien ; glisser rapide =
//      défilement, rien de sélectionné ; mode ajout : appui long = popup.
//
// Lancer : node test_suite102.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const TACHES = [T(1, 1, '2026-09-22', 'matin', 'Un'), T(2, 1, '2026-09-23', 'matin', 'Deux'), T(3, 2, '2026-09-24', 'matin', 'Trois'), T(4, 1, '2026-09-24', 'matin', 'Quatre')];
const BD = () => ({ personnes: PERS, taches: TACHES.map((t) => Object.assign({}, t)) });

// Point d'une case (personne, jour, demi) où la case elle-même est sous le
// pointeur (pas une bulle) — là où le geste « case vide » démarre.
const point = (page, pid, iso, demi) => page.evaluate(([pid, iso, demi]) => {
  let gi = -1;
  for (let g = 0; g < 80; g++) if (isoDeGi(g) === iso) { gi = g; break; }
  const c = document.querySelector('.cell[data-kind="personne"][data-personne="' + pid + '"][data-demi="' + demi + '"][data-jour="' + gi + '"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  for (const fy of [0.85, 0.5, 0.15]) for (const fx of [0.85, 0.5, 0.15]) {
    const x = r.x + r.width * fx, y = r.y + r.height * fy;
    if (document.elementFromPoint(x, y) === c) return { x, y, curseur: getComputedStyle(c).cursor };
  }
  return null;
}, [pid, iso, demi]);
// Textes des bulles sélectionnées (les id internes sont « b1 », « b2 »…).
const selection = (page) => page.evaluate(() => TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort());
const popup = (page) => page.evaluate(() => ({ menu: !!document.querySelector('.menu-pop'), form: !!document.querySelector('.form-pop') }));
async function fermerPopups(page) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); if ((await popup(page)).menu || (await popup(page)).form) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); } }
async function glisser(page, de, vers, options) {
  options = options || {};
  await page.mouse.move(de.x, de.y);
  if (options.ctrl) await page.keyboard.down('Control');
  await page.mouse.down({ button: options.button || 'left' });
  await page.mouse.move((de.x + vers.x) / 2, (de.y + vers.y) / 2, { steps: 5 });
  await page.mouse.move(vers.x, vers.y, { steps: 5 });
  await page.mouse.up({ button: options.button || 'left' });
  if (options.ctrl) await page.keyboard.up('Control');
  await page.waitForTimeout(150);
}
async function cliquer(page, p) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(200); }
async function doigt(page, de, vers, attente) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
  await page.waitForTimeout(attente);
  if (vers) for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + (vers.x - de.x) * i / 10, y: de.y + (vers.y - de.y) * i / 10 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Ordinateur, mode sélection ---------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), localStorage: { 'planning.modeAjout': '0' } });
    const b = await page.evaluate(() => {
      const btn = document.getElementById('btnAjoutElement');
      return { actif: btn.classList.contains('actif'), pressed: btn.getAttribute('aria-pressed'), menu: !!document.querySelector('#groupeAjoutElement .outil-menu-panneau'), corps: document.body.classList.contains('planning-mode-ajout') };
    });
    verifier(!b.actif && b.pressed === 'false' && !b.menu && !b.corps, '« + » relâché par défaut, sans menu : ' + JSON.stringify(b));
    const vide = await point(page, 3, '2026-09-24', 'matin');
    verifier(vide && vide.curseur === 'cell', 'curseur « cell » en mode sélection : ' + (vide && vide.curseur));
    await cliquer(page, vide);
    let p = await popup(page);
    verifier(!p.menu && !p.form && (await selection(page)).length === 0, 'simple clic sur une case vide : rien ne s\'ouvre ' + JSON.stringify(p));

    const d1 = await point(page, 1, '2026-09-22', 'matin'), d2 = await point(page, 1, '2026-09-23', 'matin');
    await glisser(page, d1, d2);
    let s = await selection(page);
    p = await popup(page);
    verifier(JSON.stringify(s) === '["Deux","Un"]' && !p.menu && !p.form, 'glisser gauche : bulles « Un » et « Deux » sélectionnées, pas d\'ajout : ' + JSON.stringify(s));
    const nSel = await page.evaluate(() => document.querySelectorAll('.bulle.selectionnee').length);
    verifier(nSel >= 2, 'bulles marquées « selectionnee » : ' + nSel);

    const d3 = await point(page, 2, '2026-09-24', 'matin'), d3b = await point(page, 3, '2026-09-24', 'matin');
    await glisser(page, d3, d3b, { ctrl: true });
    s = await selection(page);
    verifier(JSON.stringify(s) === '["Deux","Trois","Un"]', 'Ctrl+glisser : « Trois » ajoutée à la sélection : ' + JSON.stringify(s));

    await glisser(page, d3, d3b);
    s = await selection(page);
    verifier(JSON.stringify(s) === '["Trois"]', 'glisser sans Ctrl : la zone remplace la sélection : ' + JSON.stringify(s));

    await cliquer(page, vide);
    s = await selection(page);
    verifier(s.length === 0, 'simple clic à côté : sélection vidée : ' + JSON.stringify(s));

    // --- 2. « + » appuyé : mode ajout --------------------------------------
    await page.click('#btnAjoutElement');
    await page.waitForTimeout(200);
    const b2 = await page.evaluate(() => {
      const btn = document.getElementById('btnAjoutElement');
      return { actif: btn.classList.contains('actif'), pressed: btn.getAttribute('aria-pressed'), ls: localStorage.getItem('planning.modeAjout'), corps: document.body.classList.contains('planning-mode-ajout'), menuOuvert: !!document.querySelector('.outil-menu.ouvert') };
    });
    verifier(b2.actif && b2.pressed === 'true' && b2.ls === '1' && b2.corps && !b2.menuOuvert, '« + » appuyé : mode ajout retenu, aucun menu : ' + JSON.stringify(b2));
    const vide2 = await point(page, 3, '2026-09-24', 'matin');
    verifier(vide2.curseur === 'copy', 'curseur « copy » en mode ajout : ' + vide2.curseur);
    await cliquer(page, vide2);
    p = await popup(page);
    verifier(p.menu, 'mode ajout : clic sur une case vide = popup d\'ajout');
    await fermerPopups(page);
    const a1 = await point(page, 3, '2026-09-21', 'matin'), a2 = await point(page, 3, '2026-09-23', 'aprem');
    await glisser(page, a1, a2);
    // ouvrirAjoutPlage : même .menu-pop, titré « Ajouter (taille) ».
    const titre = await page.evaluate(() => { const t = document.querySelector('.menu-pop .cp-titre'); return t ? t.textContent : ''; });
    s = await selection(page);
    verifier(/Ajouter \(/.test(titre) && s.length === 0, 'mode ajout : glisser = ajout sur la plage, rien de sélectionné : ' + titre);
    await fermerPopups(page);
    await glisser(page, d1, d2, { button: 'right' });
    s = await selection(page);
    verifier(JSON.stringify(s) === '["Deux","Un"]', 'mode ajout : clic droit + glisser sélectionne toujours : ' + JSON.stringify(s));
    await page.evaluate(() => { quitterModeSelection(); render(false); });
    await page.click('#btnAjoutElement');
    await page.waitForTimeout(200);
    const b4 = await page.evaluate(() => [document.getElementById('btnAjoutElement').classList.contains('actif'), localStorage.getItem('planning.modeAjout'), modeAjoutPlanning]);
    verifier(!b4[0] && b4[1] === '0' && !b4[2], 'rappuyé : retour au mode sélection ' + JSON.stringify(b4));
    toutesErreurs.push(...erreurs);
    await page.close();
    // Réouverture avec « planning.modeAjout » = 1 (retenu par l'appareil).
    const o = await ouvrirPlanning(browser, { bd: BD(), localStorage: { 'planning.modeAjout': '1' } });
    const b3 = await o.page.evaluate(() => [document.getElementById('btnAjoutElement').classList.contains('actif'), modeAjoutPlanning, document.body.classList.contains('planning-mode-ajout')]);
    verifier(b3[0] && b3[1] && b3[2], 'rouvert : toujours en mode ajout ' + JSON.stringify(b3));
    toutesErreurs.push(...o.erreurs);
    await o.page.close();
  }

  // --- 3. Téléphone -----------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD(), localStorage: { 'planning.modeAjout': '0' } });
    const t1 = await point(page, 1, '2026-09-24', 'matin'), t2 = await point(page, 2, '2026-09-24', 'matin');
    verifier(t1 && t2, 'téléphone : cases du jeudi trouvées');
    await doigt(page, t1, null, 600);
    let s = await selection(page), p = await popup(page);
    verifier(s.length === 0 && !p.menu && !p.form, 'mode sélection : appui long sans bouger = rien ' + JSON.stringify([s, p]));
    await doigt(page, t1, t2, 500);
    s = await selection(page); p = await popup(page);
    verifier(JSON.stringify(s) === '["Quatre","Trois"]' && !p.menu && !p.form, 'mode sélection : appui long + glisser = zone sélectionnée : ' + JSON.stringify(s));
    await page.evaluate(() => { quitterModeSelection(); render(false); });
    await page.waitForTimeout(150);
    const t1b = await point(page, 1, '2026-09-24', 'aprem');
    await doigt(page, t1b, { x: t1b.x, y: t1b.y + 120 }, 20);
    s = await selection(page); p = await popup(page);
    verifier(s.length === 0 && !p.menu && !p.form, 'glisser rapide = défilement, rien de sélectionné ni ouvert');

    await page.waitForTimeout(800);
    await page.click('#btnAjoutElement');
    await page.waitForTimeout(300);
    verifier(await page.evaluate(() => modeAjoutPlanning), 'téléphone : « + » appuyé = mode ajout');
    // Autre case que la précédente : l'horloge du test est figée (Date.now()
    // constant), 2 appuis sur la même case passeraient pour un double-tap.
    const t1c = await point(page, 3, '2026-09-24', 'aprem');
    await doigt(page, t1c, null, 600);
    p = await popup(page);
    verifier(p.menu, 'téléphone, mode ajout : appui long = popup d\'ajout');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
