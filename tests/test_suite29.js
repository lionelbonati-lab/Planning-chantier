const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 29) — Lionel : « Fait une passe de
// vérification des bordures de l'impression. »
//
// Semaine 39 avec les cas délicats : ligne Horaires (jour matin seul, jour
// sans horaire), jalon fusionné sur 2 jours, note, case à 2 bandes, absence
// fusionnée matin/aprem, frontière Personnel/Intervenants. Puis 24
// personnes en A4 paysage pour la coupure de page.
//
// Lancer : node test_suite29.js

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

// Traits le long d'une verticale (x au milieu de la sous-colonne Ven aprem,
// vide sur toutes les lignes) : [début en px CSS, épaisseur en px écran] à
// l'échelle 3 (1px CSS = 3, 2px CSS = 6), sur l'aperçu en média print.
async function traitsVerticale(page) {
  const S = 3;
  const geo = await page.evaluate(() => {
    const tb = document.querySelector('table.print-table').getBoundingClientRect();
    const c = [...document.querySelectorAll('tr.print-demis th')].pop().getBoundingClientRect();
    return { x: tb.x - 4, y: tb.y - 4, width: tb.width + 8, height: tb.height + 8, cx: c.x + c.width / 2 };
  });
  const cdp = await page.context().newCDPSession(page);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: geo.x, y: geo.y, width: geo.width, height: geo.height, scale: S }, captureBeyondViewport: true });
  return page.evaluate(async ({ data, geo, S }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const x = Math.round((geo.cx - geo.x) * S), px = g.getImageData(x, 0, 1, c.height).data;
    const r = []; let deb = -1;
    for (let y = 0; y <= c.height; y++) { const s = y < c.height && px[y * 4] + px[y * 4 + 1] + px[y * 4 + 2] < 200; if (s && deb < 0) deb = y; if (!s && deb >= 0) { r.push([Math.round(deb / S), y - deb]); deb = -1; } }
    return r;
  }, { data: shot.data, geo, S });
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];

  // --- 1. Une semaine, une page : épaisseur de chaque trait ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1100, height: 900 }, bd: bd(4) });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(300);
    await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(100);
    const traits = await traitsVerticale(page);
    const ep = traits.map((x) => x[1]).join(',');
    // Cadre haut 2px ; mois|jours, jours|demis, demis|horaires, horaires|jalons 1px ;
    // bas des jalons 2px ; puis chaque personne encadrée 2px en haut et en bas.
    verifier(ep === '6,3,3,3,3,6,6,6,6,6,6,6,6,6', 'épaisseurs des traits horizontaux, de haut en bas : ' + ep);
    const ecart = (i) => traits[i + 1][0] - traits[i][0];
    verifier(ecart(7) === 6 && ecart(9) === 6 && ecart(11) === 14, 'écart entre 2 personnes 6px, 14px entre Personnel et Intervenants — comme avant la coupe des spacers (' + [ecart(7), ecart(9), ecart(11)].join(', ') + ')');
    const spacers = await page.evaluate(() => [...document.querySelectorAll('table.print-table tbody tr')].map((r) => r.classList.contains('print-spacer-fin') ? 'F' : r.classList.contains('print-spacer-personne') ? 'P' : r.classList.contains('print-spacer') ? 'S' : r.classList.contains('print-jalons') ? 'J' : r.classList.contains('print-notes') ? 'N' : 'L').join(''));
    verifier(spacers === 'JSNPLFPLFPLFPL', 'spacer entre 2 personnes coupé en 2 demi-lignes (F = fin, P = début de personne) : ' + spacers);
    const coupures = await page.evaluate(() => ({ fin: getComputedStyle(document.querySelector('tr.print-spacer-fin')).breakBefore, debut: getComputedStyle(document.querySelector('tr.print-spacer-personne')).breakAfter }));
    verifier(coupures.fin === 'avoid' && coupures.debut === 'avoid', 'à l\'impression, la demi-ligne du bas suit la personne du dessus, celle du haut la personne du dessous (' + JSON.stringify(coupures) + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  // --- 2. 24 personnes en A4 : le PDF a toutes ses pages ---
  {
    const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1100, height: 900 }, bd: bd(24) });
    await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(300);
    await page.emulateMedia({ media: 'print' });
    const racine = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).overflow, body: getComputedStyle(document.body).overflow }));
    verifier(racine.html === 'visible' && racine.body === 'visible', 'à l\'impression, html et body ne rognent plus le document (' + JSON.stringify(racine) + ')');
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    const pages = +(pdf.toString('latin1').match(/\/Count (\d+)/) || [])[1];
    verifier(pages === 2, '24 personnes en A4 paysage : 2 pages (avant : 1 seule, Ouvrier 18 à 24 coupés) (' + pages + ')');
    toutesErreurs.push(...erreurs);
    await page.close();
  }

  await browser.close();
  process.exitCode = bilan(toutesErreurs);
})();
