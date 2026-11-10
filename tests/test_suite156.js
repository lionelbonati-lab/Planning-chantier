const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 09.11.2026 (suite 156) — plusieurs plannings, étape 4. Choix de
// Lionel (suite 153) : lien des ouvriers « Les deux plannings réunis » ;
// « Pour les chantiers chacun choisi sa couleur ». Puis : « Fait toutes les
// étapes sans me redemander ».
// Vérifie :
//   A. sql/0047 : lien des ouvriers, couleur du chantier choisie par le
//      planning de chaque tâche ; le reste de la fonction comme la 0044.
//      (Comportement testé sur une copie locale de la base :
//      tests/sql/test_0047_lien_ouvrier_couleurs.sql.)
//   B. Améliorations et bugs : l'administrateur voit le nom de l'auteur
//      des notes d'un autre compte ; un compte membre, rien de plus.
//
// Lancer : node test_suite156.js

const RACINE = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RACINE, 'sql/0047_lien_ouvrier_couleurs.sql'), 'utf8');
const SQL44 = fs.readFileSync(path.join(RACINE, 'sql/0044_plannings.sql'), 'utf8');
const fonction = (s) => s.slice(s.indexOf('create or replace function consultation_planning('), s.indexOf('end $$;', s.indexOf('create or replace function consultation_planning(')) + 7);

const COMPTES = [
  { user_id: 'u-lionel', email: 'lionel@exemple.ch', prenom: 'Lionel', nom: 'Bonati', planning: 'Lionel BONATI', role: 'admin', moi: true },
  { user_id: 'u-marc', email: 'marc@exemple.ch', prenom: 'Marc', nom: 'Rey', planning: 'Marc Rey', role: 'membre', moi: false },
  { user_id: 'u-anna', email: 'anna@exemple.ch', prenom: '', nom: '', planning: 'Marc Rey', role: 'membre', moi: false }
];
const RETOURS = [
  { id: 1, sorte: 'bug', texte: 'Bug de Lionel', appareil: 'ordinateur', statut: 'nouveau', cree_par: 'u-lionel', cree_le: '2026-09-24T08:00:00Z' },
  { id: 2, sorte: 'bug', texte: 'Bug de Marc', appareil: 'telephone', statut: 'nouveau', cree_par: 'u-marc', cree_le: '2026-09-24T08:05:00Z' },
  { id: 3, sorte: 'amelioration', texte: 'Idée d’un compte retiré', appareil: 'tous', statut: 'lu', cree_par: 'u-parti', cree_le: '2026-09-23T08:00:00Z' },
  { id: 4, sorte: 'amelioration', texte: 'Ancienne idée', appareil: 'tous', statut: 'traite', cree_par: null, cree_le: '2026-09-01T08:00:00Z' },
  { id: 5, sorte: 'amelioration', texte: 'Idée d’Anna', appareil: 'tablette', statut: 'nouveau', cree_par: 'u-anna', cree_le: '2026-09-24T09:00:00Z' }
];

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. sql/0047 --------------------------------------------------------------------------
  {
    const f47 = fonction(SQL), f44 = fonction(SQL44);
    const attendu = f44.replace("'couleur', ch.couleur,", "'couleur', coalesce(cc.couleur, ch.couleur),")
      .replace('      left join chantiers ch on ch.id = t.chantier_id\n      left join statuts st',
        '      left join chantiers ch on ch.id = t.chantier_id\n      -- 0047 : couleur du chantier choisie par le planning de la tâche.\n' +
        '      left join couleurs_chantiers cc on cc.chantier_id = ch.id and cc.planning_id = t.planning_id\n      left join statuts st');
    verifier(f47.length > 1000 && f47 === attendu && attendu !== f44,
      'sql/0047 : consultation_planning comme la 0044, couleur du chantier choisie par le planning de la tâche (sinon celle de départ)');
    verifier(!/^create (table|index|policy|trigger)/m.test(SQL) && /notify pgrst, 'reload schema';\s*$/.test(SQL),
      'sql/0047 : rejouable (une fonction remplacée)');
  }

  // ---- B. Améliorations et bugs -------------------------------------------------------------
  const browser = await lancerNavigateur(chromium);
  const init = (d) => { window.__ADMIN = d.admin; window.__COMPTES = d.comptes; };
  const lire = (page) => page.evaluate(() => [...document.querySelectorAll('.retour')].map((r) =>
    r.querySelector('.retour-texte').textContent + ' | ' + ((r.querySelector('.retour-auteur') || {}).textContent || '-')));
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, init, initArg: { admin: true, comptes: COMPTES },
      bd: { retours: RETOURS.map((r) => Object.assign({}, r)) } });
    await page.evaluate(() => afficherPage('retours'));
    await page.waitForTimeout(400);
    const notes = await lire(page);
    verifier(JSON.stringify(notes.slice().sort()) === JSON.stringify([
      'Ancienne idée | -', 'Bug de Lionel | -', 'Bug de Marc | Marc Rey', 'Idée d’Anna | anna@exemple.ch', 'Idée d’un compte retiré | Compte retiré'
    ]), 'administrateur : nom (ou e-mail) de l\'auteur sur les notes d\'un autre compte, « Compte retiré » sinon ; rien sur les siennes (' + JSON.stringify(notes) + ')');
    const style = await page.evaluate(() => { const a = document.querySelector('.retour-auteur'); return a && getComputedStyle(a).fontWeight; });
    verifier(style === '700', 'nom de l\'auteur en pastille (' + style + ')');
    erreurs.push(...e);
    await page.close();
  }
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, { viewport: { width: 1280, height: 900 }, init, initArg: { admin: false, comptes: COMPTES },
      bd: { retours: RETOURS.filter((r) => r.cree_par === 'u-marc').map((r) => Object.assign({}, r)) } });
    await page.evaluate(() => afficherPage('retours'));
    await page.waitForTimeout(400);
    const notes = await lire(page);
    verifier(JSON.stringify(notes) === JSON.stringify(['Bug de Marc | -']), 'compte membre : ses notes, sans nom (' + JSON.stringify(notes) + ')');
    erreurs.push(...e);
    await page.close();
  }
  await browser.close();
  process.exit(bilan(erreurs));
})();
