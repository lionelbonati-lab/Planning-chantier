const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Lionel (24.09.2026) : « lors du rétrécissement de l'écran, certain élément
// de la toolbar se chevauchent » (capture : « 26182 - Terrain de Padel »
// recouvert par les 4 icônes masquer/afficher). Cause : .toolbar-groupe
// gardait flex-shrink:1 -> groupes comprimés sous leur contenu, débordement
// PAR-DESSUS le voisin sans jamais dépasser le bord droit, donc invisible
// pour ajusterDebordementToolbar() (scrollWidth === clientWidth). Ce test
// rétrécit la fenêtre de 1400 à 320px et vérifie, à chaque largeur,
// qu'aucun bouton visible de la barre n'en recouvre un autre et qu'aucun ne
// dépasse de la barre.
//
// Étendu au round du 24.09.2026 (suite 3) — refonte de la barre (ordre des
// groupes, repli dans "⋮" groupe par groupe de droite à gauche, chantier à
// largeur fixe, menu réordonné, barre téléphone inchangée) : cf. les
// sections 2) à 6) plus bas.
//
// Supabase remplacé par un faux client (servi à la place du CDN) : l'appli
// démarre par son vrai chemin (demarrer() -> construireCoquille()), avec un
// chantier au nom long comme sur la capture de Lionel.
//
// Lancer : node test_toolbar_chevauchement.js

const NOM_LONG = '26182 - Terrain de Padel';
const FAUX_SUPABASE = '(' + function (nomLong) {
  var DONNEES = {
    personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1 }, { id: 2, nom: 'Béton/Armature', sous_traitant: true, ordre: 2 }],
    chantiers: [{ id: 1, nom: nomLong, couleur: '#f7d9a8', actif: true, ordre: 1 }],
    statuts: [], feries: [], categories_feries: [], couleurs_perso: []
  };
  function requete(table) {
    var q = {};
    ['select', 'eq', 'neq', 'order', 'gte', 'lte', 'in', 'limit', 'insert', 'update', 'upsert', 'delete', 'single', 'maybeSingle']
      .forEach(function (m) { q[m] = function () { return q; }; });
    q.then = function (ok, ko) { return Promise.resolve({ data: DONNEES[table] || [], error: null, count: 0 }).then(ok, ko); };
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
} + ')(' + JSON.stringify(NOM_LONG) + ');';

function mesurer() {
  var barre = document.getElementById('legendeBarre');
  var bb = barre.getBoundingClientRect();
  var rects = Array.from(barre.querySelectorAll('.toolbar-btn, .toolbar-toggle, .select-chantier-btn, .zoom-btn, .zoom-pill'))
    .filter(function (e) { return e.getBoundingClientRect().width > 0 && !e.closest('.toolbar-secondaire.ouvert'); })
    .map(function (e) {
      var r = e.getBoundingClientRect();
      return { id: e.id || (e.className.split(' ')[0] + ':' + (e.dataset.affichageCible || '')), l: r.left, r: r.right };
    });
  var chevauchements = [];
  for (var i = 0; i < rects.length; i++) for (var j = i + 1; j < rects.length; j++) {
    if (rects[i].l < rects[j].r - 1 && rects[j].l < rects[i].r - 1) chevauchements.push(rects[i].id + ' / ' + rects[j].id);
  }
  var horsBarre = rects.filter(function (x) { return x.r > bb.right + 1 || x.l < bb.left - 1; }).map(function (x) { return x.id; });
  return { compacte: barre.classList.contains('toolbar-compacte'), chevauchements: chevauchements, horsBarre: horsBarre };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e && e.stack || e)));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', body: FAUX_SUPABASE }));
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForSelector('#legendeBarre');
  await page.evaluate((nom) => { chantierParDefaut = nom; construireSelectChantier(); }, NOM_LONG);

  let total = 0, echecs = 0;
  function verifier(cond, message) {
    total++;
    if (cond) console.log('OK: ' + message);
    else { echecs++; console.error('ÉCHEC: ' + message); }
  }
  const etatBarre = () => page.evaluate(() => {
    const b = document.getElementById('legendeBarre'), p = document.getElementById('toolbarSecondaire');
    return {
      barre: Array.from(b.children).filter((c) => c !== p && c.getBoundingClientRect().width > 0).map((c) => c.id),
      menu: Array.from(p.children).filter((c) => c.classList.contains('toolbar-groupe')).map((c) => c.id)
    };
  });
  async function largeur(w) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(160); // > débounce de 120ms du resize (grille-rendu.js)
  }

  // 1) Rétrécissement 1400 -> 320px : jamais de chevauchement ; les groupes
  //    partent dans "⋮" un par un, de droite à gauche (round du 24.09.2026,
  //    suite 3 — Lionel : Masquages, Zoom, Navigation, Imprimer).
  const ORDRE_REPLI = ['controlesAffichage', 'groupeZoom', 'groupeNavSemaine', 'groupeImprimer'];
  const TOUJOURS_BARRE = ['groupeAnnulerRefaire', 'groupeChantier', 'groupeAujourdhui', 'groupeAjoutElement'];
  let largeursOk = 0, nbLargeurs = 0, replis = [], ordreRespecte = true, toujoursLa = true;
  for (let w = 1400; w >= 320; w -= 10) {
    await largeur(w);
    const m = await page.evaluate(mesurer);
    nbLargeurs++;
    if (m.chevauchements.length || m.horsBarre.length) {
      console.error('   ' + w + 'px : chevauchements=' + JSON.stringify(m.chevauchements) + ' hors barre=' + JSON.stringify(m.horsBarre));
    } else largeursOk++;
    const e = await etatBarre();
    if (!TOUJOURS_BARRE.every((id) => e.barre.includes(id))) { toujoursLa = false; console.error('   ' + w + 'px : barre=' + e.barre); }
    if (w > 600) {
      e.menu.forEach((id) => { if (!replis.includes(id)) replis.push(id); });
      if (JSON.stringify(replis) !== JSON.stringify(ORDRE_REPLI.slice(0, replis.length))) ordreRespecte = false;
    }
  }
  verifier(largeursOk === nbLargeurs, largeursOk + '/' + nbLargeurs + ' largeurs sans chevauchement ni bouton hors de la barre');
  verifier(ordreRespecte, 'repli de droite à gauche, un groupe à la fois : ' + JSON.stringify(replis));
  verifier(toujoursLa, 'Annuler/Refaire, Chantier, Aujourd\'hui et "+" toujours dans la barre');

  // 2) Barre complète : ordre de Lionel « annuler/refaire | imprimer |
  //    Chantier | navigation semaines | Zoom | Insertions | Masquages ».
  await largeur(1400);
  let e = await etatBarre();
  verifier(JSON.stringify(e.barre) === JSON.stringify(['groupeAnnulerRefaire', 'groupeImprimer', 'groupeChantier', 'groupeAujourdhui', 'groupeNavSemaine', 'groupeZoom', 'groupeAjoutLigne', 'groupeAjoutElement', 'controlesAffichage']) && e.menu.length === 0,
    'barre complète dans l\'ordre demandé, menu vide : ' + e.barre);
  verifier(await page.evaluate(() => getComputedStyle(document.getElementById('btnPlusOutils')).display === 'none'), '"⋮" masqué quand rien n\'est replié');

  // 3) Chantier : largeur fixe (25 caractères), nom long tronqué.
  const largeurNom = () => page.evaluate(() => document.querySelector('#btnSelectChantier .nom-chantier').getBoundingClientRect().width);
  const lLong = await largeurNom();
  await page.evaluate(() => { chantierParDefaut = null; construireSelectChantier(); });
  const lCourt = await largeurNom();
  await page.evaluate((nom) => { chantierParDefaut = nom; construireSelectChantier(); }, NOM_LONG);
  verifier(Math.abs(lLong - lCourt) < 0.5 && lLong > 100, 'nom du chantier à largeur fixe (' + Math.round(lLong) + 'px avec ou sans chantier choisi)');

  // 4) Menu "⋮" à 700px : ordre Zoom > Navigation > Masquages ; ‹ Sem. N ›
  //    sur une ligne ; 4 masquages sur une ligne ; ‹ utilisable depuis le menu.
  await largeur(700);
  e = await etatBarre();
  verifier(JSON.stringify(e.menu) === JSON.stringify(['groupeZoom', 'groupeNavSemaine', 'controlesAffichage']), 'ordre du menu à 700px : ' + e.menu);
  await page.click('#btnPlusOutils');
  await page.waitForTimeout(100);
  const lignes = await page.evaluate(() => {
    const y = (sel) => Array.from(document.querySelectorAll(sel)).map((el) => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2));
    return { nav: y('#btnSemainePrec, #btnSemainePill, #btnSemaineSuiv'), masq: y('#controlesAffichage .toolbar-toggle'),
      libelles: Array.from(document.querySelectorAll('#groupeNavSemaine .toolbar-btn-label')).filter((l) => l.getBoundingClientRect().width > 0).map((l) => l.textContent) };
  });
  verifier(new Set(lignes.nav).size === 1, '‹ Sem. N › sur une seule ligne dans le menu');
  verifier(new Set(lignes.masq).size === 1, 'les 4 masquages sur une seule ligne dans le menu');
  verifier(JSON.stringify(lignes.libelles) === JSON.stringify(['Afficher 2 semaines']), 'plus de texte "Semaine précédente/suivante" : ' + JSON.stringify(lignes.libelles));
  verifier(await page.evaluate(() => !Array.from(document.querySelectorAll('#groupeNavSemaine *')).some((el) => el.children.length === 0 && /^\s*Semaine\s*$/.test(el.textContent) && el.getBoundingClientRect().width > 0)),
    'pas d\'intitulé "Semaine" devant ‹ Sem. N ›');
  const ouvert = () => page.evaluate(() => document.getElementById('toolbarSecondaire').classList.contains('ouvert'));
  const semAvant = await page.evaluate(() => etat.indexSemaine);
  await page.click('#btnSemainePrec');
  await page.waitForTimeout(200);
  await page.click('#btnSemainePrec');
  await page.waitForTimeout(200);
  verifier(await page.evaluate(() => etat.indexSemaine) === semAvant - 2, '‹ cliqué 2 fois depuis le menu recule bien de 2 semaines');
  await page.click('#controlesAffichage [data-affichage-cible="note"]');
  await page.waitForTimeout(150);
  verifier(await ouvert(), 'le menu reste ouvert après des clics sur ses boutons');
  const icone = () => page.evaluate(() => {
    const vis = (sel) => document.querySelector(sel).getBoundingClientRect().width > 0;
    return vis('#btnPlusOutils .icone-menu-fermer') ? 'croix' : vis('#btnPlusOutils .icone-menu-ouvrir') ? 'points' : '?';
  });
  verifier(await icone() === 'croix', 'menu ouvert : "⋮" remplacé par "✕"');
  const nav = await page.evaluate(() => {
    const g = document.getElementById('groupeNavSemaine').getBoundingClientRect();
    const imp = document.querySelector('#groupeNavSemaine #btnDeuxSemaines svg').getBoundingClientRect();
    return { prec: document.getElementById('btnSemainePrec').getBoundingClientRect().left - g.left, icone2sem: imp.left - g.left };
  });
  verifier(nav.prec <= nav.icone2sem, '‹ Sem. N › aligné à gauche (‹ à ' + Math.round(nav.prec) + 'px du bord, icône "2 semaines" à ' + Math.round(nav.icone2sem) + 'px)');
  await page.click('#btnPlusOutils');
  await page.waitForTimeout(100);
  verifier(!(await ouvert()) && await icone() === 'points', '"✕" ferme le menu et redevient "⋮"');
  await page.evaluate(() => { if (replierNotes) document.querySelector('#controlesAffichage [data-affichage-cible="note"]').click(); }); // Notes réaffichées

  // 5) Ré-élargissement : tout revient dans la barre, menu refermé.
  await largeur(1400);
  e = await etatBarre();
  verifier(e.menu.length === 0 && e.barre.includes('controlesAffichage'), 'ré-élargi : tous les groupes revenus dans la barre');

  // 6) Téléphone : barre inchangée (Lionel : « Menu ⋮ seulement »), menu
  //    Imprimer > Zoom > Navigation > Ajouter une ligne > Masquages.
  await largeur(390);
  e = await etatBarre();
  const ordreVisuel = await page.evaluate(() => {
    const b = document.getElementById('legendeBarre'), p = document.getElementById('toolbarSecondaire');
    return Array.from(b.children).filter((c) => c !== p && c.getBoundingClientRect().width > 0)
      .sort((a, c) => a.getBoundingClientRect().left - c.getBoundingClientRect().left).map((c) => c.id);
  });
  verifier(JSON.stringify(ordreVisuel) === JSON.stringify(['groupeAnnulerRefaire', 'groupeAujourdhui', 'groupeChantier', 'groupeAjoutElement', 'btnPlusOutils']), 'barre téléphone inchangée : ' + ordreVisuel);
  verifier(JSON.stringify(e.menu) === JSON.stringify(['groupeImprimer', 'groupeZoom', 'groupeNavSemaine', 'groupeAjoutLigne', 'controlesAffichage']), 'menu téléphone : ' + e.menu);
  // Imprimer et Ajouter une ligne referment le menu (Lionel : « Bonne idée
  // de fermer le menu avec imprimé et ajouter ligne »). Clics via le DOM :
  // la fenêtre ouverte par chacun recouvre ensuite l'écran.
  const ouvrirMenu = () => page.evaluate(() => { if (!document.getElementById('toolbarSecondaire').classList.contains('ouvert')) document.getElementById('btnPlusOutils').click(); });
  await ouvrirMenu();
  await page.evaluate(() => { document.getElementById('btnAjoutLigne').click(); document.querySelector('#menuAjoutLigne [data-ligne="personnel"]').click(); });
  await page.waitForTimeout(150);
  verifier(!(await ouvert()), 'Ajouter une ligne > Personnel referme le menu');
  await page.keyboard.press('Escape');
  await ouvrirMenu();
  await page.evaluate(() => document.getElementById('btnImprimerTitre').click());
  await page.waitForTimeout(150);
  verifier(!(await ouvert()), 'Imprimer referme le menu');

  // 7) Barre + en-tête de la grille parfaitement immobiles pendant le
  //    défilement (round du 24.09.2026, suite 4 — Lionel : « Sur mobile la
  //    partie au dessus de note doit rester fixe. Actuellement elle monte de
  //    quelques pixel » : 6px sur téléphone, 10px sur desktop avant le fix).
  //    Grille allongée (lignes ajoutées) pour qu'il y ait de quoi défiler.
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelectorAll('.form-pop, .overlay, .print-sheet').forEach((el) => el.remove()));
  for (const w of [390, 1200]) {
    await largeur(w);
    await page.waitForTimeout(200);
    // Lignes ajoutées APRÈS le changement de largeur : franchir 600px
    // reconstruit la grille depuis les données (vue "1 jour" <-> "1 semaine",
    // round du 24.09.2026 suite 6), ce qui effacerait des lignes ajoutées avant.
    await page.evaluate(() => {
      for (let i = 0; i < 16; i++) PERSONNES.push({ id: 900 + i, nom: 'Test ' + i, sousTraitant: i > 8 });
      render(false);
    });
    const positions = await page.evaluate(async () => {
      const app = document.getElementById('app');
      const mesure = () => [document.getElementById('legendeBarre'), document.querySelector('.entete-planning-figee')].map((el) => Math.round(el.getBoundingClientRect().top));
      const out = [];
      for (const s of [0, 3, 8, 40, 300]) { app.scrollTop = s; await new Promise((r) => requestAnimationFrame(r)); out.push({ s: app.scrollTop, pos: mesure() }); }
      app.scrollTop = 0;
      return out;
    });
    const ref = JSON.stringify(positions[0].pos);
    verifier(positions[positions.length - 1].s > 40 && positions.every((p) => JSON.stringify(p.pos) === ref),
      w + 'px : barre et en-tête immobiles au défilement ' + JSON.stringify(positions.map((p) => p.s + '→' + p.pos.join('/'))));
  }

  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' vérifications' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
