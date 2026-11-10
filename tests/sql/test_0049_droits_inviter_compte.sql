-- Tests de 0049 (droits de la fonction serveur inviter-compte). À lancer
-- après test_0048 (tests/sql/lancer.sh). Rejoue, avec la clé de service,
-- ce que fait functions/inviter-compte/index.ts, dans le même ordre :
-- planning partagé vérifié, nouveau planning, compte membre, profil, puis
-- l'effacement d'un planning après un échec.
\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.v(ok boolean, libelle text) returns text language sql as $$ select case when ok then 'OK: ' else 'ÉCHEC: ' end || libelle $$;
grant execute on function pg_temp.v(boolean, text) to service_role;
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'm@test'), ('66666666-6666-6666-6666-666666666666', 'n@test');
create temp table r49 (etape text, ok boolean);
grant all on r49 to service_role;
begin; set local role service_role;
insert into r49 select 'planning partagé lu', exists (select id from plannings where nom = 'Lionel Test' and entreprise_id = (select entreprise_id from plannings where nom = 'Lionel Test'));
insert into r49 select 'nouveau planning', creer_planning_((select entreprise_id from plannings where nom = 'Lionel Test'), 'Planning de M') is not null;
insert into membres (user_id, planning_id, role) values ('55555555-5555-5555-5555-555555555555', (select id from plannings where nom = 'Planning de M'), 'membre');
insert into r49 select 'entreprise lue', (select nom from entreprises where id = (select entreprise_id from plannings where nom = 'Lionel Test')) is not null;
insert into profils (user_id, prenom, nom, entreprise) values ('55555555-5555-5555-5555-555555555555', 'M', 'Test', 'X')
  on conflict (user_id) do update set prenom = excluded.prenom, nom = excluded.nom, entreprise = excluded.entreprise;
-- Échec simulé : planning créé pour N, puis effacé.
insert into r49 select 'planning d''un échec créé', creer_planning_((select entreprise_id from plannings where nom = 'Lionel Test'), 'Planning de N') is not null;
delete from plannings where nom = 'Planning de N';
commit;
select pg_temp.v((select bool_and(ok) and count(*) = 4 from r49) and exists (select 1 from membres m join plannings pl on pl.id = m.planning_id
    where m.user_id = '55555555-5555-5555-5555-555555555555' and pl.nom = 'Planning de M' and m.role = 'membre')
  and (select prenom || ' ' || nom from profils where user_id = '55555555-5555-5555-5555-555555555555') = 'M Test'
  and not exists (select 1 from plannings where nom = 'Planning de N'),
  'clé de service : planning partagé lu, nouveau planning, compte membre, profil, planning effacé après un échec (' || (select string_agg(etape || '=' || ok, ', ') from r49) || ')');
begin; set local role service_role;
do $$ begin
  update membres set role = 'admin' where user_id = '55555555-5555-5555-5555-555555555555';
  raise notice 'ÉCHEC: la clé de service change un rôle';
exception when others then raise notice 'OK: la clé de service ne fait que ce dont la fonction a besoin (pas de changement de rôle : %)', sqlerrm; end $$;
commit;
-- Nettoyage de la 0049 (rejouée ici) : un planning sans compte et vide part ;
-- sans compte mais avec des tâches (« Collègue », compte retiré par
-- test_0046) ou avec un compte (« Planning de M »), il reste.
select creer_planning_((select entreprise_id from plannings where nom = 'Lionel Test'), 'Essai raté') is not null;
\ir ../../sql/0049_droits_inviter_compte.sql
select pg_temp.v(not exists (select 1 from plannings where nom = 'Essai raté') and exists (select 1 from plannings where nom = 'Collègue')
  and exists (select 1 from plannings where nom = 'Planning de M') and exists (select 1 from plannings where nom = 'Lionel Test')
  and not exists (select 1 from lignes_planning l where not exists (select 1 from plannings pl where pl.id = l.planning_id)),
  'nettoyage : le planning vide et sans compte d''un essai raté est effacé (avec ses lignes) ; les autres restent');
delete from membres where user_id = '55555555-5555-5555-5555-555555555555';
delete from auth.users where id in ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');
