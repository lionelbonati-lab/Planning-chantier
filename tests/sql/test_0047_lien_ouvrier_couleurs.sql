-- Tests de 0047 (lien des ouvriers : couleur du chantier choisie par le
-- planning de chaque tâche). À lancer après test_0046_comptes.sql
-- (tests/sql/lancer.sh) : P1 = planning de L (« Lionel Test »), P2 =
-- planning du collègue (« Collègue », resté après le retrait de son compte).
\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.v(ok boolean, libelle text) returns text language sql as $$ select case when ok then 'OK: ' else 'ÉCHEC: ' end || libelle $$;
delete from couleurs_chantiers;
insert into couleurs_chantiers (planning_id, chantier_id, couleur) values
  ((select id from plannings where nom = 'Lionel Test'), (select id from chantiers where nom like '26150%'), '#123456'),
  ((select id from plannings where nom = 'Collègue'), (select id from chantiers where nom like '26150%'), '#ff0000');
insert into liens_consultation (personne_id, jeton) values ((select id from personnes where nom = 'Paul'), repeat('7', 32));
insert into taches (personne_id, date, demi, texte, chantier_id, planning_id) values
  ((select id from personnes where nom = 'Paul'), date_trunc('week', (now() at time zone 'Europe/Zurich')::date)::date + 1, 'matin', 'Tâche de L 0047',
    (select id from chantiers where nom like '26150%'), (select id from plannings where nom = 'Lionel Test')),
  ((select id from personnes where nom = 'Paul'), date_trunc('week', (now() at time zone 'Europe/Zurich')::date)::date + 1, 'aprem', 'Tâche de C 0047',
    (select id from chantiers where nom like '26150%'), (select id from plannings where nom = 'Collègue')),
  ((select id from personnes where nom = 'Paul'), date_trunc('week', (now() at time zone 'Europe/Zurich')::date)::date + 2, 'matin', 'Padel de C 0047',
    (select id from chantiers where nom like '26182%'), (select id from plannings where nom = 'Collègue'));
create temp table r47 as select x ->> 'texte' as texte, x ->> 'couleur' as couleur
  from jsonb_array_elements(consultation_planning(repeat('7', 32)) -> 'taches') x where x ->> 'texte' like '%0047';
grant select on r47 to anon;
select pg_temp.v((select string_agg(texte || '=' || couleur, ', ' order by texte) from r47) = 'Padel de C 0047=#c9d5f0, Tâche de C 0047=#ff0000, Tâche de L 0047=#123456',
  'lien ouvrier : les tâches des 2 plannings, chacune avec la couleur de son planning (sinon celle de départ) (' || (select string_agg(texte || '=' || couleur, ', ' order by texte) from r47) || ')');
select pg_temp.v((select couleur from chantiers where nom like '26150%') = '#bfe0c9', 'le chantier garde sa couleur de départ');
begin; set local role anon;
select pg_temp.v((consultation_planning(repeat('7', 32)) -> 'personne' ->> 'nom') = 'Paul' and consultation_planning(repeat('8', 32)) is null,
  'sans connexion : le bon jeton ouvre le lien, un autre rien');
commit;
delete from taches where texte like '%0047'; delete from liens_consultation where jeton = repeat('7', 32); delete from couleurs_chantiers;
