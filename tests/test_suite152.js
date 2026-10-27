const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.10.2026 (suite 152) — Lionel, capture du menu d'une case de la
// ligne Machines à l'appui : « A la place de autre, mettre ajouter machine ».
// Son choix : « Ajoute aussi à la liste ».
// Vérifie :
//   A. menu de la ligne Machines : « Ajouter machine… » en dernier, à la
//      place de « Autre… » ; la ligne Transports garde « Autre… » ;
//   B. « Ajouter machine… » : boîte « Ajouter — Machines » (nom, catégorie,
//      « Autres » par défaut) ; la machine est écrite dans elements_groupes
//      (cochée, rangée en dernier, dans la catégorie choisie), puis le
//      formulaire Chantier s'ouvre et la bulle est posée ; elle est ensuite
//      dans le sous-menu de sa catégorie et sur la page Machines ;
//   C. nom vide : rien ; « Annuler » : rien ; Entrée valide ;
//   D. nom déjà dans la liste (majuscules comprises) : pas de doublon ;
//      machine décochée : recochée ;
//   E. groupe sans catégorie : pas de choix de catégorie ;
//   F. liste injoignable : message d'échec, bulle posée quand même ;
//   G. téléphone : la boîte tient dans l'écran ;
//   H. aucune erreur JS.
//
// Lancer : node test_suite152.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const E = (id, groupe_id, nom, ordre, x) => Object.assign({ id, groupe_id, nom, ordre, masque: false, categorie_id: null }, x || {});
const BD = (sansCategories) => ({
  personnes: [P(1, 'Paul', 1), P(30, 'Machines', 3, { groupe_id: 1 }), P(31, 'Transports', 4, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  categories_elements: sansCategories ? [] : [{ id: 1, groupe_id: 1, nom: 'Levage', ordre: 1 }, { id: 2, groupe_id: 1, nom: 'Pelles', ordre: 2 }],
  elements_groupes: [E(1, 1, 'Grue', 1, { categorie_id: sansCategories ? null : 1 }), E(4, 1, 'Karcher', 5), E(5, 1, 'Pompe', 6, { masque: true }), E(10, 2, 'Gravier', 1)],
  formulaires_rapides: [], formulaires_rapides_champs: [], taches: []
});

const centreCase = (page, p, iso, demi) => page.evaluate((a) => {
  const el = document.querySelector('.cell[data-kind="personne"][data-personne="' + a[0] + '"][data-demi="' + a[2] + '"][data-jour="' + giDepuisIso(a[1]) + '"]');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, [p, iso, demi]);
const menu = (page) => page.evaluate(() => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  return m ? { boutons: [...m.querySelectorAll(':scope > button')].map((b) => b.textContent.trim()), vide: (m.querySelector('.mc-vide') || {}).textContent || '' } : null;
});
const cliquerMenu = (page, libelle) => page.evaluate((l) => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  [...m.querySelectorAll(':scope > button')].find((b) => b.textContent.trim() === l).click();
}, libelle);
// Menu de la case (clic droit), puis « Ajouter machine… ».
async function ouvrirAjout(page, iso, demi) {
  const c = await centreCase(page, '30', iso, demi || 'matin');
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(250);
  await cliquerMenu(page, 'Ajouter machine…');
  await page.waitForTimeout(200);
}
const boite = (page) => page.evaluate(() => {
  const p = document.querySelector('.ajout-element-pop');
  if (!p) return null;
  const s = p.querySelector('.f-categorie'), r = p.getBoundingClientRect();
  return { titre: p.querySelector('.cp-titre').textContent, focus: document.activeElement === p.querySelector('.f-nom'),
    cats: s ? [...s.options].map((o) => o.textContent + (o.selected ? '*' : '')) : null, label: (p.querySelector('.label-champ') || {}).textContent || null,
    ok: p.querySelector('.f-ok').textContent, dansEcran: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
});
const bdMachines = (page) => page.evaluate(() => window.__BD.elements_groupes.filter((e) => e.groupe_id === 1).map((e) => e.nom + ':' + e.ordre + ':' + e.categorie_id + (e.masque ? ':masque' : '')).join(', '));
const bulles = (page) => page.evaluate(() => TACHES.filter((t) => t.personneId === '30').map((t) => t.texte + '|' + isoDeGi(t.giDebut)).sort().join(', '));
const formChantier = (page) => page.evaluate(() => { const f = document.querySelector('.form-pop:not(.ajout-element-pop)'); return f ? (f.querySelector('.cp-titre, .nom-grand') || {}).textContent || '?' : null; });
const toastTexte = (page) => page.evaluate(() => { const t = document.querySelector('.toast'); return t ? t.textContent : ''; });

(async () => {
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const browser = await lancerNavigateur(chromium);
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
  await page.waitForTimeout(400);

  // --- A. Menus --------------------------------------------------------------------------------
  await page.mouse.click(...Object.values(await centreCase(page, '30', '2026-09-23', 'matin')), { button: 'right' });
  await page.waitForTimeout(250);
  const mMachines = await menu(page);
  await page.keyboard.press('Escape');
  await page.mouse.click(...Object.values(await centreCase(page, '31', '2026-09-23', 'matin')), { button: 'right' });
  await page.waitForTimeout(250);
  const mTransports = await menu(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier(mMachines && JSON.stringify(mMachines.boutons) === JSON.stringify(['Levage›', 'Autres›', 'Ajouter machine…']) && !mMachines.boutons.includes('Autre…'),
    'ligne Machines : « Ajouter machine… » en dernier, à la place de « Autre… » (' + JSON.stringify(mMachines) + ')');
  verifier(mTransports && JSON.stringify(mTransports.boutons) === JSON.stringify(['Gravier', 'Autre…']), 'ligne Transports : garde « Autre… » (' + JSON.stringify(mTransports) + ')');

  // --- B. Ajouter une machine -----------------------------------------------------------------------
  await ouvrirAjout(page, '2026-09-23');
  const b = await boite(page);
  verifier(b && b.titre === 'Ajouter — Machines' && b.focus && b.label === 'Catégorie' && JSON.stringify(b.cats) === JSON.stringify(['Levage', 'Pelles', 'Autres*']) && b.ok === 'Ajouter',
    'boîte « Ajouter — Machines » : nom (curseur dedans), catégorie (« Autres » par défaut), « Ajouter » (' + JSON.stringify(b) + ')');
  await page.fill('.ajout-element-pop .f-nom', '  Chariot élévateur ');
  await page.selectOption('.ajout-element-pop .f-categorie', '1');
  await page.click('.ajout-element-pop .f-ok');
  await page.waitForTimeout(500);
  const apresAjout = { bd: await bdMachines(page), form: await formChantier(page), boite: !!(await boite(page)), toast: await toastTexte(page) };
  verifier(apresAjout.bd === 'Grue:1:1, Karcher:5:null, Pompe:6:null:masque, Chariot élévateur:7:1' && !apresAjout.boite && /Chariot élévateur/.test(apresAjout.form || '') &&
    apresAjout.toast === '« Chariot élévateur » ajoutée à la liste Machines.',
    'Ajouter : machine écrite (nom sans espaces autour, rangée en dernier, catégorie Levage, cochée), message, puis formulaire Chantier (' + JSON.stringify(apresAjout) + ')');
  await page.click('.form-pop .f-ok');
  await page.waitForTimeout(700);
  verifier(await bulles(page) === 'Chariot élévateur|2026-09-23', 'formulaire validé : bulle « Chariot élévateur » posée dans la case (' + await bulles(page) + ')');
  await page.mouse.click(...Object.values(await centreCase(page, '30', '2026-09-24', 'matin')), { button: 'right' });
  await page.waitForTimeout(250);
  await cliquerMenu(page, 'Levage›');
  await page.waitForTimeout(200);
  const sousLevage = await page.evaluate(() => [...document.querySelectorAll('body > .menu-pop .mc-sous-menu:not([hidden]) button')].map((x) => x.textContent).join(','));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier(sousLevage === 'Grue,Chariot élévateur', 'la machine ajoutée est ensuite dans le sous-menu « Levage » (' + sousLevage + ')');
  await page.evaluate(() => document.querySelector('.onglets-liste .onglet[data-page="machines"]').click());
  await page.waitForTimeout(400);
  const pageMachines = await page.evaluate(() => [...document.querySelectorAll('#listeElements-1 .cat-elements')].map((b) =>
    ((b.querySelector('.cat-nom') || {}).textContent || '-') + ': ' + [...b.querySelectorAll('.ligne-element')].map((l) => l.querySelector('b').textContent + (l.querySelector('.chk-afficher-el').checked ? '' : ' (décochée)')).join(', ')).join(' | '));
  await page.evaluate(() => document.querySelector('.onglet[data-page="planning"]').click());
  await page.waitForTimeout(400);
  verifier(pageMachines === 'Levage: Grue, Chariot élévateur | Pelles:  | Autres: Karcher, Pompe (décochée)',
    'page Machines : la machine ajoutée est dans « Levage », cochée (' + pageMachines + ')');

  // --- C. Nom vide, Annuler, Entrée -------------------------------------------------------------------
  await ouvrirAjout(page, '2026-09-24');
  await page.click('.ajout-element-pop .f-ok');
  await page.waitForTimeout(200);
  const vide = { boite: await boite(page), bd: await bdMachines(page) };
  await page.click('.ajout-element-pop .f-annuler');
  await page.waitForTimeout(200);
  verifier(vide.boite && vide.boite.focus && vide.bd.split(', ').length === 4 && !(await boite(page)) && !(await formChantier(page)) && (await bdMachines(page)).split(', ').length === 4,
    'nom vide : la boîte reste ouverte, rien d’écrit ; « Annuler » : tout se ferme, rien d’écrit');
  await ouvrirAjout(page, '2026-09-24');
  await page.fill('.ajout-element-pop .f-nom', 'Mini-pelle');
  await page.selectOption('.ajout-element-pop .f-categorie', '2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const entree = { bd: await bdMachines(page), form: await formChantier(page) };
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier(/Mini-pelle:8:2$/.test(entree.bd) && /Mini-pelle/.test(entree.form || ''), 'Entrée valide la boîte (Mini-pelle, dans « Pelles ») (' + JSON.stringify(entree) + ')');

  // --- D. Déjà dans la liste ----------------------------------------------------------------------------
  const avantDoublon = await bdMachines(page);
  await ouvrirAjout(page, '2026-09-25');
  await page.fill('.ajout-element-pop .f-nom', 'karcher');
  await page.click('.ajout-element-pop .f-ok');
  await page.waitForTimeout(400);
  const doublon = { bd: await bdMachines(page), toast: await toastTexte(page), form: await formChantier(page) };
  await page.click('.form-pop .f-ok');
  await page.waitForTimeout(600);
  verifier(doublon.bd === avantDoublon && doublon.toast === '« Karcher » est déjà dans la liste.' && /Karcher/.test(doublon.form || '') && /Karcher\|2026-09-25/.test(await bulles(page)),
    'nom déjà dans la liste (« karcher ») : pas de doublon, message, bulle « Karcher » (' + JSON.stringify(doublon) + ')');
  await ouvrirAjout(page, '2026-09-22');
  await page.fill('.ajout-element-pop .f-nom', 'Pompe');
  await page.click('.ajout-element-pop .f-ok');
  await page.waitForTimeout(500);
  const recoche = { bd: await bdMachines(page), toast: await toastTexte(page), menu: await page.evaluate(() => etat.elementsGroupes.filter((e) => e.nom === 'Pompe').map((e) => e.masque).join()) };
  await page.click('.form-pop .f-ok');
  await page.waitForTimeout(600);
  verifier(/Pompe:6:null(,|$)/.test(recoche.bd) && !/masque/.test(recoche.bd) && recoche.menu === 'false' && recoche.toast === '« Pompe » est de nouveau cochée dans la liste.' &&
    /Pompe\|2026-09-22/.test(await bulles(page)), 'machine décochée (Pompe) : recochée, pas de doublon, bulle posée (' + JSON.stringify(recoche) + ')');
  toutesErreurs.push(...erreurs);
  await page.context().close();

  // --- E. Groupe sans catégorie ------------------------------------------------------------------------------
  {
    const { page: p2, erreurs: e2 } = await ouvrirPlanning(browser, { bd: BD(true) });
    await p2.waitForTimeout(400);
    await ouvrirAjout(p2, '2026-09-23');
    const b2 = await boite(p2);
    await p2.fill('.ajout-element-pop .f-nom', 'Compresseur');
    await p2.click('.ajout-element-pop .f-ok');
    await p2.waitForTimeout(500);
    const bd2 = await bdMachines(p2);
    verifier(b2 && b2.cats === null && b2.label === null && /Compresseur:7:undefined$/.test(bd2),
      'groupe sans catégorie : pas de choix de catégorie, machine écrite sans catégorie (' + JSON.stringify([b2, bd2]) + ')');
    toutesErreurs.push(...e2);
    await p2.context().close();
  }

  // --- F. Liste injoignable ----------------------------------------------------------------------------------
  {
    const { page: p3, erreurs: e3 } = await ouvrirPlanning(browser, { bd: BD(), tablesEnEchec: ['elements_groupes'] });
    await p3.waitForTimeout(400);
    await p3.mouse.click(...Object.values(await centreCase(p3, '30', '2026-09-23', 'matin')), { button: 'right' });
    await p3.waitForTimeout(250);
    const m3 = await menu(p3);
    await cliquerMenu(p3, 'Ajouter machine…');
    await p3.waitForTimeout(200);
    await p3.fill('.ajout-element-pop .f-nom', 'Dumper');
    await p3.click('.ajout-element-pop .f-ok');
    await p3.waitForTimeout(500);
    const t3 = await toastTexte(p3), f3 = await formChantier(p3);
    await p3.click('.form-pop .f-ok');
    await p3.waitForTimeout(600);
    verifier(m3 && /Liste vide/.test(m3.vide) && m3.boutons.includes('Ajouter machine…') && /^Échec/.test(t3) && /Dumper/.test(f3 || '') && (await bulles(p3)) === 'Dumper|2026-09-23',
      'liste injoignable : « Ajouter machine… » proposé, message d’échec, bulle « Dumper » posée quand même (' + JSON.stringify([m3, t3, f3]) + ')');
    toutesErreurs.push(...e3);
    await p3.context().close();
  }

  // --- G. Téléphone --------------------------------------------------------------------------------------------
  {
    const { page: p4, erreurs: e4 } = await ouvrirPlanning(browser, { bd: BD(), viewport: { width: 390, height: 760 }, hasTouch: true });
    await p4.waitForTimeout(500);
    const ok = await p4.evaluate(() => {
      const cell = document.querySelector('.cell[data-kind="personne"][data-personne="30"]');
      if (!cell) return 'pas de case';
      const r = cell.getBoundingClientRect();
      ouvrirAjout(cell, r.x + r.width / 2, r.y + r.height / 2);
      const m = [...document.querySelectorAll('body > .menu-pop')].pop();
      const b = m && [...m.querySelectorAll(':scope > button')].find((x) => x.textContent.trim() === 'Ajouter machine…');
      if (!b) return 'pas de bouton';
      b.click();
      return 'ok';
    });
    await p4.waitForTimeout(300);
    const b4 = await boite(p4);
    verifier(ok === 'ok' && b4 && b4.dansEcran, 'téléphone : la boîte « Ajouter — Machines » tient dans l’écran (' + JSON.stringify([ok, b4]) + ')');
    toutesErreurs.push(...e4);
    await p4.context().close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan([]));
})();
