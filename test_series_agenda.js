const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 20) — Lionel : « J'aimerai améliorer mes
// séries. j'aimerai qu'elles se comporte comme sur un calendrier avant
// suppression, déplacement ou modification. proposer de modifier toute la
// série, les événements à venir ou uniquement celui-ci. »
//
// Date figée au jeudi 24.09.2026 (semaine du 21 au 25 affichée), faux
// Supabase avec 4 séries hebdomadaires :
//   1 = tâche « Réunion » (Lionel, lundis entiers 14.09 -> 05.10) ;
//   2 = note « Point hebdo » (mardis 15.09 -> 06.10) ;
//   3 = jalon « Visite » (mercredis 16.09 -> 30.09) ;
//   4 = tâche « Chrono » (Mathis, jeudis matin 17.09 -> 01.10).
// Vérifie :
//   1) la boîte « événement récurrent » (titre, 3 choix radio, « Cet
//      événement » coché, Annuler/OK) ; Échap = rien d'écrit, la bulle
//      revient à sa place ;
//   2) flèches -> « Tous les événements » : toute la série décalée d'un
//      jour (serie_id conservé), pile Annuler vidée ;
//   3) flèches -> « Cet événement et les suivants » d'une demi-journée :
//      les occurrences d'avant ne bougent pas ;
//   4) ⚑ sur une note de série -> « Tous » : drapeau sur toute la série,
//      écrit directement (pas d'enregistrer-plage) ;
//   5) note déplacée « Cet événement » : reste DANS sa série (serie_id) ;
//   6) fiche tâche, date de début changée -> « suivants » : les dates de
//      la fiche sont appliquées (avant : ignorées), occurrence précédente
//      intacte ;
//   6 bis) vrai glisser à la souris : même boîte, « Cet événement » ;
//   7) copie (⧉ + flèche) : pas de boîte, la copie sort de la série ;
//   8) suppression Suppr -> « Cet événement » (jalon), puis pilule 🗑 ->
//      « suivants » (tâche) ; bulle hors série supprimée avec : confirmation
//      simple inchangée ;
//   9) moteur pur : série « toute la semaine » jointive vendredi -> lundi
//      raccourcie d'un jour sur « Tous » (chaque semaine, pas une seule
//      longue occurrence) ; case de week-end : seul « Cet événement » ;
//  10) téléphone 320 px : la boîte tient dans l'écran.
//
// Lancer : node test_series_agenda.js

const FAUX_SUPABASE = '(' + function () {
  var BD = window.__BD = {
    personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, ordre: 2, actif: true }],
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
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  await page.clock.setFixedTime(new Date('2026-09-24T10:00:00'));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.addInitScript((d) => { window.__TACHES_INITIALES = d.taches; window.__NOTES_INITIALES = d.notes; window.__JALONS_INITIALES = d.jalons; }, {
    taches: [].concat(
      ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].map((d) => journee(d, 'Réunion', { serie_id: 1 })).flat(),
      ['2026-09-17', '2026-09-24', '2026-10-01'].map((d) => tache(d, 'matin', 'Chrono', { personne_id: 2, serie_id: 4 })),
      journee('2026-09-22', 'Libre', { personne_id: 2 })
    ),
    notes: ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'].map((d) => ({ date: d, texte: 'Point hebdo', important: false, serie_id: 2, demi: null })),
    jalons: ['2026-09-16', '2026-09-23', '2026-09-30'].map((d) => ({ date: d, texte: 'Visite', serie_id: 3, demi: null, chantier_id: null, important: false }))
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
  const attendre = (ms) => page.waitForTimeout(ms || 900);
  const bulle = (tx) => '.grille .bulle:has-text("' + tx + '")';
  async function clic(tx, modifiers) { await page.click(bulle(tx), modifiers ? { modifiers: modifiers } : {}); await page.waitForTimeout(80); }
  async function vider() { await page.keyboard.press('Escape'); await page.waitForTimeout(60); await page.evaluate(() => { quitterModeSelection(); }); }
  // Lignes de la table, triées : "date demi" (tâches), "date demi|imp" (notes).
  const bd = (table, texte) => page.evaluate((a) => window.__BD[a.table].filter((r) => r.texte === a.texte)
    .map((r) => r.date + ' ' + (r.demi || 'jour') + (r.important ? ' !' : '') + (r.serie_id ? ' s' + r.serie_id : ''))
    .sort().join(', '), { table, texte });
  const boite = () => page.evaluate(() => {
    const p = document.querySelector('.confirm-pop-serie');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return {
      titre: p.querySelector('.cs-titre').textContent,
      choix: Array.from(p.querySelectorAll('.cs-choix')).map((l) => l.textContent.trim()),
      coche: (p.querySelector('input[name="porteeSerie"]:checked') || {}).value,
      desactives: Array.from(p.querySelectorAll('input[name="porteeSerie"]:disabled')).map((i) => i.value),
      boutons: Array.from(p.querySelectorAll('.cs-pied button')).map((b) => b.textContent),
      message: (p.querySelector('.cs-message') || {}).textContent || '',
      gauche: r.left, droite: r.right, largeurEcran: window.innerWidth
    };
  });
  async function choisir(valeur) {
    await page.click('.confirm-pop-serie input[value="' + valeur + '"]');
    await page.click('.confirm-pop-serie .cs-ok');
    await attendre();
  }
  const giDe = (tx) => page.evaluate((t) => { const it = TACHES.concat(NOTES, JALONS).find((x) => x.texte === t); return it ? isoDeGi(it.giDebut) + ' ' + (it.demiDebut || '') : null; }, tx);
  const decaler = (n) => page.evaluate((k) => { modeSelectionMultiple = true; decalerSelection(k); }, n);

  // 1) La boîte, puis Échap.
  await clic('Réunion');
  await decaler(2);
  await attendre(200);
  let b = await boite();
  verifier(!!b && b.titre === 'Déplacer l’événement récurrent', 'flèche sur une bulle de série : boîte « ' + (b && b.titre) + ' »');
  verifier(b && b.choix.join('|') === 'Cet événement|Cet événement et les suivants|Tous les événements' && b.coche === 'unique' && !b.desactives.length,
    '3 choix comme un agenda, « Cet événement » coché d’office (' + (b && b.choix.join(' / ')) + ')');
  verifier(b && b.boutons.join('|') === 'Annuler|OK', 'pied Annuler / OK');
  verifier(await giDe('Réunion') === '2026-09-22 ', 'pendant la question, la grille montre déjà la bulle déplacée (mardi)');
  await page.evaluate(() => { window.__ECRITURES = []; });
  await page.keyboard.press('Escape');
  await attendre();
  verifier(!(await boite()) && await giDe('Réunion') === '2026-09-21 ', 'Échap : boîte fermée, bulle revenue au lundi');
  verifier(await page.evaluate(() => !window.__ECRITURES.some((e) => !/:select$/.test(e))), 'Échap : rien écrit sur le serveur');

  // 2) « Tous les événements », un jour plus tard.
  await decaler(2);
  await attendre(200);
  await choisir('serie');
  verifier(await bd('taches', 'Réunion') === ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'].map((d) => d + ' aprem s1, ' + d + ' matin s1').join(', '),
    '« Tous » : toute la série passe au mardi, serie_id conservé (' + await bd('taches', 'Réunion') + ')');
  verifier(await giDe('Réunion') === '2026-09-22 ', 'grille rechargée : Réunion le mardi');
  verifier(await page.evaluate(() => pileUndo.length === 0), '« Tous » : pile Annuler vidée (semaines hors écran touchées)');

  // 3) « Cet événement et les suivants », une demi-journée plus tôt.
  await vider();
  await clic('Réunion');
  await decaler(-1);
  await attendre(200);
  await choisir('suivant');
  verifier(await bd('taches', 'Réunion') === '2026-09-15 aprem s1, 2026-09-15 matin s1, 2026-09-21 aprem s1, 2026-09-22 matin s1, 2026-09-28 aprem s1, 2026-09-29 matin s1, 2026-10-05 aprem s1, 2026-10-06 matin s1',
    '« Suivants » -½ j : le 15.09 ne bouge pas, les autres passent à lundi aprem + mardi matin');

  // 4) ⚑ sur une note de série -> « Tous ».
  await vider();
  await page.evaluate(() => { window.__INVOCATIONS = []; });
  await clic('Point hebdo');
  await page.click('#selImportant');
  await attendre(200);
  b = await boite();
  verifier(!!b && b.titre === 'Modifier l’événement récurrent', '⚑ sur une note de série : « ' + (b && b.titre) + ' »');
  await choisir('serie');
  verifier(await bd('notes', 'Point hebdo') === '2026-09-15 jour ! s2, 2026-09-22 jour ! s2, 2026-09-29 jour ! s2, 2026-10-06 jour ! s2', '« Tous » : les 4 notes importantes, toujours en série');
  verifier(await page.evaluate(() => !(window.__INVOCATIONS || []).some((c) => c.nom === 'enregistrer-plage')), 'écrit directement (aucun enregistrer-plage, qui perdrait le serie_id)');

  // 5) Note déplacée « Cet événement » : reste dans sa série.
  await vider();
  await clic('Point hebdo');
  await decaler(2);
  await attendre(200);
  await choisir('unique');
  verifier(await bd('notes', 'Point hebdo') === '2026-09-15 jour ! s2, 2026-09-23 jour ! s2, 2026-09-29 jour ! s2, 2026-10-06 jour ! s2', '« Cet événement » : seule la note du 22 passe au 23, serie_id gardé');
  verifier(await page.evaluate(() => { const n = NOTES.find((x) => x.texte === 'Point hebdo'); return !!n && !!n.serieId && pileUndo.length === 1; }), 'la bulle rechargée porte encore sa série ; Annuler reste possible (1 étape)');

  // 6) Fiche tâche : début au lendemain -> « suivants ».
  await vider();
  await clic('Chrono');
  await page.click('#selModifier');
  await page.waitForSelector('.form-pop');
  verifier(await page.evaluate(() => (document.querySelector('.form-pop .serie-info-existante') || {}).textContent || '').then((t) => t.indexOf('Événement récurrent') >= 0), 'fiche : bandeau « Événement récurrent »');
  await page.click('.form-pop .date-ligne[data-bord="debut"] .f-fleche[data-sens="1"]');
  await page.click('.form-pop .f-ok');
  await attendre(200);
  b = await boite();
  verifier(!!b && b.titre === 'Déplacer l’événement récurrent', 'fiche : boîte ouverte après fermeture de la fiche');
  verifier(await page.evaluate(() => !document.querySelector('.form-pop')), 'la fiche est fermée sous la boîte');
  await choisir('suivant');
  verifier(await bd('taches', 'Chrono') === '2026-09-17 matin s4, 2026-09-25 matin s4, 2026-10-02 matin s4', 'fiche « suivants » : dates appliquées (jeudi -> vendredi), le 17 intact (' + await bd('taches', 'Chrono') + ')');

  // 6 bis) Vrai glisser à la souris (vendredi -> jeudi) -> « Cet événement ».
  await vider();
  const src = await page.locator(bulle('Chrono')).boundingBox();
  const dst = await page.locator('.cell[data-kind="personne"][data-personne="2"][data-jour="3"][data-demi="matin"]').boundingBox();
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(src.x + src.width / 2 + (dst.x + dst.width / 2 - src.x - src.width / 2) * i / 8, src.y + src.height / 2 + (dst.y + dst.height / 2 - src.y - src.height / 2) * i / 8); await page.waitForTimeout(30); }
  await page.mouse.up();
  await attendre(300);
  b = await boite();
  verifier(!!b && b.titre === 'Déplacer l’événement récurrent', 'glisser à la souris une bulle de série : même boîte');
  await choisir('unique');
  verifier(await bd('taches', 'Chrono') === '2026-09-17 matin s4, 2026-09-24 matin s4, 2026-10-02 matin s4', 'glisser « Cet événement » : seul le 25 revient au 24, toujours en série (' + await bd('taches', 'Chrono') + ')');

  // 7) Copie : pas de boîte, la copie sort de la série.
  await vider();
  await clic('Visite');
  await page.evaluate(() => { copieSelectionActive = true; });
  await decaler(2);
  await attendre();
  verifier(!(await boite()), 'copie (⧉ + flèche) d’un jalon de série : pas de boîte');
  verifier(await bd('jalons', 'Visite') === '2026-09-16 jour s3, 2026-09-23 jour s3, 2026-09-24 jour, 2026-09-30 jour s3', 'la copie (24.09) n’a pas de serie_id, la série est intacte');

  // 8) Suppressions.
  await vider();
  await page.evaluate(() => { const j = JALONS.find((x) => x.texte === 'Visite' && x.serieId); bullesSelectionnees = {}; bullesSelectionnees[j.id] = true; majBarreSelection(); });
  await page.keyboard.press('Delete');
  await attendre(200);
  b = await boite();
  verifier(!!b && b.titre === 'Supprimer l’événement récurrent' && !(await page.$('.confirm-pop:not(.confirm-pop-serie)')), 'Suppr sur un jalon de série : boîte « Supprimer l’événement récurrent » (pas la confirmation simple)');
  await page.click('.confirm-pop-serie .cs-ok');
  await attendre();
  verifier(await bd('jalons', 'Visite') === '2026-09-16 jour s3, 2026-09-24 jour, 2026-09-30 jour s3', 'OK (« Cet événement ») : seul le jalon du 23 est supprimé');

  await vider();
  await clic('Réunion');
  await clic('Libre', ['Control']);
  await page.click('#selSupprimer');
  await attendre(200);
  b = await boite();
  verifier(!!b && b.message === '', 'pilule 🗑 : série + bulle simple -> boîte de portée');
  await choisir('suivant');
  verifier(await bd('taches', 'Réunion') === '2026-09-15 aprem s1, 2026-09-15 matin s1' && await bd('taches', 'Libre') === '', '« Suivants » : Réunion supprimée à partir du 21.09, le 15 reste ; Libre supprimée aussi');

  await vider();
  await page.evaluate(() => { const j = JALONS.find((x) => x.texte === 'Visite' && !x.serieId); bullesSelectionnees = {}; bullesSelectionnees[j.id] = true; majBarreSelection(); });
  await page.keyboard.press('Delete');
  await attendre(200);
  verifier(!(await boite()) && !!(await page.$('.confirm-pop')), 'bulle hors série : confirmation simple, comme avant');
  await page.keyboard.press('Escape');

  // 9) Moteur pur + week-end.
  const pur = await page.evaluate(() => {
    const lignes = [];
    let id = 1;
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].forEach((d) => {
      ['matin', 'aprem'].forEach((dm) => lignes.push({ id: id++, personne_id: 1, date: d, demi: dm, ordre: 0, texte: 'Semaine', serie_id: 9 }));
    });
    const ch = { avant: { debut: '2026-09-07', fin: '2026-09-11', demiDebut: null, demiFin: null }, apres: { debut: '2026-09-07', fin: '2026-09-10', demiDebut: null, demiFin: null }, personneId: null };
    const plan = planDeplacementSerie_('taches', lignes, ch, 'serie');
    const jours = Array.from(new Set(plan.inserer.map((l) => l.date))).sort().join(',');
    const ch2 = { avant: { debut: '2026-09-11', fin: '2026-09-11', demiDebut: null, demiFin: null }, apres: { debut: '2026-09-14', fin: '2026-09-14', demiDebut: null, demiFin: null }, personneId: null };
    const plan2 = planDeplacementSerie_('notes', [{ id: 1, date: '2026-09-11', demi: null, texte: 'N', serie_id: 9 }, { id: 2, date: '2026-09-18', demi: null, texte: 'N', serie_id: 9 }], ch2, 'serie');
    const av = { id: 'x', type: 'note', texte: 'N', giDebut: 1000, duree: 1, dateDebutIso: '2026-09-26', serieId: 9 };
    const ap = Object.assign({}, av, { dateDebutIso: '2026-09-25' });
    const we = changementSerie_('NOTES', av, ap);
    return { jours, n: plan.inserer.length, notes: plan2.inserer.map((l) => l.date + ' ' + (l.demi || 'jour')).join(','), weekend: we.weekend };
  });
  verifier(pur.jours === '2026-09-07,2026-09-08,2026-09-09,2026-09-10,2026-09-14,2026-09-15,2026-09-16,2026-09-17' && pur.n === 16,
    'moteur : 2 semaines jointives « lun–ven » raccourcies à « lun–jeu » sur « Tous » = chaque semaine (' + pur.jours + ')');
  verifier(pur.notes === '2026-09-14 jour,2026-09-21 jour', 'moteur : vendredi +1 jour ouvré = lundi, pour chaque occurrence');
  verifier(pur.weekend === true, 'moteur : occurrence posée un samedi -> changement « week-end »');
  await page.evaluate(() => demanderPorteeSerie('Déplacer l’événement récurrent', function () {}, { seulementUnique: true, message: messageSerie_([{ id: 'x' }], true) }));
  b = await boite();
  verifier(b && b.desactives.join(',') === 'suivant,serie' && b.message.indexOf('week-end') >= 0, 'case de week-end : seul « Cet événement » est proposé, avec l’explication');

  // 10) Téléphone : la boîte tient dans l'écran.
  await page.setViewportSize({ width: 320, height: 700 });
  await attendre(300);
  b = await boite();
  verifier(b && b.gauche >= 0 && b.droite <= b.largeurEcran, '320 px : la boîte tient dans l’écran (' + Math.round(b.gauche) + '–' + Math.round(b.droite) + ')');
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE + '-320.png' });
  await page.keyboard.press('Escape');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
