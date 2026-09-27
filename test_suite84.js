const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 84). Lionel :
//   « Si les bulles du jours de coté sont plus long elle n'apparaissent pas
//     complètement. Le but est que je puisse voir ce qui sera fait le
//     vendredi avant et le lundi après. il faut traiter ces jours de coté
//     comme le mode 1 jour du mobile. bulle et texte affichés sur le jour
//     même si la tâche est plus longue. »
//   « setup affichage, réglage à l'ouverture, manque le mode jours voisins »
// Vérifie :
//   1. page Affichage, « À l'ouverture » (ordinateur) : 1 semaine, Jours
//      voisins, 2 semaines ;
//   2. ouverture avec « Jours voisins » : vue jours voisins, bouton de vue
//      sur « Jours voisins » ; le bouton change la vue sans rien
//      enregistrer ; choisir « Jours voisins » sur la page l'enregistre ;
//   3. ancien réglage « bords » du compte : ouvre en jours voisins, montré
//      comme vue d'ouverture, remplacé par elle au prochain enregistrement ;
//      sans rien : 1 semaine ;
//   4. bulles des jours voisins : une carte par jour visible, texte au
//      début de chacune (tâche commencée plus tôt, tâche à cheval sur la
//      semaine, des deux côtés, jalon de l'en-tête) ; un clic sur la carte
//      du jour voisin touche bien la bulle ; en 1 et 2 semaines : cartes
//      normales ;
//   5. aperçu d'une poignée : cartes recoupées aussitôt.
//
// Lancer : node test_suite84.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const PERS = [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }, { id: 3, nom: 'Antoine', sous_traitant: false, ordre: 3, actif: true }];
const TACHES = [];
let n = 1;
const pose = (p, dates, texte) => dates.forEach((d) => ['matin', 'aprem'].forEach((demi) => TACHES.push({ id: n++, personne_id: p, date: d, demi, ordre: 0, texte, chantier_id: 1 })));
pose(1, ['2026-09-16', '2026-09-17', '2026-09-18'], 'Charpente toiture');
pose(2, ['2026-09-18', '2026-09-21', '2026-09-22'], 'Maçonnerie étage');
pose(3, ['2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29'], 'Crépi façade');
pose(1, ['2026-09-28', '2026-09-29', '2026-09-30'], 'Isolation combles');
const JALONS = ['2026-09-17', '2026-09-18', '2026-09-21'].map((d, i) => ({ id: 500 + i, date: d, texte: 'Livraison grue', serie_id: null, demi: null, chantier_id: null, important: false }));

const vue = (page) => page.evaluate(() => {
  const b = document.getElementById('btnModeVue');
  return { mode: b.dataset.mode, bords: document.getElementById('racine').classList.contains('vue-bords'), deux: deuxSemaines, vueBords,
    compte: ((window.__BD.reglages || []).find((x) => x.cle === 'affichage') || { valeur: {} }).valeur };
});
// Cartes d'une bulle (par son texte) : rectangles, texte de chacune.
const cartes = (page, texte) => page.evaluate((texte) => {
  const b = [...document.querySelectorAll('.grille .bulle')].find((x) => x.querySelector('.b-txt').textContent === texte);
  if (!b) return null;
  const sc = document.querySelector('.scroller'), rs = sc.getBoundingClientRect(), visG = rs.left + sc.clientLeft, visD = visG + sc.clientWidth;
  const th = (gi) => { const r = document.querySelector('.entete-planning-figee .th[data-gi="' + gi + '"]').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
  const n = nbJoursAffiches();
  return {
    id: b.dataset.id, morceaux: b.classList.contains('bulle-morceaux'), visG: Math.round(visG), visD: Math.round(visD),
    ven: th(4), lun: th(5), venS: th(n - 6), lunS: th(n - 5),
    cartes: [...b.querySelectorAll(':scope > .b-carte')].map((c) => { const r = c.getBoundingClientRect(), t = c.querySelector('.b-txt').getBoundingClientRect();
      return { g: Math.round(r.left), d: Math.round(r.right), tg: Math.round(t.left), td: Math.round(t.right), txt: c.querySelector('.b-txt').textContent, copie: c.classList.contains('b-carte-voisin') }; })
      .sort((a, b2) => a.g - b2.g)
  };
}, texte);
const dans = (c, j, tol = 2) => c.g >= j[0] - tol && c.d <= j[1] + tol;
const texteLisible = (c) => c.tg >= c.g && c.td <= c.d + 1 && c.td - c.tg > 20;

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 760 }, bd: { personnes: PERS, taches: TACHES, jalons: JALONS, reglages: [{ cle: 'affichage', valeur: { vueOrdi: 'bords' } }] } });
    await page.waitForTimeout(900);
    // --- 2. Ouverture en jours voisins ---
    let v = await vue(page);
    verifier(v.mode === 'bords' && v.bords && v.vueBords && !v.deux, 'vue d\'ouverture « Jours voisins » : vue jours voisins, bouton sur « Jours voisins » (' + JSON.stringify(v) + ')');

    // --- 4. Bulles des jours voisins ---
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s84-bords.png' });
    const ch = await cartes(page, 'Charpente toiture');
    verifier(ch && ch.morceaux && ch.cartes.length === 1 && dans(ch.cartes[0], ch.ven) && ch.cartes[0].g >= ch.visG - 1 && texteLisible(ch.cartes[0]),
      'tâche commencée le mercredi d\'avant : carte et texte sur le vendredi (' + JSON.stringify(ch) + ')');
    const ma = await cartes(page, 'Maçonnerie étage');
    verifier(ma && ma.cartes.length === 2 && dans(ma.cartes[0], ma.ven) && texteLisible(ma.cartes[0]) && ma.cartes[0].copie &&
      Math.abs(ma.cartes[1].g - ma.lun[0]) <= 2 && texteLisible(ma.cartes[1]) && !ma.cartes[1].copie,
      'tâche du vendredi d\'avant au mardi : une carte le vendredi, une dès lundi, chacune avec son texte (' + JSON.stringify(ma) + ')');
    const cr = await cartes(page, 'Crépi façade');
    verifier(cr && cr.cartes.length === 2 && cr.cartes[0].d <= cr.venS[1] + 2 && texteLisible(cr.cartes[0]) && dans(cr.cartes[1], cr.lunS) && texteLisible(cr.cartes[1]),
      'tâche du jeudi au mardi d\'après : une carte jusqu\'au vendredi, une le lundi d\'après avec son texte (' + JSON.stringify(cr) + ')');
    const is = await cartes(page, 'Isolation combles');
    verifier(is && is.cartes.length === 1 && dans(is.cartes[0], is.lunS) && is.cartes[0].d <= is.visD + 1 && texteLisible(is.cartes[0]),
      'tâche du lundi au mercredi d\'après : carte et texte sur le lundi, dans l\'écran (' + JSON.stringify(is) + ')');
    const ja = await cartes(page, 'Livraison grue');
    verifier(ja && ja.cartes.length === 2 && dans(ja.cartes[0], ja.ven) && texteLisible(ja.cartes[0]) && Math.abs(ja.cartes[1].g - ja.lun[0]) <= 2 && texteLisible(ja.cartes[1]),
      'jalon du jeudi d\'avant au lundi : une carte le vendredi, une le lundi (' + JSON.stringify(ja) + ')');
    // Clic sur la carte du vendredi : c'est bien la bulle.
    const touche = await page.evaluate((id) => {
      const b = document.querySelector('.grille .bulle[data-id="' + id + '"]'), c = b.querySelector('.b-carte-voisin').getBoundingClientRect();
      const e = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return !!e && e.closest('.bulle') === b;
    }, ma.id);
    verifier(touche, 'la carte du vendredi appartient à la bulle (clic, glisser, sélection)');
    // Hauteur : les cartes d'une bulle en morceaux ont la même hauteur.
    const hauteurs = await page.evaluate((id) => [...document.querySelector('.grille .bulle[data-id="' + id + '"]').querySelectorAll(':scope > .b-carte')].map((c) => Math.round(c.getBoundingClientRect().height)), ma.id);
    verifier(hauteurs.length === 2 && hauteurs[0] === hauteurs[1] && hauteurs[0] > 20, 'morceaux de même hauteur (' + hauteurs.join(', ') + ')');

    // --- 5. Aperçu d'une poignée : cartes recoupées ---
    const apres = await page.evaluate((id) => {
      const b = document.querySelector('.grille .bulle[data-id="' + id + '"]');
      const gc = b.style.gridColumn, m = /^(\d+) \/ span (\d+)$/.exec(gc);
      b.style.gridColumn = m[1] + ' / span ' + (+m[2] - 2); // sans le mardi : vendredi et lundi seulement
      reajusterBullesJourMobile();
      const r = [...b.querySelectorAll(':scope > .b-carte')].map((c) => Math.round(c.getBoundingClientRect().width));
      b.style.gridColumn = gc; reajusterBullesJourMobile();
      return { r, apres: b.querySelectorAll(':scope > .b-carte').length };
    }, ma.id);
    verifier(apres.r.length === 2 && apres.r[1] < 200 && apres.apres === 2, 'aperçu d\'une poignée : cartes recoupées aussitôt (' + JSON.stringify(apres) + ')');

    // --- 2. Le bouton ne change que la vue de la session ---
    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    v = await vue(page);
    const morceaux2 = await page.evaluate(() => document.querySelectorAll('.bulle-morceaux, .b-carte-voisin').length);
    verifier(v.mode === 'deux' && v.deux && !v.bords && JSON.stringify(v.compte) === '{"vueOrdi":"bords"}' && morceaux2 === 0,
      'clic : 2 semaines, rien d\'enregistré, cartes normales (' + JSON.stringify(v) + ', morceaux ' + morceaux2 + ')');
    await page.click('#btnModeVue'); await page.waitForTimeout(900);
    const morceaux1 = await page.evaluate(() => document.querySelectorAll('.bulle-morceaux, .b-carte-voisin').length);
    v = await vue(page);
    verifier(v.mode === 'semaine' && !v.bords && morceaux1 === 0, '1 semaine : cartes normales (' + JSON.stringify(v) + ')');

    // --- 1. Page Affichage ---
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(300);
    const choix = await page.evaluate(() => [...document.querySelectorAll('.choix-pastille[data-option="vueOrdi"]')].map((b) => b.dataset.valeur + '=' + b.textContent + (b.classList.contains('actif') ? '*' : '')).join(','));
    verifier(choix === '1=1 semaine,bords=Jours voisins*,2=2 semaines', '« À l\'ouverture » : 1 semaine, Jours voisins, 2 semaines (' + choix + ')');
    await page.click('.choix-pastille[data-option="vueOrdi"][data-valeur="2"]'); await page.waitForTimeout(800);
    v = await vue(page);
    verifier(v.compte.vueOrdi === '2' && v.mode === 'semaine', 'choisir « 2 semaines » : enregistré, la vue du moment ne change pas (' + JSON.stringify(v) + ')');
    await page.click('.choix-pastille[data-option="vueOrdi"][data-valeur="bords"]'); await page.waitForTimeout(800);
    v = await vue(page);
    verifier(v.compte.vueOrdi === 'bords', 'choisir « Jours voisins » : enregistré sur le compte (' + JSON.stringify(v.compte) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    // --- 3. Ancien réglage « bords » ---
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 760 }, bd: { reglages: [{ cle: 'affichage', valeur: { bords: 'oui', texte: 'petit' } }] } });
    await page.waitForTimeout(700);
    let v = await vue(page);
    verifier(v.mode === 'bords' && v.bords, 'ancien réglage « bords » : ouvre en jours voisins (' + JSON.stringify(v) + ')');
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(300);
    const actif = await page.evaluate(() => (document.querySelector('.choix-pastille[data-option="vueOrdi"].actif') || {}).textContent);
    await page.click('.choix-pastille[data-option="texte"][data-valeur="grand"]'); await page.waitForTimeout(800);
    v = await vue(page);
    verifier(actif === 'Jours voisins' && JSON.stringify(v.compte) === '{"texte":"grand","vueOrdi":"bords"}',
      'montré comme vue d\'ouverture, remplacé par elle au prochain enregistrement (' + actif + ', ' + JSON.stringify(v.compte) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 760 } });
    await page.waitForTimeout(600);
    const v = await vue(page);
    verifier(v.mode === 'semaine' && !v.bords && !v.deux, 'sans réglage : ouvre en 1 semaine (' + JSON.stringify(v) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }
  verifier(toutesErreurs.length === 0, 'aucune erreur console (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
