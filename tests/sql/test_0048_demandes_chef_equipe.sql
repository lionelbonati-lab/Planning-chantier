-- Tests de 0048 (demandes d'absence chez le planning où la personne est
-- affichée). À lancer après test_0047 (tests/sql/lancer.sh) : L = Lionel
-- (administrateur, « Lionel Test »), D = un nouveau compte membre du
-- planning « Collègue » (celui de C a été retiré par test_0046).
\set QUIET on
\pset tuples_only on
\pset format unaligned
create or replace function pg_temp.v(ok boolean, libelle text) returns text language sql as $$ select case when ok then 'OK: ' else 'ÉCHEC: ' end || libelle $$;
grant execute on function pg_temp.v(boolean, text) to authenticated;
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'd@test');
insert into membres (user_id, planning_id, role) values ('44444444-4444-4444-4444-444444444444', (select id from plannings where nom = 'Collègue'), 'membre');
insert into personnes (nom, ordre, entreprise_id)
  select n, o, (select entreprise_id from plannings where nom = 'Lionel Test')
  from (values ('Chez les deux', 30), ('Chez L', 31), ('Chez D', 32), ('Nulle part', 33), ('Parti', 34)) v(n, o);
update personnes set actif = false where nom = 'Parti';
delete from lignes_planning where personne_id in (select id from personnes where ordre between 30 and 34);
-- (masquées dans les autres plannings de l'entreprise, ex. celui créé par test_0046)
insert into lignes_planning (planning_id, personne_id, masque)
  select pl.id, p.id, pl.nom not in ('Lionel Test', 'Collègue') or (pl.nom = 'Lionel Test' and p.nom in ('Chez D', 'Nulle part'))
    or (pl.nom = 'Collègue' and p.nom in ('Chez L', 'Nulle part'))
  from plannings pl, personnes p where pl.entreprise_id = p.entreprise_id and p.ordre between 30 and 34;
delete from demandes_absence;
insert into demandes_absence (personne_id, date_debut, date_fin, motif)
  select id, '2026-12-01', '2026-12-01', nom from personnes where ordre between 30 and 34;
create temp table destinataires48 as select p.nom, pl.nom as planning from destinataires_demandes_() x join personnes p on p.id = x.personne_id join plannings pl on pl.id = x.planning_id;
select pg_temp.v((select string_agg(nom || ' → ' || planning, ', ' order by nom, planning) from destinataires48) =
  'Chez D → Collègue, Chez L → Lionel Test, Chez les deux → Collègue, Chez les deux → Lionel Test, Nulle part → Lionel Test, Parti → Lionel Test',
  'destinataires : les plannings où la personne est affichée ; affichée nulle part (ou plus active) : l''administrateur (' || (select string_agg(nom || ' → ' || planning, ', ' order by nom, planning) from destinataires48) || ')');

begin; set local role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.v((select string_agg(motif, ', ' order by motif) from demandes_absence) = 'Chez L, Chez les deux, Nulle part, Parti',
  'L : les demandes de ses ouvriers, et celles d''ouvriers affichés nulle part (' || (select string_agg(motif, ', ' order by motif) from demandes_absence) || ')');
update demandes_absence set statut = 'refusee' where motif = 'Chez D';
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select pg_temp.v((select string_agg(motif || '/' || statut, ', ' order by motif) from demandes_absence) = 'Chez D/en_attente, Chez les deux/en_attente',
  'D : les demandes de ses ouvriers seulement ; L n''a pas pu traiter celle de « Chez D » (' || (select string_agg(motif || '/' || statut, ', ' order by motif) from demandes_absence) || ')');
update demandes_absence set statut = 'acceptee', traitee_le = now() where motif = 'Chez D';
update demandes_absence set statut = 'refusee' where motif = 'Chez L';
commit;
select pg_temp.v((select string_agg(motif || '/' || statut, ', ' order by motif) from demandes_absence where motif in ('Chez D', 'Chez L')) = 'Chez D/acceptee, Chez L/en_attente',
  'D accepte la demande de son ouvrier ; pas celle d''un ouvrier de L');
-- D affiche « Chez L » à son tour : il en reçoit aussi les demandes.
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
update personnes set masque = false where nom = 'Chez L';
select pg_temp.v(exists (select 1 from demandes_absence where motif = 'Chez L'), 'D coche « Afficher » pour « Chez L » : sa demande apparaît chez lui');
commit;
begin; set local role authenticated; select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
do $$ begin
  perform plannings_de_la_personne_(1);
  raise notice 'ÉCHEC: un compte lit les plannings d''une personne';
exception when others then raise notice 'OK: plannings_de_la_personne_ et destinataires_demandes_ fermées aux comptes (%)', sqlerrm; end $$;
commit;
delete from demandes_absence where motif in ('Chez les deux', 'Chez L', 'Chez D', 'Nulle part', 'Parti');
delete from membres where user_id = '44444444-4444-4444-4444-444444444444'; delete from auth.users where id = '44444444-4444-4444-4444-444444444444';
