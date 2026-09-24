const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 21) — Lionel : « j'ai une bordure résiduelle
// sur le bord gauche des note, uniquement quand elles font une demi
// journée. Lors d'une sélection multiple je ne peux pas glisser déposer par
// demi-journée. Raccourcir une bulle d'un jour posé un lundi après-midi
// avec la poignée la décale contre la gauche au lundi matin et sa grandeur
// reste de 1 jour complet. J'ai réussi a produire un bug ou des cellules
// paraissent sélectionné alors que non. Plusieurs déplacement avec les
// boutons gauche/droite de la barre de sélection ont causé ce bug. »
//
// Date figée au jeudi 24.09.2026 (semaine du 21 au 25), faux Supabase dont
// chaque réponse peut être retardée (window.__DELAI, pour qu'un 2e clic
// tombe PENDANT l'écriture du 1er, comme sur le vrai réseau).
//   1) note d'une demi-journée : plus de trait gris (::after) sur son bord ;
//   2) poignée droite d'une bulle « lundi après-midi -> mardi matin » tirée
//      sur la moitié droite du lundi : lundi APRÈS-MIDI seul (avant : lundi
//      entier, calé à gauche) — aperçu compris ; règles pures des 2 poignées ;
//   3) sélection de 2 bulles glissée à la souris sur un après-midi : les 2
//      se décalent d'une demi-journée (aperçu : 1 surbrillance par bulle) ;
//   4) 3 clics rapides sur la flèche → de la pilule pendant que le serveur
//      répond lentement : les 3 décalages sont enregistrés, et aucune
//      bulle n'est dessinée sélectionnée sans l'être (ni bulle fantôme).
//
// Lancer : node test_corrections_suite21.js

const FAUX_SUPABASE = '(' + function () {
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
          var t = b.kind === 'jalon' ? 'jalons' : 'notes';
          if (b.origine && b.origine.texte) {
            var o = BD[t].find(function (r) { return r.date === b.origine.dateDebut && r.texte === b.origine.texte; });
            if (o) BD[t] = BD[t].filter(function (r) { return r !== o; });
          }
          if (b.texte) BD[t].push({ id: prochainId++, date: b.dateDebut, texte: b.texte, important: !!b.important, serie_id: null, demi: b.demiDebut || null });
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
    taches: [].concat(
      journee('2026-09-21', 'Décoffrage'),
      journee('2026-09-21', 'Béton', { personne_id: 2 }),
      [tache('2026-09-21', 'aprem', 'Lundi-aprem', { personne_id: 3 }), tache('2026-09-22', 'matin', 'Lundi-aprem', { personne_id: 3 })]
    ),
    notes: [{ date: '2026-09-21', texte: 'test', important: false, serie_id: null, demi: 'matin' }],
    jalons: []
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
  const bulle = (tx) => '.grille .bulle:has-text("' + tx + '")';
  const cellule = (p, j, demi) => '.cell[data-kind="personne"][data-personne="' + p + '"][data-jour="' + j + '"][data-demi="' + demi + '"]';
  async function auRepos() {
    await page.waitForFunction(() => !syncEnCours && !syncRelance, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.waitForFunction(() => !syncEnCours && !syncRelance, null, { timeout: 15000 });
  }
  const forme = (tx) => page.evaluate((t) => {
    const it = TACHES.concat(NOTES, JALONS).filter((x) => x.texte === t).map((x) => isoDeGi(x.giDebut) + ' ' + x.duree + 'j ' + (x.demiDebut || '-') + '/' + (x.demiFin || '-'));
    return it.sort().join(', ');
  }, tx);
  const bd = (table, texte) => page.evaluate((a) => window.__BD[a.table].filter((r) => r.texte === a.texte)
    .map((r) => (r.personne_id ? r.personne_id + ':' : '') + r.date + ' ' + (r.demi || 'jour')).sort().join(', '), { table, texte });
  async function glisser(x0, y0, x1, y1, avantLacher) {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10); await page.waitForTimeout(25); }
    if (avantLacher) await avantLacher();
    await page.mouse.up();
  }

  // 1) Note d'une demi-journée : plus de trait gris sur son bord.
  const trait = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.grille .bulle')).find((x) => /test/.test(x.textContent));
    return { demi: b.classList.contains('bulle-demi-matin'), after: getComputedStyle(b, '::after').content };
  });
  verifier(trait.demi && (trait.after === 'none' || trait.after === 'normal'), 'note « matin » : plus de trait résiduel sur son bord gauche (::after = ' + trait.after + ')');

  // 2) Poignée droite de « Lundi-aprem » (lundi aprem -> mardi matin) tirée
  //    sur la moitié droite du lundi.
  verifier(await forme('Lundi-aprem') === '2026-09-21 2j aprem/matin', 'départ : bulle d’un jour posée lundi après-midi (' + await forme('Lundi-aprem') + ')');
  const poignee = await page.locator(bulle('Lundi-aprem') + ' [data-poignee="droite"]').boundingBox();
  const lunAprem = await page.locator(cellule(3, 0, 'aprem')).boundingBox();
  let apercu = null;
  await glisser(poignee.x + poignee.width / 2, poignee.y + poignee.height / 2, lunAprem.x + lunAprem.width * 0.6, lunAprem.y + lunAprem.height / 2, async () => {
    apercu = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('.grille .bulle')).find((x) => /Lundi-aprem/.test(x.textContent));
      const cs = colonneEtSpanDemi(0, 1, 'aprem', 'aprem');
      return { attendu: cs[0] + ' / span ' + cs[1], vu: b.style.gridColumn };
    });
  });
  verifier(apercu && apercu.vu.replace(/\s+/g, ' ') === apercu.attendu, 'aperçu du raccourcissement : lundi après-midi seul (' + JSON.stringify(apercu) + ')');
  await auRepos();
  verifier(await forme('Lundi-aprem') === '2026-09-21 1j aprem/aprem', 'raccourcie par la poignée droite : lundi APRÈS-MIDI seul, pas lundi entier (' + await forme('Lundi-aprem') + ')');
  verifier(await bd('taches', 'Lundi-aprem') === '3:2026-09-21 aprem', 'enregistré : une seule demi-journée, lundi après-midi (' + await bd('taches', 'Lundi-aprem') + ')');
  const pur = await page.evaluate(() => [
    demiPourRedimNote('droite', 1, 'aprem', 'matin', 'matin'),
    demiPourRedimNote('droite', 1, null, null, 'matin'),
    demiPourRedimNote('droite', 1, null, null, 'aprem'),
    demiPourRedimNote('gauche', 1, 'aprem', 'matin', 'aprem'),
    demiPourRedimNote('gauche', 1, 'aprem', 'matin', 'matin'),
    demiPourRedimNote('gauche', 1, null, null, 'aprem'),
    demiPourRedimNote('droite', 3, 'matin', 'aprem', 'aprem'),
    demiPourRedimNote('gauche', 3, 'matin', 'aprem', 'matin')
  ].map((b) => (b.demiDebut || '-') + '/' + (b.demiFin || '-')).join(' '));
  verifier(pur === 'aprem/aprem matin/matin -/- matin/matin matin/matin aprem/aprem -/- -/-',
    'poignées : le bord fixe garde sa demi-journée, le pointeur ne dépasse jamais l’autre bord (' + pur + ')');

  // 3) Sélection de 2 bulles (Lionel + Mathis, lundi entier) glissée à la
  //    souris depuis leur moitié gauche jusqu'au mardi après-midi.
  await page.click(bulle('Décoffrage'));
  await page.click(bulle('Béton'), { modifiers: ['Control'] });
  await page.waitForTimeout(100);
  verifier(await page.evaluate(() => Object.keys(bullesSelectionnees).length) === 2, 'sélection multiple de 2 bulles');
  const src = await page.locator(bulle('Décoffrage')).boundingBox();
  const marAprem = await page.locator(cellule(1, 1, 'aprem')).boundingBox();
  let surbrillances = 0;
  await glisser(src.x + src.width * 0.2, src.y + src.height / 2, marAprem.x + marAprem.width * 0.3, marAprem.y + marAprem.height / 2, async () => {
    surbrillances = await page.evaluate(() => document.querySelectorAll('.survol-precis').length);
  });
  verifier(surbrillances === 2, 'aperçu du glisser groupé : une surbrillance par bulle (' + surbrillances + ')');
  await auRepos();
  const fDec = await forme('Décoffrage'), fCof = await forme('Béton');
  verifier(fDec === '2026-09-22 2j aprem/matin' && fCof === '2026-09-22 2j aprem/matin', 'glisser groupé par demi-journée : les 2 bulles passent à « mardi après-midi -> mercredi matin » (' + fDec + ' | ' + fCof + ')');
  verifier(await bd('taches', 'Décoffrage') === '1:2026-09-22 aprem, 1:2026-09-23 matin' && await bd('taches', 'Béton') === '2:2026-09-22 aprem, 2:2026-09-23 matin',
    'enregistré (' + await bd('taches', 'Décoffrage') + ' | ' + await bd('taches', 'Béton') + ')');

  // 4) 3 clics rapides sur → pendant que le serveur répond lentement.
  await page.evaluate(() => { window.__DELAI = 120; });
  await page.click(bulle('Lundi-aprem'));
  await page.click(bulle('test'), { modifiers: ['Control'] });
  await page.waitForTimeout(100);
  for (let i = 0; i < 3; i++) { await page.click('#panneauSelection .sel-fleches button:last-child'); await page.waitForTimeout(150); }
  await auRepos();
  await page.waitForTimeout(500);
  await auRepos();
  verifier(await forme('Lundi-aprem') === '2026-09-24 1j aprem/aprem' && await forme('test') === '2026-09-24 1j matin/matin',
    '3 flèches → : les 3 décalages sont appliqués (' + await forme('Lundi-aprem') + ' | ' + await forme('test') + ')');
  verifier(await bd('taches', 'Lundi-aprem') === '3:2026-09-24 aprem' && await bd('notes', 'test') === '2026-09-24 matin',
    '3 flèches → : les 3 décalages sont enregistrés, pas seulement le 1er (' + await bd('taches', 'Lundi-aprem') + ' | ' + await bd('notes', 'test') + ')');
  const dom = await page.evaluate(() => ({
    sel: Object.keys(bullesSelectionnees).length,
    domSel: document.querySelectorAll('.grille .bulle.selectionnee').length,
    orphelins: Array.from(document.querySelectorAll('.grille .bulle[data-id]')).filter((b) => !itemParId(b.dataset.id)).length
  }));
  verifier(dom.domSel === dom.sel && dom.sel === 2, 'anneaux bleus = sélection réelle (' + JSON.stringify(dom) + ')');
  verifier(dom.orphelins === 0, 'aucune bulle fantôme d’un ancien rendu (' + dom.orphelins + ')');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const apresEchap = await page.evaluate(() => ({ sel: Object.keys(bullesSelectionnees).length, domSel: document.querySelectorAll('.grille .bulle.selectionnee').length, pilule: !!document.querySelector('#panneauSelection:not([hidden])') && getComputedStyle(document.querySelector('#panneauSelection')).display !== 'none' }));
  verifier(apresEchap.sel === 0 && apresEchap.domSel === 0, 'Échap : plus aucune bulle dessinée sélectionnée (' + JSON.stringify(apresEchap) + ')');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
