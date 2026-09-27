const { chromium } = require('playwright');
const path = require('path');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 69). Lionel :
//   « Certains texte gras ne fonctionnent pas. »
//   « Imprimer la page des raccourcis. »
//   « Le lien de consultation des ouvriers doit pouvoir ajouter une absence
//     que je doit valider dans mon planning. »
//   « Sur mobile la grosse bordure est restée entre les semaines »
//   « Possibilité de changer le statut d'une tâche plus rapidement via la
//     barre de sélection. Multiselection peut changer les statut sur
//     plusieurs tâches à la fois »
//   « en cas de déplacement interdit, la grandeur de la surbrillance n'est
//     pas correct »
// Vérifie :
//   1. aperçu de la page Affichage : jour et horaires en gras par défaut,
//      comme le planning ; G les remet en normal ;
//   2. « Imprimer » de la page Raccourcis : une feuille dédiée (tableaux),
//      seule visible à l'impression, retirée après ;
//   3. téléphone, vue 1 jour : plus de trait épais entre les semaines ;
//   4. pilule de sélection : bouton Statut (tâches d'intervenant), menu,
//      application à plusieurs tâches, une étape d'annulation ;
//   5. planning : bandeau des demandes d'absence, cases hachurées,
//      Accepter (absences posées) / Refuser ;
//   6. page de consultation : « Demander une absence », envoi, liste,
//      « Retirer » ; rien pour un intervenant ;
//   7. déplacement interdit : surbrillance de la taille de la tâche.
//
// Lancer : node test_suite69.js

const T = (id, pid, date, demi, texte, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: st || null, important: false, serie_id: null, est_absence: false });
const D = (id, pid, du, au, dd, df, motif, rq) => ({ id, personne_id: pid, date_debut: du, date_fin: au, demi_debut: dd, demi_fin: df, motif, remarque: rq || null, statut: 'en_attente', cree_le: '2026-09-22T08:00:00Z' });
const PERSONNES = [
  { id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true },
  { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true },
  { id: 3, nom: 'Électricien', sous_traitant: true, ordre: 3, actif: true },
  { id: 4, nom: 'Échafaudeur', sous_traitant: true, ordre: 4, actif: true }
];
const STATUTS = [{ id: 1, cle: 'confirme', nom: 'Confirmé', couleur: '#f7e6ab', ordre: 1 }, { id: 2, cle: 'attente', nom: 'En attente', couleur: '#cfe3f7', ordre: 2 }];
const bulle = (t) => '.grille .bulle:has-text("' + t + '")';
const poids = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? getComputedStyle(n).fontWeight : null; }, sel);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 et 2. Gras de l'aperçu, impression des raccourcis ---------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 } });
    await page.evaluate(() => afficherPage('affichage')); await page.waitForTimeout(250);
    const avant = [await poids(page, '#apercuAffichage .aa-jour'), await poids(page, '#apercuAffichage .aa-demi.aa-matin')];
    verifier(avant[0] === '600' && avant[1] === '600', 'aperçu : jour et horaires en gras par défaut (' + avant + ')');
    await page.click('#page-affichage .style-icone[data-option="jourSemaineGras"]'); await page.waitForTimeout(200);
    await page.click('#page-affichage .style-icone[data-option="ligneDemiGras"]'); await page.waitForTimeout(200);
    const apres = [await poids(page, '#apercuAffichage .aa-jour'), await poids(page, '#apercuAffichage .aa-demi.aa-matin')];
    verifier(apres[0] === '400' && apres[1] === '400', 'aperçu : G éteint → texte normal (' + apres + ')');

    await page.evaluate(() => { window.__IMPRESSIONS = 0; window.print = () => { window.__IMPRESSIONS++; }; afficherPage('raccourcis'); });
    await page.waitForTimeout(200);
    verifier(await page.isVisible('#btnImprimerRaccourcis'), 'page Raccourcis : bouton « Imprimer »');
    await page.click('#btnImprimerRaccourcis'); await page.waitForTimeout(200);
    const feuille = await page.evaluate(() => {
      const f = document.querySelector('.impression-raccourcis');
      return f && { imprime: window.__IMPRESSIONS, classe: document.documentElement.classList.contains('impr-raccourcis'),
        titres: [...f.querySelectorAll('h2')].length, lignes: f.querySelectorAll('tr').length, ecran: getComputedStyle(f).display };
    });
    verifier(feuille && feuille.imprime === 1 && feuille.classe && feuille.titres >= 3 && feuille.lignes > 20 && feuille.ecran === 'none',
      'Imprimer : feuille dédiée (groupes + tableaux), cachée à l\'écran, impression lancée (' + JSON.stringify(feuille) + ')');
    await page.emulateMedia({ media: 'print' });
    const imp = await page.evaluate(() => ({ feuille: getComputedStyle(document.querySelector('.impression-raccourcis')).display,
      autres: [...document.body.children].filter((e) => !e.classList.contains('impression-raccourcis') && getComputedStyle(e).display !== 'none').map((e) => e.id || e.className) }));
    verifier(imp.feuille !== 'none' && !imp.autres.length, 'impression : seule la feuille des raccourcis est imprimée (' + JSON.stringify(imp) + ')');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await page.waitForTimeout(100);
    verifier(await page.evaluate(() => !document.querySelector('.impression-raccourcis') && !document.documentElement.classList.contains('impr-raccourcis')),
      'après l\'impression : feuille retirée');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 3. Téléphone : pas de trait épais entre les semaines -------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.waitForTimeout(300);
    const bord = await page.evaluate(() => {
      const f = document.querySelector('#racine .sem-frontiere');
      return { classe: document.getElementById('racine').classList.contains('sans-trait-semaines'), bord: f ? getComputedStyle(f).borderLeftWidth : '0px' };
    });
    verifier(bord.classe && bord.bord === '0px', 'téléphone, vue 1 jour : aucun trait épais entre les semaines (' + JSON.stringify(bord) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 4. Statut depuis la pilule de sélection --------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      personnes: PERSONNES, statuts: STATUTS,
      taches: [T(1, 1, '2026-09-24', 'matin', 'Coffrage'), T(2, 3, '2026-09-24', 'matin', 'Câblage'), T(3, 4, '2026-09-25', 'matin', 'Montage', 1)]
    } });
    await page.click(bulle('Coffrage')); await page.waitForTimeout(150);
    verifier(await page.evaluate(() => document.getElementById('selStatut').hidden), 'tâche du personnel seule : pas de bouton Statut');
    await page.click(bulle('Câblage'), { modifiers: ['Control'] });
    await page.click(bulle('Montage'), { modifiers: ['Control'] }); await page.waitForTimeout(150);
    verifier(await page.evaluate(() => !document.getElementById('selStatut').hidden), 'tâches d\'intervenant dans la sélection : bouton Statut');
    await page.click('#selStatut'); await page.waitForTimeout(150);
    const menu = await page.evaluate(() => {
      const m = document.getElementById('menuStatutSelection');
      return m && { choix: [...m.querySelectorAll('.ms-choix')].map((b) => b.textContent), actifs: m.querySelectorAll('.actif').length, visible: m.getBoundingClientRect().height > 0 };
    });
    verifier(menu && menu.choix.join('|') === 'Aucun|Confirmé|En attente' && menu.actifs === 0 && menu.visible,
      'menu : Aucun + les statuts, rien de coché (statuts différents) (' + JSON.stringify(menu) + ')');
    await page.click('#menuStatutSelection [data-statut="attente"]'); await page.waitForTimeout(400);
    const res = await page.evaluate(() => ({ bd: __BD.taches.map((t) => t.texte + ':' + t.statut_id).join(','), sel: Object.keys(bullesSelectionnees).length,
      menu: !!document.getElementById('menuStatutSelection'), toast: (document.querySelector('.toast') || {}).textContent }));
    verifier(res.bd === 'Coffrage:null,Câblage:2,Montage:2' && res.sel === 3 && !res.menu && /En attente.*\(2\)/.test(res.toast),
      '« En attente » posé sur les 2 tâches d\'intervenant, pas sur celle du personnel ; sélection gardée (' + JSON.stringify(res) + ')');
    await page.click('#selStatut'); await page.waitForTimeout(150);
    verifier(await page.evaluate(() => [...document.querySelectorAll('#menuStatutSelection .actif')].map((b) => b.textContent).join()) === 'En attente', 'menu rouvert : statut commun coché');
    await page.mouse.click(1300, 880); await page.waitForTimeout(150);
    verifier(await page.evaluate(() => !document.getElementById('menuStatutSelection')), 'clic ailleurs : menu refermé');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
    verifier(await page.evaluate(() => __BD.taches.map((t) => t.texte + ':' + t.statut_id).join(',')) === 'Coffrage:null,Câblage:null,Montage:1', 'Ctrl+Z : les deux statuts d\'avant reviennent');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 5. Demandes d'absence dans le planning ---------------------------
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      taches: [T(1, 2, '2026-09-23', 'matin', 'Coffrage')],
      demandes_absence: [D(5, 2, '2026-09-23', '2026-09-24', 'aprem', 'aprem', 'Congé', 'mariage'), D(6, 1, '2026-10-05', '2026-10-05', 'matin', 'matin', 'Maladie')]
    } });
    await page.waitForTimeout(600);
    const vu = await page.evaluate(() => ({ bandeau: document.getElementById('bandeauDemandes').hidden ? null : document.querySelector('#bandeauDemandes .bd-texte').textContent,
      cases: [...document.querySelectorAll('.cell.demande-absence')].map((c) => c.dataset.personne + '/' + isoDeGi(+c.dataset.jour) + '/' + c.dataset.demi).join(','),
      fond: getComputedStyle(document.querySelector('.cell.demande-absence.cell-aprem, .cell.demande-absence')).backgroundImage }));
    verifier(vu.bandeau === '2 demandes d’absence à valider' && vu.cases === '2/2026-09-23/aprem,2/2026-09-24/matin,2/2026-09-24/aprem' && /gradient/.test(vu.fond),
      'bandeau « 2 demandes » + demi-journées demandées hachurées sur la ligne de Mathis (' + JSON.stringify(vu) + ')');
    await page.click('#bandeauDemandes'); await page.waitForTimeout(250);
    const liste = await page.evaluate(() => [...document.querySelectorAll('.da-liste li')].map((l) => l.querySelector('.da-qui').textContent + ' · ' + l.querySelector('.da-quoi').textContent + ' · ' + l.querySelector('.da-quand').textContent));
    verifier(liste.join(' / ') === 'Mathis · Congé · du mer. 23 sept. après-midi au jeu. 24 sept. / Lionel · Maladie · le lun. 5 oct. matin', 'liste : qui, quoi, quand (' + liste.join(' / ') + ')');
    await page.click('.da-liste li[data-id="5"] .da-accepter'); await page.waitForTimeout(1200);
    const acc = await page.evaluate(() => ({ abs: __BD.taches.filter((t) => t.est_absence).map((t) => t.personne_id + ' ' + t.date + ' ' + t.demi + ' ' + t.texte).join(','),
      dem: __BD.demandes_absence.map((d) => d.id + ':' + d.statut + ':' + !!d.traitee_le).join(','), bulle: TACHES.some((t) => t.type === 'absence' && t.texte === 'Congé'),
      bandeau: document.querySelector('#bandeauDemandes .bd-texte').textContent, cases: document.querySelectorAll('.cell.demande-absence').length }));
    verifier(acc.abs === '2 2026-09-23 aprem Congé,2 2026-09-24 matin Congé,2 2026-09-24 aprem Congé' && acc.dem === '5:acceptee:true,6:en_attente:false' &&
      acc.bulle && acc.bandeau === '1 demande d’absence à valider' && acc.cases === 0,
      'Accepter : absence posée (3 demi-journées), demande acceptée, hachures retirées (' + JSON.stringify(acc) + ')');
    await page.click('.da-liste li[data-id="6"] .da-refuser'); await page.waitForTimeout(500);
    const ref = await page.evaluate(() => ({ dem: __BD.demandes_absence.map((d) => d.id + ':' + d.statut).join(','), cache: document.getElementById('bandeauDemandes').hidden,
      abs: __BD.taches.filter((t) => t.est_absence).length }));
    verifier(ref.dem === '5:acceptee,6:refusee' && ref.cache && ref.abs === 3, 'Refuser : demande refusée, rien posé, bandeau caché (' + JSON.stringify(ref) + ')');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  // --- 6. Page de consultation : demander une absence -------------------
  {
    const JETON = '0123456789abcdef0123456789abcdef';
    const etat = { demandes: [{ id: 3, debut: '2026-09-14', fin: '2026-09-14', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Vacances', remarque: null, statut: 'acceptee' }], envois: [], prochain: 10 };
    const semaine = (lundi, st) => ({ personne: { nom: st ? 'Électricien' : 'Mathis', sous_traitant: !!st, equipe: false }, lundi, aujourdhui: '2026-09-24', min: '2026-08-24', max: '2027-03-22',
      feries: [], horaires: [], taches: [], peut_demander: !st, motifs: ['Congé', 'Vacances', 'Maladie'], demandes: etat.demandes });
    for (const st of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 360, height: 780 }, hasTouch: true });
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));
      page.on('dialog', (d) => d.accept());
      await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
      await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
      await page.route(/\/rest\/v1\/rpc\/consultation_planning/, (r) => { const c = JSON.parse(r.request().postData()); r.fulfill({ contentType: 'application/json', body: JSON.stringify(semaine(c.p_lundi || '2026-09-21', st)) }); });
      await page.route(/\/rest\/v1\/rpc\/consultation_demander_absence/, (r) => {
        const c = JSON.parse(r.request().postData());
        etat.envois.push(c);
        etat.demandes.push({ id: etat.prochain++, debut: c.p_debut, fin: c.p_fin, demi_debut: c.p_demi_debut, demi_fin: c.p_demi_fin, motif: c.p_motif, remarque: c.p_remarque || null, statut: 'en_attente' });
        r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: etat.prochain - 1 }) });
      });
      await page.route(/\/rest\/v1\/rpc\/consultation_annuler_demande/, (r) => {
        const c = JSON.parse(r.request().postData());
        etat.demandes = etat.demandes.filter((q) => q.id !== c.p_id);
        r.fulfill({ contentType: 'application/json', body: 'true' });
      });
      await page.goto('file://' + path.join(__dirname, 'consultation.html') + '?j=' + JETON);
      await page.waitForTimeout(400);
      if (st) {
        verifier(!(await page.$('#blocAbsences')), 'consultation d\'un intervenant : pas de demande d\'absence');
        toutesErreurs.push(...erreurs);
        await page.close();
        continue;
      }
      const bloc = await page.evaluate(() => ({ bouton: !!document.getElementById('btnDemanderAbsence'), liste: [...document.querySelectorAll('.demandes li')].map((l) => l.innerText.replace(/\s+/g, ' ')) }));
      verifier(bloc.bouton && bloc.liste.length === 1 && /Vacances.*Acceptée/i.test(bloc.liste[0]), 'consultation : « Mes absences », bouton + demande acceptée (' + JSON.stringify(bloc) + ')');
      await page.click('#btnDemanderAbsence'); await page.waitForTimeout(150);
      await page.selectOption('#faMotif', 'Congé');
      await page.fill('#faDebut', '2026-09-28'); await page.dispatchEvent('#faDebut', 'change');
      await page.fill('#faFin', '2026-09-25');
      await page.click('#faEnvoyer'); await page.waitForTimeout(200);
      verifier(etat.envois.length === 0 && await page.evaluate(() => !document.getElementById('faErreur').hidden), 'fin avant le début : refusé sur place, rien envoyé');
      await page.fill('#faFin', '2026-09-29');
      await page.selectOption('#faDemiFin', 'matin');
      await page.fill('#faRemarque', 'Déménagement');
      if (process.env.CAPTURE_DIR) await page.screenshot({ path: process.env.CAPTURE_DIR + '/s69-demande.png', fullPage: true });
      await page.click('#faEnvoyer'); await page.waitForTimeout(500);
      const e = etat.envois[0] || {};
      verifier(e.p_jeton === JETON && e.p_debut === '2026-09-28' && e.p_fin === '2026-09-29' && e.p_demi_debut === 'matin' && e.p_demi_fin === 'matin' && e.p_motif === 'Congé' && e.p_remarque === 'Déménagement',
        'envoi : jeton, dates, demi-journées, motif, remarque (' + JSON.stringify(e) + ')');
      const apres = await page.evaluate(() => ({ form: !!document.getElementById('formAbsence'), liste: [...document.querySelectorAll('.demandes li')].map((l) => l.innerText.replace(/\s+/g, ' ')) }));
      verifier(!apres.form && apres.liste.some((t) => /Congé — du lun\. 28 sept\. au mar\. 29 sept\. matin.*En attente.*Retirer/i.test(t)), 'après l\'envoi : demande « En attente » listée (' + JSON.stringify(apres) + ')');
      await page.click('#btnSuivante'); await page.waitForTimeout(400);
      const cartes = await page.evaluate(() => [...document.querySelectorAll('.tache.demande')].map((t) => t.closest('.jour').dataset.date + '/' + (t.closest('.demi').classList.contains('demi-matin') ? 'matin' : 'aprem')).join(','));
      verifier(cartes === '2026-09-28/matin,2026-09-28/aprem,2026-09-29/matin', 'semaine suivante : demande en pointillés dans les demi-journées demandées (' + cartes + ')');
      await page.click('.demandes .btn-retirer'); await page.waitForTimeout(400);
      verifier(etat.demandes.length === 1 && await page.evaluate(() => !document.querySelector('.tache.demande') && !document.querySelector('.btn-retirer')), '« Retirer » : demande en attente supprimée');
      toutesErreurs.push(...erreurs);
      await page.close();
    }
  }

  // --- 7. Déplacement interdit : surbrillance de la taille de la tâche --
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: {
      personnes: PERSONNES, taches: [T(1, 4, '2026-09-22', 'matin', 'Tubage'), T(2, 4, '2026-09-22', 'aprem', 'Tubage')] } });
    const b = await page.evaluate(() => { const r = document.querySelector('.bulle[data-id] .b-carte').getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
    const c = await page.evaluate(() => { const el = document.querySelector('.cell[data-kind="personne"][data-personne="3"][data-jour="' + giDepuisIso('2026-09-22') + '"][data-demi="matin"]'); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
    await page.mouse.move(b.x, b.y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(b.x + (c.x - b.x) * i / 10, b.y + (c.y - b.y) * i / 10); await page.waitForTimeout(25); }
    const s = await page.evaluate(() => {
      const el = document.querySelector('.survol-precis'), demi = document.querySelector('.cell[data-kind="personne"]').getBoundingClientRect().width;
      return el && { interdit: el.classList.contains('survol-interdit'), ratio: Math.round(el.getBoundingClientRect().width / demi * 10) / 10, cases: document.querySelectorAll('.cell-interdite').length };
    });
    verifier(s && s.interdit && s.ratio === 2 && s.cases === 0, 'tâche d\'intervenant (2 demi-journées) sur une autre ligne : surbrillance interdite de 2 demi-journées (' + JSON.stringify(s) + ')');
    await page.mouse.up(); await page.waitForTimeout(300);
    verifier(await page.evaluate(() => __BD.taches.every((t) => t.personne_id === 4)), 'lâcher : la tâche reste sur sa ligne');
    toutesErreurs.push(...erreurs);
    await page.context().close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
