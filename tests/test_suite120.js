const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 120). Lionel :
//   « en mode ajout multiple le menu ne se place pas à côté du curseur de
//     souris » ;
//   « Pas possible de rajouter de taches ou absence pour les ouvriers
//     repliés sous la ligne équipe » ;
//   « Pas possible de bouger une bulle seule sélectionnée avec les
//     flèches, marche en mode multi ».
// Vérifie :
//   1. mode ajout, glisser sur 2 lignes : le menu s'ouvre au point de
//      relâchement (plus centré sous la grille) ;
//   2. « + » → Absence → « pour qui ? » : le membre caché y figure ;
//   3. menu d'ajout de la ligne d'équipe repliée : « Pour un membre » avec
//      le membre caché ; son nom → menu du membre (Absence) ; « Congé »
//      posé sur SA ligne ;
//   4. une bulle seule sélectionnée : → la décale d'une demi-journée.
// Le bandeau de mise à jour (sw.js) : test_suite120_sw.js.
//
// Lancer : node test_suite120.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const BD = () => ({
  personnes: [P(10, 'Équipe A', 1, { equipe: true }), P(4, 'Membre', 2), P(1, 'Anne', 3), P(2, 'Bruno', 4)],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-21', membres: [4] }],
  taches: [{ id: 1, personne_id: 1, date: '2026-09-22', demi: 'matin', ordre: 0, texte: 'Seule', chantier_id: 1 }]
});

// Point d'une case (personne, jour, demi) où la case elle-même est sous le pointeur.
const point = (page, pid, iso, demi) => page.evaluate(([pid, iso, demi]) => {
  let gi = -1;
  for (let g = 0; g < 80; g++) if (isoDeGi(g) === iso) { gi = g; break; }
  const c = document.querySelector('.cell[data-kind="personne"][data-personne="' + pid + '"][data-demi="' + demi + '"][data-jour="' + gi + '"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  for (const fy of [0.85, 0.5, 0.15]) for (const fx of [0.85, 0.5, 0.15]) {
    const x = r.x + r.width * fx, y = r.y + r.height * fy;
    if (document.elementFromPoint(x, y) === c) return { x, y };
  }
  return null;
}, [pid, iso, demi]);
const boutons = (page) => page.evaluate(() => { const m = document.querySelector('.menu-pop'); return m ? [...m.querySelectorAll('button')].map((b) => b.textContent.trim()) : null; });
const fermer = async (page) => { await page.keyboard.press('Escape'); await page.mouse.click(5, 790); await page.waitForTimeout(150); };

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    await page.evaluate(() => changerModeAjoutPlanning(true));
    await page.waitForTimeout(150);

    // --- 1. Ajout multiple : menu au curseur ------------------------------------------
    const de = await point(page, '1', '2026-09-23', 'matin'), vers = await point(page, '2', '2026-09-24', 'matin');
    await page.mouse.move(de.x, de.y);
    await page.mouse.down();
    await page.mouse.move((de.x + vers.x) / 2, (de.y + vers.y) / 2, { steps: 5 });
    await page.mouse.move(vers.x, vers.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const pos = await page.evaluate(() => { const m = document.querySelector('.menu-pop'); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left, y: r.top, titre: m.querySelector('.cp-titre').textContent }; });
    verifier(pos && /2 personnes/.test(pos.titre) && Math.abs(pos.x - (vers.x + 8)) < 2 && Math.abs(pos.y - (vers.y + 8)) < 2,
      'ajout multiple : menu au point de relâchement (' + JSON.stringify(pos) + ' / ' + JSON.stringify(vers) + ')');
    await fermer(page);

    // --- 2. « + » → Absence → pour qui : membre caché proposé ---------------------------------
    const cache = await page.evaluate(() => !personnesAffichees('personnel').some((p) => p.id === '4'));
    await page.click('#btnAjoutElement');
    await page.click('#menuAjoutElement [data-type="absence"]');
    await page.waitForTimeout(150);
    const pourQui = await page.evaluate(() => [...document.querySelectorAll('#pageAjoutPersonne [data-personne]')].map((x) => x.textContent).join(','));
    verifier(cache && pourQui === 'Membre,Anne,Bruno', '« + » Absence : membre caché proposé (' + pourQui + ', caché ' + cache + ')');
    await page.click('#btnAjoutElement');
    await page.waitForTimeout(150);

    // --- 3. Ligne d'équipe repliée : « Pour un membre » -----------------------------------
    const lignes = await page.evaluate(() => [...document.querySelectorAll('#racine .grille > .lbl[data-ligne^="p"]')].map((l) => l.dataset.ligne).join(','));
    verifier(lignes === 'p10,p1,p2', 'équipe repliée : membre caché (' + lignes + ')');
    const c = await point(page, '10', '2026-09-24', 'matin');
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(200);
    let b = await boutons(page);
    verifier(b && !b.includes('Absence') && b.includes('Membre ›'), 'menu de l\'équipe : pas d\'absence, « Membre › » sous « Pour un membre » ' + JSON.stringify(b));
    await page.click('.menu-pop button[data-membre="4"]');
    await page.waitForTimeout(150);
    b = await boutons(page);
    const titre = await page.evaluate(() => document.querySelector('.menu-pop .cp-titre').textContent);
    verifier(/Membre/.test(titre) && b.includes('Absence') && b.includes('Congé') && !b.includes('Membre ›'), 'nom du membre : son menu (Absence, Congé) ' + titre + ' ' + JSON.stringify(b));
    await page.click('.menu-pop button[data-rapide="Congé"]');
    await page.waitForTimeout(500);
    const conge = await page.evaluate(() => window.__BD.taches.filter((t) => /Congé/.test(t.texte)).map((t) => t.personne_id + ':' + t.date + ':' + t.demi));
    verifier(conge.length === 1 && /^4:2026-09-24:matin$/.test(conge[0]), 'congé posé sur la ligne du membre (' + conge + ')');

    await page.evaluate(() => changerModeAjoutPlanning(false));

    // --- 4. Flèche sur une bulle seule ----------------------------------------------------------
    const cb = await page.evaluate(() => { const t = TACHES.find((x) => x.texte === 'Seule'); const r = document.querySelector('#racine .bulle[data-id="' + t.id + '"] > .b-carte').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(cb.x, cb.y);
    await page.waitForTimeout(300);
    const avant = await page.evaluate(() => ({ n: Object.keys(bullesSelectionnees).length, multi: modeSelectionMultiple }));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const t = await page.evaluate(() => window.__BD.taches.filter((x) => x.texte === 'Seule').map((x) => x.date + ':' + x.demi).join(','));
    verifier(avant.n === 1 && !avant.multi && t === '2026-09-22:aprem', 'bulle seule sélectionnée, → : décalée d\'une demi-journée (' + JSON.stringify(avant) + ' ' + t + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
