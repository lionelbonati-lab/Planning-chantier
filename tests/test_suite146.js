const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 21.10.2026 (suite 146). Lionel : « Ajoute moi une icône sur la
// vue ouvrier et responsables pour installer l'application. » (image : une
// flèche qui descend dans un bac).
// Vérifie :
//   A. Fichiers : manifest-consultation.json / manifest-responsable.json
//      (nom, page de départ = portée = la page, plein écran, icônes qui
//      existent à la bonne taille) ; sw-liens.js (GET seulement, même
//      origine + polices, ne vide que ses propres copies) ; métas Apple.
//   B. Lien ouvrier, Android : icône en haut à droite (nom décalé),
//      manifeste posé, jeton gardé sur l'appareil ; sans fenêtre du
//      navigateur → étapes Android en feuille du bas, OK / Échap / fond ;
//      avec la fenêtre (beforeinstallprompt) → elle s'ouvre, acceptée →
//      icône cachée, refusée → icône gardée, puis les étapes ;
//      appinstalled → icône cachée.
//   C. iPhone, iPad (se dit Mac, tactile), Safari sur Mac : pas de
//      manifeste, étapes « Partager › Sur l'écran d'accueil » / « Ajouter
//      au Dock ».
//   D. Appli installée (plein écran) : pas d'icône ; ouverte sans jeton,
//      elle reprend celui gardé (adresse ?j=…, planning chargé) ; sans
//      jeton gardé, « Lien incomplet » ; dans le navigateur, une adresse
//      sans jeton reste sans jeton.
//   E. Lien responsable : icône au bout de l'en-tête (ordinateur), à côté
//      du titre (téléphone), cachée à l'impression ; étapes ordinateur et
//      Firefox ; les flèches ne changent pas la semaine sous la fenêtre.
//   F. Servi en http : service worker sw-liens.js à la portée de chaque
//      page (pas sw.js), manifeste lu sans erreur, page installable
//      (Page.getInstallabilityErrors vide), vraie fenêtre
//      beforeinstallprompt reçue ; hors ligne, la page s'ouvre quand même
//      et dit « Planning inaccessible » ; le planning n'est pas gardé.
//
// Lancer : node test_suite146.js

const RACINE = path.join(__dirname, '..');
const JETON = '0123456789abcdef0123456789abcdef';
const JETON_R = 'fedcba9876543210fedcba9876543210fedcba98';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const UA_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';

const SEMAINE = { personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-09-01', max: '2027-03-01',
  feries: [], horaires: [], taches: [{ date: '2026-10-21', demi: 'matin', ordre: 0, texte: 'Coffrage', important: false, absence: false, chantier: '26150 - Villa Bine',
    couleur: '#bfe0c9', statut: null, couleur_statut: null }] };
const RESPONSABLE = { nom: 'Responsable', lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-10-19', max: '2026-11-16',
  personnes: [{ id: 1, nom: 'Marco', section: 'personnel' }], groupes: [], ordre_groupes: [], jalons: [], notes: [], feries: [], horaires: [],
  taches: [{ personne: 1, date: '2026-10-21', demi: 'matin', ordre: 0, texte: 'Coffrage', important: false, absence: false, chantier: 'Villa Lac', couleur: '#cfe8c9', statut: null, couleur_statut: null }] };

// Faux Supabase : bon jeton → la semaine, sinon null.
async function simulerRpc(cible, appels, etat) {
  await cible.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await cible.route(/\/rest\/v1\/rpc\/consultation_(planning|responsable)/, (r) => {
    const corps = JSON.parse(r.request().postData() || '{}');
    appels.push(corps);
    if (etat && etat.horsLigne) return r.abort();
    const resp = /responsable/.test(r.request().url());
    const bon = corps.p_jeton === (resp ? JETON_R : JETON);
    r.fulfill({ contentType: 'application/json', body: bon ? JSON.stringify(resp ? RESPONSABLE : SEMAINE) : 'null' });
  });
}
// Appli installée : (display-mode: standalone) vrai, comme dans l'icône.
function pleinEcran() {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
    ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q));
}

async function ouvrir(browser, page_, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 360, height: 760 }, userAgent: o.ua, hasTouch: !!o.tactile });
  if (o.pleinEcran) await ctx.addInitScript(pleinEcran);
  if (o.iosPleinEcran) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  if (o.toucher) await ctx.addInitScript((n) => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => n }); }, o.toucher);
  if (o.garde) await ctx.addInitScript((g) => { if (!sessionStorage.getItem('__fait')) { localStorage.setItem(g[0], g[1]); sessionStorage.setItem('__fait', '1'); } }, o.garde);
  const page = await ctx.newPage();
  const erreurs = [], appels = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00'));
  await simulerRpc(page, appels);
  await page.goto('file://' + path.join(RACINE, page_ + '.html') + (o.query != null ? o.query : '?j=' + (page_ === 'responsable' ? JETON_R : JETON)));
  await page.waitForTimeout(400);
  return { ctx, page, erreurs, appels };
}

const etat = (page) => page.evaluate(() => {
  const b = document.getElementById('btnInstaller');
  const r = b.getBoundingClientRect();
  const boite = document.querySelector('.inst-boite');
  const rb = boite && boite.getBoundingClientRect();
  return {
    visible: !b.hidden && getComputedStyle(b).display !== 'none', rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    titre: b.title, aria: b.getAttribute('aria-label'), icone: !!b.querySelector('svg path'),
    manifestes: [...document.querySelectorAll('link[rel="manifest"]')].map((l) => l.getAttribute('href')),
    garde: (() => { try { return { c: localStorage.getItem('planning.lien.consultation'), r: localStorage.getItem('planning.lien.responsable') }; } catch (e) { return {}; } })(),
    boite: boite ? { titre: boite.querySelector('.inst-titre').textContent, etapes: [...boite.querySelectorAll('.inst-etapes li')].map((li) => li.textContent),
      note: boite.querySelector('.inst-note').textContent, partager: !!boite.querySelector('.inst-etapes svg.inst-ico'), fond: !!document.querySelector('.inst-fond'),
      rect: { left: rb.left, right: rb.right, top: rb.top, bottom: rb.bottom }, focus: document.activeElement === boite.querySelector('.inst-ok'),
      role: boite.getAttribute('role') + '/' + boite.getAttribute('aria-modal') } : null,
    focusBouton: document.activeElement === b, adresse: location.search
  };
});

function serveur() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    const p = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
    if (!(p.startsWith(RACINE) && fs.existsSync(p) && !fs.statSync(p).isDirectory())) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. Fichiers -----------------------------------------------------------
  const tailleePng = (f) => { const b = fs.readFileSync(path.join(RACINE, f)); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  for (const [page_, nom, court] of [['consultation', 'Mon planning', 'Mon planning'], ['responsable', 'Planning chantier', 'Planning']]) {
    let m = null;
    try { m = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifest-' + page_ + '.json'), 'utf8')); } catch (e) { /* m reste null */ }
    verifier(m && m.name === nom && m.short_name === court && m.lang === 'fr' && m.display === 'standalone' &&
      m.id === page_ + '.html' && m.start_url === page_ + '.html' && m.scope === page_ + '.html' && m.theme_color === '#1f4d8f',
      'manifest-' + page_ + '.json : « ' + nom + ' », départ = portée = ' + page_ + '.html, plein écran');
    verifier(m && m.icons.length === 2 && m.icons.every((i) => fs.existsSync(path.join(RACINE, i.src)) && tailleePng(i.src) === i.sizes && i.type === 'image/png'),
      'manifest-' + page_ + '.json : icônes 192 et 512 présentes, à la taille annoncée');
    const html = fs.readFileSync(path.join(RACINE, page_ + '.html'), 'utf8');
    verifier(/<meta name="apple-mobile-web-app-capable" content="yes">/.test(html) && new RegExp('<meta name="apple-mobile-web-app-title" content="' + court + '">').test(html) &&
      /apple-mobile-web-app-status-bar-style" content="black-translucent"/.test(html) && !/<link rel="manifest"/.test(html),
      page_ + '.html : métas Apple (plein écran, nom « ' + court + ' »), pas de manifeste écrit en dur');
    const scripts = [...html.matchAll(/<script src="([^"]+)"( data-page="(\w+)")?/g)].map((x) => x[1] + (x[3] ? ':' + x[3] : ''));
    verifier(scripts[0] === 'js/installer.js:' + page_ && scripts[scripts.length - 1] === 'js/' + page_ + '.js',
      page_ + '.html : js/installer.js chargé en premier, avant la page (' + scripts.join(', ') + ')');
  }
  {
    const sw = fs.readFileSync(path.join(RACINE, 'sw-liens.js'), 'utf8');
    verifier(/req\.method !== "GET"\) return/.test(sw) && /fonts\\\.\(googleapis\|gstatic\)\\\.com/.test(sw) && /c\.indexOf\("planning-liens-"\) === 0 && c !== CACHE/.test(sw) &&
      /caches\.match\(req, \{ ignoreSearch: memeOrigine \}\)/.test(sw),
      'sw-liens.js : GET seulement (Supabase jamais gardé), ne vide que ses propres copies, copie hors ligne quel que soit le jeton');
  }

  const browser = await lancerNavigateur(chromium);

  // ---- B. Lien ouvrier, Android ---------------------------------------------
  {
    const { ctx, page, erreurs: e } = await ouvrir(browser, 'consultation', { ua: UA_ANDROID, tactile: true });
    let s = await etat(page);
    const h1 = await page.evaluate(() => { const h = document.querySelector('.entete h1'); return { pad: getComputedStyle(h).paddingRight, droite: h.getBoundingClientRect().right, texte: h.textContent }; });
    verifier(s.visible && s.icone && s.titre === 'Installer l’application' && s.aria === 'Installer l’application' &&
      Math.abs(s.rect.right - (360 - 12)) < 1 && s.rect.top >= 0 && s.rect.top < 15 && s.rect.bottom - s.rect.top === 40,
      'ouvrier (Android) : icône « Installer l’application » en haut à droite, 40 px (' + JSON.stringify(s.rect) + ')');
    verifier(h1.pad === '48px' && h1.texte === 'Mathis', 'ouvrier : le nom laisse la place de l’icône');
    verifier(JSON.stringify(s.manifestes) === '["manifest-consultation.json"]' && s.garde.c === JETON && s.garde.r === null,
      'ouvrier : manifeste posé, jeton gardé sur l’appareil (planning.lien.consultation)');
    await page.click('#btnInstaller');
    await page.waitForTimeout(150);
    s = await etat(page);
    verifier(s.boite && s.boite.titre === 'Installer l’application' && s.boite.etapes.length === 2 && /^Ouvre le menu du navigateur \(⋮ en haut à droite, ou ≡ en bas\)\.$/.test(s.boite.etapes[0]) &&
      s.boite.etapes[1].includes('Installer l’application') && s.boite.etapes[1].includes('Ajouter à l’écran d’accueil') &&
      s.boite.note.includes('Mon planning') && s.boite.note.includes('Déjà installée') && s.boite.role === 'dialog/true' && s.boite.focus,
      'ouvrier : sans fenêtre du navigateur, étapes Android (menu ⋮ › Installer / Ajouter à l’écran d’accueil), focus sur OK');
    verifier(s.boite.rect.bottom === 760 && s.boite.rect.left === 0 && s.boite.rect.right === 360, 'ouvrier : étapes en feuille du bas sur téléphone');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    s = await etat(page);
    verifier(!s.boite && s.focusBouton && !(await page.evaluate(() => !!document.querySelector('.inst-fond'))), 'ouvrier : Échap ferme, le focus revient à l’icône');
    await page.click('#btnInstaller');
    await page.mouse.click(180, 100);
    await page.waitForTimeout(100);
    const parFond = !(await etat(page)).boite;
    await page.click('#btnInstaller');
    await page.click('.inst-ok');
    await page.waitForTimeout(100);
    verifier(parFond && !(await etat(page)).boite, 'ouvrier : le fond et « OK » ferment aussi');

    // Fenêtre du navigateur (beforeinstallprompt), acceptée puis refusée.
    const invite = (issue) => page.evaluate((issue) => {
      window.__prompt = 0;
      const ev = new Event('beforeinstallprompt', { cancelable: true });
      ev.prompt = () => { window.__prompt++; return Promise.resolve(); };
      ev.userChoice = Promise.resolve({ outcome: issue, platform: 'web' });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    }, issue);
    const prevenu = await invite('dismissed');
    await page.click('#btnInstaller');
    await page.waitForTimeout(150);
    s = await etat(page);
    verifier(prevenu && (await page.evaluate(() => window.__prompt)) === 1 && !s.boite && s.visible,
      'ouvrier : fenêtre du navigateur gardée (bandeau retenu), ouverte par l’icône ; refusée → icône gardée');
    await page.click('#btnInstaller');
    await page.waitForTimeout(150);
    s = await etat(page);
    verifier((await page.evaluate(() => window.__prompt)) === 1 && s.boite, 'ouvrier : fenêtre déjà servie (pas rouverte) → les étapes');
    await page.click('.inst-ok');
    await invite('accepted');
    await page.click('#btnInstaller');
    await page.waitForTimeout(150);
    s = await etat(page);
    verifier((await page.evaluate(() => window.__prompt)) === 1 && !s.boite && !s.visible, 'ouvrier : installation acceptée → icône cachée');
    await page.evaluate(() => { document.getElementById('btnInstaller').hidden = false; window.dispatchEvent(new Event('appinstalled')); });
    verifier(!(await etat(page)).visible, 'ouvrier : « appinstalled » (installée par le menu) → icône cachée');
    erreurs.push(...e);
    await ctx.close();
  }

  // ---- C. Appareils Apple -----------------------------------------------------
  for (const [nom, o, attendu] of [
    ['iPhone', { ua: UA_IPHONE, tactile: true, viewport: { width: 390, height: 760 } }, 'ios'],
    ['iPad (se dit Mac)', { ua: UA_MAC_SAFARI, tactile: true, toucher: 5, viewport: { width: 820, height: 1100 } }, 'ios'],
    ['Safari sur Mac', { ua: UA_MAC_SAFARI, viewport: { width: 1280, height: 800 } }, 'mac']]) {
    const { ctx, page, erreurs: e } = await ouvrir(browser, 'consultation', o);
    await page.click('#btnInstaller');
    await page.waitForTimeout(150);
    const s = await etat(page);
    if (attendu === 'ios') {
      verifier(s.visible && s.manifestes.length === 0 && s.garde.c === JETON && s.boite && s.boite.etapes.length === 3 &&
        /^Touche le bouton Partager .*de Safari : en bas sur iPhone/.test(s.boite.etapes[0]) && s.boite.partager &&
        s.boite.etapes[1].includes('Sur l’écran d’accueil') && s.boite.etapes[2].includes('Ajouter') && !s.boite.note.includes('Déjà installée'),
        nom + ' : pas de manifeste (l’icône garde l’adresse et son jeton), étapes Partager › « Sur l’écran d’accueil » › « Ajouter »');
    } else {
      verifier(s.visible && s.manifestes.length === 0 && s.boite && s.boite.etapes.length === 2 && s.boite.etapes[0].includes('Fichier › ') &&
        s.boite.etapes[0].includes('Ajouter au Dock…'),
        nom + ' : pas de manifeste, étapes Fichier › « Ajouter au Dock… »');
      verifier(Math.abs((s.boite.rect.left + s.boite.rect.right) / 2 - 640) < 1 && Math.abs((s.boite.rect.top + s.boite.rect.bottom) / 2 - 400) < 1,
        nom + ' : fenêtre centrée sur ordinateur');
    }
    erreurs.push(...e);
    await ctx.close();
  }

  // ---- D. Appli installée -------------------------------------------------------
  {
    let r = await ouvrir(browser, 'consultation', { ua: UA_ANDROID, tactile: true, pleinEcran: true, query: '', garde: ['planning.lien.consultation', JETON] });
    let s = await etat(r.page);
    const nom = await r.page.evaluate(() => document.getElementById('nom').textContent);
    verifier(!s.visible && s.adresse === '?j=' + JETON && r.appels.length === 1 && r.appels[0].p_jeton === JETON && nom === 'Mathis' && s.manifestes.length === 1,
      'installée (Android) : pas d’icône ; ouverte sans jeton, elle reprend celui gardé (?j=…, planning de Mathis)');
    erreurs.push(...r.erreurs);
    await r.ctx.close();
    r = await ouvrir(browser, 'consultation', { ua: UA_ANDROID, tactile: true, pleinEcran: true, query: '' });
    s = await etat(r.page);
    verifier(!s.visible && s.adresse === '' && r.appels.length === 0 && /Lien incomplet/.test(await r.page.textContent('main')),
      'installée sans jeton gardé : « Lien incomplet », aucun appel');
    erreurs.push(...r.erreurs);
    await r.ctx.close();
    r = await ouvrir(browser, 'consultation', { ua: UA_ANDROID, tactile: true, query: '', garde: ['planning.lien.consultation', JETON] });
    s = await etat(r.page);
    verifier(s.visible && s.adresse === '' && r.appels.length === 0, 'dans le navigateur : une adresse sans jeton reste sans jeton (pas de jeton repris en douce)');
    erreurs.push(...r.erreurs);
    await r.ctx.close();
    r = await ouvrir(browser, 'consultation', { ua: UA_IPHONE, tactile: true, iosPleinEcran: true });
    s = await etat(r.page);
    verifier(!s.visible && r.appels.length === 1, 'installée (iPhone, navigator.standalone) : pas d’icône');
    erreurs.push(...r.erreurs);
    await r.ctx.close();
    r = await ouvrir(browser, 'responsable', { pleinEcran: true, query: '', garde: ['planning.lien.responsable', JETON_R], viewport: { width: 1400, height: 800 } });
    s = await etat(r.page);
    verifier(!s.visible && s.adresse === '?j=' + JETON_R && r.appels.length === 1 && r.appels[0].p_jeton === JETON_R,
      'installée (responsable, ordinateur) : pas d’icône, jeton gardé repris (40 caractères)');
    erreurs.push(...r.erreurs);
    await r.ctx.close();
  }

  // ---- E. Lien responsable --------------------------------------------------------
  {
    const { ctx, page, erreurs: e, appels } = await ouvrir(browser, 'responsable', { viewport: { width: 1400, height: 800 } });
    let s = await etat(page);
    const nav = await page.evaluate(() => { const r = document.querySelector('.entete .nav').getBoundingClientRect(); return { right: r.right, top: r.top, bottom: r.bottom }; });
    const dernier = await page.evaluate(() => document.querySelector('.entete-interieur').lastElementChild.id);
    verifier(s.visible && dernier === 'btnInstaller' && s.rect.left > nav.right && Math.abs((s.rect.top + s.rect.bottom) / 2 - (nav.top + nav.bottom) / 2) < 1 &&
      s.rect.bottom - s.rect.top === 38, 'responsable (ordinateur) : icône au bout de l’en-tête, après les semaines, même hauteur');
    verifier(JSON.stringify(s.manifestes) === '["manifest-responsable.json"]' && s.garde.r === JETON_R && s.garde.c === null,
      'responsable : manifeste à lui, jeton gardé (planning.lien.responsable)');
    await page.click('#btnInstaller');
    await page.waitForTimeout(150);
    s = await etat(page);
    verifier(s.boite && s.boite.etapes[0].startsWith('Clique sur l’icône d’installation à droite de la barre d’adresse') && s.boite.etapes[1].includes('Installer') &&
      s.boite.note.includes('Planning'), 'responsable : étapes ordinateur (icône de la barre d’adresse, menu « Installer »)');
    const n = appels.length;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    verifier(appels.length === n && (await etat(page)).boite, 'responsable : la flèche ne change pas la semaine sous la fenêtre');
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    verifier(!(await etat(page)).boite && appels.length === n + 1, 'responsable : Échap ferme, la flèche change de nouveau la semaine');
    await page.emulateMedia({ media: 'print' });
    verifier(await page.evaluate(() => getComputedStyle(document.getElementById('btnInstaller')).display === 'none'), 'responsable : icône absente à l’impression');
    erreurs.push(...e);
    await ctx.close();
  }
  for (const largeur of [390, 320]) {
    const { ctx, page, erreurs: e } = await ouvrir(browser, 'responsable', { ua: UA_ANDROID, tactile: true, viewport: { width: largeur, height: 700 } });
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { b: r('#btnInstaller'), t: r('.entete-titre'), n: r('.entete .nav'), large: document.documentElement.scrollWidth };
    });
    verifier(g.b.top < g.n.top && g.b.bottom <= g.n.top && g.b.left >= g.t.right && Math.abs(g.b.right - (largeur - 16)) < 1 && g.large === largeur,
      'responsable (téléphone ' + largeur + ' px) : icône à côté du titre, les semaines dessous, rien ne déborde');
    erreurs.push(...e);
    await ctx.close();
  }
  {
    const { ctx, page, erreurs: e } = await ouvrir(browser, 'responsable', { ua: UA_FIREFOX, viewport: { width: 1280, height: 800 } });
    await page.click('#btnInstaller');
    await page.waitForTimeout(150);
    const s = await etat(page);
    verifier(s.boite && s.boite.etapes[0].includes('Chrome ou Edge'), 'Firefox (ordinateur) : ouvrir le lien dans Chrome ou Edge');
    erreurs.push(...e);
    await ctx.close();
  }

  // ---- F. Servi en http : service worker, installable, hors ligne ------------------
  {
    const srv = await serveur();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const profil = fs.mkdtempSync(path.join(require('os').tmpdir(), 'planning146-'));
    // Profil réel (une fenêtre privée n'est jamais installable) ; sans le
    // délai d'usage que Chrome attend avant sa fenêtre « Installer ».
    const ctx = await chromium.launchPersistentContext(profil, { executablePath: '/opt/pw-browsers/chromium', serviceWorkers: 'allow',
      viewport: { width: 1280, height: 800 }, args: ['--bypass-app-banner-engagement-checks'] });
    const etatReseau = { horsLigne: false };
    const appels = [];
    await simulerRpc(ctx, appels, etatReseau);
    await ctx.addInitScript(() => {
      window.__bip = [];
      window.addEventListener('beforeinstallprompt', (ev) => { setTimeout(() => window.__bip.push(ev.defaultPrevented), 0); });
    });
    const page = ctx.pages()[0] || await ctx.newPage();
    const e = [];
    page.on('pageerror', (x) => e.push(String(x)));
    await page.goto(base + 'consultation.html?j=' + JETON);
    const portee = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
    await page.waitForTimeout(600);
    const cdp = await ctx.newCDPSession(page);
    const manifeste = await cdp.send('Page.getAppManifest');
    const installable = await cdp.send('Page.getInstallabilityErrors');
    verifier(portee === base + 'consultation.html' && manifeste.url === base + 'manifest-consultation.json' && manifeste.errors.length === 0,
      'http : sw-liens.js à la portée de consultation.html, manifeste lu sans erreur');
    verifier(installable.installabilityErrors.length === 0, 'http : page installable pour Chrome (' + JSON.stringify(installable.installabilityErrors) + ')');
    const bip = await page.evaluate(() => window.__bip);
    verifier(bip.length === 1 && bip[0] === true && (await etat(page)).visible, 'http : vraie fenêtre « Installer » de Chrome reçue et gardée pour l’icône');
    await page.reload();
    await page.waitForTimeout(500);
    const ctrl = await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
    verifier(ctrl === base + 'sw-liens.js', 'http : la page est tenue par sw-liens.js');
    const page2 = await ctx.newPage();
    page2.on('pageerror', (x) => e.push(String(x)));
    await page2.goto(base + 'responsable.html?j=' + JETON_R);
    await page2.evaluate(() => navigator.serviceWorker.ready);
    await page2.waitForTimeout(400);
    const regs = await page2.evaluate(() => navigator.serviceWorker.getRegistrations().then((rs) => rs.map((r) => r.scope.replace(location.origin, '') + '=' + (r.active || r.waiting || r.installing).scriptURL.replace(location.origin, '')).sort()));
    verifier(JSON.stringify(regs) === '["/consultation.html=/sw-liens.js","/responsable.html=/sw-liens.js"]', 'http : une portée par page, pas de sw.js de l’appli (' + regs.join(', ') + ')');
    const m2 = await (await ctx.newCDPSession(page2)).send('Page.getAppManifest');
    verifier(m2.url === base + 'manifest-responsable.json' && m2.errors.length === 0, 'http : manifeste responsable lu sans erreur');
    await page2.close();
    etatReseau.horsLigne = true;
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForTimeout(600);
    const texte = await page.textContent('main');
    verifier(/Planning inaccessible\./.test(texte) && /Vérifie ta connexion internet/.test(texte) && (await etat(page)).visible,
      'hors ligne : la page s’ouvre quand même (copie) et dit « Planning inaccessible »');
    const ranges = await page.evaluate(() => caches.keys().then((k) => Promise.all(k.map((n) => caches.open(n).then((c) => c.keys()).then((rs) => rs.map((x) => n + ' ' + x.url))))).then((l) => [].concat(...l)));
    verifier(ranges.length > 0 && ranges.every((u) => /^planning-liens-v1 /.test(u)) && !ranges.some((u) => /rest\/v1/.test(u)) && ranges.some((u) => /consultation\.html\?j=/.test(u)),
      'hors ligne : seules les copies de la page sont gardées, jamais le planning (' + ranges.length + ' fichiers)');
    erreurs.push(...e);
    await ctx.close();
    srv.close();
    fs.rmSync(profil, { recursive: true, force: true });
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
