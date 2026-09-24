const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 6) — Lionel : « Sur mobile j'aimerai que les
// défilement des jours soient plus fluides quand on change de semaine, comme
// si la page était infinie » (téléphone, vue "1 jour"). Vérifie sur un
// téléphone simulé (390px, tactile), date figée au jeudi 24.09.2026 :
//   - la vue "1 jour" charge 2 semaines : le lundi suivant est la colonne
//     juste après le vendredi (pas de rechargement pour y aller) ;
//   - la pilule "Sem. N" suit le jour affiché ;
//   - près du bord, la fenêtre glisse d'une semaine SANS que le jour affiché
//     ne bouge à l'écran (même jour, même position au pixel près) ;
//   - retour en arrière symétrique ; ‹ › (même jour de la semaine),
//     Aujourd'hui, bascule "1 semaine" et retour ;
//   - un rendu après un défilement fait pendant un glisser de bulle reste
//     sur le jour visible ;
//   - semaines voisines préchargées en arrière-plan ;
//   - desktop inchangé (1 semaine).
//
// Lancer : node test_defilement_jour_mobile.js

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
  await page.waitForTimeout(400);

  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }
  // Jour affiché = colonne de jour dont le bord gauche est au ras de la colonne des noms.
  const etatVue = () => page.evaluate(() => {
    const sc = document.querySelector('.scroller');
    const bordNoms = sc.getBoundingClientRect().left + 116;
    let best = null, ecart = Infinity;
    // Bord du CONTENU de la colonne (après sa bordure gauche) : le lundi
    // d'une 2e semaine porte la bordure épaisse de début de semaine
    // (.sem-frontiere), qui passe sous la colonne des noms sans rien décaler.
    const gauche = (th) => th.getBoundingClientRect().left + th.clientLeft;
    document.querySelectorAll('.entete-planning-figee .th[data-gi]').forEach((th) => {
      const e = Math.abs(gauche(th) - bordNoms);
      if (e < ecart) { ecart = e; best = th; }
    });
    return {
      jour: best ? best.textContent.replace(/\s+/g, ' ').trim() : null, ecart: Math.round(ecart),
      x: best ? Math.round(gauche(best)) : null,
      fenetre: fenetreLabGs().join(','), pilule: document.getElementById('btnSemainePill').textContent.trim(),
      nbJours: document.querySelectorAll('.entete-planning-figee .th[data-gi]').length,
      jourMobileIso: jourMobileIso, cache: Object.keys(etat.cache).sort().join(',')
    };
  });
  // Fait défiler de `pas` jours (±) comme un swipe aimanté, puis attend l'arrêt.
  async function defiler(pas) {
    await page.evaluate((p) => {
      const sc = document.querySelector('.scroller');
      sc.scrollLeft += p * (sc.clientWidth - 116);
    }, pas);
    await page.waitForTimeout(450);
  }

  let v = await etatVue();
  verifier(v.jour === 'Jeu24' || v.jour === 'Jeu 24', 'au démarrage : jeudi 24 affiché (' + v.jour + ')');
  verifier(v.nbJours === 10 && v.fenetre === '20260921,20260928', 'vue "1 jour" : 2 semaines chargées (' + v.fenetre + ', ' + v.nbJours + ' jours)');
  verifier(v.pilule.indexOf('Sem. 39') === 0, 'pilule : ' + v.pilule);
  await page.waitForTimeout(300);
  v = await etatVue();
  verifier(v.cache.split(',').indexOf('20260914') >= 0 && v.cache.split(',').indexOf('20261005') >= 0, 'semaines voisines préchargées en arrière-plan : ' + v.cache);

  await defiler(1);
  v = await etatVue();
  verifier(/^Ven ?25/.test(v.jour), 'vendredi 25 (' + v.jour + ')');
  const fenetreAvant = v.fenetre;
  await defiler(1);
  v = await etatVue();
  verifier(/^Lun ?28/.test(v.jour) && v.fenetre === fenetreAvant, 'vendredi -> lundi 28 d\'un seul geste, sans rechargement (' + v.jour + ', fenêtre ' + v.fenetre + ')');
  verifier(v.pilule.indexOf('Sem. 40') === 0, 'la pilule suit le jour affiché : ' + v.pilule);

  await defiler(1); await defiler(1);
  v = await etatVue();
  verifier(/^Mer ?30/.test(v.jour) && v.fenetre === fenetreAvant, 'mer. 30 (fenêtre inchangée tant qu\'il reste 2 jours d\'avance)');
  const xAvant = v.x;
  await defiler(1);
  v = await etatVue();
  verifier(/^Jeu ?0?1$/.test(v.jour), 'jeu. 1er oct. (' + v.jour + ')');
  verifier(v.fenetre === '20260928,20261005', 'fenêtre glissée d\'une semaine près du bord : ' + v.fenetre);
  verifier(v.ecart <= 1 && v.x === xAvant, 'aucun saut : jour aligné au pixel près après le glissement (écart ' + v.ecart + 'px, x ' + v.x + ' / ' + xAvant + ')');

  await defiler(-1); await defiler(-1); await defiler(-1);
  v = await etatVue();
  verifier(/^Lun ?28/.test(v.jour) && v.fenetre === '20260921,20260928' && v.ecart <= 1, 'retour en arrière jusqu\'au lun. 28 : fenêtre re-glissée vers la semaine d\'avant (' + v.fenetre + ', écart ' + v.ecart + 'px)');
  await defiler(-1);
  v = await etatVue();
  verifier(/^Ven ?25/.test(v.jour) && v.pilule.indexOf('Sem. 39') === 0, 'lundi -> vendredi précédent d\'un seul geste (' + v.jour + ', ' + v.pilule + ')');

  // ‹ › : même jour de la semaine, une semaine avant/après.
  await page.evaluate(() => { document.getElementById('btnPlusOutils').click(); document.getElementById('btnSemaineSuiv').click(); });
  await page.waitForTimeout(400);
  v = await etatVue();
  verifier(/^Ven ?0?2$/.test(v.jour) && v.pilule.indexOf('Sem. 40') === 0 && v.ecart <= 1, '› : vendredi de la semaine suivante (' + v.jour + ', ' + v.pilule + ')');

  // Aujourd'hui.
  await page.evaluate(() => document.getElementById('btnAujourdhui').click());
  await page.waitForTimeout(400);
  v = await etatVue();
  verifier(/^Jeu ?24/.test(v.jour) && v.pilule.indexOf('Sem. 39') === 0 && v.ecart <= 1, 'Aujourd\'hui : jeudi 24 (' + v.jour + ')');

  // Défilement pendant un glisser de bulle (défilement automatique au bord :
  // l'arrêt n'est pas pris en compte tant que le geste dure), puis rendu
  // après le dépôt : l'écran doit rester sur le jour réellement visible.
  await page.evaluate(() => { document.body.classList.add('en-glissement'); const sc = document.querySelector('.scroller'); sc.scrollLeft += sc.clientWidth - 116; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.body.classList.remove('en-glissement'); render(false); });
  await page.waitForTimeout(100);
  v = await etatVue();
  verifier(/^Ven ?25/.test(v.jour) && v.ecart <= 1, 'rendu après un défilement pendant un glisser : reste sur le jour visible (' + v.jour + ')');

  // Bascule "1 semaine" puis retour.
  await page.evaluate(() => { if (!document.getElementById('toolbarSecondaire').classList.contains('ouvert')) document.getElementById('btnPlusOutils').click(); document.getElementById('btnVueJourMobile').click(); });
  await page.waitForTimeout(400);
  v = await etatVue();
  verifier(v.nbJours === 5 && v.fenetre === '20260921', 'vue "1 semaine" : une seule semaine (' + v.fenetre + ')');
  await page.evaluate(() => { if (!document.getElementById('toolbarSecondaire').classList.contains('ouvert')) document.getElementById('btnPlusOutils').click(); document.getElementById('btnVueJourMobile').click(); });
  await page.waitForTimeout(400);
  v = await etatVue();
  verifier(v.nbJours === 10 && /^Jeu ?24/.test(v.jour), 'retour en "1 jour" : 2 semaines, jeudi 24 (' + v.jour + ')');

  // Rotation / fenêtre élargie au-delà de 600px : retour à 1 semaine, sans erreur.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(500);
  v = await etatVue();
  verifier(v.nbJours === 5 && v.fenetre === '20260921', 'au-delà de 600px : 1 semaine comme avant (' + v.fenetre + ')');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(500);
  v = await etatVue();
  verifier(v.nbJours === 10 && /^Jeu ?24/.test(v.jour), 'de retour sous 600px : 2 semaines, jeudi 24 (' + v.jour + ')');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
