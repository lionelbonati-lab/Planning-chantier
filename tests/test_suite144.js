const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 07.10.2026 (suite 144). Lionel : « la vue planing me conviens
// mais j'aimerais qu'il ne vois pas les equipes et leurs nom. uniquement ce
// que le personnel fait (reprendre le texte de la tâche de l'équipe. »
// Vérifie :
//   A. sql/0039 : consultation_responsable n'envoie plus ni équipe ni
//      membres ; la tâche d'équipe est recopiée sur chaque membre de la
//      demi-journée (equipe_membre_), sauf sous une absence complète
//      (absence_partielle_) ; tâches limitées aux personnes affichées.
//   B. responsable.html : réponse de sql/0039 — chaque personne a sa
//      ligne, la tâche d'équipe dans la ligne de chaque membre (texte,
//      chantier), après ses propres tâches ; nulle part le nom d'une
//      équipe. Réponse de l'ancienne fonction (sql/0038, équipe + membres) :
//      la ligne d'équipe est ignorée, aucun sous-titre de membres.
//
// Lancer : node test_suite144.js

const JETON = '0123456789abcdef0123456789abcdef';
const LUNDI = '2026-10-05';

function plus(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const t = (personne, n, demi, texte, o) => Object.assign({ personne, date: plus(LUNDI, n), demi, ordre: 0, texte, important: false, absence: false,
  chantier: 'Villa Lac', couleur: '#cfe8c9', statut: null, couleur_statut: null }, o || {});
const base = (personnes, taches) => ({ nom: 'Responsable', lundi: LUNDI, aujourdhui: '2026-10-07', min: LUNDI, max: '2026-11-02',
  personnes, groupes: [], ordre_groupes: [], taches, jalons: [], notes: [], feries: [], horaires: [] });

// Réponse de sql/0039 : Marco et Luis dans l'équipe, Luis en congé jeudi
// (la tâche d'équipe de jeudi ne lui arrive pas).
const NOUVELLE = base([
  { id: 1, nom: 'Marco', section: 'personnel' }, { id: 3, nom: 'Luis', section: 'personnel' }, { id: 5, nom: 'Jean', section: 'personnel' }
], [
  t(1, 0, 'matin', 'Photos et bons', { chantier: null, couleur: null }), t(1, 0, 'matin', 'Coffrage dalle'), t(3, 0, 'matin', 'Coffrage dalle'),
  t(1, 3, 'matin', 'Coffrage dalle'), t(3, 3, 'matin', 'Congé - Mariage', { absence: true, chantier: null, couleur: null }),
  t(5, 0, 'matin', 'Maçonnerie')
]);
// Réponse de l'ancienne fonction (sql/0038).
const ANCIENNE = base([
  { id: 10, nom: 'Équipe Marco', equipe: true, couleur: '#e07a2e', section: 'personnel', membres: [{ id: 1, nom: 'Marco' }, { id: 3, nom: 'Luis' }] },
  { id: 1, nom: 'Marco', equipe: false, section: 'personnel' }, { id: 3, nom: 'Luis', equipe: false, section: 'personnel' },
  { id: 5, nom: 'Jean', equipe: false, section: 'personnel' }
], [t(10, 0, 'matin', 'Coffrage dalle'), t(5, 0, 'matin', 'Maçonnerie')]);

async function ouvrir(browser, reponse) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.route(/\/rest\/v1\/rpc\//, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(reponse) }));
  await page.goto('file://' + path.join(__dirname, '..', 'responsable.html') + '?j=' + JETON);
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const grille = document.querySelector('.grille');
    const noms = [...grille.querySelectorAll('.nom')];
    const ligneDe = (row) => { const r = Number(row.split(' / ')[0]); return noms.find((n) => { const m = /^(\d+) \/ span (\d+)$/.exec(n.style.gridRow); return m && r >= Number(m[1]) && r < Number(m[1]) + Number(m[2]); }); };
    return {
      lignes: [...grille.querySelectorAll('.nom, .titre-section')].map((n) => (n.classList.contains('titre-section') ? '#' : '') + n.textContent),
      sousTitres: grille.querySelectorAll('.nom small').length,
      texte: document.body.textContent,
      bulles: [...grille.querySelectorAll('.bulle')].map((b) => ({ texte: b.querySelector('.texte').textContent, ligne: (ligneDe(b.style.gridRow) || {}).textContent,
        row: Number(b.style.gridRow), col: b.style.gridColumn, details: (b.querySelector('.details') || {}).textContent || '' }))
    };
  });
  await page.close();
  return { g, erreurs };
}

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. sql/0039 ---------------------------------------------------------
  {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', '0039_responsable_sans_equipes.sql'), 'utf8');
    const corps = sql.slice(sql.indexOf('create or replace function consultation_responsable'));
    const personnes = corps.slice(corps.indexOf("'personnes'"), corps.indexOf("'groupes'"));
    verifier(/create or replace function consultation_responsable\(p_jeton text, p_lundi date default null\)/.test(corps) && /security definer set search_path = public/.test(corps) &&
      /grant execute on function consultation_responsable\(text, date\) to anon, authenticated/.test(corps),
      'sql/0039 : consultation_responsable remplacée, toujours security definer, exécutable par anon');
    verifier(!/'membres'|'equipe'/.test(corps) && /not coalesce\(p\.equipe, false\)\), '\[\]'::jsonb\)/.test(personnes),
      'sql/0039 : ni « equipe » ni « membres » dans la réponse, équipes retirées des personnes');
    verifier(/join personnes e on e\.id = t\.personne_id and e\.equipe/.test(corps) && /equipe_membre_\(e\.id, m\.id, t\.date, t\.demi\)/.test(corps) &&
      /not absence_partielle_\(a\.texte, a\.demi\)/.test(corps) && /'personne', x\.personne/.test(corps),
      'sql/0039 : tâche d’équipe recopiée sur chaque membre de la demi-journée, cachée sous une absence complète');
  }

  // ---- B. responsable.html ------------------------------------------------
  const browser = await lancerNavigateur(chromium);
  {
    const { g, erreurs: e } = await ouvrir(browser, NOUVELLE);
    const de = (texte) => g.bulles.filter((b) => b.texte === texte);
    const coffrage = de('Coffrage dalle');
    const photos = de('Photos et bons')[0], marcoLundi = coffrage.find((b) => b.ligne === 'Marco' && b.col === '2 / 3');
    verifier(g.lignes.join(' / ') === 'Jalons / Notes / #Personnel / Marco / Luis / Jean' && !/Équipe/.test(g.texte),
      'réponse sql/0039 : chaque personne a sa ligne, aucun nom d’équipe (' + g.lignes.join(' / ') + ')');
    verifier(coffrage.length === 3 && coffrage.filter((b) => b.ligne === 'Marco').length === 2 && coffrage.filter((b) => b.ligne === 'Luis').length === 1 &&
      coffrage.every((b) => b.details === 'Villa Lac') && de('Congé - Mariage')[0].ligne === 'Luis',
      'texte de la tâche d’équipe dans la ligne de chaque membre, avec son chantier ; Luis en congé jeudi n’a que son congé (' + JSON.stringify(coffrage) + ')');
    verifier(photos && marcoLundi && photos.ligne === 'Marco' && marcoLundi.row === photos.row + 1,
      'dans une case : la tâche de la personne d’abord, puis celle de l’équipe');
    erreurs.push(...e);
  }
  {
    const { g, erreurs: e } = await ouvrir(browser, ANCIENNE);
    verifier(g.lignes.join(' / ') === 'Jalons / Notes / #Personnel / Marco / Luis / Jean' && g.sousTitres === 0 && !/Équipe Marco/.test(g.texte) &&
      !g.bulles.some((b) => b.texte === 'Coffrage dalle'),
      'réponse de l’ancienne fonction : ligne d’équipe ignorée, pas de sous-titre de membres (' + g.lignes.join(' / ') + ')');
    erreurs.push(...e);
  }

  verifier(erreurs.length === 0, 'aucune erreur JS (' + erreurs.join(' | ') + ')');
  await browser.close();
  process.exitCode = bilan();
})();
