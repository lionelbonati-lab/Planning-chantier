const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 30) — Lionel, capture de son aperçu
// d'impression à l'appui : « Verife encore la construction des bordures.
// Optimise les. » Sur son rendu (Safari/WebKit), les sous-colonnes Aprem
// avaient leurs traits horizontaux amincis ou coupés et un trait matin/aprem
// plein et troué : la case .demi-aprem était en position:relative (support
// d'un masque ::before + d'un pointillé ::after), ce que WebKit peint
// par-dessus les bordures partagées du tableau. Remplacé par une vraie
// bordure pointillée déclarée des 2 côtés de la frontière.
//
// Lancer : node test_suite30.js

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


(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const toutesErreurs = [];
  const { page, erreurs } = await ouvrirPlanning(browser, { viewport: { width: 1100, height: 900 }, bd: bd(4) });
  await page.evaluate(() => openPrintSheet()); await page.waitForTimeout(300);
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(100);

  // --- 1. Plus aucune case positionnée ni pseudo-élément dans le tableau ---
  const struct = await page.evaluate(() => {
    const tout = [...document.querySelectorAll('table.print-table, table.print-table *')];
    return {
      positionnes: tout.filter((e) => getComputedStyle(e).position !== 'static').map((e) => e.tagName + '.' + e.className),
      pseudos: tout.filter((e) => getComputedStyle(e, '::before').content !== 'none' || getComputedStyle(e, '::after').content !== 'none').length
    };
  });
  verifier(struct.positionnes.length === 0, 'aucun élément positionné dans le tableau imprimé (' + JSON.stringify(struct.positionnes.slice(0, 3)) + ')');
  verifier(struct.pseudos === 0, 'aucun ::before/::after dans le tableau imprimé (' + struct.pseudos + ')');

  // --- 2. Frontière matin/aprem : pointillé 1px déclaré des 2 côtés ---
  const cotes = await page.evaluate(() => {
    const m = [...document.querySelectorAll('table.print-table .demi-matin')], a = [...document.querySelectorAll('table.print-table .demi-aprem')];
    const ok = (e, cote) => { const c = getComputedStyle(e); return c['border' + cote + 'Style'] === 'dotted' && c['border' + cote + 'Width'] === '1px'; };
    return { nm: m.length, na: a.length, m: m.every((e) => ok(e, 'Right')), a: a.every((e) => ok(e, 'Left')), voisins: a.every((e) => e.previousElementSibling && e.previousElementSibling.classList.contains('demi-matin')) };
  });
  verifier(cotes.nm === cotes.na && cotes.nm >= 10 && cotes.m && cotes.a, 'chaque case matin a sa droite en pointillé 1px, chaque case aprem sa gauche (' + JSON.stringify(cotes) + ')');
  verifier(cotes.voisins, 'chaque case aprem suit directement sa case matin');

  // --- 3. Au pixel : pointillé sur la frontière, traits horizontaux continus ---
  const S = 3;
  const geo = await page.evaluate(() => {
    const tb = document.querySelector('table.print-table').getBoundingClientRect();
    const m = document.querySelector('tr.print-demis .demi-matin').getBoundingClientRect();
    const a = document.querySelector('tr.print-demis .demi-aprem').getBoundingClientRect();
    const mathis = [...document.querySelectorAll('table.print-table tbody tr')].find((r) => r.textContent.startsWith('Mathis')).getBoundingClientRect();
    const hor = document.querySelector('tr.print-horaires').getBoundingClientRect();
    return { x: tb.x - 4, y: tb.y - 4, width: tb.width + 8, height: tb.height + 8, frontiere: a.x, aprem: [a.x + 3, a.right - 3], ligneDemis: a.bottom, ligneHoraires: hor.bottom, mathis: [mathis.y + 4, mathis.bottom - 4], horaires: [hor.y + 4, hor.bottom - 4] };
  });
  const cdp = await page.context().newCDPSession(page);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: geo.x, y: geo.y, width: geo.width, height: geo.height, scale: S }, captureBeyondViewport: true });
  const mesures = await page.evaluate(async ({ data, geo, S }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const sombre = (x, y) => { const i = (y * c.width + x) * 4; return d[i] + d[i + 1] + d[i + 2] < 200; };
    const X = (v) => Math.round((v - geo.x) * S), Y = (v) => Math.round((v - geo.y) * S);
    // Colonne de pixels la plus sombre autour de la frontière (le trait fait 3 px de large).
    const pointille = (y0, y1) => {
      let meilleur = null;
      for (let x = X(geo.frontiere) - 4; x <= X(geo.frontiere) + 4; x++) {
        const runs = []; let deb = -1, n = 0;
        for (let y = Y(y0); y <= Y(y1); y++) { const s = sombre(x, y); if (s) n++; if (s && deb < 0) deb = y; if (!s && deb >= 0) { runs.push(y - deb); deb = -1; } }
        if (deb >= 0) runs.push(Y(y1) + 1 - deb);
        if (!meilleur || n > meilleur.n) meilleur = { n, runs, total: Y(y1) - Y(y0) + 1 };
      }
      return { points: meilleur.runs.length, plusLong: Math.max(...meilleur.runs), couverture: Math.round(100 * meilleur.n / meilleur.total) };
    };
    // Trait horizontal sous la ligne donnée, sur toute la largeur de la sous-colonne Aprem.
    const continu = (yLigne) => {
      for (let dy = -4; dy <= 4; dy++) { const y = Y(yLigne) + dy; let ok = true; for (let x = X(geo.aprem[0]); x <= X(geo.aprem[1]); x++) if (!sombre(x, y)) { ok = false; break; } if (ok) return true; }
      return false;
    };
    return { mathis: pointille(geo.mathis[0], geo.mathis[1]), horaires: pointille(geo.horaires[0], geo.horaires[1]), sousAprem: continu(geo.ligneDemis), sousHoraires: continu(geo.ligneHoraires) };
  }, { data: shot.data, geo, S });
  const estPointille = (p) => p.points >= 4 && p.plusLong <= 5 && p.couverture >= 30 && p.couverture <= 70;
  verifier(estPointille(mesures.mathis), 'ligne Mathis : frontière matin/aprem en pointillé, ni plein ni absent (' + JSON.stringify(mesures.mathis) + ')');
  verifier(estPointille(mesures.horaires), 'ligne Horaires : idem (' + JSON.stringify(mesures.horaires) + ')');
  verifier(mesures.sousAprem && mesures.sousHoraires, 'traits horizontaux continus sous « APREM » et sous l\'horaire de l\'après-midi (' + JSON.stringify([mesures.sousAprem, mesures.sousHoraires]) + ')');

  toutesErreurs.push(...erreurs);
  await page.close();
  await browser.close();
  process.exitCode = bilan(toutesErreurs);
})();
