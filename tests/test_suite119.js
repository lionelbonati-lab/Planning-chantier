const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 119). Lionel : « mettre une couleur sur
// l'équipe, je vois qu'il y a une bordure grise, il serait bien de pouvoir
// choisir sa couleur par équipe ».
// Vérifie :
//   1. sans couleur : bande à la couleur d'accent, comme avant ;
//   2. menu du nom de l'équipe : « Couleur de l'équipe », 8 pastilles et
//      le sélecteur du système ; une pastille → couleur écrite en base,
//      bande de l'équipe à cette couleur, plus pâle sur ses membres ;
//      l'autre équipe et les personnes seules ne changent pas ;
//   3. ↺ : couleur par défaut (null en base) ;
//   4. page Personnel : pastille sur la ligne de l'équipe (sélecteur),
//      pas sur les personnes ; la changer colore l'équipe au planning.
//
// Lancer : node test_suite119.js

// Round du 01.10.2026 (suite 133) : une équipe repliée cache tous ses
// membres (retour 6, « J'aimerai pouvoir replier complètement les
// équipes. ») ; l'équipe A est donc ouverte dépliée pour voir son membre.
const DEPLIEE = { 'planning.equipesDepliees': '{"10":true}' };

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const BD = () => ({
  personnes: [P(1, 'Anne', 1), P(4, 'Membre', 2), P(10, 'Équipe A', 3, { equipe: true }), P(11, 'Équipe B', 4, { equipe: true })],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-21', membres: [4] }],
  taches: [{ id: 1, personne_id: 4, date: '2026-09-24', demi: 'matin', ordre: 0, texte: 'Coffrage', chantier_id: 1 }]
});

const bandes = (page) => page.evaluate(() => {
  const l = (id) => getComputedStyle(document.querySelector('#racine .grille > [data-ligne="' + id + '"]')).boxShadow;
  return { a: l('p10'), m: l('p4'), b: l('p11'), anne: l('p1'), bd: window.__BD.personnes.find((p) => p.id === 10).couleur || null };
});
async function menu(page, id) {
  const c = await page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await page.waitForTimeout(150);
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), localStorage: DEPLIEE });
    // --- 1. Sans couleur ----------------------------------------------------------
    const e0 = await bandes(page);
    const accent = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--accent)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    verifier(e0.a.includes(accent) && e0.b.includes(accent) && e0.bd === null, 'sans couleur : bande à la couleur d\'accent (' + e0.a + ')');

    // --- 2. Menu du nom : une pastille ---------------------------------------------
    await menu(page, 'p10');
    const m = await page.evaluate(() => {
      const pop = document.querySelector('.menu-hauteur-ligne');
      return { titre: [...pop.querySelectorAll('.cp-titre')].some((t) => /Couleur de l.équipe/.test(t.textContent)),
        n: pop.querySelectorAll('.mc-couleurs .mc-pastille[data-couleur]').length, autre: !!pop.querySelector('.mc-couleurs input[type="color"]'), defaut: !!pop.querySelector('.mc-defaut') };
    });
    verifier(m.titre && m.n === 8 && m.autre && !m.defaut, 'menu de l\'équipe : « Couleur de l\'équipe », 8 pastilles, sélecteur, pas de ↺ ' + JSON.stringify(m));
    await page.click('.menu-hauteur-ligne .mc-pastille[data-couleur="#e53935"]');
    await page.waitForTimeout(300);
    let e = await bandes(page);
    verifier(e.bd === '#e53935', 'couleur écrite en base (' + e.bd + ')');
    verifier(e.a.includes('rgb(229, 57, 53)') && /(rgba\(229, 57, 53, 0\.45\)|color\(srgb 0\.898\d* 0\.2235\d* 0\.2078\d* \/ 0\.45\))/.test(e.m), 'bande de l\'équipe rouge, plus pâle sur son membre ' + JSON.stringify(e));
    verifier(e.b === e0.b && e.anne === e0.anne, 'l\'autre équipe et les personnes seules ne changent pas');
    const menuPersonne = await (async () => { await menu(page, 'p1'); const r = await page.evaluate(() => !!document.querySelector('.menu-hauteur-ligne .mc-couleurs')); await page.keyboard.press('Escape'); await page.mouse.click(5, 790); await page.waitForTimeout(150); return r; })();
    verifier(!menuPersonne, 'pas de couleur dans le menu d\'une personne');

    // --- 3. ↺ ------------------------------------------------------------------------
    await menu(page, 'p10');
    const actif = await page.evaluate(() => { const b = document.querySelector('.menu-hauteur-ligne .mc-pastille.active'); return b && b.dataset.couleur; });
    await page.click('.menu-hauteur-ligne .mc-defaut');
    await page.waitForTimeout(300);
    e = await bandes(page);
    verifier(actif === '#e53935' && e.bd === null && e.a === e0.a && e.m === e0.m, '↺ : couleur par défaut (' + actif + ', ' + e.bd + ')');

    // --- 4. Page Personnel -------------------------------------------------------------
    await page.evaluate(() => document.querySelector('.onglet[data-page="personnel"]').click());
    await page.waitForTimeout(300);
    const pastilles = await page.evaluate(() => [...document.querySelectorAll('#page-personnel .ligne-intervenant')].map((l) => l.querySelector('b').textContent + ':' + !!l.querySelector('.pastille-equipe')).join(','));
    verifier(/Équipe A:true/.test(pastilles) && /Équipe B:true/.test(pastilles) && /Anne:false/.test(pastilles), 'page Personnel : pastille sur les équipes seulement (' + pastilles + ')');
    await page.evaluate(() => {
      const i = [...document.querySelectorAll('#page-personnel .ligne-intervenant')].find((l) => l.querySelector('b').textContent === 'Équipe B').querySelector('.pastille-equipe');
      i.value = '#1e88e5'; i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('.onglet[data-page="planning"]').click());
    await page.waitForTimeout(300);
    e = await bandes(page);
    const bdB = await page.evaluate(() => window.__BD.personnes.find((p) => p.id === 11).couleur);
    verifier(bdB === '#1e88e5' && e.b.includes('rgb(30, 136, 229)'), 'pastille de la page Personnel : équipe B bleue au planning (' + bdB + ', ' + e.b + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
