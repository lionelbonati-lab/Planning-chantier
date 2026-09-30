const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 125). Lionel : « Notification pour important
// dans le bouton notif. », puis « 7 prochains jours » (période).
// Vérifie (aujourd'hui = jeudi 24.09.2026 dans les tests) :
//   1. compteur de la cloche = importants d'aujourd'hui au 30.09 : tâche
//      (une seule fois pour 2 jours de suite), absence, jalon, note ; pas
//      ceux d'hier, du 01.10, ni ceux sans drapeau ;
//   2. sans statut ni demande, la cloche apparaît grâce aux importants ;
//   3. fenêtre : section « Importants — 7 prochains jours », lignes triées
//      par date (quand, qui, quoi, chantier) ;
//   4. clic sur une ligne de la semaine suivante : planning sur sa semaine,
//      bulle sélectionnée ; un jalon aussi ;
//   5. sans important : pas de section, pas de cloche.
//
// Lancer : node test_suite125.js

const T = (id, pid, date, demi, texte, imp, abs) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: null, important: !!imp, est_absence: !!abs, serie_id: null });
const BD = () => ({
  taches: [
    T(1, 1, '2026-09-24', 'matin', 'Coulage dalle', 1), T(2, 1, '2026-09-24', 'aprem', 'Coulage dalle', 1), T(3, 1, '2026-09-25', 'matin', 'Coulage dalle', 1), T(4, 1, '2026-09-25', 'aprem', 'Coulage dalle', 1),
    T(5, 2, '2026-09-29', 'aprem', 'Livraison grue', 1),
    T(6, 2, '2026-09-28', 'matin', 'Médecin', 1, 1),
    T(7, 1, '2026-09-23', 'matin', 'Hier', 1), T(8, 1, '2026-10-01', 'matin', 'Trop tard', 1), T(9, 2, '2026-09-24', 'matin', 'Banal')
  ],
  jalons: [{ id: 20, date: '2026-09-30', demi: null, texte: 'Réception', important: true, chantier_id: null, serie_id: null }, { id: 21, date: '2026-09-25', demi: null, texte: 'Jalon banal', important: false, chantier_id: null, serie_id: null }],
  notes: [{ id: 30, date: '2026-09-26', demi: null, texte: 'Visite samedi', important: true, chantier_id: 1, serie_id: null }]
});
const compte = (page) => page.evaluate(() => { const b = document.querySelector('#btnNotifications .compte-notifications'); return b.hidden ? '' : b.textContent; });

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD() });
    await page.waitForTimeout(1900);
    const b = await page.evaluate(() => { const btn = document.getElementById('btnNotifications'); return { visible: btn.getBoundingClientRect().width > 0 && !document.getElementById('groupeNotifications').hidden, titre: btn.title }; });
    verifier(b.visible, 'sans statut ni demande : la cloche apparaît pour les importants');
    verifier(await compte(page) === '5' && b.titre === 'Notifications — 5 importants (7 jours)', 'compteur 5 : tâche sur 2 jours comptée une fois, absence, jalon, note (' + b.titre + ')');

    await page.click('#btnNotifications');
    await page.waitForTimeout(500);
    const f = await page.evaluate(() => ({
      sections: [...document.querySelectorAll('.pop-notifications .notif-titre')].map((t) => t.textContent),
      lignes: [...document.querySelectorAll('.notif-importants .ar-ligne')].map((l) => [l.querySelector('.ar-quand').textContent, l.querySelector('.ar-qui').textContent, l.querySelector('.ar-quoi').textContent, l.querySelector('.ar-chantier') ? 'ch' : '-'].join(' / '))
    }));
    verifier(f.sections.join(' | ') === 'Demandes d’absence0 | Importants — 7 prochains jours5', 'section « Importants — 7 prochains jours » avec son nombre (' + JSON.stringify(f.sections) + ')');
    verifier(JSON.stringify(f.lignes) === JSON.stringify([
      'Jeu. 24 sept. → Ven. 25 sept. / Lionel / Coulage dalle / ch',
      'Sam. 26 sept. / Note / Visite samedi / ch',
      'Lun. 28 sept., matin / Mathis · absence / Médecin / ch',
      'Mar. 29 sept., après-midi / Mathis / Livraison grue / ch',
      'Mer. 30 sept. / Jalon / Réception / -'
    ]), 'lignes triées par date : quand, qui, quoi, chantier ' + JSON.stringify(f.lignes, null, 1));

    await page.click('.notif-importants .ar-ligne >> nth=3');
    await page.waitForTimeout(800);
    let t = await page.evaluate(() => ({ ouvert: !!document.querySelector('.pop-notifications'), semaine: etat.semaines[etat.indexSemaine].debut,
      sel: Object.keys(bullesSelectionnees).map((id) => itemParId(id).item.texte).join() }));
    verifier(!t.ouvert && t.semaine === '2026-09-28' && t.sel === 'Livraison grue', 'clic sur « Livraison grue » : semaine du 28.09, tâche sélectionnée (' + JSON.stringify(t) + ')');

    await page.click('#btnNotifications');
    await page.waitForTimeout(500);
    await page.click('.notif-importants .ar-ligne >> nth=4');
    await page.waitForTimeout(800);
    t = await page.evaluate(() => ({ sel: Object.keys(bullesSelectionnees).map((id) => itemParId(id).item.texte).join() }));
    verifier(t.sel === 'Réception', 'clic sur le jalon : jalon sélectionné (' + t.sel + ')');

    // Le drapeau retiré dans le planning : le compteur suit au rendu suivant.
    await page.evaluate(() => { quitterModeSelection(); const x = TACHES.find((y) => y.texte === 'Livraison grue'); x.important = false; render(); });
    await page.waitForTimeout(2600);
    verifier(await compte(page) === '4', 'drapeau retiré dans le planning : compteur 4 (' + await compte(page) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  {
    const bd = BD(); bd.taches.forEach((x) => { x.important = false; }); bd.jalons = []; bd.notes = [];
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd });
    await page.waitForTimeout(1900);
    verifier(await page.evaluate(() => document.getElementById('groupeNotifications').hidden), 'sans important, statut ni demande : pas de cloche');
    toutesErreurs.push(...erreurs);
    await page.close();
  }
  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
