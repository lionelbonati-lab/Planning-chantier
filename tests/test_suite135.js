const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 135).
// Retour 12 — Lionel : « un petit bouton raccourcis réglage notifications
// dans les notifications ».
// Retour 13 — « Machine aussi en une seule ligne comme transport.
// Pas d'ajouts rapide pour ces 2 groupe. la liste de matériaux de
// "transport" et des machines sera dans le clic droit de leurs lignes.
// ainsi les bulles seront des machine et des matériaux au lieu de tâches »
// Ses choix : listes gérées sur les « Pages Machines / Transports » ; bulle
// = « Élément + chantier + quantité » ; ligne Machines « À la place de la
// section Machines » (sql/0036 : table elements_groupes).
// Vérifie :
//   1. planning : la ligne Machines à la place de la section (pas de titre
//      §groupe-1), poignée ⠿ sur son étiquette, fond de la section ;
//   2. clic droit sur une case Machines : la liste (Karcher, Vibrateur),
//      « Autre… », ni absence ni entrée rapide ; Karcher → Chantier seul
//      (suite 139 — Lionel : « pas de quantité sous machines ») ; bulle
//      « Karcher » avec son chantier ;
//   3. clic droit sur la ligne Transports : Gravier → « Gravier - 10 m³ » ;
//   4. page Machines : liste, ajouter, renommer, ↓, supprimer — écrit en
//      base et repris aussitôt dans le menu de la case ;
//   5. page Transports : sa liste, « + Ajouter » ;
//   6. cloche : bouton « Réglages » → page Réglages › Notifications ;
//   7. bug n° 14 — « il manque une bordure sous note » : trait en haut de
//      la ligne Transports (étiquette et cases), sous Notes ;
//   8. aucune erreur JS.
//
// Lancer : node test_suite135.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const E = (id, groupe_id, nom, ordre) => ({ id, groupe_id, nom, ordre });
const BD = () => ({
  personnes: [P(1, 'Paul', 1), P(3, 'Béton SA', 2, { sous_traitant: true }), P(30, 'Machines', 3, { groupe_id: 1 }), P(31, 'Transports', 4, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  elements_groupes: [E(1, 1, 'Karcher', 1), E(2, 1, 'Vibrateur', 2), E(3, 2, 'Gravier', 1)],
  formulaires_rapides: [{ id: 1, nom: 'Béton', ordre: 1, assigne_a: '', type_entree: 'tache' }],
  formulaires_rapides_champs: [],
  taches: []
});

const corps = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .grille > .lbl[data-ligne^="p"], #racine .grille > .section-row[data-section]')]
  .map((e) => e.classList.contains('section-row') ? '§' + e.dataset.section : e.dataset.ligne).join(' '));
const centreCase = (page, p, iso, demi) => page.evaluate((a) => {
  const el = document.querySelector('.cell[data-kind="personne"][data-personne="' + a[0] + '"][data-demi="' + a[2] + '"][data-jour="' + giDepuisIso(a[1]) + '"]');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, [p, iso, demi]);
const clicDroit = async (page, c) => { await page.mouse.click(c.x, c.y, { button: 'right' }); await page.waitForTimeout(250); };
const menu = (page) => page.evaluate(() => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  return m ? { boutons: [...m.querySelectorAll('button')].map((b) => b.textContent.trim()), vide: !!m.querySelector('.mc-vide') } : null;
});
const choisir = (page, libelle) => page.evaluate((l) => {
  const m = [...document.querySelectorAll('body > .menu-pop')].pop();
  [...m.querySelectorAll('button')].find((b) => b.textContent.trim() === l).click();
}, libelle);
async function allerPage(page, nom) {
  await page.evaluate((n) => document.querySelector('.onglets-liste .onglet[data-page="' + n + '"]').click(), nom);
  await page.waitForTimeout(400);
}
const liste = (page, g) => page.evaluate((g) => [...document.querySelectorAll('#listeElements-' + g + ' .ligne-intervenant b')].map((b) => b.textContent).join(','), g);
const bdElements = (page) => page.evaluate(() => (window.__BD.elements_groupes || []).slice().sort((a, b) => a.groupe_id - b.groupe_id || a.ordre - b.ordre).map((e) => e.groupe_id + ':' + e.nom + ':' + e.ordre).join(','));
async function saisir(page, nom) {
  await page.fill('.form-pop .f-nom', nom);
  await page.click('.form-pop .f-ok');
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
  await page.waitForTimeout(300);

  // --- 1. Ligne Machines à la place de la section ---------------------------------
  const c = await corps(page);
  const lbl = await page.evaluate(() => {
    const l = document.querySelector('#racine .grille > .lbl[data-ligne="p30"]');
    document.documentElement.style.setProperty('--section-machines-bg', 'rgb(1, 2, 3)');
    const r = { section: l.dataset.section, poignee: !!l.querySelector('.section-poignee'), nom: l.querySelector('b').textContent, fond: getComputedStyle(l).backgroundColor };
    document.documentElement.style.removeProperty('--section-machines-bg');
    return r;
  });
  verifier(c === 'p31 §personnel p1 §intervenants p3 p30' && lbl.section === 'groupe-1' && lbl.poignee && lbl.nom === 'Machines' && lbl.fond === 'rgb(1, 2, 3)',
    'ligne Machines seule à la place de la section : pas de titre, poignée ⠿ et fond de la section sur son étiquette (' + c + ' ; ' + JSON.stringify(lbl) + ')');

  // --- 2. Clic droit sur une case Machines ---------------------------------------------
  await clicDroit(page, await centreCase(page, '30', '2026-09-24', 'matin'));
  let m = await menu(page);
  verifier(m && JSON.stringify(m.boutons) === JSON.stringify(['Karcher', 'Vibrateur', 'Autre…']),
    'clic droit sur la ligne Machines : sa liste puis « Autre… », ni absence ni entrée rapide ' + JSON.stringify(m));
  await choisir(page, 'Karcher');
  await page.waitForTimeout(250);
  const form = await page.evaluate(() => {
    const f = document.querySelector('.form-pop');
    return { titre: f.querySelector('.cp-titre').textContent, labels: [...f.querySelectorAll('.label-champ')].map((x) => x.textContent).join(','), chantier: !!f.querySelector('.f-chantier') };
  });
  await page.selectOption('.form-pop .f-chantier', '26182 - Terrain de Padel');
  const apercu = await page.evaluate(() => document.querySelector('.form-pop .apercu-texte').textContent);
  await page.click('.form-pop .f-ok');
  await page.waitForTimeout(800);
  const bulle = await page.evaluate(() => TACHES.filter((t) => t.personneId === '30').map((t) => t.texte + '|' + t.chantier + '|' + isoDeGi(t.giDebut) + '|' + t.demiDebut).join(','));
  const enBase = await page.evaluate(() => (window.__BD.taches || []).filter((t) => t.personne_id === 30).map((t) => t.texte + '|' + t.chantier_id).join(','));
  verifier(form.titre === 'Ajouter — Karcher' && !/Quantité/.test(form.labels) && form.chantier && apercu === 'Karcher' &&
    /^Karcher\|26182 - Terrain de Padel\|2026-09-24\|(matin|null)$/.test(bulle) && enBase === 'Karcher|1',
    'Karcher : chantier seul (pas de quantité sous Machines), bulle « Karcher » sur la case, écrite en base (' + JSON.stringify(form) + ' ; ' + apercu + ' ; ' + bulle + ' ; ' + enBase + ')');

  // --- 3. Ligne Transports --------------------------------------------------------------
  await clicDroit(page, await centreCase(page, '31', '2026-09-25', 'aprem'));
  m = await menu(page);
  await choisir(page, 'Gravier');
  await page.waitForTimeout(250);
  await page.fill('.form-pop .champ-dyn[data-champ="quantite"]', '10 m³');
  await page.click('.form-pop .f-ok');
  await page.waitForTimeout(800);
  const bulleT = await page.evaluate(() => TACHES.filter((t) => t.personneId === '31').map((t) => t.texte + '|' + isoDeGi(t.giDebut)).join(','));
  verifier(JSON.stringify(m.boutons) === JSON.stringify(['Gravier', 'Autre…']) && bulleT === 'Gravier - 10 m³|2026-09-25',
    'clic droit sur la ligne Transports : Gravier → bulle « Gravier - 10 m³ » (' + JSON.stringify(m) + ' ; ' + bulleT + ')');

  // --- 4. Page Machines ------------------------------------------------------------------
  await allerPage(page, 'machines');
  const avant = await liste(page, 1);
  await page.click('#listeElements-1 .ligne-ajouter');
  await saisir(page, 'Pompe');
  await page.click('#listeElements-1 .ligne-intervenant:nth-child(2) .lien-modifier');
  await saisir(page, 'Vibreur');
  await page.click('#listeElements-1 .ligne-intervenant:nth-child(1) .cf-descendre');
  await page.waitForTimeout(500);
  const apresTri = await liste(page, 1), bdTri = await bdElements(page);
  await page.click('#listeElements-1 .ligne-intervenant:nth-child(3) .lien-supprimer-el');
  await page.waitForTimeout(200);
  await page.click('.confirm-pop .c-ok');
  await page.waitForTimeout(500);
  const apresSuppr = await liste(page, 1), bdSuppr = await bdElements(page);
  verifier(avant === 'Karcher,Vibrateur' && apresTri === 'Vibreur,Karcher,Pompe' && bdTri === '1:Vibreur:1,1:Karcher:2,1:Pompe:3,2:Gravier:1' &&
    apresSuppr === 'Vibreur,Karcher' && bdSuppr === '1:Vibreur:1,1:Karcher:2,2:Gravier:1',
    'page Machines : ajouter, renommer, ↓, supprimer — écrits en base (' + [avant, apresTri, bdTri, apresSuppr, bdSuppr].join(' ; ') + ')');
  await allerPage(page, 'planning');
  await clicDroit(page, await centreCase(page, '30', '2026-09-23', 'matin'));
  m = await menu(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const bulleGardee = await page.evaluate(() => TACHES.some((t) => t.texte === 'Karcher'));
  verifier(JSON.stringify(m.boutons) === JSON.stringify(['Vibreur', 'Karcher', 'Autre…']) && bulleGardee,
    'menu de la case repris aussitôt ; les bulles déjà posées restent (' + JSON.stringify(m) + ')');

  // --- 5. Page Transports ------------------------------------------------------------------
  await allerPage(page, 'transports');
  const avantT = await liste(page, 2);
  await page.click('#listeElements-2 .ligne-ajouter');
  const titreT = await page.evaluate(() => document.querySelector('.form-pop .cp-titre').textContent);
  await saisir(page, 'Sable');
  const apresT = await liste(page, 2), bdT = await bdElements(page);
  verifier(avantT === 'Gravier' && titreT === 'Ajouter — Transports' && apresT === 'Gravier,Sable' && /2:Sable:2/.test(bdT),
    'page Transports : liste des matériaux, « + Ajouter » (' + [avantT, titreT, apresT, bdT].join(' ; ') + ')');

  // --- 6. Cloche : bouton « Réglages » ---------------------------------------------------------
  await allerPage(page, 'planning');
  await page.evaluate(() => ouvrirNotifications());
  await page.waitForTimeout(300);
  const bouton = await page.evaluate(() => { const b = document.querySelector('.pop-notifications .notif-reglages'); return b && { texte: b.textContent.trim(), svg: !!b.querySelector('svg'), large: b.getBoundingClientRect().width }; });
  await page.click('.pop-notifications .notif-reglages');
  await page.waitForTimeout(400);
  const ouverte = await page.evaluate(() => ({ page: (document.querySelector('.page.actif') || {}).id, pop: !!document.querySelector('.pop-notifications') }));
  verifier(bouton && bouton.texte === 'Réglages' && bouton.svg && bouton.large < 140 && ouverte.page === 'page-notifications-push' && !ouverte.pop,
    'cloche : petit bouton « Réglages » → page Réglages › Notifications, popup fermé (' + JSON.stringify([bouton, ouverte]) + ')');

  // --- 7. Bug n° 14 : trait sous Notes ------------------------------------------------------
  const traits = await page.evaluate(() => {
    const ombre = (el) => el ? getComputedStyle(el).boxShadow : 'absent';
    return [ombre(document.querySelector('.grille > .lbl[data-ligne="p31"]')), ombre(document.querySelector('.grille > .cell[data-personne="31"]'))];
  });
  verifier(traits.every((o) => /inset/.test(o) && /0px 1px 0px/.test(o)),
    'bug n° 14 : trait en haut de la ligne Transports, sous Notes (' + traits.join(' | ') + ')');

  toutesErreurs.push(...erreurs);
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
