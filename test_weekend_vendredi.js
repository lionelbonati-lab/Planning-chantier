const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Round du 24.09.2026 (suite 23) — Lionel : « en affichant les week-end,
// les bulles du vendredi sont affichés sur le week-end ». Cause : la fin
// d'une bulle était « le début du jour ouvré suivant » ; pour un vendredi,
// c'est le lundi, placé APRÈS les colonnes Samedi/Dimanche (cf.
// spanColonnes, js/grille-rendu.js). Date figée au jeudi 24.09.2026,
// 2 semaines affichées, week-ends affichés puis masqués (seul mode
// d'affichage de la grille, demi-journées côte à côte — l'ancien mode
// « classique » n'existe plus) :
//   - tâche du vendredi 25, jalon du vendredi après-midi, note du vendredi,
//     tâche jeudi → vendredi : bord droit = bord droit du vendredi ;
//   - note vendredi 25 → lundi 28 : traverse bien le week-end jusqu'au
//     lundi ;
//   - week-ends masqués : mêmes bulles, au ras du vendredi.
//
// Lancer : node test_weekend_vendredi.js

const LOGIQUE_PLAGE = fs.readFileSync(path.join(__dirname, 'functions/enregistrer-plage/logic.js'), 'utf8').replace(/export\s*\{[\s\S]*$/, '');
const FAUX_SUPABASE = LOGIQUE_PLAGE + '\n(' + function () {
  var BD = window.__BD = {
    personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }, { id: 3, nom: 'François', sous_traitant: false, ordre: 3, actif: true }],
    chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }],
    statuts: [], feries: [], categories_feries: [], couleurs_perso: [], assignations: [],
    series: [1, 2, 3, 4].map(function (id) { return { id: id }; }),
    jalons: (window.__JALONS_INITIALES || []).map(function (j, i) { return Object.assign({ id: 500 + i }, j); }),
    notes: (window.__NOTES_INITIALES || []).map(function (n, i) { return Object.assign({ id: 700 + i }, n); }),
    taches: (window.__TACHES_INITIALES || []).map(function (t, i) { return Object.assign({ id: i + 1 }, t); })
  };
  var prochainId = 1000;
  function requete(table) {
    var filtres = [], mode = 'select', valeurs = null, plage = null;
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
      range: function (a, b) { plage = [a, b]; return q; },
      single: function () { return q; }, maybeSingle: function () { return q; },
      then: function (ok, ko) {
        var t = BD[table] = BD[table] || [];
        var garde = function (r) { return filtres.every(function (f) { return f(r); }); };
        var data;
        (window.__ECRITURES = window.__ECRITURES || []).push(table + ':' + mode);
        if (mode === 'insert') { data = valeurs.map(function (v) { var r = Object.assign({ id: prochainId++ }, v); t.push(r); return r; }); }
        else if (mode === 'delete') { data = t.filter(garde); BD[table] = t.filter(function (r) { return !garde(r); }); }
        else if (mode === 'update') { data = t.filter(garde); data.forEach(function (r) { Object.assign(r, valeurs); }); }
        else {
          data = t.filter(garde).map(function (r) { return Object.assign({}, r); });
          if (plage) data = data.slice(plage[0], plage[1] + 1);
        }
        var rep = { data: data, error: null, count: data.length }; return new Promise(function (r) { setTimeout(function () { r(rep); }, window.__DELAI || 0); }).then(ok, ko);
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
      functions: { invoke: function (nom, opts) {
        var b = (opts && opts.body) || {};
        (window.__INVOCATIONS = window.__INVOCATIONS || []).push({ nom: nom, body: JSON.parse(JSON.stringify(b)) });
        // enregistrer-plage minimal (1 jour) : retire l'origine, pose le
        // texte — SANS serie_id, comme la vraie fonction.
        if (nom === 'enregistrer-plage') {
          // VRAIE logique serveur (functions/enregistrer-plage/logic.js,
          // injectée ci-dessous) : c'est elle qui effaçait le jalon.
          var t = b.kind === 'jalon' ? 'jalons' : 'notes';
          var plan = planPlage(b, BD[t].map(function (r) { return Object.assign({}, r); }));
          plan.ops.forEach(function (op) {
            var v = Object.assign({}, op); delete v.type; delete v.table;
            if (op.type === 'delete') BD[t] = BD[t].filter(function (r) { return r.id !== op.id; });
            else if (op.type === 'update') { delete v.id; Object.assign(BD[t].find(function (r) { return r.id === op.id; }), v); }
            else BD[t].push(Object.assign({ id: prochainId++, serie_id: null }, v));
          });
        }
        return Promise.resolve({ data: {}, error: null });
      } },
      channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; } }; return c; },
      removeChannel: function () {}
    };
  } };
} + ')();';

function tache(date, demi, texte, extra) {
  return Object.assign({ personne_id: 1, date: date, demi: demi, ordre: 0, texte: texte, statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: 1 }, extra || {});
}
const journee = (date, texte, extra) => [tache(date, 'matin', texte, extra), tache(date, 'aprem', texte, extra)];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 2200, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.addInitScript((d) => { window.__TACHES_INITIALES = d.taches; window.__NOTES_INITIALES = d.notes; window.__JALONS_INITIALES = d.jalons; }, {
    taches: [].concat(journee('2026-09-25', 'Vendredi'), journee('2026-09-24', 'JeuVen', { personne_id: 2 }), journee('2026-09-25', 'JeuVen', { personne_id: 2 })),
    notes: [{ date: '2026-09-25', texte: 'Pont', important: false, serie_id: null, demi: null },
      { date: '2026-09-28', texte: 'Pont', important: false, serie_id: null, demi: null }],
    jalons: [{ date: '2026-09-25', texte: 'JalonAprem', serie_id: null, demi: 'aprem', chantier_id: null, important: false }]
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
  const mesurer = () => page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('.entete-planning-figee .th[data-gi]'));
    const bord = (re) => { const t = ths.find((x) => re.test(x.textContent) && !x.classList.contains('th-weekend') && !x.classList.contains('th-demi')); return t ? Math.round(t.getBoundingClientRect().right) : null; };
    const bulle = (tx) => { const b = Array.from(document.querySelectorAll('.bulle')).find((x) => x.textContent.indexOf(tx) >= 0); return b ? Math.round(b.getBoundingClientRect().right) : null; };
    return { ven: bord(/25/), lun: bord(/28/), Vendredi: bulle('Vendredi'), JeuVen: bulle('JeuVen'), JalonAprem: bulle('JalonAprem'), Pont: bulle('Pont') };
  });
  // 2 semaines affichées : le lundi 28 est dans la fenêtre.
  await page.evaluate(() => basculerDeuxSemaines());
  await page.waitForTimeout(500);
  const proche = (a, b) => a != null && b != null && Math.abs(a - b) <= 3;
  for (const we of [true, false]) {
    await page.evaluate((w) => { afficherWeekends = w; render(false); }, we);
    await page.waitForTimeout(200);
    const m = await mesurer();
    const cadre = 'week-ends ' + (we ? 'affichés' : 'masqués');
    verifier(['Vendredi', 'JeuVen', 'JalonAprem'].every((k) => proche(m[k], m.ven)),
      cadre + ' : bulles du vendredi au ras du vendredi (' + m.ven + ' ; tâche ' + m.Vendredi + ', jeu→ven ' + m.JeuVen + ', jalon ' + m.JalonAprem + ')');
    verifier(proche(m.Pont, m.lun), cadre + ' : note vendredi → lundi jusqu\'au lundi (' + m.Pont + ' / ' + m.lun + ')');
  }

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
