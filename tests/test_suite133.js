const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 01.10.2026 (suite 133).
// Retour 6 — Lionel : « J'aimerai pouvoir replier complètement les
// équipes. Pour pouvoir travailler sur plusieurs équipes différentes en même
// temps sans cases intermédiaires. » Son choix : « Repli total par équipe »
// — le ▸ d'une équipe cache TOUS ses membres, même ceux qui ont une tâche
// ou une absence ; un petit point sur l'équipe signale qu'un membre caché a
// quelque chose ; ▾ ré-affiche.
// Retour 5 — Lionel : « Typed demande d'absence: Absence, congé » → la
// demande d'absence de l'ouvrier propose exactement « Absence » et « Congé »
// (sql/0034 côté serveur, même liste par défaut côté page).
// Vérifie :
//   1. ordinateur, équipes repliées : Luc (absence) et Marc (tâche) cachés,
//      les deux lignes d'équipe se suivent ; point « • » sur l'équipe A
//      seulement, noms dans l'info-bulle ;
//   2. ▾ : Luc et Marc affichés, plus de point ; ▸ : de nouveau cachés ;
//   3. téléphone, vue « 1 jour » : le point suit le jour (Luc le 24,
//      Marc le 25, rien le 23) ;
//   4. page de consultation : types « Absence » / « Congé » (liste du
//      serveur, et la même sans liste) ;
//   5. aucune erreur JS.
//
// Lancer : node test_suite133.js

const P = (id, nom, ordre, x) => Object.assign({ id, nom, sous_traitant: false, equipe: false, ordre, actif: true }, x || {});
const BD = () => ({
  personnes: [P(10, 'Équipe A', 1, { equipe: true }), P(11, 'Équipe B', 2, { equipe: true }), P(4, 'Luc', 3), P(5, 'Marc', 4), P(6, 'Paul', 5), P(1, 'Anne', 6)],
  equipes_compositions: [{ id: 1, equipe_id: 10, lundi: '2026-09-21', membres: [4, 5] }, { id: 2, equipe_id: 11, lundi: '2026-09-21', membres: [6] }],
  taches: [
    { id: 1, personne_id: 4, date: '2026-09-24', demi: 'matin', ordre: 0, texte: 'Congé', chantier_id: null, est_absence: true },
    { id: 2, personne_id: 5, date: '2026-09-25', demi: 'aprem', ordre: 0, texte: 'Coffrage', chantier_id: 1 }
  ]
});

const etat = (page) => page.evaluate(() => {
  const eq = (id) => document.querySelector('#racine .lbl-equipe[data-equipe="' + id + '"]');
  const pt = (id) => eq(id) && eq(id).querySelector('.equipe-point');
  return {
    lignes: [...document.querySelectorAll('#racine .grille > .lbl[data-ligne^="p"]')].map((l) => l.dataset.ligne).join(','),
    jour: typeof jourMobileIso === 'undefined' ? null : jourMobileIso,
    pointA: pt(10) ? pt(10).title : '',
    pointB: !!pt(11),
    titreA: eq(10) ? eq(10).title : ''
  };
});
async function fleche(page, id, tactile) {
  const b = await page.evaluate((id) => { const r = document.querySelector('#racine .lbl-equipe[data-equipe="' + id + '"] .equipe-repli').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, id);
  if (tactile) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(400);
}
async function defilerVers(page, iso) {
  await page.evaluate((iso) => {
    const G = grilleCourante_;
    const th = [...G.grilleEntete.querySelectorAll('.th[data-gi]')].find((t) => isoDeGi(+t.dataset.gi) === iso);
    G.scroller.scrollLeft = decalerSurColonne_(G, th);
  }, iso);
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1-2. Ordinateur ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { bd: BD() });
    let e = await etat(page);
    verifier(e.lignes === 'p10,p11,p1', 'repliées : tous les membres cachés (absence, tâche compris), lignes d’équipe qui se suivent (' + e.lignes + ')');
    verifier(e.pointA === 'Membres cachés avec une tâche ou une absence : Luc, Marc' && !e.pointB && e.titreA.includes(e.pointA),
      'point « • » sur l’équipe A seulement, noms dans l’info-bulle ' + JSON.stringify(e));
    await fleche(page, '10');
    e = await etat(page);
    verifier(e.lignes === 'p10,p4,p5,p11,p1' && e.pointA === '' && !/Membre/.test(e.titreA), '▾ : Luc et Marc affichés, plus de point (' + e.lignes + ')');
    await fleche(page, '10');
    e = await etat(page);
    verifier(e.lignes === 'p10,p11,p1' && e.pointA !== '', '▸ : de nouveau tous cachés, point revenu (' + e.lignes + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone, vue « 1 jour » -------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, bd: BD() });
    let e = await etat(page);
    verifier(e.jour === '2026-09-24' && e.lignes === 'p10,p11,p1' && e.pointA === 'Membre caché avec une tâche ou une absence : Luc',
      'jeu. 24 : membres cachés, point pour Luc (absence) ' + JSON.stringify(e));
    await defilerVers(page, '2026-09-25');
    e = await etat(page);
    verifier(e.jour === '2026-09-25' && e.lignes === 'p10,p11,p1' && e.pointA === 'Membre caché avec une tâche ou une absence : Marc',
      'ven. 25 : point pour Marc (tâche) ' + JSON.stringify(e));
    await defilerVers(page, '2026-09-23');
    e = await etat(page);
    verifier(e.jour === '2026-09-23' && e.lignes === 'p10,p11,p1' && e.pointA === '', 'mer. 23 : rien, pas de point ' + JSON.stringify(e));
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Consultation : types de la demande d'absence ------------------------------------
  for (const motifs of [['Absence', 'Congé'], undefined]) {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 }, hasTouch: true });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\/consultation_planning/, (r) => {
      const c = JSON.parse(r.request().postData());
      const d = { personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi: c.p_lundi || '2026-09-21', aujourdhui: '2026-09-24', min: '2026-08-24', max: '2027-03-22',
        feries: [], horaires: [], taches: [], peut_demander: true, demandes: [] };
      if (motifs) d.motifs = motifs;
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(d) });
    });
    await page.goto('file://' + path.join(__dirname, '..', 'consultation.html') + '?j=0123456789abcdef0123456789abcdef');
    await page.waitForTimeout(400);
    await page.click('#btnDemanderAbsence'); await page.waitForTimeout(150);
    const types = await page.evaluate(() => [...document.querySelectorAll('#faMotif option')].map((o) => o.textContent).join(' / '));
    verifier(types === 'Absence / Congé', 'consultation ' + (motifs ? '(liste du serveur)' : '(sans liste)') + ' : types « Absence » / « Congé » (' + types + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
