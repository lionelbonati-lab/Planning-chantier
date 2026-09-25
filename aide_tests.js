// Outils communs aux tests Playwright (round du 24.09.2026, suite 24).
//
// Lionel, à la question « nettoyage » : « Réécrire les 4 tests périmés ».
// test_bordure_lundi_2semaines, test_couleurs_sync_compte,
// test_selection_multijour_tablette et test_swipe_tablette_1semaine
// ouvraient un index.html de test qui n'existait que sur la machine de leur
// auteur (/home/claude/work/testenv/), puis fabriquaient l'état à la main
// (etat.cache, etat.semaines…) — modèle de données d'avant Supabase, qui ne
// correspond plus à ce que charge l'appli. Ils passent désormais tous par ce
// module : la VRAIE page (index.html du dépôt), une date figée, et un faux
// client Supabase en mémoire qui sert les tables comme le vrai serveur —
// l'appli charge ses données par son propre chemin (chargerSemaineDepuisServeur).
// Le faux client suit celui des tests récents (test_weekend_vendredi,
// test_suite24) ; il est mis ici une fois pour ne pas le recopier dans
// chaque nouveau test.
//
// Ce fichier ne commence PAS par « test_ » : ce n'est pas un test à lancer.
const path = require('path');

// Faux supabase-js injecté à la place du CDN (page.route). Les données de
// départ viennent de window.__BD_INITIALE (posée par addInitScript) ;
// window.__BD est la « base » en mémoire, window.__ECRITURES le journal des
// écritures (« table:mode », + la charge utile d'un upsert).
const LOGIQUE_PLAGE = require('fs').readFileSync(path.join(__dirname, 'functions/enregistrer-plage/logic.js'), 'utf8').replace(/export\s*\{[\s\S]*$/, '');
const FAUX_SUPABASE = LOGIQUE_PLAGE + '\n(' + function () {
  var initiale = window.__BD_INITIALE || {};
  var BD = window.__BD = {
    personnes: [], chantiers: [], statuts: [], feries: [], categories_feries: [],
    couleurs_perso: [], assignations: [], series: [], jalons: [], notes: [], taches: []
  };
  Object.keys(initiale).forEach(function (t) { BD[t] = initiale[t].map(function (r) { return Object.assign({}, r); }); });
  var prochainId = 1000;
  window.__ECRITURES = [];
  function requete(table) {
    var filtres = [], mode = 'select', valeurs = null, plage = null, conflit = null;
    var q = {
      select: function () { return q; },
      insert: function (v) { mode = 'insert'; valeurs = Array.isArray(v) ? v : [v]; return q; },
      update: function (v) { mode = 'update'; valeurs = v; return q; },
      delete: function () { mode = 'delete'; return q; },
      upsert: function (v, opts) { mode = 'upsert'; valeurs = Array.isArray(v) ? v : [v]; conflit = (opts && opts.onConflict) || 'id'; return q; },
      eq: function (c, v) { filtres.push(function (r) { return r[c] === v; }); return q; },
      neq: function (c, v) { filtres.push(function (r) { return r[c] !== v; }); return q; },
      gte: function (c, v) { filtres.push(function (r) { return r[c] >= v; }); return q; },
      lte: function (c, v) { filtres.push(function (r) { return r[c] <= v; }); return q; },
      is: function (c, v) { filtres.push(function (r) { return (r[c] == null) === (v == null); }); return q; },
      in: function (c, v) { filtres.push(function (r) { return v.indexOf(r[c]) >= 0; }); return q; },
      order: function () { return q; }, limit: function () { return q; },
      range: function (a, b) { plage = [a, b]; return q; },
      single: function () { return q; }, maybeSingle: function () { return q; },
      then: function (ok, ko) {
        var t = BD[table] = BD[table] || [];
        var garde = function (r) { return filtres.every(function (f) { return f(r); }); };
        var data;
        window.__ECRITURES.push(mode === 'upsert' ? table + ':upsert:' + JSON.stringify(valeurs) : table + ':' + mode);
        if (mode === 'insert') data = valeurs.map(function (v) { var r = Object.assign({ id: prochainId++ }, v); t.push(r); return r; });
        else if (mode === 'upsert') {
          // upsert PostgREST : ne réécrit QUE les colonnes fournies d'une
          // ligne existante (cf. enregistrerCouleurServeur_, page-couleurs.js).
          data = valeurs.map(function (v) {
            var r = t.find(function (x) { return x[conflit] === v[conflit]; });
            if (r) return Object.assign(r, v);
            r = Object.assign({}, v); t.push(r); return r;
          });
        } else if (mode === 'delete') { data = t.filter(garde); BD[table] = t.filter(function (r) { return !garde(r); }); }
        else if (mode === 'update') { data = t.filter(garde); data.forEach(function (r) { Object.assign(r, valeurs); }); }
        else {
          data = t.filter(garde).map(function (r) { return Object.assign({}, r); });
          if (plage) data = data.slice(plage[0], plage[1] + 1);
        }
        var rep = { data: data, error: null, count: data.length };
        // window.__TABLES_EN_ECHEC : tables dont toute requête échoue (serveur
        // injoignable, table absente…), pour tester les replis de l'appli.
        if ((window.__TABLES_EN_ECHEC || []).indexOf(table) >= 0) rep = { data: null, error: { message: 'échec simulé' } };
        return Promise.resolve(rep).then(ok, ko);
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
      // remplacer_case_personne (sql/0012) : même effet que la vraie
      // fonction — la case (personne, date, demi) est vidée puis remplie.
      rpc: function (nom, a) {
        if (nom === 'remplacer_case_personne') {
          var garde = function (r) { return !(String(r.personne_id) === String(a.p_personne_id) && r.date === a.p_date && r.demi === a.p_demi); };
          BD.taches = BD.taches.filter(garde);
          BD.assignations = BD.assignations.filter(garde);
          (a.p_lignes || []).forEach(function (l, i) {
            BD.taches.push({ id: prochainId++, personne_id: a.p_personne_id, date: a.p_date, demi: a.p_demi, ordre: i, texte: l.texte, statut_id: l.statut_id || null,
              important: !!l.important, serie_id: l.serie_id || null, est_absence: !!l.est_absence, chantier_id: l.chantier_id || null });
          });
        }
        window.__ECRITURES.push('rpc:' + nom);
        return Promise.resolve({ data: null, error: null });
      },
      functions: { invoke: function (nom, opts) {
        // enregistrer-plage : VRAIE logique serveur (planPlage, injectée
        // depuis functions/enregistrer-plage/logic.js), appliquée à la base
        // en mémoire — comme la vraie fonction, elle ignore serie_id.
        var b = (opts && opts.body) || {};
        if (nom === 'enregistrer-plage' && typeof planPlage === 'function') {
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

const PERSONNES_TEST = [
  { id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true },
  { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }
];
const CHANTIERS_TEST = [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }];

// Ouvre la vraie page du dépôt sur une base de test. options :
//   viewport, hasTouch, date (ISO, défaut jeudi 24.09.2026 10:00),
//   bd (tables de départ, fusionnées avec personnes/chantiers de test),
//   localStorage (clés à poser AVANT le chargement de l'appli),
//   tablesEnEchec (tables dont les requêtes échouent, cf. FAUX_SUPABASE).
async function ouvrirPlanning(browser, options) {
  options = options || {};
  const page = await browser.newPage({ viewport: options.viewport || { width: 1400, height: 900 }, hasTouch: !!options.hasTouch });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date(options.date || '2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  const bd = Object.assign({ personnes: PERSONNES_TEST, chantiers: CHANTIERS_TEST }, options.bd || {});
  await page.addInitScript((d) => {
    window.__BD_INITIALE = d.bd;
    window.__TABLES_EN_ECHEC = d.echecs;
    try { Object.keys(d.ls).forEach(function (k) { localStorage.setItem(k, d.ls[k]); }); } catch (e) {}
  }, { bd: bd, ls: options.localStorage || {}, echecs: options.tablesEnEchec || [] });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForSelector('#legendeBarre');
  await page.waitForTimeout(300);
  return { page, erreurs };
}

// Petit compteur de vérifications : même sortie que les autres tests
// (« OK: … » / « ÉCHEC: … », bilan, code de sortie 1 en cas d'échec).
function verificateur() {
  let total = 0, echecs = 0;
  return {
    verifier(cond, msg) { total++; if (cond) console.log('OK: ' + msg); else { echecs++; console.log('ÉCHEC: ' + msg); } },
    bilan(erreurs) {
      if (erreurs && erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
      console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
      return echecs ? 1 : 0;
    }
  };
}

// Glissement tactile synthétique sur .scroller (touchstart → 6 touchmove →
// touchend). Playwright ne rejoue pas le double canal PointerEvent +
// TouchEvent d'un vrai doigt : seuls les TouchEvent sont émis, ce qui
// suffit au détecteur de bord de semaine (js/grille-rendu.js).
// Navigateur de test : Chromium avec le geste « page précédente au glisser
// horizontal » coupé. Sans ça, un vrai glisser au doigt (glisserBulleDoigt,
// Input.dispatchTouchEvent) sur la grille ramène la page à about:blank.
function lancerNavigateur(chromium) {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--disable-features=OverscrollHistoryNavigation'] });
}
// VRAI glisser au doigt (suite 25) : événements tactiles natifs via CDP,
// que Chromium convertit en PointerEvent pointerType "touch" + TouchEvent,
// exactement comme un doigt. Appui long (attente) avant de bouger :
// l'appli n'arme un glisser tactile qu'après DELAI_SELECTION (300 ms).
async function glisserBulleDoigt(page, de, vers) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: de.x, y: de.y }] });
  await page.waitForTimeout(500);
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: de.x + (vers.x - de.x) * i / 10, y: de.y + (vers.y - de.y) * i / 10 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  await cdp.detach();
}

async function glisserDoigt(page, departX, arriveeX, y) {
  const toucher = (type, x) => page.evaluate(([type, x, y]) => {
    var el = document.querySelector('.scroller');
    var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    var fin = type === 'touchend';
    el.dispatchEvent(new TouchEvent(type, { touches: fin ? [] : [t], targetTouches: fin ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
  }, [type, x, y]);
  await toucher('touchstart', departX);
  for (let i = 1; i <= 6; i++) await toucher('touchmove', departX + (arriveeX - departX) * i / 6);
  await toucher('touchend', arriveeX);
  await page.waitForTimeout(300);
}

module.exports = { FAUX_SUPABASE, ouvrirPlanning, verificateur, glisserDoigt, glisserBulleDoigt, lancerNavigateur };
