// Requêtes du service worker vues par context.route (supabase-js du CDN).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FAUX_SUPABASE, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 120). Lionel : « Sur desktop, sans cesse une
// demande de rechargement ». Après une publication, GitHub Pages sert
// quelques minutes l'ancienne version depuis certains serveurs, la
// nouvelle depuis d'autres. sw.js ne regardait que « différent » (ETag) :
// chaque va-et-vient relançait le bandeau et rangeait l'ancienne version
// par-dessus la neuve.
// Vérifie, appli servie en http avec son service worker (ETag et
// Last-Modified comme GitHub Pages) :
//   1. un serveur en retard (ancienne version, date plus ancienne) : pas
//      de bandeau, la copie garde la version neuve ;
//   2. une version vraiment plus récente : bandeau « Nouvelle version » ;
//   3. « Recharger » : la nouvelle version, pas de bandeau ensuite.
//
// Lancer : node test_suite120_sw.js

const RACINE = path.join(__dirname, '..');
const ROTATION = fs.readFileSync(path.join(RACINE, 'js/rotation.js'), 'utf8');
const T = (n) => new Date(Date.UTC(2026, 8, 29, 8, n)).toUTCString();
let version = { nom: 'B', date: T(10) }; // version de js/rotation.js servie
function serveur() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    const p = path.join(RACINE, chemin);
    if (!(p.startsWith(RACINE) && fs.existsSync(p) && !fs.statSync(p).isDirectory())) { res.writeHead(404); res.end(); return; }
    const rot = chemin === '/js/rotation.js';
    const corps = rot ? Buffer.from(ROTATION + '\nwindow.__v = "' + version.nom + '";\n') : fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600',
      ETag: '"' + crypto.createHash('md5').update(corps).digest('hex') + '"', 'Last-Modified': rot ? version.date : T(10) });
    res.end(corps);
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const srv = await serveur();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
  await context.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await context.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_SUPABASE }));
  await context.route(/supabase\.co/, (r) => r.abort());
  await context.addInitScript(() => {
    window.__BD_INITIALE = { personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }], taches: [] };
  });
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  const ouvrir = async () => { await page.waitForSelector('#legendeBarre', { timeout: 20000 }); await page.waitForTimeout(1500); };
  // Revalidation comme au retour au premier plan (verifierNouvelleVersion).
  const verifierMaj = async () => {
    await page.evaluate(() => { derniereVerifMaj_ = 0; verifierNouvelleVersion(); });
    await page.waitForTimeout(2500);
    return page.evaluate(() => !!document.getElementById('majAppli'));
  };

  await page.goto(base + 'index.html');
  await ouvrir();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  await page.reload();
  await ouvrir();
  verifier(await page.evaluate(() => window.__v === 'B' && !document.getElementById('majAppli')), 'installée : version B, pas de bandeau');

  // --- 1. Serveur en retard ----------------------------------------------------------
  version = { nom: 'A', date: T(0) };
  const b1 = await verifierMaj();
  const b1bis = await verifierMaj();
  await page.reload();
  await ouvrir();
  const v1 = await page.evaluate(() => window.__v);
  verifier(!b1 && !b1bis && v1 === 'B', 'serveur en retard (version plus ancienne) : pas de bandeau, la copie garde B (' + b1 + ', ' + b1bis + ', ' + v1 + ')');

  // --- 2. Version plus récente -------------------------------------------------------
  version = { nom: 'C', date: T(20) };
  const b2 = await verifierMaj();
  verifier(b2, 'version plus récente publiée : bandeau « Nouvelle version »');

  // --- 3. Recharger -------------------------------------------------------------------
  await Promise.all([page.waitForNavigation({ timeout: 20000 }), page.click('#majAppli .maj-recharger')]);
  await ouvrir();
  const v3 = await page.evaluate(() => window.__v);
  const b3 = await verifierMaj();
  verifier(v3 === 'C' && !b3, '« Recharger » : version C, plus de bandeau ensuite (' + v3 + ', ' + b3 + ')');

  await context.close();
  srv.close();
  await browser.close();
  process.exit(bilan(erreurs));
})();
