const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 22.10.2026 (suite 150). Lionel, sur le lien des ouvriers (fiche
// d'une tâche avec un PDF : « Indisponible », « Fichiers inaccessibles :
// vérifie ta connexion internet, puis réessaie. ») : « J'ai un message
// d'erreur. J'ai du réseau car j'ai pu charger mes tâches. »
// Cause : pieces-lien relisait la semaine par « consultation_ » + page, soit
// consultation_consultation pour le lien des ouvriers — fonction qui
// n'existe pas (erreur 500 à chaque fiche ; le lien responsable marchait).
// Vérifie :
//   A. rpcDeLaPage : consultation_planning / consultation_responsable, deux
//      fonctions qui existent bien dans sql/ (mêmes arguments p_jeton,
//      p_lundi) ; index.ts l'utilise, plus de nom formé à la main.
//   B. Fiche du lien : la connexion n'est mise en cause que si la demande
//      n'aboutit pas ; serveur en erreur ou fichier non signé → autre
//      message ; rouverte après la panne, la fiche redemande et s'ouvre.
//
// Lancer : node test_suite150.js

const RACINE = path.join(__dirname, '..');
const JETON = '0123456789abcdef0123456789abcdef';
const PDF = { chemin: 'fichiers/aaa/25152 - Domball.pdf', nom: '25152 - Domball.pdf', type: 'application/pdf', taille: 123904 };
const RESEAU = 'Fichiers inaccessibles : vérifie ta connexion internet, puis réessaie.';
const SERVEUR = 'Fichiers inaccessibles pour le moment : ferme la fiche et rouvre-la dans quelques minutes.';

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. Fonction serveur pieces-lien ----------------------------------------
  {
    const src = fs.readFileSync(path.join(RACINE, 'functions/pieces-lien/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
    const L = new Function(src + '\nreturn { validerDemande, rpcDeLaPage };')();
    const noms = ['consultation', 'responsable'].map((p) => L.rpcDeLaPage(L.validerDemande({ jeton: JETON, page: p, lundi: null, chemins: ['a'] }).page));
    verifier(JSON.stringify(noms) === '["consultation_planning","consultation_responsable"]',
      'pieces-lien : lien des ouvriers → consultation_planning, lien responsable → consultation_responsable (' + noms.join(', ') + ')');
    const sql = fs.readdirSync(path.join(RACINE, 'sql')).filter((f) => /\.sql$/.test(f)).map((f) => fs.readFileSync(path.join(RACINE, 'sql', f), 'utf8')).join('\n');
    const existe = (n) => new RegExp('create or replace function ' + n + '\\(p_jeton text, p_lundi date default null\\) returns jsonb').test(sql);
    verifier(noms.every(existe) && !existe('consultation_consultation'),
      'pieces-lien : les deux fonctions appelées existent dans sql/, avec p_jeton et p_lundi');
    const ts = fs.readFileSync(path.join(RACINE, 'functions/pieces-lien/index.ts'), 'utf8');
    verifier(/import \{ validerDemande, rpcDeLaPage, cheminsVisibles, cheminsASigner \} from "\.\/logic\.js";/.test(ts) &&
      /publique\.rpc\(rpcDeLaPage\(demande\.page\), \{/.test(ts) && !/"consultation_" \+/.test(ts) && (ts.match(/\.rpc\(/g) || []).length === 1,
      'index.ts : la semaine est relue par rpcDeLaPage, plus de nom formé avec « consultation_ » + page');
  }

  // ---- B. Fiche du lien des ouvriers : message selon la panne --------------------
  const SEMAINE = { personne: { nom: 'Mathis', sous_traitant: false, equipe: false }, lundi: '2026-10-19', aujourdhui: '2026-10-21', min: '2026-09-01', max: '2027-03-01',
    feries: [], horaires: [], taches: [
      { date: '2026-10-21', demi: 'matin', ordre: 0, texte: 'Aménagement extérieurs', important: false, absence: false, chantier: '25152 - Domball', couleur: '#bfe0c9',
        statut: null, couleur_statut: null, details: null, pieces: [PDF] }] };
  const browser = await lancerNavigateur(chromium);
  async function ouvrirLien(reponse) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
    const page = await ctx.newPage();
    const errs = [], demandes = [];
    page.on('pageerror', (x) => errs.push(String(x)));
    await page.clock.setFixedTime(new Date('2026-10-21T10:00:00'));
    await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
    await page.route(/\/rest\/v1\/rpc\/consultation_planning/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(SEMAINE) }));
    await page.route(/\/functions\/v1\/pieces-lien/, (r) => {
      const corps = JSON.parse(r.request().postData() || '{}');
      demandes.push(corps);
      const rep = reponse.etat(demandes.length, corps);
      if (rep === 'coupe') return r.abort('internetdisconnected');
      r.fulfill({ status: rep.status || 200, contentType: 'application/json', body: JSON.stringify(rep.corps) });
    });
    await page.goto('file://' + path.join(RACINE, 'consultation.html') + '?j=' + JETON);
    await page.waitForTimeout(400);
    return { ctx, page, errs, demandes };
  }
  const lireFiche = async (page) => {
    await page.click('.tache[data-fiche-tache] .texte');
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const f = document.querySelector('.dl-fiche'), e = f && f.querySelector('.dl-erreur');
      return f && { erreur: e && !e.hidden ? e.textContent : null, liens: f.querySelectorAll('a.dl-fichier').length,
        attente: [...f.querySelectorAll('span.dl-fichier.attente .dl-taille')].map((s) => s.textContent) };
    });
  };
  const fermer = async (page) => { await page.click('.dl-fermer'); await page.waitForTimeout(100); };
  const signe = (corps) => ({ corps: { ok: true, urls: Object.fromEntries(corps.chemins.map((c) => [c, 'https://signe.local/lien/' + c])) } });

  {
    const { ctx, page, errs, demandes } = await ouvrirLien({ etat: (n, corps) => n === 1 ? { status: 500, corps: { ok: false, erreur: 'Could not find the function public.consultation_consultation' } } : signe(corps) });
    let f = await lireFiche(page);
    verifier(f && f.erreur === SERVEUR && f.liens === 0 && JSON.stringify(f.attente) === '["Indisponible"]',
      'lien ouvrier, serveur en erreur (500) : « ' + (f && f.erreur) + ' » — la connexion n’est pas mise en cause');
    await fermer(page);
    f = await lireFiche(page);
    verifier(f && f.erreur === null && f.liens === 1 && demandes.length === 2,
      'lien ouvrier : rouverte, la fiche redemande l’adresse et le PDF s’ouvre (' + demandes.length + ' demandes)');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await ouvrirLien({ etat: () => 'coupe' });
    const f = await lireFiche(page);
    verifier(f && f.erreur === RESEAU && f.liens === 0, 'lien ouvrier, demande qui n’aboutit pas : « vérifie ta connexion internet »');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await ouvrirLien({ etat: () => ({ corps: { ok: true, urls: {} } }) });
    const f = await lireFiche(page);
    verifier(f && f.erreur === SERVEUR && JSON.stringify(f.attente) === '["Indisponible"]',
      'lien ouvrier, réponse sans l’adresse du fichier : message du serveur, pas de la connexion');
    errs.forEach((x) => erreurs.push(x));
    await ctx.close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
