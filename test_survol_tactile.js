const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Round du 24.09.2026 (suite 18) — Lionel : « En mode tactile le bouton
// appuyé reste en surbrillance blanche, comme au passage de la souris ».
// Au doigt, le navigateur garde le "pointeur" là où l'on a appuyé : le
// bouton reste :hover jusqu'au prochain appui ailleurs. Vérifie :
//   - téléphone (390px) et tablette (820px), tactiles : après un appui, le
//     bouton est bien encore :hover (l'état qui posait problème), mais son
//     fond est celui d'avant l'appui — barre (Aujourd'hui, calendrier,
//     ⋮ ouvert puis refermé), menu ⋮ (zoom −/+, ‹) ;
//   - ordinateur (1300px, souris) : le survol colore toujours les boutons ;
//   - style.css/style-mobile.css : toute règle :hover est sous
//     `@media (hover: hover) and (pointer: fine)` (garde pour les
//     prochaines).
//
// Lancer : node test_survol_tactile.js

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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const erreurs = [];
  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }
  async function nouvellePage(options) {
    const p = await browser.newPage(options);
    p.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
    await p.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
    await p.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await p.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
    await p.addInitScript(() => {
      window.__TACHES_INITIALES = [];
      HTMLInputElement.prototype.showPicker = function () {};
    });
    await p.goto('file://' + path.join(__dirname, 'index.html'));
    await p.waitForSelector('#legendeBarre');
    await p.waitForTimeout(500);
    return p;
  }
  const fond = (page, sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    return { fond: getComputedStyle(el).backgroundColor, survol: el.matches(':hover') };
  }, sel);
  // Appui(s) sur `cible` (sélecteur appuyé), fond relevé sur `bouton`
  // avant/après : même fond attendu, alors que le bouton est :hover.
  async function appuyer(page, bouton, cible, fois, libelle) {
    const avant = await fond(page, bouton);
    for (let i = 0; i < fois; i++) { await page.tap(cible || bouton); await page.waitForTimeout(250); }
    const apres = await fond(page, bouton);
    verifier(apres.survol && apres.fond === avant.fond, libelle + ' : pas de surbrillance après l\'appui (' + avant.fond + ' → ' + apres.fond + (apres.survol ? ', :hover' : ', PAS :hover') + ')');
  }

  // 1) Téléphone.
  let page = await nouvellePage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  verifier(await page.evaluate(() => !matchMedia('(hover: hover)').matches && !matchMedia('(pointer: fine)').matches), 'téléphone simulé : hover: none, pointer: coarse');
  await appuyer(page, '#btnAujourdhui', null, 1, 'téléphone, Aujourd\'hui');
  await appuyer(page, '#btnCalendrierBarre', '#btnCalendrierBarre .date-picker-jour', 1, 'téléphone, calendrier');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await appuyer(page, '#btnPlusOutils', null, 2, 'téléphone, ⋮ ouvert puis refermé');
  await page.tap('#btnPlusOutils');
  await page.waitForTimeout(250);
  const zoom = await page.evaluate(() => { const b = document.querySelectorAll('#toolbarSecondaire .zoom-btn'); return b.length; });
  verifier(zoom >= 2, 'téléphone : zoom −/+ dans le menu ⋮');
  await appuyer(page, '#toolbarSecondaire .zoom-btn:last-of-type', null, 1, 'téléphone, zoom + (menu ⋮)');
  await appuyer(page, '#toolbarSecondaire .zoom-btn', null, 1, 'téléphone, zoom − (menu ⋮)');
  await appuyer(page, '#btnSemainePrec', null, 1, 'téléphone, semaine précédente (menu ⋮)');
  await page.close();

  // 2) Tablette.
  page = await nouvellePage({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  await appuyer(page, '#btnAujourdhui', null, 1, 'tablette, Aujourd\'hui');
  await appuyer(page, '#btnSemaineSuiv', null, 1, 'tablette, semaine suivante');
  await page.close();

  // 3) Ordinateur : le survol à la souris colore toujours.
  page = await nouvellePage({ viewport: { width: 1300, height: 800 } });
  for (const [sel, nom] of [['#btnAujourdhui', 'Aujourd\'hui'], ['#btnCalendrierBarre', 'calendrier'], ['#btnSemainePill', 'pilule Sem. N'], ['#btnSemaineSuiv', 'semaine suivante']]) {
    await page.mouse.move(5, 790);
    await page.waitForTimeout(100);
    const avant = await fond(page, sel);
    await page.hover(sel);
    await page.waitForTimeout(150);
    const apres = await fond(page, sel);
    verifier(apres.survol && apres.fond !== avant.fond, 'ordinateur, survol de ' + nom + ' : ' + avant.fond + ' → ' + apres.fond);
  }
  await page.close();

  // 4) Toute règle :hover des feuilles de style est sous le @media.
  const nues = [];
  for (const f of ['style.css', 'style-mobile.css']) {
    const texte = fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    texte.split('\n').forEach((l, i) => {
      if (l.indexOf(':hover') < 0) return;
      const m = l.indexOf('@media (hover: hover) and (pointer: fine) {');
      if (m < 0 || m > l.indexOf(':hover')) nues.push(f + ':' + (i + 1));
    });
  }
  verifier(!nues.length, 'feuilles de style : aucune règle :hover hors de @media (hover: hover) and (pointer: fine)' + (nues.length ? ' — ' + nues.join(', ') : ''));

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
