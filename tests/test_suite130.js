const { chromium } = require('playwright');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 30.09.2026 (suite 130). Lionel (page Améliorations et bugs, bug
// n° 2) : « Dans la vue ouvrier, une personne qui à une absence sur sa case
// verra son absence et la tâche attibuée à l'équipe. Comment faire pour que
// cet ouvrier ne vois que son absence. Comment gérer un absence partiel, un
// départ anticipé ou un début de travail plus tard. Fait moi plusieurs
// propositions » ; ses choix : « Masquer » et « Arrivée / départ à
// l'heure », puis « Ca deviendra le texte de la bulle ».
// (Le masquage de la tâche d'équipe est côté base, sql/0031 — vérifié sur
// le projet.) Vérifie :
//   1. absencePartielle (js/core.js) : une heure du matin / de
//      l'après-midi dans le texte ; « 8 hommes », « 80% », « 2026 » non ;
//   2. bureau : bulle d'absence partielle rayée (.absence-partielle), pas
//      les autres ;
//   3. bureau : « Arrivée / départ » dans le menu d'ajout (pas pour
//      une équipe) ; Arrivée plus tard, Départ plus tôt, Quelques heures
//      → texte « Arrivée 9h30 - Médecin »… et demi-journées données par
//      l'heure, sur chaque jour sélectionné ; heures à l'envers refusées ;
//   4. page de l'ouvrier : absence partielle en pointillé ; demande
//      « Arrivée plus tard » / « Départ plus tôt » / « Absent quelques
//      heures » envoyée avec l'heure en tête du type et les bonnes
//      demi-journées ; « Modifier » d'une demande ou d'une absence du bureau
//      partielle pré-rempli ; rien ne déborde sur téléphone.
//
// Lancer : node test_suite130.js

const JETON = '0123456789abcdef0123456789abcdef';

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

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1, 2, 3. Bureau ---------------------------------------------------
  {
    const A = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: null, statut_id: null, important: false, serie_id: null, est_absence: true });
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true },
        { id: 10, nom: 'Équipe A', sous_traitant: false, ordre: 3, actif: true, equipe: true }],
      taches: [A(1, 2, '2026-09-22', 'aprem', 'Départ 16h15'), A(2, 2, '2026-09-23', 'matin', 'Congé'), A(3, 2, '2026-09-25', 'aprem', 'Formation 8 hommes')]
    } });
    await page.waitForTimeout(600);

    const cas = await page.evaluate(() => [
      ['Départ 16h15', 'aprem'], ['Départ 16h15', 'matin'], ['Arrivée 9h30 - Congé', 'matin'], ['Arrivée 9H', 'matin'], ['Absent 11h00 - 14h00', 'matin'], ['Absent 11h00 - 14h00', 'aprem'],
      ['Rdv médical 13h00 - 14h00', 'matin'], ['Formation 8 hommes', 'matin'], ['80%', 'matin'], ['Vacances 2026', 'aprem'], ['Maladie 3 jours', 'matin'], ['Congé', 'aprem']
    ].map(([t, d]) => absencePartielle(t, d) ? 1 : 0).join(''));
    verifier(cas === '101111000000', 'absencePartielle : l’heure de la demi-journée, pas « 8 hommes », « 80% », « 2026 », « 3 jours » (' + cas + ')');

    const bulles = await page.evaluate(() => TACHES.filter((t) => t.type === 'absence').map((t) => t.texte + ':' +
      (document.querySelector('#racine .bulle[data-id="' + t.id + '"]').classList.contains('absence-partielle') ? 1 : 0)).sort().join(','));
    const raye = await page.evaluate(() => getComputedStyle(document.querySelector('#racine .bulle.absence-partielle > .b-carte')).backgroundImage);
    verifier(bulles === 'Congé:0,Départ 16h15:1,Formation 8 hommes:0' && /repeating-linear-gradient/.test(raye),
      'bulle d’absence partielle rayée, pas les autres (' + bulles + ')');

    await page.evaluate(() => changerModeAjoutPlanning(true));
    await page.waitForTimeout(150);
    const menu = async (pid, iso, demi) => { const p = await point(page, pid, iso, demi); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250);
      return page.evaluate(() => { const m = document.querySelector('.menu-pop'); return m ? [...m.querySelectorAll('button')].map((b) => b.textContent.trim()) : []; }); };
    const lignes = (re) => page.evaluate((s) => __BD.taches.filter((t) => new RegExp(s).test(t.texte)).map((t) => t.personne_id + ':' + t.date + ':' + t.demi + ':' + t.texte + ':' + (t.est_absence ? 'abs' : 'tache'))
      .sort().join(','), re);

    const bEquipe = await menu('10', '2026-09-24', 'matin');
    await page.keyboard.press('Escape'); await page.mouse.click(5, 890); await page.waitForTimeout(150);
    const b = await menu('1', '2026-09-25', 'matin');
    verifier(b.includes('Arrivée / départ') && b.indexOf('Arrivée / départ') === b.indexOf('Absence') + 1 && !bEquipe.includes('Arrivée / départ'),
      'menu d’ajout : « Arrivée / départ » après « Absence », pas pour une équipe (' + JSON.stringify([b, bEquipe]) + ')');
    await page.click('.menu-pop button[data-partielle]');
    await page.waitForTimeout(200);
    const f = await page.evaluate(() => { const p = document.querySelector('.form-arrivee-depart'); return { titre: p.querySelector('.cp-titre').textContent,
      h1: p.querySelector('.f-h1').value, h2Cache: p.querySelector('.ad-h2').hidden, apercu: p.querySelector('.apercu-texte').textContent }; });
    verifier(f.titre === 'Ajouter — Arrivée / départ' && f.h1 === '09:00' && f.h2Cache && f.apercu === 'Arrivée 9h00',
      'formulaire : « Arrivée plus tard » à 9h00 d’office, aperçu du texte (' + JSON.stringify(f) + ')');
    await page.fill('.form-arrivee-depart .f-h1', '09:30');
    await page.fill('.form-arrivee-depart .f-motif', 'Médecin');
    const ap1 = await page.evaluate(() => document.querySelector('.form-arrivee-depart .apercu-texte').textContent);
    await page.click('.form-arrivee-depart .f-ok');
    await page.waitForTimeout(700);
    const l1 = await lignes('^Arrivée');
    verifier(ap1 === 'Arrivée 9h30 - Médecin' && l1 === '1:2026-09-25:matin:Arrivée 9h30 - Médecin:abs',
      'Arrivée plus tard 9h30 : absence « Arrivée 9h30 - Médecin » le matin seulement (' + ap1 + ' ; ' + l1 + ')');

    // Départ plus tôt, avec un motif (suite 132 : plus de type d'absence).
    await menu('1', '2026-09-24', 'matin');
    await page.click('.menu-pop button[data-partielle]');
    await page.waitForTimeout(200);
    await page.click('.form-arrivee-depart [data-sorte="depart"]');
    const f2 = await page.evaluate(() => ({ h1: document.querySelector('.form-arrivee-depart .f-h1').value, lib: document.querySelector('.form-arrivee-depart .ad-label-h1').textContent,
      type: !!document.querySelector('.form-arrivee-depart .f-type') }));
    await page.fill('.form-arrivee-depart .f-h1', '16:15');
    await page.fill('.form-arrivee-depart .f-motif', 'Dentiste');
    await page.click('.form-arrivee-depart .f-ok');
    await page.waitForTimeout(700);
    const l2 = await lignes('^Départ');
    verifier(f2.h1 === '16:00' && f2.lib === 'Départ à' && !f2.type && l2 === '1:2026-09-24:aprem:Départ 16h15 - Dentiste:abs,2:2026-09-22:aprem:Départ 16h15:abs',
      'Départ plus tôt 16h15 + motif, sans type : l’après-midi seulement (' + JSON.stringify(f2) + ' ; ' + l2 + ')');

    // Quelques heures, sur 2 jours sélectionnés.
    const de = await point(page, '1', '2026-09-21', 'aprem'), vers = await point(page, '1', '2026-09-22', 'matin');
    await page.mouse.move(de.x, de.y); await page.mouse.down();
    await page.mouse.move((de.x + vers.x) / 2, de.y, { steps: 5 }); await page.mouse.move(vers.x, vers.y, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(250);
    await page.click('.menu-pop button[data-partielle]');
    await page.waitForTimeout(200);
    await page.click('.form-arrivee-depart [data-sorte="heures"]');
    const f3 = await page.evaluate(() => ({ h2Cache: document.querySelector('.form-arrivee-depart .ad-h2').hidden, apercu: document.querySelector('.form-arrivee-depart .apercu-texte').textContent }));
    await page.fill('.form-arrivee-depart .f-h1', '14:00'); await page.fill('.form-arrivee-depart .f-h2', '11:00');
    await page.click('.form-arrivee-depart .f-ok');
    await page.waitForTimeout(300);
    const refus = await page.evaluate(() => ({ ouvert: !!document.querySelector('.form-arrivee-depart'), toast: (document.querySelector('.toast') || {}).textContent || '' }));
    await page.fill('.form-arrivee-depart .f-h1', '11:00'); await page.fill('.form-arrivee-depart .f-h2', '14:00');
    await page.click('.form-arrivee-depart .f-ok');
    await page.waitForTimeout(800);
    const l3 = await lignes('^Absent');
    verifier(!f3.h2Cache && f3.apercu === 'Absent 13h00 - 14h00' && refus.ouvert && /heure de fin/.test(refus.toast) &&
      l3 === '1:2026-09-21:aprem:Absent 11h00 - 14h00:abs,1:2026-09-21:matin:Absent 11h00 - 14h00:abs,1:2026-09-22:aprem:Absent 11h00 - 14h00:abs,1:2026-09-22:matin:Absent 11h00 - 14h00:abs',
      'Quelques heures 11h00 - 14h00 sur 2 jours : chaque jour, matin + après-midi ; heures à l’envers refusées (' + JSON.stringify([f3, refus]) + ' ; ' + l3 + ')');
    const nouvelles = await page.evaluate(() => TACHES.filter((t) => /^(Arrivée|Départ 16h15 -|Absent)/.test(t.texte)).map((t) => t.duree + ':' +
      (document.querySelector('#racine .bulle[data-id="' + t.id + '"]').classList.contains('absence-partielle') ? 1 : 0)).join(','));
    verifier(nouvelles === '2:1,1:1,1:1', 'nouvelles bulles rayées ; les 2 jours « Absent 11h00 - 14h00 » qui se suivent réunis, comme toute bulle (' + nouvelles + ')');
    await page.evaluate(() => changerModeAjoutPlanning(false));
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 4. Page de l'ouvrier ----------------------------------------------
  {
    const T = (date, demi, texte, extra) => Object.assign({ date, demi, ordre: 0, texte, important: false, absence: false, partielle: false, chantier: null, couleur: null, statut: null, couleur_statut: null, equipe: null }, extra || {});
    const taches = [T('2026-09-22', 'aprem', 'Départ 16h15', { absence: true, partielle: true }), T('2026-09-22', 'aprem', 'Coffrage', { chantier: 'Padel', couleur: '#f7d9a8', equipe: 'Équipe A' }),
      T('2026-09-23', 'matin', 'Congé', { absence: true })];
    const enAttente = { id: 3, debut: '2026-10-01', fin: '2026-10-01', demi_debut: 'aprem', demi_fin: 'aprem', motif: 'Départ 15h30 - Congé', remarque: 'dentiste', statut: 'en_attente', type: 'nouvelle', supprimee: false };
    const absences = [{ date: '2026-10-02', demi: 'matin', texte: 'Arrivée 10h00 - Vacances - train', serie: false }];
    const appels = [];
    const semaine = (lundi) => ({ personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi, aujourdhui: '2026-09-21', min: '2026-08-24', max: '2027-03-22',
      feries: [], horaires: [], taches: lundi === '2026-09-21' ? taches : [], peut_demander: true, motifs: ['Congé', 'Vacances'], demandes: [enAttente], absences });
    const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.clock.setFixedTime(new Date('2026-09-21T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\//, (r) => {
      const nom = r.request().url().split('/rpc/')[1], c = JSON.parse(r.request().postData() || '{}');
      if (nom === 'consultation_planning') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(semaine(c.p_lundi || '2026-09-21')) });
      appels.push({ nom, c });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 99 }) });
    });
    await page.goto('file://' + path.join(__dirname, '..', 'consultation.html') + '?j=' + JETON);
    await page.waitForTimeout(500);

    const cartes = await page.evaluate(() => [...document.querySelectorAll('.tache')].map((t) => t.className + ':' + t.querySelector('.texte').textContent));
    const pointille = await page.evaluate(() => getComputedStyle(document.querySelector('.tache.absence.partielle')).borderTopStyle);
    verifier(cartes.join(' | ') === 'tache absence partielle:Départ 16h15 | tache:Coffrage | tache absence:Congé' && pointille === 'dashed',
      'ouvrier : absence partielle en pointillé, la tâche de l’équipe en dessous (' + cartes.join(' | ') + ')');

    const envoyer = async (sorte, date, h1, h2, type, motif) => {
      await page.click('#btnDemanderAbsence'); await page.waitForTimeout(300);
      await page.selectOption('#faSorte', sorte);
      const vue = await page.evaluate(() => ({ fin: faLigneFin.hidden, demi: faDemiDebut.hidden, heures: faLigneHeures.hidden, h2: faLigneH2.hidden, le: faLibelleDebut.textContent, h1: faH1.value,
        deborde: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
      await page.fill('#faDebut', date); await page.dispatchEvent('#faDebut', 'change');
      await page.fill('#faH1', h1);
      if (h2) await page.fill('#faH2', h2);
      await page.selectOption('#faMotif', type);
      await page.fill('#faRemarque', motif);
      await page.click('#faEnvoyer'); await page.waitForTimeout(400);
      const erreur = await page.evaluate(() => { const e = document.getElementById('faErreur'); return e && !e.hidden ? e.textContent : ''; });
      return { vue, erreur, c: (appels[appels.length - 1] || {}).c || {} };
    };
    const r1 = await envoyer('arrivee', '2026-09-28', '09:30', null, 'Congé', 'Médecin');
    verifier(r1.vue.fin && r1.vue.demi && !r1.vue.heures && r1.vue.h2 && r1.vue.le === 'Le' && r1.vue.h1 === '09:00' && !r1.vue.deborde &&
      r1.c.p_debut === '2026-09-28' && r1.c.p_fin === '2026-09-28' && r1.c.p_demi_debut === 'matin' && r1.c.p_demi_fin === 'matin' && r1.c.p_motif === 'Arrivée 9h30 - Congé' && r1.c.p_remarque === 'Médecin',
      'Arrivée plus tard : « Le » jour + heure, sans « Au » ni matin / après-midi ; envoyée « Arrivée 9h30 - Congé », le matin (' + JSON.stringify(r1) + ')');
    const r2 = await envoyer('depart', '2026-09-29', '11:15', null, 'Vacances', '');
    verifier(r2.c.p_demi_debut === 'matin' && r2.c.p_demi_fin === 'aprem' && r2.c.p_motif === 'Départ 11h15 - Vacances' && r2.c.p_fin === '2026-09-29',
      'Départ plus tôt 11h15 : du matin à l’après-midi (' + JSON.stringify(r2.c) + ')');
    const n = appels.length;
    const r3a = await envoyer('heures', '2026-09-30', '14:00', '13:00', 'Congé', '');
    await page.fill('#faH1', '13:00'); await page.fill('#faH2', '14:00');
    await page.click('#faEnvoyer'); await page.waitForTimeout(400);
    const r3 = appels[appels.length - 1].c;
    verifier(!r3a.vue.h2 && /heure de fin/.test(r3a.erreur) && appels.length === n + 1 && r3.p_demi_debut === 'aprem' && r3.p_demi_fin === 'aprem' && r3.p_motif === 'Absent 13h00 - 14h00 - Congé',
      'Absent quelques heures : heures à l’envers refusées, puis « Absent 13h00 - 14h00 - Congé » l’après-midi (' + JSON.stringify([r3a.erreur, r3]) + ')');

    // Modifier une demande partielle en attente.
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('.demandes li[data-id="3"] [data-action="modifier"]').click()); await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ sorte: faSorte.value, h1: faH1.value, motif: faMotif.value, rem: faRemarque.value, debut: faDebut.value, fin: faLigneFin.hidden }));
    await page.click('#faEnvoyer'); await page.waitForTimeout(400);
    const cm = appels[appels.length - 1];
    verifier(m.sorte === 'depart' && m.h1 === '15:30' && m.motif === 'Congé' && m.rem === 'dentiste' && m.debut === '2026-10-01' && m.fin &&
      cm.nom === 'consultation_modifier_demande' && cm.c.p_id === 3 && cm.c.p_motif === 'Départ 15h30 - Congé' && cm.c.p_demi_debut === 'aprem',
      'Modifier une demande « Départ 15h30 - Congé » : pré-remplie, renvoyée telle quelle (' + JSON.stringify([m, cm.c]) + ')');

    // Modifier une absence partielle posée par le bureau.
    if (!(await page.evaluate(() => !!document.querySelector('#feuille:not([hidden]) .demandes')))) await page.click('#btnNotifications');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('.demandes li[data-id="b2026-10-02matin"] [data-action="modifier"]').click()); await page.waitForTimeout(300);
    const g = await page.evaluate(() => ({ sorte: faSorte.value, h1: faH1.value, motif: faMotif.value, rem: faRemarque.value }));
    await page.fill('#faH1', '10:30');
    await page.click('#faEnvoyer'); await page.waitForTimeout(400);
    const cg = appels[appels.length - 1];
    verifier(g.sorte === 'arrivee' && g.h1 === '10:00' && g.motif === 'Vacances' && g.rem === 'train' &&
      cg.nom === 'consultation_changer_absence_bureau' && cg.c.p_motif === 'Arrivée 10h30 - Vacances' && cg.c.p_remarque === 'train' && cg.c.p_cible_debut === '2026-10-02',
      'Modifier l’absence du bureau « Arrivée 10h00 - Vacances - train » : heure, type et motif relus (' + JSON.stringify([g, cg.c]) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exitCode = bilan();
})();
