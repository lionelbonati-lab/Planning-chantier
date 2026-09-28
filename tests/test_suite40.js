const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 40) — Lionel, capture de l'aperçu d'impression
// sur téléphone à l'appui : « La page sur l'aperçu avant impression est
// dessinée à la largeur de l'écran, tandis que la grille est dessinée
// correctement. Réglages Toujours fermés à l'ouverture. Descendre les
// réglage sous l'aperçu. Comme le bouton imprimer. »
//
// Lancer : node test_suite40.js

const T = (id, pid, date, demi, texte) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: 1, statut_id: null });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(3, 'Antoine', 3), P(4, 'Béton/Armature', 4, 1)],
  chantiers: [{ id: 1, nom: '26028 - Filisetti', couleur: '#f7c6b0', actif: true, ordre: 1 }],
  statuts: [],
  taches: [T(1, 1, '2026-09-21', 'matin', "Douilles d'ancrages Diwidag"), T(2, 2, '2026-09-21', 'matin', '80%'), T(3, 3, '2026-09-21', 'matin', 'Coffrage muret extension'),
    T(4, 4, '2026-09-21', 'aprem', 'Armature dalle inférieure')]
};
const mesure = (page) => page.evaluate(() => {
  const m = document.querySelector('.impression-modal'), d = document.querySelector('.print-doc').getBoundingClientRect(), t = document.querySelector('.print-table').getBoundingClientRect();
  const e = document.querySelector('.impr-entete-ecran');
  return { ordre: [...m.children].map((c) => c.className.split(' ')[0]).join(), ouvert: document.querySelector('.impr-reglages').open,
    carte: Math.round(d.width), tableau: Math.round(t.width), contientTableau: d.left <= t.left && d.right >= t.right,
    fenetre: m.clientWidth, entete: e ? Math.round(e.getBoundingClientRect().height) : null };
});

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  for (const [largeur, tel] of [[360, true], [1300, false]]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 800 }, hasTouch: tel, bd: BD,
      localStorage: { 'planning.chantierParDefaut': '26028 - Filisetti' } });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    const m = await mesure(page);
    // Suite 48 : choix Période / Pour (.impr-periode) entre le titre et l'aperçu.
    verifier(m.ordre === 'cp-titre,impr-periode,print-doc,impr-reglages,impression-actions', largeur + ' px : aperçu, puis Réglages, puis Fermer / Imprimer (' + m.ordre + ')');
    verifier(m.ouvert === false, largeur + ' px : Réglages repliés à l\'ouverture');
    if (tel) {
      verifier(m.contientTableau && m.tableau > m.fenetre, '360 px : la page de l\'aperçu suit la grille, plus large que l\'écran (carte ' + m.carte + ' px, grille ' + m.tableau + ' px, écran ' + m.fenetre + ' px)');
      verifier(m.entete < 20, '360 px : en-tête simulé sur une ligne, à la largeur de la page (' + m.entete + ' px)');
    } else {
      verifier(m.contientTableau && m.carte === m.fenetre - 44, '1300 px : inchangé, page à la largeur de la fenêtre (' + m.carte + ' / ' + m.fenetre + ')');
    }
    await page.click('.impr-reglages summary'); await page.waitForTimeout(300);
    const vu = await page.evaluate(() => {
      const r = document.querySelector('.impr-reglages').getBoundingClientRect(), m = document.querySelector('.impression-modal').getBoundingClientRect();
      return { ouvert: document.querySelector('.impr-reglages').open, visible: r.top >= m.top - 1 && r.top < m.bottom };
    });
    verifier(vu.ouvert && vu.visible, largeur + ' px : déplié, le panneau est amené à l\'écran (' + JSON.stringify(vu) + ')');
    await page.click('[data-r="jalons"]');
    await page.click('.impression-modal .f-fermer');
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ ouvert: document.querySelector('.impr-reglages').open, jalons: document.querySelector('[data-r="jalons"]').checked }));
    verifier(!r.ouvert && !r.jalons, largeur + ' px : réouverture — repliés de nouveau, réglage décoché retenu (' + JSON.stringify(r) + ')');
    await page.emulateMedia({ media: 'print' });
    const papier = await page.evaluate(() => { const d = getComputedStyle(document.querySelector('.print-doc')); return { largeur: d.width, min: d.minWidth }; });
    await page.emulateMedia({ media: 'screen' });
    verifier(papier.min === '0px', largeur + ' px : à l\'impression, la page reprend la largeur du papier (' + JSON.stringify(papier) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exit(bilan(toutesErreurs));
})();
