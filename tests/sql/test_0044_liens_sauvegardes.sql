-- Tests de 0044 (suite) : liens sans connexion (ouvrier, responsable), demande
-- d'absence, notifications, retours, sauvegardes et restaurations (dont un
-- fichier trafiqué). À lancer après test_0044_comptes.sql (tests/sql/lancer.sh).
\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.v(ok boolean, libelle text) returns text language sql as $$ select case when ok then 'OK: ' else 'ÉCHEC: ' end || libelle $$;
grant execute on function pg_temp.v(boolean, text) to authenticated, anon;
-- Un férié et un horaire dans l'autre entreprise (ne doivent pas apparaître).
insert into feries (entreprise_id, date, libelle) values ('eeeeeeee-0000-0000-0000-000000000003', '2026-11-11', 'Férié ailleurs');
-- Lien responsable créé par C.
insert into liens_responsables (planning_id, nom, jeton) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Chef de C', 'cccccccccccccccccccccccccccccccc');

-- ---- Liens sans connexion (anon) ----
begin; set local role anon;
select pg_temp.v((select string_agg(x ->> 'texte', ',' order by x ->> 'texte') from jsonb_array_elements(consultation_planning('0123456789abcdef0123456789abcdef', '2026-11-09') -> 'taches') x)
  = 'Case de C,Coffrage,Congé,Ferraillage,Réunion,Tâche de C',
  'lien ouvrier (Mathis) : tâches des deux plannings réunies, équipe de L comprise (' ||
  (select string_agg(x ->> 'texte', ',' order by x ->> 'texte') from jsonb_array_elements(consultation_planning('0123456789abcdef0123456789abcdef', '2026-11-09') -> 'taches') x) || ')');
select pg_temp.v(jsonb_array_length(consultation_planning('0123456789abcdef0123456789abcdef', '2026-11-09') -> 'feries') = 0
  and jsonb_array_length(consultation_planning('0123456789abcdef0123456789abcdef', '2026-11-09') -> 'horaires') = 1,
  'lien ouvrier : pas le férié de l''autre entreprise, ses horaires');
select pg_temp.v((select string_agg(x ->> 'texte', ',' order by x ->> 'texte') from jsonb_array_elements(consultation_responsable('fedcba9876543210fedcba9876543210', '2026-11-09') -> 'taches') x)
  = 'Coffrage,Congé,Ferraillage,Réunion'
  and jsonb_array_length(consultation_responsable('fedcba9876543210fedcba9876543210', '2026-11-09') -> 'jalons') = 1
  and jsonb_array_length(consultation_responsable('fedcba9876543210fedcba9876543210', '2026-11-09') -> 'ordre_groupes') = 3,
  'lien responsable de L : son planning seul (pas les tâches de C), ses jalons, son ordre des sections');
select pg_temp.v((select string_agg(x ->> 'texte', ',' order by x ->> 'texte') from jsonb_array_elements(consultation_responsable('cccccccccccccccccccccccccccccccc', '2026-11-09') -> 'taches') x)
  = 'Case de C,Congé,Tâche de C'
  and jsonb_array_length(consultation_responsable('cccccccccccccccccccccccccccccccc', '2026-11-09') -> 'jalons') = 0
  and jsonb_array_length(consultation_responsable('cccccccccccccccccccccccccccccccc', '2026-11-09') -> 'personnes') = 5,
  'lien responsable de C : son planning, les absences de tous (0045), le personnel partagé');
select pg_temp.v((consultation_demander_absence('0123456789abcdef0123456789abcdef', '2026-11-25', '2026-11-25') ->> 'ok')::boolean, 'lien ouvrier : demande d''absence acceptée');
commit;
select pg_temp.v((select entreprise_id from demandes_absence order by id desc limit 1) = (select entreprise_id from personnes where nom = 'Mathis'),
  'la demande prend l''entreprise de l''ouvrier');

-- ---- Notifications ----
select pg_temp.v((select string_agg(p.nom, ',' order by p.nom) from push_modifs m join plannings p on p.id = m.planning_id) like '%Collègue%',
  'modifs : celles de C notées pour son planning (' || coalesce((select string_agg(p.nom, ',' order by p.nom) from push_modifs m join plannings p on p.id = m.planning_id), '-') || ')');
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into abonnements_push (endpoint, p256dh, auth) values ('https://push.test/c', 'k', 'a');
insert into retours (sorte, texte, appareil) values ('amelioration', 'Idée de C', 'telephone');
select pg_temp.v((select count(*) from abonnements_push) = 1 and (select user_id from abonnements_push) = '22222222-2222-2222-2222-222222222222'
  and (select planning_id from abonnements_push) = 'aaaaaaaa-0000-0000-0000-000000000002', 'C : son appareil (compte et planning) ; pas celui de L');
select pg_temp.v((select count(*) from retours) = 1, 'C : son retour seul');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v((select count(*) from retours) = 2 and (select count(*) from abonnements_push) = 1, 'L (administrateur) : les retours de tous ; ses appareils seuls');
commit;

-- ---- Sauvegardes ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select creer_sauvegarde('manuelle') is not null;
select pg_temp.v((select string_agg(x ->> 'texte', ',' order by x ->> 'texte') from sauvegardes s, jsonb_array_elements(s.contenu -> 'tables' -> 'taches') x
    where s.id = (select max(id) from sauvegardes)) = 'Coffrage,Congé,Ferraillage,Réunion'
  and (select jsonb_array_length(contenu -> 'tables' -> 'personnes') from sauvegardes where id = (select max(id) from sauvegardes)) = 6,
  'L : sa sauvegarde = ses tâches (pas celles de C), le personnel partagé et son équipe (pas celle de C)');
commit;
select set_config('request.jwt.claim.sub', '', false);
select creer_sauvegarde('auto') is not null;
select pg_temp.v((select count(distinct planning_id) from sauvegardes where origine = 'auto') = 3, 'sauvegarde de nuit : une par planning (3)');

-- Restauration par L : il supprime sa tâche « Coffrage », le chantier Villa Bine et
-- son équipe ; C a ajouté un chantier entre-temps.
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
delete from taches where texte = 'Coffrage';
update taches set chantier_id = null where chantier_id = (select id from chantiers where nom like '26150%');
update jalons set chantier_id = null;
delete from chantiers where nom like '26150%';
delete from personnes where nom = 'La dream team';
insert into taches (personne_id, date, demi, texte) values ((select id from personnes where nom = 'Paul'), '2026-11-12', 'matin', 'Après la sauvegarde');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into chantiers (nom, couleur) values ('Chantier de C', '#000');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select restaurer_sauvegarde((select max(id) from sauvegardes where origine = 'manuelle')) is not null;
select pg_temp.v((select string_agg(texte, ',' order by texte) from taches) = 'Coffrage,Congé,Ferraillage,Réunion',
  'L restaure : ses tâches d''avant (« Coffrage » revenu, « Après la sauvegarde » parti)');
select pg_temp.v((select ch.nom from taches t join chantiers ch on ch.id = t.chantier_id where t.texte = 'Coffrage') like '26150%'
  and exists (select 1 from personnes where nom = 'La dream team' and equipe) and (select count(*) from equipes_compositions) = 1
  and (select count(*) from taches where texte = 'Ferraillage') = 1,
  'L restaure : le chantier supprimé revient (ses tâches le retrouvent), son équipe et sa composition aussi');
select pg_temp.v(exists (select 1 from chantiers where nom = 'Chantier de C'), 'L restaure : le chantier ajouté par C reste');
commit;
select pg_temp.v((select string_agg(texte, ',' order by texte) from taches where planning_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 'Case de C,Tâche de C'
  and exists (select 1 from personnes where nom = 'Équipe de C'),
  'la restauration de L ne touche ni aux tâches ni à l''équipe de C');
select pg_temp.v((select count(*) from sauvegardes where origine = 'avant_restauration' and planning_id = (select id from plannings where nom = 'Lionel Test')) = 1,
  'sauvegarde « avant restauration » dans le planning de L');

-- Sauvegarde d'avant 0044 (version 1, sans planning_id) restaurée par L.
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select restaurer_sauvegarde((select min(id) from sauvegardes)) is not null;
select pg_temp.v((select string_agg(texte, ',' order by texte) from taches) = 'Coffrage,Congé,Ferraillage,Réunion' and (select count(*) from reglages) = 1,
  'L restaure une sauvegarde d''avant 0044 : ses tâches et réglages');
commit;

-- C importe une sauvegarde trafiquée (lignes de L, planning de L) puis la restaure.
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select importer_sauvegarde(jsonb_build_object('version', 2, 'tables', jsonb_build_object(
  'personnes', jsonb_build_array(jsonb_build_object('id', (select max(id) from personnes) + 100, 'nom', 'Fantôme', 'equipe', false)),
  'taches', jsonb_build_array(
    jsonb_build_object('id', 999999, 'personne_id', (select id from personnes where nom = 'Mathis'), 'date', '2026-11-13', 'demi', 'matin', 'texte', 'Importée', 'planning_id', (select id from plannings where nom = 'Lionel Test')),
    jsonb_build_object('id', 999998, 'personne_id', 424242, 'date', '2026-11-13', 'demi', 'matin', 'texte', 'Sans personne')),
  'reglages', jsonb_build_array(jsonb_build_object('cle', 'ordre_groupes', 'valeur', '["x"]'::jsonb, 'planning_id', (select id from plannings where nom = 'Lionel Test')))))) is not null;
select restaurer_sauvegarde((select max(id) from sauvegardes where origine = 'importee')) is not null;
select pg_temp.v((select string_agg(texte, ',' order by texte) from taches where planning_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 'Importée'
  and (select string_agg(texte, ',' order by texte) from taches) = 'Congé,Importée',
  'C restaure un fichier trafiqué : la tâche va dans SON planning, celle sans personne est laissée de côté');
commit;
select pg_temp.v((select string_agg(texte, ',' order by texte) from taches where planning_id = (select id from plannings where nom = 'Lionel Test')) = 'Coffrage,Congé,Ferraillage,Réunion'
  and (select valeur from reglages where planning_id = (select id from plannings where nom = 'Lionel Test')) = '["personnel", "groupe-1", "intervenants"]'::jsonb,
  'le fichier trafiqué de C n''a touché ni aux tâches ni aux réglages de L');
select pg_temp.v(exists (select 1 from personnes where nom = 'Fantôme' and planning_id is null), 'une personne du fichier qui manquait est ajoutée au personnel partagé');
