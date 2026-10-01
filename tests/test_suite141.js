const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 141). Lionel : « déplier et replier ligne
// machine et transport ».
// Vérifie (ordinateur, puis téléphone au doigt) :
//   1. chevron ▾ devant le nom des lignes Machines et Transports, pas sur
//      une personne ;
//   2. clic (toucher) sur le chevron Machines : ligne repliée (18 px), ▸,
//      sans choisir la ligne ni ouvrir de menu ;
//   3. 2e clic : ligne dépliée, ▾ ; même chose pour Transports ;
//   4. aucune erreur JS.
//
// Lancer : node test_suite141.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const BD = {
  personnes: [P(1, 'Paul', 1), P(20, 'Machines', 5, { groupe_id: 1 }), P(21, 'Transports', 6, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  taches: [],
  elements_groupes: []
};
const etat = (page, id) => page.evaluate((i) => {
  const l = document.querySelector('#racine .grille > .lbl[data-ligne="p' + i + '"]'), b = l && l.querySelector(':scope > .ligne-repli');
  return l ? { chevron: b ? b.textContent : null, h: Math.round(l.getBoundingClientRect().height), repliee: l.classList.contains('ligne-repliee'),
    choisie: l.classList.contains('ligne-choisie'), menu: !!document.querySelector('.menu-pop') } : null;
}, id);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  for (const mode of ['ordinateur', 'téléphone']) {
    const tel = mode === 'téléphone';
    const { page, erreurs } = await ouvrirPlanning(browser, Object.assign({ bd: BD }, tel ? { viewport: { width: 390, height: 800 }, hasTouch: true } : {}));
    await page.waitForTimeout(600);
    const cliquer = async (id) => {
      const b = page.locator('#racine .grille > .lbl[data-ligne="p' + id + '"] > .ligne-repli').first();
      if (tel) await b.tap(); else await b.click();
      await page.waitForTimeout(400);
    };

    // --- 1. Chevrons ---------------------------------------------------------------
    const debut = [await etat(page, 20), await etat(page, 21), await etat(page, 1)];
    verifier(debut[0].chevron === '▾' && debut[1].chevron === '▾' && debut[2].chevron === null && !debut[0].repliee && !debut[1].repliee,
      mode + ' : chevron ▾ sur Machines et Transports, pas sur Paul (' + JSON.stringify(debut) + ')');

    // --- 2-3. Replier / déplier --------------------------------------------------------
    for (const id of [20, 21]) {
      await cliquer(id);
      const r = await etat(page, id);
      await cliquer(id);
      const d = await etat(page, id);
      verifier(r.repliee && r.chevron === '▸' && r.h <= 19 && !r.choisie && !r.menu && !d.repliee && d.chevron === '▾' && d.h > 19 && !d.choisie && !d.menu,
        mode + ' : chevron ' + (id === 20 ? 'Machines' : 'Transports') + ' replie puis déplie la ligne (' + JSON.stringify([r, d]) + ')');
    }
    verifier(!erreurs.length, mode + ' : aucune erreur JS (' + erreurs.join(' | ') + ')');
    await page.close();
  }
  await browser.close();
  bilan();
})();
