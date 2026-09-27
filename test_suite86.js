const { chromium } = require('playwright');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 86). Lionel : « Enlever le bouton "refuser"
// des annulations de congé. Pouvoir gérer les séries dans les demande de
// congé. » (js/demandes-absence.js, js/consultation.js, sql/0022)
// Vérifie :
//   1. bureau : une annulation n'a plus que Voir / Accepter ; une demande
//      simple garde Voir / Refuser / Accepter ;
//   2. bureau : demande en série — libellé « chaque semaine jusqu'au … »,
//      hachures sur chaque occurrence, Accepter pose une VRAIE série
//      (ligne `series`, serie_id sur chaque absence, gardé dans la
//      demande, « ↻ série » dans la grille) ;
//   3. bureau : annulation / modification d'une série acceptée → ses
//      absences à venir retirées (même déplacées), le passé et les autres
//      absences restent ; la modification pose la nouvelle absence ;
//   4. occurrences au mois : même quantième, ramené au dernier jour d'un
//      mois plus court ; week-ends sautés ;
//   5. base sans la migration 0022 : demandes relues sans les colonnes de
//      série ;
//   6. consultation : « Répéter » / « Jusqu'au » (proposé, contrôles),
//      envoi avec la règle — sans elle, rien de plus envoyé ; liste et
//      pointillés d'une série ; série commencée : Modifier repart de la
//      prochaine absence, « Annuler la série » ; serveur pas à jour.
//
// Lancer : node test_suite86.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const JETON = '0123456789abcdef0123456789abcdef';

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const D = (id, du, au, statut, type, extra) => Object.assign({ id, personne_id: 2, date_debut: du, date_fin: au, demi_debut: 'matin', demi_fin: 'aprem', motif: 'Congé', remarque: null,
    statut, type, remplace_id: null, cree_le: '2026-09-20T08:00:00Z' }, extra || {});
  const A = (id, date, demi, texte, extra) => Object.assign({ id, personne_id: 2, date, demi, ordre: 0, texte, chantier_id: null, statut_id: null, important: false, serie_id: null, est_absence: true }, extra || {});

  // --- 1, 2, 4. Bureau : boutons, série en attente, acceptation ----------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      taches: [A(1, '2026-10-05', 'matin', 'Congé')],
      demandes_absence: [
        D(40, '2026-09-28', '2026-09-28', 'en_attente', 'nouvelle', { demi_fin: 'matin', remarque: 'sport', serie_frequence: 'semaine', serie_intervalle: 1, serie_fin: '2026-10-19' }),
        D(41, '2026-10-05', '2026-10-05', 'acceptee', 'nouvelle'),
        D(42, '2026-10-05', '2026-10-05', 'en_attente', 'annulation', { remplace_id: 41 })
      ]
    } });
    await page.waitForTimeout(700);
    await page.click('#btnNotifications'); await page.waitForTimeout(400);
    const liste = await page.evaluate(() => [...document.querySelectorAll('.notif-demandes .da-liste li')].map((l) => l.dataset.id + ' · ' + l.querySelector('.da-quand').textContent + ' · ' +
      [...l.querySelectorAll('.da-boutons button')].map((b) => b.textContent).join('/')));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s86-bureau.png' });
    verifier(liste[0] === '40 · le lun. 28 sept. matin, chaque semaine jusqu’au lun. 19 oct. · Voir/Refuser/Accepter' && liste[1] === '42 · le lun. 5 oct. · Voir/Accepter',
      'notifications : série « chaque semaine jusqu’au … » avec Refuser ; annulation sans Refuser (' + liste.join(' | ') + ')');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await page.evaluate(() => allerAuJour('2026-10-05')); await page.waitForTimeout(900);
    const hach = await page.evaluate(() => {
      const q = demandesAbsence.find((x) => x.id === 40);
      const slots = slotsDemandeAbsence_(q).map((s) => s.date + ' ' + s.demi);
      const marquees = [...document.querySelectorAll('.cell.demande-absence[data-personne]')].map((c) => isoDeGi(+c.dataset.jour) + ' ' + c.dataset.demi);
      const attendues = slotsDemandeAbsence_(q).filter((s) => giDepuisIso(s.date) != null).map((s) => s.date + ' ' + s.demi);
      return { slots: slots.join(','), ok: attendues.indexOf('2026-10-05 matin') >= 0 && attendues.every((x) => marquees.indexOf(x) >= 0) && marquees.indexOf('2026-10-06 matin') < 0 };
    });
    verifier(hach.slots === '2026-09-28 matin,2026-10-05 matin,2026-10-12 matin,2026-10-19 matin' && hach.ok, 'série en attente : 4 lundis matin, hachurés dans la grille (' + JSON.stringify(hach) + ')');

    // 4. Occurrences au mois, week-ends sautés.
    const mois = await page.evaluate(() => {
      const q = { date_debut: '2026-12-31', date_fin: '2026-12-31', demi_debut: 'matin', demi_fin: 'aprem', serie_frequence: 'mois', serie_intervalle: 1, serie_fin: '2027-04-30' };
      const q2 = { date_debut: '2026-10-01', date_fin: '2026-10-01', demi_debut: 'matin', demi_fin: 'matin', serie_frequence: 'mois', serie_intervalle: 1, serie_fin: '2026-12-01' };
      return { occ: occurrencesDemandeAbsence_(q).map((o) => o.debut).join(','), slots: slotsDemandeAbsence_(q2).map((s) => s.date).join(',') };
    });
    verifier(mois.occ === '2026-12-31,2027-01-31,2027-02-28,2027-03-31,2027-04-30' && mois.slots === '2026-10-01,2026-12-01',
      'au mois : même quantième ou dernier jour du mois ; le dimanche 1er nov. sauté (' + JSON.stringify(mois) + ')');

    // 2. Accepter la série.
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    await page.click('.da-liste li[data-id="40"] .da-accepter'); await page.waitForTimeout(1500);
    const acc = await page.evaluate(() => {
      const s = __BD.series[0] || {};
      const abs = __BD.taches.filter((t) => t.est_absence && t.texte === 'Congé - sport');
      const d = __BD.demandes_absence.find((x) => x.id === 40);
      return { n: __BD.series.length, serie: [s.type, s.cible_personne_id, s.frequence, s.intervalle, s.fin_type, s.fin_valeur, s.date_debut, s.texte].join('|'),
        abs: abs.map((t) => t.date + ' ' + t.demi + ' ' + (t.serie_id === s.id)).join(','), dem: d.statut + ':' + (d.serie_id === s.id),
        toast: (document.querySelector('.toast') || {}).textContent };
    });
    verifier(acc.n === 1 && acc.serie === 'tache|2|semaine|1|date|2026-10-19|2026-09-28|Congé - sport' &&
      acc.abs === '2026-09-28 matin true,2026-10-05 matin true,2026-10-12 matin true,2026-10-19 matin true' && acc.dem === 'acceptee:true' && /acceptée/.test(acc.toast),
      'Accepter la série : ligne series, 4 absences avec son serie_id, gardé dans la demande (' + JSON.stringify(acc) + ')');
    await page.waitForTimeout(800);
    const icone = await page.evaluate(() => TACHES.filter((t) => t.serieId && t.texte === 'Congé - sport').length > 0 && !!document.querySelector('#racine .b-serie'));
    verifier(icone, 'dans la grille : absences de la série marquées « ↻ série »');
    // L'annulation n'a toujours que Voir / Accepter ; Accepter la retire.
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    const refus = await page.evaluate(() => !!document.querySelector('.da-liste li[data-id="42"] .da-refuser'));
    await page.click('.da-liste li[data-id="42"] .da-accepter'); await page.waitForTimeout(1200);
    const ann = await page.evaluate(() => ({ abs: __BD.taches.filter((t) => t.est_absence).map((t) => t.date + ' ' + t.texte).sort().join(','), dem: __BD.demandes_absence.filter((d) => d.id > 40).map((d) => d.id + ':' + d.statut).join(',') }));
    verifier(!refus && ann.abs.indexOf('2026-10-05 Congé,') < 0 && ann.dem === '41:annulee,42:acceptee', 'annulation : Accepter seulement, absence retirée (' + JSON.stringify(ann) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 3. Bureau : annulation et modification d'une série acceptée ------
  {
    const S = (id, date, serie, extra) => A(id, date, 'matin', 'Congé', Object.assign({ serie_id: serie }, extra || {}));
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      series: [{ id: 7, type: 'tache', frequence: 'semaine', intervalle: 1 }, { id: 8, type: 'tache', frequence: 'semaine', intervalle: 1 }],
      taches: [S(1, '2026-09-21', 7), S(2, '2026-09-28', 7), S(3, '2026-10-06', 7), S(4, '2026-10-12', 7),
        S(5, '2026-09-22', 8), S(6, '2026-09-29', 8), S(7, '2026-10-06', 8, { demi: 'aprem' }),
        A(8, '2026-10-05', 'matin', 'Congé', { personne_id: 1 })],
      demandes_absence: [
        D(50, '2026-09-21', '2026-09-21', 'acceptee', 'nouvelle', { demi_fin: 'matin', serie_frequence: 'semaine', serie_intervalle: 1, serie_fin: '2026-10-12', serie_id: 7 }),
        D(51, '2026-09-21', '2026-09-21', 'en_attente', 'annulation', { demi_fin: 'matin', remplace_id: 50, serie_frequence: 'semaine', serie_intervalle: 1, serie_fin: '2026-10-12' }),
        D(52, '2026-09-22', '2026-09-22', 'acceptee', 'nouvelle', { demi_fin: 'matin', serie_frequence: 'semaine', serie_intervalle: 1, serie_fin: '2026-10-06', serie_id: 8 }),
        D(53, '2026-10-02', '2026-10-02', 'en_attente', 'modification', { remplace_id: 52 })
      ]
    } });
    await page.waitForTimeout(700);
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    const quand = await page.evaluate(() => document.querySelector('.da-liste li[data-id="51"] .da-quand').textContent + ' | ' + [...document.querySelectorAll('.da-liste li[data-id="51"] button')].map((b) => b.textContent).join('/'));
    await page.click('.da-liste li[data-id="51"] .da-accepter'); await page.waitForTimeout(1200);
    const a = await page.evaluate(() => __BD.taches.filter((t) => t.serie_id === 7).map((t) => t.date).join(','));
    verifier(/chaque semaine jusqu’au lun\. 12 oct\./.test(quand) && /Voir\/Accepter$/.test(quand) && a === '2026-09-21',
      'annuler une série acceptée : ses absences à venir retirées (même déplacée au mardi), le passé reste (' + JSON.stringify([quand, a]) + ')');
    await page.click('.da-liste li[data-id="53"] .da-accepter'); await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({ s8: __BD.taches.filter((t) => t.serie_id === 8).map((t) => t.date).join(','),
      nouv: __BD.taches.filter((t) => t.date === '2026-10-02').map((t) => t.demi + ':' + (t.serie_id == null)).sort().join(','),
      autre: __BD.taches.filter((t) => t.personne_id === 1 && t.est_absence).length, dem: __BD.demandes_absence.map((d) => d.id + ':' + d.statut).join(',') }));
    verifier(m.s8 === '2026-09-22' && m.nouv === 'aprem:true,matin:true' && m.autre === 1 && m.dem === '50:annulee,51:acceptee,52:remplacee,53:acceptee',
      'modifier une série acceptée en absence simple : série à venir retirée, nouvelle absence posée, rien chez les autres (' + JSON.stringify(m) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 5. Base sans la migration 0022 -----------------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      demandes_absence: [D(60, '2026-09-28', '2026-09-28', 'en_attente', 'nouvelle')] } });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const from = sbClient.from.bind(sbClient);
      sbClient.from = function (t) {
        const q = from(t);
        if (t !== 'demandes_absence') return q;
        const select = q.select;
        q.select = function (c) { const r = select.apply(q, arguments); if (/serie_/.test(c || '')) { const then = r.then; r.then = (ok, ko) => Promise.resolve({ data: null, error: { message: 'column demandes_absence.serie_frequence does not exist' } }).then(ok, ko); } return r; };
        return q;
      };
      demandesAbsence = []; colonnesSerie_ = true;
      return chargerDemandesAbsence(true).then((l) => ({ n: l.length, repli: colonnesSerie_ === false }));
    });
    verifier(r.n === 1 && r.repli, 'sans la migration 0022 : demandes relues sans les colonnes de série (' + JSON.stringify(r) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 6. Page de consultation ------------------------------------------
  {
    const etat = {
      demandes: [
        { id: 1, debut: '2026-09-14', fin: '2026-09-14', demi_debut: 'matin', demi_fin: 'matin', motif: 'Congé', remarque: 'sport', statut: 'acceptee', type: 'nouvelle', supprimee: false,
          serie_frequence: 'semaine', serie_intervalle: 1, serie_fin: '2026-10-26' },
        { id: 2, debut: '2026-09-25', fin: '2026-09-25', demi_debut: 'aprem', demi_fin: 'aprem', motif: 'Congé', remarque: null, statut: 'en_attente', type: 'nouvelle',
          serie_frequence: 'semaine', serie_intervalle: 2, serie_fin: '2026-11-06' }
      ],
      appels: [], http404: false
    };
    const semaine = (lundi) => ({ personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi, aujourdhui: '2026-09-24', min: '2026-08-24', max: '2027-03-22',
      feries: [], horaires: [], taches: [], peut_demander: true, motifs: ['Congé', 'Vacances'], demandes: etat.demandes });
    const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    const dialogues = [];
    page.on('dialog', (d) => { dialogues.push(d.message()); d.dismiss(); });
    await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\//, (r) => {
      const nom = r.request().url().split('/rpc/')[1], c = JSON.parse(r.request().postData() || '{}');
      if (nom === 'consultation_planning') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(semaine(c.p_lundi || '2026-09-21')) });
      etat.appels.push({ nom, c });
      if (etat.http404) return r.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202"}' });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 99 }) });
    });
    await page.goto('file://' + path.join(__dirname, 'consultation.html') + '?j=' + JETON);
    await page.waitForTimeout(500);

    // Pointillés : vendredi 25 après-midi (série en attente toutes les 2 semaines).
    const pointilles = async () => page.evaluate(() => [...document.querySelectorAll('.jour')].filter((j) => j.querySelector('.tache.demande')).map((j) => j.dataset.date + ':' +
      [...j.querySelectorAll('.demi')].filter((x) => x.querySelector('.tache.demande')).map((x) => x.className.replace('demi demi-', '')).join('+')).join(','));
    const p1 = await pointilles();
    await page.click('#btnSuivante'); await page.waitForTimeout(400);
    const p2 = await pointilles();
    await page.click('#btnSuivante'); await page.waitForTimeout(400);
    const p3 = await pointilles();
    verifier(p1 === '2026-09-25:aprem' && p2 === '' && p3 === '2026-10-09:aprem', 'série en attente en pointillés sur chaque occurrence (' + JSON.stringify([p1, p2, p3]) + ')');
    await page.click('#btnAujourdhui'); await page.waitForTimeout(400);

    // Liste.
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    const liste = await page.evaluate(() => [...document.querySelectorAll('.demandes li')].map((l) => l.dataset.id + ' · ' + l.querySelector('.dq-texte span').textContent + ' · ' +
      [...l.querySelectorAll('.dq-actions button')].map((b) => b.textContent).join('/')));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s86-consultation-liste.png' });
    verifier(liste.join(' | ') === '1 · lun. 14 sept. matin, chaque semaine jusqu’au lun. 26 oct. · Modifier/Annuler la série | 2 · ven. 25 sept. après-midi, toutes les 2 semaines jusqu’au ven. 6 nov. · Modifier/Retirer',
      'liste : règle de répétition, série commencée encore modifiable / « Annuler la série » (' + liste.join(' | ') + ')');
    await page.click('.demandes li[data-id="1"] [data-action="annuler"]'); await page.waitForTimeout(200);
    verifier(/Annuler toute la série/.test(dialogues[dialogues.length - 1] || ''), 'Annuler la série : confirmation « toute la série » (' + dialogues[dialogues.length - 1] + ')');

    // Modifier une série commencée : repart de la prochaine absence.
    await page.click('.demandes li[data-id="1"] [data-action="modifier"]'); await page.waitForTimeout(300);
    const f = await page.evaluate(() => ({ debut: faDebut.value, fin: faFin.value, rep: faRepeter.value, jusq: faJusquau.value, vis: !document.getElementById('faLigneJusquau').hidden }));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s86-consultation-modifier.png' });
    verifier(f.debut === '2026-09-28' && f.fin === '2026-09-28' && f.rep === 'semaine:1' && f.jusq === '2026-10-26' && f.vis,
      'Modifier une série commencée : prochaine absence (lun. 28 sept.), même règle, même fin (' + JSON.stringify(f) + ')');
    await page.selectOption('#faRepeter', 'semaine:2'); await page.waitForTimeout(100);
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const env = etat.appels.filter((x) => x.nom === 'consultation_modifier_demande').pop();
    verifier(env && env.c.p_id === 1 && env.c.p_serie_frequence === 'semaine' && env.c.p_serie_intervalle === 2 && env.c.p_serie_fin === '2026-10-26',
      'modification envoyée avec la nouvelle règle (' + JSON.stringify(env && env.c) + ')');

    // Nouvelle demande : Répéter / Jusqu'au.
    await page.keyboard.press('Escape');
    await page.click('#btnDemanderAbsence'); await page.waitForTimeout(300);
    const n0 = await page.evaluate(() => ({ rep: faRepeter.value, cache: document.getElementById('faLigneJusquau').hidden,
      choix: [...faRepeter.options].map((o) => o.textContent).join('/') }));
    verifier(n0.rep === '' && n0.cache && n0.choix === 'Non/Chaque semaine/Toutes les 2 semaines/Toutes les 3 semaines/Toutes les 4 semaines/Chaque mois/Tous les 2 mois/Tous les 3 mois',
      'formulaire : « Répéter » (Non par défaut), « Jusqu’au » caché (' + JSON.stringify(n0) + ')');
    await page.fill('#faDebut', '2026-10-02'); await page.dispatchEvent('#faDebut', 'change');
    await page.fill('#faFin', '2026-10-02');
    await page.selectOption('#faRepeter', 'semaine:2'); await page.waitForTimeout(100);
    const n1 = await page.evaluate(() => ({ jusq: faJusquau.value, min: faJusquau.min, max: faJusquau.max, vis: !document.getElementById('faLigneJusquau').hidden }));
    verifier(n1.vis && n1.jusq === '2026-11-13' && n1.min === '2026-10-16' && n1.max === '2027-09-24', 'toutes les 2 semaines : « Jusqu’au » proposé (4 absences), bornes (' + JSON.stringify(n1) + ')');
    // Contrôles sur place.
    const avant = etat.appels.length;
    await page.fill('#faJusquau', '2026-10-09');
    await page.click('#faEnvoyer'); await page.waitForTimeout(200);
    const e1 = await page.evaluate(() => faErreur.hidden ? '' : faErreur.textContent);
    await page.fill('#faJusquau', '2026-11-13'); await page.fill('#faFin', '2026-10-16');
    await page.click('#faEnvoyer'); await page.waitForTimeout(200);
    const e2 = await page.evaluate(() => faErreur.hidden ? '' : faErreur.textContent);
    verifier(/au moins deux absences/.test(e1) && /finir avant la suivante/.test(e2) && etat.appels.length === avant, 'contrôles : fin trop tôt, absence plus longue que le pas — rien envoyé (' + JSON.stringify([e1, e2]) + ')');
    // Serveur pas à jour (sql/0022 absente).
    await page.fill('#faFin', '2026-10-02');
    etat.http404 = true;
    await page.click('#faEnvoyer'); await page.waitForTimeout(400);
    const e3 = await page.evaluate(() => faErreur.hidden ? '' : faErreur.textContent);
    verifier(/pas encore possible/.test(e3), 'serveur sans la migration : message clair (' + e3 + ')');
    etat.http404 = false;
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const env2 = etat.appels.filter((x) => x.nom === 'consultation_demander_absence').pop();
    verifier(env2 && env2.c.p_debut === '2026-10-02' && env2.c.p_serie_frequence === 'semaine' && env2.c.p_serie_intervalle === 2 && env2.c.p_serie_fin === '2026-11-13',
      'demande en série envoyée (' + JSON.stringify(env2 && env2.c) + ')');
    // Sans répétition : rien de plus envoyé (serveur d'avant compatible).
    await page.click('#btnDemanderAbsence'); await page.waitForTimeout(300);
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const env3 = etat.appels.filter((x) => x.nom === 'consultation_demander_absence').pop();
    verifier(env3 && env3 !== env2 && !Object.keys(env3.c).some((k) => /serie/.test(k)), 'demande simple : aucun paramètre de série (' + JSON.stringify(env3 && env3.c) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
