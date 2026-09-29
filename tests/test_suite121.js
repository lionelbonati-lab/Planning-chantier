const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 121). Lionel :
//   « impossible de changer plusieurs bulle d'un coup entre personnel et
//     équipe » ;
//   « Les nouveaux réglages ne sont pas lié à l'aperçu d'écran » ;
//   « en impression, la case de l'année est décalée ».
// (« sur tablette quand je veux défiler gauche/droite, ca me change les
// page involontairement » : test_swipe_tablette_1semaine.js, test_suite26.js,
// test_suite89.js, test_selection_multijour_tablette.js.)
// Vérifie :
//   1. 2 bulles d'Anne sélectionnées (Ctrl), glissées sur la ligne de
//      l'équipe : les deux passent à l'équipe ; glissées ensuite sur Bruno :
//      les deux passent à Bruno ; une bulle hors sélection ne bouge pas ;
//   2. page Affichage : hauteur des lignes, hauteur Jalons et Notes, espace
//      entre les bulles et lignes de texte des Jalons changent l'aperçu ;
//      lignes Jalons et Notes présentes ;
//   3. impression : la case de l'année reste une case du tableau (pas de
//      display:block), alignée avec la ligne des mois.
//
// Lancer : node test_suite121.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const T = (id, pid, date, texte) => ({ id, personne_id: pid, date, demi: 'matin', ordre: 0, texte, chantier_id: 1 });
const BD = () => ({
  personnes: [P(10, 'Équipe A', 1, { equipe: true }), P(4, 'Membre', 2), P(1, 'Anne', 3), P(2, 'Bruno', 4)],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-21', membres: [4] }],
  taches: [T(1, 1, '2026-09-22', 'Un'), T(2, 1, '2026-09-23', 'Deux'), T(3, 10, '2026-09-24', 'Trois')]
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Bulles groupées entre lignes -------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    const centre = (texte) => page.evaluate((texte) => { const t = TACHES.find((x) => x.texte === texte); const r = document.querySelector('#racine .bulle[data-id="' + t.id + '"] > .b-carte').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, texte);
    const milieuLigne = (id) => page.evaluate((id) => { const r = document.querySelector('#racine .grille > [data-ligne="p' + id + '"]').getBoundingClientRect(); return r.top + r.height / 2; }, id);
    const selectionner = async () => {
      const a = await centre('Un'), b = await centre('Deux');
      await page.mouse.click(a.x, a.y);
      await page.keyboard.down('Control'); await page.mouse.click(b.x, b.y); await page.keyboard.up('Control');
      await page.waitForTimeout(200);
      return a;
    };
    const glisserVers = async (a, y) => {
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(a.x, (a.y + y) / 2, { steps: 5 }); await page.mouse.move(a.x, y, { steps: 5 });
      await page.waitForTimeout(100);
      await page.mouse.up(); await page.waitForTimeout(500);
    };
    const etat = () => page.evaluate(() => window.__BD.taches.map((t) => t.texte + ':' + t.personne_id + ':' + t.date).sort().join(','));

    let a = await selectionner();
    const n = await page.evaluate(() => Object.keys(bullesSelectionnees).length);
    await glisserVers(a, await milieuLigne('10'));
    const e1 = await etat();
    verifier(n === 2 && e1 === 'Deux:10:2026-09-23,Trois:10:2026-09-24,Un:10:2026-09-22',
      '2 bulles d\'Anne → ligne de l\'équipe : les deux passent à l\'équipe, mêmes jours (' + n + ' ; ' + e1 + ')');

    await page.mouse.click(5, 790); await page.waitForTimeout(150);
    a = await selectionner();
    await glisserVers(a, await milieuLigne('2'));
    const e2 = await etat();
    verifier(e2 === 'Deux:2:2026-09-23,Trois:10:2026-09-24,Un:2:2026-09-22',
      'même paire → ligne de Bruno : les deux passent à Bruno, « Trois » (hors sélection) reste à l\'équipe (' + e2 + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Aperçu de la page Affichage ---------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    await page.evaluate(() => afficherPage('affichage'));
    await page.waitForTimeout(300);
    const grille = () => page.evaluate(() => {
      const g = document.querySelector('#apercuAffichage .aa-grille');
      const pile = [...g.querySelectorAll('.aa-bulle')].find((b) => b.querySelectorAll('.aa-carte').length === 2);
      const jal = g.querySelector('.aa-bulle-jal .aa-txt');
      return {
        rangees: g.style.gridTemplateRows,
        noms: [...g.querySelectorAll('.aa-nom-jal')].map((x) => x.textContent).join(','),
        ecart: pile ? getComputedStyle(pile).rowGap : null,
        clamp: jal ? getComputedStyle(jal).webkitLineClamp : null
      };
    });
    const avant = await grille();
    const changer = (id, v) => page.evaluate(([id, v]) => changerOptionAffichage(id, v, 'ordi'), [id, v]);
    await changer('hauteurLigneOrdi', '150');
    await changer('hauteurJalOrdi', '50');
    await changer('espaceBullesOrdi', '9');
    await changer('lignesJal', '2');
    await page.waitForTimeout(200);
    const apres = await grille();
    verifier(avant.noms === 'Jalons,Notes' && /32px 32px 117px 117px 117px$/.test(avant.rangees) && avant.ecart === '3px' && avant.clamp === '1',
      'aperçu par défaut : lignes Jalons et Notes, hauteurs 32 / 117 px, espace 3 px, 1 ligne (' + JSON.stringify(avant) + ')');
    verifier(/50px 50px 150px 150px 150px$/.test(apres.rangees) && apres.ecart === '9px' && apres.clamp === '2',
      'réglages changés : l\'aperçu suit (hauteurs 50 / 150 px, espace 9 px, 2 lignes) (' + JSON.stringify(apres) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Impression : case de l'année ----------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(300);
    await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(150);
    const c = await page.evaluate(() => {
      const th = document.querySelector('table.print-table tr.print-mois th.coin-annee');
      if (!th) return null;
      const voisin = th.nextElementSibling, r = th.getBoundingClientRect(), rv = voisin.getBoundingClientRect();
      return { display: getComputedStyle(th).display, texte: th.textContent, haut: Math.round(r.top - rv.top), hauteur: Math.round(r.height - rv.height) };
    });
    verifier(c && c.display === 'table-cell' && c.texte === '2026' && c.haut === 0 && c.hauteur === 0,
      'impression : case « 2026 » dans le tableau, alignée sur la ligne des mois (' + JSON.stringify(c) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
