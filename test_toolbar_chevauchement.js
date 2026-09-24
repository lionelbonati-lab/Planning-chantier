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

  let total = 0, echecs = 0, premiereCompacte = null;
  for (let w = 1400; w >= 320; w -= 10) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(160); // > débounce de 120ms du resize (grille-rendu.js)
    const m = await page.evaluate(mesurer);
    total++;
    if (m.compacte && premiereCompacte === null) premiereCompacte = w;
    if (m.chevauchements.length || m.horsBarre.length) {
      echecs++;
      console.error('ÉCHEC ' + w + 'px : chevauchements=' + JSON.stringify(m.chevauchements) + ' hors barre=' + JSON.stringify(m.horsBarre));
    }
  }
  console.log('Barre compacte (menu "⋮") à partir de ' + premiereCompacte + 'px');
  if (erreurs.length) { echecs++; console.error('ERREURS JS : ' + JSON.stringify(erreurs, null, 2)); }
  console.log((total - echecs) + '/' + total + ' largeurs sans chevauchement' + (echecs ? ' — ' + echecs + ' ÉCHEC(S)' : ' — OK'));
  await browser.close();
  process.exit(echecs ? 1 : 0);
})();
