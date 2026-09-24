const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 23) — Lionel : « Propose moi une version
// mobile de la page des feriés ». Téléphone simulé (390px, tactile), date
// figée au jeudi 24.09.2026 :
//   - le tableau annuel est remplacé par 12 mois en calendrier (lundi →
//     dimanche), sans défilement de côté, cases d'au moins 40px ;
//   - sous chaque mois, ses jours colorés avec leur libellé ;
//   - week-ends non touchables, aujourd'hui entouré ;
//   - toucher un jour le colore dans la catégorie active, le retoucher
//     l'efface ; changer de catégorie ; compteur sur Enregistrer ;
//   - catégories collées en haut pendant le défilement, barre d'actions
//     collée au-dessus de la barre du bas, rien de caché dessous en fin
//     de page ;
//   - Enregistrer écrit bien en base ;
//   - ordinateur (1300px) : tableau annuel inchangé, pas de cartes.
//
// Lancer : node test_feries_mobile.js

const FAUX_SUPABASE = '(' + function () {
  var BD = window.__BD = {
    personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }],
    chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }],
    statuts: [], feries: [
      { id: 1, date: '2026-01-01', libelle: 'Nouvel an', categorie: 'ferie' },
      { id: 2, date: '2026-09-21', libelle: 'Lundi du Jeûne fédéral', categorie: 'ferie' },
      { id: 3, date: '2026-12-28', libelle: 'Vacances entreprise', categorie: 'vacances_entreprise' }
    ], categories_feries: [
      { id: 'vacances_entreprise', nom: 'Vacances entreprise', couleur: '#a9c6ea' },
      { id: 'ferie', nom: 'Férié', couleur: '#e8a3a3' },
      { id: 'compenses', nom: 'Compensés', couleur: '#e8dba3' }
    ], couleurs_perso: [], assignations: [], jalons: [], notes: [], series: [],
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
  const CAPTURES = process.env.CAPTURES || '';
  async function nouvellePage(options) {
    const p = await browser.newPage(options);
    p.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
    await p.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
    await p.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await p.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
    await p.addInitScript(() => { window.__TACHES_INITIALES = []; });
    await p.goto('file://' + path.join(__dirname, 'index.html'));
    await p.waitForSelector('#legendeBarre');
    await p.waitForTimeout(500);
    return p;
  }
  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }

  const page = await nouvellePage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await page.tap('#switcherBtn');
  await page.waitForTimeout(150);
  await page.tap('.switcher-item[data-page="feries"]');
  await page.waitForTimeout(400);
  if (CAPTURES) await page.screenshot({ path: CAPTURES + '/feries_mobile_haut.png' });

  const vue = () => page.evaluate(() => {
    const vis = (el) => !!el && el.getBoundingClientRect().width > 0;
    const cartes = document.querySelectorAll('#ferieMoisMobile .mois-carte');
    const sept = cartes[8];
    const j = (m, d) => document.querySelector('#ferieMoisMobile .jm[data-m="' + m + '"][data-j="' + d + '"]');
    const btn = document.getElementById('btnEnregistrerFeries');
    return {
      tableau: vis(document.getElementById('ferieCalendrier')), nbCartes: cartes.length, cartesVisibles: vis(cartes[0]),
      largeur: document.getElementById('app').scrollWidth,
      titreSept: sept.querySelector('.mois-carte-titre').textContent,
      listeSept: Array.from(sept.querySelectorAll('.mois-liste li')).map((li) => li.textContent).join(' | '),
      // 1er septembre 2026 = mardi : 7 en-têtes + 1 case vide avant le 1er
      decalageSept: sept.querySelectorAll('.jm-vide').length,
      tailleCase: Math.round(j(8, 24).getBoundingClientRect().width),
      samedi: j(8, 26).disabled, aujourdhui: j(8, 24).classList.contains('aujourdhui'),
      couleur24: getComputedStyle(j(8, 24)).backgroundColor, couleur21: getComputedStyle(j(8, 21)).backgroundColor,
      couleurOct12: getComputedStyle(j(9, 12)).backgroundColor,
      enregistrer: btn.textContent.trim(),
      aide: vis(document.querySelector('#page-feries .page-sous-mobile')) && !vis(document.querySelector('#page-feries .page-sous'))
    };
  });
  let v = await vue();
  verifier(!v.tableau && v.nbCartes === 12 && v.cartesVisibles, 'téléphone : 12 mois en cartes à la place du tableau annuel');
  verifier(v.largeur <= 390, 'aucun défilement de côté (largeur ' + v.largeur + ')');
  verifier(v.aide, 'aide courte à la place du long texte');
  verifier(v.decalageSept === 1 && v.tailleCase >= 40, 'septembre commence un mardi, cases de ' + v.tailleCase + 'px');
  verifier(v.listeSept === 'lun. 21Lundi du Jeûne fédéral' && /1 jour/.test(v.titreSept), 'sous septembre : « lun. 21 · Lundi du Jeûne fédéral », « 1 jour » (' + v.listeSept + ')');
  verifier(v.couleur21 === 'rgb(232, 163, 163)', 'jour férié peint de sa catégorie (' + v.couleur21 + ')');
  verifier(v.samedi && v.aujourdhui, 'samedi non touchable, aujourd\'hui entouré');

  await page.tap('#ferieMoisMobile .jm[data-m="8"][data-j="24"]');
  v = await vue();
  verifier(v.couleur24 === 'rgb(232, 163, 163)' && v.enregistrer === 'Enregistrer 1', 'toucher le 24 : coloré en Férié, Enregistrer 1 (' + v.enregistrer + ')');
  await page.tap('#ferieMoisMobile .jm[data-m="8"][data-j="24"]');
  v = await vue();
  verifier(v.couleur24 !== 'rgb(232, 163, 163)' && v.enregistrer === 'Enregistrer', 'le retoucher l\'efface, compteur remis à zéro');

  await page.tap('#ferieCategories .categorie[data-cat="vacances_entreprise"] .nom-cat');
  await page.locator('#ferieMoisMobile .jm[data-m="9"][data-j="12"]').scrollIntoViewIfNeeded();
  await page.tap('#ferieMoisMobile .jm[data-m="9"][data-j="12"]');
  v = await vue();
  const listeOct = await page.evaluate(() => document.querySelectorAll('#ferieMoisMobile .mois-carte')[9].querySelector('.mois-liste').textContent);
  verifier(v.couleurOct12 === 'rgb(169, 198, 234)' && /lun\. 12Vacances entreprise/.test(listeOct), 'autre catégorie : 12 octobre en Vacances entreprise, listé sous octobre (' + listeOct + ')');

  // Défilement : catégories collées en haut, barre d'actions au-dessus de
  // la barre du bas, dernière carte jamais cachée dessous.
  await page.evaluate(() => { document.getElementById('app').scrollTop = 1500; });
  await page.waitForTimeout(150);
  if (CAPTURES) await page.screenshot({ path: CAPTURES + '/feries_mobile_defile.png' });
  const g = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { cats: Math.round(r('#ferieCategories').top), actions: r('#page-feries .actions-feries'), nav: r('.nav-bas') };
  });
  verifier(Math.abs(g.cats) <= 1, 'catégories collées en haut pendant le défilement (top ' + g.cats + ')');
  verifier(Math.abs(g.actions.bottom - g.nav.top) <= 1 && g.actions.height >= 44, 'Calculer / Effacer / Enregistrer collés juste au-dessus de la barre du bas');
  const coupes = await page.evaluate(() => Array.from(document.querySelectorAll('#page-feries .actions-feries button')).filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent));
  verifier(!coupes.length, 'libellés courts, aucun bouton coupé (' + coupes.join(', ') + ')');
  await page.evaluate(() => { const a = document.getElementById('app'); a.scrollTop = a.scrollHeight; });
  await page.waitForTimeout(150);
  const finPage = await page.evaluate(() => {
    const cartes = document.querySelectorAll('#ferieMoisMobile .mois-carte');
    return { derniere: cartes[11].getBoundingClientRect().bottom, actions: document.querySelector('#page-feries .actions-feries').getBoundingClientRect().top };
  });
  verifier(finPage.derniere <= finPage.actions, 'fin de page : décembre entièrement visible au-dessus de la barre d\'actions');

  await page.tap('#btnEnregistrerFeries');
  await page.waitForTimeout(500);
  const bd = await page.evaluate(() => __BD.feries.map((f) => f.date + ' ' + f.categorie).sort().join(', '));
  v = await vue();
  verifier(/2026-10-12 vacances_entreprise/.test(bd) && v.enregistrer === 'Enregistrer', 'Enregistrer : 12 octobre écrit en base, compteur effacé (' + bd + ')');

  // Ordinateur : tableau annuel inchangé, pas de cartes.
  const bureau = await nouvellePage({ viewport: { width: 1300, height: 800 } });
  await bureau.locator('.onglet[data-page="feries"]:visible').first().click();
  await bureau.waitForTimeout(400);
  const vb = await bureau.evaluate(() => ({
    tableau: document.getElementById('ferieCalendrier').getBoundingClientRect().width > 0,
    cartes: document.getElementById('ferieMoisMobile').getBoundingClientRect().height,
    actionsFixe: getComputedStyle(document.querySelector('#page-feries .actions-feries')).position
  }));
  if (CAPTURES) await bureau.screenshot({ path: CAPTURES + '/feries_bureau.png' });
  verifier(vb.tableau && vb.cartes === 0 && vb.actionsFixe === 'static', 'ordinateur : tableau annuel inchangé, pas de cartes, boutons à leur place');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
