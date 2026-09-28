const { chromium } = require('playwright');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 87). Lionel : « Previsualisations des congés
// dans le planning de la même couleur que les bulles congés. Un ouvrier
// doit pouvoir modifier une serie ou juste un des éléments. Les congés
// placés par le bureau doivent aussi apparaître dans la liste des congés
// de l'ouvrier. » (style.css, js/demandes-absence.js, js/consultation.js,
// sql/0023)
// Vérifie :
//   1. bureau : hachures d'une demande en attente à la couleur des bulles
//      d'absence (--absence-bg) ;
//   2. bureau : annuler / modifier UNE absence d'une série acceptée —
//      seule celle-là retirée, la nouvelle posée dans la même série, la
//      série reste acceptée ;
//   3. bureau : modifier / annuler une absence posée par le bureau (sans
//      demande) — seul le bloc visé retiré ;
//   4. consultation : absences du bureau listées (regroupées, week-end
//      sauté, pas dans la cloche), série « Sauf : … » ; « Annuler… » et
//      « Modifier » d'une série : « Quoi » (toute la série ou une
//      absence) ; absence du bureau : Modifier (type / motif relus) et
//      Annuler ; demande en attente sur un bloc du bureau : « Avant : … ».
//
// Lancer : node test_suite87.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const JETON = '0123456789abcdef0123456789abcdef';

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const D = (id, du, au, statut, type, extra) => Object.assign({ id, personne_id: 2, date_debut: du, date_fin: au, demi_debut: 'matin', demi_fin: 'aprem', motif: 'Congé', remarque: null,
    statut, type, remplace_id: null, cree_le: '2026-09-20T08:00:00Z' }, extra || {});
  const A = (id, date, demi, texte, extra) => Object.assign({ id, personne_id: 2, date, demi, ordre: 0, texte, chantier_id: null, statut_id: null, important: false, serie_id: null, est_absence: true }, extra || {});
  const C = (du, au, dd, df) => ({ cible_debut: du, cible_fin: au, cible_demi_debut: dd, cible_demi_fin: df });

  // --- 1, 2, 3. Bureau ---------------------------------------------------
  {
    const S = (id, date) => A(id, date, 'matin', 'Congé', { serie_id: 7 });
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      series: [{ id: 7, type: 'tache', frequence: 'semaine', intervalle: 1 }],
      taches: [S(1, '2026-09-28'), S(2, '2026-10-05'), S(3, '2026-10-12'), S(4, '2026-10-19'),
        A(10, '2026-10-07', 'matin', 'Vacances'), A(11, '2026-10-07', 'aprem', 'Vacances'), A(12, '2026-10-08', 'matin', 'Vacances'),
        A(13, '2026-10-09', 'matin', 'Vacances'), A(14, '2026-10-09', 'aprem', 'Vacances')],
      demandes_absence: [
        D(40, '2026-09-24', '2026-09-24', 'en_attente', 'nouvelle'),
        D(50, '2026-09-28', '2026-09-28', 'acceptee', 'nouvelle', { demi_fin: 'matin', serie_frequence: 'semaine', serie_intervalle: 1, serie_fin: '2026-10-19', serie_id: 7 }),
        D(51, '2026-10-05', '2026-10-05', 'en_attente', 'annulation', Object.assign({ demi_fin: 'matin', remplace_id: 50 }, C('2026-10-05', '2026-10-05', 'matin', 'matin'))),
        D(52, '2026-10-13', '2026-10-13', 'en_attente', 'modification', Object.assign({ demi_fin: 'matin', remplace_id: 50 }, C('2026-10-12', '2026-10-12', 'matin', 'matin'))),
        D(60, '2026-10-14', '2026-10-14', 'en_attente', 'modification', Object.assign({ motif: 'Vacances' }, C('2026-10-07', '2026-10-08', 'matin', 'matin'), { cible_texte: 'Vacances' })),
        D(61, '2026-10-09', '2026-10-09', 'en_attente', 'annulation', Object.assign({ motif: 'Vacances', demi_fin: 'matin' }, C('2026-10-09', '2026-10-09', 'matin', 'matin'), { cible_texte: 'Vacances' }))
      ]
    } });
    await page.waitForTimeout(800);
    // 1. Couleur des hachures.
    const coul = await page.evaluate(() => {
      const c = document.querySelector('.cell.demande-absence[data-personne]');
      if (!c) return { trouve: false };
      const t = document.createElement('div');
      t.style.backgroundColor = 'color-mix(in srgb, var(--absence-bg) 80%, transparent)';
      document.body.appendChild(t);
      const attendue = getComputedStyle(t).backgroundColor;
      t.remove();
      const img = getComputedStyle(c).backgroundImage;
      return { trouve: true, attendue, ok: img.indexOf(attendue) >= 0, img: img.slice(0, 90) };
    });
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s87-hachures.png' });
    verifier(coul.trouve && coul.ok, 'hachures d’une demande en attente à la couleur des bulles d’absence (' + JSON.stringify(coul) + ')');

    await page.click('#btnNotifications'); await page.waitForTimeout(400);
    const quand = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.notif-demandes .da-liste li')].map((l) => [l.dataset.id,
      l.querySelector('.da-quand').textContent + ' · ' + [...l.querySelectorAll('.da-boutons button')].map((b) => b.textContent).join('/')])));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s87-bureau.png' });
    verifier(/^le lun\. 5 oct\. matin \(une absence de la série «\sCongé\s», chaque semaine\) · Voir\/Accepter$/.test(quand[51] || '') &&
      /^le mar\. 13 oct\. matin — avant : le lun\. 12 oct\. matin \(une absence de la série «\sCongé\s», chaque semaine\) · Voir\/Refuser\/Accepter$/.test(quand[52] || '') &&
      /^le mer\. 14 oct\. — avant : du mer\. 7 oct\. au jeu\. 8 oct\. matin \(posée par le bureau\)/.test(quand[60] || '') && /\(posée par le bureau\) · Voir\/Accepter$/.test(quand[61] || ''),
      'notifications : ce qui est visé (une absence de la série, posée par le bureau) (' + JSON.stringify(quand) + ')');

    // 2. Une absence de la série.
    await page.click('.da-liste li[data-id="51"] .da-accepter'); await page.waitForTimeout(1200);
    const a = await page.evaluate(() => ({ s7: __BD.taches.filter((t) => t.serie_id === 7).map((t) => t.date).join(','),
      dem: __BD.demandes_absence.filter((d) => d.id === 50 || d.id === 51).map((d) => d.id + ':' + d.statut).join(',') }));
    verifier(a.s7 === '2026-09-28,2026-10-12,2026-10-19' && a.dem === '50:acceptee,51:acceptee',
      'annuler une absence de la série : seule celle du 5 oct. retirée, la série reste acceptée (' + JSON.stringify(a) + ')');
    await page.click('.da-liste li[data-id="52"] .da-accepter'); await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({ s7: __BD.taches.filter((t) => t.serie_id === 7).map((t) => t.date + ' ' + t.demi + ' ' + t.texte).join(','),
      nSeries: __BD.series.length, dem: __BD.demandes_absence.filter((d) => d.id === 50 || d.id === 52).map((d) => d.id + ':' + d.statut + ':' + (d.serie_id == null ? '-' : d.serie_id)).join(',') }));
    verifier(m.s7 === '2026-09-28 matin Congé,2026-10-19 matin Congé,2026-10-13 matin Congé' && m.nSeries === 1 && m.dem === '50:acceptee:7,52:acceptee:-',
      'modifier une absence de la série : le 12 oct. retiré, le 13 posé dans la même série, pas de nouvelle série (' + JSON.stringify(m) + ')');

    // 3. Absences posées par le bureau.
    await page.click('.da-liste li[data-id="60"] .da-accepter'); await page.waitForTimeout(1200);
    const b = await page.evaluate(() => ({ vac: __BD.taches.filter((t) => t.texte === 'Vacances').map((t) => t.date + ' ' + t.demi).sort().join(','), dem: __BD.demandes_absence.find((d) => d.id === 60).statut }));
    verifier(b.vac === '2026-10-09 aprem,2026-10-09 matin,2026-10-14 aprem,2026-10-14 matin' && b.dem === 'acceptee',
      'modifier une absence du bureau : le bloc du 7–8 oct. retiré, le 14 posé, le 9 intact (' + JSON.stringify(b) + ')');
    await page.click('.da-liste li[data-id="61"] .da-accepter'); await page.waitForTimeout(1200);
    const c = await page.evaluate(() => __BD.taches.filter((t) => t.texte === 'Vacances').map((t) => t.date + ' ' + t.demi).sort().join(','));
    verifier(c === '2026-10-09 aprem,2026-10-14 aprem,2026-10-14 matin', 'annuler une absence du bureau : seul le 9 oct. matin retiré (' + c + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 4. Page de consultation ------------------------------------------
  {
    const serie = { id: 1, debut: '2026-09-28', fin: '2026-09-28', demi_debut: 'matin', demi_fin: 'matin', motif: 'Congé', remarque: 'sport', statut: 'acceptee', type: 'nouvelle', supprimee: false,
      serie_frequence: 'semaine', serie_intervalle: 1, serie_fin: '2026-10-26' };
    const annulee = { id: 5, debut: '2026-10-05', fin: '2026-10-05', demi_debut: 'matin', demi_fin: 'matin', motif: 'Congé', remarque: 'sport', statut: 'acceptee', type: 'annulation', remplace_id: 1,
      cible_debut: '2026-10-05', cible_fin: '2026-10-05', cible_demi_debut: 'matin', cible_demi_fin: 'matin' };
    const modif = { id: 6, debut: '2026-10-13', fin: '2026-10-13', demi_debut: 'matin', demi_fin: 'matin', motif: 'Congé', remarque: 'sport', statut: 'en_attente', type: 'modification', remplace_id: 1,
      cible_debut: '2026-10-12', cible_fin: '2026-10-12', cible_demi_debut: 'matin', cible_demi_fin: 'matin' };
    const visee = { id: 7, debut: '2026-11-03', fin: '2026-11-03', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Vacances', remarque: null, statut: 'en_attente', type: 'modification', remplace_id: null,
      cible_debut: '2026-10-30', cible_fin: '2026-11-02', cible_demi_debut: 'aprem', cible_demi_fin: 'matin', cible_texte: 'Vacances' };
    const Ab = (date, demi, texte, serieB) => ({ date, demi, texte, serie: !!serieB });
    const absences = [Ab('2026-09-28', 'matin', 'Congé - sport', 1), Ab('2026-10-07', 'matin', 'Vacances'), Ab('2026-10-07', 'aprem', 'Vacances'), Ab('2026-10-08', 'matin', 'Vacances'),
      Ab('2026-10-09', 'aprem', 'Formation'), Ab('2026-10-12', 'matin', 'Congé - sport', 1), Ab('2026-10-19', 'matin', 'Congé - sport', 1), Ab('2026-10-26', 'matin', 'Congé - sport', 1),
      Ab('2026-10-30', 'aprem', 'Vacances'), Ab('2026-11-02', 'matin', 'Vacances')];
    const etat = { demandes: [serie, annulee, modif], appels: [], confirmer: false };
    const semaine = (lundi) => ({ personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi, aujourdhui: '2026-09-24', min: '2026-08-24', max: '2027-03-22',
      feries: [], horaires: [], taches: [], peut_demander: true, motifs: ['Congé', 'Vacances'], demandes: etat.demandes, absences });
    const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true });
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    const dialogues = [];
    page.on('dialog', (d) => { dialogues.push(d.message()); if (etat.confirmer) d.accept(); else d.dismiss(); });
    await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\//, (r) => {
      const nom = r.request().url().split('/rpc/')[1], c = JSON.parse(r.request().postData() || '{}');
      if (nom === 'consultation_planning') return r.fulfill({ contentType: 'application/json', body: JSON.stringify(semaine(c.p_lundi || '2026-09-21')) });
      etat.appels.push({ nom, c });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 99 }) });
    });
    await page.goto('file://' + path.join(__dirname, '..', 'consultation.html') + '?j=' + JETON);
    await page.waitForTimeout(500);
    const badge = await page.evaluate(() => { const b = document.getElementById('compteNotifications'); return b.hidden ? '' : b.textContent; });
    verifier(badge === '1', 'cloche : les absences du bureau ne comptent pas comme réponses (' + badge + ')');

    // La feuille revient d'elle-même sur la liste après un envoi depuis
    // celle-ci : ouverte seulement si besoin ; boutons cliqués directement
    // (liste défilée sous l'en-tête collant de la feuille).
    const ouvrirListe = async () => { if (!(await page.evaluate(() => !!document.querySelector('#feuille:not([hidden]) .demandes')))) { await page.click('#btnNotifications'); } await page.waitForTimeout(300); };
    const geste = async (id, action) => { await page.evaluate(([i, a]) => document.querySelector('.demandes li[data-id="' + i + '"] [data-action="' + a + '"]').click(), [id, action]); await page.waitForTimeout(300); };
    const lire = () => page.evaluate(() => [...document.querySelectorAll('.demandes li')].map((l) => [l.dataset.id, l.querySelector('.dq-texte b').textContent, l.querySelector('.dq-texte span').textContent,
      (l.querySelector('.dq-texte small') || {}).textContent || '', l.querySelector('.etat').textContent, [...l.querySelectorAll('.dq-actions button')].map((b) => b.textContent).join('/')].join(' · ')));
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    const liste = await lire();
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s87-consultation-liste.png', fullPage: true });
    verifier(liste.length === 5 &&
      liste[0] === '1 · Congé - sport · lun. 28 sept. matin, chaque semaine jusqu’au lun. 26 oct. · Sauf : lun. 5 oct. (annulée). En attente du bureau : lun. 12 oct. (modification). · Acceptée · Modifier/Annuler…' &&
      liste[1] === 'b2026-10-07matin · Vacances · du mer. 7 oct. au jeu. 8 oct. matin ·  · Posée par le bureau · Modifier/Annuler l’absence' &&
      liste[2] === 'b2026-10-09aprem · Formation · ven. 9 oct. après-midi ·  · Posée par le bureau · Modifier/Annuler l’absence' &&
      liste[3] === '6 · Congé - sport · mar. 13 oct. matin · Avant : lun. 12 oct. matin (une absence de la série) · Modification en attente · Modifier/Retirer' &&
      liste[4] === 'b2026-10-30aprem · Vacances · du ven. 30 oct. après-midi au lun. 2 nov. matin ·  · Posée par le bureau · Modifier/Annuler l’absence',
      'liste : absences du bureau regroupées (week-end sauté), série « Sauf : … », modification d’une seule absence (' + liste.join(' | ') + ')');

    // « Annuler… » : une absence de la série (toute la série impossible :
    // une de ses absences attend le bureau).
    await geste('1', 'annuler');
    const q1 = await page.evaluate(() => ({ choix: [...faPortee.options].map((o) => o.value + '=' + o.textContent), bouton: faEnvoyer.textContent }));
    verifier(q1.choix.join(' | ') === '2026-09-28=Seulement : lun. 28 sept. matin | 2026-10-19=Seulement : lun. 19 oct. matin | 2026-10-26=Seulement : lun. 26 oct. matin' && q1.bouton === 'Annuler cette absence',
      'Annuler… : absences libres de la série seulement (ni la 5 oct. annulée, ni la 12 en attente) (' + JSON.stringify(q1) + ')');
    await page.selectOption('#faPortee', '2026-10-19');
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const env1 = etat.appels.filter((x) => x.nom === 'consultation_annuler_absence').pop();
    verifier(env1 && env1.c.p_id === 1 && env1.c.p_cible_debut === '2026-10-19', 'annulation d’une seule absence envoyée (' + JSON.stringify(env1 && env1.c) + ')');

    // « Modifier » : une absence de la série.
    await ouvrirListe();
    await geste('1', 'modifier');
    const f1 = await page.evaluate(() => ({ quoi: faPortee.value, debut: faDebut.value, rep: faRepeter.value, serieCachee: document.querySelector('.fa-serie').hidden,
      vis: getComputedStyle(document.querySelector('.fa-serie')).display }));
    await page.selectOption('#faPortee', '2026-10-26'); await page.waitForTimeout(100);
    const f2 = await page.evaluate(() => ({ debut: faDebut.value, fin: faFin.value }));
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s87-consultation-modifier-une.png' });
    verifier(f1.quoi === '2026-09-28' && f1.debut === '2026-09-28' && f1.rep === '' && f1.serieCachee && f1.vis === 'none' && f2.debut === '2026-10-26' && f2.fin === '2026-10-26',
      'Modifier : une absence choisie → ses dates, « Répéter » masqué (' + JSON.stringify([f1, f2]) + ')');
    await page.fill('#faDebut', '2026-10-27'); await page.dispatchEvent('#faDebut', 'change'); await page.fill('#faFin', '2026-10-27');
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const env2 = etat.appels.filter((x) => x.nom === 'consultation_modifier_demande').pop();
    verifier(env2 && env2.c.p_id === 1 && env2.c.p_cible_debut === '2026-10-26' && env2.c.p_debut === '2026-10-27' && !Object.keys(env2.c).some((k) => /serie/.test(k)),
      'modification d’une seule absence envoyée, sans répétition (' + JSON.stringify(env2 && env2.c) + ')');

    // Absence du bureau : Modifier (type / motif relus), puis Annuler.
    await ouvrirListe();
    await geste('b2026-10-07matin', 'modifier');
    const g = await page.evaluate(() => ({ titre: feuilleTitre.textContent, origine: document.querySelector('.fa-origine').textContent, motif: faMotif.value, rem: faRemarque.value,
      debut: faDebut.value, fin: faFin.value, dd: faDemiDebut.value, df: faDemiFin.value, quoi: !!document.getElementById('faPortee'), bouton: faEnvoyer.textContent }));
    verifier(g.titre === 'Modifier l’absence' && g.origine === 'Absence posée par le bureau : Vacances — du mer. 7 oct. au jeu. 8 oct. matin' && g.motif === 'Vacances' && g.rem === '' &&
      g.debut === '2026-10-07' && g.fin === '2026-10-08' && g.dd === 'matin' && g.df === 'matin' && !g.quoi && g.bouton === 'Envoyer la modification',
      'Modifier une absence du bureau : formulaire pré-rempli (' + JSON.stringify(g) + ')');
    await page.fill('#faFin', '2026-10-09'); await page.selectOption('#faDemiFin', 'aprem'); await page.fill('#faRemarque', 'mariage');
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const env3 = etat.appels.filter((x) => x.nom === 'consultation_changer_absence_bureau').pop();
    const c3 = env3 ? env3.c : {};
    verifier(c3.p_action === 'modification' && c3.p_cible_debut === '2026-10-07' && c3.p_cible_fin === '2026-10-08' && c3.p_cible_demi_debut === 'matin' && c3.p_cible_demi_fin === 'matin' &&
      c3.p_debut === '2026-10-07' && c3.p_fin === '2026-10-09' && c3.p_demi_fin === 'aprem' && c3.p_motif === 'Vacances' && c3.p_remarque === 'mariage',
      'modification d’une absence du bureau envoyée avec le bloc visé (' + JSON.stringify(c3) + ')');
    await ouvrirListe();
    await geste('b2026-10-09aprem', 'modifier');
    const h = await page.evaluate(() => ({ motif: faMotif.value, choix: [...faMotif.options].map((o) => o.textContent).join('/') }));
    verifier(h.motif === 'Formation' && h.choix === 'Congé/Vacances/Formation', 'texte inconnu (« Formation ») gardé comme type (' + JSON.stringify(h) + ')');
    await page.click('#faAnnuler'); await page.waitForTimeout(200);
    etat.confirmer = true;
    await geste('b2026-10-09aprem', 'annuler'); await page.waitForTimeout(200);
    const env4 = etat.appels.filter((x) => x.nom === 'consultation_changer_absence_bureau').pop();
    verifier(/Annuler cette absence/.test(dialogues[dialogues.length - 1] || '') && env4 && env4.c.p_action === 'annulation' && env4.c.p_cible_debut === '2026-10-09' &&
      env4.c.p_cible_fin === '2026-10-09' && env4.c.p_cible_demi_debut === 'aprem' && env4.c.p_cible_demi_fin === 'aprem',
      'annuler une absence du bureau : confirmation puis demande envoyée (' + JSON.stringify(env4 && env4.c) + ')');
    etat.confirmer = false;

    // Plus rien en attente sur la série : « Toute la série » revient ; une
    // demande en attente sur un bloc du bureau le remplace dans la liste.
    etat.demandes = [serie, annulee, visee];
    await page.reload(); await page.waitForTimeout(500);
    await page.click('#btnNotifications'); await page.waitForTimeout(300);
    const liste2 = await lire();
    verifier(liste2.length === 4 && liste2[3] === '7 · Vacances · mar. 3 nov. · Avant : du ven. 30 oct. après-midi au lun. 2 nov. matin (posée par le bureau) · Modification en attente · Modifier/Retirer',
      'demande en attente sur une absence du bureau : montrée à sa place, « Avant : … » (' + liste2.join(' | ') + ')');
    await geste('1', 'modifier');
    const t1 = await page.evaluate(() => ({ quoi: faPortee.value, premier: faPortee.options[0].textContent, n: faPortee.options.length, debut: faDebut.value, rep: faRepeter.value,
      vis: getComputedStyle(document.querySelector('.fa-serie')).display !== 'none' }));
    await page.selectOption('#faPortee', '2026-10-12'); await page.waitForTimeout(100);
    await page.selectOption('#faPortee', ''); await page.waitForTimeout(100);
    const t2 = await page.evaluate(() => ({ debut: faDebut.value, rep: faRepeter.value, jusq: faJusquau.value, vis: getComputedStyle(document.querySelector('.fa-serie')).display !== 'none' }));
    verifier(t1.quoi === '' && /Toute la série/.test(t1.premier) && t1.n === 5 && t1.debut === '2026-09-28' && t1.rep === 'semaine:1' && t1.vis &&
      t2.debut === '2026-09-28' && t2.rep === 'semaine:1' && t2.jusq === '2026-10-26' && t2.vis,
      'Modifier une série sans rien en attente : « Toute la série » par défaut, retour possible après une absence (' + JSON.stringify([t1, t2]) + ')');
    await page.click('#faEnvoyer'); await page.waitForTimeout(500);
    const env5 = etat.appels.filter((x) => x.nom === 'consultation_modifier_demande').pop();
    verifier(env5 && env5 !== env2 && !('p_cible_debut' in env5.c) && env5.c.p_serie_frequence === 'semaine' && env5.c.p_serie_fin === '2026-10-26',
      'toute la série : modification envoyée avec la règle, sans cible (' + JSON.stringify(env5 && env5.c) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
