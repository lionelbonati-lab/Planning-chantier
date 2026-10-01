const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 115). Lionel : « Réordonner les noms. »
// Vérifie :
//   1. glisser un nom à la souris le place avant / après un autre : lignes
//      réordonnées tout de suite, ordre écrit en base (1..N sur la liste
//      complète, désactivée comprise, seules les lignes changées écrites) ;
//      la ligne n'est pas choisie par le clic qui termine le geste ;
//   2. une personne seule reste parmi les personnes seules (lâchée sur les
//      équipes : en tête des personnes seules) ;
//   3. une équipe se déplace parmi les équipes, ses membres la suivent ;
//   4. menu du nom : « Monter » / « Descendre » (grisé en bout de groupe) ;
//   5. un clic simple sur un nom le choisit toujours ;
//   6. téléphone : « Monter » / « Descendre » dans le menu du nom.
//
// Lancer : node test_suite115.js

// Round du 01.10.2026 (suite 133) : une équipe repliée cache tous ses
// membres (retour 6, « J'aimerai pouvoir replier complètement les
// équipes. ») ; l'équipe A est donc ouverte dépliée pour voir son membre.
const DEPLIEE = { 'planning.equipesDepliees': '{"10":true}' };

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const BD = () => ({
  personnes: [
    P(1, 'Anne', 1), P(2, 'Bruno', 2), P(3, 'Chloé', 3), P(4, 'Membre', 4),
    P(10, 'Équipe A', 5, { equipe: true }), P(11, 'Équipe B', 6, { equipe: true }),
    P(20, 'Électricien', 7, { sous_traitant: true }), P(21, 'Plombier', 8, { sous_traitant: true }),
    P(30, 'Ancien', 9, { actif: false })
  ],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-14', membres: [4] }],
  taches: [{ id: 1, personne_id: 4, date: '2026-09-23', demi: 'matin', ordre: 0, texte: 'Coffrage', chantier_id: 1 }]
});

const lignes = (page) => page.evaluate(() => [...document.querySelectorAll('#racine .grille > [data-ligne^="p"]')]
  .map((l) => PERSONNES.find((p) => 'p' + p.id === l.dataset.ligne).nom).join(','));
const ordresBD = (page) => page.evaluate(() => window.__BD.personnes.slice().sort((a, b) => a.ordre - b.ordre).map((p) => p.nom + '=' + p.ordre).join(','));
const boite = (page, id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="p' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, haut: r.top, bas: r.bottom }; }, id);
async function glisser(page, de, versY) {
  await page.mouse.move(de.x, de.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(de.x, de.y + (versY - de.y) * k / 8);
  const trait = await page.evaluate(() => { const t = document.querySelector('.trait-ordre-ligne'); return !!t && t.style.display !== 'none'; });
  await page.mouse.up();
  await page.waitForTimeout(300);
  return trait;
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD(), localStorage: DEPLIEE });
    let l = await lignes(page);
    verifier(l.startsWith('Équipe A,Membre,Équipe B,Anne,Bruno,Chloé'), 'ordre de départ : ' + l);

    // --- 1. Chloé au-dessus d'Anne ---------------------------------------------
    const anne = await boite(page, 1);
    const trait = await glisser(page, await boite(page, 3), anne.haut + 3);
    l = await lignes(page);
    let bd = await ordresBD(page);
    const ecrites = await page.evaluate(() => window.__ECRITURES.filter((e) => e === 'personnes:update').length);
    const choix = await page.evaluate(() => document.querySelectorAll('#racine .ligne-choisie').length);
    verifier(trait, 'glisser : un trait montre la place d\'arrivée');
    verifier(l.startsWith('Équipe A,Membre,Équipe B,Chloé,Anne,Bruno'), 'glisser Chloé sur le haut d\'Anne : Chloé avant Anne (' + l + ')');
    verifier(bd === 'Chloé=1,Anne=2,Bruno=3,Membre=4,Équipe A=5,Équipe B=6,Électricien=7,Plombier=8,Ancien=9' && ecrites === 3,
      'ordre en base renuméroté, 3 lignes écrites, la désactivée garde sa place (' + bd + ', ' + ecrites + ' écritures)');
    verifier(choix === 0, 'le clic qui termine le glisser ne choisit pas la ligne (' + choix + ')');

    // --- 2. Anne lâchée sur les équipes : en tête des personnes seules --------------
    await glisser(page, await boite(page, 1), (await boite(page, 10)).y);
    l = await lignes(page);
    verifier(l.startsWith('Équipe A,Membre,Équipe B,Anne,Chloé,Bruno'), 'personne seule lâchée sur les équipes : en tête des personnes seules (' + l + ')');

    // --- 3. Équipe B au-dessus de l'équipe A -----------------------------------------
    await glisser(page, await boite(page, 11), (await boite(page, 10)).haut + 3);
    l = await lignes(page);
    bd = await ordresBD(page);
    verifier(l.startsWith('Équipe B,Équipe A,Membre,Anne,Chloé,Bruno'), 'équipe B avant l\'équipe A, le membre suit son équipe (' + l + ')');
    verifier(/Équipe B=\d,Équipe A=/.test(bd), 'ordre des équipes en base (' + bd + ')');

    // --- 4. Menu du nom : Monter / Descendre -------------------------------------------
    let b = await boite(page, 2);
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.waitForTimeout(150);
    const menu = await page.evaluate(() => {
      const m = document.querySelector('.menu-hauteur-ligne');
      return { monter: !!m.querySelector('[data-a="monter"]:not([disabled])'), descendre: !!m.querySelector('[data-a="descendre"][disabled]') };
    });
    verifier(menu.monter && menu.descendre, 'menu de Bruno (dernier) : « Monter » actif, « Descendre » grisé ' + JSON.stringify(menu));
    await page.click('.menu-hauteur-ligne [data-a="monter"]');
    await page.waitForTimeout(300);
    l = await lignes(page);
    verifier(l.startsWith('Équipe B,Équipe A,Membre,Anne,Bruno,Chloé'), '« Monter » : Bruno avant Chloé (' + l + ')');
    const actives = await page.evaluate(() => etat.personnesActives.filter((p) => !p.sous_traitant && !p.equipe).map((p) => p.nom + '=' + p.ordre).join(','));
    verifier(actives === 'Anne=1,Bruno=2,Chloé=3,Membre=4', 'personnes actives à jour (ordre et numéros) : ' + actives);

    // --- 5. Clic simple : la ligne est choisie -------------------------------------------
    b = await boite(page, 1);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(200);
    const choisies = await page.evaluate(() => [...document.querySelectorAll('#racine .ligne-choisie')].map((l) => l.dataset.ligne).join(','));
    verifier(choisies === 'p1', 'clic simple sur un nom : la ligne est choisie (' + choisies + ')');

    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Téléphone : Monter / Descendre dans le menu du nom ----------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD(), localStorage: DEPLIEE });
    const r = await page.evaluate(() => {
      const lbl = document.querySelector('#racine .grille > [data-ligne="p1"]');
      ouvrirMenuHauteurLigne(lbl, 100, 100);
      const m = document.querySelector('.menu-hauteur-ligne');
      return { monter: !!m.querySelector('[data-a="monter"][disabled]'), descendre: !!m.querySelector('[data-a="descendre"]:not([disabled])') };
    });
    verifier(r.monter && r.descendre, 'téléphone, menu d\'Anne (première) : « Monter » grisé, « Descendre » actif ' + JSON.stringify(r));
    await page.click('.menu-hauteur-ligne [data-a="descendre"]');
    await page.waitForTimeout(300);
    const bd = await ordresBD(page);
    verifier(bd.startsWith('Bruno=1,Anne=2,Chloé=3'), 'téléphone, « Descendre » : Anne après Bruno en base (' + bd + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
