const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, glisserDoigt, lancerNavigateur } = require('./aide_tests');

// Round du 28.09.2026 (suite 89). Lionel :
//   « une tâche mise sur mon téléphone met bcp de temps à apparaître sur mon
//     ordinateur. une tâche ne veut pas prendre "aucun chantier" après
//     enregistrement […] La séparation personnel doit rester sous la note
//     tant qu'une partie du personnel est visible à l'écran. Elle se fera
//     pousser hors de l'écran par la séparation intervenants. […] La page
//     de setup affichage doit être enregistrée par l'appareil. […] Bug en
//     vue jours voisins sur tablette. »
// Vérifie :
//   1. fiche d'une tâche existante : « Aucun chantier » choisi puis
//      enregistré — la tâche et la base n'ont plus de chantier ;
//   2. temps réel : abonnement aux tables taches / jalons / notes ; une
//      tâche écrite par un autre appareil apparaît d'elle-même ; l'écho de
//      nos propres écritures est ignoré ; fiche ouverte : relecture remise
//      à sa fermeture ; hors de la semaine affichée : rien n'est relu ;
//   3. réglages d'affichage : enregistrés sur l'appareil (localStorage),
//      plus rien dans la table reglages ; ceux du compte repris une fois ;
//   4. séparations collantes : « Personnel » reste sous l'en-tête figé tant
//      que du personnel est à l'écran, « Intervenants » la pousse puis
//      prend sa place ; les cases ne bougent pas ;
//   5. tablette, jours voisins : défilement horizontal coupé (plus de
//      tremblement), balayage au centre = semaine suivante.
// (Glissement de semaine limité aux dates : test_suite72.js et
// test_suite74.js ; balayage par les bords : test_swipe_tablette_1semaine.js.)
//
// Lancer : node test_suite89.js

const PERS = [];
for (let i = 1; i <= 14; i++) PERS.push({ id: i, nom: 'Personne ' + i, sous_traitant: false, ordre: i, actif: true });
for (let i = 15; i <= 22; i++) PERS.push({ id: i, nom: 'Interv. ' + i, sous_traitant: true, ordre: i, actif: true });
const CHANTIERS = [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }];
const TACHES = [{ id: 1, personne_id: 1, date: '2026-09-22', demi: 'matin', ordre: 0, texte: 'Coffrage', chantier_id: 1 }];
const BD = () => ({ personnes: PERS, chantiers: CHANTIERS, taches: TACHES.map((t) => Object.assign({}, t)) });
const bulle = (page, texte) => page.evaluate((t) => [...document.querySelectorAll('#racine .bulle')].some((b) => b.textContent.includes(t)), texte);
const envoyer = (page, row, type) => page.evaluate(([r, ty]) => {
  if (ty !== 'DELETE') window.__BD.taches.push(r); else window.__BD.taches = window.__BD.taches.filter((x) => x.id !== r.id);
  (window.__TEMPS_REEL || []).filter((h) => h.filtre.table === 'taches').forEach((h) => h.cb(ty === 'DELETE' ? { eventType: ty, table: 'taches', new: {}, old: { id: r.id } } : { eventType: ty, table: 'taches', new: r, old: {} }));
}, [row, type || 'INSERT']);
const lectures = (page) => page.evaluate(() => window.__ECRITURES.filter((e) => e === 'taches:select').length);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. « Aucun chantier » à la modification --------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(400);
    const avant = await page.evaluate(() => {
      ouvrirEdition(null, TACHES.find((t) => t.texte === 'Coffrage'), null, 300, 300);
      const s = document.querySelector('.form-pop .f-chantier');
      const v = s.value;
      s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true }));
      return v;
    });
    await page.click('.form-pop .f-ok'); await page.waitForTimeout(1500);
    const apres = await page.evaluate(() => {
      const t = TACHES.find((x) => x.texte === 'Coffrage');
      return { vue: t ? t.chantier || null : 'absente', bd: window.__BD.taches.filter((r) => r.texte === 'Coffrage').map((r) => r.chantier_id) };
    });
    verifier(avant === '26182 - Terrain de Padel' && apres.vue === null && apres.bd.length === 1 && apres.bd[0] === null,
      'tâche existante passée à « Aucun chantier » : enregistrée sans chantier (' + JSON.stringify({ avant, apres }) + ')');
    const rouverte = await page.evaluate(() => {
      ouvrirEdition(null, TACHES.find((t) => t.texte === 'Coffrage'), null, 300, 300);
      const v = document.querySelector('.form-pop .f-chantier').value;
      if (popFermerActuel) popFermerActuel();
      return v;
    });
    verifier(rouverte === '', 'fiche rouverte : « Aucun chantier » toujours choisi (« ' + rouverte + ' »)');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 2. Temps réel ------------------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(400);
    const abonnements = await page.evaluate(() => (window.__TEMPS_REEL || []).map((h) => h.filtre.event + ' ' + h.filtre.table).sort().join(', '));
    verifier(abonnements === '* jalons, * notes, * taches', 'abonné aux changements de taches, jalons et notes (' + abonnements + ')');

    await envoyer(page, { id: 5001, personne_id: 2, date: '2026-09-23', demi: 'matin', ordre: 0, texte: 'Du téléphone', chantier_id: 1 });
    await page.waitForTimeout(1200);
    verifier(await bulle(page, 'Du téléphone'), 'tâche ajoutée par un autre appareil : affichée d\'elle-même, sans rien toucher');
    await envoyer(page, { id: 5001 }, 'DELETE');
    await page.waitForTimeout(1200);
    verifier(!await bulle(page, 'Du téléphone'), 'tâche supprimée ailleurs (seul l\'id est transmis) : retirée');

    // Écho de nos propres écritures : ignoré dans les 3 s qui suivent une synchro.
    await page.evaluate(() => { finSyncLocaleTs_ = Date.now(); });
    const l0 = await lectures(page);
    await envoyer(page, { id: 5002, personne_id: 2, date: '2026-09-24', demi: 'matin', ordre: 0, texte: 'Écho', chantier_id: 1 });
    await page.waitForTimeout(1200);
    verifier(await lectures(page) === l0 && !await bulle(page, 'Écho'), 'juste après notre propre synchro : message ignoré, rien relu');

    // Fiche ouverte : la relecture attend sa fermeture.
    await page.evaluate(() => { finSyncLocaleTs_ = 0; ouvrirEdition(null, TACHES.find((t) => t.texte === 'Coffrage'), null, 300, 300); });
    await envoyer(page, { id: 5003, personne_id: 3, date: '2026-09-25', demi: 'aprem', ordre: 0, texte: 'Pendant la fiche', chantier_id: 1 });
    await page.waitForTimeout(1200);
    const pendant = await bulle(page, 'Pendant la fiche');
    await page.evaluate(() => popFermerActuel && popFermerActuel());
    await page.waitForTimeout(2800);
    verifier(!pendant && await bulle(page, 'Pendant la fiche'), 'fiche ouverte : grille pas relue sous la fiche, puis relue après sa fermeture');

    // Hors de la semaine affichée : rien n'est relu tout de suite.
    const l1 = await lectures(page);
    await envoyer(page, { id: 5004, personne_id: 2, date: '2026-10-14', demi: 'matin', ordre: 0, texte: 'Plus tard', chantier_id: 1 });
    await page.waitForTimeout(1200);
    verifier(await lectures(page) === l1, 'tâche d\'une autre semaine : la semaine affichée n\'est pas relue');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 3. Réglages d'affichage sur l'appareil -----------------------------------
  {
    const bd = Object.assign(BD(), { reglages: [{ cle: 'affichage', valeur: { weekends: 'oui' } }] });
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd });
    await page.waitForTimeout(400);
    const repris = await page.evaluate(() => JSON.parse(localStorage.getItem('planning.affichage') || 'null'));
    verifier(repris && repris.weekends === 'oui', 'réglages du compte repris une fois sur l\'appareil (' + JSON.stringify(repris) + ')');
    await page.evaluate(() => changerOptionAffichage('weekends', 'non'));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ local: JSON.parse(localStorage.getItem('planning.affichage') || 'null'), ecrit: window.__ECRITURES.filter((e) => /^reglages:(upsert|insert|update)/.test(e)), compte: window.__BD.reglages }));
    verifier(r.local && r.local.weekends !== 'oui' && r.ecrit.length === 0 && r.compte[0].valeur.weekends === 'oui',
      'week-ends masqués : enregistré sur l\'appareil, table reglages intacte (' + JSON.stringify(r) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 4. Séparations collantes -------------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 700 }, bd: BD() });
    await page.waitForTimeout(500);
    const mesure = () => page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const cell = document.querySelector('#racine .cell[data-kind="personne"][data-personne="1"]');
      return {
        entete: Math.round(r('#racine .entete-planning-figee').bottom),
        pTop: Math.round(r('.section-row-personnel').top), pBas: Math.round(r('.section-row-personnel').bottom),
        iTop: Math.round(r('.section-row-intervenants').top),
        pColle: document.querySelector('.section-row-personnel').classList.contains('section-collee'),
        iColle: document.querySelector('.section-row-intervenants').classList.contains('section-collee'),
        cellTransform: getComputedStyle(cell).transform
      };
    });
    const defiler = async (y) => { await page.evaluate((v) => { document.getElementById('app').scrollTop = v; }, y); await page.waitForTimeout(120); };
    const m0 = await mesure();
    verifier(m0.pTop >= m0.entete && !m0.pColle, 'en haut : « Personnel » à sa place (' + JSON.stringify(m0) + ')');
    // Un peu plus bas : « Personnel » arrive sous l'en-tête et y reste.
    const pos = await page.evaluate(() => {
      const app = document.getElementById('app'), e = document.querySelector('#racine .entete-planning-figee').getBoundingClientRect();
      const p = document.querySelector('.section-row-personnel').getBoundingClientRect(), i = document.querySelector('.section-row-intervenants').getBoundingClientRect();
      return { st: app.scrollTop, versP: p.top - e.bottom, versI: i.top - e.bottom, h: p.height };
    });
    await defiler(pos.st + pos.versP + 150);
    const m1 = await mesure();
    verifier(m1.pColle && Math.abs(m1.pTop - m1.entete) <= 1 && m1.cellTransform === 'none',
      'du personnel à l\'écran : « Personnel » reste collée sous Jalons/Notes, les cases ne bougent pas (' + JSON.stringify(m1) + ')');
    // « Intervenants » arrive : elle pousse « Personnel ».
    await defiler(pos.st + pos.versI - pos.h / 2);
    const m2 = await mesure();
    verifier(Math.abs(m2.pBas - m2.iTop) <= 1 && m2.pTop < m2.entete && !m2.iColle,
      '« Intervenants » pousse « Personnel » hors de l\'écran (' + JSON.stringify(m2) + ')');
    await defiler(pos.st + pos.versI + 120);
    const m3 = await mesure();
    verifier(m3.iColle && Math.abs(m3.iTop - m3.entete) <= 1 && m3.pBas <= m3.iTop + 1,
      'plus bas : « Intervenants » collée sous l\'en-tête à son tour (' + JSON.stringify(m3) + ')');
    await defiler(0);
    const m4 = await mesure();
    verifier(!m4.pColle && !m4.iColle && m4.pTop === m0.pTop, 'retour en haut : les 2 séparations à leur place (' + JSON.stringify(m4) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 5. Tablette, jours voisins -----------------------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1180, height: 820 }, hasTouch: true, bd: BD() });
    await page.waitForTimeout(400);
    await page.evaluate(() => { vueBords = true; assurerFenetreChargee(() => { construireVueDepuisCache(); render(false); }); });
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.scroller')); return { bords: document.getElementById('racine').classList.contains('vue-bords'), ox: c.overflowX, ta: c.touchAction, i: etat.indexSemaine }; });
    verifier(st.bords && st.ox === 'hidden' && st.ta === 'pan-y', 'jours voisins sur tablette : pas de défilement horizontal natif à contrer (' + JSON.stringify(st) + ')');
    await glisserDoigt(page, 700, 300, 400);
    await page.waitForTimeout(700);
    const i1 = await page.evaluate(() => etat.indexSemaine);
    verifier(i1 === st.i + 1, 'jours voisins : un balayage, même au centre, passe à la semaine suivante (' + st.i + ' → ' + i1 + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
