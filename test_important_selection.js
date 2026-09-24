const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 14) — Lionel : « Ajoutez le flag important à
// la pilule de sélection simple et multiple afin de pouvoir mettre un texte
// important sur une ou plusieurs cases en même temps ». Vérifie, sur
// ordinateur puis téléphone, date figée au jeudi 24.09.2026, contre un faux
// Supabase (tâches en table, notes via un faux enregistrer-plage) :
//   1) bulle seule : ⚑ visible, pose puis retire le drapeau, table relue,
//      bulle rouge, sélection conservée, ⚑ plein quand important ;
//   2) sélection multiple mélangée (tâche, tâche déjà importante, note) :
//      ⚑ creux, un appui marque tout, un second retire tout, note envoyée
//      au serveur avec le bon drapeau ; Ctrl+Z en une étape, note comprise
//      (elle disparaissait : cf. diffsNotes, suppressions d'abord) ;
//   3) jalon : ⚑ caché s'il est seul, ignoré dans un mélange ; le message
//      s'affiche au-dessus de la pilule, pas dessus ;
//   4) téléphone 390 et 320 px : la pilule, ⚑ compris, tient dans l'écran
//      sans chevauchement, mode multiple (flèches) affiché, message au-dessus.
//
// Lancer : node test_important_selection.js

const FAUX_SUPABASE = '(' + function () {
  var BD = window.__BD = {
    personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }],
    chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }],
    statuts: [], feries: [], categories_feries: [], couleurs_perso: [], assignations: [], series: [],
    jalons: (window.__JALONS_INITIALES || []).map(function (j, i) { return Object.assign({ id: 500 + i }, j); }),
    notes: (window.__NOTES_INITIALES || []).map(function (n, i) { return Object.assign({ id: 700 + i }, n); }),
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
      functions: { invoke: function (nom, opts) {
        // Journal des appels + enregistrement minimal d'une note d'un jour,
        // avec les mêmes règles que planPlage (enregistrer-plage/logic.js) :
        // l'origine retirée est LA ligne de même texte ET même drapeau, et
        // une note de même texte déjà présente ce jour-là n'est pas reposée.
        var b = (opts && opts.body) || {};
        (window.__INVOCATIONS = window.__INVOCATIONS || []).push({ nom: nom, body: JSON.parse(JSON.stringify(b)) });
        if (nom === 'enregistrer-plage' && b.kind === 'note') {
          if (b.origine && b.origine.texte) {
            var o = BD.notes.find(function (n) { return n.date === b.origine.dateDebut && n.texte === b.origine.texte && !!n.important === !!b.origine.important; });
            if (o) BD.notes = BD.notes.filter(function (n) { return n !== o; });
          }
          if (b.texte && !BD.notes.some(function (n) { return n.date === b.dateDebut && n.texte === b.texte; })) {
            BD.notes.push({ id: prochainId++, date: b.dateDebut, texte: b.texte, important: !!b.important, serie_id: null, demi: null });
          }
        }
        return Promise.resolve({ data: {}, error: null });
      } },
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
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.addInitScript((d) => { window.__TACHES_INITIALES = d.taches; window.__NOTES_INITIALES = d.notes; window.__JALONS_INITIALES = d.jalons; }, {
    taches: [
      lignes('2026-09-21', 'matin', 'Alpha'), lignes('2026-09-21', 'aprem', 'Alpha'),
      lignes('2026-09-22', 'matin', 'Bravo'),
      lignes('2026-09-23', 'matin', 'Charlie', { personne_id: 2, important: true }), lignes('2026-09-23', 'aprem', 'Charlie', { personne_id: 2, important: true })
    ],
    notes: [{ date: '2026-09-23', texte: 'Note N', important: false, serie_id: null, demi: null }],
    jalons: [{ date: '2026-09-24', texte: 'Jalon J', serie_id: null, demi: null, chantier_id: null, important: false }]
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
  const attendreSync = () => page.waitForTimeout(800);
  const bulle = (tx) => '.grille .bulle:has-text("' + tx + '")';
  async function clic(tx, modifiers) { await page.click(bulle(tx), modifiers ? { modifiers: modifiers } : {}); await page.waitForTimeout(80); }
  const drapeau = () => page.evaluate(() => { const b = document.getElementById('selImportant'); return { visible: !b.hidden && b.getBoundingClientRect().width > 0, plein: b.classList.contains('actif'), pressed: b.getAttribute('aria-pressed') }; });
  const importantLocal = (tx) => page.evaluate((t) => { const all = TACHES.concat(NOTES); const it = all.find((x) => x.texte === t); return it ? !!it.important : null; }, tx);
  const bulleRouge = (tx) => page.evaluate((t) => { const b = Array.from(document.querySelectorAll('.grille .bulle')).find((x) => x.textContent.trim() === t); return !!b && b.classList.contains('important'); }, tx);
  const bdTache = (tx) => page.evaluate((t) => { const r = window.__BD.taches.filter((x) => x.texte === t); return r.length && r.every((x) => x.important) ? 'oui' : r.some((x) => x.important) ? 'mixte' : 'non'; }, tx);
  const bdNote = (tx) => page.evaluate((t) => { const n = window.__BD.notes.find((x) => x.texte === t); return n ? !!n.important : null; }, tx);
  const selection = () => page.evaluate(() => Object.keys(bullesSelectionnees).map((id) => itemParId(id) ? itemParId(id).item.texte : '?').sort().join(','));
  const toastTexte = () => page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  // Le message ne recouvre pas la pilule (il passe au-dessus pendant une
  // sélection) : bas du toast visible ≤ haut de la pilule.
  const toastAuDessus = () => page.evaluate(() => {
    const t = document.getElementById('toast'), p = document.getElementById('panneauSelection');
    return !!t && t.classList.contains('show') && !p.hidden && t.getBoundingClientRect().bottom <= p.getBoundingClientRect().top;
  });

  // 1) Bulle seule.
  await clic('Alpha');
  let d = await drapeau();
  verifier(d.visible && !d.plein && d.pressed === 'false', 'bulle seule : ⚑ dans la pilule, creux');
  await page.click('#selImportant');
  await attendreSync();
  d = await drapeau();
  verifier(await importantLocal('Alpha') === true && await bulleRouge('Alpha') && await bdTache('Alpha') === 'oui', '⚑ : Alpha importante (grille, bulle rouge, table relue)');
  verifier(d.plein && d.pressed === 'true' && await selection() === 'Alpha', '⚑ plein, Alpha toujours sélectionnée');
  await page.click('#selImportant');
  await attendreSync();
  d = await drapeau();
  verifier(await importantLocal('Alpha') === false && !(await bulleRouge('Alpha')) && await bdTache('Alpha') === 'non' && !d.plein, '⚑ une 2e fois : drapeau retiré (table relue), ⚑ creux');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);

  // 2) Sélection multiple mélangée.
  await clic('Alpha', ['Control']);
  await clic('Charlie', ['Control']);
  await clic('Note N', ['Control']);
  d = await drapeau();
  verifier(await selection() === 'Alpha,Charlie,Note N' && d.visible && !d.plein, 'Alpha + Charlie (déjà importante) + une note : ⚑ creux');
  await page.evaluate(() => { window.__INVOCATIONS = []; });
  await page.click('#selImportant');
  await attendreSync();
  d = await drapeau();
  const envoiNote = (valeur) => page.evaluate((v) => (window.__INVOCATIONS || []).some((c) => c.nom === 'enregistrer-plage' && c.body.kind === 'note' && c.body.texte === 'Note N' && c.body.important === v), valeur);
  verifier(await bdTache('Alpha') === 'oui' && await bdTache('Charlie') === 'oui' && await envoiNote(true) && await bdNote('Note N') === true, 'un appui : les trois importantes (tâches relues, note envoyée avec important)');
  verifier(d.plein && await selection() === 'Alpha,Charlie,Note N' && (await toastTexte()).indexOf('Marqué important (3)') === 0, '⚑ plein, sélection conservée, message « ' + await toastTexte() + ' »');
  await page.evaluate(() => { window.__INVOCATIONS = []; });
  await page.click('#selImportant');
  await attendreSync();
  verifier(await bdTache('Alpha') === 'non' && await bdTache('Charlie') === 'non' && await envoiNote(false) && await bdNote('Note N') === false, 'second appui : drapeau retiré aux trois, Charlie comprise');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await attendreSync();
  verifier(await importantLocal('Alpha') === true && await importantLocal('Charlie') === true && await importantLocal('Note N') === true && await bdTache('Alpha') === 'oui' && await bdNote('Note N') === true, 'Ctrl+Z : les trois redeviennent importantes d\'un coup (table relue)');

  // 3) Jalon.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await clic('Jalon J');
  d = await drapeau();
  verifier(await selection() === 'Jalon J' && !d.visible, 'jalon seul : pas de ⚑ (drapeau réglé sur la page Jalons)');
  await clic('Bravo', ['Control']);
  d = await drapeau();
  verifier(d.visible && !d.plein, 'jalon + Bravo : ⚑ visible');
  await page.click('#selImportant');
  await attendreSync();
  verifier(await bdTache('Bravo') === 'oui' && (await toastTexte()).indexOf('Marqué important (1) — jalon(s)') === 0 && await toastAuDessus(), 'Bravo marquée, jalon ignoré : « ' + await toastTexte() + ' », message au-dessus de la pilule');
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE + '-1300.png' });

  // 4) Téléphone : la pilule tient, sans chevauchement.
  await page.keyboard.press('Escape');
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const ids = TACHES.filter((t) => t.texte === 'Bravo' || t.texte === 'Alpha').map((t) => t.id);
      bullesSelectionnees = {}; ids.forEach((id) => { bullesSelectionnees[id] = true; });
      modeSelectionMultiple = true; majBarreSelection();
    });
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => {
      const p = document.getElementById('panneauSelection'), rp = p.getBoundingClientRect();
      const r = Array.from(p.querySelectorAll('.toolbar-btn, .sel-compte')).filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect());
      let chev = 0;
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1) chev++;
      return { dedans: rp.left >= 0 && rp.right <= window.innerWidth, horsPilule: r.filter((x) => x.left < rp.left - 1 || x.right > rp.right + 1).length, chev: chev, n: r.length,
        drapeau: document.getElementById('selImportant').getBoundingClientRect().width > 0 };
    });
    await page.evaluate(() => toast('Marqué important (2).'));
    await page.waitForTimeout(250);
    verifier(m.dedans && !m.horsPilule && !m.chev && m.drapeau && m.n === 9 && await toastAuDessus(), w + ' px : pilule dans l\'écran, ⚑ visible, ' + m.n + ' éléments sans chevauchement, message au-dessus');
    if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE + '-' + w + '.png' });
  }

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
