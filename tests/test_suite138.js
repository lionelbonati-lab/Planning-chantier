const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 138). Lionel : « machine et transport doivent
// aussi pourvoir être masqué.
// Je n'aime pas cette fonction désactiver sur personnel et intervenants, la
// supprimer. » Ses choix : « L'interrupteur « Actif » des pages » et
// « Coche « Afficher » + clic droit ».
// Vérifie :
//   1. Personnel / Intervenants : plus d'interrupteur « Actif » ni de liste
//      « Désactivés » (une ligne inactive n'est plus listée), corbeille sur
//      chaque ligne ;
//   2. corbeille : confirmation, suppression en base, ligne retirée ;
//   3. page Machines : coche « Afficher » sous le titre, décocher masque la
//      ligne Machines du planning, recocher la remet ;
//   4. page Transports : coche « Afficher » au-dessus de « Matériaux »,
//      même effet sur la ligne Transports ;
//   5. clic droit sur le nom Machines : « Masquer la ligne » (plus de
//      « Désactiver… »), la coche de la page suit ;
//   6. aucune erreur JS.
//
// Lancer : node test_suite138.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const BD = {
  personnes: [P(1, 'Paul', 1), P(2, 'Anne', 2), P(3, 'Béton SA', 3, { sous_traitant: true }), P(4, 'Ancien', 4, { actif: false }),
    P(20, 'Machines', 5, { groupe_id: 1 }), P(21, 'Transports', 6, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  taches: [],
  elements_groupes: [{ id: 1, groupe_id: 1, nom: 'Pelle', ordre: 1 }, { id: 2, groupe_id: 2, nom: 'Gravier', ordre: 1 }]
};
async function allerPage(page, nom) {
  await page.evaluate((n) => document.querySelector('.onglets-liste .onglet[data-page="' + n + '"]').click(), nom);
  await page.waitForTimeout(500);
}
const ligneAu = (page, id) => page.evaluate((i) => !!document.querySelector('#racine .grille > .lbl[data-ligne="p' + i + '"]'), id);
const masque = (page, id) => page.evaluate((i) => window.__BD.personnes.find((p) => p.id === i).masque, id);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD });
  await page.waitForTimeout(500);

  // --- 1. Personnel / Intervenants sans « Actif » -------------------------------------
  const lister = (zone) => page.evaluate((z) => ({
    noms: [...document.querySelectorAll(z + ' .ligne-intervenant')].map((l) => l.querySelector('b').textContent),
    actif: document.querySelectorAll(z + ' .champ-actif, ' + z + ' .interrupteur').length,
    repli: document.querySelectorAll('.page.actif .repli-desactives, .page.actif .ligne-desactivee').length,
    corbeilles: [...document.querySelectorAll(z + ' .ligne-intervenant')].map((l) => !!l.querySelector('.lien-supprimer-def')).join()
  }), zone);
  await allerPage(page, 'personnel');
  const pers = await lister('#listePersonnel');
  await allerPage(page, 'intervenants');
  const inter = await lister('#listeIntervenants');
  verifier(pers.noms.join() === 'Paul,Anne' && !pers.actif && !pers.repli && pers.corbeilles === 'true,true' &&
    inter.noms.join() === 'Béton SA' && !inter.actif && !inter.repli && inter.corbeilles === 'true',
    'Personnel / Intervenants : plus d’« Actif » ni de « Désactivés », corbeille sur chaque ligne (' + JSON.stringify([pers, inter]) + ')');

  // --- 2. Corbeille ----------------------------------------------------------------------
  await allerPage(page, 'personnel');
  await page.evaluate(() => document.querySelector('#listePersonnel .ligne-intervenant[data-id="2"] .lien-supprimer-def').click());
  await page.waitForTimeout(250);
  const confirm = await page.evaluate(() => (document.querySelector('.confirm-texte') || {}).textContent);
  await page.evaluate(() => document.querySelector('.c-ok').click());
  await page.waitForTimeout(1200);
  const apresSuppr = await page.evaluate(() => [window.__BD.personnes.some((p) => p.id === 2), [...document.querySelectorAll('#listePersonnel .ligne-intervenant b')].map((b) => b.textContent).join()]);
  verifier(/Supprimer définitivement «\s?Anne\s?»/.test(confirm || '') && !apresSuppr[0] && apresSuppr[1] === 'Paul',
    'corbeille : confirmation, Anne supprimée en base et de la liste (' + JSON.stringify([confirm, apresSuppr]) + ')');

  // --- 3. Machines : coche « Afficher » ---------------------------------------------------
  await allerPage(page, 'machines');
  const mach = await page.evaluate(() => {
    const c = document.querySelector('#listesGroupes .chk-afficher-groupe'), h = document.querySelector('#listesGroupes h2');
    return c ? { checked: c.checked, apresTitre: h.nextElementSibling === c.closest('label'), texte: c.closest('label').textContent.trim() } : null;
  });
  const avantM = await ligneAu(page, 20);
  await page.evaluate(() => document.querySelector('#listesGroupes .chk-afficher-groupe').click());
  await page.waitForTimeout(1500);
  const masqueM = [await masque(page, 20), await ligneAu(page, 20), await page.evaluate(() => document.querySelector('#listesGroupes .chk-afficher-groupe').checked)];
  await page.evaluate(() => document.querySelector('#listesGroupes .chk-afficher-groupe').click());
  await page.waitForTimeout(1500);
  const remisM = [await masque(page, 20), await ligneAu(page, 20)];
  verifier(mach && mach.checked && mach.apresTitre && mach.texte === 'Afficher dans le planning' && avantM &&
    masqueM.join() === 'true,false,false' && remisM.join() === 'false,true',
    'page Machines : coche « Afficher » sous le titre, masque puis réaffiche la ligne Machines (' + JSON.stringify([mach, avantM, masqueM, remisM]) + ')');

  // --- 4. Transports : coche « Afficher » ------------------------------------------------
  await allerPage(page, 'transports');
  const trans = await page.evaluate(() => {
    const c = document.querySelector('#listeTransports .chk-afficher-groupe'), h = document.querySelector('#listeTransports h2');
    return c ? { checked: c.checked, avantTitre: c.closest('label').nextElementSibling === h, titre: h.textContent, elements: document.querySelectorAll('#listeTransports .ligne-intervenant').length } : null;
  });
  const avantT = await ligneAu(page, 21);
  await page.evaluate(() => document.querySelector('#listeTransports .chk-afficher-groupe').click());
  await page.waitForTimeout(1500);
  const masqueT = [await masque(page, 21), await ligneAu(page, 21), await page.evaluate(() => document.querySelector('#listeTransports .chk-afficher-groupe').checked)];
  await page.evaluate(() => document.querySelector('#listeTransports .chk-afficher-groupe').click());
  await page.waitForTimeout(1500);
  const remisT = [await masque(page, 21), await ligneAu(page, 21)];
  verifier(trans && trans.checked && trans.avantTitre && trans.titre === 'Matériaux' && trans.elements === 1 && avantT &&
    masqueT.join() === 'true,false,false' && remisT.join() === 'false,true',
    'page Transports : coche « Afficher » au-dessus de « Matériaux », masque puis réaffiche la ligne (' + JSON.stringify([trans, avantT, masqueT, remisT]) + ')');

  // --- 5. Clic droit sur le nom Machines --------------------------------------------------
  await allerPage(page, 'planning');
  const r = await page.evaluate(() => { const l = document.querySelector('#racine .grille > .lbl[data-ligne="p20"]').getBoundingClientRect(); return { x: l.x + l.width / 2, y: l.y + l.height / 2 }; });
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await page.waitForTimeout(250);
  const boutons = await page.evaluate(() => [...document.querySelectorAll('.menu-hauteur-ligne button')].map((b) => b.textContent.trim()));
  await page.evaluate(() => [...document.querySelectorAll('.menu-hauteur-ligne button')].find((b) => b.textContent.trim() === 'Masquer la ligne').click());
  await page.waitForTimeout(1500);
  await allerPage(page, 'machines');
  const apresMenu = [await masque(page, 20), await ligneAu(page, 20), await page.evaluate(() => document.querySelector('#listesGroupes .chk-afficher-groupe').checked)];
  verifier(boutons.includes('Masquer la ligne') && !boutons.some((b) => /Désactiver/.test(b)) && apresMenu.join() === 'true,false,false',
    'clic droit sur Machines : « Masquer la ligne » (sans « Désactiver… »), la coche de la page suit (' + JSON.stringify([boutons, apresMenu]) + ')');

  // --- 6. Erreurs JS ----------------------------------------------------------------------
  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(erreurs));
})();
