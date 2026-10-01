const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 139). Lionel : « Chaque machine/transport a sa
// coche qui le fera apparaître ou non dans la liste clic droit. »
// Vérifie :
//   1. pages Machines / Transports : coche « Afficher » en tête de chaque
//      élément (cochée sauf élément masqué) ; la coche du groupe devient
//      « Afficher la ligne dans le planning » ;
//   2. clic droit sur une case Machines : seuls les éléments cochés ;
//   3. décocher / cocher sur la page : masque en base, le menu suit ;
//   4. Transports, seul élément décoché : « Aucun élément coché » ;
//   5. aucune erreur JS.
//
// Lancer : node test_suite139.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const BD = {
  personnes: [P(1, 'Paul', 1), P(20, 'Machines', 2, { groupe_id: 1 }), P(21, 'Transports', 3, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  taches: [],
  elements_groupes: [{ id: 1, groupe_id: 1, nom: 'Pelle', ordre: 1, masque: false }, { id: 2, groupe_id: 1, nom: 'Grue', ordre: 2, masque: true },
    { id: 3, groupe_id: 2, nom: 'Gravier', ordre: 1, masque: false }]
};
async function allerPage(page, nom) {
  await page.evaluate((n) => document.querySelector('.onglets-liste .onglet[data-page="' + n + '"]').click(), nom);
  await page.waitForTimeout(500);
}
async function menuCase(page, p) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const c = await page.evaluate((id) => {
    const r = document.querySelector('.cell[data-kind="personne"][data-personne="' + id + '"][data-demi="matin"][data-jour="' + giDepuisIso('2026-09-24') + '"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, p);
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const m = [...document.querySelectorAll('body > .menu-pop')].pop();
    return m ? { boutons: [...m.querySelectorAll('button')].map((b) => b.textContent.trim()), vide: (m.querySelector('.mc-vide') || {}).textContent || '' } : null;
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return m;
}
const lignesPage = (page, zone) => page.evaluate((z) => [...document.querySelectorAll(z + ' .liste-elements .ligne-intervenant')].map((l) => {
  const c = l.querySelector('.chk-afficher-el');
  return l.querySelector('b').textContent + ':' + (c && l.firstElementChild === c.closest('label') ? (c.checked ? 'oui' : 'non') : 'absente');
}).join(), zone);
const cliquerCoche = (page, zone, id) => page.evaluate((a) => document.querySelector(a[0] + ' .ligne-intervenant[data-id="' + a[1] + '"] .chk-afficher-el').click(), [zone, id]);
const masqueEl = (page, id) => page.evaluate((i) => window.__BD.elements_groupes.find((e) => e.id === i).masque, id);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
  await page.waitForTimeout(500);

  // --- 1. Coches sur les pages --------------------------------------------------------
  await allerPage(page, 'machines');
  const mach = await lignesPage(page, '#listesGroupes');
  const groupe = await page.evaluate(() => document.querySelector('#listesGroupes .afficher-groupe').textContent.trim());
  await allerPage(page, 'transports');
  const trans = await lignesPage(page, '#listeTransports');
  verifier(mach === 'Pelle:oui,Grue:non' && trans === 'Gravier:oui' && groupe === 'Afficher la ligne dans le planning',
    'coche « Afficher » en tête de chaque élément, coche du groupe pour la ligne (' + JSON.stringify([mach, trans, groupe]) + ')');

  // --- 2. Clic droit : éléments cochés seulement --------------------------------------
  await allerPage(page, 'planning');
  const m1 = await menuCase(page, 20);
  verifier(m1 && m1.boutons.includes('Pelle') && !m1.boutons.includes('Grue'), 'clic droit sur Machines : Pelle proposée, Grue (décochée) non (' + JSON.stringify(m1) + ')');

  // --- 3. Décocher / cocher -------------------------------------------------------------
  await allerPage(page, 'machines');
  await cliquerCoche(page, '#listesGroupes', 1);
  await page.waitForTimeout(600);
  await cliquerCoche(page, '#listesGroupes', 2);
  await page.waitForTimeout(600);
  const base = [await masqueEl(page, 1), await masqueEl(page, 2)];
  const mach2 = await lignesPage(page, '#listesGroupes');
  await allerPage(page, 'planning');
  const m2 = await menuCase(page, 20);
  verifier(base.join() === 'true,false' && mach2 === 'Pelle:non,Grue:oui' && m2.boutons.includes('Grue') && !m2.boutons.includes('Pelle'),
    'Pelle décochée, Grue cochée : masque en base, le clic droit suit (' + JSON.stringify([base, mach2, m2]) + ')');

  // --- 4. Transports : tout décoché ---------------------------------------------------
  await allerPage(page, 'transports');
  await cliquerCoche(page, '#listeTransports', 3);
  await page.waitForTimeout(600);
  await allerPage(page, 'planning');
  const m3 = await menuCase(page, 21);
  verifier(m3 && !m3.boutons.includes('Gravier') && /Aucun élément coché/.test(m3.vide) && m3.boutons.includes('Autre…'),
    'Transports, Gravier décoché : « Aucun élément coché », « Autre… » reste (' + JSON.stringify(m3) + ')');

  // --- 5. Erreurs JS ----------------------------------------------------------------------
  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(erreurs));
})();
