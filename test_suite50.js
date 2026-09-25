const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 50) — Lionel, capture de son téléphone :
// « Sur téléphone la toolbar déborde. Utilise toutes la largeur de l'écran
// avec le planning et la toolbar ».
// - style-mobile.css : page Planning sans marge latérale, barre en bandeau
//   droit, cadre de la grille sans bordure latérale ;
// - ajusterDebordementToolbar (js/grille-rendu.js) : « À réserver » replié
//   dans « ⋮ » sur téléphone quand il ne tient plus ;
// - largeurVisibleJour : le jour affiché occupe toute la largeur restante.
//
// Lancer : node test_suite50.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const T = (id, pid, date, demi, texte, ch, st) => ({ id, personne_id: pid, date, demi, ordre: 0, texte, chantier_id: ch || 1, statut_id: st || null });
const P = (id, nom, ordre, st) => ({ id, nom, sous_traitant: !!st, equipe: false, ordre, actif: true });
const BD = {
  personnes: [P(1, 'Lionel', 1), P(2, 'Mathis', 2), P(4, 'Béton', 4, 1)],
  chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }],
  statuts: [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }],
  taches: [T(1, 1, '2026-09-24', 'matin', 'Coffrage', 1), T(2, 4, '2026-09-28', 'matin', 'Pompe', 1, 1)]
};
// 12 tâches « à réserver » : compteur à 2 chiffres.
const BD12 = Object.assign({}, BD, { taches: BD.taches.concat(Array.from({ length: 11 }, (_, i) => T(10 + i, 2, '2026-10-' + String(i + 1).padStart(2, '0'), 'matin', 'Nacelle ' + i, 1, 1))) });

function mesurer(page) {
  return page.evaluate(() => {
    const b = document.getElementById('legendeBarre'), rb = b.getBoundingClientRect(), st = getComputedStyle(b);
    const bord = rb.right - parseFloat(st.paddingRight);
    const enfants = [...b.children].filter((c) => c.id !== 'toolbarSecondaire' && c.getBoundingClientRect().width > 0);
    const plusLoin = Math.max(...enfants.map((c) => c.getBoundingClientRect().right));
    const cadre = document.querySelector('#page-planning .grille-cadre').getBoundingClientRect();
    const entete = document.querySelector('#page-planning .entete-planning-scroll').getBoundingClientRect();
    const ar = document.getElementById('groupeAReserver');
    const plus = document.getElementById('btnPlusOutils');
    const cellule = document.querySelector('.entete-planning-figee .th.today');
    return {
      largeur: window.innerWidth, barre: [Math.round(rb.left), Math.round(rb.right)], rayon: st.borderTopLeftRadius,
      deborde: plusLoin > bord + 1, ecart: Math.round(bord - plusLoin),
      cadre: [Math.round(cadre.left), Math.round(cadre.right)], entete: [Math.round(entete.left), Math.round(entete.right)],
      bordureCadre: getComputedStyle(document.querySelector('#page-planning .grille-cadre')).borderLeftWidth,
      aReserverDansBarre: !!ar.closest('#legendeBarre') && !ar.closest('#toolbarSecondaire') && !ar.hidden,
      aReserverDansMenu: !!ar.closest('#toolbarSecondaire'),
      pastilleMenu: getComputedStyle(plus, '::after').content !== 'none' && getComputedStyle(plus, '::after').display !== 'none',
      finJour: cellule ? Math.round(cellule.getBoundingClientRect().right) : null,
      pageDeborde: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  });
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Téléphones : pleine largeur, rien ne dépasse de la barre ---
  const attendus = { 320: false, 360: true, 390: true, 412: true };
  for (const largeur of [320, 360, 390, 412]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 760 }, hasTouch: true, bd: BD });
    await page.waitForTimeout(1800);
    const m = await mesurer(page);
    if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s50-' + largeur + '.png' });
    verifier(m.barre[0] === 0 && m.barre[1] === largeur && m.rayon === '0px', largeur + ' px : barre de bord à bord, sans arrondi (' + JSON.stringify(m.barre) + ', ' + m.rayon + ')');
    verifier(m.cadre[0] === 0 && m.cadre[1] === largeur && m.entete[0] === 0 && m.entete[1] === largeur && m.bordureCadre === '0px',
      largeur + ' px : grille et en-tête de bord à bord (' + JSON.stringify([m.cadre, m.entete, m.bordureCadre]) + ')');
    verifier(!m.deborde && !m.pageDeborde, largeur + ' px : rien ne dépasse de la barre (marge restante ' + m.ecart + ' px)');
    verifier(m.aReserverDansBarre === attendus[largeur] && m.aReserverDansMenu === !attendus[largeur] && m.pastilleMenu === !attendus[largeur],
      largeur + ' px : « À réserver » ' + (attendus[largeur] ? 'dans la barre' : 'replié dans « ⋮ », pastille sur « ⋮ »') + ' (' + JSON.stringify(m) + ')');
    verifier(m.finJour === largeur, largeur + ' px : le jour affiché va jusqu\'au bord droit (' + m.finJour + ')');
    if (!attendus[largeur]) {
      await page.click('#btnPlusOutils');
      await page.waitForTimeout(200);
      await page.click('#btnAReserver');
      await page.waitForTimeout(300);
      verifier(await page.$('.pop-a-reserver') !== null, largeur + ' px : « À réserver » s\'ouvre depuis « ⋮ »');
    }
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. Compteur à 2 chiffres à 360 px : la barre est remesurée ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true, bd: BD12 });
    await page.waitForTimeout(1800);
    const m = await mesurer(page);
    const compte = await page.$eval('#btnAReserver .compte-a-reserver', (e) => e.textContent);
    verifier(compte === '12' && !m.deborde, '360 px, compteur 12 : rien ne dépasse de la barre (' + JSON.stringify({ compte, ecart: m.ecart, dansBarre: m.aReserverDansBarre }) + ')');
    // Texte agrandi (réglage d'accessibilité du téléphone) : la barre se replie.
    await page.addStyleTag({ content: '#legendeBarre .compte-a-reserver { font-size: 22px; } #legendeBarre .toolbar-btn { min-width: 40px; }' });
    await page.evaluate(() => ajusterDebordementToolbar());
    const m2 = await mesurer(page);
    verifier(!m2.deborde && m2.aReserverDansMenu, '360 px, texte agrandi : « À réserver » replié, rien ne dépasse (' + m2.ecart + ' px)');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 3. Tablette et ordinateur inchangés : marges et arrondis gardés ---
  for (const largeur of [820, 1400]) {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: largeur, height: 820 }, bd: BD });
    await page.waitForTimeout(600);
    const m = await mesurer(page);
    verifier(m.barre[0] === 18 && m.barre[1] === largeur - 18 && m.rayon !== '0px' && m.cadre[0] === 18 && m.bordureCadre === '1px' && !m.deborde,
      largeur + ' px : marges de 18 px, pilule et cadre arrondis inchangés (' + JSON.stringify(m) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  verifier(toutesErreurs.length === 0, 'aucune erreur JS (' + toutesErreurs.join(' | ') + ')');
  await browser.close();
  bilan();
})();
