const { chromium } = require('playwright');
const path = require('path');

// Revue du code du 24.09.2026 (suite 22) — Lionel : « Passe en revu le code
// à la recherche de bugs et d'améliorations ». Bugs trouvés et reproduits
// ici, avec la VRAIE logique d'enregistrer-plage branchée dans le faux
// Supabase (c'est elle qui décide d'effacer ou non une ligne) :
//   1) Ctrl+Z après une synchronisation réécrivait toutes les notes et tous
//      les jalons de la semaine : jalon effacé en base, note sortie de sa
//      série ;
//   2) déplacer dans la grille un jalon qui a un chantier ou un drapeau le
//      laissait EN DOUBLE (copie sans chantier ni drapeau) ;
//   3) ⚑ posé dans la fiche d'un jalon de la grille : jamais enregistré ;
//   4) fiche ouverte pendant un rechargement : modification perdue ;
//   5) Ctrl+Z après un changement de semaine : la semaine précédente
//      recopiée dans la semaine affichée ;
//   6) retour sur l'appli après un moment : la semaine est relue (un autre
//      appareil a pu écrire entre-temps) ;
//   7) grille <-> page Jalons (Lionel : « Les jalons de la page jalons et
//      les jalons affichée sur la grille ne semblent pas bien
//      synchronisée ») : couleur du chantier dans la grille, page relue à
//      chaque ouverture, grille relue après une écriture de la page, jalon
//      d'une demi-journée modifié/déplacé depuis la page sans perdre sa
//      demi-journée ni rester en double.
//
// Lancer : node test_revue_suite22.js

const fs = require('fs');
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
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.addInitScript((d) => { window.__TACHES_INITIALES = d.taches; window.__NOTES_INITIALES = d.notes; window.__JALONS_INITIALES = d.jalons; }, {
    taches: [].concat(journee('2026-09-21', 'Décoffrage'), journee('2026-09-22', 'Béton', { personne_id: 2 })),
    notes: [{ date: '2026-09-23', texte: 'Livraison', important: false, serie_id: 2, demi: null }],
    jalons: [{ date: '2026-09-22', texte: 'Visite', serie_id: null, demi: null, chantier_id: 1, important: true },
      { date: '2026-09-24', texte: 'Réunion', serie_id: 3, demi: null, chantier_id: null, important: false }]
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
  const jalonsBD = () => page.evaluate(() => __BD.jalons.map((j) => j.texte + '@' + j.date + (j.chantier_id ? ' ch' + j.chantier_id : '') + (j.important ? ' !' : '') + (j.serie_id ? ' s' + j.serie_id : '')).sort().join(', '));
  const notesBD = () => page.evaluate(() => __BD.notes.map((n) => n.texte + '@' + n.date + (n.serie_id ? ' s' + n.serie_id : '')).sort().join(', '));
  const tachesBD = (tx) => page.evaluate((t) => __BD.taches.filter((r) => r.texte === t).map((r) => r.personne_id + ':' + r.date + ' ' + r.demi + (r.important ? ' !' : '')).sort().join(', '), tx);
  const selectionner = (texte) => page.evaluate((t) => {
    quitterModeSelection();
    const it = TACHES.concat(NOTES, JALONS).find((x) => x.texte === t);
    bullesSelectionnees[it.id] = true; modeSelectionMultiple = true; majBarreSelection();
  }, texte);
  const JALONS_DEPART = 'Réunion@2026-09-24 s3, Visite@2026-09-22 ch1 !';

  // 1) Ctrl+Z après synchro : seule la tâche revient, rien d'autre n'est réécrit.
  verifier(await jalonsBD() === JALONS_DEPART, 'départ : ' + await jalonsBD());
  await selectionner('Décoffrage');
  await page.evaluate(() => decalerSelection(2));
  await auRepos();
  verifier(await tachesBD('Décoffrage') === '1:2026-09-22 aprem, 1:2026-09-22 matin', 'tâche décalée d’un jour (' + await tachesBD('Décoffrage') + ')');
  await page.evaluate(() => { window.__INVOCATIONS = []; quitterModeSelection(); defaire(); });
  await auRepos();
  verifier(await tachesBD('Décoffrage') === '1:2026-09-21 aprem, 1:2026-09-21 matin', 'Ctrl+Z : la tâche revient au lundi (' + await tachesBD('Décoffrage') + ')');
  const invoc = await page.evaluate(() => (window.__INVOCATIONS || []).length);
  verifier(invoc === 0, 'Ctrl+Z : aucune note ni aucun jalon réécrit (' + invoc + ' appel(s) enregistrer-plage)');
  verifier(await jalonsBD() === JALONS_DEPART, 'Ctrl+Z : jalons intacts en base, série/chantier/drapeau compris (' + await jalonsBD() + ')');
  verifier(await notesBD() === 'Livraison@2026-09-23 s2', 'Ctrl+Z : la note reste dans sa série (' + await notesBD() + ')');

  // 2) Jalon avec chantier + drapeau déplacé d'un jour, puis Ctrl+Z.
  await selectionner('Visite');
  await page.evaluate(() => decalerSelection(2));
  await auRepos();
  verifier(await jalonsBD() === 'Réunion@2026-09-24 s3, Visite@2026-09-23 ch1 !', 'jalon déplacé : pas de doublon, chantier et drapeau suivent (' + await jalonsBD() + ')');
  await page.evaluate(() => { quitterModeSelection(); defaire(); });
  await auRepos();
  verifier(await jalonsBD() === JALONS_DEPART, 'Ctrl+Z du jalon : revenu au mardi, toujours unique (' + await jalonsBD() + ')');

  // 3) ⚑ dans la fiche d'un jalon de la grille.
  await selectionner('Réunion');
  await page.evaluate(() => modifierSelection());
  await page.waitForSelector('.pop .f-important');
  await page.click('.pop .f-important');
  await page.click('.pop .f-ok');
  await page.waitForTimeout(300);
  const boiteSerie = await page.$('.confirm-pop-serie');
  if (boiteSerie) { await page.click('.confirm-pop-serie .cs-ok'); }
  await auRepos();
  await page.waitForTimeout(400);
  verifier(/Réunion@2026-09-24 ! s3/.test(await jalonsBD()), 'fiche jalon : le ⚑ est enregistré (' + await jalonsBD() + ')');

  // 4) Fiche ouverte pendant le rechargement d'une synchro précédente.
  await page.evaluate(() => { window.__DELAI = 150; });
  await selectionner('Béton');
  await page.evaluate(() => decalerSelection(1));
  await page.evaluate(() => { const t = TACHES.find((x) => x.texte === 'Décoffrage'); quitterModeSelection(); bullesSelectionnees[t.id] = true; majBarreSelection(); modifierSelection(); });
  await page.waitForSelector('.pop .f-important');
  await auRepos();
  await page.waitForTimeout(600);
  await page.click('.pop .f-important');
  await page.click('.pop .f-ok');
  await auRepos();
  await page.evaluate(() => { window.__DELAI = 0; });
  verifier(await tachesBD('Décoffrage') === '1:2026-09-21 aprem !, 1:2026-09-21 matin !', 'fiche ouverte pendant un rechargement : le ⚑ est enregistré (' + await tachesBD('Décoffrage') + ')');

  // 5) Ctrl+Z après un changement de semaine : rien n'est recopié.
  await selectionner('Béton');
  await page.evaluate(() => decalerSelection(1));
  await auRepos();
  const avantNav = await tachesBD('Béton');
  await page.evaluate(() => { quitterModeSelection(); naviguerSemaine(1); });
  await page.waitForTimeout(600);
  await page.evaluate(() => defaire());
  await auRepos();
  const semaineSuivante = await page.evaluate(() => __BD.taches.filter((t) => t.date >= '2026-09-28').length);
  verifier(semaineSuivante === 0, 'Ctrl+Z après changement de semaine : rien recopié dans la semaine affichée (' + semaineSuivante + ' ligne(s))');
  verifier(await tachesBD('Béton') === avantNav, 'Ctrl+Z après changement de semaine : la semaine quittée est intacte (' + await tachesBD('Béton') + ')');
  await page.evaluate(() => { naviguerSemaine(-1); });
  await page.waitForTimeout(600);

  // 6) Retour sur l'appli : un autre appareil a ajouté une tâche.
  await page.evaluate(() => { __BD.taches.push({ id: 9999, personne_id: 3, date: '2026-09-25', demi: 'matin', ordre: 0, texte: 'Autre appareil', statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: 1 }); });
  const avantRetour = await page.evaluate(() => TACHES.some((t) => t.texte === 'Autre appareil'));
  await page.clock.setFixedTime(new Date('2026-09-24T10:05:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(600);
  const apresRetour = await page.evaluate(() => TACHES.some((t) => t.texte === 'Autre appareil'));
  verifier(!avantRetour && apresRetour, 'retour sur l’appli après 5 min : la semaine est relue (avant ' + avantRetour + ', après ' + apresRetour + ')');

  // 7) Grille <-> page Jalons.
  const couleur = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.grille .bulle')).find((x) => /Visite/.test(x.textContent));
    return b ? getComputedStyle(b.querySelector('.b-carte')).backgroundColor : null;
  });
  verifier(couleur === 'rgb(247, 217, 168)', 'grille : jalon rattaché à un chantier peint de la couleur du chantier, comme sur la page Jalons (' + couleur + ')');
  const ouvrirOnglet = async (nom) => { await page.locator('.onglet[data-page="' + nom + '"]:visible').first().click(); await page.waitForTimeout(500); };
  const ligneJalon = (tx) => page.evaluate((t) => {
    const l = Array.from(document.querySelectorAll('#listeJalons .ligne-intervenant')).find((x) => x.querySelector('b') && x.querySelector('b').textContent === t);
    return l ? l.querySelector('.plage-jalon').textContent : null;
  }, tx);
  await ouvrirOnglet('jalons');
  verifier(/22 sept/.test(await ligneJalon('Visite') || ''), 'page Jalons : Visite le 22 (' + await ligneJalon('Visite') + ')');
  await ouvrirOnglet('planning');
  await selectionner('Visite');
  await page.evaluate(() => decalerSelection(2));
  await auRepos();
  await page.evaluate(() => quitterModeSelection());
  await ouvrirOnglet('jalons');
  verifier(/23 sept/.test(await ligneJalon('Visite') || ''), 'page Jalons rouverte : le déplacement fait dans la grille y apparaît (' + await ligneJalon('Visite') + ')');

  // Jalon d'une demi-journée (vendredi après-midi) modifié depuis la page.
  await page.evaluate(() => { __BD.jalons.push({ id: 8000, date: '2026-09-25', texte: 'Coulage', demi: 'aprem', important: false, chantier_id: null, serie_id: null }); });
  await ouvrirOnglet('planning');
  await ouvrirOnglet('jalons');
  const modifierJalon = async (t) => {
    await page.evaluate((tx) => {
      const l = Array.from(document.querySelectorAll('#listeJalons .ligne-intervenant')).find((x) => x.querySelector('b').textContent === tx);
      l.querySelector('.lien-modifier').click();
    }, t);
    await page.waitForSelector('.pop .f-nom-jalon');
  };
  await modifierJalon('Coulage');
  await page.fill('.pop .f-nom-jalon', 'Coulage B');
  await page.click('.pop .f-ok');
  await page.waitForTimeout(800);
  const coulage = () => page.evaluate(() => __BD.jalons.filter((j) => /Coulage/.test(j.texte)).map((j) => j.texte + '@' + j.date + ' ' + (j.demi || 'jour')).sort().join(', '));
  verifier(await coulage() === 'Coulage B@2026-09-25 aprem', 'page Jalons, texte changé : l’après-midi est gardé (' + await coulage() + ')');
  const grilleCoulage = await page.evaluate(() => JALONS.filter((j) => /Coulage/.test(j.texte)).map((j) => j.texte + ' ' + (j.demiDebut || 'jour')).join(', '));
  verifier(grilleCoulage === 'Coulage B aprem', 'grille relue aussitôt après l’écriture de la page (' + grilleCoulage + ')');
  await modifierJalon('Coulage B');
  await page.click('.pop .date-ligne[data-bord="debut"] .f-fleche[data-sens="1"]');
  // (la fin suit toute seule : appliquerDateChoisieJalon la pousse au lundi dès que le début la dépasse)
  await page.click('.pop .f-ok');
  await page.waitForTimeout(800);
  verifier(await coulage() === 'Coulage B@2026-09-28 jour', 'page Jalons, jalon déplacé au lundi : plus de doublon le vendredi (' + await coulage() + ')');
  await ouvrirOnglet('planning');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
