const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ouvrirPlanning, verificateur, lancerNavigateur } = require('./aide_tests');

// Round du 09.11.2026 (suite 153) — Lionel : « Un collègue aimerait utiliser
// mon planning pour ses propres besoins. Il doit pouvoir un compte et gérer
// son propre planning. » Étape 1 : la séparation dans la base (sql/0044),
// sans rien changer à l'écran tant qu'il n'y a qu'un planning.
// Vérifie :
//   A. sql/0044 : chaque table créée par les migrations est rangée (partagée
//      dans l'entreprise, propre au planning, ou à part) ; plus aucune policy
//      « connecte_tout » ; équipes dans leur planning ; fichiers joints par
//      planning ; sauvegardes par planning ; liens sans connexion ; rejouable.
//      (Comportement testé à part sur une copie locale de la base :
//      tests/sql/, deux comptes et une autre entreprise.)
//   B. envoyer-push (logic.js) : planEnvoisParPlanning ne prévient chaque
//      planning que de ce qui est à lui ; demandes d'absence pour tous ;
//      base d'avant 0044 : comme avant.
//   C. envoyer-push (index.ts) : planning_id lu, modifications retirées
//      planning par planning.
//   D. Appli : réglages et couleurs enregistrés sur la clé (planning_id, …),
//      une seule ligne après deux enregistrements.
//
// Lancer : node test_suite153.js

const RACINE = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RACINE, 'sql/0044_plannings.sql'), 'utf8');
const liste = (re) => (SQL.match(re) || [])[1].match(/'[a-z_]+'/g).map((x) => x.slice(1, -1));

(async () => {
  const { verifier, bilan } = verificateur();
  const erreurs = [];

  // ---- A. sql/0044 ------------------------------------------------------------------------
  {
    const entreprise = liste(/foreach t in array array\[([^\]]+)\] loop\s+execute format\('alter table %I add column if not exists entreprise_id/);
    const planning = liste(/foreach t in array array\[([^\]]+)\] loop\s+execute format\('alter table %I add column if not exists planning_id/);
    const aPart = ['profils', 'push_config', 'push_passages', 'retours', 'entreprises', 'plannings', 'membres'];
    const fichiers = fs.readdirSync(path.join(RACINE, 'sql')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    const toutes = new Set(), connecteTout = new Set(), creeesParPlanning = new Set();
    fichiers.forEach((f) => {
      const s = fs.readFileSync(path.join(RACINE, 'sql', f), 'utf8').replace(/--[^\n]*/g, '');
      for (const m of s.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi)) toutes.add(m[1].toLowerCase());
      // Suite 154 : une table créée après 0044 directement par planning.
      if (f > '0044') for (const m of s.matchAll(/create table if not exists ([a-z_]+) \(\s+planning_id uuid not null default mon_planning\(\)/g)) creeesParPlanning.add(m[1]);
      if (f < '0044') for (const m of s.matchAll(/create policy "connecte_[a-z]+" on (?:public\.)?([a-z_]+)/g)) connecteTout.add(m[1]);
    });
    const nonRangees = [...toutes].filter((t) => !entreprise.includes(t) && !planning.includes(t) && !aPart.includes(t) && !creeesParPlanning.has(t));
    verifier(entreprise.length === 13 && planning.length === 13 && nonRangees.length === 0 && toutes.size >= 33,
      'sql/0044 et suivantes : les ' + toutes.size + ' tables rangées — ' + entreprise.length + ' partagées, ' + (planning.length + creeesParPlanning.size) + ' par planning, ' + aPart.length + ' à part (non rangées : ' + nonRangees.join(',') + ')');
    const sansRemplacement = [...connecteTout].filter((t) => !entreprise.includes(t) && !planning.includes(t) && t !== 'retours');
    verifier(connecteTout.size >= 26 && sansRemplacement.length === 0 && /drop policy if exists "connecte_tout" on %I/.test(SQL) &&
      /drop policy if exists "connecte_tout" on retours;/.test(SQL) && /drop policy if exists "connecte_lire" on sauvegardes;/.test(SQL) && /drop policy if exists "connecte_supprimer" on sauvegardes;/.test(SQL),
      'sql/0044 : plus aucune policy ouverte à tout compte connecté (' + connecteTout.size + ' tables)');
    const sauvegardees = (fs.readFileSync(path.join(RACINE, 'sql/0042_categories_elements.sql'), 'utf8').match(/select array\[([^\]]*)\]/g) || []).pop().match(/'[a-z_]+'/g).map((x) => x.slice(1, -1));
    verifier(sauvegardees.length === 20 && sauvegardees.every((t) => entreprise.includes(t) || planning.includes(t)),
      'sql/0044 : chaque table sauvegardée est partagée ou par planning (' + sauvegardees.length + ')');
    verifier(/using \(entreprise_id = \(select mon_entreprise\(\)\)\) with check \(entreprise_id = \(select mon_entreprise\(\)\)\)/.test(SQL) &&
      /using \(planning_id = \(select mon_planning\(\)\)\) with check \(planning_id = \(select mon_planning\(\)\)\)/.test(SQL) &&
      /alter column entreprise_id set default mon_entreprise\(\), alter column entreprise_id set not null/.test(SQL) &&
      /alter column planning_id set default mon_planning\(\), alter column planning_id set not null/.test(SQL),
      'sql/0044 : colonne remplie d\'office, policy « entreprise » / « planning » (lecture et écriture)');
    verifier(/insert into membres \(user_id, planning_id, role\)\s+select u\.id, \(select id from plannings order by cree_le, id limit 1\), 'admin' from auth\.users u/.test(SQL) &&
      /insert into plannings \(entreprise_id, nom, fichiers_anciens\)\s+values \(e, [^\n]*'Mon planning'\), true\)/.test(SQL),
      'sql/0044 : données et comptes d\'avant dans le premier planning, administrateur ; anciens fichiers à lui');
    verifier(/if coalesce\(new\.equipe, false\) then new\.planning_id := coalesce\(new\.planning_id, mon_planning\(\)\);\s+else new\.planning_id := null; end if;/.test(SQL) &&
      /check \(\(planning_id is not null\) = coalesce\(equipe, false\)\)/.test(SQL) &&
      /using \(entreprise_id = \(select mon_entreprise\(\)\) and \(planning_id is null or planning_id = \(select mon_planning\(\)\)\)\)/.test(SQL),
      'sql/0044 : personnes partagées, équipes dans leur planning');
    verifier((SQL.match(/on storage\.objects for (select|insert|delete) to authenticated (using|with check) \(bucket_id = 'pieces' and piece_de_mon_planning\(name\)\)/g) || []).length === 3 &&
      /split_part\(coalesce\(p_nom, ''\), '\/', 1\) in \('fichiers', 'vignettes'\)/.test(SQL),
      'sql/0044 : fichiers joints lus, ajoutés, effacés dans son planning seulement');
    verifier(/if auth\.uid\(\) is not null then[\s\S]*?return sauvegarder_planning_\(mon_planning\(\), p_origine\);[\s\S]*?for pl in select id from plannings/.test(SQL) &&
      /select contenu -> 'tables' into s from sauvegardes where id = p_id and planning_id = pl;/.test(SQL) &&
      /on conflict \(id\) do update set %s where personnes\.planning_id = %L and excluded\.planning_id = %L/.test(SQL) &&
      /on conflict do nothing', p_table, cols, cols\)/.test(SQL) && /update restauration_ set planning_id = %L', p_planning\)/.test(SQL),
      'sql/0044 : sauvegarde par planning (nuit : chacun) ; restauration de son planning, listes partagées seulement complétées');
    verifier(/from feries f where f\.entreprise_id = p\.entreprise_id/.test(SQL) && /from horaires h where h\.entreprise_id = p\.entreprise_id/.test(SQL) &&
      (SQL.match(/t\.planning_id = lien\.planning_id/g) || []).length === 2 && /j\.planning_id = lien\.planning_id/.test(SQL) && /n\.planning_id = lien\.planning_id/.test(SQL) &&
      /create trigger entreprise_de_la_personne before insert on demandes_absence/.test(SQL),
      'sql/0044 : lien des ouvriers (tous les plannings, son entreprise), lien responsable (son planning), demande d\'absence (entreprise de l\'ouvrier)');
    verifier(/create unique index if not exists reglages_planning_cle on reglages \(planning_id, cle\);/.test(SQL) &&
      /create unique index if not exists couleurs_perso_planning_id on couleurs_perso \(planning_id, id\);/.test(SQL) &&
      /using \(cree_par = \(select auth\.uid\(\)\) or \(select suis_admin\(\)\)\)/.test(SQL) && /primary key \(planning_id, session_id\)/.test(SQL),
      'sql/0044 : clés (planning_id, cle / id), retours (auteur ou administrateur), modifications par planning');
    const nonRejouables = SQL.split('\n').filter((l) => /^(create table|create index|create policy|create trigger|create function|alter table \w+ add constraint)/.test(l) &&
      !/if not exists|create policy|create trigger|add constraint/.test(l));
    verifier(nonRejouables.length === 0 && (SQL.match(/^create policy "([a-z_]+)" on ([a-z_.]+)/gm) || []).every((l) => {
      const m = l.match(/^create policy "([a-z_]+)" on ([a-z_.]+)/);
      return SQL.includes('drop policy if exists "' + m[1] + '" on ' + m[2]) || (m[2] === 'personnes' && SQL.includes('execute format(\'drop policy if exists "entreprise" on %I\', t)'));
    }) && /drop trigger if exists personnes_planning on personnes;/.test(SQL) && /alter table personnes drop constraint if exists personnes_equipe_planning;/.test(SQL),
      'sql/0044 : rejouable (if not exists, drop … if exists avant chaque create)');
  }

  // ---- B. envoyer-push : un plan par planning ------------------------------------------------------
  {
    const src = fs.readFileSync(path.join(RACINE, 'functions/envoyer-push/logic.js'), 'utf8').replace(/export \{[\s\S]*?\};\s*$/, '');
    const L = new Function(src + '; return { planEnvois, planEnvoisParPlanning };')();
    const MAINTENANT = new Date('2026-09-30T12:00:00Z');
    const base = (plus) => Object.assign({
      abonnements: [], demandes: [], demandesEnAttente: [], modifs: [], personnes: [{ id: 1, nom: 'Mathis', ordre: 1 }], chantiers: [{ id: 7, nom: 'Padel' }],
      statuts: [{ id: 9, cle: 'areserver', nom: 'à réserver', ordre: 2 }], taches: [], jalons: [], notes: [], aReserver: [],
      horaires: [{ id: 1, date_debut: '2026-09-01', date_fin: '2026-12-17', matin_debut: '07:45:00', aprem_debut: '13:00:00', aprem_fin: '16:45:00' }], feries: [], creneaux: []
    }, plus);
    const resume = (plan) => plan.envois.map((e) => e.abonnement.id + ':' + e.message.tag).sort().join(' ');
    const ancienne = new Date(MAINTENANT.getTime() - 120000).toISOString();
    const d = base({
      abonnements: [{ id: 1, planning_id: 'P1', session_id: 's1' }, { id: 2, planning_id: 'P2', session_id: 's2' }],
      demandes: [{ id: 5, personne_id: 1, date_debut: '2026-10-01', date_fin: '2026-10-01', demi_debut: 'matin', demi_fin: 'aprem', motif: 'Congé', type: 'nouvelle' }],
      modifs: [{ planning_id: 'P2', session_id: 'autre', derniere: ancienne }, { planning_id: 'P3', session_id: 'x', derniere: ancienne }],
      notes: [{ planning_id: 'P1', date: '2026-10-01', demi: 'aprem', texte: 'Appeler le géomètre', chantier_id: null, important: true }],
      creneaux: [{ cle: '2026-09-30:aprem', jour: '2026-09-30', demi: 'aprem' }]
    });
    const p = L.planEnvoisParPlanning(d, MAINTENANT);
    verifier(resume(p) === '1:demandes 1:importants-aprem 2:demandes 2:modifs',
      'notifications : la demande d\'absence aux deux plannings ; la note importante de P1 à P1 seul ; la modification faite dans P2 à P2 seul (' + resume(p) + ')');
    verifier(JSON.stringify(p.modifsTraitees) === JSON.stringify([{ planning_id: 'P2', session_id: 'autre' }, { planning_id: 'P3', session_id: 'x' }]) &&
      JSON.stringify(p.demandesAnnoncees) === '[5]' && p.passages.join() === '2026-09-30:aprem',
      'notifications : modifications retirées par planning (P3, sans appareil, aussi), demande notée une fois, créneau noté (' + JSON.stringify(p.modifsTraitees) + ')');
    const sans = (x) => { const c = JSON.parse(JSON.stringify(x)); ['abonnements', 'modifs', 'notes'].forEach((k) => c[k].forEach((r) => { delete r.planning_id; })); return c; };
    const avant = L.planEnvois(sans(d), MAINTENANT), apres = L.planEnvoisParPlanning(sans(d), MAINTENANT);
    verifier(resume(avant) === resume(apres) && resume(apres) === '1:demandes 1:importants-aprem 1:modifs 2:demandes 2:importants-aprem 2:modifs' &&
      JSON.stringify(apres.modifsTraitees.map((m) => m.session_id)) === JSON.stringify(avant.modifsTraitees),
      'notifications, base d\'avant 0044 (sans planning_id) : exactement comme avant (' + resume(apres) + ')');
    const vide = L.planEnvoisParPlanning(base({ demandes: [{ id: 3 }, { id: 1 }] }), MAINTENANT);
    verifier(vide.envois.length === 0 && JSON.stringify(vide.demandesAnnoncees) === '[1,3]', 'notifications : sans appareil, rien n\'est envoyé, les demandes sont notées');
  }

  // ---- C. envoyer-push : index.ts ----------------------------------------------------------------------
  {
    const ts = fs.readFileSync(path.join(RACINE, 'functions/envoyer-push/index.ts'), 'utf8');
    verifier(/import \{ planEnvoisParPlanning, heureLocale, decalerIso \} from "\.\/logic\.js";/.test(ts) && /const plan = planEnvoisParPlanning\(\{/.test(ts) && !/planEnvois\(/.test(ts) &&
      /select\("id, endpoint, p256dh, auth, session_id, types, reglages, planning_id"\)/.test(ts) && /select\("session_id, derniere, planning_id"\)/.test(ts) &&
      (ts.match(/important, planning_id"\)/g) || []).length === 3 && /statut_id, planning_id"\)\.not\("statut_id", "is", null\)/.test(ts) &&
      /if \(planning\) q = q\.eq\("planning_id", planning\);/.test(ts),
      'envoyer-push : planning_id lu (appareils, modifications, importants, à réserver), modifications retirées planning par planning');
  }

  // ---- D. Appli : réglages et couleurs par planning ---------------------------------------------------------
  const browser = await lancerNavigateur(chromium);
  {
    const { page, erreurs: e } = await ouvrirPlanning(browser, {});
    await page.waitForTimeout(800);
    const r = await page.evaluate(async () => {
      await enregistrerOrdreSections(['intervenants', 'personnel']);
      await enregistrerOrdreSections(['personnel', 'intervenants']);
      // Comme enregistrerCouleurServeur_ (page-couleurs.js, non exposée).
      await sbClient.from('couleurs_perso').upsert({ id: 'principale', clair: '#112233' }, { onConflict: CONFLIT_COULEURS });
      await sbClient.from('couleurs_perso').upsert({ id: 'principale', sombre: '#445566' }, { onConflict: CONFLIT_COULEURS });
      return {
        reglages: window.__BD.reglages.filter((x) => x.cle === 'ordre_groupes').map((x) => JSON.stringify(x.valeur)),
        couleurs: window.__BD.couleurs_perso.filter((x) => x.id === 'principale').map((x) => x.clair + '/' + x.sombre),
        constantes: CONFLIT_REGLAGES + ' | ' + CONFLIT_COULEURS
      };
    });
    verifier(r.constantes === 'planning_id,cle | planning_id,id' && JSON.stringify(r.reglages) === JSON.stringify(['["personnel","intervenants"]']) &&
      JSON.stringify(r.couleurs) === '["#112233/#445566"]',
      'appli : ordre des sections et couleur enregistrés sur la clé (planning_id, …), une seule ligne chacun (' + JSON.stringify(r) + ')');
    const sources = ['js/groupes.js', 'js/page-couleurs.js', 'js/page-mise-en-page.js', 'js/raccourcis.js'].map((f) => fs.readFileSync(path.join(RACINE, f), 'utf8')).join('\n');
    verifier((sources.match(/onConflict: CONFLIT_REGLAGES/g) || []).length === 4 && (sources.match(/onConflict: CONFLIT_COULEURS/g) || []).length === 2 &&
      !/onConflict: "(cle|id)"/.test(sources), 'appli : les 4 réglages et les 2 couleurs passent par la clé du planning');
    erreurs.push(...e);
    await page.context().close();
  }

  await browser.close();
  process.exit(bilan(erreurs));
})();
