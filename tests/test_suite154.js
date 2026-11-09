const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 09.11.2026 (suite 154) — plusieurs plannings, étape 2. Choix de
// Lionel : lignes « Chacun choisit » ; « Pour les chantiers chacun choisi
// sa couleur », « La même au départ » ; absences « Oui, partout ». Puis :
// « Fait toutes les étapes sans me redemander ».
// Vérifie :
//   A. sql/0045 : lignes_planning et couleurs_chantiers (par planning,
//      remplies par déclencheur quand l'appli écrit personnes.ordre /
//      masque et chantiers.couleur), vues personnes_du_planning et
//      chantiers_du_planning (droits du compte), personne ajoutée masquée
//      ailleurs, absences de toute l'entreprise, lien responsable,
//      sauvegardes, rejouable. (Comportement testé sur une copie locale
//      de la base : tests/sql/test_0045_lignes_couleurs_absences.sql.)
//   B. Appli : personnes et chantiers lus par les vues ; écritures
//      inchangées (personnes, chantiers).
//
// Lancer : node test_suite154.js

const RACINE = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RACINE, 'sql/0045_reglages_par_planning.sql'), 'utf8');

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. sql/0045 ------------------------------------------------------------------------
  verifier(/create table if not exists lignes_planning \(\s+planning_id uuid not null default mon_planning\(\) references plannings \(id\) on delete cascade,\s+personne_id bigint not null references personnes \(id\) on delete cascade,\s+ordre integer,\s+masque boolean,\s+primary key \(planning_id, personne_id\)/.test(SQL) &&
    /create table if not exists couleurs_chantiers \(\s+planning_id uuid not null default mon_planning\(\) references plannings \(id\) on delete cascade,\s+chantier_id bigint not null references chantiers \(id\) on delete cascade,\s+couleur text not null,\s+primary key \(planning_id, chantier_id\)/.test(SQL),
    'sql/0045 : lignes_planning (ordre, coche) et couleurs_chantiers, par planning');
  verifier(/create trigger personnes_masque_planning before update of masque on personnes/.test(SQL) && /create trigger personnes_ordre_planning before update of ordre on personnes/.test(SQL) &&
    /create trigger chantiers_couleur_planning before update of couleur on chantiers/.test(SQL) &&
    (SQL.match(/if pl is null( or new\.couleur is null)? then return new; end if;/g) || []).length === 3 &&
    /new\.masque := old\.masque;/.test(SQL) && /new\.ordre := old\.ordre;/.test(SQL) && /new\.couleur := old\.couleur;/.test(SQL),
    'sql/0045 : ordre, coche et couleur écrits par l\'appli rangés pour le planning du compte, la personne / le chantier inchangés');
  verifier(/create trigger personnes_masquer_ailleurs after insert on personnes/.test(SQL) && /select pl\.id, new\.id, true from plannings pl\s+where pl\.entreprise_id = new\.entreprise_id and pl\.id is distinct from mon_planning\(\)/.test(SQL),
    'sql/0045 : une personne ajoutée par un planning est masquée dans les autres');
  verifier(/create or replace view personnes_du_planning with \(security_invoker = true\)/.test(SQL) && /create or replace view chantiers_du_planning with \(security_invoker = true\)/.test(SQL) &&
    /coalesce\(l\.ordre, p\.ordre\) as ordre/.test(SQL) && /coalesce\(l\.masque, p\.masque\) as masque/.test(SQL) && /coalesce\(cc\.couleur, c\.couleur\) as couleur/.test(SQL) &&
    /revoke all on personnes_du_planning from anon, authenticated;\s+grant select on personnes_du_planning to authenticated;/.test(SQL) &&
    /revoke all on chantiers_du_planning from anon, authenticated;\s+grant select on chantiers_du_planning to authenticated;/.test(SQL),
    'sql/0045 : vues avec les droits du compte (security_invoker), lecture seule, fermées sans connexion');
  verifier(/or \(est_absence and planning_id in \(select p\.id from plannings p where p\.entreprise_id = \(select mon_entreprise\(\)\)\)\)\)\s+with check/.test(SQL),
    'sql/0045 : absences visibles et modifiables par tous les plannings de l\'entreprise');
  verifier(/where \(t\.planning_id = lien\.planning_id or t\.est_absence\) and p\.entreprise_id = v_e/.test(SQL) && (SQL.match(/left join couleurs_chantiers cc on cc\.chantier_id = ch\.id and cc\.planning_id = lien\.planning_id/g) || []).length === 3 &&
    /not coalesce\(l\.masque, p\.masque, false\)/.test(SQL),
    'sql/0045 : lien responsable (lignes et couleurs de son planning, absences de tous)');
  verifier(/'equipes_compositions', 'equipes_exceptions', 'lignes_planning', 'couleurs_chantiers'\];/.test(SQL) && /if s \? ts\[i\] and ts\[i\] <> 'personnes'/.test(SQL) &&
    /delete from taches t where t\.planning_id = pl and t\.est_absence and exists/.test(SQL),
    'sql/0045 : sauvegardes avec lignes et couleurs ; restaurer ne touche qu\'aux tables sauvegardées, pas d\'absence en double');
  const creates = SQL.split('\n').filter((l) => /^create (table|index|policy|trigger)/.test(l));
  verifier(creates.every((l) => /if not exists/.test(l) || (() => {
    const m = l.match(/^create (policy|trigger) "?([a-z_]+)"? (?:on|before|after)/);
    return m && SQL.includes('drop ' + m[1] + ' if exists ' + (m[1] === 'policy' ? '"' + m[2] + '"' : m[2]));
  })()), 'sql/0045 : rejouable');

  // ---- B. Appli ---------------------------------------------------------------------------------
  {
    const src = fs.readFileSync(path.join(RACINE, 'js/donnees-sync.js'), 'utf8');
    verifier((src.match(/sbClient\.from\(VUE_PERSONNES\)\.select\(/g) || []).length === 3 && (src.match(/sbClient\.from\(VUE_CHANTIERS\)\.select\(/g) || []).length === 2 &&
      !/from\("personnes"\)\.select|from\("chantiers"\)\.select/.test(src) &&
      /from\("personnes"\)\.update\(\{ couleur/.test(src) && /from\("chantiers"\)\.update\(\{ couleur: couleur \}\)/.test(src),
      'appli : personnes (3 lectures) et chantiers (2) lus par les vues du planning ; écritures inchangées');
    const pp = fs.readFileSync(path.join(RACINE, 'js/page-personnel.js'), 'utf8') + fs.readFileSync(path.join(RACINE, 'js/grille-hauteurs.js'), 'utf8');
    verifier((pp.match(/from\("personnes"\)\.update\(\{ masque/g) || []).length === 3 && /from\("personnes"\)\.update\(\{ ordre: k \+ 1 \}\)/.test(pp),
      'appli : coche « Afficher », « Masquer la ligne » et ordre glissé écrits comme avant (la base les range pour le planning)');
  }
  const browser = await lancerNavigateur(chromium);
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, {});
    await page.waitForTimeout(800);
    const r = await page.evaluate(async () => {
      const a = await sbClient.from(VUE_PERSONNES).select('id, nom');
      const b = await sbClient.from(VUE_CHANTIERS).select('id, nom');
      return { vues: VUE_PERSONNES + ' | ' + VUE_CHANTIERS, p: (a.data || []).length === window.__BD.personnes.length, c: (b.data || []).length === window.__BD.chantiers.length,
        noms: (etat.personnesActives || []).length };
    });
    verifier(r.vues === 'personnes_du_planning | chantiers_du_planning' && r.p && r.c && r.noms > 0,
      'appli : les vues lues (le faux Supabase les sert depuis les tables), planning chargé (' + JSON.stringify(r) + ')');
    erreurs.push(...e);
    await page.context().close();
  }
  await browser.close();
  process.exit(bilan(erreurs));
})();
