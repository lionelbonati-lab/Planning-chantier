const { chromium } = require('playwright');
const path = require('path');

// Round du 24.09.2026 (suite 7) — Lionel : « quand je clique une bulle, elle
// soit sélectionnée. Mais si j'en clique une autre, la bulle que j'avais
// cliquée est désélectionnée et la nouvelle est sélectionnée. Pour faire
// une sélection multiple, j'aimerais un petit bouton dans la toolbar […]
// un espèce de petit menu sous ce bouton […] des flèches gauche-droite et
// guillemets gauche, guillemets droite. » Vérifie, sur ordinateur (1300px),
// date figée au jeudi 24.09.2026, contre un faux Supabase en mémoire :
//   1) clic = sélection simple (remplace ; recliquer la seule désélectionne) ;
//   2) Ctrl+clic cumule et allume le mode multiple (flèches « ‹ › ») ;
//   3) Échap éteint tout ;
//   4) (suite 9) appui LONG sur une bulle : mode multiple, les clics
//      suivants s'ajoutent, compteur ;
//   5) flèches : demi-journée / jour, forme conservée, sélection conservée
//      (même après la synchronisation + reconstruction), table relue ;
//   6) butée : tout ou rien, rien ne bouge ;
//   7) ← → au clavier ; ✕ -> mode éteint, sélection vidée ;
//   8) (suite 8-9) pilule visible dès une bulle seule, fixée en bas : crayon
//      (ouvre la fiche, plus de double-clic), ⧉ = "copier au prochain
//      déplacement" (flèches : copie posée à la nouvelle position et
//      sélectionnée, original en place ; glisser à la souris : idem), ✕,
//      corbeille (confirmation, table relue) ;
//   9) téléphone : la même pilule prend toute la largeur, à la place de la
//      barre d'onglets.
//
// Lancer : node test_selection_bulles.js

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
      lignes('2026-09-22', 'matin', 'A'), lignes('2026-09-22', 'aprem', 'A'),
      lignes('2026-09-23', 'matin', 'B'), lignes('2026-09-23', 'aprem', 'B'),
      lignes('2026-09-24', 'matin', 'C', { personne_id: 2 })
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
  const selection = () => page.evaluate(() => Object.keys(bullesSelectionnees).map((id) => itemParId(id) ? itemParId(id).item.texte : '?').sort().join(','));
  const surbrillance = () => page.evaluate(() => Array.from(document.querySelectorAll('.bulle.selectionnee')).map((b) => b.textContent.trim()).sort().join(','));
  const mode = () => page.evaluate(() => ({
    actif: modeSelectionMultiple, copie: document.getElementById('selCopier').classList.contains('actif'),
    panneau: !document.getElementById('panneauSelection').hidden, compte: document.querySelector('#panneauSelection .sel-compte').textContent,
    blocFleches: !document.querySelector('#panneauSelection .sel-fleches').hidden,
    crayon: !document.getElementById('selModifier').hidden, corps: document.body.classList.contains('selection-active'),
    fixe: getComputedStyle(document.getElementById('panneauSelection')).position === 'fixed'
  }));
  const forme = (texte) => page.evaluate((tx) => { const t = TACHES.find((x) => x.texte === tx); return t ? [t.giDebut, t.duree, t.demiDebut, t.demiFin].join('/') : null; }, texte);
  const bd = (texte) => page.evaluate((tx) => window.__BD.taches.filter((t) => t.texte === tx).map((t) => t.date.slice(5) + ':' + t.demi).sort().join(' '), texte);
  const toastTexte = () => page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  async function clic(texte, modifiers) {
    await page.click('.bulle:has-text("' + texte + '")', modifiers ? { modifiers: modifiers } : {});
    await page.waitForTimeout(80);
  }
  // Appui long : pointeur posé sans bouger plus de DELAI_APPUI_LONG (450ms).
  async function appuiLong(texte) {
    const r = await page.locator('.bulle:has-text("' + texte + '")').boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForTimeout(80);
  }
  const giDeLaSelection = () => page.evaluate(() => Object.keys(bullesSelectionnees).map((id) => itemParId(id).item.giDebut).join(','));
  const attendreSync = () => page.waitForTimeout(700);

  // 1) Sélection simple.
  await clic('A');
  verifier(await selection() === 'A' && await surbrillance() === 'A', 'clic sur A : A sélectionnée');
  await clic('B');
  verifier(await selection() === 'B' && await surbrillance() === 'B', 'clic sur B : B remplace A');
  await clic('B');
  verifier(await selection() === '' && await surbrillance() === '', 'recliquer la seule bulle sélectionnée la désélectionne');
  let m = await mode();
  verifier(!m.actif && !m.panneau && !m.corps, 'rien de sélectionné, mode éteint : barre de sélection cachée');
  await clic('A');
  m = await mode();
  verifier(m.panneau && m.fixe && !m.actif && !m.blocFleches && m.crayon && m.corps, 'une bulle seule : pilule fixée en bas, avec le crayon, sans les flèches (mode multiple éteint)');
  await clic('A');

  // 2) Ctrl+clic.
  await clic('A', ['Control']);
  await clic('B', ['Control']);
  m = await mode();
  verifier(await selection() === 'A,B', 'Ctrl+clic : A puis B cumulées');
  verifier(m.actif && m.panneau && m.blocFleches && m.compte === '2' && !m.crayon, 'Ctrl+clic allume le mode : flèches visibles, compteur 2, pas de crayon (2 bulles)');

  // 3) Échap.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  m = await mode();
  verifier(await selection() === '' && !m.actif && !m.panneau, 'Échap : sélection vidée, mode éteint');

  // 4) Appui long.
  await appuiLong('A');
  m = await mode();
  verifier(await selection() === 'A' && m.actif && m.panneau && m.blocFleches && m.compte === '1', 'appui long sur A : mode multiple allumé, flèches visibles, compteur 1');
  await clic('C');
  m = await mode();
  verifier(await selection() === 'A,C' && m.compte === '2', 'en mode multiple, les clics s\'ajoutent : A,C (compteur 2)');

  // 5) Flèches.
  await page.click('#panneauSelection [data-decal="1"]');
  await attendreSync();
  verifier(await forme('A') === '1/2/aprem/matin' && await forme('C') === '3/1/aprem/aprem', '› demi-journée : A = mar. aprem -> mer. matin, C = jeu. aprem (' + await forme('A') + ' ; ' + await forme('C') + ')');
  verifier(await selection() === 'A,C' && await surbrillance() === 'A,C', 'sélection conservée après décalage + synchronisation');
  verifier(await bd('A') === '09-22:aprem 09-23:matin' && await bd('C') === '09-24:aprem', 'table taches à jour : A ' + await bd('A') + ' ; C ' + await bd('C'));
  await page.click('#panneauSelection [data-decal="-2"]');
  await attendreSync();
  verifier(await forme('A') === '0/2/aprem/matin' && await forme('C') === '2/1/aprem/aprem', '« jour entier : A = lun. aprem -> mar. matin, C = mer. aprem');
  verifier(await selection() === 'A,C', 'sélection toujours conservée');

  // 6) Butée : A ne peut plus reculer d'une demi-journée (lun. aprem -> lun. matin serait possible : demi-slot 1 -> 0, oui !) ; on teste le bord droit.
  await page.click('#panneauSelection [data-decal="2"]'); await attendreSync(); // A 1..2 -> 3..4, C 5 -> 7
  await page.click('#panneauSelection [data-decal="2"]'); await attendreSync(); // A 5..6, C 9 (ven. aprem, dernier demi-slot)
  verifier(await forme('C') === '4/1/aprem/aprem', 'C au dernier demi-slot de la semaine (ven. aprem)');
  const formeAAvant = await forme('A');
  await page.click('#panneauSelection [data-decal="1"]');
  await page.waitForTimeout(150);
  verifier(await forme('A') === formeAAvant && await forme('C') === '4/1/aprem/aprem' && (await toastTexte()).indexOf('Déjà à la fin') === 0, 'butée : rien ne bouge (tout ou rien), message « ' + await toastTexte() + ' »');

  // 7) Clavier, puis extinction par le bouton.
  await page.keyboard.press('Shift+ArrowLeft');
  await attendreSync();
  verifier(await forme('C') === '3/1/aprem/aprem', 'Maj+← : recul d\'un jour (C = jeu. aprem)');
  await page.keyboard.press('ArrowLeft');
  await attendreSync();
  verifier(await forme('C') === '3/1/matin/matin', '← : recul d\'une demi-journée (C = jeu. matin)');
  await page.click('#selFermer');
  await page.waitForTimeout(80);
  m = await mode();
  verifier(await selection() === '' && !m.actif && !m.panneau, '✕ : mode éteint, sélection vidée');
  verifier(await page.evaluate(() => pileUndo.length) >= 5, 'chaque décalage est annulable (Ctrl+Z)');

  // 8) Barre de sélection pour une bulle seule (suite 8).
  const formeOuverte = () => page.evaluate(() => !!document.querySelector('.form-pop'));
  await clic('A');
  await clic('A');
  verifier(!(await formeOuverte()) && await selection() === '', 'deux clics rapides sur A : plus de double-clic (aucune fiche), simple bascule');
  await clic('A');
  await page.click('#selModifier');
  await page.waitForTimeout(150);
  verifier(await formeOuverte(), 'crayon : la fiche de A s\'ouvre');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier(!(await formeOuverte()) && await selection() === '', 'Échap referme la fiche et vide la sélection');
  // ⧉ = copier au prochain déplacement (flèches).
  await appuiLong('B');
  await page.click('#selCopier');
  await page.waitForTimeout(80);
  verifier((await mode()).copie, '⧉ armé : bouton teinté');
  await page.click('#panneauSelection [data-decal="2"]');
  await attendreSync();
  verifier(await bd('B') === '09-23:aprem 09-23:matin 09-24:aprem 09-24:matin', '» avec ⧉ armé : copie posée le jeudi, original toujours le mercredi (' + await bd('B') + ')');
  m = await mode();
  // Au rechargement, la copie (jeudi) et l'original (mercredi), identiques et
  // contigus, ne font plus qu'UNE bulle de 2 jours : c'est elle qui doit
  // rester sélectionnée (report par recouvrement, cf. construireVueDepuisCache).
  verifier(m.compte === '1' && await giDeLaSelection() === '2' && await page.evaluate(() => TACHES.filter((t) => t.texte === 'B').length === 1 && TACHES.find((t) => t.texte === 'B').duree === 2) && !m.copie,
    'copie et original fusionnés en une bulle mer.-jeu., toujours sélectionnée ; ⧉ désarmé');
  verifier((await toastTexte()).indexOf('Copié (1)') === 0, 'message : ' + await toastTexte());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  // ⧉ = copier au prochain glisser à la souris : C (jeu. matin, Mathis) copiée sur ven. matin.
  await clic('C');
  await page.click('#selCopier');
  await page.waitForTimeout(80);
  const src = await page.locator('.bulle:has-text("C")').boundingBox();
  const dst = await page.locator('.cell[data-kind="personne"][data-personne="2"][data-jour="4"][data-demi="matin"]').boundingBox();
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(src.x + src.width / 2 + (dst.x + dst.width / 2 - src.x - src.width / 2) * i / 8, src.y + src.height / 2 + (dst.y + dst.height / 2 - src.y - src.height / 2) * i / 8); await page.waitForTimeout(30); }
  await page.mouse.up();
  await attendreSync();
  verifier(await bd('C') === '09-24:matin 09-25:matin', 'glisser avec ⧉ armé : copie de C posée le vendredi, jeudi toujours là (' + await bd('C') + ')');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  m = await mode();
  verifier(await selection() === '' && !m.panneau && !m.corps && !m.copie, 'Échap : sélection vidée, pilule cachée, ⧉ désarmé');
  await clic('A');
  await page.click('#selSupprimer');
  await page.waitForTimeout(100);
  verifier(await page.evaluate(() => !!document.querySelector('.confirm-pop')), 'corbeille : demande de confirmation');
  await page.click('.confirm-pop .c-ok');
  await attendreSync();
  verifier(await bd('A') === '' && await page.evaluate(() => !TACHES.some((t) => t.texte === 'A')), 'A supprimée (table relue)');

  // 9) Téléphone : pilule en bas à la place de la barre d'onglets.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(600);
  await clic('C');
  const pilule = await page.evaluate(() => {
    const p = document.getElementById('panneauSelection'), r = p.getBoundingClientRect(), st = getComputedStyle(p);
    return { position: st.position, bas: Math.round(window.innerHeight - r.bottom), haut: Math.round(r.top), largeur: Math.round(r.width),
      navBas: getComputedStyle(document.querySelector('.nav-bas')).display, cachee: p.hidden };
  });
  verifier(!pilule.cachee && pilule.position === 'fixed' && pilule.bas >= 0 && pilule.bas < 40 && pilule.largeur > 300 && pilule.navBas === 'none',
    'téléphone : pilule pleine largeur en bas (' + pilule.bas + 'px du bord, ' + pilule.largeur + 'px de large), barre d\'onglets masquée');
  await page.click('#selFermer');
  await page.waitForTimeout(80);
  verifier(await page.evaluate(() => getComputedStyle(document.querySelector('.nav-bas')).display) !== 'none', 'téléphone : barre d\'onglets de retour après ✕');

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
