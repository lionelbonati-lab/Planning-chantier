const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 82). Lionel :
//   « Jour voisins n'affichent qu'une demi journée. »
//   « Regrouper les boutons mode de vue en 1 seul bouton afin qu'un seul
//     mode ne soit actif à la fois. Comportement du clic sur le bouton 1
//     semaine > jours voisin > 2 semaines > 1 semaine. »
// Vérifie :
//   1. un seul bouton de vue (#btnModeVue), plus de « Afficher 2 semaines »
//      ni de « Jours voisins aux bords » à part ; sur « 1 semaine » ;
//   2. clics : 1 semaine → jours voisins → 2 semaines → 1 semaine, un seul
//      mode à la fois (icône, libellé, survol, vue rendue, réglage) ;
//   3. jours voisins : le vendredi d'avant et le lundi d'après en entier
//      (matin et après-midi à l'écran, aussi larges qu'un jour de la
//      semaine), la bulle du vendredi lisible ;
//   4. touche V : même tour ;
//   5. ouverture en 2 semaines (réglage) avec « jours voisins » enregistré :
//      2 semaines seules, bouton sur « 2 semaines ».
//
// Lancer : node test_suite82.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const PERS = [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }];
const TACHES = [
  { id: 1, personne_id: 1, date: '2026-09-18', demi: 'matin', ordre: 0, texte: 'Vendredi matin', chantier_id: 1 },
  { id: 2, personne_id: 2, date: '2026-09-18', demi: 'aprem', ordre: 0, texte: 'Vendredi aprem', chantier_id: 1 },
  { id: 3, personne_id: 1, date: '2026-09-28', demi: 'aprem', ordre: 0, texte: 'Lundi aprem', chantier_id: 1 }
];
const vue = (page) => page.evaluate(() => {
  const b = document.getElementById('btnModeVue');
  return { mode: b.dataset.mode, libelle: b.querySelector('.toolbar-btn-label').textContent, titre: b.title,
    icone: (() => { const t = document.createElement('span'); t.innerHTML = ICONS[{ semaine: 'uneSemaine', bords: 'joursBords', deux: 'deuxSemaines' }[b.dataset.mode]]; return b.querySelector('.mode-vue-icone').innerHTML === t.innerHTML; })(),
    bords: document.getElementById('racine').classList.contains('vue-bords'), deux: deuxSemaines, opt: vueBords ? 'oui' : 'non', jours: nbJoursAffiches() }; // suite 84 : vueBords
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 700 }, bd: { personnes: PERS, taches: TACHES } });
    await page.waitForTimeout(400);
    // --- 1. Un seul bouton ---
    const b = await page.evaluate(() => ({ un: document.querySelectorAll('#btnModeVue').length, anciens: !!document.getElementById('btnDeuxSemaines') || !!document.getElementById('btnJoursBords') || !!document.getElementById('groupeJoursBords'),
      place: document.getElementById('btnModeVue').parentElement.id }));
    let v = await vue(page);
    verifier(b.un === 1 && !b.anciens && b.place === 'groupeNavSemaine' && v.mode === 'semaine' && v.icone && v.libelle === '1 semaine' && v.titre === 'Vue : 1 semaine — clic : jours voisins' && !v.bords && !v.deux && v.jours === 5,
      'un seul bouton de vue, sur « 1 semaine » (' + JSON.stringify({ b, v }) + ')');

    // --- 2 et 3. Jours voisins ---
    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    v = await vue(page);
    verifier(v.mode === 'bords' && v.icone && v.libelle === 'Jours voisins' && v.titre === 'Vue : Jours voisins — clic : 2 semaines' && v.bords && !v.deux && v.opt === 'oui',
      '1er clic : jours voisins seuls (' + JSON.stringify(v) + ')');
    const bords = await page.evaluate(() => {
      const sc = document.querySelector('.scroller'), rs = sc.getBoundingClientRect(), g = rs.left + sc.clientLeft, d = g + sc.clientWidth;
      const th = (gi) => document.querySelector('.entete-planning-figee .th[data-gi="' + gi + '"]').getBoundingClientRect();
      const n = nbJoursAffiches(), ven = th(4), mar = th(6), lunS = th(n - 5);
      const bulle = (x) => { const e = [...sc.querySelectorAll('.bulle')].find((b) => b.textContent.trim() === x); const r = e.querySelector('.b-carte').getBoundingClientRect(); return r.left >= g - 1 && r.right <= d + 1 && r.width > 40; };
      return { venG: Math.round(ven.left - g), venL: Math.round(ven.width), jour: Math.round(mar.width), lunD: Math.round(d - lunS.right), lunL: Math.round(lunS.width),
        bulleVenM: bulle('Vendredi matin'), bulleVenA: bulle('Vendredi aprem'), bulleLunA: bulle('Lundi aprem') };
    });
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s82-bords.png' });
    verifier(Math.abs(bords.venG) <= 1 && Math.abs(bords.venL - bords.jour) <= 1 && Math.abs(bords.lunD) <= 3 && Math.abs(bords.lunL - bords.jour) <= 1,
      'jours voisins : le vendredi d\'avant et le lundi d\'après en entier, larges comme un jour (' + JSON.stringify(bords) + ')');
    verifier(bords.bulleVenM && bords.bulleVenA && bords.bulleLunA, 'jours voisins : bulles du matin et de l\'après-midi à l\'écran (' + JSON.stringify(bords) + ')');

    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    v = await vue(page);
    verifier(v.mode === 'deux' && v.icone && v.libelle === '2 semaines' && v.titre === 'Vue : 2 semaines — clic : 1 semaine' && !v.bords && v.deux && v.opt === 'non' && v.jours === 10,
      '2e clic : 2 semaines seules, jours voisins éteints (' + JSON.stringify(v) + ')');
    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    v = await vue(page);
    verifier(v.mode === 'semaine' && !v.bords && !v.deux && v.jours === 5, '3e clic : retour à 1 semaine (' + JSON.stringify(v) + ')');

    // --- 4. Touche V ---
    const tour = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press('v'); await page.waitForTimeout(900); tour.push((await vue(page)).mode); }
    verifier(tour.join(' > ') === 'bords > deux > semaine', 'touche V : même tour (' + tour.join(' > ') + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    // --- 5. Ouverture en 2 semaines, jours voisins enregistrés ---
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 700 }, bd: { reglages: [{ cle: 'affichage', valeur: { bords: 'oui', vueOrdi: '2' } }] } });
    await page.waitForTimeout(600);
    const v = await vue(page);
    verifier(v.mode === 'deux' && v.deux && !v.bords && v.jours === 10, 'ouverture en 2 semaines avec « jours voisins » enregistré : 2 semaines seules (' + JSON.stringify(v) + ')');
    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    const w = await vue(page);
    verifier(w.mode === 'semaine' && !w.bords && w.opt === 'non', 'clic suivant : 1 semaine, pas les jours voisins (' + JSON.stringify(w) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  verifier(toutesErreurs.length === 0, 'aucune erreur console (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
