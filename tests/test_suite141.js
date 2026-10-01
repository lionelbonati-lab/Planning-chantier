const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 141). Lionel : « déplier et replier ligne
// machine et transport », puis : « Cela fonctionne mais n'a pas sa place
// sur les lignes machine et transport car elle sont masquage.
// Je pense plus à une petite flèche qui permet d'ouvrir pour afficher toutes
// les bulle quand déplier et la hauteur d'une bulle quand repliée. »
// Vérifie (ordinateur, puis téléphone au doigt) :
//   1. flèche ▸ devant le nom des lignes Machines et Transports (pas sur une
//      personne) ; repliées par défaut : hauteur d'une bulle ;
//   2. clic (toucher) sur la flèche : ▾, la ligne s'agrandit et montre ses
//      3 bulles du lundi entières, sans choisir la ligne ni ouvrir de menu ;
//      retenu au rendu suivant ;
//   3. 2e clic : ▸, hauteur d'une bulle ;
//   4. menu du nom Machines : plus de « Replier la ligne » (Paul le garde) ;
//   5. aucune erreur JS.
//
// Lancer : node test_suite141.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, groupe_id: null, ordre, actif: true, masque: false }, x || {});
const T = (id, pid, texte) => ({ id, personne_id: pid, date: '2026-09-21', demi: 'matin', ordre: id, texte, chantier_id: 1, statut_id: null, important: false, serie_id: null, est_absence: false });
const BD = {
  personnes: [P(1, 'Paul', 1), P(20, 'Machines', 5, { groupe_id: 1 }), P(21, 'Transports', 6, { groupe_id: 2 })],
  groupes: [{ id: 1, nom: 'Machines', ordre: 1, actif: true, ligne_unique: false }, { id: 2, nom: 'Transports', ordre: 2, actif: true, ligne_unique: true }],
  taches: [T(1, 20, 'Pelle'), T(2, 20, 'Grue'), T(3, 20, 'Nacelle'), T(4, 21, 'Gravier'), T(5, 21, 'Sable'), T(6, 21, 'Béton')],
  elements_groupes: []
};
const etat = (page, id) => page.evaluate((i) => {
  const jour = typeof jourMobileIso !== 'undefined' ? jourMobileIso : null;
  const l = document.querySelector('#racine .grille > .lbl[data-ligne="p' + i + '"]'), b = l && l.querySelector(':scope > .ligne-ouvrir');
  const rl = l.getBoundingClientRect(), u = parseFloat(getComputedStyle(document.querySelector('#racine')).getPropertyValue('--mob-carte-pers'));
  const cartes = [...document.querySelectorAll('#racine .grille > .bulle')].filter((x) => x.style.gridRow.split('/')[0].trim() === l.style.gridRow.split('/')[0].trim())
    .map((x) => x.querySelector('.b-carte').getBoundingClientRect()).filter((r) => r.width);
  return { jour, fleche: b ? b.textContent : null, h: Math.round(rl.height), u: Math.round(u), nb: cartes.length,
    entieres: cartes.filter((r) => r.top >= rl.top - 0.5 && r.bottom <= rl.bottom + 0.5).length,
    choisie: l.classList.contains('ligne-choisie'), menu: !!document.querySelector('.menu-pop') };
}, id);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  for (const mode of ['ordinateur', 'téléphone']) {
    const tel = mode === 'téléphone';
    const { page, erreurs } = await ouvrirPlanning(browser, Object.assign({ bd: BD }, tel ? { viewport: { width: 390, height: 800 }, hasTouch: true, date: '2026-09-21T10:00:00' } : {}));
    await page.waitForTimeout(700);
    const cliquer = async (id) => {
      // Aux coordonnées : locator.tap() ferait d'abord défiler la grille
      // (étiquette collante) et changerait le jour affiché.
      const bb = await page.locator('#racine .grille > .lbl[data-ligne="p' + id + '"] > .ligne-ouvrir').first().boundingBox();
      if (tel) await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(400);
    };

    // --- 1. Flèches, repliées par défaut ---------------------------------------------
    const debut = [await etat(page, 20), await etat(page, 21), await etat(page, 1)];
    verifier(debut[0].fleche === '▸' && debut[1].fleche === '▸' && debut[2].fleche === null &&
      debut[0].entieres === 1 && debut[1].entieres === 1 && debut[2].h > debut[0].h,
      mode + ' : flèche ▸ sur Machines et Transports (pas sur Paul), hauteur d’une bulle, une seule entière (' + JSON.stringify(debut) + ')');

    // --- 2-3. Ouvrir / refermer -------------------------------------------------------
    for (const id of [20, 21]) {
      await cliquer(id);
      const o = await etat(page, id);
      await page.evaluate(() => render(false));
      await page.waitForTimeout(500);
      const rendu = await etat(page, id);
      await cliquer(id);
      const f = await etat(page, id);
      verifier(o.fleche === '▾' && o.nb === 3 && o.entieres === 3 && o.h > debut[0].h && !o.choisie && !o.menu &&
        rendu.fleche === '▾' && rendu.h === o.h && f.jour === debut[0].jour && f.fleche === '▸' && f.h === debut[0].h && f.entieres === 1 && !f.choisie && !f.menu,
        mode + ' : flèche ' + (id === 20 ? 'Machines' : 'Transports') + ' — toutes les bulles, puis hauteur d’une bulle (' + JSON.stringify([o, rendu, f]) + ')');
    }

    // --- 4. Menu du nom ------------------------------------------------------------------
    if (!tel) {
      const menu = async (id) => {
        const r = await page.evaluate((i) => { const b = document.querySelector('#racine .grille > .lbl[data-ligne="p' + i + '"] b').getBoundingClientRect(); return { x: b.x + 5, y: b.y + 5 }; }, id);
        await page.mouse.click(r.x, r.y, { button: 'right' });
        await page.waitForTimeout(300);
        const t = await page.evaluate(() => [...document.querySelectorAll('.menu-pop button')].map((b) => b.textContent));
        await page.keyboard.press('Escape');
        await page.mouse.click(1300, 880);
        await page.waitForTimeout(200);
        return t;
      };
      const mM = await menu(20), mP = await menu(1);
      verifier(mM.includes('Masquer la ligne') && !mM.some((t) => /Replier/.test(t)) && mP.includes('Replier la ligne'),
        mode + ' : menu Machines sans « Replier la ligne », Paul le garde (' + JSON.stringify([mM, mP]) + ')');
    }
    verifier(!erreurs.length, mode + ' : aucune erreur JS (' + erreurs.join(' | ') + ')');
    await page.close();
  }
  await browser.close();
  bilan();
})();
