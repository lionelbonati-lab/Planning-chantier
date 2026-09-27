const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 27.09.2026 (suite 81). Lionel :
//   « J'aimerai un bouton notifications à la place de celui de statut. »
//   « On y placera les demandes de congés et les statuts à réserver. On
//     peut retirer les statuts réserver et confirmer de cette section. »
// Vérifie :
//   1. ordinateur : cloche « Notifications » à la place de « À réserver »,
//      compteur = demandes d'absence + tâches à réserver ; plus de bandeau
//      au-dessus du planning ;
//   2. la fenêtre : section « Demandes d'absence » (Voir / Refuser /
//      Accepter) puis section « À réserver », sans pastilles réservé /
//      confirmé ; Accepter met à jour la section et le compteur ;
//   3. téléphone : la cloche dans la barre du bas, même fenêtre ;
//   4. sans statut ni demande : pas de bouton ; sans statut mais avec une
//      demande : le bouton, section « À réserver » absente.
//
// Lancer : node test_suite81.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const T = (id, pid, date, demi, texte, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: st || null });
const D = (id, pid, du, au, dd, df, motif, remarque) => ({ id, personne_id: pid, date_debut: du, date_fin: au, demi_debut: dd, demi_fin: df, motif, remarque: remarque || null, statut: 'en_attente', cree_le: '2026-09-23T08:00:00Z' });
const STATUTS = [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }, { id: 2, cle: 'reserve', nom: 'réservé', couleur: '#eec79b', ordre: 2 }, { id: 3, cle: 'confirme', nom: 'Confirmé', couleur: '#aee1a8', ordre: 3 }];
const BD = {
  statuts: STATUTS,
  taches: [T(1, 1, '2026-09-28', 'matin', 'Pompe à béton', 1), T(2, 2, '2026-10-01', 'aprem', 'Location nacelle', 1), T(3, 1, '2026-09-25', 'matin', 'Livraison armature', 2), T(4, 2, '2026-09-29', 'matin', 'Grue', 3)],
  demandes_absence: [D(5, 2, '2026-10-05', '2026-10-06', 'matin', 'aprem', 'Congé', 'mariage')]
};
const compte = (sel) => (page) => page.evaluate((s) => { const b = document.querySelector(s + ' .compte-notifications'); return b.hidden ? '' : b.textContent; }, sel);

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1 et 2. Ordinateur ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd: BD });
    await page.waitForTimeout(1800);
    const b = await page.evaluate(() => {
      const btn = document.getElementById('btnNotifications'), g = document.getElementById('groupeNotifications');
      return { visible: btn.getBoundingClientRect().width > 0 && !btn.closest('#toolbarSecondaire'), ancien: !!document.getElementById('btnAReserver'),
        bandeau: !!document.getElementById('bandeauDemandes'), rang: g.dataset.rang, titre: btn.title, cloche: !!btn.querySelector('svg path[d^="M5 14.5"]') };
    });
    verifier(b.visible && !b.ancien && !b.bandeau && b.rang === '15' && b.cloche, 'cloche « Notifications » dans la barre à la place de « À réserver », plus de bandeau (' + JSON.stringify(b) + ')');
    verifier(await compte('#btnNotifications')(page) === '3' && b.titre === 'Notifications — 1 demande d’absence, 2 tâches « à réserver »',
      'compteur 3 = 1 demande + 2 à réserver (' + b.titre + ')');

    await page.click('#btnNotifications');
    await page.waitForTimeout(400);
    const f = await page.evaluate(() => {
      const pop = document.querySelector('.pop-notifications'), r = pop.getBoundingClientRect();
      return { titre: pop.querySelector('.cp-titre').textContent, sections: [...pop.querySelectorAll('.notif-titre')].map((t) => t.textContent),
        demandes: [...pop.querySelectorAll('.notif-demandes .da-liste li')].map((l) => l.querySelector('.da-qui').textContent + ' · ' + l.querySelector('.da-quoi').textContent + ' · ' + [...l.querySelectorAll('button')].map((x) => x.textContent).join('/')),
        taches: [...pop.querySelectorAll('.notif-a-reserver .ar-quoi')].map((e) => e.textContent), chips: pop.querySelectorAll('.chip, .ar-statuts').length,
        dansEcran: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
    });
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s81-ordi.png' });
    verifier(f.titre === 'Notifications' && f.sections.join(' | ') === 'Demandes d’absence1 | À réserver2' && f.dansEcran,
      'fenêtre « Notifications » : demandes puis à réserver, avec leurs nombres (' + JSON.stringify(f.sections) + ')');
    verifier(f.demandes.join() === 'Mathis · Congé - mariage · Voir/Refuser/Accepter', 'demande : qui, « Congé - Motif », Voir / Refuser / Accepter (' + f.demandes + ')');
    verifier(f.taches.join() === 'Pompe à béton,Location nacelle' && f.chips === 0, 'à réserver seulement, sans pastilles réservé / confirmé (' + JSON.stringify([f.taches, f.chips]) + ')');

    await page.click('.notif-demandes .da-accepter');
    await page.waitForTimeout(1200);
    const a = await page.evaluate(() => ({ ouvert: !!document.querySelector('.pop-notifications'), vide: (document.querySelector('.notif-demandes .notif-vide') || {}).textContent,
      sections: [...document.querySelectorAll('.pop-notifications .notif-titre')].map((t) => t.textContent).join(' | '),
      abs: __BD.taches.filter((t) => t.est_absence).map((t) => t.date + ' ' + t.demi + ' ' + t.texte).join(','), dem: __BD.demandes_absence.map((d) => d.statut).join() }));
    verifier(a.ouvert && a.vide === 'Aucune demande en attente.' && a.sections === 'Demandes d’absence0 | À réserver2' && a.dem === 'acceptee' && a.abs.split(',').length === 4,
      'Accepter depuis les notifications : absence posée, section vidée, fenêtre gardée (' + JSON.stringify(a) + ')');
    verifier(await compte('#btnNotifications')(page) === '2', 'compteur de la cloche : 2');

    await page.click('.notif-a-reserver .ar-ligne >> nth=1');
    await page.waitForTimeout(700);
    const t = await page.evaluate(() => ({ ouvert: !!document.querySelector('.pop-notifications'), semaine: etat.semaines[etat.indexSemaine].debut,
      sel: Object.keys(bullesSelectionnees).map((id) => itemParId(id).item.texte).join() }));
    verifier(!t.ouvert && t.semaine === '2026-09-28' && t.sel === 'Location nacelle', 'clic sur une tâche à réserver : planning sur sa semaine, tâche sélectionnée (' + JSON.stringify(t) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Téléphone ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 390, height: 800 }, hasTouch: true, bd: BD });
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => {
      const bas = document.getElementById('btnNotificationsNavBas'), r = bas.getBoundingClientRect(), nav = document.getElementById('navBas').getBoundingClientRect();
      return { enBas: r.width > 0 && r.top >= nav.top && r.bottom <= nav.bottom, barre: document.getElementById('groupeNotifications').getBoundingClientRect().width,
        deborde: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    verifier(m.enBas && m.barre === 0 && !m.deborde && await compte('#btnNotificationsNavBas')(page) === '3', 'téléphone : cloche dans la barre du bas, compteur 3 (' + JSON.stringify(m) + ')');
    await page.click('#btnNotificationsNavBas');
    await page.waitForTimeout(400);
    const f = await page.evaluate(() => { const pop = document.querySelector('.pop-notifications'), r = pop.getBoundingClientRect();
      return { sections: [...pop.querySelectorAll('.notif-titre')].map((t) => t.textContent).join(' | '), dansEcran: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s81-tel.png' });
    verifier(f.sections === 'Demandes d’absence1 | À réserver2' && f.dansEcran, 'téléphone : même fenêtre, entière à l\'écran (' + JSON.stringify(f) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 4. Sans statut ---
  for (const [bd, attendu, lib] of [[{ statuts: [] }, false, 'ni statut ni demande : pas de bouton'],
    [{ statuts: [], demandes_absence: [D(7, 1, '2026-10-12', '2026-10-12', 'matin', 'aprem', 'Vacances')] }, true, 'sans statut, une demande : bouton, section des demandes seule']]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1400, height: 900 }, bd });
    await page.waitForTimeout(1800);
    const vis = await page.evaluate(() => document.getElementById('btnNotifications').getBoundingClientRect().width > 0);
    let sections = '';
    if (vis) {
      await page.click('#btnNotifications'); await page.waitForTimeout(300);
      sections = await page.evaluate(() => [...document.querySelectorAll('.pop-notifications .notif-titre')].map((t) => t.textContent).join(' | '));
    }
    verifier(vis === attendu && (!attendu || sections === 'Demandes d’absence1'), lib + ' (' + JSON.stringify({ vis, sections }) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur console (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
