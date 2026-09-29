// Requêtes du service worker vues par context.route (supabase-js du CDN).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FAUX_SUPABASE, ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 99). Lionel : « Ne serait-il pas plus
// judicieux de faire 2 application différente pour portable et pour
// deskop? », puis « Allons-y » au plan proposé : une seule appli,
// l'affichage du planning découpé en commun / ordinateur / téléphone.
// Étape 1 : les fonctions imbriquées dans construireGrille (js/grille-
// rendu.js) en sortent ; ce qu'elles lisaient par fermeture leur arrive
// dans G (l'objet du rendu), grilleCourante_ = le G du dernier rendu.
// Vérifie :
//   1. construireGrille ne définit plus que la construction commune des
//      lignes (poserDans, ligneSection…) ;
//   2. téléphone : grilleCourante_ suit chaque rendu (même .scroller que
//      l'écran), majHauteursLignes() remesure, suivreDefilementJourMobile
//      fait suivre la case coin, et ignore un autre .scroller ;
//   3. un ancien G (rendu remplacé) ne touche plus à rien ;
//   4. ordinateur : grilleCourante_ hors vue « 1 jour », hauteurs
//      remesurées.
// Étape 2 : hauteurs fixes et cascade dans js/grille-hauteurs.js.
//   5. répartition : ces fonctions y sont, et plus dans grille-rendu.js ;
//   6. service worker (sw.js) : index.html revalidé qui charge un fichier
//      jamais copié -> le fichier est copié d'avance (sans réseau à
//      l'ouverture suivante, le planning le trouve).
// Étape 3 : vue « 1 jour » du téléphone dans js/grille-telephone.js
//   (répartition vérifiée en 5).
//
// Lancer : node test_suite99.js

// Fonctions de chaque fichier (étapes 2 et suivantes).
const REPARTITION = {
  'grille-hauteurs.js': ['remonterCartesSelection', 'placerPoigneesCartes_', 'plageGrille_', 'reglagesLignesMobile_', 'hauteurCarteSonde_',
    'mesurerHauteursMobile_', 'poserPistesFixes_', 'isoDeColonne_', 'cascaderBullesJourMobile_', 'majHauteursLignes'],
  'grille-telephone.js': ['basculerVueJourMobile', 'jourOuvreLePlusProche_', 'caleJourMobileSurJourOuvre_', 'prechargerVoisinesJourMobile',
    'decouperBullesJourMobile_', 'majGeoGlisse_', 'poserJourMobile_', 'suivreDefilementJourMobile', 'planifierMajCoinJourMobile_',
    'majCoinJourMobile_', 'decalerSurColonne_', 'cablerArretJourMobile_']
};
const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, 'js', f), 'utf8');
const definies = (src) => (src.match(/^  function (\w+)\s*\(/gm) || []).map((l) => /function (\w+)/.exec(l)[1]);

const remplacements = {}; // chemin -> contenu servi à la place du fichier
function serveur() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    const p = path.join(RACINE, chemin);
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    const corps = remplacements[chemin] != null ? Buffer.from(remplacements[chemin]) : fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: '"' + crypto.createHash('md5').update(corps).digest('hex') + '"' });
    res.end(corps);
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

const AUTORISEES = ['poserDans', 'poserPleineLargeurDans', 'nomJourHTML_', 'ligneSection', 'ligneGroupePersonnesCompact', 'ligneGroupePersonnes'];

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // 1. Fonctions encore définies dans construireGrille.
  const lignes = fs.readFileSync(path.join(__dirname, '..', 'js', 'grille-rendu.js'), 'utf8').split('\n');
  const debut = lignes.findIndex((l) => l === '  function construireGrille() {');
  const fin = lignes.findIndex((l, i) => i > debut && l === '  }');
  const imbriquees = lignes.slice(debut + 1, fin).map((l) => (/\bfunction\s+(\w+)\s*\(/.exec(l) || [])[1]).filter(Boolean);
  verifier(debut > 0 && fin > debut, 'construireGrille trouvée (' + (fin - debut) + ' lignes)');
  const enTrop = imbriquees.filter((f) => AUTORISEES.indexOf(f) < 0);
  verifier(enTrop.length === 0, 'construireGrille ne définit que la construction commune' + (enTrop.length ? ' — en trop : ' + enTrop.join(', ') : ''));

  const browser = await lancerNavigateur(chromium);

  // 2. et 3. Téléphone, vue « 1 jour ».
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 360, height: 760 }, hasTouch: true });
    const r = await page.evaluate(() => {
      var G1 = grilleCourante_, sc1 = document.querySelector('#racine .scroller');
      var avant = { meme: !!G1 && G1.scroller === sc1, jour: G1 && G1.enModeJourMobile, mesures: !!(G1 && G1.mesuresMob_) };
      render(false);
      var G2 = grilleCourante_, sc2 = document.querySelector('#racine .scroller');
      var apres = { nouveau: G2 !== G1 && G2.scroller === sc2, ancienDeconnecte: !G1.scroller.isConnected };
      var hauteurs = majHauteursLignes();
      // Jour suivant : case coin suivie par suivreDefilementJourMobile.
      var ths = [].slice.call(G2.grilleEntete.querySelectorAll('.th[data-gi]:not(.th-weekend)'));
      var i = ths.findIndex(function (th) { return isoDeGi(+th.dataset.gi) === G2.isoCoinJour_; });
      var th = ths[i + 1], x = decalerSurColonne_(G2, th), iso = isoDeGi(+th.dataset.gi);
      suivreDefilementJourMobile(document.createElement('div'), x);
      var ignore = G2.isoCoinJour_ !== iso;
      sc2.scrollLeft = x;
      suivreDefilementJourMobile(sc2, x);
      // Ancien G : plus rien (grille remplacée).
      var coinAvant = G1.coin.innerHTML;
      majCoinJourMobile_(G1, 0); planifierDecoupeJourMobile_(G1);
      return { avant: avant, apres: apres, hauteurs: hauteurs, ignore: ignore, coin: G2.isoCoinJour_ === iso, iso: iso, ancienIntact: G1.coin.innerHTML === coinAvant };
    });
    await page.waitForTimeout(100);
    verifier(r.avant.meme && r.avant.jour && r.avant.mesures, 'téléphone : grilleCourante_ = la grille à l\'écran, vue « 1 jour », hauteurs mesurées');
    verifier(r.apres.nouveau && r.apres.ancienDeconnecte, 'nouveau rendu : grilleCourante_ suit la nouvelle grille');
    verifier(r.hauteurs === true, 'majHauteursLignes() remesure la grille courante');
    verifier(r.ignore, 'suivreDefilementJourMobile ignore un autre .scroller');
    verifier(r.coin, 'suivreDefilementJourMobile fait suivre la case coin (' + r.iso + ')');
    verifier(r.ancienIntact, 'un ancien G ne touche plus à rien');
    erreurs.push(...e);
    await page.close();
  }

  // 4. Ordinateur.
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, {});
    const r = await page.evaluate(() => ({
      jour: grilleCourante_.enModeJourMobile, meme: grilleCourante_.scroller === document.querySelector('#racine .scroller'),
      hauteurs: majHauteursLignes(), mesures: !!grilleCourante_.mesuresMob_
    }));
    verifier(r.meme && r.jour === false, 'ordinateur : grilleCourante_ hors vue « 1 jour »');
    verifier(r.hauteurs === true && r.mesures, 'ordinateur : hauteurs remesurées');
    erreurs.push(...e);
    await page.close();
  }

  // 5. Répartition des fonctions entre les fichiers.
  const rendu = definies(lire('grille-rendu.js'));
  Object.keys(REPARTITION).forEach((f) => {
    const ici = definies(lire(f));
    const manquent = REPARTITION[f].filter((n) => ici.indexOf(n) < 0), restees = REPARTITION[f].filter((n) => rendu.indexOf(n) >= 0);
    verifier(!manquent.length && !restees.length, f + ' : ' + REPARTITION[f].length + ' fonctions, plus dans grille-rendu.js' +
      (manquent.length ? ' — manquent : ' + manquent.join(', ') : '') + (restees.length ? ' — restées : ' + restees.join(', ') : ''));
  });
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  verifier(Object.keys(REPARTITION).every((f) => html.indexOf('<script src="js/' + f + '"></script>') > html.indexOf('<script src="js/grille-rendu.js"></script>')),
    'index.html charge les nouveaux fichiers après grille-rendu.js');

  // 6. Service worker : fichier jamais copié, chargé par un index.html revalidé.
  {
    const srv = await serveur();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const context = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, serviceWorkers: 'allow' });
    await context.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await context.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_SUPABASE }));
    await context.route(/supabase\.co/, (r) => r.abort());
    await context.addInitScript(() => {
      window.__BD_INITIALE = { personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }], taches: [] };
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(base + 'index.html');
    await page.waitForSelector('#legendeBarre', { timeout: 20000 });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const copie = (u) => page.evaluate((u) => caches.keys().then((k) => caches.open(k[0])).then((c) => c.match(u)).then((r) => !!r), u);
    const avant = { hauteurs: await copie('js/grille-hauteurs.js'), nouveau: await copie('js/consultation.js') };
    verifier(avant.hauteurs && !avant.nouveau, 'installation : js/grille-hauteurs.js copié ; js/consultation.js (pas dans index.html) non');
    // Nouvelle version publiée : index.html charge un fichier de plus.
    remplacements['/index.html'] = html.replace('<script src="js/grille-hauteurs.js"></script>', '<script src="js/grille-hauteurs.js"></script>\n<script src="js/consultation.js"></script>');
    await page.evaluate(() => fetch('index.html').then((r) => r.text()));
    const t0 = Date.now();
    while (Date.now() - t0 < 15000 && !(await copie('js/consultation.js'))) await page.waitForTimeout(250);
    verifier(await copie('js/consultation.js'), 'index.html revalidé : le fichier qu\'il charge en plus est copié d\'avance');
    await context.close();
    srv.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
