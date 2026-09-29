const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 114). Lionel : « clic droit souris doit faire
// apparaitre un menu déroulant, différent suivant la zone ou il se situe.
// * sur un nom, déjà actif * sur une case, ajout, couper/copier/coller * sur
// une bulle, couper/copier/coller * d'autres propositions? »
// Vérifie (ordinateur) :
//   1. clic droit sur une bulle : elle seule sélectionnée, menu Modifier /
//      Couper / Copier / Supprimer ; Copier remplit le presse-papiers ;
//   2. clic droit sur une case vide : menu Ajouter avec « Coller (1) » ;
//      Coller pose la copie sur cette case ;
//   3. bulle d'une sélection de 2 : menu pour les 2 (Couper (2)) ; case avec
//      une sélection : « Couper / Copier la sélection (2) » ; Couper retire
//      les 2 bulles ;
//   4. clic droit + glisser (mode sélection) : zone sélectionnée, pas de menu ;
//   5. mode ajout : clic droit sur une case = même menu ; ligne Notes : Note… ;
//   6. Modifier… ouvre la fiche de la bulle.
//
// Lancer : node test_suite114.js

const PERS = [1, 2].map((id) => ({ id, nom: 'Personne ' + id, sous_traitant: false, ordre: id, actif: true }));
const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const BD = () => ({ personnes: PERS, taches: [T(1, 1, '2026-09-22', 'matin', 'Un'), T(2, 2, '2026-09-22', 'matin', 'Deux')] });

const centreBulle = (page, t) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('#racine .scroller .bulle')].find((x) => x.querySelector('.b-txt').textContent.trim() === t);
  const r = b.querySelector('.b-carte').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, t);
const centreCase = (page, sel) => page.evaluate((sel) => {
  let gi = -1;
  for (let g = 0; g < 80; g++) if (isoDeGi(g) === sel.iso) { gi = g; break; }
  const q = sel.kind === 'personne' ? '.cell[data-kind="personne"][data-personne="' + sel.p + '"][data-demi="' + sel.demi + '"][data-jour="' + gi + '"]' : '.cell[data-kind="' + sel.kind + '"][data-jour="' + gi + '"]';
  const r = document.querySelector(q).getBoundingClientRect();
  return { x: r.left + (sel.gauche ? r.width / 4 : r.width / 2), y: r.bottom - 6 };
}, sel);
const clicDroit = async (page, p) => { await page.mouse.click(p.x, p.y, { button: 'right' }); await page.waitForTimeout(200); };
const menu = (page) => page.evaluate(() => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  return m ? [...m.querySelectorAll('button')].map((b) => b.textContent.trim()) : null;
});
const choisir = (page, libelle) => page.evaluate((l) => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  [...m.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(l)).click();
}, libelle);
const selection = (page) => page.evaluate(() => TACHES.filter((t) => bullesSelectionnees[t.id]).map((t) => t.texte).sort().join(','));
const textes = (page) => page.evaluate(() => TACHES.map((t) => t.texte + '@' + t.personneId + ':' + isoDeGi(t.giDebut)).sort().join(','));

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });

  // 1. Bulle
  await clicDroit(page, await centreBulle(page, 'Un'));
  let m = await menu(page);
  verifier(JSON.stringify(m) === JSON.stringify(['Modifier…', 'Couper', 'Copier', 'Supprimer']) && await selection(page) === 'Un',
    'clic droit sur une bulle : sélectionnée, menu Modifier/Couper/Copier/Supprimer ' + JSON.stringify(m));
  await choisir(page, 'Copier');
  await page.waitForTimeout(150);
  verifier(await page.evaluate(() => pressePapier.length === 1 && !document.querySelector('body > .menu-pop')), 'Copier : presse-papiers rempli, menu fermé');

  // 2. Case vide
  await page.evaluate(() => { quitterModeSelection(); render(false); });
  await clicDroit(page, await centreCase(page, { kind: 'personne', p: 2, demi: 'matin', iso: '2026-09-24' }));
  m = await menu(page);
  verifier(m && m.includes('Tâche') && m.includes('Coller (1)') && !m.some((l) => /sélection/.test(l)), 'clic droit sur une case : menu Ajouter avec Coller ' + JSON.stringify(m));
  await choisir(page, 'Coller');
  await page.waitForTimeout(200);
  let t = await textes(page);
  verifier(t.includes('Un@2:2026-09-24'), 'Coller : la copie posée sur la case (' + t + ')');

  // 3. Sélection de 2
  await page.evaluate(() => { quitterModeSelection(); TACHES.forEach((x) => { if (x.texte === 'Deux' || (x.texte === 'Un' && x.personneId == 1)) bullesSelectionnees[x.id] = true; }); modeSelectionMultiple = true; render(false); majBarreSelection(); });
  await clicDroit(page, await centreBulle(page, 'Deux'));
  m = await menu(page);
  verifier(JSON.stringify(m) === JSON.stringify(['Couper (2)', 'Copier (2)', 'Coller ici (1)', 'Supprimer (2)']), 'bulle d\'une sélection de 2 : menu pour les 2, sans Modifier ' + JSON.stringify(m));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { TACHES.forEach((x) => { if (x.texte === 'Deux' || (x.texte === 'Un' && x.personneId == 1)) bullesSelectionnees[x.id] = true; }); modeSelectionMultiple = true; render(false); majBarreSelection(); });
  await clicDroit(page, await centreCase(page, { kind: 'personne', p: 1, demi: 'aprem', iso: '2026-09-25' }));
  m = await menu(page);
  verifier(m && m.includes('Couper la sélection (2)') && m.includes('Copier la sélection (2)'), 'case avec une sélection : Couper / Copier la sélection ' + JSON.stringify(m));
  await choisir(page, 'Couper la sélection');
  await page.waitForTimeout(200);
  t = await textes(page);
  verifier(t === 'Un@2:2026-09-24' && await page.evaluate(() => pressePapier.length === 2), 'Couper : les 2 bulles retirées, presse-papiers de 2 (' + t + ')');

  // 4. Clic droit + glisser
  const a = await centreCase(page, { kind: 'personne', p: 2, demi: 'matin', iso: '2026-09-23' }), b = await centreBulle(page, 'Un');
  await page.mouse.move(a.x, a.y); await page.mouse.down({ button: 'right' });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(200);
  verifier(await selection(page) === 'Un' && !(await menu(page)), 'clic droit + glisser : zone sélectionnée, pas de menu');
  await page.evaluate(() => { quitterModeSelection(); render(false); });

  // 5. Mode ajout, ligne Notes
  await page.click('#btnModeAjout');
  await page.waitForTimeout(150);
  await clicDroit(page, await centreCase(page, { kind: 'personne', p: 1, demi: 'matin', iso: '2026-09-21' }));
  m = await menu(page);
  verifier(m && m.includes('Tâche') && m.includes('Coller (2)'), 'mode ajout : clic droit sur une case = même menu ' + JSON.stringify(m));
  await page.keyboard.press('Escape');
  await clicDroit(page, await centreCase(page, { kind: 'note', iso: '2026-09-21', gauche: true }));
  m = await menu(page);
  verifier(JSON.stringify(m) === JSON.stringify(['Note…', 'Coller (2)']), 'ligne Notes : Note… et Coller ' + JSON.stringify(m));
  await page.keyboard.press('Escape');
  await page.click('#btnModeAjout');
  await page.waitForTimeout(150);

  // 6. Modifier…
  await clicDroit(page, await centreBulle(page, 'Un'));
  await choisir(page, 'Modifier');
  await page.waitForTimeout(300);
  verifier(await page.evaluate(() => !!document.querySelector('.form-pop, .carte-item, .pop.edition, .pop:not(.menu-pop)')), 'Modifier… : fiche de la bulle ouverte');

  toutesErreurs.push(...erreurs);
  await page.close();
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
