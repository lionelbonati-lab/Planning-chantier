const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 15) — Lionel : « tu ajoutes une icône
// calendrier où on pourra sélectionner un jour [...] Cette icône
// calendrier sera aussi affichée dans la toolbar à côté de aujourd'hui. 1
// semaine seulement l'icône ». Suite 17 — Lionel : « Sur mobile, le
// calendrier se retrouve dans la toolbar et dans le menu 3 points.
// L'enlever du menu 3 points. Les icônes sont mal centrées dans le menu 3
// points. Remettre dans le menu 3 points l'affichage et le défilement des
// semaines comme avant ». Vérifie sur un téléphone simulé (390px,
// tactile), date figée au jeudi 24.09.2026 :
//   - menu ⋮, vue "1 jour" : ‹ Sem. N › comme avant (‹ › changent de
//     semaine, même jour), « 1 semaine » en icône seule et centrée, pas de
//     calendrier ; barre : calendrier collé à Aujourd'hui ;
//   - un appui sur l'icône tombe sur le calendrier natif (<input
//     type="date"> qui la couvre, sur le jour affiché, borné aux semaines
//     du planning) ;
//   - une date choisie : menu refermé, jour affiché — autre semaine, même
//     semaine, date lointaine ; samedi/dimanche masqués -> vendredi/lundi,
//     affichés tels quels si le week-end est visible ;
//   - le calendrier suit le swipe ;
//   - vue "1 semaine" : « 1 semaine » teinté, une date choisie mène à sa
//     semaine sans quitter la vue ;
//   - barre à 320px sans chevauchement.
// Suite 16 — Lionel : « oui, ajoute aussi l'icône sur ordinateur et
// tablette ». Ordinateur (1300px, souris) puis tablette (820px, tactile) :
//   - calendrier collé à Aujourd'hui dans la barre, jamais de ligne
//     « calendrier + 1 semaine » dans le menu ⋮ ; barre sans chevauchement ;
//   - à la souris, un clic ouvre le calendrier (.showPicker()) ; au doigt,
//     l'appui tombe sur le champ lui-même (sans .showPicker()) ;
//   - une date choisie amène sa semaine (1 ou 2 semaines affichées), le
//     calendrier suit (Aujourd'hui compris).
//
// Lancer : node test_calendrier_mobile.js

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
  // .showPicker() remplacé par un compteur : seul son appel compte ici (le
  // vrai calendrier, en headless, garderait le focus du champ).
  async function nouvellePage(options) {
    const p = await browser.newPage(options);
    p.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
    await p.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
    await p.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await p.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
    await p.addInitScript(() => {
      window.__TACHES_INITIALES = [];
      window.__showPicker = 0;
      HTMLInputElement.prototype.showPicker = function () { window.__showPicker++; };
    });
    await p.goto('file://' + path.join(__dirname, 'index.html'));
    await p.waitForSelector('#legendeBarre');
    await p.waitForTimeout(500);
    return p;
  }
  let page = await nouvellePage({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }
  const BARRE = '#btnCalendrierBarre .date-picker-jour';
  // Jour affiché = colonne de jour au ras de la colonne des noms. Bord
  // EXTÉRIEUR de la colonne : c'est lui qu'un saut vers un jour
  // (Aujourd'hui, ‹ ›, calendrier) aligne (cf. decalerSurColonne_,
  // grille-rendu.js) — un lundi de 2e semaine garde donc sa bordure de
  // début de semaine visible (3px).
  const etatVue = () => page.evaluate(() => {
    const sc = document.querySelector('.scroller');
    const bordNoms = sc.getBoundingClientRect().left + largeurNoms();
    let best = null, ecart = Infinity;
    document.querySelectorAll('.entete-planning-figee .th[data-gi]').forEach((th) => {
      const e = Math.abs(th.getBoundingClientRect().left - bordNoms);
      if (e < ecart) { ecart = e; best = th; }
    });
    const vis = (el) => !!el && el.getBoundingClientRect().width > 0;
    return {
      jour: best ? best.textContent.replace(/\s+/g, ' ').trim() : null, ecart: Math.round(ecart),
      menu: document.getElementById('toolbarSecondaire').classList.contains('ouvert'),
      navVisible: ['btnSemainePrec', 'btnSemainePill', 'btnSemaineSuiv'].every((id) => vis(document.getElementById(id)) && !!document.getElementById(id).closest('#toolbarSecondaire')),
      calDansMenu: !!document.querySelector('#toolbarSecondaire .btn-calendrier') || !!document.getElementById('btnCalendrierMenu'), calBarre: vis(document.getElementById('btnCalendrierBarre')),
      vue1Sem: vis(document.getElementById('btnVueJourMobile')),
      vue1SemActif: document.getElementById('btnVueJourMobile').classList.contains('actif') && document.getElementById('btnVueJourMobile').getAttribute('aria-pressed') === 'true',
      pilule: document.getElementById('btnSemainePill').textContent.trim(),
      valeur: document.querySelector('#btnCalendrierBarre .date-picker-jour').value,
      vueJour: vueJourMobile, toast: (document.getElementById('toast') || {}).textContent || ''
    };
  });
  async function ouvrirMenu() {
    if (!(await page.evaluate(() => document.getElementById('toolbarSecondaire').classList.contains('ouvert')))) await page.click('#btnPlusOutils');
    await page.waitForTimeout(150);
  }
  // Appui sur l'icône calendrier de la barre puis choix d'une date (valeur
  // posée + "change", comme le fait le calendrier du téléphone).
  async function choisirDate(iso) {
    await page.tap(BARRE);
    await page.waitForTimeout(80);
    await page.evaluate((d) => {
      const input = document.querySelector('#btnCalendrierBarre .date-picker-jour');
      input.value = d;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, iso);
    await page.waitForTimeout(500);
  }

  // 1) Vue "1 jour" : menu (‹ Sem. N › comme avant, « 1 semaine » en icône
  //    seule et centrée, pas de calendrier) et barre (calendrier).
  await ouvrirMenu();
  let v = await etatVue();
  const disposition = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const b = document.getElementById('btnVueJourMobile'), sem = r(b), ico = r(b.querySelector('svg'));
    const auj = r(document.getElementById('btnAujourdhui')), calB = r(document.getElementById('btnCalendrierBarre'));
    return { texte: b.innerText.trim(),
      centre: [(ico.left + ico.width / 2) - (sem.left + sem.width / 2), (ico.top + ico.height / 2) - (sem.top + sem.height / 2)].map((x) => Math.round(x * 10) / 10),
      barre: Math.abs((auj.top + auj.height / 2) - (calB.top + calB.height / 2)) < 1 && calB.left >= auj.right && calB.left - auj.right < 6,
      memeGroupe: document.getElementById('btnCalendrierBarre').parentElement.id };
  });
  verifier(v.navVisible && v.pilule.indexOf('Sem. 39') === 0 && !v.calDansMenu, 'menu, vue 1 jour : ‹ Sem. 39 › affiché comme avant, pas d\'icône calendrier');
  verifier(v.vue1Sem && disposition.texte === '' && Math.abs(disposition.centre[0]) <= 1 && Math.abs(disposition.centre[1]) <= 1, 'menu : « 1 semaine » en icône seule, centrée dans son bouton (écart ' + disposition.centre + ')');
  verifier(v.calBarre && disposition.barre && disposition.memeGroupe === 'groupeAujourdhui', 'barre : calendrier collé à droite d\'Aujourd\'hui');

  // 2) Menu, vue "1 jour" : ‹ › changent de semaine, même jour de la semaine.
  await page.click('#btnSemaineSuiv');
  await page.waitForTimeout(500);
  v = await etatVue();
  verifier(/^Jeu ?0?1/.test(v.jour) && v.pilule.indexOf('Sem. 40') === 0 && v.valeur === '2026-10-01', '› : jeudi 1er octobre, semaine 40 (' + v.jour + ', ' + v.pilule + ', calendrier sur ' + v.valeur + ')');
  await ouvrirMenu();
  await page.click('#btnSemainePrec');
  await page.waitForTimeout(500);
  v = await etatVue();
  verifier(/^Jeu ?24/.test(v.jour) && v.pilule.indexOf('Sem. 39') === 0 && v.valeur === '2026-09-24', '‹ : retour au jeudi 24, semaine 39 (' + v.jour + ')');
  if (v.menu) await page.click('#btnPlusOutils');
  await page.waitForTimeout(150);

  // 3) Appui : il tombe sur le calendrier natif, jour affiché, bornes.
  const cal = await page.evaluate((sel) => {
    const i = document.querySelector(sel), r = document.getElementById('btnCalendrierBarre').getBoundingClientRect();
    return { dessus: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === i, type: i.type, value: i.value, min: i.min, max: i.max };
  }, BARRE);
  verifier(cal.dessus && cal.type === 'date' && cal.value === '2026-09-24' && cal.min < '2022-01-01' && cal.max > '2031-01-01',
    'appui sur le calendrier de la barre : sur le 24.09.2026 (bornes ' + cal.min + ' → ' + cal.max + ')');

  // 4) Autre semaine, menu ⋮ ouvert : il se referme.
  await ouvrirMenu();
  await choisirDate('2026-10-15');
  v = await etatVue();
  verifier(!v.menu && /^Jeu ?15/.test(v.jour) && v.ecart <= 1 && v.pilule.indexOf('Sem. 42') === 0 && v.valeur === '2026-10-15',
    '15.10.2026 : menu refermé, jeudi 15 affiché (' + v.jour + ', ' + v.pilule + ')');

  // 5) Même semaine.
  await choisirDate('2026-10-13');
  v = await etatVue();
  verifier(/^Mar ?13/.test(v.jour) && v.ecart <= 1 && v.valeur === '2026-10-13', '13.10.2026 : mardi 13 affiché (' + v.jour + ')');

  // 6) Week-end masqué : samedi -> vendredi, dimanche -> lundi.
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
  verifier(/^Sam ?24/.test(v.jour) && v.ecart <= 1, 'week-end affiché : samedi 24 affiché tel quel (' + v.jour + ')');
  await page.evaluate(() => { afficherWeekends = false; render(false); });
  await page.waitForTimeout(200);

  // 7) Date lointaine.
  await choisirDate('2027-03-03');
  await page.waitForTimeout(300);
  v = await etatVue();
  verifier(/^Mer ?0?3/.test(v.jour) && v.ecart <= 1, 'date lointaine : mercredi 3 mars 2027 (' + v.jour + ')');

  // 8) Le calendrier suit le swipe.
  await page.evaluate(() => { const sc = document.querySelector('.scroller'); sc.scrollLeft += sc.clientWidth - largeurNoms(); });
  await page.waitForTimeout(500);
  v = await etatVue();
  verifier(/^Jeu ?0?4/.test(v.jour) && v.valeur === '2027-03-04', 'swipe d\'un jour : calendrier sur ' + v.valeur);

  // 8 bis) Vue "1 semaine" : ‹ Sem. N › toujours là, « 1 semaine » teinté ;
  //    une date mène à sa semaine sans quitter la vue ; retour en "1 jour".
  await ouvrirMenu();
  await page.click('#btnVueJourMobile');
  await page.waitForTimeout(400);
  await ouvrirMenu();
  v = await etatVue();
  verifier(v.navVisible && !v.calDansMenu && v.vue1SemActif && !v.vueJour, 'vue 1 semaine : ‹ Sem. N › affiché, « 1 semaine » teinté, pas de calendrier dans le menu');
  await page.click('#btnPlusOutils');
  await page.waitForTimeout(150);
  await choisirDate('2026-11-11');
  v = await etatVue();
  verifier(!v.vueJour && v.pilule.indexOf('Sem. 46') === 0 && v.valeur === '2026-11-09', 'vue 1 semaine, 11.11.2026 : semaine 46, toujours en vue 1 semaine (' + v.pilule + ', calendrier sur ' + v.valeur + ')');
  await ouvrirMenu();
  await page.click('#btnVueJourMobile');
  await page.waitForTimeout(400);
  await ouvrirMenu();
  v = await etatVue();
  verifier(v.navVisible && !v.vue1SemActif && v.vueJour, 'retour en vue 1 jour : ‹ Sem. N › toujours affiché');
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE + '-390.png' });
  await page.click('#btnPlusOutils');

  // 9) Barre à 320px : tout tient, sans chevauchement.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(500);
  const barre = await page.evaluate(() => {
    const b = document.getElementById('legendeBarre'), rb = b.getBoundingClientRect();
    const el = Array.from(b.querySelectorAll('.toolbar-btn, .select-chantier-btn')).filter((e) => !e.closest('.toolbar-secondaire') && e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect());
    let chev = 0;
    for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) if (el[i].left < el[j].right - 1 && el[j].left < el[i].right - 1) chev++;
    return { dedans: el.every((r) => r.left >= rb.left - 1 && r.right <= rb.right + 1), chev: chev, n: el.length };
  });
  verifier(barre.dedans && !barre.chev, '320 px : barre (' + barre.n + ' boutons, calendrier compris) sans chevauchement ni débordement');

  // 10) Ordinateur (souris) puis tablette (tactile) : icône dans la barre,
  //     collée à Aujourd'hui ; une date choisie amène sa semaine.
  const barreSansChevauchement = () => page.evaluate(() => {
    const b = document.getElementById('legendeBarre'), rb = b.getBoundingClientRect();
    const el = Array.from(b.querySelectorAll('.toolbar-btn, .select-chantier-btn, .zoom-pill')).filter((e) => !e.closest('.toolbar-secondaire') && e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect());
    let chev = 0;
    for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) if (el[i].left < el[j].right - 1 && el[j].left < el[i].right - 1 && el[i].top < el[j].bottom - 1 && el[j].top < el[i].bottom - 1) chev++;
    return el.every((r) => r.left >= rb.left - 1 && r.right <= rb.right + 1) && !chev;
  });
  const dispositionBarre = () => page.evaluate(() => {
    const auj = document.getElementById('btnAujourdhui').getBoundingClientRect(), cal = document.getElementById('btnCalendrierBarre').getBoundingClientRect();
    const i = document.querySelector('#btnCalendrierBarre .date-picker-jour');
    return {
      collee: cal.width > 0 && Math.abs((auj.top + auj.height / 2) - (cal.top + cal.height / 2)) < 1 && cal.left >= auj.right && cal.left - auj.right < 6 && Math.abs(cal.width - auj.width) < 1,
      groupe: document.getElementById('btnCalendrierBarre').parentElement.id,
      dessus: document.elementFromPoint(cal.left + cal.width / 2, cal.top + cal.height / 2) === i,
      ligneMenu: document.querySelector('.ligne-vue-mobile').getBoundingClientRect().width > 0
    };
  });
  const semaine = () => page.evaluate(() => ({
    pilule: document.getElementById('btnSemainePill').textContent.trim(),
    valeur: document.querySelector('#btnCalendrierBarre .date-picker-jour').value,
    menu: document.getElementById('toolbarSecondaire').classList.contains('ouvert'),
    picker: window.__showPicker
  }));
  async function choisirDateBarre(iso, geste) {
    if (geste === 'tap') await page.tap(BARRE); else await page.click(BARRE);
    await page.waitForTimeout(80);
    await page.evaluate((d) => {
      const input = document.querySelector('#btnCalendrierBarre .date-picker-jour');
      input.value = d;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, iso);
    await page.waitForTimeout(500);
  }

  await page.close();
  page = await nouvellePage({ viewport: { width: 1300, height: 800 } });
  let d = await dispositionBarre();
  verifier(d.collee && d.groupe === 'groupeAujourdhui' && d.dessus && !d.ligneMenu, 'ordinateur : calendrier collé à droite d\'Aujourd\'hui, même gabarit, rien dans le menu ⋮');
  verifier(await barreSansChevauchement(), 'ordinateur : barre sans chevauchement ni débordement');
  await page.click(BARRE);
  await page.waitForTimeout(80);
  let sem = await semaine();
  const bornes = await page.evaluate(() => { const i = document.querySelector('#btnCalendrierBarre .date-picker-jour'); return [i.min, i.max]; });
  verifier(sem.picker === 1 && sem.valeur === '2026-09-24' && bornes[0] < '2022-01-01' && bornes[1] > '2031-01-01', 'ordinateur, clic : calendrier ouvert (.showPicker) sur aujourd\'hui, borné (' + bornes + ')');
  await page.evaluate(() => { const i = document.querySelector('#btnCalendrierBarre .date-picker-jour'); i.value = '2026-11-11'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(500);
  sem = await semaine();
  verifier(sem.pilule.indexOf('Sem. 46') === 0 && sem.valeur === '2026-11-09', 'ordinateur, 11.11.2026 : semaine 46 affichée (' + sem.pilule + ', calendrier sur ' + sem.valeur + ')');
  await choisirDateBarre('2026-11-13');
  sem = await semaine();
  verifier(sem.pilule.indexOf('Sem. 46') === 0, 'ordinateur, même semaine : rien ne bouge (' + sem.pilule + ')');
  await page.click('#btnDeuxSemaines');
  await page.waitForTimeout(500);
  await choisirDateBarre('2026-12-03');
  sem = await semaine();
  const deux = await page.evaluate(() => Array.from(document.querySelectorAll('.entete-planning-figee .th[data-gi]')).length);
  verifier(sem.pilule.indexOf('Sem. 49') === 0 && deux >= 10, 'ordinateur, 2 semaines, 03.12.2026 : semaine 49 en tête (' + sem.pilule + ', ' + deux + ' jours)');
  await page.click('#btnAujourdhui');
  await page.waitForTimeout(500);
  sem = await semaine();
  verifier(sem.pilule.indexOf('Sem. 39') === 0 && sem.valeur === '2026-09-24', 'ordinateur, Aujourd\'hui : semaine 39, calendrier de nouveau sur le 24.09');
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE + '-1300.png', clip: { x: 0, y: 0, width: 1300, height: 160 } });

  await page.close();
  page = await nouvellePage({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
  d = await dispositionBarre();
  verifier(d.collee && d.groupe === 'groupeAujourdhui' && d.dessus && !d.ligneMenu, 'tablette : calendrier collé à droite d\'Aujourd\'hui, l\'appui tombe sur le champ, rien dans le menu ⋮');
  verifier(await barreSansChevauchement(), 'tablette : barre sans chevauchement ni débordement');
  await choisirDateBarre('2026-10-21', 'tap');
  sem = await semaine();
  verifier(sem.picker === 0 && sem.pilule.indexOf('Sem. 43') === 0 && sem.valeur === '2026-10-19' && !sem.menu, 'tablette, appui puis 21.10.2026 : calendrier du système (pas de .showPicker), semaine 43 (' + sem.pilule + ')');
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE + '-820.png', clip: { x: 0, y: 0, width: 820, height: 160 } });
  await page.setViewportSize({ width: 601, height: 900 });
  await page.waitForTimeout(500);
  d = await dispositionBarre();
  verifier(d.collee && await barreSansChevauchement(), '601 px (au-dessus du téléphone) : calendrier présent, barre sans chevauchement');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
