const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 15) — Lionel : « Dans le menu 3 point sur
// mobile, en mode un jour, la navigation par semaine doit être remplacée
// par la date du jour aller sélectionner une autre date dans le
// calendrier. » Vérifie sur un téléphone simulé (390px, tactile), date
// figée au jeudi 24.09.2026 :
//   - vue "1 jour" : dans le menu ⋮, la date du jour affiché (pilule)
//     remplace ‹ Sem. N › ;
//   - un appui sur la pilule tombe sur le calendrier natif (<input
//     type="date"> qui la couvre, borné aux semaines du planning), le
//     menu reste ouvert ;
//   - une date choisie : menu refermé, jour affiché, libellé à jour — même
//     semaine, autre semaine, date lointaine ; samedi/dimanche masqués ->
//     vendredi/lundi, affichés tels quels si le week-end est visible ;
//   - le libellé suit le défilement (swipe) ;
//   - vue "1 semaine" : ‹ Sem. N › revient ; ordinateur : jamais de date.
//
// Lancer : node test_date_jour_mobile.js

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
  const page = await browser.newPage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.addInitScript(() => { window.__TACHES_INITIALES = []; });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForSelector('#legendeBarre');
  await page.waitForTimeout(500);

  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }
  // Jour affiché = colonne de jour au ras de la colonne des noms ; menu,
  // pilule date, navigation semaine. Bord EXTÉRIEUR de la colonne : c'est
  // lui qu'un saut vers un jour (Aujourd'hui, ‹ ›, calendrier) aligne (cf.
  // decalerSurColonne_, grille-rendu.js) — un lundi de 2e semaine garde
  // donc sa bordure de début de semaine visible (3px).
  const etatVue = () => page.evaluate(() => {
    const sc = document.querySelector('.scroller');
    const bordNoms = sc.getBoundingClientRect().left + 116;
    let best = null, ecart = Infinity;
    const gauche = (th) => th.getBoundingClientRect().left;
    document.querySelectorAll('.entete-planning-figee .th[data-gi]').forEach((th) => {
      const e = Math.abs(gauche(th) - bordNoms);
      if (e < ecart) { ecart = e; best = th; }
    });
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.getBoundingClientRect().width > 0; };
    return {
      jour: best ? best.textContent.replace(/\s+/g, ' ').trim() : null, ecart: Math.round(ecart),
      menu: document.getElementById('toolbarSecondaire').classList.contains('ouvert'),
      date: document.getElementById('btnDateJourMobile').textContent.trim(), dateVisible: vis('btnDateJourMobile'),
      navVisible: vis('btnSemainePrec') || vis('btnSemainePill') || vis('btnSemaineSuiv'),
      pilule: document.getElementById('btnSemainePill').textContent.trim(),
      toast: (document.getElementById('toast') || {}).textContent || ''
    };
  });
  async function ouvrirMenu() {
    if (!(await page.evaluate(() => document.getElementById('toolbarSecondaire').classList.contains('ouvert')))) await page.click('#btnPlusOutils');
    await page.waitForTimeout(150);
  }
  // Appui sur la pilule date puis choix d'une date dans le calendrier natif
  // (valeur posée + "change", comme le fait le sélecteur du téléphone).
  async function choisirDate(iso) {
    await ouvrirMenu();
    await page.tap('#inputDateJourMobile');
    await page.waitForTimeout(80);
    await page.evaluate((v) => {
      const input = document.getElementById('inputDateJourMobile');
      input.value = v;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, iso);
    await page.waitForTimeout(500);
  }

  // 1) Menu ⋮ en vue "1 jour" : la date à la place de ‹ Sem. N ›.
  await ouvrirMenu();
  let v = await etatVue();
  verifier(v.dateVisible && !v.navVisible && v.date === 'Jeu. 24 sept. 2026 ▾', 'vue 1 jour : date du jour « ' + v.date + ' » à la place de ‹ Sem. N ›');

  // 2) Appui au doigt : il tombe sur le calendrier natif (champ date qui
  //    couvre toute la pilule), réglé sur le jour affiché et borné aux
  //    semaines du planning ; le menu reste ouvert.
  const cal = await page.evaluate(() => {
    const i = document.getElementById('inputDateJourMobile'), r = document.getElementById('btnDateJourMobile').getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { type: i.type, value: i.value, min: i.min, max: i.max, dessus: dessus === i };
  });
  await page.tap('#inputDateJourMobile');
  await page.waitForTimeout(150);
  const menuApresAppui = await page.evaluate(() => document.getElementById('toolbarSecondaire').classList.contains('ouvert'));
  verifier(cal.dessus && cal.type === 'date' && cal.value === '2026-09-24' && cal.min < '2022-01-01' && cal.max > '2031-01-01' && menuApresAppui,
    'appui sur la date : calendrier sur le 24.09.2026 (bornes ' + cal.min + ' → ' + cal.max + '), menu ouvert');

  // 3) Autre semaine.
  await choisirDate('2026-10-15');
  v = await etatVue();
  verifier(!v.menu && /^Jeu ?15/.test(v.jour) && v.ecart <= 1 && v.pilule.indexOf('Sem. 42') === 0 && v.date === 'Jeu. 15 oct. 2026 ▾',
    '15.10.2026 choisi : menu refermé, jeudi 15 affiché (' + v.jour + ', ' + v.pilule + ', « ' + v.date + ' »)');

  // 4) Même semaine (la grille ne change pas de fenêtre).
  await choisirDate('2026-10-13');
  v = await etatVue();
  verifier(/^Mar ?13/.test(v.jour) && v.ecart <= 1 && v.date === 'Mar. 13 oct. 2026 ▾', 'même semaine : mardi 13 affiché (' + v.jour + ')');

  // 5) Week-end masqué : samedi -> vendredi, dimanche -> lundi.
  await choisirDate('2026-10-17');
  v = await etatVue();
  verifier(/^Ven ?16/.test(v.jour) && v.ecart <= 1 && v.toast.indexOf('Week-end masqué') === 0, 'samedi 17 : vendredi 16 affiché, « ' + v.toast + ' »');
  await choisirDate('2026-10-18');
  v = await etatVue();
  verifier(/^Lun ?19/.test(v.jour) && v.ecart <= 1 && v.pilule.indexOf('Sem. 43') === 0, 'dimanche 18 : lundi 19 affiché (' + v.pilule + ')');

  // Week-end affiché : le samedi choisi est affiché tel quel.
  await page.evaluate(() => { afficherWeekends = true; render(false); });
  await page.waitForTimeout(200);
  await choisirDate('2026-10-24');
  v = await etatVue();
  verifier(/^Sam ?24/.test(v.jour) && v.ecart <= 1 && v.date === 'Sam. 24 oct. 2026 ▾', 'week-end affiché : samedi 24 affiché tel quel (' + v.jour + ')');
  await page.evaluate(() => { afficherWeekends = false; render(false); });
  await page.waitForTimeout(200);

  // 6) Date lointaine.
  await choisirDate('2027-03-03');
  await page.waitForTimeout(300);
  v = await etatVue();
  verifier(/^Mer ?0?3/.test(v.jour) && v.ecart <= 1 && v.date === 'Mer. 3 mars 2027 ▾', 'date lointaine : mercredi 3 mars 2027 (' + v.jour + ', « ' + v.date + ' »)');

  // 7) Le libellé suit le swipe.
  await page.evaluate(() => { const sc = document.querySelector('.scroller'); sc.scrollLeft += sc.clientWidth - 116; });
  await page.waitForTimeout(500);
  v = await etatVue();
  const valeurCal = await page.evaluate(() => document.getElementById('inputDateJourMobile').value);
  verifier(/^Jeu ?0?4/.test(v.jour) && v.date === 'Jeu. 4 mars 2027 ▾' && valeurCal === '2027-03-04', 'swipe d\'un jour : « ' + v.date + ' », calendrier sur ' + valeurCal);

  // 8) Vue "1 semaine" : ‹ Sem. N › revient, puis retour à la date.
  await ouvrirMenu();
  await page.click('#btnVueJourMobile');
  await page.waitForTimeout(400);
  await ouvrirMenu();
  v = await etatVue();
  verifier(v.navVisible && !v.dateVisible, 'vue 1 semaine : ‹ Sem. N › de retour, pas de date');
  await page.click('#btnVueJourMobile');
  await page.waitForTimeout(400);
  await ouvrirMenu();
  v = await etatVue();
  verifier(v.dateVisible && !v.navVisible, 'retour en vue 1 jour : la date remplace de nouveau ‹ Sem. N ›');

  // 9) Ordinateur : jamais de date, navigation semaine dans la barre.
  await page.click('#btnPlusOutils');
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.waitForTimeout(600);
  v = await etatVue();
  verifier(!v.dateVisible && v.navVisible, 'ordinateur : ‹ Sem. N › dans la barre, pas de date');
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE + '-1300.png' });

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
