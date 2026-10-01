const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 137).
// Retour 16 — Lionel : « La la petite coche "afficher" tout à gauche. Le tri
// étant possible sur planning, enlever les flèches de tri des onglets.
// Ajouter masquer et désactiver au clic droit dans la colonne nom. »
// Retour 17 (bug) — « Si transport masqué, manque la ligne sous notes »
// Retour 18 — « Pouvoir valider un important dans la liste des
// importants. » Son choix : « Retirer le drapeau important ».
// Vérifie :
//   1. Transports masqué, Machines en tête (ordre de Lionel) : trait en haut
//      de la ligne Machines, sous Notes ; Transports affiché : trait sur
//      Transports seulement ;
//   2. pages Personnel / Intervenants : plus de ↑/↓, coche « Afficher » en
//      tête de ligne (avant le nom), toujours active ;
//   3. clic droit sur un nom : « Masquer la ligne » (masque en base, ligne
//      retirée du planning) ; « Désactiver… » retiré à la suite 138 (Lionel :
//      « Je n'aime pas cette fonction désactiver sur personnel et
//      intervenants, la supprimer. ») ;
//   4. cloche : « Valider » retire le drapeau important (toutes ses
//      demi-journées), la ligne quitte la liste et le compteur, la bulle
//      perd son icône ;
//   5. aucune erreur JS.
//
// Lancer : node test_suite137.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const T = (id, personne_id, date, demi, texte, x) => Object.assign({ id, personne_id, date, demi, ordre: 0, texte, chantier_id: 1 }, x || {});
const BD = (transportsMasque) => ({
  personnes: [P(1, 'Paul', 1), P(2, 'Anne', 2), P(3, 'Béton SA', 3, { sous_traitant: true }), P(20, 'Machines', 4, { groupe_id: 1 }), P(21, 'Transports', 5, { groupe_id: 2, masque: !!transportsMasque })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  taches: [T(1, 1, '2026-09-24', 'matin', 'Réception', { important: true }), T(2, 1, '2026-09-24', 'aprem', 'Réception', { important: true }),
    T(3, 2, '2026-09-25', 'matin', 'Visite', { important: true }), T(4, 20, '2026-09-23', 'matin', 'Karcher')],
  elements_groupes: []
});
const LS = { 'planning.ordreGroupes': JSON.stringify(['groupe-1', 'personnel', 'intervenants']) };
const ombre = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).boxShadow : 'absent'; }, sel);
const trait = (o) => /inset/.test(o) && /0px 1px 0px/.test(o);
async function allerPage(page, nom) {
  await page.evaluate((n) => document.querySelector('.onglets-liste .onglet[data-page="' + n + '"]').click(), nom);
  await page.waitForTimeout(500);
}
async function menuNom(page, id) {
  const r = await page.evaluate((i) => { const l = document.querySelector('#racine .grille > .lbl[data-ligne="p' + i + '"]').getBoundingClientRect(); return { x: l.x + l.width / 2, y: l.y + l.height / 2 }; }, id);
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await page.waitForTimeout(250);
  return page.evaluate(() => [...document.querySelectorAll('.menu-hauteur-ligne button')].map((b) => b.textContent.trim()));
}
const clicMenu = (page, libelle) => page.evaluate((l) => [...document.querySelectorAll('.menu-hauteur-ligne button')].find((b) => b.textContent.trim() === l).click(), libelle);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Bug n° 17 : trait sous Notes -----------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(true), localStorage: LS });
    await page.waitForTimeout(500);
    const o = [await ombre(page, '.grille > .lbl[data-ligne="p20"]'), await ombre(page, '.grille > .cell[data-personne="20"]')];
    const transports = await page.evaluate(() => !!document.querySelector('.grille > .lbl[data-ligne="p21"]'));
    const autres = await page.evaluate(() => document.querySelectorAll('.grille > .ligne-premiere:not([data-ligne="p20"]):not([data-personne="20"])').length);
    verifier(!transports && o.every(trait) && autres === 0,
      'Transports masqué, Machines en tête : trait en haut de la ligne Machines seulement (' + JSON.stringify([o, transports, autres]) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(false), localStorage: LS });
    await page.waitForTimeout(500);
    const o = [await ombre(page, '.grille > .lbl[data-ligne="p21"]'), await ombre(page, '.grille > .lbl[data-ligne="p20"]')];
    verifier(trait(o[0]) && !trait(o[1]), 'Transports affiché : le trait passe sur Transports, plus sur Machines (' + JSON.stringify(o) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(false) });
  await page.waitForTimeout(500);

  // --- 2. Pages Personnel / Intervenants : coche à gauche, sans flèches -------------
  await allerPage(page, 'personnel');
  const pers = await page.evaluate(() => [...document.querySelectorAll('#listePersonnel .ligne-intervenant:not(.ligne-desactivee)')].map((l) => {
    const c = l.querySelector('.champ-afficher'), b = l.querySelector('b');
    return { premier: l.firstElementChild === c, avantNom: c.getBoundingClientRect().right <= b.getBoundingClientRect().left, fleches: l.querySelectorAll('.cf-monter, .cf-descendre').length, coche: c.querySelector('input').checked };
  }));
  await allerPage(page, 'intervenants');
  const inter = await page.evaluate(() => [...document.querySelectorAll('#listeIntervenants .ligne-intervenant')].map((l) => !!l.querySelector('.cf-monter') + ':' + (l.firstElementChild.className)));
  verifier(pers.length === 2 && pers.every((x) => x.premier && x.avantNom && !x.fleches && x.coche) && inter.join() === 'false:champ-afficher',
    'Personnel / Intervenants : coche « Afficher » en tête, plus de ↑/↓ (' + JSON.stringify([pers, inter]) + ')');
  await allerPage(page, 'personnel');
  await page.evaluate(() => document.querySelector('#listePersonnel .ligne-intervenant[data-id="2"] .chk-afficher').click());
  await page.waitForTimeout(500);
  const masqueCoche = await page.evaluate(() => window.__BD.personnes.find((p) => p.id === 2).masque);
  await page.evaluate(() => document.querySelector('#listePersonnel .ligne-intervenant[data-id="2"] .chk-afficher').click());
  await page.waitForTimeout(500);
  const remis = await page.evaluate(() => window.__BD.personnes.find((p) => p.id === 2).masque);
  verifier(masqueCoche === true && remis === false, 'coche « Afficher » à sa nouvelle place : masque puis réaffiche (' + [masqueCoche, remis] + ')');

  // --- 3. Clic droit sur un nom : Masquer (Désactiver retiré, suite 138) ----------------
  await allerPage(page, 'planning');
  const boutons = await menuNom(page, 2);
  const aLes2 = boutons.includes('Masquer la ligne') && !boutons.includes('Désactiver…');
  await clicMenu(page, 'Masquer la ligne');
  await page.waitForTimeout(800);
  const apresMasque = await page.evaluate(() => [window.__BD.personnes.find((p) => p.id === 2).masque, !!document.querySelector('#racine .grille > .lbl[data-ligne="p2"]')]);
  verifier(aLes2 && apresMasque[0] === true && !apresMasque[1], 'clic droit sur Anne : « Masquer la ligne » → masque en base, ligne retirée (' + JSON.stringify([boutons, apresMasque]) + ')');

  // --- 4. Cloche : valider un important ----------------------------------------------
  // Anne est masquée (étape 3) : on la réaffiche pour voir « Visite ».
  await page.evaluate(() => { window.__BD.personnes.find((p) => p.id === 2).masque = false; rafraichirApresPersonnel(); });
  await page.waitForTimeout(2200);
  await page.evaluate(() => ouvrirNotifications());
  await page.waitForTimeout(500);
  const avant = await page.evaluate(() => [nbNotifications_().importants, [...document.querySelectorAll('.notif-importants .imp-li')].map((l) => l.querySelector('.ar-quoi').textContent + ':' + !!l.querySelector('.imp-valider')).join('/'),
    !!document.querySelector('.bulle.important')]);
  await page.evaluate(() => [...document.querySelectorAll('.notif-importants .imp-li')].find((l) => l.querySelector('.ar-quoi').textContent === 'Réception').querySelector('.imp-valider').click());
  await page.waitForTimeout(1200);
  const apres = await page.evaluate(() => [nbNotifications_().importants, [...document.querySelectorAll('.notif-importants .imp-li .ar-quoi')].map((x) => x.textContent).join('/'),
    window.__BD.taches.filter((t) => t.texte === 'Réception').map((t) => t.important).join(','), window.__BD.taches.find((t) => t.id === 3).important,
    [...document.querySelectorAll('.bulle.important')].map((b) => b.textContent.trim()).join('/')]);
  verifier(avant[0] === 2 && avant[1] === 'Réception:true/Visite:true' && apres[0] === 1 && apres[1] === 'Visite' && apres[2] === 'false,false' && apres[3] === true && !/Réception/.test(apres[4]),
    'cloche : « Valider » retire le drapeau (2 demi-journées), quitte la liste et le compteur, l’autre reste (' + JSON.stringify([avant, apres]) + ')');

  // --- 5. Erreurs JS -------------------------------------------------------------------
  toutesErreurs.push(...erreurs);
  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
