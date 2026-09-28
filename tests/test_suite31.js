const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 31) — Lionel : « Ajoute un trait fin autour
// des statuts à l'impression. »
//
// Lancer : node test_suite31.js

const h = (id, du, au, md, mf, ad, af) => ({ id, date_debut: du, date_fin: au, matin_debut: md + ':00', matin_fin: mf + ':00', aprem_debut: ad ? ad + ':00' : null, aprem_fin: af ? af + ':00' : null, pause_matin: 15 });
const t = (id, p, date, demi, texte, ch, extra) => Object.assign({ id, personne_id: p, date, demi, ordre: 0, texte, statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: ch }, extra || {});
const bd = (nbPersonnes) => {
  const personnes = [
    { id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true },
    { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true },
    { id: 3, nom: 'Antoine', sous_traitant: false, ordre: 3, actif: true },
    { id: 4, nom: 'Électricien', sous_traitant: true, ordre: 99, actif: true }
  ];
  const autres = [];
  // Une tâche chacun : une personne sans rien de la semaine n'est pas imprimée.
  for (let i = 5; i <= nbPersonnes; i++) {
    personnes.push({ id: i, nom: 'Ouvrier ' + i, sous_traitant: false, ordre: i, actif: true });
    autres.push(t(100 + i, i, '2026-09-2' + (1 + i % 4), i % 2 ? 'matin' : 'aprem', 'Tâche ' + i, 1 + i % 2));
  }
  return {
    personnes,
    chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }, { id: 2, nom: '26190 - Villa', couleur: '#b9d4f2', actif: true, ordre: 2 }],
    horaires: [h(1, '2026-09-21', '2026-09-23', '07:00', '12:00', '13:00', '17:15'), h(2, '2026-09-24', '2026-09-24', '07:00', '10:15', null, null)],
    taches: [
      t(1, 1, '2026-09-21', 'matin', 'Coffrage', 1), t(2, 1, '2026-09-21', 'aprem', 'Coffrage', 1),
      t(3, 1, '2026-09-22', 'matin', 'Coffrage', 1), t(4, 1, '2026-09-22', 'aprem', 'Maçonnerie', 2),
      t(5, 2, '2026-09-23', 'matin', 'Rhabillages', 1), t(6, 2, '2026-09-23', 'matin', 'Maçonnerie', 2, { ordre: 1 }), t(7, 2, '2026-09-23', 'aprem', 'Maçonnerie', 2),
      t(8, 3, '2026-09-24', 'matin', 'Vacances', null, { est_absence: true }), t(9, 3, '2026-09-24', 'aprem', 'Vacances', null, { est_absence: true }),
      t(10, 4, '2026-09-25', 'matin', 'Tableau', 2)
    ].concat(autres),
    jalons: [{ id: 1, date: '2026-09-22', texte: 'Béton', serie_id: null, demi: null, chantier_id: 1, important: false }, { id: 2, date: '2026-09-23', texte: 'Béton', serie_id: null, demi: null, chantier_id: 1, important: false }],
    notes: [{ id: 1, date: '2026-09-23', texte: 'Livraison grue', important: true, serie_id: null, demi: null }]
  };
};

const STATUTS = [{ id: 1, cle: 'confirme', nom: 'Confirmé', couleur: '#cdeccb', ordre: 1 }, { id: 2, cle: 'reserve', nom: 'Réservé', couleur: '#f7e6ab', ordre: 2 }];

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const donnees = bd(4);
  donnees.statuts = STATUTS;
  // L'Électricien (intervenant) : un statut par demi-journée, sur 2 chantiers.
  donnees.taches.push(t(20, 4, '2026-09-24', 'matin', 'Armature dalle', 1, { statut_id: 1 }), t(21, 4, '2026-09-24', 'aprem', 'Tubage', 2, { statut_id: 2 }));
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1100, height: 900 }, bd: donnees });
  await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(100);

  const pastilles = await page.evaluate(() => [...document.querySelectorAll('table.print-table .print-statut')].map((e) => {
    const c = getComputedStyle(e), r = e.getBoundingClientRect();
    return { txt: e.textContent, bord: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor, pareil: ['Top', 'Right', 'Bottom', 'Left'].every((k) => c['border' + k + 'Width'] === '1px' && c['border' + k + 'Style'] === 'solid'), h: r.height, w: r.width, x: r.x, y: r.y };
  }));
  verifier(pastilles.length === 2 && pastilles.every((p) => p.pareil), 'les 2 statuts ont un trait plein de 1px sur leurs 4 côtés (' + pastilles.map((p) => p.txt + ' : ' + p.bord).join(' ; ') + ')');
  verifier(pastilles.every((p) => p.bord.endsWith('rgb(26, 33, 41)')), 'trait dans l\'encre de la grille à l\'impression (#1a2129)');
  // Même taille qu'avant le trait : 1px de padding en moins de chaque côté.
  const tailleAvant = await page.evaluate(() => {
    const e = document.querySelector('table.print-table .print-statut');
    e.style.border = 'none'; e.style.padding = '1px 6px';
    const r = e.getBoundingClientRect(); e.style.border = ''; e.style.padding = '';
    return { h: r.height, w: r.width };
  });
  verifier(Math.abs(tailleAvant.h - pastilles[0].h) < 0.01 && Math.abs(tailleAvant.w - pastilles[0].w) < 0.01, 'la pastille garde exactement sa taille d\'avant (' + JSON.stringify(tailleAvant) + ' / ' + pastilles[0].w + '×' + pastilles[0].h + ')');

  // Au pixel : le contour est sombre en haut, en bas, à gauche et à droite.
  const S = 4, p0 = pastilles[0];
  const cdp = await page.context().newCDPSession(page);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: p0.x - 2, y: p0.y - 2, width: p0.w + 4, height: p0.h + 4, scale: S }, captureBeyondViewport: true });
  const contour = await page.evaluate(async ({ data, S, w, h }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const sombre = (x, y) => { const i = (Math.round(y) * c.width + Math.round(x)) * 4; return d[i] + d[i + 1] + d[i + 2] < 250; };
    const cx = (2 + w / 2) * S, cy = (2 + h / 2) * S;
    const cherche = (x0, y0, dx, dy) => { for (let k = 0; k < 4 * S; k++) if (sombre(x0 + dx * k, y0 + dy * k)) return true; return false; };
    return { haut: cherche(cx + 6 * S, 2 * S - 2, 0, 1), bas: cherche(cx + 6 * S, (2 + h) * S + 1, 0, -1), gauche: cherche(2 * S - 2, cy, 1, 0), droite: cherche((2 + w) * S + 1, cy, -1, 0) };
  }, { data: shot.data, S, w: p0.w, h: p0.h });
  verifier(contour.haut && contour.bas && contour.gauche && contour.droite, 'au pixel, le trait fait tout le tour de la pastille (' + JSON.stringify(contour) + ')');

  toutesErreurs.push(...erreurs);
  await page.close();
  await browser.close();
  process.exitCode = bilan(toutesErreurs);
})();
