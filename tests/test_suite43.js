const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 43) — Lionel : « Aperçu avant impression :
// ajouter case à cocher personnel. Rendre personnel et intervenants
// déroulant sous leur case à cocher générale pour réduire la longueur de
// la liste. » Panneau Réglages de l'aperçu (openPrintSheet,
// js/impression.js) : fieldset Personnes à 2 groupes repliables.
//
// Lancer : node test_suite43.js

const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1 });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(3, 'Antoine', 3), P(4, 'Béton/Armature', 4, 1), P(5, 'Echafaudage', 5, 1)],
  taches: [T(1, 1, '2026-09-21', 'matin', 'Gabarits'), T(2, 2, '2026-09-22', 'matin', 'Décoffrage'), T(3, 3, '2026-09-22', 'aprem', 'Coffrage'),
    T(4, 4, '2026-09-23', 'matin', 'Livraison armature'), T(5, 5, '2026-09-24', 'matin', 'Montage')]
};
const etat = (page) => page.evaluate(() => {
  const doc = document.querySelector('.impression-modal .print-doc');
  const groupe = (cle) => {
    const b = document.querySelector('.impr-deplier[data-g="' + cle + '"]'), g = b.closest('.impr-groupe'), l = g.querySelector('.impr-liste');
    return { coche: g.querySelector('[data-r="' + cle + '"]').checked, compte: b.textContent.replace('›', '').trim(), ouvert: b.getAttribute('aria-expanded') === 'true',
      visible: l.getBoundingClientRect().height > 0, noms: [...l.querySelectorAll('label')].map((x) => x.textContent.trim()), grises: l.querySelectorAll('input:disabled').length };
  };
  return {
    personnes: [...doc.querySelectorAll('.print-table tbody tr:not(.print-spacer):not(.print-jalons):not(.print-notes)')].map((tr) => tr.firstElementChild.textContent),
    afficher: document.querySelector('.impr-reglages fieldset').textContent.replace(/\s+/g, ' ').trim(),
    personnel: groupe('personnel'), intervenants: groupe('intervenants'),
    hauteurPanneau: Math.round(document.querySelector('.impr-deplier[data-g="personnel"]').closest('.impr-groupe').getBoundingClientRect().height)
  };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const largeur of [1300, 360]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 900 }, bd: BD });
    await page.evaluate(() => { try { localStorage.removeItem('planning.impression.reglages'); } catch (e) {} openPrintSheet(); });
    await page.waitForTimeout(200);
    await page.click('.impr-reglages summary');
    let e = await etat(page);
    const replie = e.hauteurPanneau;
    verifier(!/Intervenants/.test(e.afficher.replace('Statuts des intervenants', '')), largeur + ' px : « Intervenants » quitte « Afficher » pour devenir la case générale de sa liste');
    verifier(e.personnel.coche && e.intervenants.coche && e.personnel.compte === '3 / 3' && e.intervenants.compte === '2 / 2',
      largeur + ' px : cases générales Personnel et Intervenants cochées, compteurs (' + e.personnel.compte + ', ' + e.intervenants.compte + ')');
    verifier(!e.personnel.ouvert && !e.personnel.visible && !e.intervenants.ouvert && !e.intervenants.visible, largeur + ' px : listes repliées à l\'ouverture');

    await page.click('.impr-deplier[data-g="personnel"]');
    e = await etat(page);
    verifier(e.personnel.ouvert && e.personnel.visible && e.personnel.noms.join() === 'Lionel,Mathis,Antoine' && !e.intervenants.visible && e.hauteurPanneau > replie,
      largeur + ' px : Personnel déplié sous sa case (' + e.personnel.noms.join() + '), Intervenants toujours replié (' + replie + ' → ' + e.hauteurPanneau + ' px)');

    // Une personne décochée : panneau reconstruit, liste toujours dépliée.
    await page.click('[data-p="2"]');
    e = await etat(page);
    verifier(e.personnel.visible && e.personnel.compte === '2 / 3' && e.personnes.join() === 'Lionel,Antoine,Béton/Armature,Echafaudage',
      largeur + ' px : Mathis décoché — liste restée dépliée, compteur 2 / 3, retiré de la feuille');

    // Case générale Personnel.
    await page.click('[data-r="personnel"]');
    e = await etat(page);
    verifier(!e.personnel.coche && e.personnes.join() === 'Béton/Armature,Echafaudage' && e.personnel.grises === 3,
      largeur + ' px : Personnel décoché — seuls les intervenants sont imprimés, cases du personnel grisées (' + e.personnes.join() + ')');
    await page.click('[data-r="intervenants"]');
    e = await etat(page);
    verifier(e.personnes.length === 0 && !e.intervenants.coche, largeur + ' px : les 2 décochées — plus aucune personne');
    await page.click('[data-r="personnel"]'); await page.click('[data-r="intervenants"]');

    await page.click('.impr-deplier[data-g="personnel"]');
    e = await etat(page);
    verifier(!e.personnel.visible && !e.personnel.ouvert, largeur + ' px : Personnel replié d\'un nouvel appui');

    // Réouverture : retenu (Mathis décoché), listes repliées.
    await page.click('.impression-modal .f-fermer');
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    e = await etat(page);
    verifier(e.personnel.coche && e.personnel.compte === '2 / 3' && !e.personnel.ouvert && e.personnes.join() === 'Lionel,Antoine,Béton/Armature,Echafaudage',
      largeur + ' px : réouverture — réglages retenus, listes repliées');
    await page.click('.impr-reglages summary');
    await page.click('[data-r="personnel"]');
    await page.click('.impr-reglages .f-reinit');
    e = await etat(page);
    verifier(e.personnel.coche && e.personnel.compte === '3 / 3' && e.personnes.length === 5, largeur + ' px : Réinitialiser recoche Personnel et tout le monde');
    if (largeur === 360) {
      const deborde = await page.evaluate(() => { const m = document.querySelector('.impr-reglages'); return m.scrollWidth > m.clientWidth + 1; });
      verifier(!deborde, '360 px : panneau sans défilement horizontal');
    }
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
