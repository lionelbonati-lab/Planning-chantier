// Requêtes du service worker vues par context.route (supabase-js du CDN).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 25.09.2026 (suite 52) — proposition 13 de Lionel : « Mode hors
// ligne : consulter le planning et noter des changements sans réseau, puis
// les envoyer quand la connexion revient. »
//
// Test de bout en bout, sans le faux client des autres tests : l'appli est
// servie en http (service worker possible), avec le VRAI supabase-js
// (téléchargé une fois depuis npm, gardé dans le dossier temporaire), qui
// parle à un faux serveur Supabase (route ci-dessous : filtres PostgREST,
// remplacer_case_personne, enregistrer-plage avec la vraie planPlage).
// « Réseau coupé » = context.setOffline(true) + requêtes Supabase refusées.
//
// Lancer : node test_suite52.js

const CAPTURES = process.env.CAPTURE_DIR || null;
const RACINE = __dirname;
const SUPA = 'https://mvqvznohgtpulpgalvxl.supabase.co';

function supabaseJs() {
  const dossier = path.join(os.tmpdir(), 'planning-tests-supabase-js');
  const fichier = path.join(dossier, 'supabase.js');
  if (fs.existsSync(fichier)) return fs.readFileSync(fichier, 'utf8');
  fs.mkdirSync(dossier, { recursive: true });
  execSync('npm pack @supabase/supabase-js@2 --silent --pack-destination "' + dossier + '"', { cwd: dossier, stdio: 'pipe' });
  const tgz = fs.readdirSync(dossier).find((f) => f.endsWith('.tgz'));
  execSync('tar xzf "' + tgz + '" package/dist/umd/supabase.js', { cwd: dossier });
  fs.copyFileSync(path.join(dossier, 'package/dist/umd/supabase.js'), fichier);
  return fs.readFileSync(fichier, 'utf8');
}

// Serveur statique du dépôt (le service worker demande http/https).
function serveur() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    const p = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(RACINE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(p));
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

// ---- Faux Supabase ----
const planPlage = new Function(fs.readFileSync(path.join(RACINE, 'functions/enregistrer-plage/logic.js'), 'utf8').replace(/export\s*\{[\s\S]*$/, '') + '\nreturn planPlage;')();
const T = (id, pid, date, demi, texte, o) => Object.assign({ id, personne_id: pid, date, demi, ordre: 0, texte, statut_id: null, important: false, serie_id: null, est_absence: false, chantier_id: 1 }, o || {});
const BD = {
  personnes: [{ id: 1, nom: 'Lionel', sous_traitant: false, equipe: false, ordre: 1, actif: true }, { id: 2, nom: 'Mathis', sous_traitant: false, equipe: false, ordre: 2, actif: true }],
  chantiers: [{ id: 1, nom: '26182 - Terrain de Padel', couleur: '#f7d9a8', actif: true, ordre: 1 }, { id: 2, nom: '26150 - Villa Bine', couleur: '#bfe0c9', actif: true, ordre: 2 }],
  statuts: [{ id: 1, cle: 'areserver', nom: 'à réserver', couleur: '#f9c8c8', ordre: 1 }],
  taches: [T(1, 1, '2026-09-22', 'matin', 'Coffrage'), T(2, 2, '2026-09-25', 'matin', 'Ferraillage'), T(3, 1, '2026-09-29', 'aprem', 'Décoffrage')],
  notes: [{ id: 1, date: '2026-09-23', texte: 'Livraison grue', important: false, demi: null, serie_id: null }],
  jalons: [], assignations: [], series: [], feries: [], categories_feries: [], couleurs_perso: [], horaires: [], equipes_compositions: [], reglages: [],
  formulaires_rapides: [], formulaires_rapides_champs: [], liens_consultation: [], sauvegardes: []
};
let prochainId = 100;
let coupe = false;
const journal = [];
function filtres(u) {
  const out = [];
  u.searchParams.forEach((v, k) => {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) return;
    const m = v.match(/^(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/);
    let val = m[2];
    if (m[1] === 'in') val = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
    out.push({ col: k, op: m[1], val });
  });
  return (r) => out.every((f) => {
    const v = r[f.col];
    if (f.op === 'is') return f.val === 'null' ? v == null : String(v) === f.val;
    if (v == null) return false;
    if (f.op === 'in') return f.val.includes(String(v));
    const a = typeof v === 'number' ? v : String(v), b = typeof v === 'number' ? Number(f.val) : f.val;
    return { eq: a === b || String(a) === String(b), neq: String(a) !== String(b), gt: a > b, gte: a >= b, lt: a < b, lte: a <= b }[f.op];
  });
}
async function fauxSupabase(route) {
  const req = route.request();
  const u = new URL(req.url());
  const methode = req.method();
  if (coupe) { journal.push('COUPÉ ' + methode + ' ' + u.pathname); return route.abort('internetdisconnected'); }
  const json = (corps, statut, entetes) => route.fulfill({ status: statut || 200, contentType: 'application/json', headers: Object.assign({ 'Access-Control-Allow-Origin': '*' }, entetes || {}), body: corps === undefined ? '' : JSON.stringify(corps) });
  if (methode === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  const corps = req.postData() ? JSON.parse(req.postData()) : null;
  journal.push(methode + ' ' + u.pathname + (corps ? ' ' + JSON.stringify(corps) : ''));
  if (u.pathname.startsWith('/auth/v1/token')) return json({ access_token: 'jeton2', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.parse('2026-09-24T10:00:00') / 1000) + 3600, refresh_token: 'r2', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'lionel@test' } });
  if (u.pathname.startsWith('/auth/') || u.pathname.startsWith('/realtime/')) return json({});
  if (u.pathname === '/rest/v1/rpc/remplacer_case_personne') {
    const g = (r) => !(r.personne_id === corps.p_personne_id && r.date === corps.p_date && r.demi === corps.p_demi);
    BD.taches = BD.taches.filter(g); BD.assignations = BD.assignations.filter(g);
    corps.p_lignes.forEach((l, i) => BD.taches.push(Object.assign({ id: prochainId++, personne_id: corps.p_personne_id, date: corps.p_date, demi: corps.p_demi, ordre: i }, l)));
    return json(undefined, 204);
  }
  if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
  if (u.pathname === '/functions/v1/enregistrer-plage') {
    const t = corps.kind === 'jalon' ? 'jalons' : 'notes';
    const plan = planPlage(corps, BD[t].map((r) => Object.assign({}, r)));
    plan.ops.forEach((op) => {
      const v = Object.assign({}, op); delete v.type; delete v.table;
      if (op.type === 'delete') BD[t] = BD[t].filter((r) => r.id !== op.id);
      else if (op.type === 'update') { delete v.id; Object.assign(BD[t].find((r) => r.id === op.id), v); } else BD[t].push(Object.assign({ id: prochainId++, serie_id: null }, v));
    });
    return json({ ok: true });
  }
  const table = u.pathname.replace('/rest/v1/', '');
  const lignes = BD[table] || (BD[table] = []);
  const garde = filtres(u);
  if (methode === 'GET' || methode === 'HEAD') {
    let data = lignes.filter(garde);
    const ordre = u.searchParams.get('order');
    if (ordre) { const [c, sens] = ordre.split('.'); data = data.slice().sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (sens === 'desc' ? -1 : 1)); }
    return json(methode === 'HEAD' ? undefined : data, 200, { 'Content-Range': '0-' + Math.max(0, data.length - 1) + '/' + data.length });
  }
  if (methode === 'POST') { const nouv = [].concat(corps).map((r) => Object.assign({ id: prochainId++ }, r)); lignes.push(...nouv); return json(nouv, 201); }
  if (methode === 'PATCH') { const vis = lignes.filter(garde); vis.forEach((r) => Object.assign(r, corps)); return json(vis); }
  if (methode === 'DELETE') { BD[table] = lignes.filter((r) => !garde(r)); return json([]); }
  return json(null, 400);
}

function session(expireDans) {
  const exp = Math.floor(Date.parse('2026-09-24T10:00:00') / 1000) + expireDans;
  return JSON.stringify({ access_token: 'jeton1', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'lionel@test' } });
}

(async () => {
  const SBJS = supabaseJs();
  const srv = await serveur();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await lancerNavigateur(chromium);
  const { verifier, bilan } = verificateur();
  const erreurs = [];
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'allow' });
  await context.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await context.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (r) => r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: SBJS }));
  await context.route(/mvqvznohgtpulpgalvxl\.supabase\.co/, fauxSupabase);
  await context.addInitScript((s) => { if (!localStorage.getItem('sb-mvqvznohgtpulpgalvxl-auth-token')) localStorage.setItem('sb-mvqvznohgtpulpgalvxl-auth-token', s); }, session(36000));
  const page = await context.newPage();
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.clock.install({ time: new Date('2026-09-24T10:00:00') });
  await page.clock.resume();

  const bulles = () => page.evaluate(() => [...document.querySelectorAll('#racine .bulle')].map((b) => b.textContent.trim()).filter(Boolean).sort().join(' | '));
  const pastille = () => page.evaluate(() => { const e = document.getElementById('etatHorsLigne'); return e && !e.hidden ? e.textContent : ''; });
  const copies = () => page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('planning-hors-ligne'); r.onsuccess = () => { const q = r.result.transaction('lectures').objectStore('lectures').getAllKeys(); q.onsuccess = () => ok(q.result); }; }));
  const couper = async (oui) => { coupe = oui; await context.setOffline(oui); };
  const giDe = (iso) => page.evaluate((i) => { const th = [...document.querySelectorAll('.entete-planning-figee .th[data-gi]')].find((t) => isoDeGi(+t.dataset.gi) === i); return th ? +th.dataset.gi : null; }, iso);

  // --- 1. En ligne : planning, copies des lectures, service worker ---
  await page.goto(base + 'index.html');
  await page.waitForSelector('#legendeBarre', { timeout: 20000 });
  await page.waitForTimeout(1000);
  verifier(/Coffrage/.test(await bulles()) && /Ferraillage/.test(await bulles()), 'en ligne : planning chargé par le vrai supabase-js (' + await bulles() + ')');
  await page.waitForTimeout(7000); // préchargement des semaines suivantes (5 s)
  const cles = await copies();
  verifier(cles.some((k) => /taches\?.*2026-09-21/.test(k)) && cles.some((k) => /taches\?.*2026-10-05/.test(k)) && cles.some((k) => /personnes\?/.test(k)),
    'copies gardées : semaine affichée, semaines suivantes préchargées, personnes (' + cles.length + ' lectures)');
  const sw = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active));
  verifier(sw, 'service worker installé');
  verifier(await pastille() === '', 'en ligne : pas de pastille');

  // --- 2. Sans réseau : l'appli s'ouvre, le planning s'affiche ---
  await couper(true);
  await page.reload();
  await page.waitForSelector('#legendeBarre', { timeout: 20000 });
  await page.waitForTimeout(1500);
  verifier(/Coffrage/.test(await bulles()) && /Ferraillage/.test(await bulles()) && /Livraison grue/.test(await bulles()), 'hors ligne : appli ouverte (service worker), planning en mémoire affiché (' + await bulles() + ')');
  verifier(await pastille() === 'Hors ligne — planning en mémoire', 'pastille « Hors ligne » (' + await pastille() + ')');
  if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s52-hors-ligne.png' });
  // Semaine préchargée consultable.
  await page.click('#btnSemaineSuivante').catch(() => page.evaluate(() => { etat.indexSemaine++; assurerFenetreChargee(() => { construireVueDepuisCache(); render(false); }); }));
  await page.waitForTimeout(800);
  verifier(/Décoffrage/.test(await bulles()), 'hors ligne : semaine suivante (préchargée) consultable (' + await bulles() + ')');
  await page.evaluate(() => { etat.indexSemaine = indexSemaineAujourdhui_(); assurerFenetreChargee(() => { construireVueDepuisCache(); render(false); }); });
  await page.waitForTimeout(600);

  // --- 3. Changements hors ligne : en file, visibles tout de suite ---
  const giMer = await giDe('2026-09-23'), giVen = await giDe('2026-09-25');
  await page.evaluate((g) => {
    TACHES.push(itemPlageTache('tache', 'Bétonnage', '1', g.mer, 1, { demiDebut: 'aprem', demiFin: 'aprem', chantier: '26150 - Villa Bine' }));
    render();
  }, { mer: giMer });
  await page.waitForTimeout(1200);
  verifier(/Bétonnage/.test(await bulles()) && await pastille() === 'Hors ligne — 1 changement en attente', 'tâche ajoutée hors ligne : visible, « 1 changement en attente » (' + await pastille() + ')');
  // Case que quelqu'un d'autre change aussi pendant la coupure (conflit).
  await page.evaluate((g) => {
    const t = TACHES.find((x) => x.texte === 'Ferraillage'); t.texte = 'Ferraillage N2'; render();
  }, {});
  await page.waitForTimeout(1200);
  BD.taches.find((t) => t.texte === 'Ferraillage').texte = 'Ferraillage (bureau)';
  // Note ajoutée hors ligne.
  await page.evaluate((g) => { NOTES.push(itemPlage('note', 'Contrôle béton', g.ven, 1, {})); render(); }, { ven: giVen });
  await page.waitForTimeout(1500);
  verifier(/Contrôle béton/.test(await bulles()) && /3 changements en attente/.test(await pastille()), 'note ajoutée hors ligne : visible, 3 changements en attente (' + await pastille() + ')');
  // Changement de semaine aller-retour : toujours là.
  await page.evaluate(() => { etat.indexSemaine++; oublierCache(); assurerFenetreChargee(() => { construireVueDepuisCache(); render(false); }); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { etat.indexSemaine--; oublierCache(); assurerFenetreChargee(() => { construireVueDepuisCache(); render(false); }); });
  await page.waitForTimeout(900);
  const apresAllerRetour = await bulles();
  verifier(/Bétonnage/.test(apresAllerRetour) && /Contrôle béton/.test(apresAllerRetour) && /Ferraillage N2/.test(apresAllerRetour), 'après un aller-retour de semaine : les changements restent affichés (' + apresAllerRetour + ')');
  verifier(!BD.taches.some((t) => t.texte === 'Bétonnage') && !BD.notes.some((n) => n.texte === 'Contrôle béton'), 'rien n\'est encore arrivé au serveur');
  // Écriture hors planning : refusée avec un message clair.
  const refus = await page.evaluate(() => sbClient.from('chantiers').update({ nom: 'X' }).eq('id', 1).then((r) => r.error && r.error.message));
  verifier(/Hors ligne : ce changement demande une connexion internet/.test(refus || ''), 'écriture hors planning : refusée, message clair (' + refus + ')');

  // --- 4. Retour du réseau : envoi dans l'ordre, conflit signalé ---
  await couper(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(3000);
  const bet = BD.taches.find((t) => t.texte === 'Bétonnage');
  verifier(bet && bet.personne_id === 1 && bet.date === '2026-09-23' && bet.demi === 'aprem' && bet.chantier_id === 2, 'tâche envoyée au serveur (' + JSON.stringify(bet) + ')');
  verifier(BD.notes.some((n) => n.texte === 'Contrôle béton' && n.date === '2026-09-25'), 'note envoyée au serveur');
  verifier(BD.taches.some((t) => t.texte === 'Ferraillage (bureau)') && !BD.taches.some((t) => t.texte === 'Ferraillage N2'), 'case modifiée entre-temps au bureau : pas écrasée');
  const dialogue = await page.evaluate(() => { const p = document.querySelector('.pop-refus-hors-ligne'); return p ? p.textContent : ''; });
  verifier(/Changements non envoyés/.test(dialogue) && /Mathis, Ven\. 25 sept\. matin : Ferraillage N2 — modifiée entre-temps/.test(dialogue), 'conflit listé à Lionel (' + dialogue + ')');
  if (CAPTURES) await page.screenshot({ path: CAPTURES + '/s52-conflit.png' });
  await page.click('.pop-refus-hors-ligne .c-ok');
  const relu = await bulles();
  verifier(/Ferraillage \(bureau\)/.test(relu) && /Bétonnage/.test(relu) && await pastille() === '', 'planning relu du serveur, plus de pastille (' + relu + ')');
  const envois = await page.evaluate(() => new Promise((ok) => { const r = indexedDB.open('planning-hors-ligne'); r.onsuccess = () => { const q = r.result.transaction('envois').objectStore('envois').count(); q.onsuccess = () => ok(q.result); }; }));
  verifier(envois === 0, 'file vidée');

  // --- 5. Démarrage sans réseau avec une session expirée ---
  await page.evaluate(() => { const k = 'sb-mvqvznohgtpulpgalvxl-auth-token', s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 600; localStorage.setItem(k, JSON.stringify(s)); });
  await couper(true);
  await page.reload();
  await page.waitForTimeout(4000);
  const demarre = await page.evaluate(() => ({ grille: !!document.querySelector('#legendeBarre'), connexion: !!document.querySelector('.login-screen') }));
  verifier(demarre.grille && !demarre.connexion && /Bétonnage/.test(await bulles()), 'session expirée, sans réseau : l\'appli démarre sur le planning en mémoire (' + JSON.stringify(demarre) + ')');
  const provisoire = await page.evaluate(() => localStorage.getItem('planning-hl-jeton-provisoire'));
  verifier(provisoire === 'jeton1', 'sans réseau : jeton gardé noté « provisoire » (' + provisoire + ')');
  await couper(false);
  await page.waitForTimeout(2500);
  const apres = await page.evaluate(() => ({ jeton: JSON.parse(localStorage.getItem('sb-mvqvznohgtpulpgalvxl-auth-token')).access_token, provisoire: localStorage.getItem('planning-hl-jeton-provisoire') }));
  verifier(apres.jeton === 'jeton2' && apres.provisoire === null, 'réseau revenu : vrai renouvellement de la session (' + JSON.stringify(apres) + ')');

  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await context.close();
  await browser.close();
  srv.close();
  process.exitCode = bilan();
})();
