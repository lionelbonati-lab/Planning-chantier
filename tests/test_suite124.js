const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 124). Lionel : « Uniformiser les gestes touch
// dans l'ensemble, », puis « Règle proposée » à notre proposition : toucher
// = sélectionner · double toucher = modifier · appui long = menu · appui
// long puis glisser = déplacer · glisser sur le vide = défiler.
// Vérifie (tablette, au doigt) :
//   1. toucher une bulle : sélectionnée, pilule, pas de menu ;
//   2. double toucher une bulle : sa fiche s'ouvre ;
//   3. appui long sur une bulle, relâché sur place : elle devient la
//      sélection, menu de la bulle (Modifier…, Sélection multiple…) ;
//   4. « Sélection multiple » : les touchers suivants s'ajoutent ;
//   5. appui long puis glisser une bulle : déplacée ;
//   6. appui long sur une case vide avec une sélection : menu de la case
//      (Couper la sélection…), la sélection reste ;
//   7. double toucher une case vide : menu Ajouter ;
//   8. glisser sur le vide : défilement, rien de sélectionné ni ouvert.
//
// Lancer : node test_suite124.js

const PERS = [1, 2, 3].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS, taches: [T(1, 1, '2026-09-22', 'matin', 'Un'), T(2, 2, '2026-09-22', 'matin', 'Deux'), T(3, 3, '2026-09-23', 'matin', 'Trois'), T(4, 1, '2026-09-24', 'matin', 'Quatre')] });

const centre = (page, texte) => page.evaluate((texte) => {
  const t = TACHES.find((x) => x.texte === texte);
  const r = document.querySelector('#racine .scroller .bulle[data-id="' + t.id + '"] > .b-carte').getBoundingClientRect();
  return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 };
}, texte);
const pointCase = (page, pid, iso, demi) => page.evaluate(([pid, iso, demi]) => {
  let gi = -1;
  for (let g = 0; g < 80; g++) if (isoDeGi(g) === iso) { gi = g; break; }
  const c = document.querySelector('.cell[data-kind="personne"][data-personne="' + pid + '"][data-demi="' + demi + '"][data-jour="' + gi + '"]');
  const r = c.getBoundingClientRect();
  for (const fy of [0.85, 0.5, 0.15]) for (const fx of [0.85, 0.5, 0.15]) {
    const x = r.x + r.width * fx, y = r.y + r.height * fy;
    if (document.elementFromPoint(x, y) === c) return { x, y };
  }
  return null;
}, [pid, iso, demi]);
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
}
const toucher = async (page, p) => { await doigt(page, p, null, 40); await page.waitForTimeout(250); };
const doubleToucher = async (page, p) => { await doigt(page, p, null, 40); await page.waitForTimeout(90); await doigt(page, p, null, 40); await page.waitForTimeout(300); };
const selection = (page) => page.evaluate(() => TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort().join(','));
const menu = (page) => page.evaluate(() => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  return m ? [...m.querySelectorAll('button')].map((b) => b.textContent.trim()) : null;
});
const fiche = (page) => page.evaluate(() => !!document.querySelector('.form-pop'));
const pilule = (page) => page.evaluate(() => !document.getElementById('panneauSelection').hidden);
const fermer = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1180, height: 820 }, hasTouch: true, bd: BD(), localStorage: { 'planning.modeAjout': '0' } });

  // 1. Toucher = sélectionner.
  await toucher(page, await centre(page, 'Un'));
  verifier(await selection(page) === 'Un' && await pilule(page) && !(await menu(page)) && !(await fiche(page)), 'toucher une bulle : sélectionnée, pilule, ni menu ni fiche');

  // 2. Double toucher = modifier.
  await page.evaluate(() => { quitterModeSelection(); render(false); });
  await doubleToucher(page, await centre(page, 'Deux'));
  verifier(await fiche(page), 'double toucher une bulle : sa fiche s\'ouvre');
  verifier(await page.evaluate(() => { const f = document.querySelector('.form-pop'); return !!f && ([...f.querySelectorAll('input, textarea, select')].some((c) => c.value === 'Deux') || f.textContent.includes('Deux')); }), 'la fiche est celle de la bulle touchée (Deux)');
  await fermer(page); await fermer(page);

  // 3. Appui long relâché sur place = menu (la bulle devient la sélection).
  await page.evaluate(() => { quitterModeSelection(); render(false); });
  await toucher(page, await centre(page, 'Un'));
  await doigt(page, await centre(page, 'Deux'), null, 650);
  await page.waitForTimeout(250);
  let m = await menu(page);
  verifier(await selection(page) === 'Deux', 'appui long sur Deux : Deux remplace Un dans la sélection (' + await selection(page) + ')');
  verifier(m && m.includes('Modifier…') && m.includes('Sélection multiple') && m.includes('Copier') && m.includes('Supprimer'), 'relâché sur place : menu de la bulle avec « Sélection multiple » ' + JSON.stringify(m));
  verifier(!(await page.evaluate(() => modeSelectionMultiple)), 'l\'appui long n\'allume plus la sélection multiple');

  // 4. « Sélection multiple » puis touchers.
  await page.evaluate(() => [...[...document.querySelectorAll('body > .menu-pop')].pop().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sélection multiple').click());
  await page.waitForTimeout(150);
  verifier(await page.evaluate(() => modeSelectionMultiple) && await selection(page) === 'Deux' && !(await menu(page)), '« Sélection multiple » : mode allumé, Deux gardée, menu fermé');
  await toucher(page, await centre(page, 'Trois'));
  verifier(await selection(page) === 'Deux,Trois', 'toucher Trois l\'ajoute (' + await selection(page) + ')');
  await doigt(page, await centre(page, 'Un'), null, 650);
  await page.waitForTimeout(250);
  m = await menu(page);
  verifier(await selection(page) === 'Deux,Trois,Un' && m && m.includes('Copier (3)') && !m.includes('Sélection multiple'), 'appui long en mode multiple : bulle ajoutée, menu pour les 3 ' + JSON.stringify(m));
  await fermer(page);

  // 5. Appui long puis glisser = déplacer.
  await page.evaluate(() => { quitterModeSelection(); render(false); });
  const dep = await centre(page, 'Quatre');
  const vers = await pointCase(page, 1, '2026-09-25', 'matin');
  await doigt(page, dep, { x: vers.x, y: vers.y }, 600);
  await page.waitForTimeout(400);
  const quatre = await page.evaluate(() => { const t = TACHES.find((x) => x.texte === 'Quatre'); return isoDeGi(t.giDebut) + ' ' + t.personneId; });
  verifier(quatre === '2026-09-25 1' && !(await menu(page)), 'appui long puis glisser : Quatre déplacée au vendredi, pas de menu (' + quatre + ')');

  // 6. Appui long sur une case vide avec une sélection = menu de la case.
  await page.evaluate(() => { quitterModeSelection(); render(false); });
  await toucher(page, await centre(page, 'Un'));
  const vide = await pointCase(page, 2, '2026-09-23', 'aprem');
  await doigt(page, vide, null, 600);
  await page.waitForTimeout(250);
  m = await menu(page);
  verifier(m && m.includes('Tâche') && m.includes('Couper la sélection (1)') && await selection(page) === 'Un', 'appui long sur une case vide : menu de la case (Ajouter + Couper la sélection), Un toujours sélectionnée ' + JSON.stringify(m));
  await page.evaluate(() => [...[...document.querySelectorAll('body > .menu-pop')].pop().querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Copier la sélection')).click());
  await page.waitForTimeout(150);
  verifier(await page.evaluate(() => pressePapier.length === 1), 'le choix agit sur la sélection (Copier : presse-papiers de 1)');
  await fermer(page);

  // 7. Double toucher une case vide = ajouter.
  await page.evaluate(() => { quitterModeSelection(); render(false); });
  await page.waitForTimeout(500);
  const vide2 = await pointCase(page, 3, '2026-09-22', 'aprem');
  await doubleToucher(page, vide2);
  m = await menu(page);
  verifier(m && m.includes('Tâche') && m.includes('Absence') && await selection(page) === '', 'double toucher une case vide : menu Ajouter, rien de sélectionné ' + JSON.stringify(m));
  await fermer(page);

  // 8. Glisser sur le vide = défiler.
  await page.waitForTimeout(500);
  const vide3 = await pointCase(page, 3, '2026-09-24', 'aprem');
  await doigt(page, vide3, { x: vide3.x - 200, y: vide3.y }, 20);
  await page.waitForTimeout(400);
  verifier(await selection(page) === '' && !(await menu(page)) && !(await fiche(page)), 'glisser sur le vide : rien de sélectionné ni ouvert');

  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
