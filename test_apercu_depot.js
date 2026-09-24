const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 13) — Lionel, capture sur tablette à l'appui :
// « J'ai encore un souci au niveau des cases de sélection. Elles ne
// correspondent pas à la bulle sélectionnée. les rectangles bleus sur les
// cases ». Pendant un glisser au doigt d'une bulle "mardi matin -> mercredi
// matin", l'aperçu de dépôt surlignait mardi matin et mercredi matin, deux
// cases disjointes, sans le mardi après-midi ; et l'aperçu comme le dépôt
// tombaient un jour derrière le doigt.
//
// Vérifie, date figée au jeudi 24.09.2026, contre un faux Supabase :
//   1) tablette, au doigt : pendant le glisser d'un jour vers la droite,
//      UN seul rectangle d'aperçu (.survol-precis), aucune case isolée
//      (.drop-hover), aux colonnes exactes de la bulle après dépôt ; la
//      bulle suit le doigt (mercredi matin -> jeudi matin), table relue ;
//   2) au doigt, vers la ligne d'une autre personne : aperçu sur SA ligne,
//      bulle déposée là, aux mêmes colonnes ;
//   3) souris, glisser groupé (Ctrl+clic) : un rectangle par bulle, chacun
//      sur la ligne de sa bulle, aux colonnes de la bulle après dépôt ;
//   4) souris, bulle seule : toujours l'aperçu précis à la demi-journée.
//
// Lancer : node test_apercu_depot.js

const FAUX_SUPABASE = '(' + function () {
  var BD = window.__BD = {
    personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }],
    chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }],
    statuts: [], feries: [], categories_feries: [], couleurs_perso: [], assignations: [], jalons: [], notes: [], series: [],
    taches: (window.__TACHES_INITIALES || []).map(function (t, i) { return Object.assign({ id: i + 1 }, t); })
  };
  var prochainId = 1000;
  function requete(table) {
    var filtres = [], mode = 'select', valeurs = null;
    var q = {
      select: function () { return q; },
      insert: function (v) { mode = 'insert'; valeurs = Array.isArray(v) ? v : [v]; return q; },
      update: function (v) { mode = 'update'; valeurs = v; return q; },
      delete: function () { mode = 'delete'; return q; },
      upsert: function (v) { mode = 'insert'; valeurs = Array.isArray(v) ? v : [v]; return q; },
      eq: function (c, v) { filtres.push(function (r) { return r[c] === v; }); return q; },
      neq: function (c, v) { filtres.push(function (r) { return r[c] !== v; }); return q; },
      gte: function (c, v) { filtres.push(function (r) { return r[c] >= v; }); return q; },
      lte: function (c, v) { filtres.push(function (r) { return r[c] <= v; }); return q; },
      in: function (c, v) { filtres.push(function (r) { return v.indexOf(r[c]) >= 0; }); return q; },
      order: function () { return q; }, limit: function () { return q; },
      single: function () { return q; }, maybeSingle: function () { return q; },
      then: function (ok, ko) {
        var t = BD[table] = BD[table] || [];
        var garde = function (r) { return filtres.every(function (f) { return f(r); }); };
        var data;
        if (mode === 'insert') { data = valeurs.map(function (v) { var r = Object.assign({ id: prochainId++ }, v); t.push(r); return r; }); }
        else if (mode === 'delete') { data = t.filter(garde); BD[table] = t.filter(function (r) { return !garde(r); }); }
        else if (mode === 'update') { data = t.filter(garde); data.forEach(function (r) { Object.assign(r, valeurs); }); }
        else data = t.filter(garde).map(function (r) { return Object.assign({}, r); });
        return Promise.resolve({ data: data, error: null, count: data.length }).then(ok, ko);
      }
    };
    return q;
  }
  window.supabase = { createClient: function () {
    return {
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: { user: { email: 'test@local' } } } }); },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        signOut: function () { return Promise.resolve({}); }
      },
      from: requete,
      functions: { invoke: function () { return Promise.resolve({ data: {}, error: null }); } },
      channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; } }; return c; },
      removeChannel: function () {}
    };
  } };
} + ')();';

function lignes(date, demi, texte, extra) {
  return Object.assign({ personne_id: 1, date: date, demi: demi, ordre: 0, texte: texte, statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: 1 }, extra || {});
}


(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.addInitScript(({ taches }) => { window.__TACHES_INITIALES = taches; }, {
    taches: [
      // Dalle : mardi matin -> mercredi matin (3 demi-journées), Lionel.
      lignes('2026-09-22', 'matin', 'Dalle'), lignes('2026-09-22', 'aprem', 'Dalle'), lignes('2026-09-23', 'matin', 'Dalle'),
      // Enduit : lundi après-midi seul, Mathis.
      lignes('2026-09-21', 'aprem', 'Enduit', { personne_id: 2 })
    ]
  });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForSelector('#legendeBarre');
  await page.waitForTimeout(400);

  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }
  const attendreSync = () => page.waitForTimeout(700);
  const forme = (texte) => page.evaluate((tx) => { const t = TACHES.find((x) => x.texte === tx); return t ? [t.giDebut, t.duree, t.demiDebut, t.demiFin].join('/') : null; }, texte);
  const bd = (texte) => page.evaluate((tx) => window.__BD.taches.filter((t) => t.texte === tx).map((t) => t.personne_id + ':' + t.date.slice(5) + ':' + t.demi).sort().join(' '), texte);
  const boite = (texte) => page.locator('.grille .bulle:has-text("' + texte + '")').first().boundingBox();
  // Position de la bulle dans la grille : colonnes, et 1re ligne (piste).
  const placeBulle = (texte) => page.evaluate((tx) => {
    const b = Array.from(document.querySelectorAll('.grille .bulle')).find((x) => x.textContent.trim() === tx);
    return b ? { col: b.style.gridColumn, ligne: parseInt(b.style.gridRow, 10) } : null;
  }, texte);
  // Aperçu affiché : rectangles .survol-precis et cases .drop-hover.
  const apercu = () => page.evaluate(() => ({
    precis: Array.from(document.querySelectorAll('.survol-precis')).map((el) => {
      const m = /^(\d+)(?:\s*\/\s*span\s+(\d+))?/.exec(el.style.gridRow);
      return { col: el.style.gridColumn, debut: +m[1], fin: +m[1] + (+m[2] || 1) };
    }),
    cases: document.querySelectorAll('.cell.drop-hover').length
  }));
  const dansLigne = (place, p) => place && place.ligne >= p.debut && place.ligne < p.fin;
  const largeurJour = await page.evaluate(() => {
    const c = (j) => document.querySelector('.cell[data-kind="personne"][data-personne="1"][data-jour="' + j + '"][data-demi="matin"]').getBoundingClientRect();
    return c(2).left - c(1).left;
  });
  const cdp = await page.context().newCDPSession(page);
  // Glisser au doigt : posé, 350 ms (glisser armé à 300 ms, avant l'appui
  // long de 450 ms), puis déplacé en 8 pas ; l'aperçu est relevé doigt
  // encore posé, puis le doigt est levé.
  async function glisserDoigt(x0, y0, x1, y1, capture) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    await page.waitForTimeout(350);
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 8, y: y0 + (y1 - y0) * i / 8 }] });
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(80);
    const a = await apercu();
    if (capture) await page.screenshot({ path: capture });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await attendreSync();
    return a;
  }
  async function glisserSouris(x0, y0, x1, y1) {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await page.waitForTimeout(30); }
    await page.waitForTimeout(80);
    const a = await apercu();
    await page.mouse.up();
    await attendreSync();
    return a;
  }

  // 1) Au doigt, d'un jour vers la droite, pressée au milieu (mardi
  //    après-midi).
  let b = await boite('Dalle');
  let a = await glisserDoigt(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2 + largeurJour, b.y + b.height / 2, process.env.CAPTURE || null);
  let place = await placeBulle('Dalle');
  verifier(a.precis.length === 1 && a.cases === 0, 'au doigt : un seul rectangle d\'aperçu, aucune case isolée (' + a.precis.length + ' rectangle(s), ' + a.cases + ' case(s))');
  verifier(await forme('Dalle') === '2/2//matin', 'la bulle suit le doigt : mercredi matin -> jeudi matin (' + await forme('Dalle') + ')');
  verifier(a.precis.length === 1 && a.precis[0].col === place.col && dansLigne(place, a.precis[0]), 'aperçu aux colonnes exactes de la bulle déposée (' + (a.precis[0] || {}).col + ' / bulle ' + place.col + ')');
  verifier(await bd('Dalle') === '1:09-23:aprem 1:09-23:matin 1:09-24:matin', 'table taches relue : ' + await bd('Dalle'));

  // 2) Au doigt, vers la ligne de Mathis, même jour.
  b = await boite('Dalle');
  const yMathis = await page.evaluate(() => { const r = document.querySelector('.cell[data-kind="personne"][data-personne="2"][data-jour="3"][data-demi="matin"]').getBoundingClientRect(); return r.top + r.height / 2; });
  a = await glisserDoigt(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2, yMathis);
  place = await placeBulle('Dalle');
  verifier(a.precis.length === 1 && a.cases === 0 && a.precis[0].col === place.col && dansLigne(place, a.precis[0]), 'au doigt vers Mathis : aperçu sur sa ligne, aux colonnes de la bulle déposée');
  verifier(await bd('Dalle') === '2:09-23:aprem 2:09-23:matin 2:09-24:matin', 'Dalle passée à Mathis, mêmes demi-journées : ' + await bd('Dalle'));

  // 3) Souris, glisser groupé : Dalle et Enduit (Ctrl+clic), un jour à
  //    droite.
  await page.keyboard.press('Escape');
  await page.click('.grille .bulle:has-text("Dalle")', { modifiers: ['Control'] });
  await page.click('.grille .bulle:has-text("Enduit")', { modifiers: ['Control'] });
  await page.waitForTimeout(100);
  b = await boite('Dalle');
  a = await glisserSouris(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2 + largeurJour, b.y + b.height / 2);
  const placeD = await placeBulle('Dalle'), placeE = await placeBulle('Enduit');
  verifier(await forme('Dalle') === '3/2//matin' && await forme('Enduit') === '1/1/aprem/aprem', 'glisser groupé : Dalle et Enduit avancent d\'un jour (' + await forme('Dalle') + ' ; ' + await forme('Enduit') + ')');
  const trouve = (place) => a.precis.some((p) => p.col === place.col && dansLigne(place, p));
  verifier(a.precis.length === 2 && a.cases === 0 && trouve(placeD) && trouve(placeE), 'glisser groupé : un rectangle par bulle, chacun là où sa bulle est déposée (' + JSON.stringify(a.precis) + ')');

  // 4) Souris, bulle seule : aperçu précis à la demi-journée, inchangé.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  b = await boite('Enduit');
  a = await glisserSouris(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2 + largeurJour / 2, b.y + b.height / 2);
  place = await placeBulle('Enduit');
  verifier(await forme('Enduit') === '2/1/matin/matin' && a.precis.length === 1 && a.precis[0].col === place.col, 'souris, bulle seule : demi-journée suivante (' + await forme('Enduit') + '), aperçu précis aux colonnes de la bulle');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
