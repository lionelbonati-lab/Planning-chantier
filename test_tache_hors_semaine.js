const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 5) — Lionel : « J'aimerai pouvoir déplacer une
// tâche en dehors de la semaine activé » (toast « Cette date sort de la
// semaine affichée… » en décalant une tâche au-delà du vendredi dans sa
// fiche). Vérifie, contre un faux Supabase qui applique VRAIMENT les
// filtres/insertions/suppressions sur des tables en mémoire (pour pouvoir
// relire la table `taches` après chaque action) :
//   1) une tâche déplacée entièrement sur la semaine suivante : lignes
//      d'origine supprimées, nouvelles lignes posées EN BOUT de case (une
//      tâche déjà présente ce jour-là garde sa place), grille restée sur la
//      semaine affichée, message de confirmation ;
//   2) une tâche étendue du vendredi au mardi suivant (à cheval sur 2
//      semaines) ;
//   3) modifier le texte de cette tâche depuis la 1re semaine renomme AUSSI
//      sa partie hors écran (pas de morceau orphelin) ;
//   4) la supprimer depuis la 1re semaine supprime aussi sa partie hors écran ;
//   5) une tâche au milieu de la semaine se modifie toujours par la voie
//      locale habituelle (Annuler reste disponible).
// Date figée au jeudi 24.09.2026 : semaine affichée = 21-25 sept., semaine
// suivante = 28 sept.-2 oct.
//
// Lancer : node test_tache_hors_semaine.js

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
  await page.addInitScript(({ taches }) => { window.__TACHES_INITIALES = taches; }, {
    taches: [
      lignes('2026-09-24', 'matin', 'Coffrage'), lignes('2026-09-24', 'aprem', 'Coffrage'),
      lignes('2026-09-25', 'matin', 'Coffrage'), lignes('2026-09-25', 'aprem', 'Coffrage'),
      lignes('2026-09-29', 'matin', 'Autre'),
      lignes('2026-09-25', 'matin', 'Dalle', { personne_id: 2 }), lignes('2026-09-25', 'aprem', 'Dalle', { personne_id: 2 }),
      lignes('2026-09-22', 'matin', 'Milieu', { personne_id: 2 }), lignes('2026-09-22', 'aprem', 'Milieu', { personne_id: 2 })
    ]
  });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForSelector('#legendeBarre');
  await page.waitForTimeout(300);

  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }
  const bd = (texte) => page.evaluate((tx) => window.__BD.taches.filter((t) => !tx || t.texte === tx)
    .map((t) => t.personne_id + ':' + t.date + ':' + t.demi + ':' + t.texte + ':' + t.ordre).sort(), texte);
  const toastTexte = () => page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  async function ouvrir(texte, personne) {
    await page.evaluate(([tx, p]) => {
      const it = TACHES.find((t) => t.texte === tx && String(t.personneId) === String(p));
      ouvrirEdition(null, it, null, 200, 200);
    }, [texte, personne]);
    await page.waitForTimeout(100);
  }
  async function fleche(bord, sens, fois) {
    for (let i = 0; i < fois; i++) {
      await page.click('.form-pop .date-ligne[data-bord="' + bord + '"] .f-fleche[data-sens="' + sens + '"]');
      await page.waitForTimeout(40);
    }
  }
  async function enregistrer() { await page.click('.form-pop .f-ok'); await page.waitForTimeout(500); }
  const semaineAffichee = () => page.evaluate(() => etat.semaines[etat.indexSemaine].debut);

  verifier(await semaineAffichee() === '2026-09-21', 'semaine affichée au départ : 21 sept.');

  // 1) Coffrage (jeu.-ven.) -> mar.-mer. de la semaine suivante.
  await ouvrir('Coffrage', 1);
  await fleche('fin', 1, 3);    // ven. -> mer. 30 sept. (hors fenêtre)
  await fleche('debut', 1, 3);  // jeu. -> mar. 29 sept. (hors fenêtre)
  const libelles = await page.evaluate(() => Array.from(document.querySelectorAll('.form-pop .date-val')).map((e) => e.textContent + (e.classList.contains('date-val-hors-fenetre') ? '*' : '')));
  verifier(JSON.stringify(libelles) === JSON.stringify(['Mar. 29 sept.*', 'Mer. 30 sept.*']), 'la fiche accepte des dates hors semaine : ' + JSON.stringify(libelles));
  await enregistrer();
  verifier(JSON.stringify(await bd('Coffrage')) === JSON.stringify([
    '1:2026-09-29:aprem:Coffrage:0', '1:2026-09-29:matin:Coffrage:1', '1:2026-09-30:aprem:Coffrage:0', '1:2026-09-30:matin:Coffrage:0'
  ]), 'Coffrage déplacé sur mar.-mer. suivants, anciennes lignes supprimées : ' + JSON.stringify(await bd('Coffrage')));
  verifier(JSON.stringify(await bd('Autre')) === JSON.stringify(['1:2026-09-29:matin:Autre:0']), 'la tâche déjà posée le mar. 29 matin garde sa place (Coffrage ajouté après elle)');
  verifier((await toastTexte()).indexOf('Tâche enregistrée du mar. 29 sept. au mer. 30 sept.') === 0, 'message : ' + await toastTexte());
  verifier(await semaineAffichee() === '2026-09-21', 'la grille reste sur la semaine affichée');
  verifier(await page.evaluate(() => !TACHES.some((t) => t.texte === 'Coffrage')), 'Coffrage n\'apparaît plus dans la semaine affichée');

  // 2) Dalle (ven.) étendue jusqu'au mar. suivant.
  await ouvrir('Dalle', 2);
  await fleche('fin', 1, 2);
  await enregistrer();
  verifier(JSON.stringify(await bd('Dalle')) === JSON.stringify([
    '2:2026-09-25:aprem:Dalle:0', '2:2026-09-25:matin:Dalle:0', '2:2026-09-28:aprem:Dalle:0', '2:2026-09-28:matin:Dalle:0', '2:2026-09-29:aprem:Dalle:0', '2:2026-09-29:matin:Dalle:0'
  ]), 'Dalle à cheval sur 2 semaines (ven. -> mar.) : ' + JSON.stringify(await bd('Dalle')));
  verifier(await page.evaluate(() => TACHES.some((t) => t.texte === 'Dalle' && t.giDebut === 4)), 'partie visible (ven.) toujours affichée');

  // 3) Renommer Dalle depuis la 1re semaine : la partie hors écran suit.
  await ouvrir('Dalle', 2);
  await page.waitForTimeout(200);
  const etendue = await page.evaluate(() => Array.from(document.querySelectorAll('.form-pop .date-val')).map((e) => e.textContent + (e.classList.contains('date-val-hors-fenetre') ? '*' : '')));
  verifier(JSON.stringify(etendue) === JSON.stringify(['Ven. 25 sept.', 'Mar. 29 sept.*']), 'la fiche ouverte depuis la 1re semaine montre l\'étendue réelle : ' + JSON.stringify(etendue));
  await page.evaluate(() => {
    document.querySelector('.form-pop .descriptif-texte').click();
  });
  await page.fill('.desc-edit-box textarea', 'Dalle B');
  await page.click('.desc-edit-box .popup-valider');
  await enregistrer();
  verifier((await bd('Dalle')).length === 0 && (await bd('Dalle B')).length === 6, 'renommée depuis la 1re semaine : les 6 demi-journées portent "Dalle B" (' + (await bd('Dalle B')).length + '), aucune "Dalle" orpheline (' + (await bd('Dalle')).length + ')');

  // 4) Supprimer Dalle B depuis la 1re semaine : tout disparaît.
  await ouvrir('Dalle B', 2);
  await page.click('.form-pop .f-suppr');
  await page.waitForTimeout(500);
  verifier((await bd('Dalle B')).length === 0, 'supprimée depuis la 1re semaine, partie hors écran comprise');

  // 5) Tâche au milieu de la semaine : voie locale inchangée (Annuler dispo).
  await ouvrir('Milieu', 2);
  await fleche('fin', 1, 1);
  await enregistrer();
  await page.waitForTimeout(300);
  verifier(JSON.stringify(await bd('Milieu')) === JSON.stringify(['2:2026-09-22:aprem:Milieu:0', '2:2026-09-22:matin:Milieu:0', '2:2026-09-23:aprem:Milieu:0', '2:2026-09-23:matin:Milieu:0']),
    'tâche au milieu de la semaine prolongée d\'un jour par la voie habituelle : ' + JSON.stringify(await bd('Milieu')));
  verifier(await page.evaluate(() => pileUndo.length > 0), 'Annuler reste disponible pour une modification dans la semaine');

  // 6) Nouvelle absence posée directement sur le lun. suivant (matin seul).
  await page.evaluate(() => ouvrirEdition(null, null, 'absence', 200, 200, { cibles: [{ personne: '1', demi: 'matin' }], giDebut: 4, duree: 1 }, 'matin', 'matin'));
  await page.waitForTimeout(100);
  await fleche('fin', 1, 1);
  await fleche('debut', 1, 1);
  await page.evaluate(() => document.querySelector('.form-pop .descriptif-texte').click());
  await page.fill('.desc-edit-box textarea', 'Congé');
  await page.click('.desc-edit-box .popup-valider');
  await enregistrer();
  const conge = await page.evaluate(() => window.__BD.taches.filter((t) => t.texte === 'Congé').map((t) => t.date + ':' + t.demi + ':' + t.est_absence));
  verifier(JSON.stringify(conge) === JSON.stringify(['2026-09-28:matin:true']), 'nouvelle absence créée le lun. 28 matin, hors semaine : ' + JSON.stringify(conge));
  verifier((await toastTexte()) === 'Absence ajoutée le lun. 28 sept.', 'message : ' + await toastTexte());

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
