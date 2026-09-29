// Requêtes du service worker vues par context.route (supabase-js du CDN).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FAUX_SUPABASE, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 96). Lionel :
//   « Ces derniers changement n'es sont pas actifs sur portable. »
// L'appli du téléphone, restée ouverte en arrière-plan, gardait l'ancienne
// version : ses fichiers n'étaient revalidés (sw.js) qu'à l'ouverture.
// Vérifie, appli servie en http avec son service worker (ETag comme
// GitHub Pages) :
//   1. retour au premier plan sans changement publié : les fichiers sont
//      redemandés, pas de bandeau ;
//   2. un 2e retour dans la minute : rien de redemandé ;
//   3. style.css changé sur le serveur, retour au premier plan (plus d'une
//      minute après) : bandeau « Nouvelle version » ;
//   4. « Recharger » : la page a la nouvelle version.
//
// Lancer : node test_suite96.js

const RACINE = path.join(__dirname, '..');
const remplacements = {}; // chemin -> contenu servi à la place du fichier
const appels = {};        // chemin -> nombre de requêtes reçues
function serveur() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    appels[chemin] = (appels[chemin] || 0) + 1;
    const p = path.join(RACINE, chemin);
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    const corps = remplacements[chemin] != null ? Buffer.from(remplacements[chemin]) : fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: '"' + crypto.createHash('md5').update(corps).digest('hex') + '"' });
    res.end(corps);
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

(async () => {
  const srv = await serveur();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const erreurs = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, serviceWorkers: 'allow' });
  await context.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await context.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_SUPABASE }));
  await context.route(/supabase\.co/, (r) => r.abort());
  await context.addInitScript(() => {
    window.__BD_INITIALE = { personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }], taches: [] };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.install({ time: new Date('2026-09-24T10:00:00') });
  await page.clock.resume();

  const bandeau = () => page.evaluate(() => !!document.getElementById('majAppli'));
  const premierPlan = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await page.goto(base + 'index.html');
  await page.waitForSelector('#legendeBarre', { timeout: 20000 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  verifier(!(await bandeau()), 'ouverture : appli servie, service worker en place, pas de bandeau');

  // --- 1. Retour au premier plan, rien de publié ---
  let avant = appels['/style.css'] || 0;
  await premierPlan();
  await page.waitForTimeout(1500);
  const apres1 = appels['/style.css'] || 0;
  verifier(apres1 > avant && !(await bandeau()), 'retour au premier plan : fichiers revalidés (style.css ' + avant + ' -> ' + apres1 + '), pas de bandeau');

  // --- 2. Nouveau retour dans la minute : rien ---
  await premierPlan();
  await page.waitForTimeout(800);
  verifier((appels['/style.css'] || 0) === apres1, '2e retour dans la minute : rien de redemandé');

  // --- 3. Nouvelle version publiée, retour plus d'une minute après ---
  remplacements['/style.css'] = fs.readFileSync(path.join(RACINE, 'style.css'), 'utf8') + '\n/* version publiée v2 */\n';
  await page.clock.fastForward(61000);
  await premierPlan();
  await page.waitForFunction(() => !!document.getElementById('majAppli'), null, { timeout: 5000 }).catch(() => {});
  verifier(await bandeau(), 'style.css publié à nouveau, retour au premier plan : bandeau « Nouvelle version »');

  // --- 4. « Recharger » : nouvelle version ---
  await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click('#majAppli .maj-recharger')]);
  await page.waitForSelector('#legendeBarre', { timeout: 20000 });
  const v2 = await page.evaluate(() => [...document.styleSheets].some((f) => { try { return /style\.css/.test(f.href || '') && [...f.cssRules].length > 0; } catch (e) { return false; } }) &&
    fetch('style.css').then((r) => r.text()).then((t) => t.includes('version publiée v2')));
  verifier(v2, '« Recharger » : la page a la nouvelle version de style.css');

  await browser.close();
  srv.close();
  process.exit(bilan(erreurs));
})();
