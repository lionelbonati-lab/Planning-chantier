const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 38) — Lionel : « Améliore la page impression
// pour pouvoir modifier manuellement divers réglages. Afficher ou non
// certaines données. » Ses choix (questions posées) :
//   - masquer/afficher Jalons, Notes, Intervenants, personne par personne ;
//   - Légende des chantiers, Statuts des intervenants, Personnes sans
//     tâche, Couleurs des chantiers (« Si les couleurs sont enlevées,
//     prévoir de noter le nom du chantier ») ;
//   - Orientation, Taille du texte, Titre libre ;
//   - réglages retenus sur l'appareil, bouton Réinitialiser.
// Panneau « Réglages » de l'aperçu (openPrintSheet, js/impression.js).
// Suite 39 : orientation, taille du texte et titre sont partis dans l'onglet
// Mise en page (Lionel : « garde que les réglage à cocher dans la feuille
// impression ») — vérifiés par test_suite39.js ; ici, leur absence.
//
// Lancer : node test_suite38.js

const T = (id, pid, date, demi, texte, ch, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch || 1, statut_id: st || null });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(3, 'Antoine', 3), P(4, 'Béton/Armature', 4, 1), P(5, 'Echafaudage', 5, 1)],
  chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }, { id: 2, nom: '26150 - Villa Bine', couleur: '#bfe0c9', actif: true, ordre: 2 }],
  statuts: [{ id: 1, cle: 'reserve', nom: 'Réservé', couleur: '#f3c6c6', ordre: 1 }],
  taches: [T(1, 1, '2026-09-21', 'matin', 'Gabarits'), T(2, 1, '2026-09-21', 'aprem', 'Gabarits'), T(3, 2, '2026-09-22', 'matin', 'Décoffrage dalle', 2),
    T(4, 4, '2026-09-23', 'matin', 'Livraison armature', 2, 1), T(5, 1, '2026-09-24', 'aprem', 'Congé')],
  jalons: [{ id: 1, date: '2026-09-22', demi: null, texte: 'Murs BA étage' }],
  notes: [{ id: 1, date: '2026-09-23', demi: null, texte: 'Grue' }]
};

// État de l'aperçu : lignes de personnes, sections, légende, statuts, etc.
const apercu = (page) => page.evaluate(() => {
  const doc = document.querySelector('.impression-modal .print-doc');
  const td = doc.querySelector('.print-table td.td-tache');
  return {
    personnes: [...doc.querySelectorAll('.print-table tbody tr:not(.print-spacer):not(.print-jalons):not(.print-notes)')].map((tr) => tr.firstElementChild.textContent),
    jalons: doc.querySelectorAll('tr.print-jalons').length, notes: doc.querySelectorAll('tr.print-notes').length,
    legende: !!doc.querySelector('.print-legend'), statuts: doc.querySelectorAll('.print-statut').length,
    fonds: [...doc.querySelectorAll('.print-bande')].map((b) => b.style.background).filter((b) => b.indexOf('surface-2') < 0),
    chantiers: [...doc.querySelectorAll('.print-chantier')].map((c) => c.textContent),
    police: parseFloat(getComputedStyle(td).fontSize),
    notesBas: [...doc.querySelectorAll('.skip-note')].map((n) => n.textContent),
    page: document.querySelector('.style-page-impression').textContent
  };
});
const coche = (page, sel) => page.evaluate((s) => { const c = document.querySelector(s); return c && { coche: c.checked, grise: c.disabled }; }, sel);
// Panneau replié à chaque ouverture et placé sous l'aperçu (suite 40) :
// déplié avant d'y cliquer.
// Suite 43 : listes Personnel / Intervenants repliées sous leur case
// générale (test_suite43.js) — dépliées elles aussi.
const deplier = async (page) => {
  await page.click('.impr-reglages summary');
  for (const b of await page.$$('.impr-reglages .impr-deplier')) await b.click();
};
const rouvrir = async (page) => {
  await page.click('.impression-modal .f-fermer');
  await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
  await deplier(page);
};

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: BD });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    await deplier(page);

    // --- 1. Par défaut : comme avant ---
    const libelles = await page.evaluate(() => [...document.querySelectorAll('.impr-reglages fieldset')].map((f) => f.textContent.replace(/\s+/g, ' ').trim()));
    verifier(libelles.length === 2 && ['Jalons', 'Notes', 'Légende des chantiers', 'Statuts des intervenants', 'Couleurs des chantiers', 'Personnes sans tâche'].every((l) => libelles[0].includes(l)) &&
      ['Personnel', 'Intervenants'].every((l) => libelles[1].includes(l)),
      'panneau « Réglages » : Afficher / Personnes, rien d\'autre (' + libelles[0] + ')');
    const bas = await page.evaluate(() => ({ selects: document.querySelectorAll('.impr-reglages select, .impr-reglages input[type=text]').length,
      reinit: !!document.querySelector('.impr-reglages .f-reinit'), lien: (document.querySelector('.impr-reglages .impr-lien-mep') || {}).textContent }));
    verifier(bas.selects === 0 && bas.reinit && /Paysage, marges 12 mm — Mise en page ›/.test(bas.lien), 'suite 39 : plus que des cases à cocher, Réinitialiser et un lien vers l\'onglet Mise en page (' + JSON.stringify(bas) + ')');
    let a = await apercu(page);
    verifier(a.personnes.join() === 'Lionel,Mathis,Béton/Armature' && a.jalons === 1 && a.notes === 1 && a.legende && a.statuts === 1 && a.fonds.length === 4,
      'par défaut : jalons, notes, intervenants, légende, statut, couleurs ; personnes sans tâche masquées (' + JSON.stringify(a) + ')');
    verifier(/size: landscape/.test(a.page) && a.police === 11, 'par défaut : paysage, texte 11 px');
    const antoine = await coche(page, '[data-p="3"]');
    verifier(antoine.coche && antoine.grise, 'Antoine (rien cette semaine) : proposé mais grisé tant que « Personnes sans tâche » est décoché');

    // --- 2. Sections ---
    await page.click('[data-r="jalons"]'); await page.click('[data-r="notes"]');
    a = await apercu(page);
    verifier(a.jalons === 0 && a.notes === 0 && a.personnes.join() === 'Lionel,Mathis,Béton/Armature', 'Jalons et Notes décochés : leurs lignes disparaissent, le reste est inchangé');
    await page.click('[data-r="intervenants"]');
    a = await apercu(page);
    verifier(a.personnes.join() === 'Lionel,Mathis' && a.statuts === 0, 'Intervenants décoché : Béton/Armature n\'est plus imprimé');
    verifier((await coche(page, '[data-p="4"]')).grise, 'Intervenants décoché : leurs cases personne par personne sont grisées');
    await page.click('[data-r="intervenants"]');
    await page.click('[data-p="2"]');
    a = await apercu(page);
    verifier(a.personnes.join() === 'Lionel,Béton/Armature' && a.notesBas.some((n) => /1 personne\(s\) décochée\(s\)/.test(n)), 'Mathis décoché : retiré de la feuille, mention à l\'écran (' + a.notesBas.join(' / ') + ')');

    // --- 3. Détails ---
    await page.click('[data-r="statuts"]'); await page.click('[data-r="legende"]');
    a = await apercu(page);
    verifier(a.statuts === 0 && !a.legende, 'Statuts et Légende décochés : ni badge « Réservé » ni légende');
    await page.click('[data-r="legende"]');
    await page.click('[data-r="couleurs"]');
    a = await apercu(page);
    verifier(a.fonds.length === 0, 'Couleurs décochées : plus aucun fond coloré dans les cases (absence comprise)');
    verifier(a.chantiers.join() === '26182 - Terrain de Padel,26150 - Villa Bine', 'sans couleurs : nom du chantier écrit dans chaque case (' + a.chantiers.join(' / ') + ')');
    const leg = await coche(page, '[data-r="legende"]');
    verifier(!a.legende && leg.grise, 'sans couleurs : légende retirée, sa case grisée');
    await page.click('[data-r="vides"]');
    a = await apercu(page);
    verifier(a.personnes.join() === 'Lionel,Antoine,Béton/Armature,Echafaudage', 'Personnes sans tâche : Antoine et Echafaudage imprimés (' + a.personnes.join() + ')');

    // --- 4. À l'impression (orientation, taille, titre : test_suite39.js) ---
    await page.emulateMedia({ media: 'print' });
    const papier = await page.evaluate(() => ({ panneau: getComputedStyle(document.querySelector('.impr-reglages')).display, table: getComputedStyle(document.querySelector('.print-table')).display }));
    await page.emulateMedia({ media: 'screen' });
    verifier(papier.panneau === 'none' && papier.table !== 'none', 'à l\'impression : panneau de réglages masqué, tableau imprimé (' + JSON.stringify(papier) + ')');

    // --- 5. Retenus, puis Réinitialiser ---
    await rouvrir(page);
    a = await apercu(page);
    const r = await page.evaluate(() => ({ jalons: document.querySelector('[data-r="jalons"]').checked, couleurs: document.querySelector('[data-r="couleurs"]').checked,
      mathis: document.querySelector('[data-p="2"]').checked }));
    verifier(!r.jalons && !r.couleurs && !r.mathis && a.jalons === 0 && a.chantiers.length === 2,
      'réouverture : réglages retenus (' + JSON.stringify(r) + ')');
    await page.click('.impr-reglages .f-reinit');
    a = await apercu(page);
    verifier(a.personnes.join() === 'Lionel,Mathis,Béton/Armature' && a.jalons === 1 && a.notes === 1 && a.legende && a.statuts === 1 && a.fonds.length === 4 && a.police === 11 && /landscape/.test(a.page),
      'Réinitialiser : retour aux valeurs par défaut');
    await rouvrir(page);
    a = await apercu(page);
    verifier(a.jalons === 1 && a.notes === 1, 'réinitialisation retenue elle aussi');
    await page.click('.impression-modal .f-fermer');
    verifier(await page.evaluate(() => !document.querySelector('.style-page-impression')), 'fermeture : règle @page de l\'aperçu retirée');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 6. Ancien réglage « horaires » (suite 27) toujours lu ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1300, height: 900 }, bd: Object.assign({}, BD, {
      horaires: [{ id: 1, date_debut: '2026-09-21', date_fin: '2026-09-25', matin_debut: '07:00:00', matin_fin: '12:00:00', aprem_debut: '13:00:00', aprem_fin: '17:00:00', pause_matin: 15 }] }), localStorage: { 'planning.impression.horaires': '0' } });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    const h = await page.evaluate(() => { const c = document.querySelector('.impr-reglages .f-horaires'); return c ? { coche: c.checked, masquee: getComputedStyle(document.querySelector('.print-horaires')).display === 'none' } : 'absente'; });
    verifier(h.coche === false && h.masquee, 'ancienne clé « horaires » (suite 27) décochée : case Horaires du panneau décochée, ligne masquée (' + JSON.stringify(h) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
