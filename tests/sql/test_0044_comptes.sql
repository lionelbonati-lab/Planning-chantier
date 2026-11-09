-- Tests de 0044 : L = Lionel (admin, planning P1), C = collègue (planning P2,
-- même entreprise), S = inconnu (autre entreprise, planning P3).
\set QUIET on
\pset tuples_only on
\pset format unaligned
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'c@test'), ('33333333-3333-3333-3333-333333333333', 's@test');
insert into plannings (id, entreprise_id, nom) values ('aaaaaaaa-0000-0000-0000-000000000002', (select entreprise_id from plannings limit 1), 'Collègue');
insert into entreprises (id, nom) values ('eeeeeeee-0000-0000-0000-000000000003', 'Autre SA');
insert into plannings (id, entreprise_id, nom) values ('aaaaaaaa-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000003', 'Inconnu');
insert into membres (user_id, planning_id, role) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'membre'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000003', 'admin');
create or replace function pg_temp.v(ok boolean, libelle text) returns text language sql as $$ select case when ok then 'OK: ' else 'ÉCHEC: ' end || libelle $$;
grant execute on function pg_temp.v(boolean, text) to authenticated, anon;

-- ---- Lionel ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v((select count(*) from taches) = 4 and (select count(*) from jalons) = 1 and (select count(*) from notes) = 1 and (select count(*) from series) = 1,
  'L : ses 4 tâches, jalon, note, série');
select pg_temp.v((select count(*) from personnes) = 6 and (select count(*) from reglages) = 1 and (select count(*) from couleurs_perso) = 1
  and (select count(*) from liens_responsables) = 1 and (select count(*) from sauvegardes) = 1 and (select count(*) from abonnements_push) = 1 and (select count(*) from retours) = 1,
  'L : personnes (équipe comprise), réglages, couleurs, lien responsable, sauvegarde, appareil, retour');
select pg_temp.v((select count(*) from storage.objects) = 2, 'L : ses 2 anciens fichiers (chemin sans planning)');
select pg_temp.v((select string_agg(x, ',' order by x) from pieces_orphelines() x) = 'fichiers/zzz/Vieux.pdf', 'L : pieces_orphelines = le seul fichier cité nulle part');
commit;

-- ---- Collègue ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.v((select count(*) from taches) = 0 and (select count(*) from jalons) = 0 and (select count(*) from notes) = 0 and (select count(*) from series) = 0
  and (select count(*) from equipes_compositions) = 0 and (select count(*) from reglages) = 0 and (select count(*) from couleurs_perso) = 0
  and (select count(*) from liens_responsables) = 0 and (select count(*) from sauvegardes) = 0 and (select count(*) from abonnements_push) = 0 and (select count(*) from retours) = 0,
  'C : rien du planning de L (tâches, jalons, notes, séries, équipes, réglages, couleurs, lien responsable, sauvegardes, appareils, retours)');
select pg_temp.v((select string_agg(nom, ',' order by nom) from personnes) = 'Machines,Machines,Mathis,Paul,Transports',
  'C : le personnel partagé, sans l''équipe de L (' || (select string_agg(nom, ',' order by nom) from personnes) || ')');
select pg_temp.v((select count(*) from statuts) = 2 and (select count(*) from chantiers) = 2 and (select count(*) from groupes) >= 1 and (select count(*) from elements_groupes) = 1
  and (select count(*) from categories_elements) = 1 and (select count(*) from feries) = 1 and (select count(*) from horaires) = 1 and (select count(*) from formulaires_rapides) = 1
  and (select count(*) from formulaires_rapides_champs) = 1 and (select count(*) from demandes_absence) = 1 and (select count(*) from liens_consultation) = 1,
  'C : listes partagées (statuts, chantiers, groupes, machines, fériés, horaires, entrées rapides, demandes, liens ouvriers)');
select pg_temp.v((select count(*) from membres) = 1 and (select count(*) from plannings) = 2 and (select count(*) from entreprises) = 1 and not suis_admin(),
  'C : son compte seul, les 2 plannings de l''entreprise, pas administrateur');
insert into taches (personne_id, date, demi, texte) values ((select id from personnes where nom = 'Mathis'), '2026-11-10', 'aprem', 'Tâche de C');
insert into personnes (nom, ordre, equipe) values ('Équipe de C', 9, true);
select pg_temp.v((select planning_id from taches where texte = 'Tâche de C') = 'aaaaaaaa-0000-0000-0000-000000000002'
  and (select planning_id from personnes where nom = 'Équipe de C') = 'aaaaaaaa-0000-0000-0000-000000000002',
  'C : sa tâche et son équipe vont d''office dans son planning');
update personnes set ordre = 7 where nom = 'Paul';
select pg_temp.v((select ordre from personnes where nom = 'Paul') = 7, 'C : modifie une personne partagée');
update taches set important = true where true;
select pg_temp.v((select count(*) from taches where important) = 1, 'C : une mise à jour de toutes les tâches ne voit que la sienne');
update taches set important = false where true;
select remplacer_case_personne((select id from personnes where nom = 'Mathis'), '2026-11-10', 'matin', '[{"texte": "Case de C"}]');
select pg_temp.v((select count(*) from storage.objects) = 0 and (select count(*) from pieces_orphelines()) = 0, 'C : aucun fichier de L, ni à nettoyer');
insert into storage.objects (bucket_id, name) values ('pieces', 'aaaaaaaa-0000-0000-0000-000000000002/fichiers/c1/Devis.pdf');
select pg_temp.v((select count(*) from storage.objects) = 1, 'C : ajoute un fichier dans son dossier');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  insert into taches (personne_id, date, demi, texte, planning_id) values ((select id from personnes where nom = 'Mathis'), '2026-11-10', 'aprem', 'Intrus', (select id from plannings where nom = 'Lionel Test'));
  raise notice 'ÉCHEC: C : une tâche dans le planning de L est acceptée';
exception when others then raise notice 'OK: C : une tâche dans le planning de L est refusée (%)', sqlerrm; end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('pieces', 'fichiers/c2/Ancien.pdf');
  raise notice 'ÉCHEC: C : un fichier à l''ancien chemin est accepté';
exception when others then raise notice 'OK: C : un fichier à l''ancien chemin est refusé (%)', sqlerrm; end $$;
do $$ begin
  update personnes set planning_id = (select id from plannings where nom = 'Lionel Test') where nom = 'Équipe de C';
  raise notice 'ÉCHEC: C : son équipe passe dans le planning de L';
exception when others then raise notice 'OK: C : son équipe ne passe pas dans le planning de L (%)', sqlerrm; end $$;
rollback;

-- ---- Lionel après C ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v((select count(*) from taches) = 4 and exists (select 1 from taches where texte = 'Coffrage') and not exists (select 1 from taches where texte in ('Tâche de C', 'Case de C')) and not exists (select 1 from taches where important),
  'L : ses tâches intactes (la case remplacée par C n''a pas effacé son « Coffrage »), rien de C');
select pg_temp.v(not exists (select 1 from personnes where nom = 'Équipe de C') and (select count(*) from storage.objects) = 2, 'L : ni l''équipe ni le fichier de C');
select pg_temp.v((select count(*) from membres) = 2 and suis_admin(), 'L (administrateur) : voit les 2 comptes de l''entreprise');
commit;

-- ---- Inconnu (autre entreprise) ----
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select pg_temp.v((select count(*) from statuts) = 0 and (select count(*) from chantiers) = 0 and (select count(*) from personnes) = 0 and (select count(*) from demandes_absence) = 0
  and (select count(*) from plannings) = 1 and (select count(*) from membres) = 1, 'S : rien de l''entreprise de L');
commit;
