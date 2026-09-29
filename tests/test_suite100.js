// Requêtes du service worker vues par context.route (supabase-js du CDN).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FAUX_SUPABASE, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 29.09.2026 (suite 100). Lionel, capture à l'appui (« Impossible
// de charger le planning — caleJourMobileSurJourOuvre_ is not defined »,
// bandeau « Nouvelle version de l'appli prête ») :
//   « Sur portable, j'ai beau appuyer sur recharger plusieurs fois, ça ne
//     fonctionne pas »
// La copie de l'appli (sw.js) mélangeait deux versions : un ancien
// index.html (sans js/grille-telephone.js) avec les scripts neufs. Une page
// ouverte par un raccourci (index.html?raccourci=notes) était rangée à part
// et, ressortie la première pour index.html, n'était plus jamais revalidée.
// Vérifie, appli servie en http avec son service worker (ETag comme
// GitHub Pages) ; la « nouvelle version » publiée déplace une fonction
// appelée au démarrage dans un nouveau fichier js/ :
//   1. après une ouverture par raccourci, nouvelle version publiée :
//      bandeau, puis « Recharger » donne la nouvelle version complète ;
//   2. copie incohérente (ancien index.html, scripts neufs) : le démarrage
//      échoue, l'appli recopie la version publiée et se recharge seule ;
//   3. version publiée elle-même cassée : une seule tentative, puis le
//      message d'erreur (pas de rechargements en boucle).
//
// Lancer : node test_suite100.js

const RACINE = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const SYNC = fs.readFileSync(path.join(RACINE, 'js/donnees-sync.js'), 'utf8');
const remplacements = {}; // chemin -> contenu servi à la place du fichier
function publierNouvelleVersion() {
  remplacements['/index.html'] = HTML.replace('<script src="js/donnees-sync.js"></script>', '<script src="js/nouveau-test.js"></script>\n<script src="js/donnees-sync.js"></script>');
  remplacements['/js/nouveau-test.js'] = 'function fonctionNouvelle_() { window.__nouvelle = true; }\n';
  remplacements['/js/donnees-sync.js'] = SYNC.replace('caleJourMobileSurJourOuvre_();', 'fonctionNouvelle_(); caleJourMobileSurJourOuvre_();');
}
function serveur() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    const p = path.join(RACINE, chemin);
    const existe = remplacements[chemin] != null || (p.startsWith(RACINE) && fs.existsSync(p) && !fs.statSync(p).isDirectory());
    if (!existe) { res.writeHead(404); res.end(); return; }
    const corps = remplacements[chemin] != null ? Buffer.from(remplacements[chemin]) : fs.readFileSync(p);
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: '"' + crypto.createHash('md5').update(corps).digest('hex') + '"' });
    res.end(corps);
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  const ouvrirContexte = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, serviceWorkers: 'allow' });
    await context.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await context.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_SUPABASE }));
    await context.route(/supabase\.co/, (r) => r.abort());
    await context.addInitScript(() => {
      window.__BD_INITIALE = { personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, ordre: 1, actif: true }], taches: [] };
    });
    const page = await context.newPage();
    return { context, page };
  };
  // Planning affiché, ou écran d'erreur (texte), ou rien au bout du délai.
  const issue = (page, ms) => page.waitForFunction(() => {
    const e = document.querySelector('.error-screen');
    if (e) return 'erreur : ' + e.textContent.trim();
    return document.getElementById('legendeBarre') ? (window.__nouvelle ? 'nouvelle' : 'ancienne') : false;
  }, null, { timeout: ms || 20000 }).then((h) => h.jsonValue()).catch(() => 'rien');
  const installer = async (page, base) => {
    await page.goto(base + 'index.html');
    await page.waitForSelector('#legendeBarre', { timeout: 20000 });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
  };

  // --- 1. Ouverture par raccourci, puis nouvelle version et « Recharger » ---
  {
    for (const k in remplacements) delete remplacements[k];
    const srv = await serveur();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const { context, page } = await ouvrirContexte();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await installer(page, base);
    await page.goto(base + 'index.html?raccourci=notes');
    await page.waitForTimeout(2500);
    await page.goto(base + 'index.html');
    await page.waitForSelector('#legendeBarre', { timeout: 20000 });
    await page.waitForTimeout(1500);

    publierNouvelleVersion();
    await page.goto(base + 'index.html');
    const i0 = await issue(page);
    await page.waitForFunction(() => !!document.getElementById('majAppli'), null, { timeout: 8000 }).catch(() => {});
    const bandeau = await page.evaluate(() => !!document.getElementById('majAppli'));
    verifier(i0 === 'ancienne' && bandeau, 'nouvelle version publiée : ouverture depuis la copie (ancienne version), bandeau « Nouvelle version » (' + i0 + ', bandeau ' + bandeau + ')');

    await Promise.all([page.waitForNavigation({ timeout: 20000 }), page.click('#majAppli .maj-recharger')]);
    const i1 = await issue(page);
    verifier(i1 === 'nouvelle', '« Recharger » : nouvelle version complète, planning affiché (' + i1 + ')');
    await page.reload();
    const i2 = await issue(page);
    verifier(i2 === 'nouvelle', 'ouverture suivante : toujours la nouvelle version (' + i2 + ')');
    await page.goto(base + 'index.html?raccourci=notes');
    await page.waitForTimeout(2500);
    const i3 = await page.evaluate(() => !!window.__nouvelle && !document.querySelector('.error-screen'));
    verifier(i3, 'ouverture par le raccourci « Mes notes » : nouvelle version aussi');
    erreurs.push(...errs.filter((e) => !/fonctionNouvelle_/.test(e)));
    await context.close();
    srv.close();
  }

  // --- 2. Copie incohérente : réparée toute seule ---
  {
    for (const k in remplacements) delete remplacements[k];
    publierNouvelleVersion();
    const srv = await serveur();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const { context, page } = await ouvrirContexte();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await installer(page, base);
    verifier(await page.evaluate(() => !!window.__nouvelle), 'installation de la nouvelle version : planning affiché');
    // Ancien index.html glissé dans la copie, sous toutes les clés possibles.
    await page.evaluate((html) => caches.keys().then((k) => caches.open(k[0])).then((c) => Promise.all(['index.html', './', 'index.html?raccourci=notes'].map((u) =>
      c.put(u, new Response(html, { headers: { 'Content-Type': 'text/html', ETag: '"ancien"' } }))))), HTML);
    let navigations = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
    await page.goto(base + 'index.html');
    const i = await issue(page, 25000);
    verifier(i === 'nouvelle', 'ancien index.html dans la copie, scripts neufs : réparé tout seul, nouvelle version affichée (' + i + ', ' + navigations + ' chargements)');
    await page.reload();
    verifier((await issue(page)) === 'nouvelle', 'ouverture suivante : nouvelle version');
    erreurs.push(...errs.filter((e) => !/fonctionNouvelle_/.test(e)));

    // --- 3. Version publiée cassée : une seule tentative ---
    remplacements['/index.html'] = HTML;
    await page.evaluate((html) => caches.keys().then((k) => caches.open(k[0])).then((c) => c.put('index.html', new Response(html, { headers: { 'Content-Type': 'text/html', ETag: '"ancien"' } }))), HTML);
    await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
    navigations = 0;
    await page.goto(base + 'index.html');
    await page.waitForTimeout(12000);
    const i4 = await issue(page, 1000);
    verifier(/^erreur : .*fonctionNouvelle_/.test(i4) && navigations <= 2, 'version publiée cassée : message d\'erreur après une seule tentative (' + i4.slice(0, 80) + ', ' + navigations + ' chargements)');
    await context.close();
    srv.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
