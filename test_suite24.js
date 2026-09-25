const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Suite 24 (24.09.2026) — corrections choisies par Lionel après la revue
// (« pose moi les questions pour les corrections ») :
//   A) « Case jamais vidée » : une case de personne s'écrit en UN appel
//      (rpc remplacer_case_personne, sql/0012) — plus d'effacement puis
//      insertion séparés ; en cas d'échec, pas de repli qui effacerait la
//      case ; repli sur l'ancien trajet seulement si la fonction n'existe
//      pas en base ;
//   B) « Série quotidienne séparée » : une bulle par jour pour une série
//      quotidienne, une par semaine pour une hebdomadaire « toute la
//      semaine » (2 semaines affichées) ;
//   C) « Séries : Ctrl+Z et Ctrl+X » : Ctrl+X d'une note de série ouvre la
//      boîte « événement récurrent » ; Ctrl+Z la remet DANS sa série ;
//   D) « Jalon copié garde son chantier » ;
//   E) « proposer une entrée rapide "coller" dans le popup » : Coller du
//      menu Ajouter, sur la case cliquée, y compris dans une autre semaine.
//
// Lancer : node test_suite24.js

const LOGIQUE_PLAGE = fs.readFileSync(path.join(__dirname, 'functions/enregistrer-plage/logic.js'), 'utf8').replace(/export\s*\{[\s\S]*$/, '');
const FAUX_SUPABASE = LOGIQUE_PLAGE + '\n(' + function () {
  var BD = window.__BD = {
    personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }, { id: 3, nom: 'François', sous_traitant: false, ordre: 3, actif: true }],
    chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }],
    statuts: [], feries: [], categories_feries: [], couleurs_perso: [], assignations: [],
    series: [{ id: 1, frequence: 'jour', intervalle: 1 }, { id: 2, frequence: 'semaine', intervalle: 1 }, { id: 3, frequence: 'semaine', intervalle: 1 }],
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
      is: function (c, v) { filtres.push(function (r) { return v === null ? r[c] == null : r[c] === v; }); return q; },
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
      // remplacer_case_personne (sql/0012) : même effet que la fonction SQL
      // (tout ou rien). __RPC_ECHEC simule une erreur (la case reste
      // intacte, comme la transaction annulée), __RPC_ABSENT une base pas
      // encore migrée (PGRST202).
      rpc: function (nom, a) {
        (window.__RPC = window.__RPC || []).push(nom);
        if (window.__RPC_ABSENT) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
        if (window.__RPC_ECHEC) return Promise.resolve({ data: null, error: { code: '08006', message: 'coupure simulée' } });
        BD.taches = BD.taches.filter(function (r) { return !(r.personne_id === a.p_personne_id && r.date === a.p_date && r.demi === a.p_demi); });
        a.p_lignes.forEach(function (l, i) { BD.taches.push(Object.assign({ id: prochainId++, personne_id: a.p_personne_id, date: a.p_date, demi: a.p_demi, ordre: i }, l)); });
        return Promise.resolve({ data: null, error: null });
      },
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
const SEMAINE1 = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
const SEMAINE2 = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.addInitScript((d) => { window.__TACHES_INITIALES = d.taches; window.__NOTES_INITIALES = d.notes; window.__JALONS_INITIALES = d.jalons; }, {
    taches: [].concat(journee('2026-09-21', 'Décoffrage'),
      ...SEMAINE1.concat(SEMAINE2).map((d) => journee(d, 'Hebdo', { personne_id: 2, serie_id: 2 }))),
    notes: SEMAINE1.map((d) => ({ date: d, texte: 'Quotidien', important: false, serie_id: 1, demi: null }))
      .concat([{ date: '2026-09-23', texte: 'Livraison', important: false, serie_id: 3, demi: null }, { date: '2026-09-30', texte: 'Livraison', important: false, serie_id: 3, demi: null }]),
    jalons: [{ date: '2026-09-22', texte: 'Visite', serie_id: null, demi: null, chantier_id: 1, important: false }]
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
  async function auRepos() {
    await page.waitForFunction(() => !syncEnCours && !syncRelance, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.waitForFunction(() => !syncEnCours && !syncRelance, null, { timeout: 15000 });
  }
  const tachesBD = (tx) => page.evaluate((t) => __BD.taches.filter((r) => r.texte === t).map((r) => r.personne_id + ':' + r.date + ' ' + r.demi).sort().join(', '), tx);
  const notesBD = (tx) => page.evaluate((t) => __BD.notes.filter((r) => r.texte === t).map((n) => n.date + (n.serie_id ? ' s' + n.serie_id : '')).sort().join(', '), tx);
  const jalonsBD = () => page.evaluate(() => __BD.jalons.map((j) => j.texte + '@' + j.date + (j.chantier_id ? ' ch' + j.chantier_id : '')).sort().join(', '));
  const selectionner = (texte) => page.evaluate((t) => {
    quitterModeSelection();
    const it = TACHES.concat(NOTES, JALONS).find((x) => x.texte === t);
    bullesSelectionnees[it.id] = true; modeSelectionMultiple = true; majBarreSelection();
  }, texte);

  // A) Case écrite en un seul appel.
  await page.evaluate(() => { window.__ECRITURES = []; window.__RPC = []; });
  await selectionner('Décoffrage');
  await page.evaluate(() => decalerSelection(2));
  await auRepos();
  let ecr = await page.evaluate(() => ({ rpc: window.__RPC.length, directes: window.__ECRITURES.filter((e) => /^taches:(delete|insert)/.test(e)).length }));
  verifier(await tachesBD('Décoffrage') === '1:2026-09-22 aprem, 1:2026-09-22 matin' && ecr.rpc === 4 && ecr.directes === 0,
    'case écrite par la fonction SQL : 4 cases, 0 effacement/insertion séparés (' + JSON.stringify(ecr) + ')');
  await page.evaluate(() => { window.__ECRITURES = []; window.__RPC_ECHEC = true; });
  await selectionner('Décoffrage');
  await page.evaluate(() => decalerSelection(2));
  await auRepos();
  await page.waitForTimeout(400);
  ecr = await page.evaluate(() => ({ directes: window.__ECRITURES.filter((e) => /^taches:(delete|insert)/.test(e)).length, grille: TACHES.filter((t) => t.texte === 'Décoffrage').map((t) => t.dateDebutIso).join(',') }));
  verifier(await tachesBD('Décoffrage') === '1:2026-09-22 aprem, 1:2026-09-22 matin' && ecr.directes === 0 && ecr.grille === '2026-09-22',
    'échec de la fonction : aucun effacement de repli, la tâche reste en base et à l\'écran (' + JSON.stringify(ecr) + ')');
  await page.evaluate(() => { window.__RPC_ECHEC = false; window.__RPC_ABSENT = true; window.__ECRITURES = []; });
  await selectionner('Décoffrage');
  await page.evaluate(() => decalerSelection(-2));
  await auRepos();
  ecr = await page.evaluate(() => window.__ECRITURES.filter((e) => /^taches:(delete|insert)/.test(e)).length);
  verifier(await tachesBD('Décoffrage') === '1:2026-09-21 aprem, 1:2026-09-21 matin' && ecr > 0, 'base pas encore migrée : repli sur l\'ancien trajet (' + await tachesBD('Décoffrage') + ')');
  await page.evaluate(() => { window.__RPC_ABSENT = false; });

  // B) Séries : une bulle par occurrence.
  const bullesQuot = await page.evaluate(() => NOTES.filter((n) => n.texte === 'Quotidien').map((n) => n.duree).join(','));
  verifier(bullesQuot === '1,1,1,1,1', 'série quotidienne : 5 bulles d\'un jour, plus une seule bulle de 5 jours (' + bullesQuot + ')');
  await page.evaluate(() => basculerDeuxSemaines());
  await page.waitForTimeout(700);
  const bullesHebdo = await page.evaluate(() => TACHES.filter((t) => t.texte === 'Hebdo').map((t) => t.dateDebutIso + '×' + t.duree).join(', '));
  verifier(bullesHebdo === '2026-09-21×5, 2026-09-28×5', 'série hebdomadaire « toute la semaine », 2 semaines affichées : 2 bulles (' + bullesHebdo + ')');
  const bullesLivraison = await page.evaluate(() => NOTES.filter((n) => n.texte === 'Livraison').length);
  verifier(bullesLivraison === 2, 'note hebdomadaire : 2 bulles');

  // C) Ctrl+X d'une note de série : boîte « événement récurrent ».
  await selectionner('Livraison');
  await page.keyboard.press('Control+x');
  await page.waitForTimeout(300);
  const boite = await page.$('.confirm-pop-serie');
  verifier(!!boite, 'Ctrl+X sur une note de série : la boîte « événement récurrent » s\'ouvre');
  if (boite) await page.click('.confirm-pop-serie .cs-ok');
  await auRepos();
  await page.waitForTimeout(400);
  verifier(await notesBD('Livraison') === '2026-09-30 s3', 'Ctrl+X « cet événement » : seule l\'occurrence du 23 est coupée (' + await notesBD('Livraison') + ')');
  const pp = await page.evaluate(() => pressePapier.map((i) => i.texte).join(','));
  verifier(pp === 'Livraison', 'Ctrl+X : la note est dans le presse-papiers (' + pp + ')');
  await page.evaluate(() => defaire());
  await auRepos();
  await page.waitForTimeout(400);
  verifier(await notesBD('Livraison') === '2026-09-23 s3, 2026-09-30 s3', 'Ctrl+Z : la note revient DANS sa série (' + await notesBD('Livraison') + ')');

  // D) + E) Jalon copié puis collé par le menu Ajouter : garde son chantier.
  await selectionner('Visite');
  await page.keyboard.press('Control+c');
  await page.evaluate(() => quitterModeSelection());
  const ouvrirMenuCase = async (gi, personne, demi) => {
    await page.evaluate(() => render(false));
    const sel = '.cell[data-kind="personne"][data-jour="' + gi + '"][data-personne="' + personne + '"][data-demi="' + demi + '"]';
    await page.locator(sel).scrollIntoViewIfNeeded();
    await page.click(sel);
    await page.waitForSelector('.pop.menu-pop');
  };
  await ouvrirMenuCase(3, 3, 'matin');
  const libelle = await page.evaluate(() => { const b = document.querySelector('.pop.menu-pop button[data-coller]'); return b ? b.textContent : null; });
  verifier(libelle === 'Coller (1)', 'menu Ajouter d\'une case : entrée « Coller (1) » (' + libelle + ')');
  await page.click('.pop.menu-pop button[data-coller]');
  await auRepos();
  verifier(await jalonsBD() === 'Visite@2026-09-22 ch1, Visite@2026-09-24 ch1', 'jalon collé sur le jeudi : il garde son chantier (' + await jalonsBD() + ')');

  // E) Coller une tâche dans une AUTRE semaine, sur une autre personne.
  await selectionner('Décoffrage');
  await page.keyboard.press('Control+c');
  await page.evaluate(() => quitterModeSelection());
  await ouvrirMenuCase(7, 3, 'aprem');   // mercredi 30, François, après-midi
  await page.click('.pop.menu-pop button[data-coller]');
  await auRepos();
  verifier(await tachesBD('Décoffrage') === '1:2026-09-21 aprem, 1:2026-09-21 matin, 3:2026-09-30 aprem, 3:2026-10-01 matin',
    'tâche d\'une journée collée sur mercredi 30 après-midi (François) : mercredi aprem → jeudi matin (' + await tachesBD('Décoffrage') + ')');
  // Après un collage, les éléments collés restent sélectionnés : on sort du mode sélection.
  const pasDeMenu = await page.evaluate(() => { quitterModeSelection(); pressePapier = []; return true; });
  await ouvrirMenuCase(4, 3, 'matin');
  const sansColler = await page.evaluate(() => !document.querySelector('.pop.menu-pop button[data-coller]'));
  verifier(pasDeMenu && sansColler, 'presse-papiers vide : pas d\'entrée « Coller »');
  await page.keyboard.press('Escape');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
